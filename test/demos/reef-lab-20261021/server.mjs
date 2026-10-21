import http from 'node:http';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';
const here = fileURLToPath(new URL('./', import.meta.url));
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const files = new Map();
function add(route,path) { if (lstatSync(path).isSymbolicLink()) throw new Error('Symlink not permitted in demo files.'); files.set(route,readFileSync(path)); }
function walk(dir, prefix='') {
  for (const item of readdirSync(dir,{withFileTypes:true})) {
    if(item.isSymbolicLink()) throw new Error('Symlink not permitted in demo tree.');
    const p=join(dir,item.name), route=prefix+'/'+item.name;
    if(item.isDirectory()) walk(p,route);
    else if(/\.(html|css|js|mjs|json|png|bin|txt|md)$/.test(item.name) && !['server.mjs','build.mjs'].includes(item.name)) add(route,p);
  }
}
walk(here);
const bootstrap=readFileSync(join(here,'bootstrap.mjs'),'utf8');
const scriptNames=[...bootstrap.matchAll(/'([a-z][a-z0-9-]+\.js)'/g)].map(m=>m[1]);
for(const name of new Set(scriptNames)) add('/js/'+name,join(repo,'js',name));
for(const name of ['background-experience.css','aquarium.css','task-crumple.css']) add('/css/'+name,join(repo,'css',name));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.bin':'application/octet-stream','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
const host='127.0.0.1',port=18765;
const server=http.createServer((req,res)=>{
  if(req.headers.host!==`${host}:${port}`&&req.headers.host!==`localhost:${port}`){res.writeHead(403);return res.end();}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  let path;try{path=new URL(req.url,`http://${host}:${port}`).pathname;}catch{res.writeHead(400);return res.end();}
  if(path==='/')path='/index.html';
  const body=files.get(path);if(!body){res.writeHead(404);return res.end();}
  res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' blob: data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});
  res.end(req.method==='HEAD'?undefined:body);
});
server.requestTimeout=10000;server.headersTimeout=10000;
server.listen(port,host,()=>console.log(`浅海珊瑚礁隔离体验：http://${host}:${port}/`));
