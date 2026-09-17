window.chrome = { runtime: { sendMessage(message, callback) {
  const read = message.action === 'ai_memory_get';
  fetch('/fixture-memory', { method: read ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(read ? {} : { body: JSON.stringify(message.body) }) })
    .then(response => response.json()).then(callback).catch(error => callback({ ok: false, error: error.message }));
} } };
