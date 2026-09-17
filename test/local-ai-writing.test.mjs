import test from 'node:test';import assert from 'node:assert/strict';import {createGateway} from '../local-ai/gateway.mjs';
test('写作输入不得选择供应商或输出执行指令',async()=>{
 let output={content:'建议文本'};
 const gateway=createGateway({provider:{async generateObject({input}){assert.equal(input.apiKey,undefined);return output;}}});
 const input={guidance:'润色',context:'今天读了文档',apiKey:'secret'};
 assert.equal((await gateway.run('writing.assist',input)).data.content,'建议文本');
 output={content:'建议',tool_call:'execute'};await assert.rejects(gateway.run('writing.assist',input),/格式无效/);
 await assert.rejects(gateway.run('writing.assist',{...input,context:'x'.repeat(6001)}),/超过范围/);
});
