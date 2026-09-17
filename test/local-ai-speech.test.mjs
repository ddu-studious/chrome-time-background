import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateAudio, WhisperProvider } from '../local-ai/speech-provider.mjs';
import { createGateway } from '../local-ai/gateway.mjs';
function wav() {
  const b = Buffer.alloc(364); b.write('RIFF'); b.writeUInt32LE(356,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(16000,24); b.writeUInt32LE(32000,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(320,40); return b;
}
test('只接受有界规范 WAV，拒绝伪造时长、编码和任意文件', () => {
  assert.equal(validateAudio(wav().toString('base64')).length,364);
  const broken = wav(); broken.writeUInt32LE(99999,40);
  assert.throws(() => validateAudio(broken.toString('base64')));
  assert.throws(() => validateAudio(Buffer.from('not audio').toString('base64')));
  assert.throws(() => validateAudio('a'.repeat(1300000)));
});
test('语音场景服从控制面开关，不向模型传递无关字段', async () => {
  let calls = 0;
  const speechProvider = { async transcribe(audio) { calls++; assert.equal(audio,wav().toString('base64')); return {text:'暂停'}; } };
  const disabled = createGateway({ provider:{}, speechProvider, disabledScenes:['speech.transcribe'] });
  await assert.rejects(disabled.run('speech.transcribe',{audio:wav().toString('base64')}),/关闭/);
  assert.equal(calls,0);
  const gateway = createGateway({provider:{},speechProvider});
  const result = await gateway.run('speech.transcribe',{audio:wav().toString('base64'),token:'secret'});
  assert.equal(result.text,'暂停'); assert.ok(!JSON.stringify(gateway.describe()).includes('secret'));
});
test('本地进程采用固定参数且成功后清理临时音频', async () => {
  let inputPath;
  const provider = new WhisperProvider({binary:process.execPath,modelPath:fileURLToPath(import.meta.url),run:async (binary,args,options) => {
    assert.equal(binary,process.execPath); assert.equal(options.timeout,90000);
    inputPath=args[args.indexOf('-f')+1]; await access(inputPath);
    await writeFile(args[args.indexOf('-of')+1]+'.txt','暂停');
  }});
  assert.equal((await provider.transcribe(wav().toString('base64'))).text,'暂停');
  await assert.rejects(access(inputPath)); assert.equal(provider.busy,false);
});
test('识别失败同样清理临时文件且不会暴露进程命令', async () => {
  let inputPath;
  const provider = new WhisperProvider({binary:process.execPath,modelPath:fileURLToPath(import.meta.url),run:async (_,args) => { inputPath=args[args.indexOf('-f')+1]; throw Object.assign(new Error('secret'),{cmd:'private path'}); }});
  await assert.rejects(provider.transcribe(wav().toString('base64')),/本地语音识别失败/);
  await assert.rejects(access(inputPath)); assert.equal(provider.busy,false);
});
