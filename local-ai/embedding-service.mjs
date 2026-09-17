export function validateInput(body){
 if(!body||!['query','document'].includes(body.purpose)||!Array.isArray(body.texts)||body.texts.length<1||body.texts.length>20||body.texts.some(t=>typeof t!=='string'||!t.trim()||t.length>2000)||body.texts.reduce((n,t)=>n+t.length,0)>12000)throw new Error('向量输入无效或过长');
 return {texts:body.texts.slice(),purpose:body.purpose};
}
export async function embed(body,provider){return {status:'ready',source:'model',data:await provider.embed(validateInput(body))};}
