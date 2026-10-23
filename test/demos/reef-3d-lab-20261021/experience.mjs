import {Vector3} from 'three';
import {WORLD_LIMITS as B} from './catalog.mjs';

// These presets only compose the existing view API. Residents, food, time and tasks
// remain owned by their existing controllers; entering a habitat never resets them.
export async function enterExperience(view,kind,setMode){
  if(!['water','reef'].includes(kind))throw new Error('未知体验场景');
  if(kind==='reef')await view.setScene('full');
  if(view.disposed)return false;
  setMode('natural');
  const result=await view.setReef(kind==='reef');
  if(view.disposed)return false;
  if(result===false||view.reefVisible!==(kind==='reef'))throw new Error('造景加载未完成，请重试');
  view.render(true);
  return true;
}

// The drag-to-feed widget passes screen pixels. Keep its projection in the
// existing metre world, at a fixed middle-water plane, never on a UI surface.
export function foodDropPoint(view,spatial,screen){
  if(!screen||![screen.x,screen.y].every(Number.isFinite)||screen.x<0||screen.y<0||screen.x>view.width||screen.y>view.height)return null;
  const p=view.pointerPlane(screen.x,screen.y,new Vector3(0,0,.3));
  if(!p||![p.x,p.y,p.z].every(Number.isFinite)||p.x<B.minX+.04||p.x>B.maxX-.04||p.y<B.minY+.04||p.y>B.maxY-.04||p.z<B.minZ+.04||p.z>B.maxZ-.04)return null;
  const ray=view.ray(screen.x,screen.y),wall=spatial.firstHit(ray);
  if(wall&&wall.distance<=ray.origin.distanceTo(p)+.002)return null;
  // World.feed scatters by at most 2.5 cm on each horizontal axis. Include
  // that whole footprint and the 2 mm pellet radius in the clearance check.
  if(!spatial.clearCorridor(p,p,.038))return null;
  return p;
}
