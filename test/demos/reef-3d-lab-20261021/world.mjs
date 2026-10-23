import { Vector3,Quaternion,Matrix4 } from 'three';
import { Vehicle,Vector3 as YVector3,SeekBehavior,ArriveBehavior,PursuitBehavior,EvadeBehavior } from 'yuka';
import rules from '../../../js/aquarium-predation-core.js';
import playRules from '../../../js/aquarium-play-core.js';
import { CATALOG,INITIAL_LENGTHS,WORLD_LIMITS,MAX_FISH,profile } from './catalog.mjs';
import {advanceFishMotion} from './fish-motion.mjs';
import {routeLookAhead,routeMadeProgress} from './route-following.mjs';
import {bodyEnvelope} from './fish-envelope.mjs';
import {proposeClownTurn} from './turning.mjs';

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
    this.realisticMotion=true;this.navigation=null;this.random=rules.seededRandom(seed);this.spatial=spatial;this.fish=[];this.pellets=[];this.time=0;this.revision=0;this.nextId=1;this.nextFoodId=1;
    this.lastFeed=-Infinity;this.lastCapture=-Infinity;this.predation=false;this.events=[];this.captureIds=new Set();this.pointer=null;
    this.stats={feeds:0,eaten:0,hunts:0,captures:0,escapes:0,blocked:0,refills:0,routeRetries:0,routeAbandons:0,movingTurns:0};
    if(!empty)INITIAL_LENGTHS.forEach((length,i)=>this.add('clown',length,{id:`clown-${i+1}`,position:new Vector3(-.63+i*.24,.25+(i%3)*.12,.24+(i%2)*.13)}));
  }
  startDrill(sites){
    const nav=this.navigation;Object.assign(this,new OceanWorld({empty:true,spatial:this.spatial}));this.navigation=nav;
    const prey=this.add('clown',.04,{id:'shelter-fish',position:new Vector3(0,sites.y,.55)}),predator=this.add('barramundi',.25,{id:'hunter',position:new Vector3(-.65,sites.y,.5)});
    prey.goal.copy(prey.position);prey.goalAt=100;predator.nextHunt=0;this.setPredation(true);
  }
  startFullDrill(scenario,preyLength=.04,predatorLength=.25){
    const nav=this.navigation;if(!nav?.isFull)throw new Error('完整浅礁导航尚未就绪');
    const origin=new Vector3(0,nav.sites.y,0),a=new Vector3(...scenario.prey).add(origin),b=new Vector3(...scenario.predator).add(origin);
    if(!nav.clearPoint({profile:profile('prey','clown',preyLength)},a)||!nav.clearPoint({profile:profile('predator','barramundi',predatorLength)},b))throw new Error('当前体型在选定起点净空不足，未改变居民');
    Object.assign(this,new OceanWorld({empty:true,spatial:this.spatial}));this.navigation=nav;
    const prey=this.add('clown',preyLength,{id:'shelter-fish',position:a}),predator=this.add('barramundi',predatorLength,{id:'hunter',position:b});
    predator.direction.copy(a).sub(b).normalize();predator.quaternion.copy(orientation(predator.direction));predator.velocity.copy(predator.direction).multiplyScalar(predator.cruise);
    prey.goal.copy(prey.position);prey.goalAt=100;predator.nextHunt=0;this.setPredation(true);this.emit('scenario',{region:scenario.id,preyLength,predatorLength,eligible:this.canEat(predator,prey)});
  }
  emit(type,detail={}){this.events.push({type,time:this.time,...detail});if(this.events.length>80)this.events.shift();}
  add(kind='clown',length=null,{id=null,position=null}={}){
    if(this.fish.length>=MAX_FISH)return null;
    if(kind==='barramundi'&&this.fish.some(f=>f.kind===kind))return null;
    if(!Object.hasOwn(CATALOG,kind))throw new Error('Unknown resident species');
    if(length===null)length=kind==='clown'?(.025+this.random()*.05):kind==='barramundi'?.45:CATALOG[kind].min+this.random()*(CATALOG[kind].max-CATALOG[kind].min);
    const tag=id||`${kind}-added-${this.nextId++}`;if(this.fish.some(f=>f.id===tag))return null;
    const p=profile(tag,kind,length),v=kind!=='barramundi'?.035+length*.55:.11+length*.22;
    const pos=position?.clone()||new Vector3(kind!=='barramundi'?-.7+this.random()*1.4:-.75,.35+this.random()*.25,kind!=='barramundi'?.3:-.08);
    const f={id:tag,kind,profile:p,position:pos,velocity:new Vector3(v,0,0),direction:X.clone(),quaternion:new Quaternion(),turnVelocity:new Vector3(),cruise:v,
      goal:pos.clone(),home:pos.clone(),goalAt:0,held:false,absentUntil:0,phase:this.random()*Math.PI*2,life:'alive',nextHunt:this.time+5,
      hunt:null,hunger:.6,restUntil:0,fedUntil:0,agent:new Vehicle(),force:new YVector3(),seek:new SeekBehavior(),arrive:new ArriveBehavior(undefined,.18,.008),route:null,hideUntil:0,refugeCooldown:0,pursuit:new PursuitBehavior(),evade:new EvadeBehavior(),
      tailAmplitude:.025,pectoral:0,rowing:.5,bend:0};
    f.agent.maxSpeed=v;f.agent.maxForce=v*3;if(!this.findLegal(f))return null;this.fish.push(f);this.revision++;return f;
  }
  remove(id){const i=this.fish.findIndex(f=>f.id===id);if(i<0)return false;this.fish.splice(i,1);this.captureIds.delete(id);this.revision++;for(const f of this.fish)if(f.hunt?.target===id)this.endHunt(f,'removed');this.emit('removed',{id});return true;}
  active(f){return f.life==='alive'&&!f.held;}
  findLegal(f){
    const legal=p=>this.spatial.clearPose(f,p,f.quaternion)&&this.inBounds(f,p)&&(!this.navigation?.isFull||this.navigation.clearPoint(f,p));
    if(legal(f.position))return true;
    for(let i=0;i<48;i++){
      const p=new Vector3(-.8+this.random()*1.6,.25+this.random()*.5,-.16+this.random()*.65);
      if(legal(p)){f.position.copy(p);f.goal.copy(p);return true;}
    }
    if(this.navigation?.isFull){const point=this.navigation.graphFor(f)?.points.find(p=>legal(p));if(point){f.position.copy(point);f.goal.copy(point);return true;}}
    return false;
  }
  inBounds(f,p){if(this.navigation?.isFull)return this.navigation.contains(f,p);const r=bodyEnvelope(f).radiusM;return p.x>=B.minX+r&&p.x<=B.maxX-r&&p.y>=Math.min(B.minY,this.navigation?.sites?this.navigation.sites.y-.35:B.minY)+r&&p.y<=B.maxY-r&&p.z>=B.minZ+r&&p.z<=B.maxZ-r;}
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
  setHeld(id,value){const f=this.fish.find(f=>f.id===id);if(!f||f.life!=='alive')return false;if(f.held!==(value===true))this.revision++;f.held=value===true;if(value){f.route=null;f.hideUntil=0;f.velocity.set(0,0,0);f.turnVelocity.set(0,0,0);if(f.hunt)this.endHunt(f,'held');for(const p of this.fish)if(p.hunt?.target===id)this.endHunt(p,'held');}return true;}
  endHunt(f,reason){if(f.hunt){this.stats.escapes++;this.emit('escape',{predator:f.id,target:f.hunt.target,reason});}f.hunt=null;f.route=null;f.restUntil=this.time+rules.PARAMS.REST_MIN_S+this.random()*(rules.PARAMS.REST_MAX_S-rules.PARAMS.REST_MIN_S);}
  capture(pred,prey){
    if(!this.predation||!this.canEat(pred,prey)||this.captureIds.has(prey.id)||this.time-this.lastCapture<rules.PARAMS.KILL_GAP_S)return false;
    const mouth=this.mouth(pred),reach=pred.profile.totalLengthM*.055+prey.profile.bodyDepthM*.35;
    if(mouth.distanceTo(prey.position)>reach||!this.spatial.lineOfSight(mouth,prey.position))return false;
    this.captureIds.add(prey.id);prey.life='absent';prey.absentUntil=this.time+rules.PARAMS.REFILL_SCHOOL_S;prey.velocity.set(0,0,0);
    pred.hunt=null;pred.hunger=.12;pred.restUntil=this.time+10;this.lastCapture=this.time;this.revision++;this.stats.captures++;
    this.emit('capture',{predator:pred.id,prey:prey.id});return true;
  }
  chooseGoal(f){
    if(this.navigation?.isFull){const roam=this.navigation.wander(f,this.random);if(roam){f.goal.copy(roam.target);this.setRoute(f,roam.path,'roam');}else{f.goal.copy(f.position);f.routeBlockedUntil=this.time+1.5;}f.goalAt=this.time+3+this.random()*3;return;}
    for(let i=0;i<12;i++){
      const p=new Vector3(-.8+this.random()*1.6,.12+this.random()*.58,-.2+this.random()*.72);
      if(this.inBounds(f,p)&&this.spatial.clearPose(f,p,f.quaternion)){f.goal.copy(p);break;}
    }
    f.goalAt=this.time+4+this.random()*5;
  }
  setRoute(f,points,kind,retries=0){if(!points?.length||points.length>128)return false;f.route={points:points.map(p=>p.clone()),start:f.position.clone(),index:0,kind,version:this.navigation?.version,retries,progressPoint:f.position.clone(),progressAt:this.time,started:this.time};this.emit('route',{id:f.id,kind,points:points.map(p=>p.toArray())});return true;}
  clearRoutes(){for(const f of this.fish){f.route=null;f.routeAim=null;f.routeBlockedUntil=0;f.turnRecoveryUntil=0;f.refuge=null;f.refugeExit=null;f.hideUntil=0;f.goalAt=0;}}
  findRefuge(f,threat){
    if(this.time<(f.refugeCooldown||0)||this.time<(f.refugeCheckAt||0))return;
    f.refugeCheckAt=this.time+.8;
    const shelter=this.navigation?.refuge(f,threat);
    if(shelter){f.refugeExit=shelter.exit||this.navigation.sites.entry.clone();f.refuge=shelter.point;this.setRoute(f,shelter.path,'shelter');this.emit('refuge',{id:f.id,nodeId:shelter.nodeId,clearance:shelter.clearance,point:shelter.point.toArray()});return;}
    if(!this.spatial.active||this.navigation?.isFull)return;
    // The legacy scene retains bounded local cover search if no authored navigation habitat is active.
    for(let i=0;i<12;i++){
      const angle=i*Math.PI/6,p=f.position.clone().add(new Vector3(Math.cos(angle)*.18,(i%3-1)*.06,Math.sin(angle)*.18));
      if(this.inBounds(f,p)&&this.spatial.clearPose(f,p,f.quaternion)&&!this.spatial.lineOfSight(threat.position,p)&&this.spatial.clearMotion(f,f.position,p,f.quaternion,f.quaternion)){
        f.refuge=p;f.refugeUntil=this.time+2;this.emit('refuge',{id:f.id});return;
      }
    }
  }
  routeTarget(f){
    const route=f.route;if(!route)return null;
    if(route.version!==this.navigation?.version){f.route=null;return null;}
    const last=route.points.length-1;
    if(this.navigation?.isFull){
      routeMadeProgress(route,f.position,this.time);
      if(this.time-route.progressAt>2.5){
        const goal=route.points[last],retry=route.retries+1;
        if(retry<=2){this.stats.routeRetries++;const path=this.navigation.route(f,f.position,goal);if(path){this.setRoute(f,path,route.kind,retry);return this.routeTarget(f);}}
        this.stats.routeAbandons++;f.route=null;f.routeAim=null;f.refugeCooldown=this.time+2;f.refugeCheckAt=this.time+2;f.goalAt=this.time+2;f.routeBlockedUntil=this.time+2;
        if(route.kind==='search')this.endHunt(f,'route-stalled');else if(route.kind==='shelter'){f.refuge=null;f.refugeExit=null;}
        this.emit('route-abandoned',{id:f.id,kind:route.kind,retries:retry});return null;
      }
      f.routeAim=routeLookAhead(f,route,this.navigation);
    }else f.routeAim=null;
    const waypointRadius=this.navigation?.isFull?Math.min(.006,f.profile.totalLengthM*.08):Math.max(.025,f.profile.totalLengthM*.12);
    while(!this.navigation?.isFull&&route.index<last&&f.position.distanceTo(route.points[route.index])<waypointRadius)route.index++;
    const target=route.points[route.index];
    if(route.index===last&&f.position.distanceTo(target)<(this.navigation?.isFull?.008:.025)){
      f.route=null;f.routeAim=null;
      if(route.kind==='shelter'){f.hideUntil=this.time+3.5+this.random()*2;this.emit('hidden',{id:f.id});}
      else if(route.kind==='emerge'){f.refuge=null;f.refugeCooldown=this.time+4;this.emit('emerged',{id:f.id});}
      else if(route.kind==='search'){if(f.hunt)f.hunt.waitUntil=this.time+1.6;this.emit('searched-exit',{id:f.id});}
      else if(route.kind==='roam'){f.goal.copy(f.position);f.goalAt=this.time+.15;f.routeBlockedUntil=this.time+.15;}
      return null;
    }
    return f.routeAim?.target||target;
  }
  updateHunt(f,dt){
    if(!this.predation||f.kind!=='barramundi'||!this.active(f))return;
    f.hunger=Math.min(1,f.hunger+.008*dt);
    if(f.hunt){
      const prey=this.fish.find(p=>p.id===f.hunt.target);
      if(!this.canEat(f,prey)||this.time-f.hunt.start>rules.PARAMS.HUNT_MAX_S){this.endHunt(f,'ineligible-or-timeout');return;}
      if(f.hunt.waitUntil&&this.time>f.hunt.waitUntil){this.endHunt(f,'refuge-inaccessible');return;}
      const visible=this.spatial.lineOfSight(this.mouth(f),prey.position);f.hunt.visible=visible;
      if(visible){f.hunt.lastSeen.copy(prey.position);f.hunt.seen=this.time;if(f.route?.kind==='search'&&this.navigation?.clearEdge(f,f.position,prey.position))f.route=null;}
      else if(this.time-f.hunt.seen>(this.navigation?.sites?8:1.4)){this.endHunt(f,'lost');return;}
      if(this.navigation?.sites&&!f.route&&!f.hunt.waitUntil&&this.time>=(f.hunt.searchAfter||0)&&(!visible||!this.navigation.clearEdge(f,f.position,f.hunt.lastSeen))){
        f.hunt.phase='hunt';f.hunt.searchAfter=this.time+1;
        const search=this.navigation.searchExit(f,f.hunt.lastSeen);if(search)this.setRoute(f,search.path,'search');
      }
      const toPrey=f.hunt.lastSeen.clone().sub(this.mouth(f));
      if(visible&&!f.route&&f.hunt.phase==='hunt'&&toPrey.length()<f.profile.totalLengthM*.65&&f.direction.angleTo(toPrey)<=rules.PARAMS.STRIKE_CONE){f.hunt.phase='strike';f.hunt.strikeEnd=this.time+rules.PARAMS.STRIKE_S;}
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
    if(target){f.route=null;f.routeAim=null;f.hunt={target:target.id,start:this.time,phase:'hunt',visible:true,seen:this.time,lastSeen:target.position.clone()};this.stats.hunts++;this.emit('hunt',{predator:f.id,target:target.id});}
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
      const previousDirection=f.direction.clone(),previousSpeed=f.velocity.length();
      let mode='wander',target=null,speed=f.cruise;
      const threat=this.predation?this.fish.find(p=>p.kind==='barramundi'&&p.hunt&&this.canEat(p,f)&&p.position.distanceTo(f.position)<(this.navigation?.sites?.95:.65)&&this.spatial.lineOfSight(p.position,f.position)):null;
      if(f.hunt){target=this.fish.find(p=>p.id===f.hunt.target);mode=f.hunt.visible?'pursuit':'seek';speed=f.cruise*(f.hunt.phase==='strike'?2.5:1.5);}
      else if(threat){if(f.route?.kind==='roam'){f.route=null;f.routeAim=null;}if(!f.route&&f.hideUntil<=this.time)this.findRefuge(f,threat);target=threat;mode='evade';speed=f.cruise*2.8;}
      else if(f.kind==='clown'||CATALOG[f.kind].feedable){
        let best=.5;for(const food of this.pellets){const d=f.position.distanceTo(food.position);if(d<best&&this.spatial.lineOfSight(f.position,food.position)){best=d;target=food;mode='food';speed=f.cruise*1.5;}}
      }
      if(f.hideUntil>0&&this.time>=f.hideUntil&&!f.route){
        if(threat){f.hideUntil=this.time+1;}else{const path=this.navigation?.route(f,f.position,(f.refugeExit||this.navigation.sites.entry));if(path)this.setRoute(f,path,'emerge');f.hideUntil=0;}
      }
      if(mode==='wander'&&!f.route&&!f.hunt&&f.hideUntil<=this.time&&!(f.refuge&&this.time<f.refugeUntil)&&this.time>=(f.routeBlockedUntil||0)&&(this.time>f.goalAt||(!this.navigation?.isFull&&f.position.distanceTo(f.goal)<.06)))this.chooseGoal(f);
      const routeTarget=this.routeTarget(f);
      // A bounded search-route recovery can end the hunt. Re-evaluate the mode
      // immediately instead of consuming the cancelled hunt's lastSeen target.
      if(!f.hunt&&(mode==='pursuit'||mode==='seek')){mode='wander';target=null;speed=f.cruise;}
      if(mode==='wander'&&!f.route&&this.time<(f.routeBlockedUntil||0)){mode='route-rest';speed=0;}
      if(f.hideUntil>this.time){mode='hiding';speed=0;}
      else if(f.hunt?.waitUntil){mode='searching';speed=0;}
      else if(routeTarget){mode=f.route.kind==='search'?'search-route':f.route.kind==='emerge'?'emerging':f.route.kind==='roam'?'roaming':'shelter-route';target={position:routeTarget};const delta=routeTarget.clone().sub(f.position);speed=f.routeAim?f.routeAim.speedLimit:Math.min(f.cruise*(f.kind==='clown'?2.2:1.7),Math.max(.015,delta.length()*2.5))*Math.max(.12,Math.cos(f.direction.angleTo(delta)));}
      if(!f.route&&!f.hunt&&f.hideUntil<=this.time&&f.refuge&&this.time<f.refugeUntil){mode='refuge';speed=f.cruise*2;}
      f.agent.maxSpeed=speed;f.force.set(0,0,0);
      if(mode==='pursuit'&&target){f.pursuit.evader=target.agent;f.pursuit.calculate(f.agent,f.force);}
      else if(mode==='evade'){f.evade.pursuer=target.agent;f.evade.panicDistance=2;f.evade.calculate(f.agent,f.force);}
      else if(mode==='hiding'||mode==='searching'||mode==='route-rest'){f.force.set(-f.velocity.x*6,-f.velocity.y*6,-f.velocity.z*6);}
      else if(routeTarget&&f.routeAim&&!f.routeAim.isFinal){f.seek.target.copy(routeTarget);f.seek.calculate(f.agent,f.force);}
      else if(routeTarget){f.arrive.tolerance=this.navigation?.isFull?.001:.008;f.arrive.target.copy(routeTarget);f.arrive.calculate(f.agent,f.force);}
      else {const g=mode==='food'?target.position:mode==='seek'?f.hunt.lastSeen:mode==='refuge'?f.refuge:f.goal;f.seek.target.copy(g);f.seek.calculate(f.agent,f.force);}
      const force=new Vector3(f.force.x,f.force.y,f.force.z);
      // A selected edible target must not simultaneously repel its pursuer.
      // The prey retains its own evade/separation forces and can still escape.
      for(const other of this.fish){if(other===f||!this.active(other)||f.hunt?.target===other.id||routeTarget)continue;const delta=f.position.clone().sub(other.position),d=delta.length(),r=(f.profile.radiusM+other.profile.radiusM)*2.3;if(d>1e-5&&d<r)force.addScaledVector(delta,(1-d/r)*speed*2/d);}
      if(!routeTarget)force.add(this.spatial.avoidance(f));
      if(this.pointer&&f.position.distanceTo(this.pointer)<.10)force.add(f.position.clone().sub(this.pointer).normalize().multiplyScalar(speed*3));
      force.clampLength(0,speed*4);const velocity=f.velocity.clone().addScaledVector(force,dt).clampLength(0,speed);
      const intendedSpeed=routeTarget&&f.routeAim?previousSpeed+clamp(velocity.length()-previousSpeed,-f.cruise*4*dt,f.cruise*3*dt):velocity.length();
      const goalQ=routeTarget?orientation(routeTarget.clone().sub(f.position)):velocity.lengthSq()>1e-8?orientation(velocity):f.quaternion.clone(),q=f.quaternion.clone();
      const turning=f.kind!=='barramundi'?proposeClownTurn(f.quaternion,f.turnVelocity,goalQ,dt,{incremental:!routeTarget}):null;
      if(turning)q.copy(turning.quaternion);else{const angle=q.angleTo(goalQ);q.slerp(goalQ,Math.min(1,1.5*dt/Math.max(.0001,angle)));}
      const direction=X.clone().applyQuaternion(q);let accepted=null;
      // Try at most three advancing poses; otherwise a checked in-place adjustment.
      for(const fraction of routeTarget?[1,.5,.25]:[1]){
        const candidate=f.position.clone().addScaledVector(direction,intendedSpeed*dt*fraction);
        if(this.inBounds(f,candidate)&&(!this.navigation?.isFull||this.navigation.clearPoint(f,candidate))&&this.spatial.clearMotion(f,f.position,candidate,f.quaternion,q)){accepted={candidate,speed:intendedSpeed*fraction};break;}
      }
      if(accepted){
        f.position.copy(accepted.candidate);f.velocity.copy(direction).multiplyScalar(accepted.speed);f.quaternion.copy(q);f.direction.copy(direction);
        if(turning)f.turnVelocity.copy(turning.angularVelocity);
        if(routeTarget&&previousDirection.angleTo(direction)>.002&&accepted.speed>.005)this.stats.movingTurns++;
      }else{
        this.stats.blocked++;f.velocity.set(0,0,0);
        // Allow a bounded turn toward one recovery goal. Re-randomizing it on
        // every blocked boundary frame fights the new continuous turn dynamics.
        if(!this.navigation?.isFull){
          if(f.kind==='barramundi')f.goalAt=0;
          else if(this.time>=(f.turnRecoveryUntil||0)){f.goalAt=0;f.turnRecoveryUntil=this.time+1.2;}
        }
        if(this.spatial.clearMotion(f,f.position,f.position,f.quaternion,q)){f.quaternion.copy(q);f.direction.copy(direction);if(turning)f.turnVelocity.copy(turning.angularVelocity);}else f.turnVelocity.set(0,0,0);
      }
      if(this.realisticMotion===true&&f.kind!=='barramundi'){
        const turn=Math.atan2(previousDirection.z*f.direction.x-previousDirection.x*f.direction.z,previousDirection.x*f.direction.x+previousDirection.z*f.direction.z)/dt;
        advanceFishMotion(f,dt,{speedBL:f.velocity.length()/f.profile.totalLengthM,turnRate:turn,accelerationBL:(f.velocity.length()-previousSpeed)/dt/f.profile.totalLengthM,behavior:mode});
      }else{const effort=clamp(f.velocity.length()/f.cruise,0,3);f.phase+=dt*(3+effort*3);f.pectoral+=dt*(5+effort*5);f.tailAmplitude=.012+.035*effort;f.rowing=.25+.2*effort;f.bend=0;}
      f.behavior=mode;
    }
    for(const pred of this.fish)if(pred.hunt?.phase==='strike'){const prey=this.fish.find(f=>f.id===pred.hunt.target);if(prey)this.capture(pred,prey);}
    for(const food of this.pellets){food.position.y-=.035*dt;for(const f of this.fish){if((f.kind!=='clown'&&!CATALOG[f.kind].feedable)||!this.active(f))continue;if(this.mouth(f).distanceTo(food.position)<Math.max(.006,f.profile.totalLengthM*.15)&&this.spatial.lineOfSight(this.mouth(f),food.position)){food.eaten=true;f.fedUntil=this.time+playRules.PARAMS.FED_S;this.stats.eaten++;break;}}}
    this.pellets=this.pellets.filter(p=>!p.eaten&&this.time-p.born<playRules.PARAMS.PELLET_LIFE_S&&p.position.y>B.minY);
  }
  snapshot(){return {time:this.time,revision:this.revision,predation:this.predation,pellets:this.pellets.length,stats:{...this.stats},fish:this.fish.map(f=>({id:f.id,kind:f.kind,totalLengthM:f.profile.totalLengthM,life:f.life,held:f.held,behavior:f.behavior||'wander',position:f.position.toArray()})),events:this.events.slice(-12)};}
}
