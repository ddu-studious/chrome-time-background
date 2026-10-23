import {readFile} from 'node:fs/promises';
import {loadTerrainFixture} from './terrain-fixture.mjs';
import {ReefSpatial} from './spatial.mjs';
import {OceanNavigation,fullReefSites,validateRoadmap} from './full-navigation.mjs';
export async function loadFullReefFixture(offsetY=0){const habitat=await loadTerrainFixture();habitat.group.position.y=offsetY*10;const spatial=new ReefSpatial();spatial.setMeshes(habitat.meshes);spatial.setActive(true);const roadmap=validateRoadmap(JSON.parse(await readFile(new URL('./assets/navigation/full-reef.json',import.meta.url),'utf8'))),nav=new OceanNavigation(spatial);nav.configure(fullReefSites(roadmap,offsetY));return {habitat,spatial,nav,roadmap};}
