import http from 'node:http';
import { readFileSync,readdirSync,lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join,extname } from 'node:path';
const here=fileURLToPath(new URL('./',import.meta.url)),repo=fileURLToPath(new URL('../../../',import.meta.url)),files=new Map();
function add(route,path){if(lstatSync(path).isSymbolicLink())throw new Error('No symlinks');files.set(route,readFileSync(path));}
for(const name of ['index.html','app.css','bootstrap.mjs','ocean.bundle.mjs'])add('/'+name,join(here,name));
function walk(path,route){for(const e of readdirSync(path,{withFileTypes:true})){if(e.isSymbolicLink())throw new Error('No symlinks');if(e.isDirectory())walk(join(path,e.name),route+'/'+e.name);else if(/\.(png|gltf|bin|json|md)$/.test(e.name))add(route+'/'+e.name,join(path,e.name));}}
walk(join(here,'assets'),'/assets');walk(join(here,'upstream/scenes/reefscape/assets'),'/upstream/scenes/reefscape/assets');
for(const name of ['task-crumple-core.js','task-crumple.js','jellyfish-core.js','jellyfish.js','background-experience.js'])add('/js/'+name,join(repo,'js',name));
for(const name of ['background-experience.css','task-crumple.css'])add('/css/'+name,join(repo,'css',name));
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.gltf':'model/gltf+json','.json':'application/json','.png':'image/png','.bin':'application/octet-stream','.md':'text/plain; charset=utf-8'};
const port=18766,server=http.createServer((req,res)=>{
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)){res.writeHead(403);return res.end();}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
 let p;try{p=new URL(req.url,'http://127.0.0.1').pathname;}catch{res.writeHead(400);return res.end();}if(p==='/')p='/index.html';
 const b=files.get(p);if(!b){res.writeHead(404);return res.end();}
 res.writeHead(200,{'Content-Type':mime[extname(p)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});res.end(req.method==='HEAD'?undefined:b);
});server.requestTimeout=server.headersTimeout=10000;server.listen(port,'127.0.0.1',()=>console.log('真三维隔离原型：http://127.0.0.1:'+port+'/'));
