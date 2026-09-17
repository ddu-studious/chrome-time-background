import { validateAudio } from './speech-provider.mjs';
export function validateInput(body) {
  validateAudio(body?.audio);
  return { audio: body.audio };
}
export async function interpret(body, provider) {
  const input = validateInput(body);
  const { text } = await provider.transcribe(input.audio);
  return { status: 'ready', text, source: 'speech', provider: 'whisper.cpp' };
}
