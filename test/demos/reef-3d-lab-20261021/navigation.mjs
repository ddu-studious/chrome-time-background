import {Vector3,Quaternion} from 'three';
import {Graph,NavNode,Edge,AStar,Vector3 as YVector3} from 'yuka';
import {bodyEnvelope} from './fish-envelope.mjs';
const Q=new Quaternion();
export function clearanceRadius(f){return bodyEnvelope(f).rotationRadiusM;}
export class HabitatNavigation{
 constructor(spatial){this.spatial=spatial;this.sites=null;this.version=0;this.cache=new Map();this.searches=0;}
 configure(sites){this.sites=sites;this.cache.clear();this.version++;}
 proxy(f){return {profile:{radiusM:clearanceRadius(f),totalLengthM:0}};}
 clearPoint(f,p){return this.spatial.clearPose(this.proxy(f),p,Q,1.02);}
 clearEdge(f,a,b){const n=Math.max(1,Math.ceil(a.distanceTo(b)/.10));if(n>32)return false;const proxy=this.proxy(f);for(let i=0;i<n;i++)if(!this.spatial.clearMotion(proxy,a.clone().lerp(b,i/n),a.clone().lerp(b,(i+1)/n),Q,Q))return false;return true;}
 graphFor(f){
  const key=Math.ceil(clearanceRadius(f)*200)*5;if(this.cache.has(key))return this.cache.get(key);
  if(!this.sites||!this.spatial.active)return null;
  const s=this.sites,graph=new Graph(),points=[];graph.digraph=false;
  // At most 153 nodes per size class; 5 mm ceiling never admits a larger body.
  const proxy={profile:{radiusM:key/1000,totalLengthM:0}};
  for(let ix=0;ix<=16;ix++)for(let iz=0;iz<=8;iz++){
   const p=new Vector3(-.8+ix*.1,s.y,-.16+iz*.09);
   if(this.spatial.clearPose(proxy,p,Q,1.04)){const index=points.length;points.push(p);graph.addNode(new NavNode(index,new YVector3(p.x,p.y,p.z)));}
  }
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){const d=points[i].distanceTo(points[j]);if(d<.141&&this.clearEdge(proxy,points[i],points[j]))graph.addEdge(new Edge(i,j,d));}
  const result={graph,points};if(this.cache.size>=12)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,result);return result;
 }
 route(f,from,to){
  if(!this.spatial.active||!this.sites)return null;
  if(!this.clearPoint(f,from)||!this.clearPoint(f,to))return null;
  if(this.clearEdge(f,from,to))return [to.clone()];
  const data=this.graphFor(f);if(!data)return null;const {graph,points}=data;
  const attach=p=>points.map((v,i)=>({i,d:v.distanceTo(p)})).filter(x=>x.d<.32).sort((a,b)=>a.d-b.d).slice(0,12).find(x=>this.clearEdge(f,p,points[x.i]))?.i;
  const start=attach(from),end=attach(to);if(start===undefined||end===undefined)return null;
  this.searches++;const search=new AStar(graph,start,end).search();if(!search.found)return null;
  const raw=[from.clone(),...search.getPath().map(i=>points[i].clone()),to.clone()],route=[];let current=0;
  while(current<raw.length-1){let next=current+1;for(let i=raw.length-1;i>current+1;i--)if(this.clearEdge(f,raw[current],raw[i])){next=i;break;}route.push(raw[next]);current=next;}
  return route;
 }
 refuge(f,pred){
  if(!this.sites)return null;let best=null;
  for(const cover of this.sites.cover){if(this.spatial.lineOfSight(pred.position,cover)||this.clearPoint(pred,cover))continue;const path=this.route(f,f.position,cover);if(!path)continue;let length=0,last=f.position;for(const p of path){length+=last.distanceTo(p);last=p;}if(!best||length<best.length)best={path,point:cover.clone(),length};}
  return best;
 }
 searchExit(f,lastSeen){
  if(!this.sites)return null;const candidates=[...this.sites.cover,this.sites.exit,this.sites.entry];
  for(const point of candidates.sort((a,b)=>a.distanceTo(lastSeen)-b.distanceTo(lastSeen))){const path=this.route(f,f.position,point);if(path)return {path,point:point.clone()};}return null;
 }
}
