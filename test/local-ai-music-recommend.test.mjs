import test from 'node:test';import assert from 'node:assert/strict';import {createGateway} from '../local-ai/gateway.mjs';import music from '../js/music-intent.js';
const input={query:'适合专注的纯音乐',candidates:[{name:'专注纯音乐',description:'工作学习时聆听'}]};
test('情绪意图只产生检索词，不允许模型生成歌单地址',()=>{
 assert.deepEqual(music.validate({action:'recommend',query:'专注 纯音乐'}),{action:'recommend',query:'专注 纯音乐'});
 assert.throws(()=>music.validate({action:'recommend',query:'专注',playlistId:1}));
});
test('推荐序号与依据必须来自真实候选',async()=>{
 let raw={recommendations:[{index:1,reason:'标题包含专注纯音乐',quote:'专注纯音乐'}]};const gateway=createGateway({provider:{async generateObject(){return raw;}}});
 assert.equal((await gateway.run('music.recommend',input)).data.recommendations[0].index,1);
 for(const row of [{index:2,reason:'虚构',quote:'专注'},{index:1,reason:'无依据',quote:'保证全部没有人声'}]){raw={recommendations:[row]};await assert.rejects(gateway.run('music.recommend',input),/无法核对/);}
});
