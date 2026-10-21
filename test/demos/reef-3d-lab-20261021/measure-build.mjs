import * as esbuild from '../../../local-ai/node_modules/esbuild/lib/main.js';
await esbuild.build({entryPoints:[new URL('measure-source.mjs',import.meta.url).pathname],outfile:new URL('measure.cjs',import.meta.url).pathname,bundle:true,platform:'node',format:'cjs',alias:{three:new URL('node_modules/three/build/three.module.js',import.meta.url).pathname},logLevel:'warning'});
