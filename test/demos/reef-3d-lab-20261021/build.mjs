import {injectJellyRenderer} from './jelly-render-adapter.mjs';
import {inspectClownEnvelope} from './probe-fish-envelope.mjs';
import * as esbuild from '../../../local-ai/node_modules/esbuild/lib/main.js';
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root=new URL('./',import.meta.url);
const envelopeProof=inspectClownEnvelope();
const certificates=JSON.parse(await readFile(new URL('assets/community/certificates.json',root),'utf8'));
for(const [path,expected] of Object.entries(certificates.sources)){if(createHash('sha256').update(await readFile(new URL(path,root))).digest('hex')!==expected)throw new Error('Community certificate is stale: '+path);}
for(const [kind,spec] of Object.entries(certificates.models)){if(spec.sha256&&createHash('sha256').update(await readFile(new URL('assets/community/'+kind+'.glb',root))).digest('hex')!==spec.sha256)throw new Error('Community asset changed: '+kind);}
const roadmap=JSON.parse(await readFile(new URL('assets/navigation/full-reef.json',root),'utf8'));
for(const [file,expected] of Object.entries(roadmap.sources)){const hash=createHash('sha256').update(await readFile(new URL(file,root))).digest('hex');if(hash!==expected)throw new Error('Full-reef roadmap is stale: '+file+'; run bake-full-reef.mjs');}
if(esbuild.version!=='0.28.1')throw new Error('Expected esbuild 0.28.1');
await esbuild.build({entryPoints:[new URL('controller.mjs',root).pathname],outfile:new URL('ocean.bundle.mjs',root).pathname,bundle:true,minify:true,format:'esm',target:'chrome120',legalComments:'eof',
 plugins:[{name:'task-jelly-renderer',setup(build){build.onLoad({filter:/[/\\]js[/\\]jellyfish\.js$/},async args=>({contents:injectJellyRenderer(await readFile(args.path,'utf8')),loader:'js'}));}},{name:'upstream-asset-base',setup(build){build.onLoad({filter:/[/\\]reefscape[/\\]src[/\\]terrain\.js$/},async args=>{
   const source=await readFile(args.path,'utf8');if((source.match(/import\.meta\.url/g)||[]).length!==3)throw new Error('Terrain asset-base changed');
   return {contents:source.replaceAll('import.meta.url','new URL("./upstream/scenes/reefscape/src/terrain.js",import.meta.url).href'),loader:'js'};
 });}}]});
const b=await readFile(new URL('ocean.bundle.mjs',root));
const sourceFiles=['community-view.mjs','community-geometry.mjs','community-catalog.mjs','catalog.mjs','assets/community/source-lock.json','assets/community/certificates.json','turning.mjs','experience.mjs','animal-style.mjs','probe-fish-envelope.mjs','fish-envelope.mjs','route-following.mjs','fish-motion.mjs','clown-appearance.mjs','moon-jelly.mjs','specimen-view.mjs','full-navigation.mjs','assets/navigation/full-reef.json','assets/navigation/full-reef-scenarios.json','controller.mjs','world.mjs','navigation.mjs','habitat.mjs','spatial.mjs','view.mjs','jelly-3d.mjs','jelly-render-adapter.mjs','bootstrap.mjs','index.html','app.css','../../../js/aquarium-play.js','../../../js/aquarium-play-core.js','../../../css/aquarium.css','../../../js/jellyfish.js','../../../js/jellyfish-core.js','../../../js/background-experience.js'];
const sources=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(new URL(file,root))).digest('hex')])));
await writeFile(new URL('build-info.json',root),JSON.stringify({envelopeVersion:envelopeProof.version||'clown-analytic-v1',sources,esbuild:esbuild.version,three:'0.180.0',yuka:'0.7.8',bvh:'0.9.16',bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')},null,2)+'\n');
console.log('Built 3D prototype',b.length,'bytes');
