import {Vector3,Quaternion} from 'three';
import {Graph,NavNode,Edge,AStar,Vector3 as YVector3} from 'yuka';
import {HabitatNavigation,clearanceRadius} from './navigation.mjs';
import {bodyEnvelope} from './fish-envelope.mjs';
import {groundHeight} from './upstream/scenes/reefscape/src/math.js';
const Q=new Quaternion(),pointKey=p=>`${p.x},${p.y},${p.z}`;
export function validateRoadmap(data){
 if(data?.version!==1||!Array.isArray(data.nodes)||data.nodes.length>8192||!Array.isArray(data.edges)||data.edges.length>40000)throw new Error('Invalid full-reef roadmap budget/version');
 for(const row of data.nodes)if(!Array.isArray(row)||row.length!==4||row.some(v=>!Number.isFinite(v))||row.slice(0,3).some(v=>Math.abs(v)>2)||row[3]<0||row[3]>.5)throw new Error('Invalid roadmap node');
 for(const e of data.edges)if(!Array.isArray(e)||e.length!==4||!Number.isInteger(e[0])||!Number.isInteger(e[1])||e[0]<0||e[1]<0||e[0]>=data.nodes.length||e[1]>=data.nodes.length||!Number.isFinite(e[2])||e[2]<0||e[2]>.5||!Number.isFinite(e[3])||e[3]<=0||e[3]>1)throw new Error('Invalid roadmap edge');
 return data;
}
export function fullReefSites(data,offsetY){return {kind:'full',roadmap:data,y:offsetY,entry:new Vector3(0,offsetY+.18,.35),exit:new Vector3(0,offsetY+.18,-.25),cover:[]};}
export class OceanNavigation extends HabitatNavigation{
 configure(sites){super.configure(sites);this.isFull=sites?.kind==='full';this.pointClearances=new Map();if(this.isFull)for(const n of sites.roadmap.nodes)this.pointClearances.set(pointKey(new Vector3(n[0],n[1]+sites.y,n[2])),n[3]);this.searches=0;this.lastReason='';this.lastPlanMs=0;this.maxPlanMs=0;this.failedPlans=0;}
 local(p){return p.clone().sub(new Vector3(0,this.sites.y,0));}
 contains(f,p){if(!this.isFull)return true;const r=bodyEnvelope(f).radiusM,q=this.local(p);return q.x>=-.965+r&&q.x<=.965-r&&q.z>=-.41+r&&q.z<=.61-r&&q.y>=groundHeight(q.x*10,q.z*10)*.1+r&&q.y<=1.6-r;}
 clearPoint(f,p){if(!this.isFull)return super.clearPoint(f,p);const proxy=this.proxy(f);if(!this.contains(proxy,p))return false;const measured=this.pointClearances.get(pointKey(p));if(measured!==undefined)return measured>=proxy.profile.radiusM*1.08+.0002;const key=proxy.profile.radiusM+'|'+pointKey(p);if(this.planPointCache?.has(key))return this.planPointCache.get(key);const clear=this.spatial.clearPose({profile:{totalLengthM:0,radiusM:proxy.profile.radiusM*1.08+.0002}},p,Q);if(this.planPointCache?.size<1024)this.planPointCache.set(key,clear);return clear;}
 clearEdge(f,a,b){if(!this.isFull)return super.clearEdge(f,a,b);return this.clearPoint(f,a)&&this.clearPoint(f,b)&&this.spatial.lineOfSight(a,b)&&this.spatial.clearCorridor(a,b,clearanceRadius(f)*1.08+.0002);}
 graphFor(f){
  if(!this.isFull)return super.graphFor(f);
  if(!this.sites||!this.spatial.active)return null;
  const key=Math.ceil(clearanceRadius(f)*200)*5;if(this.cache.has(key))return this.cache.get(key);
  const {nodes,edges}=this.sites.roadmap,limit=key/1000*1.08+.0002,graph=new Graph(),points=[],clearances=[],sourceIds=[],ids=new Map();graph.digraph=false;
  const proxy={profile:{radiusM:key/1000,totalLengthM:0}};
  nodes.forEach((n,index)=>{const p=new Vector3(n[0],n[1]+this.sites.y,n[2]);if(n[3]>=limit&&this.contains(proxy,p)){const id=points.length;ids.set(index,id);points.push(p);clearances.push(n[3]);sourceIds.push(index);graph.addNode(new NavNode(id,new YVector3(p.x,p.y,p.z)));}});
  for(const [a,b,costRadius,length] of edges){if(costRadius<limit||!ids.has(a)||!ids.has(b))continue;graph.addEdge(new Edge(ids.get(a),ids.get(b),length));}
  const value={graph,points,clearances,sourceIds,key};if(this.cache.size>=12)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,value);return value;
 }
 route(f,from,to){
  if(!this.isFull)return super.route(f,from,to);
  const before=performance.now();this.lastReason='';
  this.planPointCache=new Map();try{return this.findRoute(f,from,to);}finally{this.planPointCache=null;this.lastPlanMs=performance.now()-before;this.maxPlanMs=Math.max(this.maxPlanMs,this.lastPlanMs);}
 }
 reject(reason){this.lastReason=reason;this.failedPlans++;return null;}
 findRoute(f,from,to){
  if(!this.spatial.active||!this.sites)return this.reject('inactive');
  if(!this.clearPoint(f,from)||!this.clearPoint(f,to))return this.reject('body-clearance');
  if(this.clearEdge(f,from,to))return [to.clone()];
  const {graph,points}=this.graphFor(f),n=points.length;
  const attach=p=>{const nearby=points.map((v,i)=>({i,d:v.distanceTo(p)})).filter(x=>x.d<.26).sort((a,b)=>a.d-b.d).slice(0,24),out=[];for(const x of nearby){if(this.clearEdge(f,p,points[x.i]))out.push(x);if(out.length===6)break;}return out;};
  const a=attach(from),b=attach(to);if(!a.length||!b.length)return this.reject('no-attachment');
  const start=new NavNode(n,new YVector3(from.x,from.y,from.z)),end=new NavNode(n+1,new YVector3(to.x,to.y,to.z));graph.addNode(start);graph.addNode(end);
  try{
   for(const p of a)graph.addEdge(new Edge(n,p.i,p.d));for(const p of b)graph.addEdge(new Edge(n+1,p.i,p.d));
   this.searches++;const search=new AStar(graph,n,n+1).search();if(!search.found)return this.reject('disconnected');
   const ids=search.getPath();if(ids.length>128)return this.reject('route-budget');
   const raw=ids.map(id=>id===n?from.clone():id===n+1?to.clone():points[id].clone()),path=[];let at=0;
   while(at<raw.length-1){let next=at+1;for(let i=Math.min(at+16,raw.length-1);i>at+1;i--)if(this.clearEdge(f,raw[at],raw[i])){next=i;break;}if(!this.clearEdge(f,raw[at],raw[next]))return this.reject('live-clearance');path.push(raw[next]);at=next;}
   return path;
  }finally{graph.removeNode(start);graph.removeNode(end);}
 }
 refuge(f,pred){
  if(!this.isFull)return super.refuge(f,pred);
  const data=this.graphFor(f);if(!data)return null;const predatorRadius=clearanceRadius(pred),mouth=pred.position.clone().addScaledVector(pred.direction,pred.profile.totalLengthM*.43);
  const candidates=data.points.map((point,i)=>({point,i,d:point.distanceTo(f.position)})).filter(c=>c.d>.035&&c.d<.8&&data.clearances[c.i]<Math.min(predatorRadius*.95,Math.max(.075,clearanceRadius(f)*1.8))).sort((a,b)=>a.d-b.d).slice(0,192);
  let attempts=0;
  for(const c of candidates){if(this.spatial.lineOfSight(mouth,c.point)||this.clearPoint(pred,c.point))continue;if(attempts++>=6)break;const path=this.route(f,f.position,c.point);if(path)return {path,point:c.point.clone(),exit:f.position.clone(),nodeId:data.sourceIds[c.i],clearance:data.clearances[c.i]};}
  return null;
 }
 searchExit(f,lastSeen){
  if(!this.isFull)return super.searchExit(f,lastSeen);
  const data=this.graphFor(f);if(!data)return null;
  const candidates=data.points.map((point,i)=>({point,i,d:point.distanceTo(lastSeen),travel:point.distanceTo(f.position)})).filter(c=>c.travel>.035&&c.d<.75).sort((a,b)=>(a.d+a.travel*.15)-(b.d+b.travel*.15)).slice(0,28);
  let attempts=0;for(const c of candidates){if(!this.spatial.lineOfSight(c.point,lastSeen))continue;if(attempts++>=5)break;const path=this.route(f,f.position,c.point);if(path)return {path,point:c.point.clone()};}
  return null;
 }
 wander(f,random){
  if(!this.isFull)return null;const data=this.graphFor(f);if(!data?.points.length)return null;
  for(let i=0;i<5;i++){const target=data.points[Math.floor(random()*data.points.length)];const d=target.distanceTo(f.position);if(d<.12||d>1.0)continue;const path=this.route(f,f.position,target);if(path)return {target:target.clone(),path};}return null;
 }
 status(){const groups=[...this.cache.values()];return {kind:!this.sites||!this.spatial.active?'off':this.isFull?'full':'crevice',groups:groups.length,nodes:groups.reduce((n,g)=>n+g.points.length,0),searches:this.searches,lastReason:this.lastReason,maxPlanMs:this.maxPlanMs};}
}
