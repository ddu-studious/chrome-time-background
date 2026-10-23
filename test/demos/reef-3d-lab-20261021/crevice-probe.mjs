import {Vector3} from 'three';
import {createCreviceHabitat} from './habitat.mjs';
import {ReefSpatial} from './spatial.mjs';
import {HabitatNavigation} from './navigation.mjs';
import {OceanWorld} from './world.mjs';
export function fixture(length=.25){
 const habitat=createCreviceHabitat();habitat.group.position.y=.4;const spatial=new ReefSpatial();spatial.setMeshes(habitat.meshes.map(mesh=>({mesh})));spatial.setActive(true);const nav=new HabitatNavigation(spatial);nav.configure(habitat.sites());
 const world=new OceanWorld({empty:true,spatial});world.navigation=nav;
 const prey=world.add('clown',.04,{id:'shelter-fish',position:new Vector3(0,.04,.55)}),predator=world.add('barramundi',length,{id:'hunter',position:new Vector3(-.65,.04,.5)});
 prey.goal.copy(prey.position);prey.goalAt=100;predator.nextHunt=0;world.setPredation(true);return {world,nav,spatial,habitat,prey,predator};
}
