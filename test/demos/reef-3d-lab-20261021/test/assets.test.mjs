import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root));
const blob=b=>createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
test('pinned upstream source and glTF assets match original git blobs',()=>{
 const source=JSON.parse(read('upstream-lock.json'));for(const f of source.files){const b=read('upstream/'+f.path);assert.equal(b.length,f.size);assert.equal(blob(b),f.gitBlobSha1,f.path);}
 const model=JSON.parse(read('model-lock.json'));for(const f of model.files){const b=read(f.target);assert.equal(b.length,f.size);assert.equal(blob(b),f.gitBlobSha1,f.path);}
});
test('source and npm Three builds are identical; model references only frozen local resources',()=>{
 for(const file of ['three.core.js','three.module.js'])assert.ok(read('upstream/vendor/'+file).equals(read('node_modules/three/build/'+file)));
 const model=JSON.parse(read('assets/barramundi/BarramundiFish.gltf')),allowed=new Set(JSON.parse(read('model-lock.json')).files.map(f=>f.target.split('/').at(-1)));
 for(const r of [...model.images,...model.buffers]){assert.ok(allowed.has(r.uri));assert.equal(r.uri.includes('/'),false);}
});

test('actual upstream vertices preserve total-length scale and fit the centred conservative capsule',async()=>{
 const {makeFishGeometry}=await import('../upstream/scenes/reefscape/src/fish-model.js');const g=makeFishGeometry('clown');g.computeBoundingBox();
 const length=g.boundingBox.max.x-g.boundingBox.min.x,center=(g.boundingBox.max.x+g.boundingBox.min.x)/2;assert.equal(length,1.25);assert.ok(Math.abs(center/length+.068)<1e-6);
 const p=g.attributes.position;let worst=0;
 for(let i=0;i<p.count;i++){const x=(p.getX(i)-center)/length,y=p.getY(i)/length,z=p.getZ(i)/length;worst=Math.max(worst,Math.hypot(Math.max(0,Math.abs(x)-.28),y,z));}
 assert.ok(worst<.38,`capsule ${worst}`);assert.ok(g.boundingBox.max.z-g.boundingBox.min.z>.25);g.dispose();
});
