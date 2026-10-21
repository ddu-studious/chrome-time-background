import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as esbuild from '../../../local-ai/node_modules/esbuild/lib/main.js';
const here = new URL('./', import.meta.url);
if (esbuild.version !== '0.28.1') throw new Error('Demo build requires the existing locked esbuild 0.28.1.');
await esbuild.build({
  entryPoints: [fileURLToPath(new URL('reef-adapter.mjs', here))],
  outfile: fileURLToPath(new URL('reef.bundle.mjs', here)), bundle: true, format: 'esm',
  target: 'chrome120', minify: true, legalComments: 'eof',
  alias: { three: fileURLToPath(new URL('upstream/vendor/three.module.js', here)) },
  plugins: [{ name: 'fixed-upstream-asset-base', setup(build) {
    build.onLoad({ filter: /[/\\]reefscape[/\\]src[/\\]terrain\.js$/ }, async args => {
      const source = await readFile(args.path, 'utf8');
      if ((source.match(/import\.meta\.url/g) || []).length !== 3) throw new Error('Upstream asset-base contract changed.');
      return { contents: source.replaceAll('import.meta.url', 'new URL("./upstream/scenes/reefscape/src/terrain.js", import.meta.url).href'), loader: 'js' };
    });
  } }],
});
const bytes = await readFile(new URL('reef.bundle.mjs',here));
await writeFile(new URL('build-info.json',here), JSON.stringify({ esbuild: esbuild.version, upstreamCommit: '335d6c1aeb59b338b1cc59d734dc6eb87a596a88', threeRevision: '180', bundleBytes: bytes.length, bundleSha256: createHash('sha256').update(bytes).digest('hex'), assetBaseAdaptation: 'Three fixed upstream terrain import.meta.url bases rebound at build time; original source unchanged.' },null,2)+'\n');
console.log('Built isolated reef bundle:', bytes.length, 'bytes');
