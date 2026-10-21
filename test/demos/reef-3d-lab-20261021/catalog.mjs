// Distances are metres. Classes are display cohorts, not inferred biological ages.
export const WORLD_LIMITS = Object.freeze({ minX:-0.95,maxX:0.95,minY:-0.28,maxY:0.85,minZ:-0.32,maxZ:0.68 });
export const MAX_FISH = 40;
export const INITIAL_LENGTHS = Object.freeze([0.025,0.032,0.040,0.048,0.060,0.074]);
export const CATALOG = Object.freeze({
  clown:Object.freeze({ scientificName:'Amphiprion percula',name:'真小丑鱼',metric:'TL',diet:'prey',min:0.025,max:0.075,modelTL:1.25,modelSL:0.9800000190734863,depthRatio:0.40,widthRatio:0.12,collisionRadiusRatio:0.38 }),
  barramundi:Object.freeze({ scientificName:'Lates calcarifer',name:'尖吻鲈（行为测试）',metric:'TL',diet:'predator',gape:0.3,min:0.18,max:0.45,depthRatio:0.45,widthRatio:0.23,collisionRadiusRatio:0.32 }),
});
export function profile(id,kind,totalLengthM){
  const spec=CATALOG[kind];if(!spec||!Number.isFinite(totalLengthM)||totalLengthM<spec.min||totalLengthM>spec.max)throw new Error('Invalid physical profile');
  return Object.freeze({id,kind,scientificName:spec.scientificName,totalLengthM,metric:'TL',standardLengthM:kind==='clown'?totalLengthM*spec.modelSL/spec.modelTL:null,
    bodyDepthM:totalLengthM*spec.depthRatio,bodyWidthM:totalLengthM*spec.widthRatio,radiusM:totalLengthM*spec.collisionRadiusRatio,
    sizeClass:kind==='clown'?(totalLengthM<.04?'小体型':totalLengthM<.06?'中体型':'大体型'):(totalLengthM<.3?'较小捕食者':'较大捕食者'),lifeStage:null,ageDays:null,version:1});
}
