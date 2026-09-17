(function(root){
  'use strict';
  const normalize = text => String(text || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g,' ').replace(/^[《“"]|[》”"]$/g,'');
  const exact = (a,b) => Boolean(normalize(a)) && normalize(a) === normalize(b);
  const artistNames = song => (song.ar || song.artists || []).flatMap(a => [a.name,...(a.alias || [])]);
  function unique(items) { const ids=new Set();return (items || []).filter(x=>/^\d+$/.test(String(x.id))&&!ids.has(String(x.id))&&ids.add(String(x.id))); }
  function artists(items, query) { return unique(items).map((item,i)=>({item,i,score:exact(item.name,query)|| (item.alias||[]).some(a=>exact(a,query))?100:0})).sort((a,b)=>b.score-a.score||a.i-b.i).map(x=>x.item); }
  function songs(items, {query='',title='',artist=''}={}) {
    return unique(items).map((item,i)=>{
      const names=artistNames(item),name=normalize(item.name),wanted=normalize(title||query);
      let score=exact(item.name,title||query)?120:name.includes(wanted)&&wanted?35:0;
      if(artist)score+=names.some(a=>exact(a,artist))?80:-80;
      else if(names.some(a=>exact(a,query)))score+=50;
      return {item,i,score};
    }).sort((a,b)=>b.score-a.score||a.i-b.i).map(x=>x.item);
  }
  const api={normalize,exact,unique,artists,songs};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.MusicSearch=api;
})(typeof globalThis==='object'?globalThis:this);
