(function () {
  'use strict';
  const MAX_MS = 29000, FIRST_PREVIEW_MS = 3000, NEXT_PREVIEW_MS = 2300, SILENCE_MS = 1700;

  async function start(stream, { onPreview = () => {}, setupTimeoutMs = 4500 } = {}) {
    const context = new AudioContext();
    const rate = context.sampleRate;
    let source, node, gain, timer, stopped = false, chunks = [], count = 0;
    let heardSpeech = false, lastSound = 0, nextPreview = Math.ceil(rate * FIRST_PREVIEW_MS / 1000);
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    const duringSetup = async promise => {
      let timeout;
      try { return await Promise.race([promise, new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('实时录音组件响应超时，请重试')), setupTimeoutMs);
      })]); }
      finally { clearTimeout(timeout); }
    };
    const snapshot = () => {
      const samples = new Float32Array(count);
      let offset = 0;
      for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
      return samples;
    };
    const close = reason => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      if (node) { node.port.onmessage = null; node.disconnect(); }
      source?.disconnect(); gain?.disconnect();
      void context.close().catch(() => {});
      finish({ samples: reason === 'cancel' ? null : snapshot(), sampleRate: rate, reason, heardSpeech });
      chunks = [];
    };
    try {
      await duringSetup(context.audioWorklet.addModule(new URL('js/voice-capture-worklet.js', document.baseURI).href));
      source = context.createMediaStreamSource(stream);
      node = new AudioWorkletNode(context, 'voice-capture');
      gain = context.createGain(); gain.gain.value = 0;
      source.connect(node); node.connect(gain); gain.connect(context.destination);
      node.port.onmessage = event => {
        if (stopped || !(event.data instanceof Float32Array)) return;
        const chunk = event.data;
        chunks.push(chunk); count += chunk.length;
        let power = 0;
        for (const value of chunk) power += value * value;
        if (Math.sqrt(power / chunk.length) >= .012) { heardSpeech = true; lastSound = count; }
        if (heardSpeech && count - lastSound >= rate * SILENCE_MS / 1000) { close('silence'); return; }
        if (heardSpeech && count >= nextPreview) {
          nextPreview = count + Math.ceil(rate * NEXT_PREVIEW_MS / 1000);
          onPreview(snapshot(), rate);
        }
      };
      await duringSetup(context.resume());
      if (context.state !== 'running') throw new Error('浏览器未启动实时录音，请重试');
      timer = setTimeout(() => close('limit'), MAX_MS);
      return { finished, stop: () => close('manual'), cancel: () => close('cancel') };
    } catch (error) { close('cancel'); throw error; }
  }

  window.VoiceLive = { start };
})();
