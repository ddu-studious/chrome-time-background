const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
class Element{constructor(){this.value='';this.nodes={};this.events={};this.children=[];}querySelector(key){return this.nodes[key] ||= new Element();}addEventListener(key,fn){this.events[key]=fn;}removeEventListener(key){delete this.events[key];}append(...items){this.children.push(...items);}replaceChildren(){this.children=[];}}
function fixture(run){let box;const input=new Element();input.value='行锁';const results={before(value){box=value;}};const root={isConnected:true,querySelector:key=>key==='.bm-spotlight-results'?results:null};
 const context={window:{SceneAI:{run}},document:{createElement:()=>new Element()},AbortController};vm.runInNewContext(fs.readFileSync(require.resolve('../js/knowledge-answer.js'),'utf8'),context);
 context.window.KnowledgeAnswer.mount({root,searchInput:input,getCandidates:()=>[{id:'a',title:'资料',url:'https://example.com',summary:'行锁作用于记录'}]});return {box,input,root};}
test('回答及引用作为文本呈现，来源链接使用返回的可核对资料',async()=>{
 const f=fixture(async()=>({answer:'行锁作用于记录。',insufficient:false,citations:[{id:'a',title:'资料',url:'https://example.com',quote:'行锁作用于记录'}]}));
 await f.box.querySelector('[data-ask]').events.click();const rendered=f.box.querySelector('[data-answer]');assert.equal(rendered.children[0].textContent,'行锁作用于记录。');assert.equal(rendered.children[1].children[0].href,'https://example.com');
});
test('搜索变化后迟到答案不覆盖当前页面',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>{resolve=r;}));const pending=f.box.querySelector('[data-ask]').events.click();f.input.value='新查询';f.input.events.input();resolve({answer:'旧答案',insufficient:false,citations:[]});await pending;assert.equal(f.box.querySelector('[data-answer]').children.length,0);
});
