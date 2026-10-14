// Runs under the exact Node permission flags used for the compute sandbox child and reports
// which host capabilities are still reachable. Used only by test/local-ai-compute-sandbox.test.mjs.
const marker = process.argv[2];
const probes = {
  readOutside: async () => (await import('node:fs')).readFileSync('/etc/hosts', 'utf8'),
  readSecretStore: async () => (await import('node:fs')).readFileSync(new URL('../../local-ai/.local/token', import.meta.url)),
  listRepository: async () => (await import('node:fs')).readdirSync(new URL('../../', import.meta.url)),
  writeFile: async () => (await import('node:fs')).writeFileSync(marker, 'x'),
  spawnChild: async () => (await import('node:child_process')).execFileSync('/bin/echo', ['hi']),
  startWorker: async () => { new (await import('node:worker_threads')).Worker('1', { eval: true }); },
  tcpConnect: async () => {
    const net = await import('node:net');
    await new Promise((resolve, reject) => { const socket = net.connect(9, '127.0.0.1'); socket.on('connect', resolve); socket.on('error', reject); });
  },
  dnsLookup: async () => { const dns = await import('node:dns'); await new Promise((resolve, reject) => dns.lookup('example.com', error => error ? reject(error) : resolve())); },
  loadAddon: async () => { process.dlopen({ exports: {} }, '/usr/lib/libSystem.B.dylib'); },
  inspector: async () => { (await import('node:inspector')).open(0, '127.0.0.1', false); },
  wasi: async () => { const { WASI } = await import('node:wasi'); new WASI({ version: 'preview1' }); }
};
const result = {};
for (const [name, probe] of Object.entries(probes)) {
  try { await probe(); result[name] = 'ALLOWED'; }
  catch (error) { result[name] = error.code || error.name; }
}
process.stdout.write(JSON.stringify({ permissionApi: typeof process.permission, result }) + '\n');
