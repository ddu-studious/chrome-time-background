import * as esbuild from '../../../local-ai/node_modules/esbuild/lib/main.js';
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root=new URL('./',import.meta.url);
if(esbuild.version!=='0.28.1')throw new Error('Expected esbuild 0.28.1');
await esbuild.build({entryPoints:[new URL('controller.mjs',root).pathname],outfile:new URL('ocean.bundle.mjs',root).pathname,bundle:true,minify:true,format:'esm',target:'chrome120',legalComments:'eof',
 plugins:[{name:'upstream-asset-base',setup(build){build.onLoad({filter:/[/\\]reefscape[/\\]src[/\\]terrain\.js$/},async args=>{
   const source=await readFile(args.path,'utf8');if((source.match(/import\.meta\.url/g)||[]).length!==3)throw new Error('Terrain asset-base changed');
   return {contents:source.replaceAll('import.meta.url','new URL("./upstream/scenes/reefscape/src/terrain.js",import.meta.url).href'),loader:'js'};
 });}}]});
const b=await readFile(new URL('ocean.bundle.mjs',root));
await writeFile(new URL('build-info.json',root),JSON.stringify({esbuild:esbuild.version,three:'0.180.0',yuka:'0.7.8',bvh:'0.9.16',bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')},null,2)+'\n');
console.log('Built 3D prototype',b.length,'bytes');
