import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Vector3,Quaternion} from 'three';
import {loadTerrainFixture} from './terrain-fixture.mjs';
import {ReefSpatial} from './spatial.mjs';
import {reefNavigation} from './upstream/scenes/reefscape/src/navigation.js';
import {groundHeight} from './upstream/scenes/reefscape/src/math.js';
const {group,meshes}=await loadTerrainFixture(),spatial=new ReefSpatial();spatial.setMeshes(meshes);spatial.setActive(true);
const minRadius=.015,Q=new Quaternion(),tiny={profile:{radiusM:.001,totalLengthM:0}},nodes=[],edges=[],grid=new Map();
const xs=Array.from({length:31},(_,i)=>-.9+i*.06),ys=[.04,.09,.14,.19,.24,.29,.35,.42,.50,.60,.72,.86,1.02,1.18],zs=Array.from({length:17},(_,i)=>-.38+i*.06);
const add=p=>{if(p.y<groundHeight(p.x*10,p.z*10)*.1+.01||!spatial.clearPose(tiny,p,Q))return -1;const clearance=spatial.distanceToSurface(p,.5);if(clearance<minRadius)return -1;nodes.push([...p.toArray().map(v=>+v.toFixed(6)),Math.floor(clearance*1e5)/1e5]);return nodes.length-1;};
for(let x=0;x<xs.length;x++)for(let y=0;y<ys.length;y++)for(let z=0;z<zs.length;z++){const id=add(new Vector3(xs[x],ys[y],zs[z]));if(id>=0)grid.set(`${x},${y},${z}`,id);}
const countGrid=nodes.length;
// Public upstream open-water nodes add known safe coarse landmarks, never its fixed-margin edges.
for(const p of reefNavigation().nodes)add(p.clone().multiplyScalar(.1));
function connect(i,j){const a=new Vector3(...nodes[i]),b=new Vector3(...nodes[j]),length=a.distanceTo(b);if(length<1e-5)return;const intervals=Math.max(3,Math.ceil(length/.018));let clearance=Math.min(nodes[i][3],nodes[j][3]);for(let k=1;k<intervals;k++){clearance=Math.min(clearance,spatial.distanceToSurface(a.clone().lerp(b,k/intervals),clearance));if(clearance<minRadius)return;}
 // Distance to a surface is 1-Lipschitz: subtract the maximum unsampled half-interval.
 clearance-=length/(2*intervals)+.0001;if(clearance>=minRadius)edges.push([i,j,Math.floor(clearance*1e5)/1e5,+length.toFixed(6)]);
}
for(const [key,id] of grid){const [x,y,z]=key.split(',').map(Number);for(const [dx,dy,dz] of [[1,0,0],[0,1,0],[0,0,1],[1,0,1],[1,0,-1]]){const next=grid.get(`${x+dx},${y+dy},${z+dz}`);if(next!==undefined)connect(id,next);}}
for(let i=countGrid;i<nodes.length;i++){const p=new Vector3(...nodes[i]);const nearest=nodes.slice(0,countGrid).map((n,j)=>({j,d:p.distanceTo(new Vector3(...n))})).filter(v=>v.d<.16).sort((a,b)=>a.d-b.d).slice(0,8);for(const n of nearest)connect(i,n.j);}
const files=['spatial.mjs','fish-envelope.mjs','bake-full-reef.mjs','terrain-fixture.mjs','upstream/scenes/reefscape/assets/live-rock.bin','upstream/scenes/reefscape/src/terrain.js','upstream/scenes/reefscape/src/geometry.js','upstream/scenes/reefscape/src/math.js','upstream/scenes/reefscape/src/layout.js','upstream/scenes/reefscape/src/navigation.js'];const sources=Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await readFile(new URL(p,import.meta.url))).digest('hex')])));
const data={version:1,units:'metres in reef local coordinates',method:'sampled surface distance minus Lipschitz half-interval bound',minRadius,maxNodes:8192,stepXZ:.06,ys,sources,nodes,edges,upstreamNodes:nodes.length-countGrid};
await mkdir(new URL('./assets/navigation/',import.meta.url),{recursive:true});await writeFile(new URL('./assets/navigation/full-reef.json',import.meta.url),JSON.stringify(data));console.log({nodes:nodes.length,edges:edges.length,upstreamNodes:data.upstreamNodes,queries:spatial.queryCount});
if(nodes.length>8192)throw new Error('Roadmap node budget exceeded');
