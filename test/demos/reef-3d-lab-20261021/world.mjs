import { Vector3,Quaternion,Matrix4 } from 'three';
import { Vehicle,Vector3 as YVector3,SeekBehavior,PursuitBehavior,EvadeBehavior } from 'yuka';
import rules from '../../../js/aquarium-predation-core.js';
import playRules from '../../../js/aquarium-play-core.js';
import { CATALOG,INITIAL_LENGTHS,WORLD_LIMITS,MAX_FISH,profile } from './catalog.mjs';

const X=new Vector3(1,0,0),UP=new Vector3(0,1,0),B=WORLD_LIMITS;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const freeSpace={clearMotion:()=>true,clearPose:()=>true,lineOfSight:()=>true,avoidance:()=>new Vector3()};
function orientation(direction){
  const x=direction.clone().normalize(),z=new Vector3().crossVectors(x,UP).normalize();
  if(z.lengthSq()<.01)z.set(0,0,1);
  const y=new Vector3().crossVectors(z,x).normalize();
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z));
}
export class OceanWorld{
  constructor({seed=73,spatial=freeSpace,empty=false}={}){
    this.random=rules.seededRandom(seed);this.spatial=spatial;this.fish=[];this.pellets=[];this.time=0;this.revision=0;this.nextId=1;this.nextFoodId=1;
    this.lastFeed=-Infinity;this.lastCapture=-Infinity;this.predation=false;this.events=[];this.captureIds=new Set();this.pointer=null;
    this.stats={feeds:0,eaten:0,hunts:0,captures:0,escapes:0,blocked:0,refills:0};
    if(!empty)INITIAL_LENGTHS.forEach((length,i)=>this.add('clown',length,{id:`clown-${i+1}`,position:new Vector3(-.63+i*.24,.25+(i%3)*.12,.24+(i%2)*.13)}));
  }
  emit(type,detail={}){this.events.push({type,time:this.time,...detail});if(this.events.length>80)this.events.shift();}
  add(kind='clown',length=null,{id=null,position=null}={}){
    if(this.fish.length>=MAX_FISH)return null;
    if(kind==='barramundi'&&this.fish.some(f=>f.kind===kind))return null;
    if(length===null)length=kind==='clown'?(.025+this.random()*.05):.45;
    const tag=id||`${kind}-added-${this.nextId++}`;if(this.fish.some(f=>f.id===tag))return null;
    const p=profile(tag,kind,length),v=kind==='clown'?.035+length*.55:.11+length*.22;
    const pos=position?.clone()||new Vector3(kind==='clown'?-.7+this.random()*1.4:-.75,.35+this.random()*.25,kind==='clown'?.3:-.08);
    const f={id:tag,kind,profile:p,position:pos,velocity:new Vector3(v,0,0),direction:X.clone(),quaternion:new Quaternion(),cruise:v,
      goal:pos.clone(),home:pos.clone(),goalAt:0,held:false,absentUntil:0,phase:this.random()*Math.PI*2,life:'alive',nextHunt:this.time+5,
      hunt:null,hunger:.6,restUntil:0,fedUntil:0,agent:new Vehicle(),force:new YVector3(),seek:new SeekBehavior(),pursuit:new PursuitBehavior(),evade:new EvadeBehavior(),
      tailAmplitude:.025,pectoral:0,rowing:.5,bend:0};
    f.agent.maxSpeed=v;f.agent.maxForce=v*3;this.fish.push(f);this.revision++;this.findLegal(f);return f;
  }
  remove(id){const i=this.fish.findIndex(f=>f.id===id);if(i<0)return false;this.fish.splice(i,1);this.captureIds.delete(id);this.revision++;for(const f of this.fish)if(f.hunt?.target===id)this.endHunt(f,'removed');this.emit('removed',{id});return true;}
  active(f){return f.life==='alive'&&!f.held;}
  findLegal(f){
    if(this.spatial.clearPose(f,f.position,f.quaternion)&&this.inBounds(f,f.position))return true;
    for(let i=0;i<48;i++){
      const p=new Vector3(-.8+this.random()*1.6,.25+this.random()*.5,-.16+this.random()*.65);
      if(this.inBounds(f,p)&&this.spatial.clearPose(f,p,f.quaternion)){f.position.copy(p);f.goal.copy(p);return true;}
    }
    return false;
  }
  inBounds(f,p){const r=f.profile.radiusM;return p.x>=B.minX+r&&p.x<=B.maxX-r&&p.y>=B.minY+r&&p.y<=B.maxY-r&&p.z>=B.minZ+r&&p.z<=B.maxZ-r;}
  canEat(pred,prey){
    if(!pred||!prey||pred===prey||!this.active(pred)||!this.active(prey))return false;
    const a=CATALOG[pred.kind],b=CATALOG[prey.kind];
    if(!a||!b||!pred.profile||!prey.profile)return false;
    return rules.canEat({...a,meters:pred.profile.totalLengthM},{...b,meters:prey.profile.totalLengthM})
      &&prey.profile.bodyDepthM<=pred.profile.totalLengthM*.11;
  }
  mouth(f){return f.position.clone().addScaledVector(f.direction,f.profile.totalLengthM*.43);}
  feed(point=null){
    const p=playRules.PARAMS;
    if(this.time-this.lastFeed<p.FEED_COOLDOWN_S||this.pellets.length+p.SPRINKLE_COUNT>p.MAX_PELLETS)return {ok:false,reason:'cooldown'};
    this.lastFeed=this.time;
    for(let i=0;i<p.SPRINKLE_COUNT;i++)this.pellets.push({id:this.nextFoodId++,position:point?point.clone().add(new Vector3((this.random()-.5)*.05,0,(this.random()-.5)*.05)):new Vector3(-.55+this.random()*1.1,.78,.3),born:this.time});
    this.stats.feeds++;this.emit('feed',{count:p.SPRINKLE_COUNT});return {ok:true,count:p.SPRINKLE_COUNT};
  }
  setPredation(on){this.predation=on===true;for(const f of this.fish)if(!this.predation&&f.hunt)this.endHunt(f,'disabled');}
  setHeld(id,value){const f=this.fish.find(f=>f.id===id);if(!f||f.life!=='alive')return false;if(f.held!==(value===true))this.revision++;f.held=value===true;if(value){f.velocity.set(0,0,0);if(f.hunt)this.endHunt(f,'held');for(const p of this.fish)if(p.hunt?.target===id)this.endHunt(p,'held');}return true;}
  endHunt(f,reason){if(f.hunt){this.stats.escapes++;this.emit('escape',{predator:f.id,target:f.hunt.target,reason});}f.hunt=null;f.restUntil=this.time+rules.PARAMS.REST_MIN_S+this.random()*(rules.PARAMS.REST_MAX_S-rules.PARAMS.REST_MIN_S);}
  capture(pred,prey){
    if(!this.predation||!this.canEat(pred,prey)||this.captureIds.has(prey.id)||this.time-this.lastCapture<rules.PARAMS.KILL_GAP_S)return false;
    const mouth=this.mouth(pred),reach=pred.profile.totalLengthM*.055+prey.profile.bodyDepthM*.35;
    if(mouth.distanceTo(prey.position)>reach||!this.spatial.lineOfSight(mouth,prey.position))return false;
    this.captureIds.add(prey.id);prey.life='absent';prey.absentUntil=this.time+rules.PARAMS.REFILL_SCHOOL_S;prey.velocity.set(0,0,0);
    pred.hunt=null;pred.hunger=.12;pred.restUntil=this.time+10;this.lastCapture=this.time;this.revision++;this.stats.captures++;
    this.emit('capture',{predator:pred.id,prey:prey.id});return true;
  }
  chooseGoal(f){
    for(let i=0;i<12;i++){
      const p=new Vector3(-.8+this.random()*1.6,.12+this.random()*.58,-.2+this.random()*.72);
      if(this.inBounds(f,p)&&this.spatial.clearPose(f,p,f.quaternion)){f.goal.copy(p);break;}
    }
    f.goalAt=this.time+4+this.random()*5;
  }
  findRefuge(f,threat){
    if(!this.spatial.active||this.time<(f.refugeCheckAt||0))return;
    f.refugeCheckAt=this.time+.75;
    // Bounded local cover search. It never promises a global route through a reef.
    for(let i=0;i<12;i++){
      const angle=i*Math.PI/6,p=f.position.clone().add(new Vector3(Math.cos(angle)*.18,(i%3-1)*.06,Math.sin(angle)*.18));
      if(this.inBounds(f,p)&&this.spatial.clearPose(f,p,f.quaternion)&&!this.spatial.lineOfSight(threat.position,p)&&this.spatial.clearMotion(f,f.position,p,f.quaternion,f.quaternion)){
        f.refuge=p;f.refugeUntil=this.time+2;this.emit('refuge',{id:f.id});return;
      }
    }
  }
  updateHunt(f,dt){
    if(!this.predation||f.kind!=='barramundi'||!this.active(f))return;
    f.hunger=Math.min(1,f.hunger+.008*dt);
    if(f.hunt){
      const prey=this.fish.find(p=>p.id===f.hunt.target);
      if(!this.canEat(f,prey)||this.time-f.hunt.start>rules.PARAMS.HUNT_MAX_S){this.endHunt(f,'ineligible-or-timeout');return;}
      if(this.spatial.lineOfSight(this.mouth(f),prey.position)){f.hunt.lastSeen.copy(prey.position);f.hunt.seen=this.time;}
      else if(this.time-f.hunt.seen>1.4){this.endHunt(f,'lost');return;}
      const toPrey=prey.position.clone().sub(this.mouth(f));
      if(f.hunt.phase==='hunt'&&toPrey.length()<f.profile.totalLengthM*.65&&f.direction.angleTo(toPrey)<=rules.PARAMS.STRIKE_CONE){f.hunt.phase='strike';f.hunt.strikeEnd=this.time+rules.PARAMS.STRIKE_S;}
      if(f.hunt.phase==='strike'&&this.time>f.hunt.strikeEnd){this.endHunt(f,'burst-ended');return;}
      return;
    }
    if(this.time<f.nextHunt||this.time<f.restUntil||f.hunger<rules.PARAMS.HUNGER_THRESHOLD)return;
    let target=null,best=Infinity;
    for(const prey of this.fish){
      if(!this.canEat(f,prey)||!this.spatial.lineOfSight(this.mouth(f),prey.position))continue;
      const d=f.position.distanceTo(prey.position);if(d>1.5)continue;
      const delta=prey.position.clone().sub(f.position).normalize();
      const score=rules.costOf(d,false,f.direction.angleTo(delta));if(score<best){best=score;target=prey;}
    }
    f.nextHunt=this.time+.8;
    if(target){f.hunt={target:target.id,start:this.time,phase:'hunt',seen:this.time,lastSeen:target.position.clone()};this.stats.hunts++;this.emit('hunt',{predator:f.id,target:target.id});}
  }
  step(dt){
    if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,1/30);this.time+=dt;
    for(const f of this.fish){
      if(f.life==='absent'&&this.time>=f.absentUntil){f.life='alive';f.position.set(-.82,.5,.1);this.findLegal(f);this.captureIds.delete(f.id);this.stats.refills++;this.revision++;}
      f.agent.position.copy(f.position);f.agent.velocity.copy(f.velocity);f.agent.maxSpeed=f.cruise;f.agent.maxForce=f.cruise*3;
      f.agent.lookAt(new YVector3(f.position.x+f.direction.x,f.position.y+f.direction.y,f.position.z+f.direction.z));
    }
    for(const f of this.fish)this.updateHunt(f,dt);
    for(const f of this.fish){
      if(!this.active(f))continue;
      let mode='wander',target=null,speed=f.cruise;
      const threat=this.predation?this.fish.find(p=>p.kind==='barramundi'&&p.hunt&&this.canEat(p,f)&&p.position.distanceTo(f.position)<.65&&this.spatial.lineOfSight(p.position,f.position)):null;
      if(f.hunt){target=this.fish.find(p=>p.id===f.hunt.target);mode=this.time-f.hunt.seen<.1?'pursuit':'seek';speed=f.cruise*(f.hunt.phase==='strike'?2.5:1.5);}
      else if(threat){this.findRefuge(f,threat);target=threat;mode='evade';speed=f.cruise*2.8;}
      else if(f.kind==='clown'){
        let best=.5;for(const food of this.pellets){const d=f.position.distanceTo(food.position);if(d<best&&this.spatial.lineOfSight(f.position,food.position)){best=d;target=food;mode='food';speed=f.cruise*1.5;}}
      }
      if(!f.hunt&&f.refuge&&this.time<f.refugeUntil){mode='refuge';speed=f.cruise*2;}
      if(mode==='wander'&&(this.time>f.goalAt||f.position.distanceTo(f.goal)<.06))this.chooseGoal(f);
      f.agent.maxSpeed=speed;f.force.set(0,0,0);
      if(mode==='pursuit'&&target){f.pursuit.evader=target.agent;f.pursuit.calculate(f.agent,f.force);}
      else if(mode==='evade'){f.evade.pursuer=target.agent;f.evade.panicDistance=2;f.evade.calculate(f.agent,f.force);}
      else {const g=mode==='food'?target.position:mode==='seek'?f.hunt.lastSeen:mode==='refuge'?f.refuge:f.goal;f.seek.target.copy(g);f.seek.calculate(f.agent,f.force);}
      const force=new Vector3(f.force.x,f.force.y,f.force.z);
      // A selected edible target must not simultaneously repel its pursuer.
      // The prey retains its own evade/separation forces and can still escape.
      for(const other of this.fish){if(other===f||!this.active(other)||f.hunt?.target===other.id)continue;const delta=f.position.clone().sub(other.position),d=delta.length(),r=(f.profile.radiusM+other.profile.radiusM)*2.3;if(d>1e-5&&d<r)force.addScaledVector(delta,(1-d/r)*speed*2/d);}
      force.add(this.spatial.avoidance(f));
      if(this.pointer&&f.position.distanceTo(this.pointer)<.10)force.add(f.position.clone().sub(this.pointer).normalize().multiplyScalar(speed*3));
      force.clampLength(0,speed*4);const velocity=f.velocity.clone().addScaledVector(force,dt).clampLength(0,speed);
      const goalQ=velocity.lengthSq()>1e-8?orientation(velocity):f.quaternion.clone(),q=f.quaternion.clone();
      const angle=q.angleTo(goalQ),rate=f.kind==='clown'?4:1.5;q.slerp(goalQ,Math.min(1,rate*dt/Math.max(.0001,angle)));
      const direction=X.clone().applyQuaternion(q),candidate=f.position.clone().addScaledVector(direction,velocity.length()*dt);
      if(this.inBounds(f,candidate)&&this.spatial.clearMotion(f,f.position,candidate,f.quaternion,q)){
        f.position.copy(candidate);f.velocity.copy(direction).multiplyScalar(velocity.length());f.quaternion.copy(q);f.direction.copy(direction);
      }else{
        this.stats.blocked++;f.velocity.multiplyScalar(.45);f.goalAt=0;
        // Rotate toward a safe waypoint while stationary; every changed pose is checked too.
        if(this.spatial.clearMotion(f,f.position,f.position,f.quaternion,q)){f.quaternion.copy(q);f.direction.copy(direction);}
      }
      const effort=clamp(f.velocity.length()/f.cruise,0,3);f.phase+=dt*(3+effort*3);f.pectoral+=dt*(5+effort*5);
      f.tailAmplitude=.012+.035*effort;f.rowing=.25+.2*effort;f.bend=0;f.behavior=mode;
    }
    for(const pred of this.fish)if(pred.hunt?.phase==='strike'){const prey=this.fish.find(f=>f.id===pred.hunt.target);if(prey)this.capture(pred,prey);}
    for(const food of this.pellets){food.position.y-=.035*dt;for(const f of this.fish){if(f.kind!=='clown'||!this.active(f))continue;if(this.mouth(f).distanceTo(food.position)<Math.max(.006,f.profile.totalLengthM*.15)&&this.spatial.lineOfSight(this.mouth(f),food.position)){food.eaten=true;f.fedUntil=this.time+playRules.PARAMS.FED_S;this.stats.eaten++;break;}}}
    this.pellets=this.pellets.filter(p=>!p.eaten&&this.time-p.born<playRules.PARAMS.PELLET_LIFE_S&&p.position.y>B.minY);
  }
  snapshot(){return {time:this.time,revision:this.revision,predation:this.predation,pellets:this.pellets.length,stats:{...this.stats},fish:this.fish.map(f=>({id:f.id,kind:f.kind,totalLengthM:f.profile.totalLengthM,life:f.life,held:f.held,behavior:f.behavior||'wander',position:f.position.toArray()})),events:this.events.slice(-12)};}
}
