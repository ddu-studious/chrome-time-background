import test from 'node:test';
import assert from 'node:assert/strict';
import {OceanView} from '../view.mjs';
function view(){const value=Object.create(OceanView.prototype);Object.assign(value,{sceneKind:'crevice',reefVisible:false,reefReady:true,world:{},sun:{},renderer:{shadowMap:{}},layoutReef(){},reconcileSceneChange(){},render(){},report(){}});return value;}
test('failed navigation loading preserves the previous scene and visibility',async()=>{
  const v=view();v.loadFullNavigation=async()=>{throw new Error('fixture: navigation unavailable');};
  await assert.rejects(v.setScene('full'),/unavailable/);assert.equal(v.sceneKind,'crevice');assert.equal(v.reefVisible,false);
  v.sceneKind='full';await assert.rejects(v.setReef(true),/unavailable/);assert.equal(v.reefVisible,false);
});
test('a delayed full-scene request cannot overwrite the more recent scene selection',async()=>{
  const v=view();let resolve;v.loadFullNavigation=()=>new Promise(r=>{resolve=r;});
  const pending=v.setScene('full');await v.setScene('crevice');resolve();await pending;
  assert.equal(v.sceneKind,'crevice');
});
test('turning scenery off wins over a delayed pending enable',async()=>{
  const v=view();v.sceneKind='full';let resolve;v.loadFullNavigation=()=>new Promise(r=>{resolve=r;});
  const pending=v.setReef(true);await v.setReef(false);resolve();await pending;
  assert.equal(v.reefVisible,false);assert.equal(v.renderer.shadowMap.enabled,false);
});
