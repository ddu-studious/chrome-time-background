const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// A bounded steering target over an existing Yuka A* polyline. It does not move an
// actor or change the final destination. Every shortcut is checked with the same
// complete-body clearance used when building that actor's navigation graph.
export function routeLookAhead(f,route,navigation){
  const length=f.profile.totalLengthM,speed=f.velocity.length(),look=clamp(length*.45+speed*.25,.018,.16),last=route.points.length-1;
  let advanced=0;
  while(route.index<last&&advanced<4){
    const point=route.points[route.index],previous=route.index?route.points[route.index-1]:route.start;
    const tangent=point.clone().sub(previous),distance=f.position.distanceTo(point);
    const passed=tangent.lengthSq()>1e-12&&f.position.clone().sub(point).dot(tangent)>=0;
    if((distance<Math.max(.004,length*.12)||(passed&&distance<look*1.5))&&navigation.clearEdge(f,f.position,route.points[route.index+1])){route.index++;advanced++;}else break;
  }
  const point=route.points[route.index],previous=route.index?route.points[route.index-1]:route.start;
  const segment=point.clone().sub(previous),den=segment.lengthSq();
  const projected=den>1e-12?previous.clone().addScaledVector(segment,clamp(f.position.clone().sub(previous).dot(segment)/den,0,1)):point.clone();
  const along=distance=>{
    let start=projected,remaining=distance;
    for(let index=route.index;index<=Math.min(last,route.index+2);index++){
      const end=route.points[index],span=start.distanceTo(end);
      if(span>=remaining&&span>1e-9)return start.clone().lerp(end,remaining/span);
      remaining-=span;start=end;
    }
    return start.clone();
  };
  let target=point,validated=false;
  for(const factor of [1,.5,.25]){
    const candidate=along(look*factor);
    if(candidate.distanceToSquared(f.position)>1e-8&&navigation.clearEdge(f,f.position,candidate)){target=candidate;validated=true;break;}
  }
  const delta=target.clone().sub(f.position),angle=delta.lengthSq()>1e-12?f.direction.angleTo(delta):0,rate=f.kind==='clown'?4:1.5;
  const nominal=f.cruise*(f.kind==='clown'?2.2:1.7),alignment=Math.max(0,Math.cos(angle));
  let limit=nominal*(.15+.85*alignment);
  // Pure-pursuit curvature estimate: turn before reaching the corner. A true
  // reversal can require a stationary, checked adjustment; ordinary bends do not.
  if(angle>Math.PI*.56)limit=0;
  else if(angle>.05)limit=Math.min(limit,rate*Math.max(length*.16,delta.length()/(2*Math.sin(angle)))*.8);
  const isFinal=route.index===last&&target.distanceToSquared(point)<1e-10;
  return {target,isFinal,speedLimit:limit,lookDistance:look,validated,advanced};
}

export function routeMadeProgress(route,position,now){
  let remaining=position.distanceTo(route.points[route.index]);
  for(let i=route.index+1;i<route.points.length;i++)remaining+=route.points[i-1].distanceTo(route.points[i]);
  // Distance moved by itself is not progress: an actor circling a waypoint must
  // eventually replan. Measure decreasing remaining polyline distance instead.
  if(route.progressRemaining===undefined||remaining<route.progressRemaining-.006){route.progressRemaining=remaining;route.progressAt=now;return true;}
  return false;
}
