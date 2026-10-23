import {Quaternion,Vector3} from 'three';

// A bounded orientation proposal over Three's public quaternion API. The World
// still owns position and commits this pose only after its existing BVH sweep.
export const CLOWN_TURN=Object.freeze({maxRate:4,maxAcceleration:18,response:24,gain:6});
export function proposeClownTurn(quaternion,velocity,goal,dt,{incremental=false}={}){
  if(!Number.isFinite(dt)||dt<=0||dt>1/30)throw new RangeError('Invalid turn timestep');
  if(![...quaternion.toArray(),...goal.toArray(),...velocity.toArray()].every(Number.isFinite)||Math.abs(quaternion.lengthSq()-1)>1e-5||Math.abs(goal.lengthSq()-1)>1e-5||velocity.length()>CLOWN_TURN.maxRate+1e-6)throw new RangeError('Invalid turn state');
  const delta=goal.clone().multiply(quaternion.clone().invert());
  if(delta.w<0)delta.set(-delta.x,-delta.y,-delta.z,-delta.w);
  const axis=new Vector3(delta.x,delta.y,delta.z),sine=axis.length(),angle=2*Math.atan2(sine,Math.max(0,delta.w));
  // A Yuka velocity proposal is already integrated for this timestep. Treating
  // its small angular increment as an absolute look target would damp it twice.
  const gain=incremental?1/dt:CLOWN_TURN.gain;
  const desired=sine>1e-9?axis.multiplyScalar(Math.min(CLOWN_TURN.maxRate,angle*gain)/sine):axis.set(0,0,0);
  const change=desired.sub(velocity).multiplyScalar(1-Math.exp(-CLOWN_TURN.response*dt)).clampLength(0,CLOWN_TURN.maxAcceleration*dt);
  const angularVelocity=velocity.clone().add(change).clampLength(0,CLOWN_TURN.maxRate),rate=angularVelocity.length();
  const next=rate>1e-10?new Quaternion().setFromAxisAngle(angularVelocity.clone().divideScalar(rate),rate*dt).multiply(quaternion).normalize():quaternion.clone();
  return {quaternion:next,angularVelocity};
}
