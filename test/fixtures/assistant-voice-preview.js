(function () {
  'use strict';
  const calls = [], jobs = new Map(); let number = 0;
  const text = '可以点击“说一句话”，录音中会逐步出现可修正的文字；说完停顿后自动完成。检查或修改后，再由你点击执行。\n每条助手答复旁都有朗读按钮，朗读期间可以随时停止。';
  let task = { id: 'voice-preview-task', version: 1, conversationId: 'voice-preview', turnId: 'voice-preview-turn', status: 'completed', input: { text: '语音能力怎么使用？', app: null, skill: null }, conversationTitle: '语音能力怎么使用？', message: text, messages: [{ id: 'user-message', role: 'user', content: '语音能力怎么使用？' }, { id: 'assistant-message', role: 'assistant', content: text }], choices: [], trace: [], log: [], modelCalls: [], startedAt: Date.now() - 4000, endedAt: Date.now() };
  sessionStorage.setItem('assistant-standby:voice-preview', 'false');
  sessionStorage.setItem('assistant-trace:voice-preview', 'false');
  const bytes = new Uint8Array(44 + 16000 * 2 * 2), view = new DataView(bytes.buffer);
  const write = (at, value) => [...value].forEach((letter, index) => { bytes[at + index] = letter.charCodeAt(0); });
  write(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); write(8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, bytes.length - 44, true);
  let binary = ''; for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  const audio = btoa(binary), original = chrome.runtime.sendMessage.bind(chrome.runtime);
  // HTTP-only fixture: no real microphone, model, reminders, accounts or music queue.
  const parameters = new URLSearchParams(location.search);
  const waitForMicrophone = parameters.get('voiceWait') === '1';
  const liveDemo = parameters.get('voiceLive') === '1';
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { async getUserMedia() {
    if (liveDemo) {
      const context = new AudioContext(), oscillator = context.createOscillator(), gain = context.createGain(), destination = context.createMediaStreamDestination();
      oscillator.frequency.value = 220; gain.gain.value = .15;
      oscillator.connect(gain); gain.connect(destination); oscillator.start();
      gain.gain.setValueAtTime(.15, context.currentTime);
      gain.gain.setValueAtTime(0, context.currentTime + 3.6);
      await context.resume();
      setTimeout(() => { oscillator.stop(); void context.close(); }, 8000);
      return destination.stream;
    }
    if (waitForMicrophone) return new Promise(() => {});
    throw Object.assign(new Error('隔离验收模拟权限拒绝'), { name: 'NotAllowedError' });
  } } });
  chrome.runtime.sendMessage = (message, callback) => {
    let response;
    if (message.action === 'ai_control_get') response = { ok: true, modelEnabled: true, scenes: [{ id: 'speech.transcribe', modelEnabled: true }, { id: 'speech.synthesize', modelEnabled: true }], speech: { configured: true }, synthesis: { configured: true, provider: 'preview', voice: 'silent-fixture' } };
    else if (message.action === 'local_ai_status') response = { ok: true, model: '隔离预览', models: [{ id: 'fixture', name: '隔离预览', reasoningOptions: ['off'] }] };
    else if (message.action === 'assistant_snapshot') response = { ok: true, task, shortcut: '隔离预览' };
    else if (liveDemo && message.action === 'speech_ai_transcribe') response = { ok: true, status: 'ready', text: ++number === 1 ? '你好，这是逐步出现的文字' : '你好，这是自动完成的最终文字' };
    else if (message.action === 'assistant_voice_synthesize') { const jobId = 'voice-' + ++number; jobs.set(jobId, message.requestId); response = { ok: true, status: 'pending', jobId }; }
    else if (message.action === 'assistant_voice_result') response = jobs.has(message.jobId) ? { ok: true, status: 'ready', audio, mimeType: 'audio/wav', durationSeconds: 2 } : { ok: false, error: '语音任务已取消' };
    else if (message.action === 'assistant_voice_cancel') { for (const [id, requestId] of jobs) if (id === message.jobId || requestId === message.requestId) jobs.delete(id); response = { ok: true, status: 'cancelled' }; }
    else if (message.action === 'assistant_clear') { task = null; response = { ok: true }; }
    else return original(message, callback);
    calls.push({ ...message });
    if (callback) { queueMicrotask(() => callback(response)); return; }
    return Promise.resolve(response);
  };
  window.__assistantVoicePreview = { calls, jobs };
  const note = document.getElementById('preview-effect'); if (note) note.textContent = `语音隔离验收：${liveDemo ? '合成音源用于测试实时采集与自动停顿' : `麦克风模拟${waitForMicrophone ? '等待授权' : '拒绝'}`}，朗读播放静音 WAV；没有调用真实模型或业务。`;
})();
