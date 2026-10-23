// Presentation of accepted world motion, not a second position integrator.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));
const mix=(a,b,k)=>a+(b-a)*k;
export function advanceFishMotion(state,dt,{speedBL=0,turnRate=0,accelerationBL=0,behavior='wander',coast=false}={}){
  dt=clamp(dt,0,1/30);if(!dt)return state;
  const speed=clamp(speedBL,0,8),turn=clamp(turnRate,-4,4),accel=clamp(accelerationBL,-8,8);
  const burst=['evade','pursuit','food'].includes(behavior)||accel>1;
  const hovering=speed<.25,glide=coast||(!burst&&accel<-.3&&speed>.4);
  const tail=glide?.001:hovering?.003:clamp(.008+speed*.009+(burst?.012:0),.006,.075);
  const rowing=glide?.08:hovering?.24:clamp(.3+speed*.1+Math.abs(turn)*.11,.28,.8);
  const blend=1-Math.exp(-dt*8);
  state.phase=(state.phase||0)+dt*(glide?2.2:hovering?3:5+speed*2.6);
  state.pectoral=(state.pectoral||0)+dt*Math.PI*2*(hovering?1.8:glide?.8:2.3+Math.min(speed,3)*.4);
  state.tailAmplitude=mix(state.tailAmplitude||0,tail,blend);
  state.rowing=mix(state.rowing||0,rowing,blend);
  state.bend=mix(state.bend||0,clamp(turn*.15,-.42,.42),blend);
  state.motionLabel=Math.abs(turn)>.45?'弯身转向':glide?'收尾滑行':hovering?'胸鳍悬停':burst?'加速游动':'胸鳍巡游';
  return state;
}

// A deterministic, obstacle-free comparison sequence. Both columns share root pose.
export function specimenCue(time,selection='cycle'){
  const t=Math.max(0,Number.isFinite(time)?time:0),cycle=t%24;
  const mode=selection==='cycle'?(cycle<4?'hover':cycle<10?'swim':cycle<14?'turn':cycle<18?'coast':cycle<21?'burst':'swim'):selection;
  const phase=mode==='turn'?(selection==='cycle'?cycle-10:t):0;
  const theta=phase*Math.PI/2,yaw=mode==='turn'?.7*Math.sin(theta)**3:0;
  return {mode,yaw,turnRate:mode==='turn'?1.05*Math.PI*Math.sin(theta)**2*Math.cos(theta):0,speedBL:mode==='hover'?.1:mode==='coast'?.9:mode==='burst'?3:1.15,
    accelerationBL:mode==='burst'?1.4:mode==='coast'?-.6:0,coast:mode==='coast',behavior:mode==='burst'?'evade':'wander'};
}

export function createSpecimenState(){return {time:0,reference:{phase:0,pectoral:0,tailAmplitude:.003,rowing:.24,bend:0,motionLabel:'胸鳍悬停'},legacy:{phase:0,pectoral:0,tailAmplitude:.012,rowing:.25,bend:0},cue:specimenCue(0)};}
export function stepSpecimen(state,dt,selection='cycle'){
  dt=clamp(dt,0,1/30);state.time+=dt;state.cue=specimenCue(state.time,selection);
  advanceFishMotion(state.reference,dt,state.cue);
  const effort=clamp(state.cue.speedBL/.95,0,3),old=state.legacy;
  old.phase+=dt*(3+effort*3);old.pectoral+=dt*(5+effort*5);old.tailAmplitude=.012+.035*effort;old.rowing=.25+.2*effort;old.bend=0;
  return state;
}
