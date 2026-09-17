const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('SDK依赖与调度实现已移除，本地写作适配器保留',()=>{
 const pkg=JSON.parse(fs.readFileSync('cursor-bridge/package.json','utf8'));assert.equal(pkg.dependencies['@cursor/sdk'],undefined);
 for(const file of ['cursor-bridge/src/services/agent-pool.ts','cursor-bridge/src/services/cursor-provider.ts','local-ai/sdk-leases.mjs'])assert.equal(fs.existsSync(file),false);
 assert.equal(fs.existsSync('cursor-bridge/src/modules/writing/service.ts'),true);assert.equal(fs.existsSync('local-ai/provider.mjs'),true);
});
test('VIP Brain与SDK面板不再加载或注册远端路由',()=>{
 const index=fs.readFileSync('index.html','utf8'),server=fs.readFileSync('local-ai/server.mjs','utf8');
 assert.doesNotMatch(index,/js\/(chatbot|vipbrain-transport|cursor-bridge)\.js/);assert.doesNotMatch(server,/\/v1\/(vipbrain|sdk)\//);
 assert.equal(fs.existsSync('local-ai/vipbrain-relay.mjs'),false);
});
