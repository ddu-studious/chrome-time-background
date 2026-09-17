import test from 'node:test';import assert from 'node:assert/strict';import {createGateway} from '../local-ai/gateway.mjs';
const input={query:'打开写Java用的工作区',groups:[{id:'java',name:'Java 开发',entries:'文档、接口管理'}]};
test('工作区模型只能选择已有分组并引用匹配依据',async()=>{
 let raw={groupId:'java',reason:'匹配 Java 开发',quote:'Java 开发'};const gateway=createGateway({provider:{async generateObject(){return raw;}}});
 assert.equal((await gateway.run('workspace.match',input)).data.groupId,'java');
 raw={groupId:'invented',reason:'虚构',quote:'Java'};await assert.rejects(gateway.run('workspace.match',input),/依据无效/);
 raw={groupId:'java',reason:'匹配',quote:'不存在'};await assert.rejects(gateway.run('workspace.match',input),/依据无效/);
});
