// Chrome Port semantics: a local disconnect never emits a local onDisconnect.
module.exports = function nativeDesktop(version = 3) {
  const ports = [], sent = [];
  const runtime = { connectNative() {
    let receive, disconnected, closed = false;
    const port = {
      onMessage: { addListener(fn) { receive = fn; } },
      onDisconnect: { addListener(fn) { disconnected = fn; } },
      postMessage(message) {
        if (closed) throw new Error('Attempting to use a disconnected port object');
        sent.push(message);
        if (message.requestId) queueMicrotask(() => {
          if (!closed) receive({ type: 'response', requestId: message.requestId, ok: true, version });
        });
      },
      disconnect() { closed = true; },
      remoteDisconnect() { closed = true; disconnected?.(); },
      // Raw delivery also allows explicit stale-event tests.
      emit(message) { receive(message); },
      get closed() { return closed; }
    };
    ports.push(port); return port;
  } };
  return { runtime, ports, sent, get port() { return ports.at(-1); }, emit(message) { ports.at(-1).emit(message); } };
};
