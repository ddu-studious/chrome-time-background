import { validateSpeechText } from './speech-synthesis-provider.mjs';

export function validateInput(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some((key) => key !== 'text')) {
    throw Object.assign(new Error('语音合成只接受 text 字段'), { statusCode: 400, code: 'SPEECH_INPUT_INVALID' });
  }
  return { text: validateSpeechText(body.text) };
}

export async function interpret(body, provider) {
  const input = validateInput(body);
  return { status: 'ready', source: 'speech', ...await provider.synthesize(input.text) };
}
