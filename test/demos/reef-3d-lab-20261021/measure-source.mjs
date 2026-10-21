import { makeFishGeometry } from './upstream/scenes/reefscape/src/fish-model.js';
const out={};
for(const kind of ['clown','chromis','anthias']){
 const g=makeFishGeometry(kind);g.computeBoundingBox();const p=g.getAttribute('position'),part=g.getAttribute('part');let min=Infinity,max=-Infinity;
 for(let i=0;i<p.count;i++)if(part.getX(i)===0){min=Math.min(min,p.getX(i));max=Math.max(max,p.getX(i));}
 out[kind]={min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray(),standardLengthUnits:max-min,totalLengthUnits:g.boundingBox.max.x-g.boundingBox.min.x,depthUnits:g.boundingBox.max.y-g.boundingBox.min.y,widthUnits:g.boundingBox.max.z-g.boundingBox.min.z,vertices:p.count,triangles:g.index?g.index.count/3:p.count/3};g.dispose();
}
console.log(JSON.stringify(out,null,2));
