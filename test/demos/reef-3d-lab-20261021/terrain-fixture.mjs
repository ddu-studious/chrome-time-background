// Node-only: execute the original terrain factory with local binary fixtures and
// texture placeholders. Geometry is identical; no network or DOM is used.
import {readFile} from 'node:fs/promises';
import {TextureLoader,Texture,Group} from 'three';
import {createTerrain} from './upstream/scenes/reefscape/src/terrain.js';
export async function loadTerrainFixture(){
 const originalFetch=globalThis.fetch,originalLoader=TextureLoader.prototype.loadAsync;
 globalThis.fetch=async url=>{const name=new URL(url).pathname.split('/').at(-1);if(!['live-rock.bin','rock-support.bin'].includes(name))throw new Error('Unexpected fixture resource');const b=await readFile(new URL('./upstream/scenes/reefscape/assets/'+name,import.meta.url));return {ok:true,status:200,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
 TextureLoader.prototype.loadAsync=async()=>new Texture();
 try{const group=new Group(),terrain=await createTerrain(group);return {group,terrain,meshes:group.children.filter(x=>x.isMesh).map(mesh=>({mesh,solid:mesh===terrain.rockSurface}))};}
 finally{globalThis.fetch=originalFetch;TextureLoader.prototype.loadAsync=originalLoader;}
}
