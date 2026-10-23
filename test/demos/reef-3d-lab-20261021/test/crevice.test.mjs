import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {fixture} from '../crevice-probe.mjs';
import {injectJellyRenderer} from '../jelly-render-adapter.mjs';
import {createJellyModel} from '../jelly-3d.mjs';
import {readFileSync} from 'node:fs';

test('real meshes admit the small fish through the crevice and route the predator around',()=>{
 const {nav,prey,predator}=fixture();const a=new Vector3(0,.04,.55),b=new Vector3(0,.04,-.14);
 assert.equal(nav.clearEdge(prey,a,b),true);assert.equal(nav.clearEdge(predator,a,b),false);
 const path=nav.route(predator,predator.position,b);assert.ok(path?.length>=2);assert.ok(path.some(p=>Math.abs(p.x)>.5));
 const refuge=nav.refuge(prey,predator);assert.ok(refuge);assert.equal(nav.clearPoint(predator,refuge.point),false);
});
test('deterministic real stepping: shelter, wait, predator detour and search, release then emerge; no penetration',()=>{
 const {world,spatial,prey,predator}=fixture();let previous=world.fish.map(f=>f.position.clone()),maxStep=0,sawDetour=false;
 for(let i=0;i<840;i++){
  world.step(1/60);world.fish.forEach((f,k)=>{assert.equal(spatial.clearPose(f,f.position,f.quaternion),true);maxStep=Math.max(maxStep,f.position.distanceTo(previous[k]));previous[k].copy(f.position);});
  if(predator.position.z<.15&&predator.position.x<-.45)sawDetour=true;
 }
 for(const type of ['hidden','searched-exit','escape','emerged'])assert.ok(world.events.some(e=>e.type===type),type);
 assert.ok(sawDetour);assert.ok(maxStep<.01);assert.equal(world.stats.captures,0);assert.equal(prey.life,'alive');
 const hidden=world.events.find(e=>e.type==='hidden').time,emerged=world.events.find(e=>e.type==='emerged').time;assert.ok(emerged-hidden>3);
});
test('occluded target movement does not change the predator remembered location or chosen route',()=>{
 const a=fixture(),b=fixture();for(let i=0;i<220;i++){a.world.step(1/60);b.world.step(1/60);}
 assert.equal(a.spatial.lineOfSight(a.world.mouth(a.predator),a.prey.position),false);
 b.prey.position.set(0,.04,.27);assert.equal(b.spatial.lineOfSight(b.world.mouth(b.predator),b.prey.position),false);
 const remembered=a.predator.hunt.lastSeen.clone();a.world.updateHunt(a.predator,1/60);b.world.updateHunt(b.predator,1/60);
 assert.deepEqual(b.predator.hunt.lastSeen.toArray(),remembered.toArray());assert.deepEqual(a.predator.route.points,b.predator.route.points);
});
test('scene invalidation clears paths and graph cache; held prey cannot be eaten',()=>{
 const {world,nav,spatial,prey,predator}=fixture();for(let i=0;i<120;i++)world.step(1/60);assert.ok(prey.route||prey.hideUntil);
 nav.configure(null);spatial.setActive(false);world.clearRoutes();assert.equal(nav.cache.size,0);assert.equal(nav.route(predator,predator.position,prey.position),null);assert.equal(prey.route,null);
 world.setHeld(prey.id,true);assert.equal(world.canEat(predator,prey),false);assert.equal(predator.hunt,null);
});
test('3D jelly uses volumetric bell and tubes, with disposable resources',()=>{
 const m=createJellyModel();const bell=m.bellGroup.children[0];bell.geometry.computeBoundingBox();const box=bell.geometry.boundingBox;assert.ok(box.max.z-box.min.z>1.9);assert.ok(box.max.y-box.min.y>.7);assert.equal(m.limbs.children.length,12);
 let disposals=0;m.group.traverse(o=>o.geometry?.addEventListener('dispose',()=>disposals++));m.dispose();assert.ok(disposals>=13);
});
test('jelly renderer build seam changes only draw dispatch and fails closed on source drift',()=>{
 const source=readFileSync(new URL('../../../../js/jellyfish.js',import.meta.url),'utf8'),transformed=injectJellyRenderer(source);assert.ok(transformed.includes('drawFrame(ctx, world'));
 assert.ok(transformed.includes('outcome.then(result => settle(s, result), () => settle(s, null))'));assert.throws(()=>injectJellyRenderer(source.replace('    function create(env = {}) {','function changed(){')));
});
test('low scenery coverage does not relocate the drill actors away from their habitat',()=>{
 const {world,nav,habitat,spatial}=fixture();habitat.group.position.y=-2.01;spatial.updateMatrices();nav.configure(habitat.sites());world.startDrill(nav.sites);
 assert.equal(world.fish[0].position.y,nav.sites.y);assert.equal(world.fish[1].position.y,nav.sites.y);
 for(let i=0;i<840;i++)world.step(1/60);assert.ok(world.events.some(e=>e.type==='hidden'));assert.ok(world.events.some(e=>e.type==='searched-exit'));
});
