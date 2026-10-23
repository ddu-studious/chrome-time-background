import data from './assets/community/certificates.json' with {type:'json'};
const definitions={
 chromis:['青绿光鳃鱼','Chromis viridis',.03,.075,.055,'school'],
 anthias:['金花鲈','Pseudanthias squamipinnis',.05,.11,.085,'school'],
 tang:['蓝吊',null,.06,.16,.105,'glb'],
 gramma:['皇家伽玛',null,.035,.08,.06,'glb'],
 idol:['镰鱼',null,.07,.16,.11,'glb'],
 butterfly:['蝴蝶鱼',null,.06,.14,.095,'glb'],
 cardinal:['天竺鲷',null,.035,.075,.055,'glb'],
 puffer:['河豚',null,.06,.14,.09,'glb'],
};
export const EXTRA_FISH=Object.freeze(Object.fromEntries(Object.entries(definitions).map(([kind,[name,scientificName,min,max,defaultLength,renderer]])=>{
 const shape=data.models[kind];if(!shape)throw new Error('Missing certified species '+kind);
 return [kind,Object.freeze({kind,name,scientificName,min,max,defaultLength,renderer,metric:'TL',diet:null,feedable:true,depthRatio:shape.depthRatio,widthRatio:shape.widthRatio,collisionRadiusRatio:Math.max(.12,Math.min(.4,shape.depthRatio*.5)),modelTL:shape.length,...{shape:Object.freeze(shape)}})];
})));
export const EXTRA_KINDS=Object.freeze(Object.keys(EXTRA_FISH));
export const GLB_KINDS=Object.freeze(EXTRA_KINDS.filter(k=>EXTRA_FISH[k].renderer==='glb'));
