var Yy=Object.create;var xm=Object.defineProperty;var Jy=Object.getOwnPropertyDescriptor;var Ky=Object.getOwnPropertyNames;var Zy=Object.getPrototypeOf,jy=Object.prototype.hasOwnProperty;var Mu=(s,t)=>()=>{try{return t||s((t={exports:{}}).exports,t),t.exports}catch(e){throw t=0,e}};var Qy=(s,t,e,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of Ky(t))!jy.call(s,i)&&i!==e&&xm(s,i,{get:()=>t[i],enumerable:!(n=Jy(t,i))||n.enumerable});return s};var ym=(s,t,e)=>(e=s!=null?Yy(Zy(s)):{},Qy(t||!s||!s.__esModule?xm(e,"default",{value:s,enumerable:!0}):e,s));var Zd=Mu((f2,Uh)=>{(function(s,t){"use strict";let e=t();typeof Uh=="object"&&Uh.exports&&(Uh.exports=e),s&&(s.AquariumCore=e)})(typeof window<"u"?window:typeof self<"u"?self:null,function(){"use strict";let s=Math.PI*2,t=Object.freeze({MAX_ENTRIES:12,MAX_ENTRIES_LOW:6,MAX_FISH:40,MAX_FISH_LOW:16,MAX_LARGE:2,ENTER_S:1.2,LEAVE_S:.35,SCALE_MIN:.75,SCALE_MAX:1.5,SCALE_BASE:820,MARGIN:60,WALL_ACC:240,EDGE_LEN:2,EDGE_MAX:.12,BAND_ACC:140,BAND_SOFT:.1,TURN:2,AGILE_LEN:90,ARC_YAW:2.4,ARC_R:.5,YAW_R:.35,YAW_START:.45,FREE_PITCH:.6,EDGE_STEER:2.5,HOME_NEAR:220,HOME_W:.9,HOME_MIN_S:10,HOME_SPAN_S:10,SEP_R:1.8,ALIGN_R:6,COH_R:9,SEP_W:2.4,ALIGN_W:.8,COH_W:.6,WANDER:.5,WANDER_W:.7,WANDER_RATE:.45,WANDER_PITCH:.3,STEER_FULL:.25,STEER_MIN:.4,FLEE_SPEED:240,FLEE_RADIUS:160,FLEE_IMPULSE:150,FLEE_COOLDOWN_S:.8,FLEE_LEN_CAP:120,FLEE_CAP:2.6,BELL_AVOID:1.3,BELL_PUSH:160,BELL_KEEP:.4,BELL_LEN_CAP:60,Z_MIN:.35,Z_MAX:1,Z_SIZE:.35,Z_SPEED:.3,HIT_SCALE:1.25,HIT_PAD:14,HIT_ALPHA:.5,HOLD_OMEGA:15,HOLD_ZETA:.75,HOLD_MAX_SPEED:3200,HOLD_OFFSET:.8,HOLD_PV_RATE:10,HOLD_STILL:28,HOLD_YAW_GAIN:6,HOLD_YAW_RATE:14,HOLD_YAW_MIN:2.2,HOLD_YAW_MAX:8,HOLD_TURN_R:.45,HOLD_YAW_LARGE:70,HOLD_FACE_MIN:.3,HOLD_FACE_RATE:.5,HOLD_PITCH_MAX:1.15,HOLD_WANDER:.5,HOLD_BEAT_MIN:1.1,HOLD_BEAT_GAIN:.9,HOLD_BEAT_MAX:3.6,THROW_MAX:600,GLIDE_MULT:3.5,GLIDE_RATE:1.6,FLIP_HYST:.3,FLIP_RATE:9,SCOOP_S:.6,SCOOP_PULL:8,SCOOP_FADE_AT:.4,SCOOP_SHRINK:.55,SCOOP_SPREAD:30,TOP_PAD:6,SHORE_GAP:6,LIMIT_EASE:4,BIG_ENTRY:.08,MAX_VACANCIES:8,EAT_S:.3,EAT_SHRINK:.7,REFILL_Y_SPREAD:40,GOAL_W_MAX:3,GOAL_BOOST_MAX:4.6,GOAL_ACCEL_MAX:3,MAX_DT:.05,MIN_DT:1e-4}),e=56,n=Object.freeze([Object.freeze({id:"neon",name:"\u9713\u8679\u706F\u9C7C",kind:"school",group:5,len:16,meters:.04,half:.2,speed:80,band:Object.freeze([.25,.85]),colors:Object.freeze([4,0]),diet:"prey"}),Object.freeze({id:"tang",name:"\u84DD\u540A",kind:"school",group:5,len:22,meters:.2,half:.3,speed:66,band:Object.freeze([.3,.9]),colors:Object.freeze([5,2]),diet:"prey"}),Object.freeze({id:"clown",name:"\u5C0F\u4E11\u9C7C",kind:"solo",group:1,len:30,meters:.11,half:.25,speed:52,band:Object.freeze([.5,.92]),colors:Object.freeze([1,1]),diet:"prey"}),Object.freeze({id:"puffer",name:"\u6CB3\u8C5A",kind:"solo",group:1,len:32,meters:.3,half:.3,speed:34,band:Object.freeze([.35,.8]),colors:Object.freeze([2,4])}),Object.freeze({id:"angel",name:"\u795E\u4ED9\u9C7C",kind:"solo",group:1,len:34,meters:.15,half:.4,speed:40,band:Object.freeze([.3,.8]),colors:Object.freeze([6,5]),diet:"prey"}),Object.freeze({id:"hammer",name:"\u5C0F\u9524\u5934\u9CA8",kind:"solo",group:1,len:140,meters:2.5,half:.3,speed:58,band:Object.freeze([.15,.65]),colors:Object.freeze([5,6]),diet:"predator",gape:.3}),Object.freeze({id:"turtle",name:"\u6D77\u9F9F",kind:"solo",group:1,len:70,meters:1.25,half:.63,top:!0,speed:30,band:Object.freeze([.3,.8]),colors:Object.freeze([3,1])}),Object.freeze({id:"manta",name:"\u8760\u9CBC",kind:"large",group:1,len:258,meters:4.6,half:.52,top:!0,hit:Object.freeze([.55,.45]),speed:52,band:Object.freeze([.1,.6]),colors:Object.freeze([6,7])}),Object.freeze({id:"whaleshark",name:"\u9CB8\u9CA8",kind:"large",group:1,len:504,meters:9,half:.22,hit:Object.freeze([.56,.24]),speed:56,band:Object.freeze([.2,.6]),colors:Object.freeze([5,4])})]),i=Object.freeze(Object.fromEntries(n.map(D=>[D.id,D]))),r=/^[A-Za-z0-9_-]{1,40}$/;function o(D,E,H){return D<E?E:D>H?H:D}function a(D,E,H){return D+(E-D)*H}function c(...D){return D.every(Number.isFinite)}function l(D,E){let H=(E-D)%s;return H>Math.PI&&(H-=s),H<-Math.PI&&(H+=s),H}function h(D){return typeof D=="string"&&Object.prototype.hasOwnProperty.call(i,D)?i[D]:null}let u=D=>D?t.MAX_ENTRIES_LOW:t.MAX_ENTRIES,f=D=>D?t.MAX_FISH_LOW:t.MAX_FISH;function d(D){if(!Array.isArray(D))return 0;let E=0;for(let H of D){let ut=H&&h(H.species);ut&&(E+=ut.group)}return E}function g(D){let E=0;for(let H of D){let ut=H&&h(H.species);ut&&ut.kind==="large"&&E++}return E}function x(D,E,H=!1){let ut=h(E);if(!ut)return{ok:!1,reason:"unknown"};let Q=Array.isArray(D)?D:[];return Q.length>=u(H)?{ok:!1,reason:"full"}:ut.kind==="large"&&g(Q)>=t.MAX_LARGE?{ok:!1,reason:"large"}:d(Q)+ut.group>f(H)?{ok:!1,reason:"render"}:{ok:!0}}function m(D,E=!1){let H=Array.isArray(D)?D:[];return{entries:H.length,maxEntries:u(E),fish:d(H),maxFish:f(E),large:g(H),maxLarge:t.MAX_LARGE,lowPower:!!E}}function p(D,E=!1){if(!Array.isArray(D))return{entries:[],dropped:0};let H=new Set,ut=[];for(let Q of D)!Q||typeof Q!="object"||typeof Q.id!="string"||!r.test(Q.id)||H.has(Q.id)||h(Q.species)&&(typeof Q.addedAt!="number"||!Number.isFinite(Q.addedAt)||Q.addedAt<0||x(ut,Q.species,E).ok&&(H.add(Q.id),ut.push({id:Q.id,species:Q.species,addedAt:Q.addedAt})));return{entries:ut,dropped:D.length-ut.length}}function y(D,E){return o(Math.min(D,E)/t.SCALE_BASE,t.SCALE_MIN,t.SCALE_MAX)}function v({width:D=1280,height:E=720,random:H=Math.random,lowPower:ut=!1}={}){return{width:D,height:E,random:H,lowPower:!!ut,scale:y(D,E),time:0,nextId:1,shoreY:null,fish:[],groups:Object.create(null),vacancies:[],pointer:{x:0,y:0,speed:0,has:!1}}}function _(D,E){let H=Math.cos(D.ang);Number.isFinite(D.flipTo)||(D.flipTo=H<0?-1:1),Number.isFinite(D.flip)||(D.flip=D.flipTo),H<-t.FLIP_HYST?D.flipTo=-1:H>t.FLIP_HYST&&(D.flipTo=1),!(!(E>0)||!Number.isFinite(E))&&(D.flip+=(D.flipTo-D.flip)*Math.min(1,t.FLIP_RATE*E))}function w(D,E){return Math.min(E*t.EDGE_LEN+20,D.width*t.EDGE_MAX)}function T(D,E,H){return Number.isFinite(D.shoreY)?D.shoreY-H*E.half-t.SHORE_GAP*D.scale:null}function R(D,E,H){return H>t.AGILE_LEN*D.scale?H*E.half+t.TOP_PAD*D.scale:null}function L(D,E,H){let ut=D.random(),Q=w(D,H.len*D.scale);E.hx=Q>D.width*.1?a(Q,D.width-Q,ut):D.width*(.1+.8*ut);let yt=D.random(),Bt=H.len*D.scale,At=R(D,H,Bt),F=T(D,H,Bt),P=D.height*H.band[0],$=D.height*H.band[1];if(F!==null&&F<$){let nt=At!==null&&At>P?At:P;E.hy=a(nt,Math.max(nt,F),yt)}else E.hy=At!==null&&At>P?a(At,Math.max(At,$),yt):D.height*a(H.band[0],H.band[1],yt);E.next=D.time+(t.HOME_MIN_S+D.random()*t.HOME_SPAN_S)/o(t.AGILE_LEN/H.len,.25,1)}function S(D,E,H){return E.len*D.scale*(1-t.Z_SIZE+t.Z_SIZE*H)}function M(D,E,H){let ut=E/Math.max(1,D.width),Q=H/Math.max(1,D.height),yt=y(E,H),Bt=yt/D.scale;D.width=E,D.height=H,D.scale=yt;for(let At of D.fish)At.x*=ut,At.y*=Q,At.vx*=Bt,At.vy*=Bt,Number.isFinite(At.sp)&&(At.sp*=Bt),At.len*=Bt;for(let At of Object.keys(D.groups))D.groups[At].next=0}function b(D,E,{instant:H,from:ut}){let Q=h(E.species),yt={hx:0,hy:0,next:0,wp:D.random()};L(D,yt,Q),D.groups[E.id]=yt;let Bt=a(t.Z_MIN,t.Z_MAX,D.random()),At=Math.min(Q.len*D.scale*2.5,D.width*.3),F=Q.len*D.scale>D.width*t.BIG_ENTRY;for(let P=0;P<Q.group;P++){let $=o(Bt+(D.random()-.5)*.2,t.Z_MIN,t.Z_MAX),nt=S(D,Q,$),ct,rt,wt=null;if(H)ct=o(yt.hx+(D.random()-.5)*At,0,D.width),rt=o(yt.hy+(D.random()-.5)*At,0,D.height);else if(F&&ut&&c(ut.x,ut.y)){let Ft=ut.x>D.width/2;ct=Ft?D.width+nt*.3:-nt*.3,rt=yt.hy+(D.random()-.5)*40*D.scale,wt=(Ft?Math.PI:0)+(D.random()-.5)*.5}else ut&&c(ut.x,ut.y)?(ct=ut.x+(D.random()-.5)*24,rt=ut.y+(D.random()-.5)*24):(ct=o(yt.hx+(D.random()-.5)*At,0,D.width),rt=D.height+nt*(F?.35:1));let dt=wt!==null?wt:D.random()*s;wt===null&&!Q.top&&nt>t.AGILE_LEN*D.scale&&(dt=dt<Math.PI?(dt/Math.PI-.5)*.8:Math.PI+((dt-Math.PI)/Math.PI-.5)*.8);let Lt=Q.speed*D.scale;D.fish.push({id:D.nextId++,entry:E.id,species:E.species,x:ct,y:rt,vx:Math.cos(dt)*Lt,vy:Math.sin(dt)*Lt,ang:dt,z:$,len:nt,phase:D.random()*s,seed:D.random(),t:H?t.ENTER_S:0,alpha:H?1:0,state:H?"alive":"entering",held:null,cooldown:0,turn:0,glide:0,flip:Math.cos(dt)<0?-1:1,flipTo:Math.cos(dt)<0?-1:1})}}function A(D,E,H){let ut=h(H),Q=D.groups[E];if(!ut||!Q)return!1;let yt=D.fish.filter(wt=>wt.entry===E&&wt.state!=="leaving"),Bt=yt.length?yt.reduce((wt,dt)=>wt+dt.z,0)/yt.length:a(t.Z_MIN,t.Z_MAX,D.random()),At=o(Bt+(D.random()-.5)*.2,t.Z_MIN,t.Z_MAX),F=S(D,ut,At),P=D.random()<.5,$=P?D.width+F*.3:-F*.3,nt=o(Q.hy+(D.random()-.5)*t.REFILL_Y_SPREAD*D.scale,0,D.height),ct=(P?Math.PI:0)+(D.random()-.5)*.5,rt=ut.speed*D.scale;return D.fish.push({id:D.nextId++,entry:E,species:H,x:$,y:nt,vx:Math.cos(ct)*rt,vy:Math.sin(ct)*rt,ang:ct,z:At,len:F,phase:D.random()*s,seed:D.random(),t:0,alpha:0,state:"entering",held:null,cooldown:0,turn:0,glide:0,flip:Math.cos(ct)<0?-1:1,flipTo:Math.cos(ct)<0?-1:1}),!0}function N(D,E,H,ut){return!E||!D.fish.includes(E)||E.state!=="alive"||!H||!c(H.x,H.y)||!Number.isFinite(ut)||!(ut>0)||D.vacancies.length>=t.MAX_VACANCIES?!1:(E.state="leaving",E.held=null,E.leaveTo={x:H.x,y:H.y},E.scoopT=0,E.leaveS=t.EAT_S,E.eaten=!0,D.vacancies.push({entry:E.entry,species:E.species,due:D.time+ut}),!0)}function C(D){let E=D.vacancies.findIndex(ut=>D.time>=ut.due);if(E<0)return;let H=D.vacancies[E];D.vacancies.splice(E,1),A(D,H.entry,H.species)}function I(D,E,{instant:H=!1,from:ut=null}={}){let Q=Array.isArray(E)?E:[],yt=new Set(Q.map(F=>F.id));for(let F of new Set(D.fish.filter(P=>P.state!=="leaving").map(P=>P.entry)))yt.has(F)||O(D,F);if(D.vacancies.length){for(let F of D.vacancies)yt.has(F.entry)||delete D.groups[F.entry];D.vacancies=D.vacancies.filter(F=>yt.has(F.entry))}let Bt=new Set(D.fish.filter(F=>F.state!=="leaving").map(F=>F.entry));for(let F of D.vacancies)Bt.add(F.entry);let At=D.fish.filter(F=>F.state!=="leaving").length+D.vacancies.length;for(let F of Q){if(Bt.has(F.id))continue;let P=h(F.species);!P||At+P.group>f(D.lowPower)||(b(D,F,{instant:H,from:ut}),At+=P.group)}}function O(D,E,H){let ut=H&&H.to,Q=ut&&typeof ut=="object"&&c(ut.x,ut.y)?ut:null,yt=t.SCOOP_SPREAD*D.scale;for(let Bt of D.fish)Bt.entry!==E||Bt.state==="leaving"||(Bt.state="leaving",Bt.held=null,Q&&(Bt.leaveTo={x:Q.x+(D.random()-.5)*yt,y:Q.y+(D.random()-.5)*yt},Bt.scoopT=0));delete D.groups[E],D.vacancies.length&&(D.vacancies=D.vacancies.filter(Bt=>Bt.entry!==E))}let k=Object.freeze([.6,.35]);function z(D,E,H){if(!c(E,H,D.x,D.y,D.ang))return!1;let ut=Math.cos(D.ang),Q=Math.sin(D.ang),yt=E-D.x,Bt=H-D.y,At=yt*ut+Bt*Q,F=-yt*Q+Bt*ut,P=i[D.species],$=P&&P.hit?P.hit:k,nt=D.len*$[0]*t.HIT_SCALE+t.HIT_PAD,ct=D.len*$[1]*t.HIT_SCALE+t.HIT_PAD;return At/nt*(At/nt)+F/ct*(F/ct)<=1}function et(D){return(D.state==="alive"||D.state==="entering")&&D.alpha>=t.HIT_ALPHA}function j(D,E,H){if(!c(E,H))return null;let ut=null;for(let Q of D.fish)!et(Q)||!z(Q,E,H)||(!ut||Q.z>=ut.z)&&(ut=Q);return ut}function W(D,E,H,ut,Q){if(!E||!D.fish.includes(E)||!et(E)||!z(E,H,ut)||D.fish.some(P=>P.state==="held"))return!1;E.state="held",E.alpha=1;let yt=H-E.x,Bt=ut-E.y,At=Math.cos(E.ang),F=Math.sin(E.ang);return E.held={tail:!!(Q&&Q.tail),gx:(yt*At+Bt*F)*t.HOLD_OFFSET,gy:(-yt*F+Bt*At)*t.HOLD_OFFSET,lastX:H,lastY:ut,pvx:0,pvy:0,aim:E.ang,w:0},!0}function tt(D,E,H){if(!E||!D.fish.includes(E)||E.state!=="held")return;let ut=H!==void 0,Q=ut?H&&c(H.vx,H.vy)?H:{vx:0,vy:0}:{vx:E.vx,vy:E.vy},yt=ut?t.THROW_MAX:Math.min(t.THROW_MAX,J(D,E)*t.GLIDE_MULT),Bt=Math.hypot(Q.vx,Q.vy),At=Bt>yt?yt/Bt:1;E.state="alive",E.held=null,E.vx=Q.vx*At,E.vy=Q.vy*At,E.glide=Math.hypot(E.vx,E.vy)}function at(D){return Array.isArray(D)?D.filter(E=>E&&c(E.x,E.y,E.r)&&E.r>0):[]}let st=Object.freeze([]);function ot(D){if(!Array.isArray(D)||!D.length)return st;let E=[];for(let H of D)!H||!c(H.x,H.y,H.reach,H.weight,H.boost)||H.reach<=0||E.push({x:H.x,y:H.y,reach:H.reach,weight:o(H.weight,0,3),boost:o(H.boost,.5,2.5)});return E}function J(D,E){let H=i[E.species];return H?H.speed*D.scale*(1-t.Z_SPEED+t.Z_SPEED*E.z):0}function it(D,E){let H=Math.cos(D),ut=Math.sin(D);if(Math.atan2(Math.abs(ut),Math.abs(H))<=t.HOLD_PITCH_MAX)return D;let Q=Math.abs(H)>.05?H<0?-1:1:E<0?-1:1;return Math.atan2((ut<0?-1:1)*Math.sin(t.HOLD_PITCH_MAX),Q*Math.cos(t.HOLD_PITCH_MAX))}function ft(D,E){return o(t.AGILE_LEN*D.scale/Math.max(1,E.len),.25,1)}function bt(D,E){let H=i[E.species];return!!H&&!H.top&&ft(D,E)<1}function St(D){D.face!==1&&D.face!==-1&&(D.face=Math.cos(D.ang)<0?-1:1),D.yaw>0&&D.yaw<1||(D.yaw=0),Number.isFinite(D.sp)||(D.sp=Math.hypot(D.vx,D.vy)),Number.isFinite(D.xs)||(D.xs=Math.abs(Math.cos(Math.PI*D.yaw)))}function zt(D,E,H,ut,Q){if(D.yaw===0&&(H===1||H===-1)&&H!==D.face&&(D.yaw=1e-6),D.yaw>0){let yt=D.yaw;D.yaw+=Math.max(ut,Q)/(Math.PI*t.YAW_R*Math.max(1,D.len))*E,yt<.5&&D.yaw>=.5&&(D.face=-D.face,D.ang=l(0,Math.PI-D.ang),D.held&&(D.held.gy=-D.held.gy,D.held.w=-D.held.w)),D.yaw>=1&&(D.yaw=0)}D.xs=Math.abs(Math.cos(Math.PI*D.yaw))}function ue(D,E,H,ut){let Q=E.held,yt=i[E.species],Bt=D.scale,At=Math.min(1,t.HOLD_PV_RATE*H);ut?(Number.isFinite(Q.lastX)&&(Q.pvx+=((ut.x-Q.lastX)/H-Q.pvx)*At,Q.pvy+=((ut.y-Q.lastY)/H-Q.pvy)*At),Q.lastX=ut.x,Q.lastY=ut.y):(Q.lastX=NaN,Q.pvx-=Q.pvx*At,Q.pvy-=Q.pvy*At);let F=t.HOLD_STILL*Bt,P=Math.hypot(Q.pvx,Q.pvy);ut&&P>F?Q.aim=Math.atan2(Q.pvy,Q.pvx)+(Q.tail?Math.PI:0):!ut&&Math.hypot(E.vx,E.vy)>F&&(Q.aim=Math.atan2(E.vy,E.vx));let $=ut?1-o(P/(F*4),0,1):0,nt=Q.aim+Math.sin(D.time*2.9+E.seed*s)*t.HOLD_WANDER*$,ct=bt(D,E);if(ct){St(E);let Dt=Math.cos(nt),Tt=Math.abs(Dt)>t.HOLD_FACE_MIN?Dt<0?-1:1:E.face,xt=o(Math.atan2(Math.sin(nt),Math.abs(Dt)),-t.HOLD_PITCH_MAX,t.HOLD_PITCH_MAX);zt(E,H,Tt,Math.hypot(E.vx,E.vy),t.HOLD_FACE_RATE*Math.PI*t.YAW_R*Math.max(1,E.len)),nt=Math.atan2(Math.sin(xt),E.face*Math.cos(xt))}else yt&&yt.top||(nt=it(nt,E.flipTo));let rt=ct?E.xs:1,wt=t.HOLD_YAW_MIN*o(t.HOLD_YAW_LARGE*Bt/Math.max(1,E.len),.3,1),dt=t.HOLD_OMEGA,Lt=2*t.HOLD_ZETA*dt,Ft=Math.max(1,Math.ceil(H/.01)),mt=H/Ft;for(let Dt=0;Dt<Ft;Dt++){let Tt=Math.hypot(E.vx,E.vy),xt=o(Tt/(t.HOLD_TURN_R*Math.max(1,E.len)),wt,t.HOLD_YAW_MAX),qt=o(l(E.ang,nt)*t.HOLD_YAW_GAIN,-xt,xt);Q.w+=(qt-Q.w)*Math.min(1,t.HOLD_YAW_RATE*mt);let q=Math.cos(E.ang),_t=Math.sin(E.ang);if(E.ang+=Q.w*mt,ut){let It=Math.cos(E.ang),gt=Math.sin(E.ang);E.x+=rt*(Q.gx*(q-It)-Q.gy*(_t-gt)),E.y+=Q.gx*(_t-gt)+Q.gy*(q-It)}if(ut){let It=Math.cos(E.ang),gt=Math.sin(E.ang),pt=ut.x-(E.x+rt*(Q.gx*It-Q.gy*gt)),Ut=ut.y-(E.y+Q.gx*gt+Q.gy*It);E.vx+=(dt*dt*pt+Lt*(Q.pvx-E.vx))*mt,E.vy+=(dt*dt*Ut+Lt*(Q.pvy-E.vy))*mt}else{let It=Math.exp(-2.5*mt);E.vx*=It,E.vy*=It}let Mt=Math.hypot(E.vx,E.vy);Mt>t.HOLD_MAX_SPEED&&(E.vx*=t.HOLD_MAX_SPEED/Mt,E.vy*=t.HOLD_MAX_SPEED/Mt),E.x+=E.vx*mt,E.y+=E.vy*mt}E.turn=o(l(E.ang,nt),-1.4,1.4),_(E,H);let Rt=Math.hypot(E.vx,E.vy);E.phase+=H*s*o(t.HOLD_BEAT_MIN+t.HOLD_BEAT_GAIN*Rt/Math.max(1,E.len),t.HOLD_BEAT_MIN,t.HOLD_BEAT_MAX)}function V(D,E,H,ut,Q,yt,Bt){let At=i[E.species],F=D.scale,P=t.MARGIN+E.len;if(E.state==="leaving"){if(E.leaveTo){let G=E.leaveS>0?E.leaveS:t.SCOOP_S;E.scoopT=Math.min(1,(E.scoopT||0)+H/G);let Z=Math.min(1,t.SCOOP_PULL*H);E.x+=(E.leaveTo.x-E.x)*Z,E.y+=(E.leaveTo.y-E.y)*Z,E.scoopT>=t.SCOOP_FADE_AT&&(E.alpha=Math.max(0,E.alpha-H/(G*(1-t.SCOOP_FADE_AT)))),E.scoopT>=1&&(E.alpha=0),E.phase+=H*12;return}E.alpha=Math.max(0,E.alpha-H/t.LEAVE_S),E.x+=E.vx*H,E.y+=E.vy*H;return}E.state==="entering"&&(E.t+=H,E.alpha=Math.min(1,E.t/t.ENTER_S),E.t>=t.ENTER_S&&(E.state="alive",E.alpha=1));let $=D.groups[E.entry];$&&D.time>=$.next&&L(D,$,At);let nt=J(D,E),ct=ft(D,E),rt=ct<1&&!At.top,wt=R(D,At,E.len),dt=T(D,At,E.len),Lt=wt!==null?Math.max(At.band[0]*D.height,wt):At.band[0]*D.height,Ft=At.band[1]*D.height,mt=Math.max(Lt,dt!==null&&dt<Ft?dt:Ft),Rt=Math.max(1,t.BAND_SOFT*D.height),Dt=w(D,E.len),Tt=0,xt=0;if($){let G=$.hx-E.x,Z=(dt!==null&&$.hy>dt?dt:$.hy)-E.y,X=Math.hypot(G,Z);if(X>1){let lt=t.HOME_W*o(X/(t.HOME_NEAR*F/(ct*ct)),0,1);Tt+=G/X*lt,xt+=Z/X*lt}}let qt=$?$.wp:E.seed,q=qt*s+E.seed*.6+(qt<.5?1:-1)*D.time*t.WANDER_RATE*ct+Math.sin(D.time*.23*ct+qt*17)*1.2;Tt+=Math.cos(q)*t.WANDER_W,xt+=Math.sin(q)*t.WANDER_W*(rt?t.WANDER_PITCH:1);let _t=E.len*t.SEP_R,Mt=E.len*t.ALIGN_R,It=E.len*t.COH_R,gt=0,pt=0,Ut=0,$t=0,_e=0,se=0;for(let G of ut){if(G===E||G.state==="leaving")continue;let Z=G.x-E.x,X=G.y-E.y,lt=Math.hypot(Z,X);if(lt<1e-6){Tt+=Math.cos(E.seed*s)*t.SEP_W,xt+=Math.sin(E.seed*s)*t.SEP_W;continue}if(lt<_t){let vt=(1-lt/_t)*t.SEP_W;Tt-=Z/lt*vt,xt-=X/lt*vt}if(lt<Mt){let vt=Math.hypot(G.vx,G.vy)||1;gt+=G.vx/vt,pt+=G.vy/vt,Ut++}lt<It&&($t+=G.x,_e+=G.y,se++)}if(Ut&&(Tt+=gt/Ut*t.ALIGN_W,xt+=pt/Ut*t.ALIGN_W),se){let G=$t/se-E.x,Z=_e/se-E.y,X=Math.hypot(G,Z);X>1&&(Tt+=G/X*t.COH_W,xt+=Z/X*t.COH_W)}if(ct<1&&E.state==="alive"){let G=Math.min(E.len*.4,(mt-Lt)*.25);E.x<Dt?Tt+=o((Dt-E.x)/Dt,0,2)*t.EDGE_STEER:E.x>D.width-Dt&&(Tt-=o((E.x-(D.width-Dt))/Dt,0,2)*t.EDGE_STEER),G>1&&(E.y<Lt+G?xt+=o((Lt+G-E.y)/G,0,2)*t.EDGE_STEER:E.y>mt-G&&(xt-=o((E.y-(mt-G))/G,0,2)*t.EDGE_STEER));for(let Z of yt){let X=E.x-Z.x,lt=E.y-Z.y,vt=Math.hypot(X,lt),Nt=Z.r*t.BELL_AVOID+Math.min(E.len*.5,t.BELL_LEN_CAP*F*1.6);vt<Nt&&vt>1e-6&&(Tt+=X/vt*(1-vt/Nt)*t.EDGE_STEER,xt+=lt/vt*(1-vt/Nt)*t.EDGE_STEER)}}let Vn=Math.sin(D.time*.6+E.seed*40)*t.WANDER*.5,In=Math.cos(Vn),Vo=Math.sin(Vn),Li=Tt*In-xt*Vo,Go=Tt*Vo+xt*In;Tt=Li,xt=Go;let je=E.goal,Wo=!!je&&c(je.x,je.y,je.w,je.boost)&&E.state==="alive",vr=Wo&&je.w>0,Rs=1;if(Bt.length&&!vr){let G=null,Z=1/0;for(let X of Bt){let lt=Math.hypot(X.x-E.x,X.y-E.y);lt<X.reach&&lt<Z&&(G=X,Z=lt)}G&&Z>1e-6&&(Tt+=(G.x-E.x)/Z*G.weight,xt+=(G.y-E.y)/Z*G.weight,Rs=G.boost)}let is=t.FLEE_CAP,Xo=1;if(Wo){let G=o(je.w,0,t.GOAL_W_MAX),Z=Math.hypot(je.x-E.x,je.y-E.y);G>0&&Z>1e-6&&(Tt+=(je.x-E.x)/Z*G,xt+=(je.y-E.y)/Z*G),Rs=o(je.boost,.3,t.GOAL_BOOST_MAX),is=Math.max(is,Rs),Number.isFinite(je.accel)&&(Xo=o(je.accel,1,t.GOAL_ACCEL_MAX))}let Cs=nt*Rs,Sr=Math.hypot(Tt,xt),Is,ss;if(Sr>.001){let G=o(Sr/t.STEER_FULL,t.STEER_MIN,1);Is=Tt/Sr*Cs*G,ss=xt/Sr*Cs*G}else{let G=Math.hypot(E.vx,E.vy)||1;Is=E.vx/G*Cs,ss=E.vy/G*Cs}let Ps=Math.min(1,t.TURN*ct*Xo*H),Mr=Math.hypot(E.vx,E.vy),qo=Math.hypot(Is,ss);if(rt){St(E),(E.vx!==E.hvx||E.vy!==E.hvy)&&(E.sp=Math.hypot(E.vx/Math.max(E.xs,.25),E.vy)),E.sp+=(qo-E.sp)*Ps,zt(E,H,Tt*E.face<-t.YAW_START?-E.face:E.face,E.sp,nt*.3);let G=E.sp*Math.sin(t.FREE_PITCH)*E.xs;E.vy=o(E.vy+(o(ss,-G,G)-E.vy)*Ps,-G,G),E.vx=E.face*Math.sqrt(Math.max(E.sp*E.sp-E.vy*E.vy,0))*E.xs,E.hvx=E.vx,E.hvy=E.vy}else if(ct<1&&Mr>1e-6&&qo>1e-6){let G=Math.atan2(E.vy,E.vx),Z=Math.min(t.ARC_YAW*ct,Mr/(t.ARC_R*Math.max(1,E.len))),X=o(l(G,Math.atan2(ss,Is))*Math.min(1,t.TURN*H),-Z*H,Z*H),lt=Mr+(qo-Mr)*Ps;E.vx=Math.cos(G+X)*lt,E.vy=Math.sin(G+X)*lt}else E.vx+=(Is-E.vx)*Ps,E.vy+=(ss-E.vy)*Ps;if(E.cooldown=Math.max(0,E.cooldown-H),Q&&D.pointer.has&&D.pointer.speed>t.FLEE_SPEED&&E.state==="alive"&&!z(E,Q.x,Q.y)){let G=E.x-Q.x,Z=E.y-Q.y,X=t.FLEE_RADIUS*F+Math.min(E.len,t.FLEE_LEN_CAP*F),lt=Math.hypot(G,Z);if(lt<X&&lt>1e-6){let vt=(1-lt/X)*t.FLEE_IMPULSE*F*ct;E.vx+=G/lt*vt*Math.min(1,H*20),E.vy+=Z/lt*vt*Math.min(1,H*20),E.cooldown===0&&(E.cooldown=t.FLEE_COOLDOWN_S)}}E.state==="alive"&&ct>=1&&(E.y<Lt?E.vy+=o((Lt-E.y)/Rt,0,3)*t.BAND_ACC*F*H:E.y>mt&&(E.vy-=o((E.y-mt)/Rt,0,3)*t.BAND_ACC*F*H),E.x<Dt?E.vx+=o((Dt-E.x)/Dt,0,2)*t.WALL_ACC*F*H:E.x>D.width-Dt&&(E.vx-=o((E.x-(D.width-Dt))/Dt,0,2)*t.WALL_ACC*F*H));let U=nt*is;E.glide>U?(E.glide=U+(E.glide-U)*Math.exp(-t.GLIDE_RATE*H),E.glide-U<1?E.glide=0:U=E.glide):E.glide&&(E.glide=0);let K=Math.hypot(E.vx,E.vy);K>U&&(E.vx*=U/K,E.vy*=U/K),rt&&E.sp>U&&(E.sp=U),E.x+=E.vx*H,E.y+=E.vy*H;for(let G of yt){let Z=E.x-G.x,X=E.y-G.y,lt=Math.hypot(Z,X),vt=G.r+Math.min(E.len*t.BELL_KEEP,t.BELL_LEN_CAP*F),Nt=G.r*t.BELL_AVOID+Math.min(E.len*.5,t.BELL_LEN_CAP*F*1.6);if(lt>=Nt)continue;let Ot=lt>1e-6?Z/lt:Math.cos(E.ang),Gt=lt>1e-6?X/lt:Math.sin(E.ang);if(ct>=1&&(E.vx+=Ot*(1-lt/Nt)*t.BELL_PUSH*F*H,E.vy+=Gt*(1-lt/Nt)*t.BELL_PUSH*F*H),lt<vt){let Xt=Math.min(1,10*H);E.x+=Ot*(vt-lt)*Xt,E.y+=Gt*(vt-lt)*Xt}}if(wt!==null&&E.y<wt){let G=Math.min(1,t.LIMIT_EASE*H);E.y+=(wt-E.y)*G,E.vy<0&&(E.vy-=E.vy*G)}if(dt!==null){let G=wt!==null?Math.max(dt,wt):dt;if(E.y>G){let Z=Math.min(1,t.LIMIT_EASE*H);E.y+=(G-E.y)*Z,E.vy>0&&(E.vy-=E.vy*Z)}}if(E.x=o(E.x,-P,D.width+P),E.y=o(E.y,-P,D.height+P),rt){let G=Math.sqrt(Math.max(E.sp*E.sp-E.vy*E.vy,1e-6));E.turn=l(E.ang,Math.atan2(E.vy,E.face*G)),E.ang+=E.turn*Math.min(1,6*H),_(E,H),E.phase+=H*s*(.7+E.sp/Math.max(1,E.len)*.9);return}Math.hypot(E.vx,E.vy)>1&&(E.turn=l(E.ang,Math.atan2(E.vy,E.vx)),E.ang+=E.turn*Math.min(1,6*H)),_(E,H),E.phase+=H*s*(.7+Math.hypot(E.vx,E.vy)/Math.max(1,E.len)*.9)}function Qt(D,E,H={}){let ut=Number(E)/1e3;if(!Number.isFinite(ut)||ut<t.MIN_DT)return;let Q=Math.min(ut,t.MAX_DT);D.time+=Q;let yt=H&&H.pointer&&c(H.pointer.x,H.pointer.y)?H.pointer:null;if(yt){if(D.pointer.has){let nt=Math.hypot(yt.x-D.pointer.x,yt.y-D.pointer.y)/Q;D.pointer.speed=a(D.pointer.speed,nt,.5)}D.pointer.x=yt.x,D.pointer.y=yt.y,D.pointer.has=!0}else D.pointer.has=!1,D.pointer.speed=0;let Bt=H&&Number.isFinite(H.shore)?o(H.shore,D.height*.5,D.height):null,At=Bt!==null&&!Number.isFinite(D.shoreY);D.shoreY=Bt;let F=at(H&&H.bells),P=ot(H&&H.attractors),$=new Map;for(let nt of D.fish)$.has(nt.entry)||$.set(nt.entry,[]),$.get(nt.entry).push(nt);if(At)for(let[nt,ct]of $){let rt=D.groups[nt],wt=h(ct[0].species);if(!rt||!wt)continue;let dt=T(D,wt,wt.len*D.scale);dt!==null&&rt.hy>dt&&(rt.next=0)}for(let nt of D.fish)nt.state==="held"?ue(D,nt,Q,yt):V(D,nt,Q,$.get(nt.entry),yt,F,P);D.fish=D.fish.filter(nt=>!(nt.state==="leaving"&&nt.alpha<=0)),D.vacancies.length&&C(D)}return{PARAMS:t,PX_PER_M:e,SPECIES:n,speciesById:h,normalizeEntries:p,canAdd:x,renderCount:d,capacity:m,createWorld:v,resize:M,reconcile:I,dismiss:O,step:Qt,hitTest:j,grab:W,release:tt,cruiseSpeed:J,seabedOf:T,agileOf:ft,isHeavySide:bt,consume:N,enterOne:A,clamp:o,lerp:a,angleDiff:l,updateFlip:_}})});var jd=Mu((d2,wo)=>{(function(s,t){"use strict";let e=typeof wo=="object"&&wo.exports?Zd():s&&s.AquariumCore,n=t(e);typeof wo=="object"&&wo.exports&&(wo.exports=n),s&&(s.AquariumPlayCore=n)})(typeof window<"u"?window:typeof self<"u"?self:null,function(s){"use strict";let t=Math.PI*2,e=(...b)=>b.every(Number.isFinite),n=s.clamp,i=Object.freeze({POKE_COOLDOWN_S:.4,POKE_DASH:2.4,POKE_CENTER:.15,SHOCK_R:140,SHOCK_DASH:1.2,SHOCK_LARGE:.35,RIPPLE_S:.7,RIPPLE_R:110,MAX_RIPPLES:3,MAX_RIPPLES_LOW:1,MAX_BUBBLES:24,MAX_BUBBLES_LOW:8,POKE_BUBBLES:2,EAT_BUBBLES:2,RELEASE_BUBBLES:2,SPRINKLE_COUNT:6,SPRINKLE_MAX:12,SPRINKLE_X0:.2,SPRINKLE_X1:.8,SPRINKLE_Y:.12,DROP_SPREAD:40,PELLET_SINK:40,PELLET_LIFE_S:14,MAX_PELLETS:24,MAX_PELLETS_LOW:8,FEED_COOLDOWN_S:.8,ATTRACT_REACH:300,ATTRACT_W:2.5,ATTRACT_BOOST:1.5,EAT_R_LEN:.45,EAT_R_PAD:4,EAT_R_MOUTH:.18,FED_S:20,FED_IN_S:.25,FED_OUT_S:3,TAIL_ZONE:0,PULL_GAIN:.1,PULL_MAX:.35,PULL_ABS:40,PULL_OMEGA:16,PULL_ZETA:.5,RELEASE_DASH:2});function r(){return{time:0,nextId:1,lastSprinkle:-1/0,ripples:[],bubbles:[],pellets:[],pokedAt:new Map,fed:new Map,pulls:new Map}}function o(b,A,N){if(!(!e(A,N)||A<=0||N<=0))for(let C of[b.ripples,b.bubbles,b.pellets])for(let I of C)I.x*=A,I.y*=N}function a(b){return{ripples:b.ripples.length,bubbles:b.bubbles.length,pellets:b.pellets.length,fed:b.fed.size,pulls:b.pulls.size}}function c(b,A,N,C,I){let O=A.lowPower?i.MAX_BUBBLES_LOW:i.MAX_BUBBLES,k=A.scale;for(let z=0;z<I;z++)b.bubbles.push({x:N+(A.random()-.5)*6*k,y:C+(A.random()-.5)*4*k,r:(1.4+A.random()*1.8)*k,vy:(24+A.random()*22)*k,ph:A.random()*t,t:0,life:1.5+A.random()*1.1});b.bubbles.length>O&&b.bubbles.splice(0,b.bubbles.length-O)}function l(b,A,N,C){b.ripples.push({x:N,y:C,t:0});let I=A.lowPower?i.MAX_RIPPLES_LOW:i.MAX_RIPPLES;b.ripples.length>I&&b.ripples.splice(0,b.ripples.length-I)}function h(b){let A=Number.isFinite(b.xs)?b.xs:1;return{x:b.x+Math.cos(b.ang)*b.len*.45*A,y:b.y+Math.sin(b.ang)*b.len*.45}}function u(b,A,N){let C=A.scale;b.ripples=b.ripples.filter(I=>(I.t+=N)<i.RIPPLE_S),b.bubbles=b.bubbles.filter(I=>(I.t+=N,I.y-=I.vy*N,I.x+=Math.sin(I.t*5+I.ph)*10*C*N,I.t<I.life&&I.y>-20))}function f(b){return b.state==="alive"||b.state==="entering"}function d(b,A,N,C){if(!N||!C||!e(C.x,C.y,N.x,N.y,N.ang)||!A.fish.includes(N))return{ok:!1,reason:"invalid"};if(!f(N))return{ok:!1,reason:"state"};let I=b.pokedAt.get(N.id);if(I!==void 0&&b.time-I<i.POKE_COOLDOWN_S)return{ok:!1,reason:"cooldown"};b.pokedAt.set(N.id,b.time);let O=N.x-C.x,k=N.y-C.y,z=Math.hypot(O,k),et=z>=i.POKE_CENTER*N.len?{x:O/z,y:k/z}:{x:Math.cos(N.ang),y:Math.sin(N.ang)},j=s.agileOf(A,N),W=s.cruiseSpeed(A,N)*(j<1?1+(i.POKE_DASH-1)*j:i.POKE_DASH);N.vx=et.x*W,N.vy=et.y*W;let tt=h(N);c(b,A,tt.x,tt.y,i.POKE_BUBBLES+Math.floor(A.random()*2));let at=0;for(let st of A.fish){if(st===N||!f(st))continue;let ot=st.x-C.x,J=st.y-C.y,it=i.SHOCK_R*A.scale+st.len,ft=Math.hypot(ot,J);if(ft>=it)continue;let bt=s.speciesById(st.species),St=(1-ft/it)*(bt&&bt.kind==="large"?i.SHOCK_LARGE:1)*s.cruiseSpeed(A,st)*i.SHOCK_DASH,zt=ft>1e-6?{x:ot/ft,y:J/ft}:{x:Math.cos(st.ang),y:Math.sin(st.ang)};st.vx+=zt.x*St,st.vy+=zt.y*St,at++}return l(b,A,C.x,C.y),{ok:!0,pushed:at}}let g=Object.freeze([]),x=b=>b.lowPower?i.MAX_PELLETS_LOW:i.MAX_PELLETS;function m(b,A,N){let C=N&&typeof N=="object"?N:{},I=C.x!==void 0||C.y!==void 0;if(I&&!e(C.x,C.y))return{ok:!1,reason:"invalid"};let O=C.count===void 0?i.SPRINKLE_COUNT:C.count;if(!Number.isInteger(O)||O<1||O>i.SPRINKLE_MAX)return{ok:!1,reason:"invalid"};if(b.time-b.lastSprinkle<i.FEED_COOLDOWN_S)return{ok:!1,reason:"cooldown"};let k=x(A)-b.pellets.length;if(k<=0)return{ok:!1,reason:"busy"};let z=Math.min(O,k),et=A.scale;for(let j=0;j<z;j++){let W=I?n(C.x+(A.random()*2-1)*i.DROP_SPREAD*et,0,A.width):A.width*(i.SPRINKLE_X0+(i.SPRINKLE_X1-i.SPRINKLE_X0)*A.random()),tt=I?n(C.y+(A.random()*2-1)*i.DROP_SPREAD*et,0,A.height):A.height*i.SPRINKLE_Y+(A.random()-.5)*10*et;b.pellets.push({id:b.nextId++,x:W,y:tt,t:0,ph:A.random()*t,sink:i.PELLET_SINK*et*(.85+.3*A.random()),life:i.PELLET_LIFE_S})}return b.lastSprinkle=b.time,{ok:!0,count:z}}function p(b,A){if(!b.pellets.length)return g;let N=i.ATTRACT_REACH*A.scale;return b.pellets.map(C=>({x:C.x,y:C.y,reach:N,weight:i.ATTRACT_W,boost:i.ATTRACT_BOOST}))}function y(b,A){let N=null,C=1/0;for(let I of b.fish){if(I.state!=="alive")continue;if(s.agileOf(b,I)<1){let k=h(I),z=Math.hypot(k.x-A.x,k.y-A.y);z<i.EAT_R_MOUTH*I.len+i.EAT_R_PAD&&z<C&&(N=I,C=z);continue}let O=Math.hypot(I.x-A.x,I.y-A.y);O<i.EAT_R_LEN*I.len+i.EAT_R_PAD&&O<C&&(N=I,C=O)}return N}function v(b,A,N){if(!b.pellets.length)return;let C=[];for(let I of b.pellets){if(I.t+=N,I.y+=I.sink*N,I.x+=Math.sin(I.t*1.7+I.ph)*9*A.scale*N,I.t>=I.life||I.y>A.height+20)continue;let O=y(A,I);if(O){b.fed.set(O.id,b.time+i.FED_S);let k=h(O);c(b,A,k.x,k.y,i.EAT_BUBBLES);continue}C.push(I)}b.pellets=C}let _=Object.freeze({pull:null,fed:0});function w(b,A){let N=b.pulls.get(A.id),C=b.fed.get(A.id);if(!N&&C===void 0)return _;let I=0;if(C!==void 0){let O=C-b.time;I=n(Math.min((i.FED_S-O)/i.FED_IN_S,O/i.FED_OUT_S),0,1)}return{pull:N?{x:N.x,y:N.y}:null,fed:I}}function T(b,A,N){if(!b||!e(A,N,b.x,b.y,b.ang,b.len))return!1;let C=s.speciesById(b.species);return!C||C.kind==="school"?!1:(A-b.x)*Math.cos(b.ang)+(N-b.y)*Math.sin(b.ang)<=i.TAIL_ZONE*b.len}function R(b,A,N){return!N||!A.fish.includes(N)||N.state!=="held"||!N.held||!N.held.tail?{ok:!1,reason:"state"}:(b.pulls.set(N.id,{x:0,y:0,vx:0,vy:0}),{ok:!0})}function L(b,A,N,C){if(!(N&&b.pulls.get(N.id)))return{ok:!1,reason:"state"};if(C&&C.quiet)return b.pulls.delete(N.id),{ok:!0};if(N.state==="alive"){let O=s.cruiseSpeed(A,N)*i.RELEASE_DASH;N.vx=Math.cos(N.ang)*O,N.vy=Math.sin(N.ang)*O;let k=h(N);c(b,A,k.x,k.y,i.RELEASE_BUBBLES)}return{ok:!0}}function S(b,A,N){if(!b.pulls.size)return;let C=new Map(A.fish.map(k=>[k.id,k])),I=i.PULL_OMEGA,O=2*i.PULL_ZETA*I;for(let[k,z]of b.pulls){let et=C.get(k);if(!et||et.state==="leaving"){b.pulls.delete(k);continue}let j=et.state==="held"&&!!et.held&&!!et.held.tail,W=Math.min(i.PULL_MAX*et.len,i.PULL_ABS*A.scale),tt=0,at=0;if(j){let J=Math.hypot(et.held.pvx,et.held.pvy);if(J>1){let it=Math.min(J*i.PULL_GAIN,W),ft=et.held.pvx/J,bt=et.held.pvy/J,St=Math.cos(et.ang),zt=Math.sin(et.ang);tt=(ft*St+bt*zt)*it,at=(-ft*zt+bt*St)*it}}let st=N/2;for(let J=0;J<2;J++)z.vx+=(I*I*(tt-z.x)-O*z.vx)*st,z.vy+=(I*I*(at-z.y)-O*z.vy)*st,z.x+=z.vx*st,z.y+=z.vy*st;let ot=Math.hypot(z.x,z.y);ot>W&&(z.x*=W/ot,z.y*=W/ot),!j&&Math.abs(z.x)<.05&&Math.abs(z.y)<.05&&Math.abs(z.vx)<.5&&Math.abs(z.vy)<.5&&b.pulls.delete(k)}}function M(b,A,N){let C=Number(N)/1e3;if(!Number.isFinite(C)||C<s.PARAMS.MIN_DT)return;let I=Math.min(C,s.PARAMS.MAX_DT);b.time+=I,u(b,A,I),v(b,A,I),S(b,A,I);for(let[O,k]of b.pokedAt)b.time-k>=i.POKE_COOLDOWN_S&&b.pokedAt.delete(O);for(let[O,k]of b.fed)k<=b.time&&b.fed.delete(O)}return{PARAMS:i,create:r,resize:o,counts:a,poke:d,sprinkle:m,attractors:p,extrasOf:w,isTailZone:T,beginHold:R,endHold:L,step:M,mouthOf:h,addBubbles:c}})});var tx=Mu((p2,Fh)=>{(function(s,t){"use strict";let e=typeof Fh=="object"&&Fh.exports,n=e?Zd():s&&s.AquariumCore,i=e?jd():s&&s.AquariumPlayCore,r=n&&i?t(n,i):null;r&&e&&(Fh.exports=r),r&&s&&(s.AquariumPredationCore=r)})(typeof window<"u"?window:typeof self<"u"?self:null,function(s,t){"use strict";let e=Object.freeze({HUNGER_RATE:.004166666666666667,MEAL:.6,HUNGER_START:.2,HUNGER_SPAN:.4,HUNGER_THRESHOLD:.5,PICK_S:.5,SWITCH_RATIO:.7,SENSE_LEN:6,SENSE_MAX:.5,SENSE_LOSE:1.5,REACH_BAND:.5,BETA_SCHOOL:.5,BETA_TURN:.2,SCHOOL_MATES:3,HUNT_W:2.2,HUNT_BOOST:1.3,LEAD_MAX_S:1,STRIKE_R:1.2,STRIKE_CONE:.8,STRIKE_S:1.4,STRIKE_BOOST_MIN:2.6,STRIKE_BOOST_MAX:4.5,STRIKE_PREY:1.2,STRIKE_ACCEL:3,HUNT_MAX_S:12,P_SOLO:.7,P_SCHOOL:.35,P_MIN:.15,P_MAX:.85,HANDLE_S:1,HANDLE_PACE:.6,BUBBLES:3,REST_MIN_S:6,REST_MAX_S:10,FAIL_LIMIT:3,GIVEUP_S:20,KILL_GAP_S:20,VACANT_SHARE:.3,ALERT_LEN:.8,ALERT_PAD:20,ALERT_MAX:450,REACT_S:.25,PANIC_S:.3,FLEE_BOOST:2.2,FLEE_RESPONSE:8,SAFE_S:4,ENTER_SAFE_S:3,MIN_ALPHA:.9,REFILL_SCHOOL_S:25,REFILL_SOLO_S:75}),n=(...C)=>C.every(Number.isFinite),i=s.clamp,r=256;function o(C){let I=C>>>0;return function(){I=I+1831565813>>>0;let k=I;return k=Math.imul(k^k>>>15,k|1),k^=k+Math.imul(k^k>>>7,k|61),((k^k>>>14)>>>0)/4294967296}}function a(C,I){return!C||!I||C.diet!=="predator"||I.diet!=="prey"||!n(C.gape,C.meters,I.meters)?!1:I.meters<=C.gape*C.meters}function c(C,I,O){return C*(1+e.BETA_SCHOOL*(I?1:0)+e.BETA_TURN*i(O,0,Math.PI)/Math.PI)}function l(C){return i(e.P_SOLO-e.P_SCHOOL*(C?1:0),e.P_MIN,e.P_MAX)}function h(C,I){let O=0,k=0,z=s.PARAMS.COH_R*I.len;for(let et of C.fish)et===I||et.entry!==I.entry||et.state==="leaving"||(k++,Math.hypot(et.x-I.x,et.y-I.y)<=z&&O++);return k>=e.SCHOOL_MATES&&O===k}function u(C,I,O){let k=Math.max(1e-6,s.cruiseSpeed(C,I)),z=s.cruiseSpeed(C,O)*s.PARAMS.FLEE_CAP;return i(Math.max(e.STRIKE_BOOST_MIN,e.STRIKE_PREY*z/k),e.STRIKE_BOOST_MIN,e.STRIKE_BOOST_MAX)}function f(C){let I=Math.floor(Number(C&&C.random?C.random():0)*4294967296);return{rnd:o(Number.isFinite(I)?I:0),hunters:new Map,firstSeen:new Map,heldAt:new Map,alert:new Map,swallowing:[],lastKill:-1/0,stats:{hunts:0,strikes:0,captures:0,giveups:0,ended:Object.create(null),chases:[]}}}function d(C){return{phase:"cruise",hunger:e.HUNGER_START+e.HUNGER_SPAN*C.rnd(),targetId:null,nextPick:0,huntStart:0,strikeEnd:0,until:0,restUntil:0,giveUpUntil:0,fails:0,boost:e.STRIKE_BOOST_MIN,rolled:!1}}let g=C=>t.mouthOf(C);function x(C,I,O,k,z){if(!k||k.state!=="alive"||!(k.alpha>=e.MIN_ALPHA)||!a(O,s.speciesById(k.species)))return!1;let et=C.heldAt.get(k.id);if(et!==void 0&&z-et<e.SAFE_S)return!1;let j=C.firstSeen.get(k.id);return j===void 0||z-j<e.ENTER_SAFE_S?!1:n(k.x,k.y,k.vx,k.vy)&&k.x>=0&&k.x<=I.width&&k.y>=0&&k.y<=I.height}function m(C,I,O,k){let z=O.len*e.REACH_BAND;return k.y>=I.band[0]*C.height-z&&k.y<=I.band[1]*C.height+z}function p(C,I){return Math.min(e.SENSE_LEN*I.len,C.width*e.SENSE_MAX)}function y(C,I,O,k,z){let et=g(O),j=p(I,O),W=null;for(let tt of I.fish){if(!x(C,I,k,tt,z)||!m(I,k,O,tt))continue;let at=Math.hypot(tt.x-et.x,tt.y-et.y);if(at>j)continue;let st=Math.abs(s.angleDiff(O.ang,Math.atan2(tt.y-et.y,tt.x-et.x))),ot=c(at,h(I,tt),st);(!W||ot<W.cost)&&(W={fish:tt,cost:ot,distance:at})}return W}function v(C,I,O){let k=C.stats.chases;k.push(O-I.huntStart),k.length>r&&k.shift()}function _(C,I,O,k){v(C,I,O),C.stats.ended[k]=(C.stats.ended[k]||0)+1,I.fails++,I.restUntil=O+e.REST_MIN_S+(e.REST_MAX_S-e.REST_MIN_S)*C.rnd(),I.fails>=e.FAIL_LIMIT&&(I.fails=0,I.giveUpUntil=O+e.GIVEUP_S,I.restUntil=Math.max(I.restUntil,I.giveUpUntil),C.stats.giveups++),I.phase="rest",I.targetId=null}function w(C,I,O,k,z,et){let j=Math.max(1,s.cruiseSpeed(C,I)*z),W=Math.hypot(O.x-I.x,O.y-I.y),tt=i(W/j,0,e.LEAD_MAX_S);I.goal={x:O.x+O.vx*tt,y:O.y+O.vy*tt,w:k,boost:z,accel:et}}function T(C,I,O){if(O-C.lastKill<e.KILL_GAP_S||I.vacancies.length>=s.PARAMS.MAX_VACANCIES)return!1;let k=0;for(let et of I.fish){let j=s.speciesById(et.species);j&&j.diet==="prey"&&et.state!=="leaving"&&k++}let z=k+I.vacancies.length;return I.vacancies.length<Math.max(1,Math.floor(e.VACANT_SHARE*z))}function R(C,I,O,k,z,et,j){let W=s.speciesById(z.species),tt=W&&W.kind==="school"?e.REFILL_SCHOOL_S:e.REFILL_SOLO_S,at=g(O);return s.consume(I,z,at,tt)?(C.swallowing.push({fishId:z.id,predatorId:O.id}),j&&typeof j.bubbles=="function"&&j.bubbles(at.x,at.y,e.BUBBLES+Math.floor(C.rnd()*2)),C.lastKill=et,C.stats.captures++,v(C,k,et),k.hunger=Math.max(0,k.hunger-e.MEAL),k.fails=0,k.phase="handle",k.until=et+e.HANDLE_S,k.targetId=null,!0):!1}function L(C,I,O,k,z,et,j){let W=C.hunters.get(O.id);W||(W=d(C),C.hunters.set(O.id,W)),O.goal=null;let tt=I.time;if(O.state!=="alive"){(W.phase==="hunt"||W.phase==="strike")&&v(C,W,tt),W.phase="cruise",W.targetId=null;return}if(W.hunger=Math.min(1,W.hunger+e.HUNGER_RATE*z),W.phase==="handle"){if(tt>=W.until){W.phase="cruise";return}O.goal={x:O.x,y:O.y,w:0,boost:e.HANDLE_PACE};return}if(W.phase==="rest"){tt>=W.restUntil&&(W.phase="cruise");return}if(W.phase==="cruise"){if(W.hunger<e.HUNGER_THRESHOLD||tt<W.restUntil||tt<W.giveUpUntil||tt<W.nextPick||!T(C,I,tt))return;W.nextPick=tt+e.PICK_S;let it=y(C,I,O,k,tt);if(!it)return;W.phase="hunt",W.targetId=it.fish.id,W.huntStart=tt,W.nextPick=tt+e.PICK_S,C.stats.hunts++}let at=et.get(W.targetId);if(!at||!x(C,I,k,at,tt)){_(C,W,tt,"ineligible");return}let st=g(O),ot=Math.hypot(at.x-st.x,at.y-st.y);if(W.phase==="hunt"){if(tt-W.huntStart>e.HUNT_MAX_S){_(C,W,tt,"timeout");return}if(ot>p(I,O)*e.SENSE_LOSE){_(C,W,tt,"sense");return}if(tt>=W.nextPick){W.nextPick=tt+e.PICK_S;let it=y(C,I,O,k,tt);if(it&&it.fish!==at){let ft=c(ot,h(I,at),Math.abs(s.angleDiff(O.ang,Math.atan2(at.y-st.y,at.x-st.x))));if(it.cost<ft*e.SWITCH_RATIO){W.targetId=it.fish.id,w(I,O,it.fish,e.HUNT_W,e.HUNT_BOOST);return}}}if(ot<=e.STRIKE_R*O.len&&Math.abs(s.angleDiff(O.ang,Math.atan2(at.y-st.y,at.x-st.x)))<=e.STRIKE_CONE)W.phase="strike",W.strikeEnd=tt+e.STRIKE_S,W.boost=u(I,O,at),W.rolled=!1,C.stats.strikes++;else{w(I,O,at,e.HUNT_W,e.HUNT_BOOST);return}}if(tt>=W.strikeEnd){_(C,W,tt,W.rolled?"roll":"never");return}w(I,O,at,e.HUNT_W,W.boost,e.STRIKE_ACCEL);let J=t.PARAMS.EAT_R_MOUTH*O.len+t.PARAMS.EAT_R_PAD;!W.rolled&&ot<=J&&(W.rolled=!0,T(C,I,tt)&&C.rnd()<l(h(I,at))&&R(C,I,O,W,at,tt,j)&&(O.goal={x:O.x,y:O.y,w:0,boost:e.HANDLE_PACE}))}function S(C,I,O,k){let z=[];for(let[tt,at]of C.hunters){if(at.phase!=="hunt"&&at.phase!=="strike")continue;let st=k.get(tt);st&&st.state==="alive"&&z.push(st)}if(!z.length){C.alert.clear();return}let et=I.time,j=new Map;for(let tt of z){let at=s.speciesById(tt.species),st=Math.min(e.ALERT_LEN*tt.len+e.ALERT_PAD*I.scale,e.ALERT_MAX*I.scale);for(let ot of I.fish){if(ot.state!=="alive"||!a(at,s.speciesById(ot.species)))continue;let J=Math.hypot(ot.x-tt.x,ot.y-tt.y);if(J>st)continue;let it=j.get(ot.entry);(!it||J<it.d)&&j.set(ot.entry,{threat:tt,d:J})}}for(let tt of Array.from(C.alert.keys()))j.has(tt)||C.alert.delete(tt);for(let tt of j.keys())C.alert.has(tt)||C.alert.set(tt,{since:et});let W=Math.min(1,e.FLEE_RESPONSE*O);for(let tt of I.fish){let at=C.alert.get(tt.entry);if(!at||tt.state!=="alive")continue;let st=j.get(tt.entry).threat;if(et-at.since<e.REACT_S+e.PANIC_S*i(tt.seed,0,1))continue;let ot=tt.x-st.x,J=tt.y-st.y,it=Math.hypot(ot,J);it>1e-6?(ot/=it,J/=it):(ot=Math.cos(st.ang),J=Math.sin(st.ang));let ft=s.cruiseSpeed(I,tt)*e.FLEE_BOOST;tt.vx+=(ot*ft-tt.vx)*W,tt.vy+=(J*ft-tt.vy)*W}}function M(C,I){for(let O of I.fish)O.goal&&(O.goal=null);for(let O of I.vacancies)O.due=Math.min(O.due,I.time);C&&(C.hunters.clear(),C.alert.clear(),C.swallowing.length=0,C.firstSeen.clear(),C.heldAt.clear())}function b(C,I,O,k){let z=Number(O)/1e3;if(!Number.isFinite(z)||z<s.PARAMS.MIN_DT)return;let et=Math.min(z,s.PARAMS.MAX_DT);if(!(!!(k&&k.enabled)&&!I.lowPower)){M(C,I);return}let W=I.time,tt=new Map,at=0;for(let st of I.fish){tt.set(st.id,st),st.state==="alive"&&!C.firstSeen.has(st.id)&&C.firstSeen.set(st.id,W),st.state==="held"&&C.heldAt.set(st.id,W);let ot=s.speciesById(st.species);ot&&ot.diet==="predator"&&at++}for(let st of Array.from(C.firstSeen.keys()))tt.has(st)||C.firstSeen.delete(st);for(let[st,ot]of C.heldAt)(!tt.has(st)||W-ot>=e.SAFE_S)&&C.heldAt.delete(st);for(let st of Array.from(C.hunters.keys()))tt.has(st)||C.hunters.delete(st);if(at){for(let st of I.fish){let ot=s.speciesById(st.species);ot&&ot.diet==="predator"&&L(C,I,st,ot,et,tt,k)}S(C,I,et,tt)}else C.alert.clear();for(let st=C.swallowing.length-1;st>=0;st--){let ot=C.swallowing[st],J=tt.get(ot.fishId),it=tt.get(ot.predatorId);if(!J||J.state!=="leaving"||!J.eaten||!it){C.swallowing.splice(st,1);continue}let ft=g(it);J.leaveTo={x:ft.x,y:ft.y}}}function A(C,I,O){let k=O&&C.hunters.get(O.id);return!k||k.phase!=="strike"?!1:(_(C,k,I.time,"disturbed"),O.goal=null,!0)}function N(C){return{hunters:Array.from(C.hunters,([I,O])=>({id:I,phase:O.phase,hunger:O.hunger,targetId:O.targetId})),alerts:C.alert.size,swallowing:C.swallowing.length,stats:Object.assign({},C.stats,{ended:Object.assign({},C.stats.ended),chases:C.stats.chases.slice()})}}return{PARAMS:e,canEat:a,costOf:c,catchChance:l,inSchool:h,strikeBoost:u,create:f,step:b,release:M,disturb:A,summary:N,seededRandom:o}})});var sg=0,df=1,rg=2;var pf=1,og=2,Ri=3,fn=0,nn=1,Ce=2,qi=0,Bs=1,mf=2,gf=3,xf=4,Ta=5,us=100,ag=101,cg=102,lg=103,hg=104,ul=200,Aa=201,ug=202,fg=203,Xc=204,Hr=205,dg=206,pg=207,mg=208,gg=209,xg=210,yg=211,_g=212,vg=213,Sg=214,fl=0,dl=1,pl=2,zs=3,ml=4,gl=5,xl=6,yl=7,yf=0,Mg=1,bg=2,$i=0,wg=1,Eg=2,Tg=3,Ag=4,Rg=5,Cg=6,_l=7,tf="attached",Ig="detached",_f=300,Zs=301,js=302,io=303,vl=304,Ra=306,Mi=1e3,vi=1001,Vr=1002,Qe=1003,Sl=1004;var Qs=1005;var Ye=1006,so=1007;var Un=1008;var fi=1009,vf=1010,Sf=1011,ro=1012,Ml=1013,ms=1014,$n=1015,Yi=1016,bl=1017,wl=1018,oo=1020,Mf=35902,bf=35899,wf=1021,Ef=1022,Mn=1023,Gr=1026,ao=1027,El=1028,Tl=1029,Tf=1030,Al=1031;var Rl=1033,Ca=33776,Ia=33777,Pa=33778,La=33779,Cl=35840,Il=35841,Pl=35842,Ll=35843,Nl=36196,Dl=37492,Ol=37496,Ul=37808,Fl=37809,Bl=37810,zl=37811,kl=37812,Hl=37813,Vl=37814,Gl=37815,Wl=37816,Xl=37817,ql=37818,$l=37819,Yl=37820,Jl=37821,Kl=36492,Zl=36494,jl=36495,Ql=36283,th=36284,eh=36285,nh=36286;var ks=2300,Hs=2301,Wc=2302,ef=2400,nf=2401,sf=2402,Pg=2500;var Af=0,Na=1,co=2,Lg=3200,Ng=3201;var Rf=0,Dg=1,Ji="",ze="srgb",We="srgb-linear",sa="linear",Se="srgb";var Fs=7680;var rf=519,Og=512,Ug=513,Fg=514,Cf=515,Bg=516,zg=517,kg=518,Hg=519,qc=35044,Da=35048;var If="300 es",li=2e3,ra=2001;var Hi=class{addEventListener(t,e){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[t]===void 0&&(n[t]=[]),n[t].indexOf(e)===-1&&n[t].push(e)}hasEventListener(t,e){let n=this._listeners;return n===void 0?!1:n[t]!==void 0&&n[t].indexOf(e)!==-1}removeEventListener(t,e){let n=this._listeners;if(n===void 0)return;let i=n[t];if(i!==void 0){let r=i.indexOf(e);r!==-1&&i.splice(r,1)}}dispatchEvent(t){let e=this._listeners;if(e===void 0)return;let n=e[t.type];if(n!==void 0){t.target=this;let i=n.slice(0);for(let r=0,o=i.length;r<o;r++)i[r].call(this,t);t.target=null}}},an=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],_m=1234567,na=Math.PI/180,Vs=180/Math.PI;function hi(){let s=Math.random()*4294967295|0,t=Math.random()*4294967295|0,e=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(an[s&255]+an[s>>8&255]+an[s>>16&255]+an[s>>24&255]+"-"+an[t&255]+an[t>>8&255]+"-"+an[t>>16&15|64]+an[t>>24&255]+"-"+an[e&63|128]+an[e>>8&255]+"-"+an[e>>16&255]+an[e>>24&255]+an[n&255]+an[n>>8&255]+an[n>>16&255]+an[n>>24&255]).toLowerCase()}function Yt(s,t,e){return Math.max(t,Math.min(e,s))}function Pf(s,t){return(s%t+t)%t}function t_(s,t,e,n,i){return n+(s-t)*(i-n)/(e-t)}function e_(s,t,e){return s!==t?(e-s)/(t-s):0}function ia(s,t,e){return(1-e)*s+e*t}function n_(s,t,e,n){return ia(s,t,1-Math.exp(-e*n))}function i_(s,t=1){return t-Math.abs(Pf(s,t*2)-t)}function s_(s,t,e){return s<=t?0:s>=e?1:(s=(s-t)/(e-t),s*s*(3-2*s))}function r_(s,t,e){return s<=t?0:s>=e?1:(s=(s-t)/(e-t),s*s*s*(s*(s*6-15)+10))}function o_(s,t){return s+Math.floor(Math.random()*(t-s+1))}function a_(s,t){return s+Math.random()*(t-s)}function c_(s){return s*(.5-Math.random())}function l_(s){s!==void 0&&(_m=s);let t=_m+=1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}function h_(s){return s*na}function u_(s){return s*Vs}function f_(s){return(s&s-1)===0&&s!==0}function d_(s){return Math.pow(2,Math.ceil(Math.log(s)/Math.LN2))}function p_(s){return Math.pow(2,Math.floor(Math.log(s)/Math.LN2))}function m_(s,t,e,n,i){let r=Math.cos,o=Math.sin,a=r(e/2),c=o(e/2),l=r((t+n)/2),h=o((t+n)/2),u=r((t-n)/2),f=o((t-n)/2),d=r((n-t)/2),g=o((n-t)/2);switch(i){case"XYX":s.set(a*h,c*u,c*f,a*l);break;case"YZY":s.set(c*f,a*h,c*u,a*l);break;case"ZXZ":s.set(c*u,c*f,a*h,a*l);break;case"XZX":s.set(a*h,c*g,c*d,a*l);break;case"YXY":s.set(c*d,a*h,c*g,a*l);break;case"ZYZ":s.set(c*g,c*d,a*h,a*l);break;default:console.warn("THREE.MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+i)}}function ci(s,t){switch(t.constructor){case Float32Array:return s;case Uint32Array:return s/4294967295;case Uint16Array:return s/65535;case Uint8Array:return s/255;case Int32Array:return Math.max(s/2147483647,-1);case Int16Array:return Math.max(s/32767,-1);case Int8Array:return Math.max(s/127,-1);default:throw new Error("Invalid component type.")}}function ve(s,t){switch(t.constructor){case Float32Array:return s;case Uint32Array:return Math.round(s*4294967295);case Uint16Array:return Math.round(s*65535);case Uint8Array:return Math.round(s*255);case Int32Array:return Math.round(s*2147483647);case Int16Array:return Math.round(s*32767);case Int8Array:return Math.round(s*127);default:throw new Error("Invalid component type.")}}var Lf={DEG2RAD:na,RAD2DEG:Vs,generateUUID:hi,clamp:Yt,euclideanModulo:Pf,mapLinear:t_,inverseLerp:e_,lerp:ia,damp:n_,pingpong:i_,smoothstep:s_,smootherstep:r_,randInt:o_,randFloat:a_,randFloatSpread:c_,seededRandom:l_,degToRad:h_,radToDeg:u_,isPowerOfTwo:f_,ceilPowerOfTwo:d_,floorPowerOfTwo:p_,setQuaternionFromProperEuler:m_,normalize:ve,denormalize:ci},Ht=class s{constructor(t=0,e=0){s.prototype.isVector2=!0,this.x=t,this.y=e}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,e){return this.x=t,this.y=e,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){let e=this.x,n=this.y,i=t.elements;return this.x=i[0]*e+i[3]*n+i[6],this.y=i[1]*e+i[4]*n+i[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,e){return this.x=Yt(this.x,t.x,e.x),this.y=Yt(this.y,t.y,e.y),this}clampScalar(t,e){return this.x=Yt(this.x,t,e),this.y=Yt(this.y,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Yt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(Yt(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y;return e*e+n*n}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this}rotateAround(t,e){let n=Math.cos(e),i=Math.sin(e),r=this.x-t.x,o=this.y-t.y;return this.x=r*n-o*i+t.x,this.y=r*i+o*n+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},Ve=class{constructor(t=0,e=0,n=0,i=1){this.isQuaternion=!0,this._x=t,this._y=e,this._z=n,this._w=i}static slerpFlat(t,e,n,i,r,o,a){let c=n[i+0],l=n[i+1],h=n[i+2],u=n[i+3],f=r[o+0],d=r[o+1],g=r[o+2],x=r[o+3];if(a===0){t[e+0]=c,t[e+1]=l,t[e+2]=h,t[e+3]=u;return}if(a===1){t[e+0]=f,t[e+1]=d,t[e+2]=g,t[e+3]=x;return}if(u!==x||c!==f||l!==d||h!==g){let m=1-a,p=c*f+l*d+h*g+u*x,y=p>=0?1:-1,v=1-p*p;if(v>Number.EPSILON){let w=Math.sqrt(v),T=Math.atan2(w,p*y);m=Math.sin(m*T)/w,a=Math.sin(a*T)/w}let _=a*y;if(c=c*m+f*_,l=l*m+d*_,h=h*m+g*_,u=u*m+x*_,m===1-a){let w=1/Math.sqrt(c*c+l*l+h*h+u*u);c*=w,l*=w,h*=w,u*=w}}t[e]=c,t[e+1]=l,t[e+2]=h,t[e+3]=u}static multiplyQuaternionsFlat(t,e,n,i,r,o){let a=n[i],c=n[i+1],l=n[i+2],h=n[i+3],u=r[o],f=r[o+1],d=r[o+2],g=r[o+3];return t[e]=a*g+h*u+c*d-l*f,t[e+1]=c*g+h*f+l*u-a*d,t[e+2]=l*g+h*d+a*f-c*u,t[e+3]=h*g-a*u-c*f-l*d,t}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get w(){return this._w}set w(t){this._w=t,this._onChangeCallback()}set(t,e,n,i){return this._x=t,this._y=e,this._z=n,this._w=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(t){return this._x=t.x,this._y=t.y,this._z=t.z,this._w=t.w,this._onChangeCallback(),this}setFromEuler(t,e=!0){let n=t._x,i=t._y,r=t._z,o=t._order,a=Math.cos,c=Math.sin,l=a(n/2),h=a(i/2),u=a(r/2),f=c(n/2),d=c(i/2),g=c(r/2);switch(o){case"XYZ":this._x=f*h*u+l*d*g,this._y=l*d*u-f*h*g,this._z=l*h*g+f*d*u,this._w=l*h*u-f*d*g;break;case"YXZ":this._x=f*h*u+l*d*g,this._y=l*d*u-f*h*g,this._z=l*h*g-f*d*u,this._w=l*h*u+f*d*g;break;case"ZXY":this._x=f*h*u-l*d*g,this._y=l*d*u+f*h*g,this._z=l*h*g+f*d*u,this._w=l*h*u-f*d*g;break;case"ZYX":this._x=f*h*u-l*d*g,this._y=l*d*u+f*h*g,this._z=l*h*g-f*d*u,this._w=l*h*u+f*d*g;break;case"YZX":this._x=f*h*u+l*d*g,this._y=l*d*u+f*h*g,this._z=l*h*g-f*d*u,this._w=l*h*u-f*d*g;break;case"XZY":this._x=f*h*u-l*d*g,this._y=l*d*u-f*h*g,this._z=l*h*g+f*d*u,this._w=l*h*u+f*d*g;break;default:console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: "+o)}return e===!0&&this._onChangeCallback(),this}setFromAxisAngle(t,e){let n=e/2,i=Math.sin(n);return this._x=t.x*i,this._y=t.y*i,this._z=t.z*i,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(t){let e=t.elements,n=e[0],i=e[4],r=e[8],o=e[1],a=e[5],c=e[9],l=e[2],h=e[6],u=e[10],f=n+a+u;if(f>0){let d=.5/Math.sqrt(f+1);this._w=.25/d,this._x=(h-c)*d,this._y=(r-l)*d,this._z=(o-i)*d}else if(n>a&&n>u){let d=2*Math.sqrt(1+n-a-u);this._w=(h-c)/d,this._x=.25*d,this._y=(i+o)/d,this._z=(r+l)/d}else if(a>u){let d=2*Math.sqrt(1+a-n-u);this._w=(r-l)/d,this._x=(i+o)/d,this._y=.25*d,this._z=(c+h)/d}else{let d=2*Math.sqrt(1+u-n-a);this._w=(o-i)/d,this._x=(r+l)/d,this._y=(c+h)/d,this._z=.25*d}return this._onChangeCallback(),this}setFromUnitVectors(t,e){let n=t.dot(e)+1;return n<1e-8?(n=0,Math.abs(t.x)>Math.abs(t.z)?(this._x=-t.y,this._y=t.x,this._z=0,this._w=n):(this._x=0,this._y=-t.z,this._z=t.y,this._w=n)):(this._x=t.y*e.z-t.z*e.y,this._y=t.z*e.x-t.x*e.z,this._z=t.x*e.y-t.y*e.x,this._w=n),this.normalize()}angleTo(t){return 2*Math.acos(Math.abs(Yt(this.dot(t),-1,1)))}rotateTowards(t,e){let n=this.angleTo(t);if(n===0)return this;let i=Math.min(1,e/n);return this.slerp(t,i),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(t){return this._x*t._x+this._y*t._y+this._z*t._z+this._w*t._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let t=this.length();return t===0?(this._x=0,this._y=0,this._z=0,this._w=1):(t=1/t,this._x=this._x*t,this._y=this._y*t,this._z=this._z*t,this._w=this._w*t),this._onChangeCallback(),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,e){let n=t._x,i=t._y,r=t._z,o=t._w,a=e._x,c=e._y,l=e._z,h=e._w;return this._x=n*h+o*a+i*l-r*c,this._y=i*h+o*c+r*a-n*l,this._z=r*h+o*l+n*c-i*a,this._w=o*h-n*a-i*c-r*l,this._onChangeCallback(),this}slerp(t,e){if(e===0)return this;if(e===1)return this.copy(t);let n=this._x,i=this._y,r=this._z,o=this._w,a=o*t._w+n*t._x+i*t._y+r*t._z;if(a<0?(this._w=-t._w,this._x=-t._x,this._y=-t._y,this._z=-t._z,a=-a):this.copy(t),a>=1)return this._w=o,this._x=n,this._y=i,this._z=r,this;let c=1-a*a;if(c<=Number.EPSILON){let d=1-e;return this._w=d*o+e*this._w,this._x=d*n+e*this._x,this._y=d*i+e*this._y,this._z=d*r+e*this._z,this.normalize(),this}let l=Math.sqrt(c),h=Math.atan2(l,a),u=Math.sin((1-e)*h)/l,f=Math.sin(e*h)/l;return this._w=o*u+this._w*f,this._x=n*u+this._x*f,this._y=i*u+this._y*f,this._z=r*u+this._z*f,this._onChangeCallback(),this}slerpQuaternions(t,e,n){return this.copy(t).slerp(e,n)}random(){let t=2*Math.PI*Math.random(),e=2*Math.PI*Math.random(),n=Math.random(),i=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(i*Math.sin(t),i*Math.cos(t),r*Math.sin(e),r*Math.cos(e))}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._w===this._w}fromArray(t,e=0){return this._x=t[e],this._y=t[e+1],this._z=t[e+2],this._w=t[e+3],this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._w,t}fromBufferAttribute(t,e){return this._x=t.getX(e),this._y=t.getY(e),this._z=t.getZ(e),this._w=t.getW(e),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},B=class s{constructor(t=0,e=0,n=0){s.prototype.isVector3=!0,this.x=t,this.y=e,this.z=n}set(t,e,n){return n===void 0&&(n=this.z),this.x=t,this.y=e,this.z=n,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,e){return this.x=t.x*e.x,this.y=t.y*e.y,this.z=t.z*e.z,this}applyEuler(t){return this.applyQuaternion(vm.setFromEuler(t))}applyAxisAngle(t,e){return this.applyQuaternion(vm.setFromAxisAngle(t,e))}applyMatrix3(t){let e=this.x,n=this.y,i=this.z,r=t.elements;return this.x=r[0]*e+r[3]*n+r[6]*i,this.y=r[1]*e+r[4]*n+r[7]*i,this.z=r[2]*e+r[5]*n+r[8]*i,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){let e=this.x,n=this.y,i=this.z,r=t.elements,o=1/(r[3]*e+r[7]*n+r[11]*i+r[15]);return this.x=(r[0]*e+r[4]*n+r[8]*i+r[12])*o,this.y=(r[1]*e+r[5]*n+r[9]*i+r[13])*o,this.z=(r[2]*e+r[6]*n+r[10]*i+r[14])*o,this}applyQuaternion(t){let e=this.x,n=this.y,i=this.z,r=t.x,o=t.y,a=t.z,c=t.w,l=2*(o*i-a*n),h=2*(a*e-r*i),u=2*(r*n-o*e);return this.x=e+c*l+o*u-a*h,this.y=n+c*h+a*l-r*u,this.z=i+c*u+r*h-o*l,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){let e=this.x,n=this.y,i=this.z,r=t.elements;return this.x=r[0]*e+r[4]*n+r[8]*i,this.y=r[1]*e+r[5]*n+r[9]*i,this.z=r[2]*e+r[6]*n+r[10]*i,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,e){return this.x=Yt(this.x,t.x,e.x),this.y=Yt(this.y,t.y,e.y),this.z=Yt(this.z,t.z,e.z),this}clampScalar(t,e){return this.x=Yt(this.x,t,e),this.y=Yt(this.y,t,e),this.z=Yt(this.z,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Yt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,e){let n=t.x,i=t.y,r=t.z,o=e.x,a=e.y,c=e.z;return this.x=i*c-r*a,this.y=r*o-n*c,this.z=n*a-i*o,this}projectOnVector(t){let e=t.lengthSq();if(e===0)return this.set(0,0,0);let n=t.dot(this)/e;return this.copy(t).multiplyScalar(n)}projectOnPlane(t){return bu.copy(this).projectOnVector(t),this.sub(bu)}reflect(t){return this.sub(bu.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(Yt(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y,i=this.z-t.z;return e*e+n*n+i*i}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,e,n){let i=Math.sin(e)*t;return this.x=i*Math.sin(n),this.y=Math.cos(e)*t,this.z=i*Math.cos(n),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,e,n){return this.x=t*Math.sin(e),this.y=n,this.z=t*Math.cos(e),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this}setFromMatrixScale(t){let e=this.setFromMatrixColumn(t,0).length(),n=this.setFromMatrixColumn(t,1).length(),i=this.setFromMatrixColumn(t,2).length();return this.x=e,this.y=n,this.z=i,this}setFromMatrixColumn(t,e){return this.fromArray(t.elements,e*4)}setFromMatrix3Column(t,e){return this.fromArray(t.elements,e*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let t=Math.random()*Math.PI*2,e=Math.random()*2-1,n=Math.sqrt(1-e*e);return this.x=n*Math.cos(t),this.y=e,this.z=n*Math.sin(t),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},bu=new B,vm=new Ve,jt=class s{constructor(t,e,n,i,r,o,a,c,l){s.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,e,n,i,r,o,a,c,l)}set(t,e,n,i,r,o,a,c,l){let h=this.elements;return h[0]=t,h[1]=i,h[2]=a,h[3]=e,h[4]=r,h[5]=c,h[6]=n,h[7]=o,h[8]=l,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],this}extractBasis(t,e,n){return t.setFromMatrix3Column(this,0),e.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(t){let e=t.elements;return this.set(e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,i=e.elements,r=this.elements,o=n[0],a=n[3],c=n[6],l=n[1],h=n[4],u=n[7],f=n[2],d=n[5],g=n[8],x=i[0],m=i[3],p=i[6],y=i[1],v=i[4],_=i[7],w=i[2],T=i[5],R=i[8];return r[0]=o*x+a*y+c*w,r[3]=o*m+a*v+c*T,r[6]=o*p+a*_+c*R,r[1]=l*x+h*y+u*w,r[4]=l*m+h*v+u*T,r[7]=l*p+h*_+u*R,r[2]=f*x+d*y+g*w,r[5]=f*m+d*v+g*T,r[8]=f*p+d*_+g*R,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[3]*=t,e[6]*=t,e[1]*=t,e[4]*=t,e[7]*=t,e[2]*=t,e[5]*=t,e[8]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],o=t[4],a=t[5],c=t[6],l=t[7],h=t[8];return e*o*h-e*a*l-n*r*h+n*a*c+i*r*l-i*o*c}invert(){let t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],o=t[4],a=t[5],c=t[6],l=t[7],h=t[8],u=h*o-a*l,f=a*c-h*r,d=l*r-o*c,g=e*u+n*f+i*d;if(g===0)return this.set(0,0,0,0,0,0,0,0,0);let x=1/g;return t[0]=u*x,t[1]=(i*l-h*n)*x,t[2]=(a*n-i*o)*x,t[3]=f*x,t[4]=(h*e-i*c)*x,t[5]=(i*r-a*e)*x,t[6]=d*x,t[7]=(n*c-l*e)*x,t[8]=(o*e-n*r)*x,this}transpose(){let t,e=this.elements;return t=e[1],e[1]=e[3],e[3]=t,t=e[2],e[2]=e[6],e[6]=t,t=e[5],e[5]=e[7],e[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){let e=this.elements;return t[0]=e[0],t[1]=e[3],t[2]=e[6],t[3]=e[1],t[4]=e[4],t[5]=e[7],t[6]=e[2],t[7]=e[5],t[8]=e[8],this}setUvTransform(t,e,n,i,r,o,a){let c=Math.cos(r),l=Math.sin(r);return this.set(n*c,n*l,-n*(c*o+l*a)+o+t,-i*l,i*c,-i*(-l*o+c*a)+a+e,0,0,1),this}scale(t,e){return this.premultiply(wu.makeScale(t,e)),this}rotate(t){return this.premultiply(wu.makeRotation(-t)),this}translate(t,e){return this.premultiply(wu.makeTranslation(t,e)),this}makeTranslation(t,e){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,e,0,0,1),this}makeRotation(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,n,e,0,0,0,1),this}makeScale(t,e){return this.set(t,0,0,0,e,0,0,0,1),this}equals(t){let e=this.elements,n=t.elements;for(let i=0;i<9;i++)if(e[i]!==n[i])return!1;return!0}fromArray(t,e=0){for(let n=0;n<9;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t}clone(){return new this.constructor().fromArray(this.elements)}},wu=new jt;function Nf(s){for(let t=s.length-1;t>=0;--t)if(s[t]>=65535)return!0;return!1}function Wr(s){return document.createElementNS("http://www.w3.org/1999/xhtml",s)}function Vg(){let s=Wr("canvas");return s.style.display="block",s}var Sm={};function Xr(s){s in Sm||(Sm[s]=!0,console.warn(s))}function Gg(s,t,e){return new Promise(function(n,i){function r(){switch(s.clientWaitSync(t,s.SYNC_FLUSH_COMMANDS_BIT,0)){case s.WAIT_FAILED:i();break;case s.TIMEOUT_EXPIRED:setTimeout(r,e);break;default:n()}}setTimeout(r,e)})}var Mm=new jt().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),bm=new jt().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function g_(){let s={enabled:!0,workingColorSpace:We,spaces:{},convert:function(i,r,o){return this.enabled===!1||r===o||!r||!o||(this.spaces[r].transfer===Se&&(i.r=ki(i.r),i.g=ki(i.g),i.b=ki(i.b)),this.spaces[r].primaries!==this.spaces[o].primaries&&(i.applyMatrix3(this.spaces[r].toXYZ),i.applyMatrix3(this.spaces[o].fromXYZ)),this.spaces[o].transfer===Se&&(i.r=kr(i.r),i.g=kr(i.g),i.b=kr(i.b))),i},workingToColorSpace:function(i,r){return this.convert(i,this.workingColorSpace,r)},colorSpaceToWorking:function(i,r){return this.convert(i,r,this.workingColorSpace)},getPrimaries:function(i){return this.spaces[i].primaries},getTransfer:function(i){return i===Ji?sa:this.spaces[i].transfer},getToneMappingMode:function(i){return this.spaces[i].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(i,r=this.workingColorSpace){return i.fromArray(this.spaces[r].luminanceCoefficients)},define:function(i){Object.assign(this.spaces,i)},_getMatrix:function(i,r,o){return i.copy(this.spaces[r].toXYZ).multiply(this.spaces[o].fromXYZ)},_getDrawingBufferColorSpace:function(i){return this.spaces[i].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(i=this.workingColorSpace){return this.spaces[i].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(i,r){return Xr("THREE.ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),s.workingToColorSpace(i,r)},toWorkingColorSpace:function(i,r){return Xr("THREE.ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),s.colorSpaceToWorking(i,r)}},t=[.64,.33,.3,.6,.15,.06],e=[.2126,.7152,.0722],n=[.3127,.329];return s.define({[We]:{primaries:t,whitePoint:n,transfer:sa,toXYZ:Mm,fromXYZ:bm,luminanceCoefficients:e,workingColorSpaceConfig:{unpackColorSpace:ze},outputColorSpaceConfig:{drawingBufferColorSpace:ze}},[ze]:{primaries:t,whitePoint:n,transfer:Se,toXYZ:Mm,fromXYZ:bm,luminanceCoefficients:e,outputColorSpaceConfig:{drawingBufferColorSpace:ze}}}),s}var ie=g_();function ki(s){return s<.04045?s*.0773993808:Math.pow(s*.9478672986+.0521327014,2.4)}function kr(s){return s<.0031308?s*12.92:1.055*Math.pow(s,.41666)-.055}var wr,$c=class{static getDataURL(t,e="image/png"){if(/^data:/i.test(t.src)||typeof HTMLCanvasElement>"u")return t.src;let n;if(t instanceof HTMLCanvasElement)n=t;else{wr===void 0&&(wr=Wr("canvas")),wr.width=t.width,wr.height=t.height;let i=wr.getContext("2d");t instanceof ImageData?i.putImageData(t,0,0):i.drawImage(t,0,0,t.width,t.height),n=wr}return n.toDataURL(e)}static sRGBToLinear(t){if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap){let e=Wr("canvas");e.width=t.width,e.height=t.height;let n=e.getContext("2d");n.drawImage(t,0,0,t.width,t.height);let i=n.getImageData(0,0,t.width,t.height),r=i.data;for(let o=0;o<r.length;o++)r[o]=ki(r[o]/255)*255;return n.putImageData(i,0,0),e}else if(t.data){let e=t.data.slice(0);for(let n=0;n<e.length;n++)e instanceof Uint8Array||e instanceof Uint8ClampedArray?e[n]=Math.floor(ki(e[n]/255)*255):e[n]=ki(e[n]);return{data:e,width:t.width,height:t.height}}else return console.warn("THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),t}},x_=0,qr=class{constructor(t=null){this.isSource=!0,Object.defineProperty(this,"id",{value:x_++}),this.uuid=hi(),this.data=t,this.dataReady=!0,this.version=0}getSize(t){let e=this.data;return typeof HTMLVideoElement<"u"&&e instanceof HTMLVideoElement?t.set(e.videoWidth,e.videoHeight,0):e instanceof VideoFrame?t.set(e.displayHeight,e.displayWidth,0):e!==null?t.set(e.width,e.height,e.depth||0):t.set(0,0,0),t}set needsUpdate(t){t===!0&&this.version++}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.images[this.uuid]!==void 0)return t.images[this.uuid];let n={uuid:this.uuid,url:""},i=this.data;if(i!==null){let r;if(Array.isArray(i)){r=[];for(let o=0,a=i.length;o<a;o++)i[o].isDataTexture?r.push(Eu(i[o].image)):r.push(Eu(i[o]))}else r=Eu(i);n.url=r}return e||(t.images[this.uuid]=n),n}};function Eu(s){return typeof HTMLImageElement<"u"&&s instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&s instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&s instanceof ImageBitmap?$c.getDataURL(s):s.data?{data:Array.from(s.data),width:s.width,height:s.height,type:s.data.constructor.name}:(console.warn("THREE.Texture: Unable to serialize Texture."),{})}var y_=0,Tu=new B,Je=class s extends Hi{constructor(t=s.DEFAULT_IMAGE,e=s.DEFAULT_MAPPING,n=vi,i=vi,r=Ye,o=Un,a=Mn,c=fi,l=s.DEFAULT_ANISOTROPY,h=Ji){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:y_++}),this.uuid=hi(),this.name="",this.source=new qr(t),this.mipmaps=[],this.mapping=e,this.channel=0,this.wrapS=n,this.wrapT=i,this.magFilter=r,this.minFilter=o,this.anisotropy=l,this.format=a,this.internalFormat=null,this.type=c,this.offset=new Ht(0,0),this.repeat=new Ht(1,1),this.center=new Ht(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new jt,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(t&&t.depth&&t.depth>1),this.pmremVersion=0}get width(){return this.source.getSize(Tu).x}get height(){return this.source.getSize(Tu).y}get depth(){return this.source.getSize(Tu).z}get image(){return this.source.data}set image(t=null){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.renderTarget=t.renderTarget,this.isRenderTargetTexture=t.isRenderTargetTexture,this.isArrayTexture=t.isArrayTexture,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}setValues(t){for(let e in t){let n=t[e];if(n===void 0){console.warn(`THREE.Texture.setValues(): parameter '${e}' has value of undefined.`);continue}let i=this[e];if(i===void 0){console.warn(`THREE.Texture.setValues(): property '${e}' does not exist.`);continue}i&&n&&i.isVector2&&n.isVector2||i&&n&&i.isVector3&&n.isVector3||i&&n&&i.isMatrix3&&n.isMatrix3?i.copy(n):this[e]=n}}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];let n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),e||(t.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==_f)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case Mi:t.x=t.x-Math.floor(t.x);break;case vi:t.x=t.x<0?0:1;break;case Vr:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x=t.x-Math.floor(t.x);break}if(t.y<0||t.y>1)switch(this.wrapT){case Mi:t.y=t.y-Math.floor(t.y);break;case vi:t.y=t.y<0?0:1;break;case Vr:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y=t.y-Math.floor(t.y);break}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(t){t===!0&&this.pmremVersion++}};Je.DEFAULT_IMAGE=null;Je.DEFAULT_MAPPING=_f;Je.DEFAULT_ANISOTROPY=1;var de=class s{constructor(t=0,e=0,n=0,i=1){s.prototype.isVector4=!0,this.x=t,this.y=e,this.z=n,this.w=i}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,e,n,i){return this.x=t,this.y=e,this.z=n,this.w=i,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;case 3:this.w=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w!==void 0?t.w:1,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this.w=t.w+e.w,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this.w+=t.w*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this.w=t.w-e.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){let e=this.x,n=this.y,i=this.z,r=this.w,o=t.elements;return this.x=o[0]*e+o[4]*n+o[8]*i+o[12]*r,this.y=o[1]*e+o[5]*n+o[9]*i+o[13]*r,this.z=o[2]*e+o[6]*n+o[10]*i+o[14]*r,this.w=o[3]*e+o[7]*n+o[11]*i+o[15]*r,this}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this.w/=t.w,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);let e=Math.sqrt(1-t.w*t.w);return e<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/e,this.y=t.y/e,this.z=t.z/e),this}setAxisAngleFromRotationMatrix(t){let e,n,i,r,c=t.elements,l=c[0],h=c[4],u=c[8],f=c[1],d=c[5],g=c[9],x=c[2],m=c[6],p=c[10];if(Math.abs(h-f)<.01&&Math.abs(u-x)<.01&&Math.abs(g-m)<.01){if(Math.abs(h+f)<.1&&Math.abs(u+x)<.1&&Math.abs(g+m)<.1&&Math.abs(l+d+p-3)<.1)return this.set(1,0,0,0),this;e=Math.PI;let v=(l+1)/2,_=(d+1)/2,w=(p+1)/2,T=(h+f)/4,R=(u+x)/4,L=(g+m)/4;return v>_&&v>w?v<.01?(n=0,i=.707106781,r=.707106781):(n=Math.sqrt(v),i=T/n,r=R/n):_>w?_<.01?(n=.707106781,i=0,r=.707106781):(i=Math.sqrt(_),n=T/i,r=L/i):w<.01?(n=.707106781,i=.707106781,r=0):(r=Math.sqrt(w),n=R/r,i=L/r),this.set(n,i,r,e),this}let y=Math.sqrt((m-g)*(m-g)+(u-x)*(u-x)+(f-h)*(f-h));return Math.abs(y)<.001&&(y=1),this.x=(m-g)/y,this.y=(u-x)/y,this.z=(f-h)/y,this.w=Math.acos((l+d+p-1)/2),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this.w=e[15],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,e){return this.x=Yt(this.x,t.x,e.x),this.y=Yt(this.y,t.y,e.y),this.z=Yt(this.z,t.z,e.z),this.w=Yt(this.w,t.w,e.w),this}clampScalar(t,e){return this.x=Yt(this.x,t,e),this.y=Yt(this.y,t,e),this.z=Yt(this.z,t,e),this.w=Yt(this.w,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Yt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this.w+=(t.w-this.w)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this.w=t.w+(e.w-t.w)*n,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this.w=t[e+3],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t[e+3]=this.w,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this.w=t.getW(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},Yc=class extends Hi{constructor(t=1,e=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Ye,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1},n),this.isRenderTarget=!0,this.width=t,this.height=e,this.depth=n.depth,this.scissor=new de(0,0,t,e),this.scissorTest=!1,this.viewport=new de(0,0,t,e);let i={width:t,height:e,depth:n.depth},r=new Je(i);this.textures=[];let o=n.count;for(let a=0;a<o;a++)this.textures[a]=r.clone(),this.textures[a].isRenderTargetTexture=!0,this.textures[a].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview}_setTextureOptions(t={}){let e={minFilter:Ye,generateMipmaps:!1,flipY:!1,internalFormat:null};t.mapping!==void 0&&(e.mapping=t.mapping),t.wrapS!==void 0&&(e.wrapS=t.wrapS),t.wrapT!==void 0&&(e.wrapT=t.wrapT),t.wrapR!==void 0&&(e.wrapR=t.wrapR),t.magFilter!==void 0&&(e.magFilter=t.magFilter),t.minFilter!==void 0&&(e.minFilter=t.minFilter),t.format!==void 0&&(e.format=t.format),t.type!==void 0&&(e.type=t.type),t.anisotropy!==void 0&&(e.anisotropy=t.anisotropy),t.colorSpace!==void 0&&(e.colorSpace=t.colorSpace),t.flipY!==void 0&&(e.flipY=t.flipY),t.generateMipmaps!==void 0&&(e.generateMipmaps=t.generateMipmaps),t.internalFormat!==void 0&&(e.internalFormat=t.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(e)}get texture(){return this.textures[0]}set texture(t){this.textures[0]=t}set depthTexture(t){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),t!==null&&(t.renderTarget=this),this._depthTexture=t}get depthTexture(){return this._depthTexture}setSize(t,e,n=1){if(this.width!==t||this.height!==e||this.depth!==n){this.width=t,this.height=e,this.depth=n;for(let i=0,r=this.textures.length;i<r;i++)this.textures[i].image.width=t,this.textures[i].image.height=e,this.textures[i].image.depth=n,this.textures[i].isArrayTexture=this.textures[i].image.depth>1;this.dispose()}this.viewport.set(0,0,t,e),this.scissor.set(0,0,t,e)}clone(){return new this.constructor().copy(this)}copy(t){this.width=t.width,this.height=t.height,this.depth=t.depth,this.scissor.copy(t.scissor),this.scissorTest=t.scissorTest,this.viewport.copy(t.viewport),this.textures.length=0;for(let e=0,n=t.textures.length;e<n;e++){this.textures[e]=t.textures[e].clone(),this.textures[e].isRenderTargetTexture=!0,this.textures[e].renderTarget=this;let i=Object.assign({},t.textures[e].image);this.textures[e].source=new qr(i)}return this.depthBuffer=t.depthBuffer,this.stencilBuffer=t.stencilBuffer,this.resolveDepthBuffer=t.resolveDepthBuffer,this.resolveStencilBuffer=t.resolveStencilBuffer,t.depthTexture!==null&&(this.depthTexture=t.depthTexture.clone()),this.samples=t.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}},qn=class extends Yc{constructor(t=1,e=1,n={}){super(t,e,n),this.isWebGLRenderTarget=!0}},oa=class extends Je{constructor(t=null,e=1,n=1,i=1){super(null),this.isDataArrayTexture=!0,this.image={data:t,width:e,height:n,depth:i},this.magFilter=Qe,this.minFilter=Qe,this.wrapR=vi,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(t){this.layerUpdates.add(t)}clearLayerUpdates(){this.layerUpdates.clear()}};var Jc=class extends Je{constructor(t=null,e=1,n=1,i=1){super(null),this.isData3DTexture=!0,this.image={data:t,width:e,height:n,depth:i},this.magFilter=Qe,this.minFilter=Qe,this.wrapR=vi,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var le=class{constructor(t=new B(1/0,1/0,1/0),e=new B(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=t,this.max=e}set(t,e){return this.min.copy(t),this.max.copy(e),this}setFromArray(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e+=3)this.expandByPoint(ri.fromArray(t,e));return this}setFromBufferAttribute(t){this.makeEmpty();for(let e=0,n=t.count;e<n;e++)this.expandByPoint(ri.fromBufferAttribute(t,e));return this}setFromPoints(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e++)this.expandByPoint(t[e]);return this}setFromCenterAndSize(t,e){let n=ri.copy(e).multiplyScalar(.5);return this.min.copy(t).sub(n),this.max.copy(t).add(n),this}setFromObject(t,e=!1){return this.makeEmpty(),this.expandByObject(t,e)}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(t){return this.isEmpty()?t.set(0,0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}expandByObject(t,e=!1){t.updateWorldMatrix(!1,!1);let n=t.geometry;if(n!==void 0){let r=n.getAttribute("position");if(e===!0&&r!==void 0&&t.isInstancedMesh!==!0)for(let o=0,a=r.count;o<a;o++)t.isMesh===!0?t.getVertexPosition(o,ri):ri.fromBufferAttribute(r,o),ri.applyMatrix4(t.matrixWorld),this.expandByPoint(ri);else t.boundingBox!==void 0?(t.boundingBox===null&&t.computeBoundingBox(),yc.copy(t.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),yc.copy(n.boundingBox)),yc.applyMatrix4(t.matrixWorld),this.union(yc)}let i=t.children;for(let r=0,o=i.length;r<o;r++)this.expandByObject(i[r],e);return this}containsPoint(t){return t.x>=this.min.x&&t.x<=this.max.x&&t.y>=this.min.y&&t.y<=this.max.y&&t.z>=this.min.z&&t.z<=this.max.z}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y&&this.min.z<=t.min.z&&t.max.z<=this.max.z}getParameter(t,e){return e.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y),(t.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(t){return t.max.x>=this.min.x&&t.min.x<=this.max.x&&t.max.y>=this.min.y&&t.min.y<=this.max.y&&t.max.z>=this.min.z&&t.min.z<=this.max.z}intersectsSphere(t){return this.clampPoint(t.center,ri),ri.distanceToSquared(t.center)<=t.radius*t.radius}intersectsPlane(t){let e,n;return t.normal.x>0?(e=t.normal.x*this.min.x,n=t.normal.x*this.max.x):(e=t.normal.x*this.max.x,n=t.normal.x*this.min.x),t.normal.y>0?(e+=t.normal.y*this.min.y,n+=t.normal.y*this.max.y):(e+=t.normal.y*this.max.y,n+=t.normal.y*this.min.y),t.normal.z>0?(e+=t.normal.z*this.min.z,n+=t.normal.z*this.max.z):(e+=t.normal.z*this.max.z,n+=t.normal.z*this.min.z),e<=-t.constant&&n>=-t.constant}intersectsTriangle(t){if(this.isEmpty())return!1;this.getCenter(Yo),_c.subVectors(this.max,Yo),Er.subVectors(t.a,Yo),Tr.subVectors(t.b,Yo),Ar.subVectors(t.c,Yo),rs.subVectors(Tr,Er),os.subVectors(Ar,Tr),Ns.subVectors(Er,Ar);let e=[0,-rs.z,rs.y,0,-os.z,os.y,0,-Ns.z,Ns.y,rs.z,0,-rs.x,os.z,0,-os.x,Ns.z,0,-Ns.x,-rs.y,rs.x,0,-os.y,os.x,0,-Ns.y,Ns.x,0];return!Au(e,Er,Tr,Ar,_c)||(e=[1,0,0,0,1,0,0,0,1],!Au(e,Er,Tr,Ar,_c))?!1:(vc.crossVectors(rs,os),e=[vc.x,vc.y,vc.z],Au(e,Er,Tr,Ar,_c))}clampPoint(t,e){return e.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,ri).distanceTo(t)}getBoundingSphere(t){return this.isEmpty()?t.makeEmpty():(this.getCenter(t.center),t.radius=this.getSize(ri).length()*.5),t}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}applyMatrix4(t){return this.isEmpty()?this:(Ni[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(t),Ni[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(t),Ni[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(t),Ni[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(t),Ni[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(t),Ni[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(t),Ni[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(t),Ni[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(t),this.setFromPoints(Ni),this)}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(t){return this.min.fromArray(t.min),this.max.fromArray(t.max),this}},Ni=[new B,new B,new B,new B,new B,new B,new B,new B],ri=new B,yc=new le,Er=new B,Tr=new B,Ar=new B,rs=new B,os=new B,Ns=new B,Yo=new B,_c=new B,vc=new B,Ds=new B;function Au(s,t,e,n,i){for(let r=0,o=s.length-3;r<=o;r+=3){Ds.fromArray(s,r);let a=i.x*Math.abs(Ds.x)+i.y*Math.abs(Ds.y)+i.z*Math.abs(Ds.z),c=t.dot(Ds),l=e.dot(Ds),h=n.dot(Ds);if(Math.max(-Math.max(c,l,h),Math.min(c,l,h))>a)return!1}return!0}var __=new le,Jo=new B,Ru=new B,En=class{constructor(t=new B,e=-1){this.isSphere=!0,this.center=t,this.radius=e}set(t,e){return this.center.copy(t),this.radius=e,this}setFromPoints(t,e){let n=this.center;e!==void 0?n.copy(e):__.setFromPoints(t).getCenter(n);let i=0;for(let r=0,o=t.length;r<o;r++)i=Math.max(i,n.distanceToSquared(t[r]));return this.radius=Math.sqrt(i),this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(t){return t.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(t){return t.distanceTo(this.center)-this.radius}intersectsSphere(t){let e=this.radius+t.radius;return t.center.distanceToSquared(this.center)<=e*e}intersectsBox(t){return t.intersectsSphere(this)}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}clampPoint(t,e){let n=this.center.distanceToSquared(t);return e.copy(t),n>this.radius*this.radius&&(e.sub(this.center).normalize(),e.multiplyScalar(this.radius).add(this.center)),e}getBoundingBox(t){return this.isEmpty()?(t.makeEmpty(),t):(t.set(this.center,this.center),t.expandByScalar(this.radius),t)}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScaleOnAxis(),this}translate(t){return this.center.add(t),this}expandByPoint(t){if(this.isEmpty())return this.center.copy(t),this.radius=0,this;Jo.subVectors(t,this.center);let e=Jo.lengthSq();if(e>this.radius*this.radius){let n=Math.sqrt(e),i=(n-this.radius)*.5;this.center.addScaledVector(Jo,i/n),this.radius+=i}return this}union(t){return t.isEmpty()?this:this.isEmpty()?(this.copy(t),this):(this.center.equals(t.center)===!0?this.radius=Math.max(this.radius,t.radius):(Ru.subVectors(t.center,this.center).setLength(t.radius),this.expandByPoint(Jo.copy(t.center).add(Ru)),this.expandByPoint(Jo.copy(t.center).sub(Ru))),this)}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(t){return this.radius=t.radius,this.center.fromArray(t.center),this}},Di=new B,Cu=new B,Sc=new B,as=new B,Iu=new B,Mc=new B,Pu=new B,dn=class{constructor(t=new B,e=new B(0,0,-1)){this.origin=t,this.direction=e}set(t,e){return this.origin.copy(t),this.direction.copy(e),this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}at(t,e){return e.copy(this.origin).addScaledVector(this.direction,t)}lookAt(t){return this.direction.copy(t).sub(this.origin).normalize(),this}recast(t){return this.origin.copy(this.at(t,Di)),this}closestPointToPoint(t,e){e.subVectors(t,this.origin);let n=e.dot(this.direction);return n<0?e.copy(this.origin):e.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(t){return Math.sqrt(this.distanceSqToPoint(t))}distanceSqToPoint(t){let e=Di.subVectors(t,this.origin).dot(this.direction);return e<0?this.origin.distanceToSquared(t):(Di.copy(this.origin).addScaledVector(this.direction,e),Di.distanceToSquared(t))}distanceSqToSegment(t,e,n,i){Cu.copy(t).add(e).multiplyScalar(.5),Sc.copy(e).sub(t).normalize(),as.copy(this.origin).sub(Cu);let r=t.distanceTo(e)*.5,o=-this.direction.dot(Sc),a=as.dot(this.direction),c=-as.dot(Sc),l=as.lengthSq(),h=Math.abs(1-o*o),u,f,d,g;if(h>0)if(u=o*c-a,f=o*a-c,g=r*h,u>=0)if(f>=-g)if(f<=g){let x=1/h;u*=x,f*=x,d=u*(u+o*f+2*a)+f*(o*u+f+2*c)+l}else f=r,u=Math.max(0,-(o*f+a)),d=-u*u+f*(f+2*c)+l;else f=-r,u=Math.max(0,-(o*f+a)),d=-u*u+f*(f+2*c)+l;else f<=-g?(u=Math.max(0,-(-o*r+a)),f=u>0?-r:Math.min(Math.max(-r,-c),r),d=-u*u+f*(f+2*c)+l):f<=g?(u=0,f=Math.min(Math.max(-r,-c),r),d=f*(f+2*c)+l):(u=Math.max(0,-(o*r+a)),f=u>0?r:Math.min(Math.max(-r,-c),r),d=-u*u+f*(f+2*c)+l);else f=o>0?-r:r,u=Math.max(0,-(o*f+a)),d=-u*u+f*(f+2*c)+l;return n&&n.copy(this.origin).addScaledVector(this.direction,u),i&&i.copy(Cu).addScaledVector(Sc,f),d}intersectSphere(t,e){Di.subVectors(t.center,this.origin);let n=Di.dot(this.direction),i=Di.dot(Di)-n*n,r=t.radius*t.radius;if(i>r)return null;let o=Math.sqrt(r-i),a=n-o,c=n+o;return c<0?null:a<0?this.at(c,e):this.at(a,e)}intersectsSphere(t){return t.radius<0?!1:this.distanceSqToPoint(t.center)<=t.radius*t.radius}distanceToPlane(t){let e=t.normal.dot(this.direction);if(e===0)return t.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(t.normal)+t.constant)/e;return n>=0?n:null}intersectPlane(t,e){let n=this.distanceToPlane(t);return n===null?null:this.at(n,e)}intersectsPlane(t){let e=t.distanceToPoint(this.origin);return e===0||t.normal.dot(this.direction)*e<0}intersectBox(t,e){let n,i,r,o,a,c,l=1/this.direction.x,h=1/this.direction.y,u=1/this.direction.z,f=this.origin;return l>=0?(n=(t.min.x-f.x)*l,i=(t.max.x-f.x)*l):(n=(t.max.x-f.x)*l,i=(t.min.x-f.x)*l),h>=0?(r=(t.min.y-f.y)*h,o=(t.max.y-f.y)*h):(r=(t.max.y-f.y)*h,o=(t.min.y-f.y)*h),n>o||r>i||((r>n||isNaN(n))&&(n=r),(o<i||isNaN(i))&&(i=o),u>=0?(a=(t.min.z-f.z)*u,c=(t.max.z-f.z)*u):(a=(t.max.z-f.z)*u,c=(t.min.z-f.z)*u),n>c||a>i)||((a>n||n!==n)&&(n=a),(c<i||i!==i)&&(i=c),i<0)?null:this.at(n>=0?n:i,e)}intersectsBox(t){return this.intersectBox(t,Di)!==null}intersectTriangle(t,e,n,i,r){Iu.subVectors(e,t),Mc.subVectors(n,t),Pu.crossVectors(Iu,Mc);let o=this.direction.dot(Pu),a;if(o>0){if(i)return null;a=1}else if(o<0)a=-1,o=-o;else return null;as.subVectors(this.origin,t);let c=a*this.direction.dot(Mc.crossVectors(as,Mc));if(c<0)return null;let l=a*this.direction.dot(Iu.cross(as));if(l<0||c+l>o)return null;let h=-a*as.dot(Pu);return h<0?null:this.at(h/o,r)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},Pt=class s{constructor(t,e,n,i,r,o,a,c,l,h,u,f,d,g,x,m){s.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,e,n,i,r,o,a,c,l,h,u,f,d,g,x,m)}set(t,e,n,i,r,o,a,c,l,h,u,f,d,g,x,m){let p=this.elements;return p[0]=t,p[4]=e,p[8]=n,p[12]=i,p[1]=r,p[5]=o,p[9]=a,p[13]=c,p[2]=l,p[6]=h,p[10]=u,p[14]=f,p[3]=d,p[7]=g,p[11]=x,p[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new s().fromArray(this.elements)}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],e[9]=n[9],e[10]=n[10],e[11]=n[11],e[12]=n[12],e[13]=n[13],e[14]=n[14],e[15]=n[15],this}copyPosition(t){let e=this.elements,n=t.elements;return e[12]=n[12],e[13]=n[13],e[14]=n[14],this}setFromMatrix3(t){let e=t.elements;return this.set(e[0],e[3],e[6],0,e[1],e[4],e[7],0,e[2],e[5],e[8],0,0,0,0,1),this}extractBasis(t,e,n){return t.setFromMatrixColumn(this,0),e.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this}makeBasis(t,e,n){return this.set(t.x,e.x,n.x,0,t.y,e.y,n.y,0,t.z,e.z,n.z,0,0,0,0,1),this}extractRotation(t){let e=this.elements,n=t.elements,i=1/Rr.setFromMatrixColumn(t,0).length(),r=1/Rr.setFromMatrixColumn(t,1).length(),o=1/Rr.setFromMatrixColumn(t,2).length();return e[0]=n[0]*i,e[1]=n[1]*i,e[2]=n[2]*i,e[3]=0,e[4]=n[4]*r,e[5]=n[5]*r,e[6]=n[6]*r,e[7]=0,e[8]=n[8]*o,e[9]=n[9]*o,e[10]=n[10]*o,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromEuler(t){let e=this.elements,n=t.x,i=t.y,r=t.z,o=Math.cos(n),a=Math.sin(n),c=Math.cos(i),l=Math.sin(i),h=Math.cos(r),u=Math.sin(r);if(t.order==="XYZ"){let f=o*h,d=o*u,g=a*h,x=a*u;e[0]=c*h,e[4]=-c*u,e[8]=l,e[1]=d+g*l,e[5]=f-x*l,e[9]=-a*c,e[2]=x-f*l,e[6]=g+d*l,e[10]=o*c}else if(t.order==="YXZ"){let f=c*h,d=c*u,g=l*h,x=l*u;e[0]=f+x*a,e[4]=g*a-d,e[8]=o*l,e[1]=o*u,e[5]=o*h,e[9]=-a,e[2]=d*a-g,e[6]=x+f*a,e[10]=o*c}else if(t.order==="ZXY"){let f=c*h,d=c*u,g=l*h,x=l*u;e[0]=f-x*a,e[4]=-o*u,e[8]=g+d*a,e[1]=d+g*a,e[5]=o*h,e[9]=x-f*a,e[2]=-o*l,e[6]=a,e[10]=o*c}else if(t.order==="ZYX"){let f=o*h,d=o*u,g=a*h,x=a*u;e[0]=c*h,e[4]=g*l-d,e[8]=f*l+x,e[1]=c*u,e[5]=x*l+f,e[9]=d*l-g,e[2]=-l,e[6]=a*c,e[10]=o*c}else if(t.order==="YZX"){let f=o*c,d=o*l,g=a*c,x=a*l;e[0]=c*h,e[4]=x-f*u,e[8]=g*u+d,e[1]=u,e[5]=o*h,e[9]=-a*h,e[2]=-l*h,e[6]=d*u+g,e[10]=f-x*u}else if(t.order==="XZY"){let f=o*c,d=o*l,g=a*c,x=a*l;e[0]=c*h,e[4]=-u,e[8]=l*h,e[1]=f*u+x,e[5]=o*h,e[9]=d*u-g,e[2]=g*u-d,e[6]=a*h,e[10]=x*u+f}return e[3]=0,e[7]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromQuaternion(t){return this.compose(v_,t,S_)}lookAt(t,e,n){let i=this.elements;return Nn.subVectors(t,e),Nn.lengthSq()===0&&(Nn.z=1),Nn.normalize(),cs.crossVectors(n,Nn),cs.lengthSq()===0&&(Math.abs(n.z)===1?Nn.x+=1e-4:Nn.z+=1e-4,Nn.normalize(),cs.crossVectors(n,Nn)),cs.normalize(),bc.crossVectors(Nn,cs),i[0]=cs.x,i[4]=bc.x,i[8]=Nn.x,i[1]=cs.y,i[5]=bc.y,i[9]=Nn.y,i[2]=cs.z,i[6]=bc.z,i[10]=Nn.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,i=e.elements,r=this.elements,o=n[0],a=n[4],c=n[8],l=n[12],h=n[1],u=n[5],f=n[9],d=n[13],g=n[2],x=n[6],m=n[10],p=n[14],y=n[3],v=n[7],_=n[11],w=n[15],T=i[0],R=i[4],L=i[8],S=i[12],M=i[1],b=i[5],A=i[9],N=i[13],C=i[2],I=i[6],O=i[10],k=i[14],z=i[3],et=i[7],j=i[11],W=i[15];return r[0]=o*T+a*M+c*C+l*z,r[4]=o*R+a*b+c*I+l*et,r[8]=o*L+a*A+c*O+l*j,r[12]=o*S+a*N+c*k+l*W,r[1]=h*T+u*M+f*C+d*z,r[5]=h*R+u*b+f*I+d*et,r[9]=h*L+u*A+f*O+d*j,r[13]=h*S+u*N+f*k+d*W,r[2]=g*T+x*M+m*C+p*z,r[6]=g*R+x*b+m*I+p*et,r[10]=g*L+x*A+m*O+p*j,r[14]=g*S+x*N+m*k+p*W,r[3]=y*T+v*M+_*C+w*z,r[7]=y*R+v*b+_*I+w*et,r[11]=y*L+v*A+_*O+w*j,r[15]=y*S+v*N+_*k+w*W,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[4]*=t,e[8]*=t,e[12]*=t,e[1]*=t,e[5]*=t,e[9]*=t,e[13]*=t,e[2]*=t,e[6]*=t,e[10]*=t,e[14]*=t,e[3]*=t,e[7]*=t,e[11]*=t,e[15]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[4],i=t[8],r=t[12],o=t[1],a=t[5],c=t[9],l=t[13],h=t[2],u=t[6],f=t[10],d=t[14],g=t[3],x=t[7],m=t[11],p=t[15];return g*(+r*c*u-i*l*u-r*a*f+n*l*f+i*a*d-n*c*d)+x*(+e*c*d-e*l*f+r*o*f-i*o*d+i*l*h-r*c*h)+m*(+e*l*u-e*a*d-r*o*u+n*o*d+r*a*h-n*l*h)+p*(-i*a*h-e*c*u+e*a*f+i*o*u-n*o*f+n*c*h)}transpose(){let t=this.elements,e;return e=t[1],t[1]=t[4],t[4]=e,e=t[2],t[2]=t[8],t[8]=e,e=t[6],t[6]=t[9],t[9]=e,e=t[3],t[3]=t[12],t[12]=e,e=t[7],t[7]=t[13],t[13]=e,e=t[11],t[11]=t[14],t[14]=e,this}setPosition(t,e,n){let i=this.elements;return t.isVector3?(i[12]=t.x,i[13]=t.y,i[14]=t.z):(i[12]=t,i[13]=e,i[14]=n),this}invert(){let t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],o=t[4],a=t[5],c=t[6],l=t[7],h=t[8],u=t[9],f=t[10],d=t[11],g=t[12],x=t[13],m=t[14],p=t[15],y=u*m*l-x*f*l+x*c*d-a*m*d-u*c*p+a*f*p,v=g*f*l-h*m*l-g*c*d+o*m*d+h*c*p-o*f*p,_=h*x*l-g*u*l+g*a*d-o*x*d-h*a*p+o*u*p,w=g*u*c-h*x*c-g*a*f+o*x*f+h*a*m-o*u*m,T=e*y+n*v+i*_+r*w;if(T===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let R=1/T;return t[0]=y*R,t[1]=(x*f*r-u*m*r-x*i*d+n*m*d+u*i*p-n*f*p)*R,t[2]=(a*m*r-x*c*r+x*i*l-n*m*l-a*i*p+n*c*p)*R,t[3]=(u*c*r-a*f*r-u*i*l+n*f*l+a*i*d-n*c*d)*R,t[4]=v*R,t[5]=(h*m*r-g*f*r+g*i*d-e*m*d-h*i*p+e*f*p)*R,t[6]=(g*c*r-o*m*r-g*i*l+e*m*l+o*i*p-e*c*p)*R,t[7]=(o*f*r-h*c*r+h*i*l-e*f*l-o*i*d+e*c*d)*R,t[8]=_*R,t[9]=(g*u*r-h*x*r-g*n*d+e*x*d+h*n*p-e*u*p)*R,t[10]=(o*x*r-g*a*r+g*n*l-e*x*l-o*n*p+e*a*p)*R,t[11]=(h*a*r-o*u*r-h*n*l+e*u*l+o*n*d-e*a*d)*R,t[12]=w*R,t[13]=(h*x*i-g*u*i+g*n*f-e*x*f-h*n*m+e*u*m)*R,t[14]=(g*a*i-o*x*i-g*n*c+e*x*c+o*n*m-e*a*m)*R,t[15]=(o*u*i-h*a*i+h*n*c-e*u*c-o*n*f+e*a*f)*R,this}scale(t){let e=this.elements,n=t.x,i=t.y,r=t.z;return e[0]*=n,e[4]*=i,e[8]*=r,e[1]*=n,e[5]*=i,e[9]*=r,e[2]*=n,e[6]*=i,e[10]*=r,e[3]*=n,e[7]*=i,e[11]*=r,this}getMaxScaleOnAxis(){let t=this.elements,e=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],n=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],i=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(e,n,i))}makeTranslation(t,e,n){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,e,0,0,1,n,0,0,0,1),this}makeRotationX(t){let e=Math.cos(t),n=Math.sin(t);return this.set(1,0,0,0,0,e,-n,0,0,n,e,0,0,0,0,1),this}makeRotationY(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,0,n,0,0,1,0,0,-n,0,e,0,0,0,0,1),this}makeRotationZ(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,0,n,e,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,e){let n=Math.cos(e),i=Math.sin(e),r=1-n,o=t.x,a=t.y,c=t.z,l=r*o,h=r*a;return this.set(l*o+n,l*a-i*c,l*c+i*a,0,l*a+i*c,h*a+n,h*c-i*o,0,l*c-i*a,h*c+i*o,r*c*c+n,0,0,0,0,1),this}makeScale(t,e,n){return this.set(t,0,0,0,0,e,0,0,0,0,n,0,0,0,0,1),this}makeShear(t,e,n,i,r,o){return this.set(1,n,r,0,t,1,o,0,e,i,1,0,0,0,0,1),this}compose(t,e,n){let i=this.elements,r=e._x,o=e._y,a=e._z,c=e._w,l=r+r,h=o+o,u=a+a,f=r*l,d=r*h,g=r*u,x=o*h,m=o*u,p=a*u,y=c*l,v=c*h,_=c*u,w=n.x,T=n.y,R=n.z;return i[0]=(1-(x+p))*w,i[1]=(d+_)*w,i[2]=(g-v)*w,i[3]=0,i[4]=(d-_)*T,i[5]=(1-(f+p))*T,i[6]=(m+y)*T,i[7]=0,i[8]=(g+v)*R,i[9]=(m-y)*R,i[10]=(1-(f+x))*R,i[11]=0,i[12]=t.x,i[13]=t.y,i[14]=t.z,i[15]=1,this}decompose(t,e,n){let i=this.elements,r=Rr.set(i[0],i[1],i[2]).length(),o=Rr.set(i[4],i[5],i[6]).length(),a=Rr.set(i[8],i[9],i[10]).length();this.determinant()<0&&(r=-r),t.x=i[12],t.y=i[13],t.z=i[14],oi.copy(this);let l=1/r,h=1/o,u=1/a;return oi.elements[0]*=l,oi.elements[1]*=l,oi.elements[2]*=l,oi.elements[4]*=h,oi.elements[5]*=h,oi.elements[6]*=h,oi.elements[8]*=u,oi.elements[9]*=u,oi.elements[10]*=u,e.setFromRotationMatrix(oi),n.x=r,n.y=o,n.z=a,this}makePerspective(t,e,n,i,r,o,a=li,c=!1){let l=this.elements,h=2*r/(e-t),u=2*r/(n-i),f=(e+t)/(e-t),d=(n+i)/(n-i),g,x;if(c)g=r/(o-r),x=o*r/(o-r);else if(a===li)g=-(o+r)/(o-r),x=-2*o*r/(o-r);else if(a===ra)g=-o/(o-r),x=-o*r/(o-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+a);return l[0]=h,l[4]=0,l[8]=f,l[12]=0,l[1]=0,l[5]=u,l[9]=d,l[13]=0,l[2]=0,l[6]=0,l[10]=g,l[14]=x,l[3]=0,l[7]=0,l[11]=-1,l[15]=0,this}makeOrthographic(t,e,n,i,r,o,a=li,c=!1){let l=this.elements,h=2/(e-t),u=2/(n-i),f=-(e+t)/(e-t),d=-(n+i)/(n-i),g,x;if(c)g=1/(o-r),x=o/(o-r);else if(a===li)g=-2/(o-r),x=-(o+r)/(o-r);else if(a===ra)g=-1/(o-r),x=-r/(o-r);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+a);return l[0]=h,l[4]=0,l[8]=0,l[12]=f,l[1]=0,l[5]=u,l[9]=0,l[13]=d,l[2]=0,l[6]=0,l[10]=g,l[14]=x,l[3]=0,l[7]=0,l[11]=0,l[15]=1,this}equals(t){let e=this.elements,n=t.elements;for(let i=0;i<16;i++)if(e[i]!==n[i])return!1;return!0}fromArray(t,e=0){for(let n=0;n<16;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t[e+9]=n[9],t[e+10]=n[10],t[e+11]=n[11],t[e+12]=n[12],t[e+13]=n[13],t[e+14]=n[14],t[e+15]=n[15],t}},Rr=new B,oi=new Pt,v_=new B(0,0,0),S_=new B(1,1,1),cs=new B,bc=new B,Nn=new B,wm=new Pt,Em=new Ve,pn=class s{constructor(t=0,e=0,n=0,i=s.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=e,this._z=n,this._order=i}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,e,n,i=this._order){return this._x=t,this._y=e,this._z=n,this._order=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,e=this._order,n=!0){let i=t.elements,r=i[0],o=i[4],a=i[8],c=i[1],l=i[5],h=i[9],u=i[2],f=i[6],d=i[10];switch(e){case"XYZ":this._y=Math.asin(Yt(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(-h,d),this._z=Math.atan2(-o,r)):(this._x=Math.atan2(f,l),this._z=0);break;case"YXZ":this._x=Math.asin(-Yt(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(a,d),this._z=Math.atan2(c,l)):(this._y=Math.atan2(-u,r),this._z=0);break;case"ZXY":this._x=Math.asin(Yt(f,-1,1)),Math.abs(f)<.9999999?(this._y=Math.atan2(-u,d),this._z=Math.atan2(-o,l)):(this._y=0,this._z=Math.atan2(c,r));break;case"ZYX":this._y=Math.asin(-Yt(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(f,d),this._z=Math.atan2(c,r)):(this._x=0,this._z=Math.atan2(-o,l));break;case"YZX":this._z=Math.asin(Yt(c,-1,1)),Math.abs(c)<.9999999?(this._x=Math.atan2(-h,l),this._y=Math.atan2(-u,r)):(this._x=0,this._y=Math.atan2(a,d));break;case"XZY":this._z=Math.asin(-Yt(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(f,l),this._y=Math.atan2(a,r)):(this._x=Math.atan2(-h,d),this._y=0);break;default:console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: "+e)}return this._order=e,n===!0&&this._onChangeCallback(),this}setFromQuaternion(t,e,n){return wm.makeRotationFromQuaternion(t),this.setFromRotationMatrix(wm,e,n)}setFromVector3(t,e=this._order){return this.set(t.x,t.y,t.z,e)}reorder(t){return Em.setFromEuler(this),this.setFromQuaternion(Em,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};pn.DEFAULT_ORDER="XYZ";var $r=class{constructor(){this.mask=1}set(t){this.mask=(1<<t|0)>>>0}enable(t){this.mask|=1<<t|0}enableAll(){this.mask=-1}toggle(t){this.mask^=1<<t|0}disable(t){this.mask&=~(1<<t|0)}disableAll(){this.mask=0}test(t){return(this.mask&t.mask)!==0}isEnabled(t){return(this.mask&(1<<t|0))!==0}},M_=0,Tm=new B,Cr=new Ve,Oi=new Pt,wc=new B,Ko=new B,b_=new B,w_=new Ve,Am=new B(1,0,0),Rm=new B(0,1,0),Cm=new B(0,0,1),Im={type:"added"},E_={type:"removed"},Ir={type:"childadded",child:null},Lu={type:"childremoved",child:null},be=class s extends Hi{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:M_++}),this.uuid=hi(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=s.DEFAULT_UP.clone();let t=new B,e=new pn,n=new Ve,i=new B(1,1,1);function r(){n.setFromEuler(e,!1)}function o(){e.setFromQuaternion(n,void 0,!1)}e._onChange(r),n._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:e},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new Pt},normalMatrix:{value:new jt}}),this.matrix=new Pt,this.matrixWorld=new Pt,this.matrixAutoUpdate=s.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=s.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new $r,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.userData={}}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,e){this.quaternion.setFromAxisAngle(t,e)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,e){return Cr.setFromAxisAngle(t,e),this.quaternion.multiply(Cr),this}rotateOnWorldAxis(t,e){return Cr.setFromAxisAngle(t,e),this.quaternion.premultiply(Cr),this}rotateX(t){return this.rotateOnAxis(Am,t)}rotateY(t){return this.rotateOnAxis(Rm,t)}rotateZ(t){return this.rotateOnAxis(Cm,t)}translateOnAxis(t,e){return Tm.copy(t).applyQuaternion(this.quaternion),this.position.add(Tm.multiplyScalar(e)),this}translateX(t){return this.translateOnAxis(Am,t)}translateY(t){return this.translateOnAxis(Rm,t)}translateZ(t){return this.translateOnAxis(Cm,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(Oi.copy(this.matrixWorld).invert())}lookAt(t,e,n){t.isVector3?wc.copy(t):wc.set(t,e,n);let i=this.parent;this.updateWorldMatrix(!0,!1),Ko.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?Oi.lookAt(Ko,wc,this.up):Oi.lookAt(wc,Ko,this.up),this.quaternion.setFromRotationMatrix(Oi),i&&(Oi.extractRotation(i.matrixWorld),Cr.setFromRotationMatrix(Oi),this.quaternion.premultiply(Cr.invert()))}add(t){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return t===this?(console.error("THREE.Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.removeFromParent(),t.parent=this,this.children.push(t),t.dispatchEvent(Im),Ir.child=t,this.dispatchEvent(Ir),Ir.child=null):console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let e=this.children.indexOf(t);return e!==-1&&(t.parent=null,this.children.splice(e,1),t.dispatchEvent(E_),Lu.child=t,this.dispatchEvent(Lu),Lu.child=null),this}removeFromParent(){let t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),Oi.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),Oi.multiply(t.parent.matrixWorld)),t.applyMatrix4(Oi),t.removeFromParent(),t.parent=this,this.children.push(t),t.updateWorldMatrix(!1,!0),t.dispatchEvent(Im),Ir.child=t,this.dispatchEvent(Ir),Ir.child=null,this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,e){if(this[t]===e)return this;for(let n=0,i=this.children.length;n<i;n++){let o=this.children[n].getObjectByProperty(t,e);if(o!==void 0)return o}}getObjectsByProperty(t,e,n=[]){this[t]===e&&n.push(this);let i=this.children;for(let r=0,o=i.length;r<o;r++)i[r].getObjectsByProperty(t,e,n);return n}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Ko,t,b_),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Ko,w_,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);let e=this.matrixWorld.elements;return t.set(e[8],e[9],e[10]).normalize()}raycast(){}traverse(t){t(this);let e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);let e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].traverseVisible(t)}traverseAncestors(t){let e=this.parent;e!==null&&(t(e),e.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,t=!0);let e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].updateMatrixWorld(t)}updateWorldMatrix(t,e){let n=this.parent;if(t===!0&&n!==null&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),e===!0){let i=this.children;for(let r=0,o=i.length;r<o;r++)i[r].updateWorldMatrix(!1,!0)}}toJSON(t){let e=t===void 0||typeof t=="string",n={};e&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});let i={};i.uuid=this.uuid,i.type=this.type,this.name!==""&&(i.name=this.name),this.castShadow===!0&&(i.castShadow=!0),this.receiveShadow===!0&&(i.receiveShadow=!0),this.visible===!1&&(i.visible=!1),this.frustumCulled===!1&&(i.frustumCulled=!1),this.renderOrder!==0&&(i.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(i.userData=this.userData),i.layers=this.layers.mask,i.matrix=this.matrix.toArray(),i.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(i.matrixAutoUpdate=!1),this.isInstancedMesh&&(i.type="InstancedMesh",i.count=this.count,i.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(i.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(i.type="BatchedMesh",i.perObjectFrustumCulled=this.perObjectFrustumCulled,i.sortObjects=this.sortObjects,i.drawRanges=this._drawRanges,i.reservedRanges=this._reservedRanges,i.geometryInfo=this._geometryInfo.map(a=>({...a,boundingBox:a.boundingBox?a.boundingBox.toJSON():void 0,boundingSphere:a.boundingSphere?a.boundingSphere.toJSON():void 0})),i.instanceInfo=this._instanceInfo.map(a=>({...a})),i.availableInstanceIds=this._availableInstanceIds.slice(),i.availableGeometryIds=this._availableGeometryIds.slice(),i.nextIndexStart=this._nextIndexStart,i.nextVertexStart=this._nextVertexStart,i.geometryCount=this._geometryCount,i.maxInstanceCount=this._maxInstanceCount,i.maxVertexCount=this._maxVertexCount,i.maxIndexCount=this._maxIndexCount,i.geometryInitialized=this._geometryInitialized,i.matricesTexture=this._matricesTexture.toJSON(t),i.indirectTexture=this._indirectTexture.toJSON(t),this._colorsTexture!==null&&(i.colorsTexture=this._colorsTexture.toJSON(t)),this.boundingSphere!==null&&(i.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(i.boundingBox=this.boundingBox.toJSON()));function r(a,c){return a[c.uuid]===void 0&&(a[c.uuid]=c.toJSON(t)),c.uuid}if(this.isScene)this.background&&(this.background.isColor?i.background=this.background.toJSON():this.background.isTexture&&(i.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(i.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){i.geometry=r(t.geometries,this.geometry);let a=this.geometry.parameters;if(a!==void 0&&a.shapes!==void 0){let c=a.shapes;if(Array.isArray(c))for(let l=0,h=c.length;l<h;l++){let u=c[l];r(t.shapes,u)}else r(t.shapes,c)}}if(this.isSkinnedMesh&&(i.bindMode=this.bindMode,i.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(t.skeletons,this.skeleton),i.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let a=[];for(let c=0,l=this.material.length;c<l;c++)a.push(r(t.materials,this.material[c]));i.material=a}else i.material=r(t.materials,this.material);if(this.children.length>0){i.children=[];for(let a=0;a<this.children.length;a++)i.children.push(this.children[a].toJSON(t).object)}if(this.animations.length>0){i.animations=[];for(let a=0;a<this.animations.length;a++){let c=this.animations[a];i.animations.push(r(t.animations,c))}}if(e){let a=o(t.geometries),c=o(t.materials),l=o(t.textures),h=o(t.images),u=o(t.shapes),f=o(t.skeletons),d=o(t.animations),g=o(t.nodes);a.length>0&&(n.geometries=a),c.length>0&&(n.materials=c),l.length>0&&(n.textures=l),h.length>0&&(n.images=h),u.length>0&&(n.shapes=u),f.length>0&&(n.skeletons=f),d.length>0&&(n.animations=d),g.length>0&&(n.nodes=g)}return n.object=i,n;function o(a){let c=[];for(let l in a){let h=a[l];delete h.metadata,c.push(h)}return c}}clone(t){return new this.constructor().copy(this,t)}copy(t,e=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),e===!0)for(let n=0;n<t.children.length;n++){let i=t.children[n];this.add(i.clone())}return this}};be.DEFAULT_UP=new B(0,1,0);be.DEFAULT_MATRIX_AUTO_UPDATE=!0;be.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var ai=new B,Ui=new B,Nu=new B,Fi=new B,Pr=new B,Lr=new B,Pm=new B,Du=new B,Ou=new B,Uu=new B,Fu=new de,Bu=new de,zu=new de,hn=class s{constructor(t=new B,e=new B,n=new B){this.a=t,this.b=e,this.c=n}static getNormal(t,e,n,i){i.subVectors(n,e),ai.subVectors(t,e),i.cross(ai);let r=i.lengthSq();return r>0?i.multiplyScalar(1/Math.sqrt(r)):i.set(0,0,0)}static getBarycoord(t,e,n,i,r){ai.subVectors(i,e),Ui.subVectors(n,e),Nu.subVectors(t,e);let o=ai.dot(ai),a=ai.dot(Ui),c=ai.dot(Nu),l=Ui.dot(Ui),h=Ui.dot(Nu),u=o*l-a*a;if(u===0)return r.set(0,0,0),null;let f=1/u,d=(l*c-a*h)*f,g=(o*h-a*c)*f;return r.set(1-d-g,g,d)}static containsPoint(t,e,n,i){return this.getBarycoord(t,e,n,i,Fi)===null?!1:Fi.x>=0&&Fi.y>=0&&Fi.x+Fi.y<=1}static getInterpolation(t,e,n,i,r,o,a,c){return this.getBarycoord(t,e,n,i,Fi)===null?(c.x=0,c.y=0,"z"in c&&(c.z=0),"w"in c&&(c.w=0),null):(c.setScalar(0),c.addScaledVector(r,Fi.x),c.addScaledVector(o,Fi.y),c.addScaledVector(a,Fi.z),c)}static getInterpolatedAttribute(t,e,n,i,r,o){return Fu.setScalar(0),Bu.setScalar(0),zu.setScalar(0),Fu.fromBufferAttribute(t,e),Bu.fromBufferAttribute(t,n),zu.fromBufferAttribute(t,i),o.setScalar(0),o.addScaledVector(Fu,r.x),o.addScaledVector(Bu,r.y),o.addScaledVector(zu,r.z),o}static isFrontFacing(t,e,n,i){return ai.subVectors(n,e),Ui.subVectors(t,e),ai.cross(Ui).dot(i)<0}set(t,e,n){return this.a.copy(t),this.b.copy(e),this.c.copy(n),this}setFromPointsAndIndices(t,e,n,i){return this.a.copy(t[e]),this.b.copy(t[n]),this.c.copy(t[i]),this}setFromAttributeAndIndices(t,e,n,i){return this.a.fromBufferAttribute(t,e),this.b.fromBufferAttribute(t,n),this.c.fromBufferAttribute(t,i),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return ai.subVectors(this.c,this.b),Ui.subVectors(this.a,this.b),ai.cross(Ui).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return s.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,e){return s.getBarycoord(t,this.a,this.b,this.c,e)}getInterpolation(t,e,n,i,r){return s.getInterpolation(t,this.a,this.b,this.c,e,n,i,r)}containsPoint(t){return s.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return s.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,e){let n=this.a,i=this.b,r=this.c,o,a;Pr.subVectors(i,n),Lr.subVectors(r,n),Du.subVectors(t,n);let c=Pr.dot(Du),l=Lr.dot(Du);if(c<=0&&l<=0)return e.copy(n);Ou.subVectors(t,i);let h=Pr.dot(Ou),u=Lr.dot(Ou);if(h>=0&&u<=h)return e.copy(i);let f=c*u-h*l;if(f<=0&&c>=0&&h<=0)return o=c/(c-h),e.copy(n).addScaledVector(Pr,o);Uu.subVectors(t,r);let d=Pr.dot(Uu),g=Lr.dot(Uu);if(g>=0&&d<=g)return e.copy(r);let x=d*l-c*g;if(x<=0&&l>=0&&g<=0)return a=l/(l-g),e.copy(n).addScaledVector(Lr,a);let m=h*g-d*u;if(m<=0&&u-h>=0&&d-g>=0)return Pm.subVectors(r,i),a=(u-h)/(u-h+(d-g)),e.copy(i).addScaledVector(Pm,a);let p=1/(m+x+f);return o=x*p,a=f*p,e.copy(n).addScaledVector(Pr,o).addScaledVector(Lr,a)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}},Wg={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},ls={h:0,s:0,l:0},Ec={h:0,s:0,l:0};function ku(s,t,e){return e<0&&(e+=1),e>1&&(e-=1),e<1/6?s+(t-s)*6*e:e<1/2?t:e<2/3?s+(t-s)*6*(2/3-e):s}var Et=class{constructor(t,e,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(t,e,n)}set(t,e,n){if(e===void 0&&n===void 0){let i=t;i&&i.isColor?this.copy(i):typeof i=="number"?this.setHex(i):typeof i=="string"&&this.setStyle(i)}else this.setRGB(t,e,n);return this}setScalar(t){return this.r=t,this.g=t,this.b=t,this}setHex(t,e=ze){return t=Math.floor(t),this.r=(t>>16&255)/255,this.g=(t>>8&255)/255,this.b=(t&255)/255,ie.colorSpaceToWorking(this,e),this}setRGB(t,e,n,i=ie.workingColorSpace){return this.r=t,this.g=e,this.b=n,ie.colorSpaceToWorking(this,i),this}setHSL(t,e,n,i=ie.workingColorSpace){if(t=Pf(t,1),e=Yt(e,0,1),n=Yt(n,0,1),e===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+e):n+e-n*e,o=2*n-r;this.r=ku(o,r,t+1/3),this.g=ku(o,r,t),this.b=ku(o,r,t-1/3)}return ie.colorSpaceToWorking(this,i),this}setStyle(t,e=ze){function n(r){r!==void 0&&parseFloat(r)<1&&console.warn("THREE.Color: Alpha component of "+t+" will be ignored.")}let i;if(i=/^(\w+)\(([^\)]*)\)/.exec(t)){let r,o=i[1],a=i[2];switch(o){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,e);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,e);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,e);break;default:console.warn("THREE.Color: Unknown color model "+t)}}else if(i=/^\#([A-Fa-f\d]+)$/.exec(t)){let r=i[1],o=r.length;if(o===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,e);if(o===6)return this.setHex(parseInt(r,16),e);console.warn("THREE.Color: Invalid hex color "+t)}else if(t&&t.length>0)return this.setColorName(t,e);return this}setColorName(t,e=ze){let n=Wg[t.toLowerCase()];return n!==void 0?this.setHex(n,e):console.warn("THREE.Color: Unknown color "+t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(t){return this.r=t.r,this.g=t.g,this.b=t.b,this}copySRGBToLinear(t){return this.r=ki(t.r),this.g=ki(t.g),this.b=ki(t.b),this}copyLinearToSRGB(t){return this.r=kr(t.r),this.g=kr(t.g),this.b=kr(t.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(t=ze){return ie.workingToColorSpace(cn.copy(this),t),Math.round(Yt(cn.r*255,0,255))*65536+Math.round(Yt(cn.g*255,0,255))*256+Math.round(Yt(cn.b*255,0,255))}getHexString(t=ze){return("000000"+this.getHex(t).toString(16)).slice(-6)}getHSL(t,e=ie.workingColorSpace){ie.workingToColorSpace(cn.copy(this),e);let n=cn.r,i=cn.g,r=cn.b,o=Math.max(n,i,r),a=Math.min(n,i,r),c,l,h=(a+o)/2;if(a===o)c=0,l=0;else{let u=o-a;switch(l=h<=.5?u/(o+a):u/(2-o-a),o){case n:c=(i-r)/u+(i<r?6:0);break;case i:c=(r-n)/u+2;break;case r:c=(n-i)/u+4;break}c/=6}return t.h=c,t.s=l,t.l=h,t}getRGB(t,e=ie.workingColorSpace){return ie.workingToColorSpace(cn.copy(this),e),t.r=cn.r,t.g=cn.g,t.b=cn.b,t}getStyle(t=ze){ie.workingToColorSpace(cn.copy(this),t);let e=cn.r,n=cn.g,i=cn.b;return t!==ze?`color(${t} ${e.toFixed(3)} ${n.toFixed(3)} ${i.toFixed(3)})`:`rgb(${Math.round(e*255)},${Math.round(n*255)},${Math.round(i*255)})`}offsetHSL(t,e,n){return this.getHSL(ls),this.setHSL(ls.h+t,ls.s+e,ls.l+n)}add(t){return this.r+=t.r,this.g+=t.g,this.b+=t.b,this}addColors(t,e){return this.r=t.r+e.r,this.g=t.g+e.g,this.b=t.b+e.b,this}addScalar(t){return this.r+=t,this.g+=t,this.b+=t,this}sub(t){return this.r=Math.max(0,this.r-t.r),this.g=Math.max(0,this.g-t.g),this.b=Math.max(0,this.b-t.b),this}multiply(t){return this.r*=t.r,this.g*=t.g,this.b*=t.b,this}multiplyScalar(t){return this.r*=t,this.g*=t,this.b*=t,this}lerp(t,e){return this.r+=(t.r-this.r)*e,this.g+=(t.g-this.g)*e,this.b+=(t.b-this.b)*e,this}lerpColors(t,e,n){return this.r=t.r+(e.r-t.r)*n,this.g=t.g+(e.g-t.g)*n,this.b=t.b+(e.b-t.b)*n,this}lerpHSL(t,e){this.getHSL(ls),t.getHSL(Ec);let n=ia(ls.h,Ec.h,e),i=ia(ls.s,Ec.s,e),r=ia(ls.l,Ec.l,e);return this.setHSL(n,i,r),this}setFromVector3(t){return this.r=t.x,this.g=t.y,this.b=t.z,this}applyMatrix3(t){let e=this.r,n=this.g,i=this.b,r=t.elements;return this.r=r[0]*e+r[3]*n+r[6]*i,this.g=r[1]*e+r[4]*n+r[7]*i,this.b=r[2]*e+r[5]*n+r[8]*i,this}equals(t){return t.r===this.r&&t.g===this.g&&t.b===this.b}fromArray(t,e=0){return this.r=t[e],this.g=t[e+1],this.b=t[e+2],this}toArray(t=[],e=0){return t[e]=this.r,t[e+1]=this.g,t[e+2]=this.b,t}fromBufferAttribute(t,e){return this.r=t.getX(e),this.g=t.getY(e),this.b=t.getZ(e),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},cn=new Et;Et.NAMES=Wg;var T_=0,Tn=class extends Hi{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:T_++}),this.uuid=hi(),this.name="",this.type="Material",this.blending=Bs,this.side=fn,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=Xc,this.blendDst=Hr,this.blendEquation=us,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Et(0,0,0),this.blendAlpha=0,this.depthFunc=zs,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=rf,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=Fs,this.stencilZFail=Fs,this.stencilZPass=Fs,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(t){this._alphaTest>0!=t>0&&this.version++,this._alphaTest=t}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(t){if(t!==void 0)for(let e in t){let n=t[e];if(n===void 0){console.warn(`THREE.Material: parameter '${e}' has value of undefined.`);continue}let i=this[e];if(i===void 0){console.warn(`THREE.Material: '${e}' is not a property of THREE.${this.type}.`);continue}i&&i.isColor?i.set(n):i&&i.isVector3&&n&&n.isVector3?i.copy(n):this[e]=n}}toJSON(t){let e=t===void 0||typeof t=="string";e&&(t={textures:{},images:{}});let n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(t).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(t).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(t).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(t).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(t).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(t).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(t).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(t).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(t).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(t).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(t).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(t).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(t).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(t).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(t).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(t).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(t).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(t).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(t).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(t).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(t).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(t).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(t).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(t).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(t).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(t).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==Bs&&(n.blending=this.blending),this.side!==fn&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==Xc&&(n.blendSrc=this.blendSrc),this.blendDst!==Hr&&(n.blendDst=this.blendDst),this.blendEquation!==us&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==zs&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==rf&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==Fs&&(n.stencilFail=this.stencilFail),this.stencilZFail!==Fs&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==Fs&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function i(r){let o=[];for(let a in r){let c=r[a];delete c.metadata,o.push(c)}return o}if(e){let r=i(t.textures),o=i(t.images);r.length>0&&(n.textures=r),o.length>0&&(n.images=o)}return n}clone(){return new this.constructor().copy(this)}copy(t){this.name=t.name,this.blending=t.blending,this.side=t.side,this.vertexColors=t.vertexColors,this.opacity=t.opacity,this.transparent=t.transparent,this.blendSrc=t.blendSrc,this.blendDst=t.blendDst,this.blendEquation=t.blendEquation,this.blendSrcAlpha=t.blendSrcAlpha,this.blendDstAlpha=t.blendDstAlpha,this.blendEquationAlpha=t.blendEquationAlpha,this.blendColor.copy(t.blendColor),this.blendAlpha=t.blendAlpha,this.depthFunc=t.depthFunc,this.depthTest=t.depthTest,this.depthWrite=t.depthWrite,this.stencilWriteMask=t.stencilWriteMask,this.stencilFunc=t.stencilFunc,this.stencilRef=t.stencilRef,this.stencilFuncMask=t.stencilFuncMask,this.stencilFail=t.stencilFail,this.stencilZFail=t.stencilZFail,this.stencilZPass=t.stencilZPass,this.stencilWrite=t.stencilWrite;let e=t.clippingPlanes,n=null;if(e!==null){let i=e.length;n=new Array(i);for(let r=0;r!==i;++r)n[r]=e[r].clone()}return this.clippingPlanes=n,this.clipIntersection=t.clipIntersection,this.clipShadows=t.clipShadows,this.shadowSide=t.shadowSide,this.colorWrite=t.colorWrite,this.precision=t.precision,this.polygonOffset=t.polygonOffset,this.polygonOffsetFactor=t.polygonOffsetFactor,this.polygonOffsetUnits=t.polygonOffsetUnits,this.dithering=t.dithering,this.alphaTest=t.alphaTest,this.alphaHash=t.alphaHash,this.alphaToCoverage=t.alphaToCoverage,this.premultipliedAlpha=t.premultipliedAlpha,this.forceSinglePass=t.forceSinglePass,this.visible=t.visible,this.toneMapped=t.toneMapped,this.userData=JSON.parse(JSON.stringify(t.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(t){t===!0&&this.version++}},ui=class extends Tn{constructor(t){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Et(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new pn,this.combine=yf,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}},zi=A_();function A_(){let s=new ArrayBuffer(4),t=new Float32Array(s),e=new Uint32Array(s),n=new Uint32Array(512),i=new Uint32Array(512);for(let c=0;c<256;++c){let l=c-127;l<-27?(n[c]=0,n[c|256]=32768,i[c]=24,i[c|256]=24):l<-14?(n[c]=1024>>-l-14,n[c|256]=1024>>-l-14|32768,i[c]=-l-1,i[c|256]=-l-1):l<=15?(n[c]=l+15<<10,n[c|256]=l+15<<10|32768,i[c]=13,i[c|256]=13):l<128?(n[c]=31744,n[c|256]=64512,i[c]=24,i[c|256]=24):(n[c]=31744,n[c|256]=64512,i[c]=13,i[c|256]=13)}let r=new Uint32Array(2048),o=new Uint32Array(64),a=new Uint32Array(64);for(let c=1;c<1024;++c){let l=c<<13,h=0;for(;(l&8388608)===0;)l<<=1,h-=8388608;l&=-8388609,h+=947912704,r[c]=l|h}for(let c=1024;c<2048;++c)r[c]=939524096+(c-1024<<13);for(let c=1;c<31;++c)o[c]=c<<23;o[31]=1199570944,o[32]=2147483648;for(let c=33;c<63;++c)o[c]=2147483648+(c-32<<23);o[63]=3347054592;for(let c=1;c<64;++c)c!==32&&(a[c]=1024);return{floatView:t,uint32View:e,baseTable:n,shiftTable:i,mantissaTable:r,exponentTable:o,offsetTable:a}}function R_(s){Math.abs(s)>65504&&console.warn("THREE.DataUtils.toHalfFloat(): Value out of range."),s=Yt(s,-65504,65504),zi.floatView[0]=s;let t=zi.uint32View[0],e=t>>23&511;return zi.baseTable[e]+((t&8388607)>>zi.shiftTable[e])}function C_(s){let t=s>>10;return zi.uint32View[0]=zi.mantissaTable[zi.offsetTable[t]+(s&1023)]+zi.exponentTable[t],zi.floatView[0]}var aa=class{static toHalfFloat(t){return R_(t)}static fromHalfFloat(t){return C_(t)}},ke=new B,Tc=new Ht,I_=0,re=class{constructor(t,e,n=!1){if(Array.isArray(t))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:I_++}),this.name="",this.array=t,this.itemSize=e,this.count=t!==void 0?t.length/e:0,this.normalized=n,this.usage=qc,this.updateRanges=[],this.gpuType=$n,this.version=0}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.name=t.name,this.array=new t.array.constructor(t.array),this.itemSize=t.itemSize,this.count=t.count,this.normalized=t.normalized,this.usage=t.usage,this.gpuType=t.gpuType,this}copyAt(t,e,n){t*=this.itemSize,n*=e.itemSize;for(let i=0,r=this.itemSize;i<r;i++)this.array[t+i]=e.array[n+i];return this}copyArray(t){return this.array.set(t),this}applyMatrix3(t){if(this.itemSize===2)for(let e=0,n=this.count;e<n;e++)Tc.fromBufferAttribute(this,e),Tc.applyMatrix3(t),this.setXY(e,Tc.x,Tc.y);else if(this.itemSize===3)for(let e=0,n=this.count;e<n;e++)ke.fromBufferAttribute(this,e),ke.applyMatrix3(t),this.setXYZ(e,ke.x,ke.y,ke.z);return this}applyMatrix4(t){for(let e=0,n=this.count;e<n;e++)ke.fromBufferAttribute(this,e),ke.applyMatrix4(t),this.setXYZ(e,ke.x,ke.y,ke.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)ke.fromBufferAttribute(this,e),ke.applyNormalMatrix(t),this.setXYZ(e,ke.x,ke.y,ke.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)ke.fromBufferAttribute(this,e),ke.transformDirection(t),this.setXYZ(e,ke.x,ke.y,ke.z);return this}set(t,e=0){return this.array.set(t,e),this}getComponent(t,e){let n=this.array[t*this.itemSize+e];return this.normalized&&(n=ci(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=ve(n,this.array)),this.array[t*this.itemSize+e]=n,this}getX(t){let e=this.array[t*this.itemSize];return this.normalized&&(e=ci(e,this.array)),e}setX(t,e){return this.normalized&&(e=ve(e,this.array)),this.array[t*this.itemSize]=e,this}getY(t){let e=this.array[t*this.itemSize+1];return this.normalized&&(e=ci(e,this.array)),e}setY(t,e){return this.normalized&&(e=ve(e,this.array)),this.array[t*this.itemSize+1]=e,this}getZ(t){let e=this.array[t*this.itemSize+2];return this.normalized&&(e=ci(e,this.array)),e}setZ(t,e){return this.normalized&&(e=ve(e,this.array)),this.array[t*this.itemSize+2]=e,this}getW(t){let e=this.array[t*this.itemSize+3];return this.normalized&&(e=ci(e,this.array)),e}setW(t,e){return this.normalized&&(e=ve(e,this.array)),this.array[t*this.itemSize+3]=e,this}setXY(t,e,n){return t*=this.itemSize,this.normalized&&(e=ve(e,this.array),n=ve(n,this.array)),this.array[t+0]=e,this.array[t+1]=n,this}setXYZ(t,e,n,i){return t*=this.itemSize,this.normalized&&(e=ve(e,this.array),n=ve(n,this.array),i=ve(i,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=i,this}setXYZW(t,e,n,i,r){return t*=this.itemSize,this.normalized&&(e=ve(e,this.array),n=ve(n,this.array),i=ve(i,this.array),r=ve(r,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=i,this.array[t+3]=r,this}onUpload(t){return this.onUploadCallback=t,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let t={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(t.name=this.name),this.usage!==qc&&(t.usage=this.usage),t}};var ca=class extends re{constructor(t,e,n){super(new Uint16Array(t),e,n)}};var la=class extends re{constructor(t,e,n){super(new Uint32Array(t),e,n)}};var Jt=class extends re{constructor(t,e,n){super(new Float32Array(t),e,n)}},P_=0,Xn=new Pt,Hu=new be,Nr=new B,Dn=new le,Zo=new le,$e=new B,oe=class s extends Hi{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:P_++}),this.uuid=hi(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(t){return Array.isArray(t)?this.index=new(Nf(t)?la:ca)(t,1):this.index=t,this}setIndirect(t){return this.indirect=t,this}getIndirect(){return this.indirect}getAttribute(t){return this.attributes[t]}setAttribute(t,e){return this.attributes[t]=e,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,e,n=0){this.groups.push({start:t,count:e,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(t,e){this.drawRange.start=t,this.drawRange.count=e}applyMatrix4(t){let e=this.attributes.position;e!==void 0&&(e.applyMatrix4(t),e.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let r=new jt().getNormalMatrix(t);n.applyNormalMatrix(r),n.needsUpdate=!0}let i=this.attributes.tangent;return i!==void 0&&(i.transformDirection(t),i.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(t){return Xn.makeRotationFromQuaternion(t),this.applyMatrix4(Xn),this}rotateX(t){return Xn.makeRotationX(t),this.applyMatrix4(Xn),this}rotateY(t){return Xn.makeRotationY(t),this.applyMatrix4(Xn),this}rotateZ(t){return Xn.makeRotationZ(t),this.applyMatrix4(Xn),this}translate(t,e,n){return Xn.makeTranslation(t,e,n),this.applyMatrix4(Xn),this}scale(t,e,n){return Xn.makeScale(t,e,n),this.applyMatrix4(Xn),this}lookAt(t){return Hu.lookAt(t),Hu.updateMatrix(),this.applyMatrix4(Hu.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Nr).negate(),this.translate(Nr.x,Nr.y,Nr.z),this}setFromPoints(t){let e=this.getAttribute("position");if(e===void 0){let n=[];for(let i=0,r=t.length;i<r;i++){let o=t[i];n.push(o.x,o.y,o.z||0)}this.setAttribute("position",new Jt(n,3))}else{let n=Math.min(t.length,e.count);for(let i=0;i<n;i++){let r=t[i];e.setXYZ(i,r.x,r.y,r.z||0)}t.length>e.count&&console.warn("THREE.BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),e.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new le);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new B(-1/0,-1/0,-1/0),new B(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),e)for(let n=0,i=e.length;n<i;n++){let r=e[n];Dn.setFromBufferAttribute(r),this.morphTargetsRelative?($e.addVectors(this.boundingBox.min,Dn.min),this.boundingBox.expandByPoint($e),$e.addVectors(this.boundingBox.max,Dn.max),this.boundingBox.expandByPoint($e)):(this.boundingBox.expandByPoint(Dn.min),this.boundingBox.expandByPoint(Dn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new En);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new B,1/0);return}if(t){let n=this.boundingSphere.center;if(Dn.setFromBufferAttribute(t),e)for(let r=0,o=e.length;r<o;r++){let a=e[r];Zo.setFromBufferAttribute(a),this.morphTargetsRelative?($e.addVectors(Dn.min,Zo.min),Dn.expandByPoint($e),$e.addVectors(Dn.max,Zo.max),Dn.expandByPoint($e)):(Dn.expandByPoint(Zo.min),Dn.expandByPoint(Zo.max))}Dn.getCenter(n);let i=0;for(let r=0,o=t.count;r<o;r++)$e.fromBufferAttribute(t,r),i=Math.max(i,n.distanceToSquared($e));if(e)for(let r=0,o=e.length;r<o;r++){let a=e[r],c=this.morphTargetsRelative;for(let l=0,h=a.count;l<h;l++)$e.fromBufferAttribute(a,l),c&&(Nr.fromBufferAttribute(t,l),$e.add(Nr)),i=Math.max(i,n.distanceToSquared($e))}this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)&&console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let t=this.index,e=this.attributes;if(t===null||e.position===void 0||e.normal===void 0||e.uv===void 0){console.error("THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let n=e.position,i=e.normal,r=e.uv;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new re(new Float32Array(4*n.count),4));let o=this.getAttribute("tangent"),a=[],c=[];for(let L=0;L<n.count;L++)a[L]=new B,c[L]=new B;let l=new B,h=new B,u=new B,f=new Ht,d=new Ht,g=new Ht,x=new B,m=new B;function p(L,S,M){l.fromBufferAttribute(n,L),h.fromBufferAttribute(n,S),u.fromBufferAttribute(n,M),f.fromBufferAttribute(r,L),d.fromBufferAttribute(r,S),g.fromBufferAttribute(r,M),h.sub(l),u.sub(l),d.sub(f),g.sub(f);let b=1/(d.x*g.y-g.x*d.y);isFinite(b)&&(x.copy(h).multiplyScalar(g.y).addScaledVector(u,-d.y).multiplyScalar(b),m.copy(u).multiplyScalar(d.x).addScaledVector(h,-g.x).multiplyScalar(b),a[L].add(x),a[S].add(x),a[M].add(x),c[L].add(m),c[S].add(m),c[M].add(m))}let y=this.groups;y.length===0&&(y=[{start:0,count:t.count}]);for(let L=0,S=y.length;L<S;++L){let M=y[L],b=M.start,A=M.count;for(let N=b,C=b+A;N<C;N+=3)p(t.getX(N+0),t.getX(N+1),t.getX(N+2))}let v=new B,_=new B,w=new B,T=new B;function R(L){w.fromBufferAttribute(i,L),T.copy(w);let S=a[L];v.copy(S),v.sub(w.multiplyScalar(w.dot(S))).normalize(),_.crossVectors(T,S);let b=_.dot(c[L])<0?-1:1;o.setXYZW(L,v.x,v.y,v.z,b)}for(let L=0,S=y.length;L<S;++L){let M=y[L],b=M.start,A=M.count;for(let N=b,C=b+A;N<C;N+=3)R(t.getX(N+0)),R(t.getX(N+1)),R(t.getX(N+2))}}computeVertexNormals(){let t=this.index,e=this.getAttribute("position");if(e!==void 0){let n=this.getAttribute("normal");if(n===void 0)n=new re(new Float32Array(e.count*3),3),this.setAttribute("normal",n);else for(let f=0,d=n.count;f<d;f++)n.setXYZ(f,0,0,0);let i=new B,r=new B,o=new B,a=new B,c=new B,l=new B,h=new B,u=new B;if(t)for(let f=0,d=t.count;f<d;f+=3){let g=t.getX(f+0),x=t.getX(f+1),m=t.getX(f+2);i.fromBufferAttribute(e,g),r.fromBufferAttribute(e,x),o.fromBufferAttribute(e,m),h.subVectors(o,r),u.subVectors(i,r),h.cross(u),a.fromBufferAttribute(n,g),c.fromBufferAttribute(n,x),l.fromBufferAttribute(n,m),a.add(h),c.add(h),l.add(h),n.setXYZ(g,a.x,a.y,a.z),n.setXYZ(x,c.x,c.y,c.z),n.setXYZ(m,l.x,l.y,l.z)}else for(let f=0,d=e.count;f<d;f+=3)i.fromBufferAttribute(e,f+0),r.fromBufferAttribute(e,f+1),o.fromBufferAttribute(e,f+2),h.subVectors(o,r),u.subVectors(i,r),h.cross(u),n.setXYZ(f+0,h.x,h.y,h.z),n.setXYZ(f+1,h.x,h.y,h.z),n.setXYZ(f+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let t=this.attributes.normal;for(let e=0,n=t.count;e<n;e++)$e.fromBufferAttribute(t,e),$e.normalize(),t.setXYZ(e,$e.x,$e.y,$e.z)}toNonIndexed(){function t(a,c){let l=a.array,h=a.itemSize,u=a.normalized,f=new l.constructor(c.length*h),d=0,g=0;for(let x=0,m=c.length;x<m;x++){a.isInterleavedBufferAttribute?d=c[x]*a.data.stride+a.offset:d=c[x]*h;for(let p=0;p<h;p++)f[g++]=l[d++]}return new re(f,h,u)}if(this.index===null)return console.warn("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let e=new s,n=this.index.array,i=this.attributes;for(let a in i){let c=i[a],l=t(c,n);e.setAttribute(a,l)}let r=this.morphAttributes;for(let a in r){let c=[],l=r[a];for(let h=0,u=l.length;h<u;h++){let f=l[h],d=t(f,n);c.push(d)}e.morphAttributes[a]=c}e.morphTargetsRelative=this.morphTargetsRelative;let o=this.groups;for(let a=0,c=o.length;a<c;a++){let l=o[a];e.addGroup(l.start,l.count,l.materialIndex)}return e}toJSON(){let t={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.type,this.name!==""&&(t.name=this.name),Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0){let c=this.parameters;for(let l in c)c[l]!==void 0&&(t[l]=c[l]);return t}t.data={attributes:{}};let e=this.index;e!==null&&(t.data.index={type:e.array.constructor.name,array:Array.prototype.slice.call(e.array)});let n=this.attributes;for(let c in n){let l=n[c];t.data.attributes[c]=l.toJSON(t.data)}let i={},r=!1;for(let c in this.morphAttributes){let l=this.morphAttributes[c],h=[];for(let u=0,f=l.length;u<f;u++){let d=l[u];h.push(d.toJSON(t.data))}h.length>0&&(i[c]=h,r=!0)}r&&(t.data.morphAttributes=i,t.data.morphTargetsRelative=this.morphTargetsRelative);let o=this.groups;o.length>0&&(t.data.groups=JSON.parse(JSON.stringify(o)));let a=this.boundingSphere;return a!==null&&(t.data.boundingSphere=a.toJSON()),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let e={};this.name=t.name;let n=t.index;n!==null&&this.setIndex(n.clone());let i=t.attributes;for(let l in i){let h=i[l];this.setAttribute(l,h.clone(e))}let r=t.morphAttributes;for(let l in r){let h=[],u=r[l];for(let f=0,d=u.length;f<d;f++)h.push(u[f].clone(e));this.morphAttributes[l]=h}this.morphTargetsRelative=t.morphTargetsRelative;let o=t.groups;for(let l=0,h=o.length;l<h;l++){let u=o[l];this.addGroup(u.start,u.count,u.materialIndex)}let a=t.boundingBox;a!==null&&(this.boundingBox=a.clone());let c=t.boundingSphere;return c!==null&&(this.boundingSphere=c.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}},Lm=new Pt,Os=new dn,Ac=new En,Nm=new B,Rc=new B,Cc=new B,Ic=new B,Vu=new B,Pc=new B,Dm=new B,Lc=new B,pe=class extends be{constructor(t=new oe,e=new ui){super(),this.isMesh=!0,this.type="Mesh",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),t.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=t.morphTargetInfluences.slice()),t.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary)),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}updateMorphTargets(){let e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){let i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=i.length;r<o;r++){let a=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}getVertexPosition(t,e){let n=this.geometry,i=n.attributes.position,r=n.morphAttributes.position,o=n.morphTargetsRelative;e.fromBufferAttribute(i,t);let a=this.morphTargetInfluences;if(r&&a){Pc.set(0,0,0);for(let c=0,l=r.length;c<l;c++){let h=a[c],u=r[c];h!==0&&(Vu.fromBufferAttribute(u,t),o?Pc.addScaledVector(Vu,h):Pc.addScaledVector(Vu.sub(e),h))}e.add(Pc)}return e}raycast(t,e){let n=this.geometry,i=this.material,r=this.matrixWorld;i!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),Ac.copy(n.boundingSphere),Ac.applyMatrix4(r),Os.copy(t.ray).recast(t.near),!(Ac.containsPoint(Os.origin)===!1&&(Os.intersectSphere(Ac,Nm)===null||Os.origin.distanceToSquared(Nm)>(t.far-t.near)**2))&&(Lm.copy(r).invert(),Os.copy(t.ray).applyMatrix4(Lm),!(n.boundingBox!==null&&Os.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(t,e,Os)))}_computeIntersections(t,e,n){let i,r=this.geometry,o=this.material,a=r.index,c=r.attributes.position,l=r.attributes.uv,h=r.attributes.uv1,u=r.attributes.normal,f=r.groups,d=r.drawRange;if(a!==null)if(Array.isArray(o))for(let g=0,x=f.length;g<x;g++){let m=f[g],p=o[m.materialIndex],y=Math.max(m.start,d.start),v=Math.min(a.count,Math.min(m.start+m.count,d.start+d.count));for(let _=y,w=v;_<w;_+=3){let T=a.getX(_),R=a.getX(_+1),L=a.getX(_+2);i=Nc(this,p,t,n,l,h,u,T,R,L),i&&(i.faceIndex=Math.floor(_/3),i.face.materialIndex=m.materialIndex,e.push(i))}}else{let g=Math.max(0,d.start),x=Math.min(a.count,d.start+d.count);for(let m=g,p=x;m<p;m+=3){let y=a.getX(m),v=a.getX(m+1),_=a.getX(m+2);i=Nc(this,o,t,n,l,h,u,y,v,_),i&&(i.faceIndex=Math.floor(m/3),e.push(i))}}else if(c!==void 0)if(Array.isArray(o))for(let g=0,x=f.length;g<x;g++){let m=f[g],p=o[m.materialIndex],y=Math.max(m.start,d.start),v=Math.min(c.count,Math.min(m.start+m.count,d.start+d.count));for(let _=y,w=v;_<w;_+=3){let T=_,R=_+1,L=_+2;i=Nc(this,p,t,n,l,h,u,T,R,L),i&&(i.faceIndex=Math.floor(_/3),i.face.materialIndex=m.materialIndex,e.push(i))}}else{let g=Math.max(0,d.start),x=Math.min(c.count,d.start+d.count);for(let m=g,p=x;m<p;m+=3){let y=m,v=m+1,_=m+2;i=Nc(this,o,t,n,l,h,u,y,v,_),i&&(i.faceIndex=Math.floor(m/3),e.push(i))}}}};function L_(s,t,e,n,i,r,o,a){let c;if(t.side===nn?c=n.intersectTriangle(o,r,i,!0,a):c=n.intersectTriangle(i,r,o,t.side===fn,a),c===null)return null;Lc.copy(a),Lc.applyMatrix4(s.matrixWorld);let l=e.ray.origin.distanceTo(Lc);return l<e.near||l>e.far?null:{distance:l,point:Lc.clone(),object:s}}function Nc(s,t,e,n,i,r,o,a,c,l){s.getVertexPosition(a,Rc),s.getVertexPosition(c,Cc),s.getVertexPosition(l,Ic);let h=L_(s,t,e,n,Rc,Cc,Ic,Dm);if(h){let u=new B;hn.getBarycoord(Dm,Rc,Cc,Ic,u),i&&(h.uv=hn.getInterpolatedAttribute(i,a,c,l,u,new Ht)),r&&(h.uv1=hn.getInterpolatedAttribute(r,a,c,l,u,new Ht)),o&&(h.normal=hn.getInterpolatedAttribute(o,a,c,l,u,new B),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));let f={a,b:c,c:l,normal:new B,materialIndex:0};hn.getNormal(Rc,Cc,Ic,f.normal),h.face=f,h.barycoord=u}return h}var Yr=class s extends oe{constructor(t=1,e=1,n=1,i=1,r=1,o=1){super(),this.type="BoxGeometry",this.parameters={width:t,height:e,depth:n,widthSegments:i,heightSegments:r,depthSegments:o};let a=this;i=Math.floor(i),r=Math.floor(r),o=Math.floor(o);let c=[],l=[],h=[],u=[],f=0,d=0;g("z","y","x",-1,-1,n,e,t,o,r,0),g("z","y","x",1,-1,n,e,-t,o,r,1),g("x","z","y",1,1,t,n,e,i,o,2),g("x","z","y",1,-1,t,n,-e,i,o,3),g("x","y","z",1,-1,t,e,n,i,r,4),g("x","y","z",-1,-1,t,e,-n,i,r,5),this.setIndex(c),this.setAttribute("position",new Jt(l,3)),this.setAttribute("normal",new Jt(h,3)),this.setAttribute("uv",new Jt(u,2));function g(x,m,p,y,v,_,w,T,R,L,S){let M=_/R,b=w/L,A=_/2,N=w/2,C=T/2,I=R+1,O=L+1,k=0,z=0,et=new B;for(let j=0;j<O;j++){let W=j*b-N;for(let tt=0;tt<I;tt++){let at=tt*M-A;et[x]=at*y,et[m]=W*v,et[p]=C,l.push(et.x,et.y,et.z),et[x]=0,et[m]=0,et[p]=T>0?1:-1,h.push(et.x,et.y,et.z),u.push(tt/R),u.push(1-j/L),k+=1}}for(let j=0;j<L;j++)for(let W=0;W<R;W++){let tt=f+W+I*j,at=f+W+I*(j+1),st=f+(W+1)+I*(j+1),ot=f+(W+1)+I*j;c.push(tt,at,ot),c.push(at,st,ot),z+=6}a.addGroup(d,z,S),d+=z,f+=k}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new s(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}};function tr(s){let t={};for(let e in s){t[e]={};for(let n in s[e]){let i=s[e][n];i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)?i.isRenderTargetTexture?(console.warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[e][n]=null):t[e][n]=i.clone():Array.isArray(i)?t[e][n]=i.slice():t[e][n]=i}}return t}function mn(s){let t={};for(let e=0;e<s.length;e++){let n=tr(s[e]);for(let i in n)t[i]=n[i]}return t}function N_(s){let t=[];for(let e=0;e<s.length;e++)t.push(s[e].clone());return t}function Df(s){let t=s.getRenderTarget();return t===null?s.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:ie.workingColorSpace}var Xg={clone:tr,merge:mn},D_=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,O_=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,Sn=class extends Tn{constructor(t){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=D_,this.fragmentShader=O_,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,t!==void 0&&this.setValues(t)}copy(t){return super.copy(t),this.fragmentShader=t.fragmentShader,this.vertexShader=t.vertexShader,this.uniforms=tr(t.uniforms),this.uniformsGroups=N_(t.uniformsGroups),this.defines=Object.assign({},t.defines),this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.fog=t.fog,this.lights=t.lights,this.clipping=t.clipping,this.extensions=Object.assign({},t.extensions),this.glslVersion=t.glslVersion,this}toJSON(t){let e=super.toJSON(t);e.glslVersion=this.glslVersion,e.uniforms={};for(let i in this.uniforms){let o=this.uniforms[i].value;o&&o.isTexture?e.uniforms[i]={type:"t",value:o.toJSON(t).uuid}:o&&o.isColor?e.uniforms[i]={type:"c",value:o.getHex()}:o&&o.isVector2?e.uniforms[i]={type:"v2",value:o.toArray()}:o&&o.isVector3?e.uniforms[i]={type:"v3",value:o.toArray()}:o&&o.isVector4?e.uniforms[i]={type:"v4",value:o.toArray()}:o&&o.isMatrix3?e.uniforms[i]={type:"m3",value:o.toArray()}:o&&o.isMatrix4?e.uniforms[i]={type:"m4",value:o.toArray()}:e.uniforms[i]={value:o}}Object.keys(this.defines).length>0&&(e.defines=this.defines),e.vertexShader=this.vertexShader,e.fragmentShader=this.fragmentShader,e.lights=this.lights,e.clipping=this.clipping;let n={};for(let i in this.extensions)this.extensions[i]===!0&&(n[i]=!0);return Object.keys(n).length>0&&(e.extensions=n),e}},Gs=class extends be{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new Pt,this.projectionMatrix=new Pt,this.projectionMatrixInverse=new Pt,this.coordinateSystem=li,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(t,e){return super.copy(t,e),this.matrixWorldInverse.copy(t.matrixWorldInverse),this.projectionMatrix.copy(t.projectionMatrix),this.projectionMatrixInverse.copy(t.projectionMatrixInverse),this.coordinateSystem=t.coordinateSystem,this}getWorldDirection(t){return super.getWorldDirection(t).negate()}updateMatrixWorld(t){super.updateMatrixWorld(t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(t,e){super.updateWorldMatrix(t,e),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}},hs=new B,Om=new Ht,Um=new Ht,He=class extends Gs{constructor(t=50,e=1,n=.1,i=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=t,this.zoom=1,this.near=n,this.far=i,this.focus=10,this.aspect=e,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.fov=t.fov,this.zoom=t.zoom,this.near=t.near,this.far=t.far,this.focus=t.focus,this.aspect=t.aspect,this.view=t.view===null?null:Object.assign({},t.view),this.filmGauge=t.filmGauge,this.filmOffset=t.filmOffset,this}setFocalLength(t){let e=.5*this.getFilmHeight()/t;this.fov=Vs*2*Math.atan(e),this.updateProjectionMatrix()}getFocalLength(){let t=Math.tan(na*.5*this.fov);return .5*this.getFilmHeight()/t}getEffectiveFOV(){return Vs*2*Math.atan(Math.tan(na*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(t,e,n){hs.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),e.set(hs.x,hs.y).multiplyScalar(-t/hs.z),hs.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(hs.x,hs.y).multiplyScalar(-t/hs.z)}getViewSize(t,e){return this.getViewBounds(t,Om,Um),e.subVectors(Um,Om)}setViewOffset(t,e,n,i,r,o){this.aspect=t/e,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=this.near,e=t*Math.tan(na*.5*this.fov)/this.zoom,n=2*e,i=this.aspect*n,r=-.5*i,o=this.view;if(this.view!==null&&this.view.enabled){let c=o.fullWidth,l=o.fullHeight;r+=o.offsetX*i/c,e-=o.offsetY*n/l,i*=o.width/c,n*=o.height/l}let a=this.filmOffset;a!==0&&(r+=t*a/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+i,e,e-n,t,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let e=super.toJSON(t);return e.object.fov=this.fov,e.object.zoom=this.zoom,e.object.near=this.near,e.object.far=this.far,e.object.focus=this.focus,e.object.aspect=this.aspect,this.view!==null&&(e.object.view=Object.assign({},this.view)),e.object.filmGauge=this.filmGauge,e.object.filmOffset=this.filmOffset,e}},Dr=-90,Or=1,Kc=class extends be{constructor(t,e,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let i=new He(Dr,Or,t,e);i.layers=this.layers,this.add(i);let r=new He(Dr,Or,t,e);r.layers=this.layers,this.add(r);let o=new He(Dr,Or,t,e);o.layers=this.layers,this.add(o);let a=new He(Dr,Or,t,e);a.layers=this.layers,this.add(a);let c=new He(Dr,Or,t,e);c.layers=this.layers,this.add(c);let l=new He(Dr,Or,t,e);l.layers=this.layers,this.add(l)}updateCoordinateSystem(){let t=this.coordinateSystem,e=this.children.concat(),[n,i,r,o,a,c]=e;for(let l of e)this.remove(l);if(t===li)n.up.set(0,1,0),n.lookAt(1,0,0),i.up.set(0,1,0),i.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),o.up.set(0,0,1),o.lookAt(0,-1,0),a.up.set(0,1,0),a.lookAt(0,0,1),c.up.set(0,1,0),c.lookAt(0,0,-1);else if(t===ra)n.up.set(0,-1,0),n.lookAt(-1,0,0),i.up.set(0,-1,0),i.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),o.up.set(0,0,-1),o.lookAt(0,-1,0),a.up.set(0,-1,0),a.lookAt(0,0,1),c.up.set(0,-1,0),c.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+t);for(let l of e)this.add(l),l.updateMatrixWorld()}update(t,e){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:i}=this;this.coordinateSystem!==t.coordinateSystem&&(this.coordinateSystem=t.coordinateSystem,this.updateCoordinateSystem());let[r,o,a,c,l,h]=this.children,u=t.getRenderTarget(),f=t.getActiveCubeFace(),d=t.getActiveMipmapLevel(),g=t.xr.enabled;t.xr.enabled=!1;let x=n.texture.generateMipmaps;n.texture.generateMipmaps=!1,t.setRenderTarget(n,0,i),t.render(e,r),t.setRenderTarget(n,1,i),t.render(e,o),t.setRenderTarget(n,2,i),t.render(e,a),t.setRenderTarget(n,3,i),t.render(e,c),t.setRenderTarget(n,4,i),t.render(e,l),n.texture.generateMipmaps=x,t.setRenderTarget(n,5,i),t.render(e,h),t.setRenderTarget(u,f,d),t.xr.enabled=g,n.texture.needsPMREMUpdate=!0}},ha=class extends Je{constructor(t=[],e=Zs,n,i,r,o,a,c,l,h){super(t,e,n,i,r,o,a,c,l,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(t){this.image=t}},Zc=class extends qn{constructor(t=1,e={}){super(t,t,e),this.isWebGLCubeRenderTarget=!0;let n={width:t,height:t,depth:1},i=[n,n,n,n,n,n];this.texture=new ha(i),this._setTextureOptions(e),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(t,e){this.texture.type=e.type,this.texture.colorSpace=e.colorSpace,this.texture.generateMipmaps=e.generateMipmaps,this.texture.minFilter=e.minFilter,this.texture.magFilter=e.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},i=new Yr(5,5,5),r=new Sn({name:"CubemapFromEquirect",uniforms:tr(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:nn,blending:qi});r.uniforms.tEquirect.value=e;let o=new pe(i,r),a=e.minFilter;return e.minFilter===Un&&(e.minFilter=Ye),new Kc(1,10,this).update(t,o),e.minFilter=a,o.geometry.dispose(),o.material.dispose(),this}clear(t,e=!0,n=!0,i=!0){let r=t.getRenderTarget();for(let o=0;o<6;o++)t.setRenderTarget(this,o),t.clear(e,n,i);t.setRenderTarget(r)}},un=class extends be{constructor(){super(),this.isGroup=!0,this.type="Group"}},U_={type:"move"},Jr=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new un,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new un,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new B,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new B),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new un,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new B,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new B),this._grip}dispatchEvent(t){return this._targetRay!==null&&this._targetRay.dispatchEvent(t),this._grip!==null&&this._grip.dispatchEvent(t),this._hand!==null&&this._hand.dispatchEvent(t),this}connect(t){if(t&&t.hand){let e=this._hand;if(e)for(let n of t.hand.values())this._getHandJoint(e,n)}return this.dispatchEvent({type:"connected",data:t}),this}disconnect(t){return this.dispatchEvent({type:"disconnected",data:t}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(t,e,n){let i=null,r=null,o=null,a=this._targetRay,c=this._grip,l=this._hand;if(t&&e.session.visibilityState!=="visible-blurred"){if(l&&t.hand){o=!0;for(let x of t.hand.values()){let m=e.getJointPose(x,n),p=this._getHandJoint(l,x);m!==null&&(p.matrix.fromArray(m.transform.matrix),p.matrix.decompose(p.position,p.rotation,p.scale),p.matrixWorldNeedsUpdate=!0,p.jointRadius=m.radius),p.visible=m!==null}let h=l.joints["index-finger-tip"],u=l.joints["thumb-tip"],f=h.position.distanceTo(u.position),d=.02,g=.005;l.inputState.pinching&&f>d+g?(l.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:t.handedness,target:this})):!l.inputState.pinching&&f<=d-g&&(l.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:t.handedness,target:this}))}else c!==null&&t.gripSpace&&(r=e.getPose(t.gripSpace,n),r!==null&&(c.matrix.fromArray(r.transform.matrix),c.matrix.decompose(c.position,c.rotation,c.scale),c.matrixWorldNeedsUpdate=!0,r.linearVelocity?(c.hasLinearVelocity=!0,c.linearVelocity.copy(r.linearVelocity)):c.hasLinearVelocity=!1,r.angularVelocity?(c.hasAngularVelocity=!0,c.angularVelocity.copy(r.angularVelocity)):c.hasAngularVelocity=!1));a!==null&&(i=e.getPose(t.targetRaySpace,n),i===null&&r!==null&&(i=r),i!==null&&(a.matrix.fromArray(i.transform.matrix),a.matrix.decompose(a.position,a.rotation,a.scale),a.matrixWorldNeedsUpdate=!0,i.linearVelocity?(a.hasLinearVelocity=!0,a.linearVelocity.copy(i.linearVelocity)):a.hasLinearVelocity=!1,i.angularVelocity?(a.hasAngularVelocity=!0,a.angularVelocity.copy(i.angularVelocity)):a.hasAngularVelocity=!1,this.dispatchEvent(U_)))}return a!==null&&(a.visible=i!==null),c!==null&&(c.visible=r!==null),l!==null&&(l.visible=o!==null),this}_getHandJoint(t,e){if(t.joints[e.jointName]===void 0){let n=new un;n.matrixAutoUpdate=!1,n.visible=!1,t.joints[e.jointName]=n,t.add(n)}return t.joints[e.jointName]}};var Ws=class extends be{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new pn,this.environmentIntensity=1,this.environmentRotation=new pn,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(t,e){return super.copy(t,e),t.background!==null&&(this.background=t.background.clone()),t.environment!==null&&(this.environment=t.environment.clone()),t.fog!==null&&(this.fog=t.fog.clone()),this.backgroundBlurriness=t.backgroundBlurriness,this.backgroundIntensity=t.backgroundIntensity,this.backgroundRotation.copy(t.backgroundRotation),this.environmentIntensity=t.environmentIntensity,this.environmentRotation.copy(t.environmentRotation),t.overrideMaterial!==null&&(this.overrideMaterial=t.overrideMaterial.clone()),this.matrixAutoUpdate=t.matrixAutoUpdate,this}toJSON(t){let e=super.toJSON(t);return this.fog!==null&&(e.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(e.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(e.object.backgroundIntensity=this.backgroundIntensity),e.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(e.object.environmentIntensity=this.environmentIntensity),e.object.environmentRotation=this.environmentRotation.toArray(),e}},Kr=class{constructor(t,e){this.isInterleavedBuffer=!0,this.array=t,this.stride=e,this.count=t!==void 0?t.length/e:0,this.usage=qc,this.updateRanges=[],this.version=0,this.uuid=hi()}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.array=new t.array.constructor(t.array),this.count=t.count,this.stride=t.stride,this.usage=t.usage,this}copyAt(t,e,n){t*=this.stride,n*=e.stride;for(let i=0,r=this.stride;i<r;i++)this.array[t+i]=e.array[n+i];return this}set(t,e=0){return this.array.set(t,e),this}clone(t){t.arrayBuffers===void 0&&(t.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=hi()),t.arrayBuffers[this.array.buffer._uuid]===void 0&&(t.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);let e=new this.array.constructor(t.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(e,this.stride);return n.setUsage(this.usage),n}onUpload(t){return this.onUploadCallback=t,this}toJSON(t){return t.arrayBuffers===void 0&&(t.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=hi()),t.arrayBuffers[this.array.buffer._uuid]===void 0&&(t.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}},vn=new B,Zr=class s{constructor(t,e,n,i=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=t,this.itemSize=e,this.offset=n,this.normalized=i}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(t){this.data.needsUpdate=t}applyMatrix4(t){for(let e=0,n=this.data.count;e<n;e++)vn.fromBufferAttribute(this,e),vn.applyMatrix4(t),this.setXYZ(e,vn.x,vn.y,vn.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)vn.fromBufferAttribute(this,e),vn.applyNormalMatrix(t),this.setXYZ(e,vn.x,vn.y,vn.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)vn.fromBufferAttribute(this,e),vn.transformDirection(t),this.setXYZ(e,vn.x,vn.y,vn.z);return this}getComponent(t,e){let n=this.array[t*this.data.stride+this.offset+e];return this.normalized&&(n=ci(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=ve(n,this.array)),this.data.array[t*this.data.stride+this.offset+e]=n,this}setX(t,e){return this.normalized&&(e=ve(e,this.array)),this.data.array[t*this.data.stride+this.offset]=e,this}setY(t,e){return this.normalized&&(e=ve(e,this.array)),this.data.array[t*this.data.stride+this.offset+1]=e,this}setZ(t,e){return this.normalized&&(e=ve(e,this.array)),this.data.array[t*this.data.stride+this.offset+2]=e,this}setW(t,e){return this.normalized&&(e=ve(e,this.array)),this.data.array[t*this.data.stride+this.offset+3]=e,this}getX(t){let e=this.data.array[t*this.data.stride+this.offset];return this.normalized&&(e=ci(e,this.array)),e}getY(t){let e=this.data.array[t*this.data.stride+this.offset+1];return this.normalized&&(e=ci(e,this.array)),e}getZ(t){let e=this.data.array[t*this.data.stride+this.offset+2];return this.normalized&&(e=ci(e,this.array)),e}getW(t){let e=this.data.array[t*this.data.stride+this.offset+3];return this.normalized&&(e=ci(e,this.array)),e}setXY(t,e,n){return t=t*this.data.stride+this.offset,this.normalized&&(e=ve(e,this.array),n=ve(n,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this}setXYZ(t,e,n,i){return t=t*this.data.stride+this.offset,this.normalized&&(e=ve(e,this.array),n=ve(n,this.array),i=ve(i,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this.data.array[t+2]=i,this}setXYZW(t,e,n,i,r){return t=t*this.data.stride+this.offset,this.normalized&&(e=ve(e,this.array),n=ve(n,this.array),i=ve(i,this.array),r=ve(r,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this.data.array[t+2]=i,this.data.array[t+3]=r,this}clone(t){if(t===void 0){console.log("THREE.InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");let e=[];for(let n=0;n<this.count;n++){let i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)e.push(this.data.array[i+r])}return new re(new this.array.constructor(e),this.itemSize,this.normalized)}else return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.clone(t)),new s(t.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(t){if(t===void 0){console.log("THREE.InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");let e=[];for(let n=0;n<this.count;n++){let i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)e.push(this.data.array[i+r])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:e,normalized:this.normalized}}else return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.toJSON(t)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}};var Fm=new B,Bm=new de,zm=new de,F_=new B,km=new Pt,Dc=new B,Gu=new En,Hm=new Pt,Wu=new dn,ua=class extends pe{constructor(t,e){super(t,e),this.isSkinnedMesh=!0,this.type="SkinnedMesh",this.bindMode=tf,this.bindMatrix=new Pt,this.bindMatrixInverse=new Pt,this.boundingBox=null,this.boundingSphere=null}computeBoundingBox(){let t=this.geometry;this.boundingBox===null&&(this.boundingBox=new le),this.boundingBox.makeEmpty();let e=t.getAttribute("position");for(let n=0;n<e.count;n++)this.getVertexPosition(n,Dc),this.boundingBox.expandByPoint(Dc)}computeBoundingSphere(){let t=this.geometry;this.boundingSphere===null&&(this.boundingSphere=new En),this.boundingSphere.makeEmpty();let e=t.getAttribute("position");for(let n=0;n<e.count;n++)this.getVertexPosition(n,Dc),this.boundingSphere.expandByPoint(Dc)}copy(t,e){return super.copy(t,e),this.bindMode=t.bindMode,this.bindMatrix.copy(t.bindMatrix),this.bindMatrixInverse.copy(t.bindMatrixInverse),this.skeleton=t.skeleton,t.boundingBox!==null&&(this.boundingBox=t.boundingBox.clone()),t.boundingSphere!==null&&(this.boundingSphere=t.boundingSphere.clone()),this}raycast(t,e){let n=this.material,i=this.matrixWorld;n!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),Gu.copy(this.boundingSphere),Gu.applyMatrix4(i),t.ray.intersectsSphere(Gu)!==!1&&(Hm.copy(i).invert(),Wu.copy(t.ray).applyMatrix4(Hm),!(this.boundingBox!==null&&Wu.intersectsBox(this.boundingBox)===!1)&&this._computeIntersections(t,e,Wu)))}getVertexPosition(t,e){return super.getVertexPosition(t,e),this.applyBoneTransform(t,e),e}bind(t,e){this.skeleton=t,e===void 0&&(this.updateMatrixWorld(!0),this.skeleton.calculateInverses(),e=this.matrixWorld),this.bindMatrix.copy(e),this.bindMatrixInverse.copy(e).invert()}pose(){this.skeleton.pose()}normalizeSkinWeights(){let t=new de,e=this.geometry.attributes.skinWeight;for(let n=0,i=e.count;n<i;n++){t.fromBufferAttribute(e,n);let r=1/t.manhattanLength();r!==1/0?t.multiplyScalar(r):t.set(1,0,0,0),e.setXYZW(n,t.x,t.y,t.z,t.w)}}updateMatrixWorld(t){super.updateMatrixWorld(t),this.bindMode===tf?this.bindMatrixInverse.copy(this.matrixWorld).invert():this.bindMode===Ig?this.bindMatrixInverse.copy(this.bindMatrix).invert():console.warn("THREE.SkinnedMesh: Unrecognized bindMode: "+this.bindMode)}applyBoneTransform(t,e){let n=this.skeleton,i=this.geometry;Bm.fromBufferAttribute(i.attributes.skinIndex,t),zm.fromBufferAttribute(i.attributes.skinWeight,t),Fm.copy(e).applyMatrix4(this.bindMatrix),e.set(0,0,0);for(let r=0;r<4;r++){let o=zm.getComponent(r);if(o!==0){let a=Bm.getComponent(r);km.multiplyMatrices(n.bones[a].matrixWorld,n.boneInverses[a]),e.addScaledVector(F_.copy(Fm).applyMatrix4(km),o)}}return e.applyMatrix4(this.bindMatrixInverse)}},jr=class extends be{constructor(){super(),this.isBone=!0,this.type="Bone"}},Xs=class extends Je{constructor(t=null,e=1,n=1,i,r,o,a,c,l=Qe,h=Qe,u,f){super(null,o,a,c,l,h,i,r,u,f),this.isDataTexture=!0,this.image={data:t,width:e,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}},Vm=new Pt,B_=new Pt,fa=class s{constructor(t=[],e=[]){this.uuid=hi(),this.bones=t.slice(0),this.boneInverses=e,this.boneMatrices=null,this.boneTexture=null,this.init()}init(){let t=this.bones,e=this.boneInverses;if(this.boneMatrices=new Float32Array(t.length*16),e.length===0)this.calculateInverses();else if(t.length!==e.length){console.warn("THREE.Skeleton: Number of inverse bone matrices does not match amount of bones."),this.boneInverses=[];for(let n=0,i=this.bones.length;n<i;n++)this.boneInverses.push(new Pt)}}calculateInverses(){this.boneInverses.length=0;for(let t=0,e=this.bones.length;t<e;t++){let n=new Pt;this.bones[t]&&n.copy(this.bones[t].matrixWorld).invert(),this.boneInverses.push(n)}}pose(){for(let t=0,e=this.bones.length;t<e;t++){let n=this.bones[t];n&&n.matrixWorld.copy(this.boneInverses[t]).invert()}for(let t=0,e=this.bones.length;t<e;t++){let n=this.bones[t];n&&(n.parent&&n.parent.isBone?(n.matrix.copy(n.parent.matrixWorld).invert(),n.matrix.multiply(n.matrixWorld)):n.matrix.copy(n.matrixWorld),n.matrix.decompose(n.position,n.quaternion,n.scale))}}update(){let t=this.bones,e=this.boneInverses,n=this.boneMatrices,i=this.boneTexture;for(let r=0,o=t.length;r<o;r++){let a=t[r]?t[r].matrixWorld:B_;Vm.multiplyMatrices(a,e[r]),Vm.toArray(n,r*16)}i!==null&&(i.needsUpdate=!0)}clone(){return new s(this.bones,this.boneInverses)}computeBoneTexture(){let t=Math.sqrt(this.bones.length*4);t=Math.ceil(t/4)*4,t=Math.max(t,4);let e=new Float32Array(t*t*4);e.set(this.boneMatrices);let n=new Xs(e,t,t,Mn,$n);return n.needsUpdate=!0,this.boneMatrices=e,this.boneTexture=n,this}getBoneByName(t){for(let e=0,n=this.bones.length;e<n;e++){let i=this.bones[e];if(i.name===t)return i}}dispose(){this.boneTexture!==null&&(this.boneTexture.dispose(),this.boneTexture=null)}fromJSON(t,e){this.uuid=t.uuid;for(let n=0,i=t.bones.length;n<i;n++){let r=t.bones[n],o=e[r];o===void 0&&(console.warn("THREE.Skeleton: No bone found with UUID:",r),o=new jr),this.bones.push(o),this.boneInverses.push(new Pt().fromArray(t.boneInverses[n]))}return this.init(),this}toJSON(){let t={metadata:{version:4.7,type:"Skeleton",generator:"Skeleton.toJSON"},bones:[],boneInverses:[]};t.uuid=this.uuid;let e=this.bones,n=this.boneInverses;for(let i=0,r=e.length;i<r;i++){let o=e[i];t.bones.push(o.uuid);let a=n[i];t.boneInverses.push(a.toArray())}return t}},tn=class extends re{constructor(t,e,n,i=1){super(t,e,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=i}copy(t){return super.copy(t),this.meshPerAttribute=t.meshPerAttribute,this}toJSON(){let t=super.toJSON();return t.meshPerAttribute=this.meshPerAttribute,t.isInstancedBufferAttribute=!0,t}},Ur=new Pt,Gm=new Pt,Oc=[],Wm=new le,z_=new Pt,jo=new pe,Qo=new En,On=class extends pe{constructor(t,e,n){super(t,e),this.isInstancedMesh=!0,this.instanceMatrix=new tn(new Float32Array(n*16),16),this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let i=0;i<n;i++)this.setMatrixAt(i,z_)}computeBoundingBox(){let t=this.geometry,e=this.count;this.boundingBox===null&&(this.boundingBox=new le),t.boundingBox===null&&t.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<e;n++)this.getMatrixAt(n,Ur),Wm.copy(t.boundingBox).applyMatrix4(Ur),this.boundingBox.union(Wm)}computeBoundingSphere(){let t=this.geometry,e=this.count;this.boundingSphere===null&&(this.boundingSphere=new En),t.boundingSphere===null&&t.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<e;n++)this.getMatrixAt(n,Ur),Qo.copy(t.boundingSphere).applyMatrix4(Ur),this.boundingSphere.union(Qo)}copy(t,e){return super.copy(t,e),this.instanceMatrix.copy(t.instanceMatrix),t.morphTexture!==null&&(this.morphTexture=t.morphTexture.clone()),t.instanceColor!==null&&(this.instanceColor=t.instanceColor.clone()),this.count=t.count,t.boundingBox!==null&&(this.boundingBox=t.boundingBox.clone()),t.boundingSphere!==null&&(this.boundingSphere=t.boundingSphere.clone()),this}getColorAt(t,e){e.fromArray(this.instanceColor.array,t*3)}getMatrixAt(t,e){e.fromArray(this.instanceMatrix.array,t*16)}getMorphAt(t,e){let n=e.morphTargetInfluences,i=this.morphTexture.source.data.data,r=n.length+1,o=t*r+1;for(let a=0;a<n.length;a++)n[a]=i[o+a]}raycast(t,e){let n=this.matrixWorld,i=this.count;if(jo.geometry=this.geometry,jo.material=this.material,jo.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),Qo.copy(this.boundingSphere),Qo.applyMatrix4(n),t.ray.intersectsSphere(Qo)!==!1))for(let r=0;r<i;r++){this.getMatrixAt(r,Ur),Gm.multiplyMatrices(n,Ur),jo.matrixWorld=Gm,jo.raycast(t,Oc);for(let o=0,a=Oc.length;o<a;o++){let c=Oc[o];c.instanceId=r,c.object=this,e.push(c)}Oc.length=0}}setColorAt(t,e){this.instanceColor===null&&(this.instanceColor=new tn(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),e.toArray(this.instanceColor.array,t*3)}setMatrixAt(t,e){e.toArray(this.instanceMatrix.array,t*16)}setMorphAt(t,e){let n=e.morphTargetInfluences,i=n.length+1;this.morphTexture===null&&(this.morphTexture=new Xs(new Float32Array(i*this.count),i,this.count,El,$n));let r=this.morphTexture.source.data.data,o=0;for(let l=0;l<n.length;l++)o+=n[l];let a=this.geometry.morphTargetsRelative?1:1-o,c=i*t;r[c]=a,r.set(n,c+1)}updateMorphTargets(){}dispose(){this.dispatchEvent({type:"dispose"}),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}},Xu=new B,k_=new B,H_=new jt,ln=class{constructor(t=new B(1,0,0),e=0){this.isPlane=!0,this.normal=t,this.constant=e}set(t,e){return this.normal.copy(t),this.constant=e,this}setComponents(t,e,n,i){return this.normal.set(t,e,n),this.constant=i,this}setFromNormalAndCoplanarPoint(t,e){return this.normal.copy(t),this.constant=-e.dot(this.normal),this}setFromCoplanarPoints(t,e,n){let i=Xu.subVectors(n,e).cross(k_.subVectors(t,e)).normalize();return this.setFromNormalAndCoplanarPoint(i,t),this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}normalize(){let t=1/this.normal.length();return this.normal.multiplyScalar(t),this.constant*=t,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(t){return this.normal.dot(t)+this.constant}distanceToSphere(t){return this.distanceToPoint(t.center)-t.radius}projectPoint(t,e){return e.copy(t).addScaledVector(this.normal,-this.distanceToPoint(t))}intersectLine(t,e){let n=t.delta(Xu),i=this.normal.dot(n);if(i===0)return this.distanceToPoint(t.start)===0?e.copy(t.start):null;let r=-(t.start.dot(this.normal)+this.constant)/i;return r<0||r>1?null:e.copy(t.start).addScaledVector(n,r)}intersectsLine(t){let e=this.distanceToPoint(t.start),n=this.distanceToPoint(t.end);return e<0&&n>0||n<0&&e>0}intersectsBox(t){return t.intersectsPlane(this)}intersectsSphere(t){return t.intersectsPlane(this)}coplanarPoint(t){return t.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(t,e){let n=e||H_.getNormalMatrix(t),i=this.coplanarPoint(Xu).applyMatrix4(t),r=this.normal.applyMatrix3(n).normalize();return this.constant=-i.dot(r),this}translate(t){return this.constant-=t.dot(this.normal),this}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}clone(){return new this.constructor().copy(this)}},Us=new En,V_=new Ht(.5,.5),Uc=new B,Qr=class{constructor(t=new ln,e=new ln,n=new ln,i=new ln,r=new ln,o=new ln){this.planes=[t,e,n,i,r,o]}set(t,e,n,i,r,o){let a=this.planes;return a[0].copy(t),a[1].copy(e),a[2].copy(n),a[3].copy(i),a[4].copy(r),a[5].copy(o),this}copy(t){let e=this.planes;for(let n=0;n<6;n++)e[n].copy(t.planes[n]);return this}setFromProjectionMatrix(t,e=li,n=!1){let i=this.planes,r=t.elements,o=r[0],a=r[1],c=r[2],l=r[3],h=r[4],u=r[5],f=r[6],d=r[7],g=r[8],x=r[9],m=r[10],p=r[11],y=r[12],v=r[13],_=r[14],w=r[15];if(i[0].setComponents(l-o,d-h,p-g,w-y).normalize(),i[1].setComponents(l+o,d+h,p+g,w+y).normalize(),i[2].setComponents(l+a,d+u,p+x,w+v).normalize(),i[3].setComponents(l-a,d-u,p-x,w-v).normalize(),n)i[4].setComponents(c,f,m,_).normalize(),i[5].setComponents(l-c,d-f,p-m,w-_).normalize();else if(i[4].setComponents(l-c,d-f,p-m,w-_).normalize(),e===li)i[5].setComponents(l+c,d+f,p+m,w+_).normalize();else if(e===ra)i[5].setComponents(c,f,m,_).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+e);return this}intersectsObject(t){if(t.boundingSphere!==void 0)t.boundingSphere===null&&t.computeBoundingSphere(),Us.copy(t.boundingSphere).applyMatrix4(t.matrixWorld);else{let e=t.geometry;e.boundingSphere===null&&e.computeBoundingSphere(),Us.copy(e.boundingSphere).applyMatrix4(t.matrixWorld)}return this.intersectsSphere(Us)}intersectsSprite(t){Us.center.set(0,0,0);let e=V_.distanceTo(t.center);return Us.radius=.7071067811865476+e,Us.applyMatrix4(t.matrixWorld),this.intersectsSphere(Us)}intersectsSphere(t){let e=this.planes,n=t.center,i=-t.radius;for(let r=0;r<6;r++)if(e[r].distanceToPoint(n)<i)return!1;return!0}intersectsBox(t){let e=this.planes;for(let n=0;n<6;n++){let i=e[n];if(Uc.x=i.normal.x>0?t.max.x:t.min.x,Uc.y=i.normal.y>0?t.max.y:t.min.y,Uc.z=i.normal.z>0?t.max.z:t.min.z,i.distanceToPoint(Uc)<0)return!1}return!0}containsPoint(t){let e=this.planes;for(let n=0;n<6;n++)if(e[n].distanceToPoint(t)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}};var fs=class extends Tn{constructor(t){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new Et(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.linewidth=t.linewidth,this.linecap=t.linecap,this.linejoin=t.linejoin,this.fog=t.fog,this}},jc=new B,Qc=new B,Xm=new Pt,ta=new dn,Fc=new En,qu=new B,qm=new B,qs=class extends be{constructor(t=new oe,e=new fs){super(),this.isLine=!0,this.type="Line",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}computeLineDistances(){let t=this.geometry;if(t.index===null){let e=t.attributes.position,n=[0];for(let i=1,r=e.count;i<r;i++)jc.fromBufferAttribute(e,i-1),Qc.fromBufferAttribute(e,i),n[i]=n[i-1],n[i]+=jc.distanceTo(Qc);t.setAttribute("lineDistance",new Jt(n,1))}else console.warn("THREE.Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}raycast(t,e){let n=this.geometry,i=this.matrixWorld,r=t.params.Line.threshold,o=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),Fc.copy(n.boundingSphere),Fc.applyMatrix4(i),Fc.radius+=r,t.ray.intersectsSphere(Fc)===!1)return;Xm.copy(i).invert(),ta.copy(t.ray).applyMatrix4(Xm);let a=r/((this.scale.x+this.scale.y+this.scale.z)/3),c=a*a,l=this.isLineSegments?2:1,h=n.index,f=n.attributes.position;if(h!==null){let d=Math.max(0,o.start),g=Math.min(h.count,o.start+o.count);for(let x=d,m=g-1;x<m;x+=l){let p=h.getX(x),y=h.getX(x+1),v=Bc(this,t,ta,c,p,y,x);v&&e.push(v)}if(this.isLineLoop){let x=h.getX(g-1),m=h.getX(d),p=Bc(this,t,ta,c,x,m,g-1);p&&e.push(p)}}else{let d=Math.max(0,o.start),g=Math.min(f.count,o.start+o.count);for(let x=d,m=g-1;x<m;x+=l){let p=Bc(this,t,ta,c,x,x+1,x);p&&e.push(p)}if(this.isLineLoop){let x=Bc(this,t,ta,c,g-1,d,g-1);x&&e.push(x)}}}updateMorphTargets(){let e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){let i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=i.length;r<o;r++){let a=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}};function Bc(s,t,e,n,i,r,o){let a=s.geometry.attributes.position;if(jc.fromBufferAttribute(a,i),Qc.fromBufferAttribute(a,r),e.distanceSqToSegment(jc,Qc,qu,qm)>n)return;qu.applyMatrix4(s.matrixWorld);let l=t.ray.origin.distanceTo(qu);if(!(l<t.near||l>t.far))return{distance:l,point:qm.clone().applyMatrix4(s.matrixWorld),index:o,face:null,faceIndex:null,barycoord:null,object:s}}var $m=new B,Ym=new B,$s=class extends qs{constructor(t,e){super(t,e),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){let t=this.geometry;if(t.index===null){let e=t.attributes.position,n=[];for(let i=0,r=e.count;i<r;i+=2)$m.fromBufferAttribute(e,i),Ym.fromBufferAttribute(e,i+1),n[i]=i===0?0:n[i-1],n[i+1]=n[i]+$m.distanceTo(Ym);t.setAttribute("lineDistance",new Jt(n,1))}else console.warn("THREE.LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}},da=class extends qs{constructor(t,e){super(t,e),this.isLineLoop=!0,this.type="LineLoop"}},to=class extends Tn{constructor(t){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new Et(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.alphaMap=t.alphaMap,this.size=t.size,this.sizeAttenuation=t.sizeAttenuation,this.fog=t.fog,this}},Jm=new Pt,of=new dn,zc=new En,kc=new B,pa=class extends be{constructor(t=new oe,e=new to){super(),this.isPoints=!0,this.type="Points",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}raycast(t,e){let n=this.geometry,i=this.matrixWorld,r=t.params.Points.threshold,o=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),zc.copy(n.boundingSphere),zc.applyMatrix4(i),zc.radius+=r,t.ray.intersectsSphere(zc)===!1)return;Jm.copy(i).invert(),of.copy(t.ray).applyMatrix4(Jm);let a=r/((this.scale.x+this.scale.y+this.scale.z)/3),c=a*a,l=n.index,u=n.attributes.position;if(l!==null){let f=Math.max(0,o.start),d=Math.min(l.count,o.start+o.count);for(let g=f,x=d;g<x;g++){let m=l.getX(g);kc.fromBufferAttribute(u,m),Km(kc,m,c,i,t,e,this)}}else{let f=Math.max(0,o.start),d=Math.min(u.count,o.start+o.count);for(let g=f,x=d;g<x;g++)kc.fromBufferAttribute(u,g),Km(kc,g,c,i,t,e,this)}}updateMorphTargets(){let e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){let i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=i.length;r<o;r++){let a=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}};function Km(s,t,e,n,i,r,o){let a=of.distanceSqToPoint(s);if(a<e){let c=new B;of.closestPointToPoint(s,c),c.applyMatrix4(n);let l=i.ray.origin.distanceTo(c);if(l<i.near||l>i.far)return;r.push({distance:l,distanceToRay:Math.sqrt(a),point:c,index:t,face:null,faceIndex:null,barycoord:null,object:o})}}var ma=class extends Je{constructor(t,e,n=ms,i,r,o,a=Qe,c=Qe,l,h=Gr,u=1){if(h!==Gr&&h!==ao)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");let f={width:t,height:e,depth:u};super(f,i,r,o,a,c,h,n,l),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(t){return super.copy(t),this.source=new qr(Object.assign({},t.image)),this.compareFunction=t.compareFunction,this}toJSON(t){let e=super.toJSON(t);return this.compareFunction!==null&&(e.compareFunction=this.compareFunction),e}},ga=class extends Je{constructor(t=null){super(),this.sourceTexture=t,this.isExternalTexture=!0}copy(t){return super.copy(t),this.sourceTexture=t.sourceTexture,this}};var tl=class s extends oe{constructor(t=[],e=[],n=1,i=0){super(),this.type="PolyhedronGeometry",this.parameters={vertices:t,indices:e,radius:n,detail:i};let r=[],o=[];a(i),l(n),h(),this.setAttribute("position",new Jt(r,3)),this.setAttribute("normal",new Jt(r.slice(),3)),this.setAttribute("uv",new Jt(o,2)),i===0?this.computeVertexNormals():this.normalizeNormals();function a(y){let v=new B,_=new B,w=new B;for(let T=0;T<e.length;T+=3)d(e[T+0],v),d(e[T+1],_),d(e[T+2],w),c(v,_,w,y)}function c(y,v,_,w){let T=w+1,R=[];for(let L=0;L<=T;L++){R[L]=[];let S=y.clone().lerp(_,L/T),M=v.clone().lerp(_,L/T),b=T-L;for(let A=0;A<=b;A++)A===0&&L===T?R[L][A]=S:R[L][A]=S.clone().lerp(M,A/b)}for(let L=0;L<T;L++)for(let S=0;S<2*(T-L)-1;S++){let M=Math.floor(S/2);S%2===0?(f(R[L][M+1]),f(R[L+1][M]),f(R[L][M])):(f(R[L][M+1]),f(R[L+1][M+1]),f(R[L+1][M]))}}function l(y){let v=new B;for(let _=0;_<r.length;_+=3)v.x=r[_+0],v.y=r[_+1],v.z=r[_+2],v.normalize().multiplyScalar(y),r[_+0]=v.x,r[_+1]=v.y,r[_+2]=v.z}function h(){let y=new B;for(let v=0;v<r.length;v+=3){y.x=r[v+0],y.y=r[v+1],y.z=r[v+2];let _=m(y)/2/Math.PI+.5,w=p(y)/Math.PI+.5;o.push(_,1-w)}g(),u()}function u(){for(let y=0;y<o.length;y+=6){let v=o[y+0],_=o[y+2],w=o[y+4],T=Math.max(v,_,w),R=Math.min(v,_,w);T>.9&&R<.1&&(v<.2&&(o[y+0]+=1),_<.2&&(o[y+2]+=1),w<.2&&(o[y+4]+=1))}}function f(y){r.push(y.x,y.y,y.z)}function d(y,v){let _=y*3;v.x=t[_+0],v.y=t[_+1],v.z=t[_+2]}function g(){let y=new B,v=new B,_=new B,w=new B,T=new Ht,R=new Ht,L=new Ht;for(let S=0,M=0;S<r.length;S+=9,M+=6){y.set(r[S+0],r[S+1],r[S+2]),v.set(r[S+3],r[S+4],r[S+5]),_.set(r[S+6],r[S+7],r[S+8]),T.set(o[M+0],o[M+1]),R.set(o[M+2],o[M+3]),L.set(o[M+4],o[M+5]),w.copy(y).add(v).add(_).divideScalar(3);let b=m(w);x(T,M+0,y,b),x(R,M+2,v,b),x(L,M+4,_,b)}}function x(y,v,_,w){w<0&&y.x===1&&(o[v]=y.x-1),_.x===0&&_.z===0&&(o[v]=w/2/Math.PI+.5)}function m(y){return Math.atan2(y.z,-y.x)}function p(y){return Math.atan2(-y.y,Math.sqrt(y.x*y.x+y.z*y.z))}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new s(t.vertices,t.indices,t.radius,t.details)}};var el=class{constructor(){this.type="Curve",this.arcLengthDivisions=200,this.needsUpdate=!1,this.cacheArcLengths=null}getPoint(){console.warn("THREE.Curve: .getPoint() not implemented.")}getPointAt(t,e){let n=this.getUtoTmapping(t);return this.getPoint(n,e)}getPoints(t=5){let e=[];for(let n=0;n<=t;n++)e.push(this.getPoint(n/t));return e}getSpacedPoints(t=5){let e=[];for(let n=0;n<=t;n++)e.push(this.getPointAt(n/t));return e}getLength(){let t=this.getLengths();return t[t.length-1]}getLengths(t=this.arcLengthDivisions){if(this.cacheArcLengths&&this.cacheArcLengths.length===t+1&&!this.needsUpdate)return this.cacheArcLengths;this.needsUpdate=!1;let e=[],n,i=this.getPoint(0),r=0;e.push(0);for(let o=1;o<=t;o++)n=this.getPoint(o/t),r+=n.distanceTo(i),e.push(r),i=n;return this.cacheArcLengths=e,e}updateArcLengths(){this.needsUpdate=!0,this.getLengths()}getUtoTmapping(t,e=null){let n=this.getLengths(),i=0,r=n.length,o;e?o=e:o=t*n[r-1];let a=0,c=r-1,l;for(;a<=c;)if(i=Math.floor(a+(c-a)/2),l=n[i]-o,l<0)a=i+1;else if(l>0)c=i-1;else{c=i;break}if(i=c,n[i]===o)return i/(r-1);let h=n[i],f=n[i+1]-h,d=(o-h)/f;return(i+d)/(r-1)}getTangent(t,e){let i=t-1e-4,r=t+1e-4;i<0&&(i=0),r>1&&(r=1);let o=this.getPoint(i),a=this.getPoint(r),c=e||(o.isVector2?new Ht:new B);return c.copy(a).sub(o).normalize(),c}getTangentAt(t,e){let n=this.getUtoTmapping(t);return this.getTangent(n,e)}computeFrenetFrames(t,e=!1){let n=new B,i=[],r=[],o=[],a=new B,c=new Pt;for(let d=0;d<=t;d++){let g=d/t;i[d]=this.getTangentAt(g,new B)}r[0]=new B,o[0]=new B;let l=Number.MAX_VALUE,h=Math.abs(i[0].x),u=Math.abs(i[0].y),f=Math.abs(i[0].z);h<=l&&(l=h,n.set(1,0,0)),u<=l&&(l=u,n.set(0,1,0)),f<=l&&n.set(0,0,1),a.crossVectors(i[0],n).normalize(),r[0].crossVectors(i[0],a),o[0].crossVectors(i[0],r[0]);for(let d=1;d<=t;d++){if(r[d]=r[d-1].clone(),o[d]=o[d-1].clone(),a.crossVectors(i[d-1],i[d]),a.length()>Number.EPSILON){a.normalize();let g=Math.acos(Yt(i[d-1].dot(i[d]),-1,1));r[d].applyMatrix4(c.makeRotationAxis(a,g))}o[d].crossVectors(i[d],r[d])}if(e===!0){let d=Math.acos(Yt(r[0].dot(r[t]),-1,1));d/=t,i[0].dot(a.crossVectors(r[0],r[t]))>0&&(d=-d);for(let g=1;g<=t;g++)r[g].applyMatrix4(c.makeRotationAxis(i[g],d*g)),o[g].crossVectors(i[g],r[g])}return{tangents:i,normals:r,binormals:o}}clone(){return new this.constructor().copy(this)}copy(t){return this.arcLengthDivisions=t.arcLengthDivisions,this}toJSON(){let t={metadata:{version:4.7,type:"Curve",generator:"Curve.toJSON"}};return t.arcLengthDivisions=this.arcLengthDivisions,t.type=this.type,t}fromJSON(t){return this.arcLengthDivisions=t.arcLengthDivisions,this}};function Of(){let s=0,t=0,e=0,n=0;function i(r,o,a,c){s=r,t=a,e=-3*r+3*o-2*a-c,n=2*r-2*o+a+c}return{initCatmullRom:function(r,o,a,c,l){i(o,a,l*(a-r),l*(c-o))},initNonuniformCatmullRom:function(r,o,a,c,l,h,u){let f=(o-r)/l-(a-r)/(l+h)+(a-o)/h,d=(a-o)/h-(c-o)/(h+u)+(c-a)/u;f*=h,d*=h,i(o,a,f,d)},calc:function(r){let o=r*r,a=o*r;return s+t*r+e*o+n*a}}}var Hc=new B,$u=new Of,Yu=new Of,Ju=new Of,eo=class extends el{constructor(t=[],e=!1,n="centripetal",i=.5){super(),this.isCatmullRomCurve3=!0,this.type="CatmullRomCurve3",this.points=t,this.closed=e,this.curveType=n,this.tension=i}getPoint(t,e=new B){let n=e,i=this.points,r=i.length,o=(r-(this.closed?0:1))*t,a=Math.floor(o),c=o-a;this.closed?a+=a>0?0:(Math.floor(Math.abs(a)/r)+1)*r:c===0&&a===r-1&&(a=r-2,c=1);let l,h;this.closed||a>0?l=i[(a-1)%r]:(Hc.subVectors(i[0],i[1]).add(i[0]),l=Hc);let u=i[a%r],f=i[(a+1)%r];if(this.closed||a+2<r?h=i[(a+2)%r]:(Hc.subVectors(i[r-1],i[r-2]).add(i[r-1]),h=Hc),this.curveType==="centripetal"||this.curveType==="chordal"){let d=this.curveType==="chordal"?.5:.25,g=Math.pow(l.distanceToSquared(u),d),x=Math.pow(u.distanceToSquared(f),d),m=Math.pow(f.distanceToSquared(h),d);x<1e-4&&(x=1),g<1e-4&&(g=x),m<1e-4&&(m=x),$u.initNonuniformCatmullRom(l.x,u.x,f.x,h.x,g,x,m),Yu.initNonuniformCatmullRom(l.y,u.y,f.y,h.y,g,x,m),Ju.initNonuniformCatmullRom(l.z,u.z,f.z,h.z,g,x,m)}else this.curveType==="catmullrom"&&($u.initCatmullRom(l.x,u.x,f.x,h.x,this.tension),Yu.initCatmullRom(l.y,u.y,f.y,h.y,this.tension),Ju.initCatmullRom(l.z,u.z,f.z,h.z,this.tension));return n.set($u.calc(c),Yu.calc(c),Ju.calc(c)),n}copy(t){super.copy(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){let i=t.points[e];this.points.push(i.clone())}return this.closed=t.closed,this.curveType=t.curveType,this.tension=t.tension,this}toJSON(){let t=super.toJSON();t.points=[];for(let e=0,n=this.points.length;e<n;e++){let i=this.points[e];t.points.push(i.toArray())}return t.closed=this.closed,t.curveType=this.curveType,t.tension=this.tension,t}fromJSON(t){super.fromJSON(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){let i=t.points[e];this.points.push(new B().fromArray(i))}return this.closed=t.closed,this.curveType=t.curveType,this.tension=t.tension,this}};var xa=class s extends tl{constructor(t=1,e=0){let n=(1+Math.sqrt(5))/2,i=[-1,n,0,1,n,0,-1,-n,0,1,-n,0,0,-1,n,0,1,n,0,-1,-n,0,1,-n,n,0,-1,n,0,1,-n,0,-1,-n,0,1],r=[0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1];super(i,r,t,e),this.type="IcosahedronGeometry",this.parameters={radius:t,detail:e}}static fromJSON(t){return new s(t.radius,t.detail)}};var bi=class s extends oe{constructor(t=1,e=1,n=1,i=1){super(),this.type="PlaneGeometry",this.parameters={width:t,height:e,widthSegments:n,heightSegments:i};let r=t/2,o=e/2,a=Math.floor(n),c=Math.floor(i),l=a+1,h=c+1,u=t/a,f=e/c,d=[],g=[],x=[],m=[];for(let p=0;p<h;p++){let y=p*f-o;for(let v=0;v<l;v++){let _=v*u-r;g.push(_,-y,0),x.push(0,0,1),m.push(v/a),m.push(1-p/c)}}for(let p=0;p<c;p++)for(let y=0;y<a;y++){let v=y+l*p,_=y+l*(p+1),w=y+1+l*(p+1),T=y+1+l*p;d.push(v,_,T),d.push(_,w,T)}this.setIndex(d),this.setAttribute("position",new Jt(g,3)),this.setAttribute("normal",new Jt(x,3)),this.setAttribute("uv",new Jt(m,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new s(t.width,t.height,t.widthSegments,t.heightSegments)}};var ds=class s extends oe{constructor(t=1,e=32,n=16,i=0,r=Math.PI*2,o=0,a=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:t,widthSegments:e,heightSegments:n,phiStart:i,phiLength:r,thetaStart:o,thetaLength:a},e=Math.max(3,Math.floor(e)),n=Math.max(2,Math.floor(n));let c=Math.min(o+a,Math.PI),l=0,h=[],u=new B,f=new B,d=[],g=[],x=[],m=[];for(let p=0;p<=n;p++){let y=[],v=p/n,_=0;p===0&&o===0?_=.5/e:p===n&&c===Math.PI&&(_=-.5/e);for(let w=0;w<=e;w++){let T=w/e;u.x=-t*Math.cos(i+T*r)*Math.sin(o+v*a),u.y=t*Math.cos(o+v*a),u.z=t*Math.sin(i+T*r)*Math.sin(o+v*a),g.push(u.x,u.y,u.z),f.copy(u).normalize(),x.push(f.x,f.y,f.z),m.push(T+_,1-v),y.push(l++)}h.push(y)}for(let p=0;p<n;p++)for(let y=0;y<e;y++){let v=h[p][y+1],_=h[p][y],w=h[p+1][y],T=h[p+1][y+1];(p!==0||o>0)&&d.push(v,_,T),(p!==n-1||c<Math.PI)&&d.push(_,w,T)}this.setIndex(d),this.setAttribute("position",new Jt(g,3)),this.setAttribute("normal",new Jt(x,3)),this.setAttribute("uv",new Jt(m,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new s(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}};var Ke=class extends Tn{constructor(t){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new Et(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Et(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Rf,this.normalScale=new Ht(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new pn,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.defines={STANDARD:""},this.color.copy(t.color),this.roughness=t.roughness,this.metalness=t.metalness,this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.emissive.copy(t.emissive),this.emissiveMap=t.emissiveMap,this.emissiveIntensity=t.emissiveIntensity,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.roughnessMap=t.roughnessMap,this.metalnessMap=t.metalnessMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.envMapIntensity=t.envMapIntensity,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.flatShading=t.flatShading,this.fog=t.fog,this}},Ze=class extends Ke{constructor(t){super(),this.isMeshPhysicalMaterial=!0,this.defines={STANDARD:"",PHYSICAL:""},this.type="MeshPhysicalMaterial",this.anisotropyRotation=0,this.anisotropyMap=null,this.clearcoatMap=null,this.clearcoatRoughness=0,this.clearcoatRoughnessMap=null,this.clearcoatNormalScale=new Ht(1,1),this.clearcoatNormalMap=null,this.ior=1.5,Object.defineProperty(this,"reflectivity",{get:function(){return Yt(2.5*(this.ior-1)/(this.ior+1),0,1)},set:function(e){this.ior=(1+.4*e)/(1-.4*e)}}),this.iridescenceMap=null,this.iridescenceIOR=1.3,this.iridescenceThicknessRange=[100,400],this.iridescenceThicknessMap=null,this.sheenColor=new Et(0),this.sheenColorMap=null,this.sheenRoughness=1,this.sheenRoughnessMap=null,this.transmissionMap=null,this.thickness=0,this.thicknessMap=null,this.attenuationDistance=1/0,this.attenuationColor=new Et(1,1,1),this.specularIntensity=1,this.specularIntensityMap=null,this.specularColor=new Et(1,1,1),this.specularColorMap=null,this._anisotropy=0,this._clearcoat=0,this._dispersion=0,this._iridescence=0,this._sheen=0,this._transmission=0,this.setValues(t)}get anisotropy(){return this._anisotropy}set anisotropy(t){this._anisotropy>0!=t>0&&this.version++,this._anisotropy=t}get clearcoat(){return this._clearcoat}set clearcoat(t){this._clearcoat>0!=t>0&&this.version++,this._clearcoat=t}get iridescence(){return this._iridescence}set iridescence(t){this._iridescence>0!=t>0&&this.version++,this._iridescence=t}get dispersion(){return this._dispersion}set dispersion(t){this._dispersion>0!=t>0&&this.version++,this._dispersion=t}get sheen(){return this._sheen}set sheen(t){this._sheen>0!=t>0&&this.version++,this._sheen=t}get transmission(){return this._transmission}set transmission(t){this._transmission>0!=t>0&&this.version++,this._transmission=t}copy(t){return super.copy(t),this.defines={STANDARD:"",PHYSICAL:""},this.anisotropy=t.anisotropy,this.anisotropyRotation=t.anisotropyRotation,this.anisotropyMap=t.anisotropyMap,this.clearcoat=t.clearcoat,this.clearcoatMap=t.clearcoatMap,this.clearcoatRoughness=t.clearcoatRoughness,this.clearcoatRoughnessMap=t.clearcoatRoughnessMap,this.clearcoatNormalMap=t.clearcoatNormalMap,this.clearcoatNormalScale.copy(t.clearcoatNormalScale),this.dispersion=t.dispersion,this.ior=t.ior,this.iridescence=t.iridescence,this.iridescenceMap=t.iridescenceMap,this.iridescenceIOR=t.iridescenceIOR,this.iridescenceThicknessRange=[...t.iridescenceThicknessRange],this.iridescenceThicknessMap=t.iridescenceThicknessMap,this.sheen=t.sheen,this.sheenColor.copy(t.sheenColor),this.sheenColorMap=t.sheenColorMap,this.sheenRoughness=t.sheenRoughness,this.sheenRoughnessMap=t.sheenRoughnessMap,this.transmission=t.transmission,this.transmissionMap=t.transmissionMap,this.thickness=t.thickness,this.thicknessMap=t.thicknessMap,this.attenuationDistance=t.attenuationDistance,this.attenuationColor.copy(t.attenuationColor),this.specularIntensity=t.specularIntensity,this.specularIntensityMap=t.specularIntensityMap,this.specularColor.copy(t.specularColor),this.specularColorMap=t.specularColorMap,this}};var nl=class extends Tn{constructor(t){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=Lg,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(t)}copy(t){return super.copy(t),this.depthPacking=t.depthPacking,this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this}},il=class extends Tn{constructor(t){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(t)}copy(t){return super.copy(t),this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this}};function Vc(s,t){return!s||s.constructor===t?s:typeof t.BYTES_PER_ELEMENT=="number"?new t(s):Array.prototype.slice.call(s)}function G_(s){return ArrayBuffer.isView(s)&&!(s instanceof DataView)}function W_(s){function t(i,r){return s[i]-s[r]}let e=s.length,n=new Array(e);for(let i=0;i!==e;++i)n[i]=i;return n.sort(t),n}function Zm(s,t,e){let n=s.length,i=new s.constructor(n);for(let r=0,o=0;o!==n;++r){let a=e[r]*t;for(let c=0;c!==t;++c)i[o++]=s[a+c]}return i}function qg(s,t,e,n){let i=1,r=s[0];for(;r!==void 0&&r[n]===void 0;)r=s[i++];if(r===void 0)return;let o=r[n];if(o!==void 0)if(Array.isArray(o))do o=r[n],o!==void 0&&(t.push(r.time),e.push(...o)),r=s[i++];while(r!==void 0);else if(o.toArray!==void 0)do o=r[n],o!==void 0&&(t.push(r.time),o.toArray(e,e.length)),r=s[i++];while(r!==void 0);else do o=r[n],o!==void 0&&(t.push(r.time),e.push(o)),r=s[i++];while(r!==void 0)}var Vi=class{constructor(t,e,n,i){this.parameterPositions=t,this._cachedIndex=0,this.resultBuffer=i!==void 0?i:new e.constructor(n),this.sampleValues=e,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(t){let e=this.parameterPositions,n=this._cachedIndex,i=e[n],r=e[n-1];n:{t:{let o;e:{i:if(!(t<i)){for(let a=n+2;;){if(i===void 0){if(t<r)break i;return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===a)break;if(r=i,i=e[++n],t<i)break t}o=e.length;break e}if(!(t>=r)){let a=e[1];t<a&&(n=2,r=a);for(let c=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===c)break;if(i=r,r=e[--n-1],t>=r)break t}o=n,n=0;break e}break n}for(;n<o;){let a=n+o>>>1;t<e[a]?o=a:n=a+1}if(i=e[n],r=e[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===void 0)return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,i)}return this.interpolate_(n,r,t,i)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(t){let e=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=t*i;for(let o=0;o!==i;++o)e[o]=n[r+o];return e}interpolate_(){throw new Error("call to abstract method")}intervalChanged_(){}},sl=class extends Vi{constructor(t,e,n,i){super(t,e,n,i),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:ef,endingEnd:ef}}intervalChanged_(t,e,n){let i=this.parameterPositions,r=t-2,o=t+1,a=i[r],c=i[o];if(a===void 0)switch(this.getSettings_().endingStart){case nf:r=t,a=2*e-n;break;case sf:r=i.length-2,a=e+i[r]-i[r+1];break;default:r=t,a=n}if(c===void 0)switch(this.getSettings_().endingEnd){case nf:o=t,c=2*n-e;break;case sf:o=1,c=n+i[1]-i[0];break;default:o=t-1,c=e}let l=(n-e)*.5,h=this.valueSize;this._weightPrev=l/(e-a),this._weightNext=l/(c-n),this._offsetPrev=r*h,this._offsetNext=o*h}interpolate_(t,e,n,i){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,c=t*a,l=c-a,h=this._offsetPrev,u=this._offsetNext,f=this._weightPrev,d=this._weightNext,g=(n-e)/(i-e),x=g*g,m=x*g,p=-f*m+2*f*x-f*g,y=(1+f)*m+(-1.5-2*f)*x+(-.5+f)*g+1,v=(-1-d)*m+(1.5+d)*x+.5*g,_=d*m-d*x;for(let w=0;w!==a;++w)r[w]=p*o[h+w]+y*o[l+w]+v*o[c+w]+_*o[u+w];return r}},rl=class extends Vi{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t,e,n,i){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,c=t*a,l=c-a,h=(n-e)/(i-e),u=1-h;for(let f=0;f!==a;++f)r[f]=o[l+f]*u+o[c+f]*h;return r}},ol=class extends Vi{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t){return this.copySampleValue_(t-1)}},An=class{constructor(t,e,n,i){if(t===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(e===void 0||e.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+t);this.name=t,this.times=Vc(e,this.TimeBufferType),this.values=Vc(n,this.ValueBufferType),this.setInterpolation(i||this.DefaultInterpolation)}static toJSON(t){let e=t.constructor,n;if(e.toJSON!==this.toJSON)n=e.toJSON(t);else{n={name:t.name,times:Vc(t.times,Array),values:Vc(t.values,Array)};let i=t.getInterpolation();i!==t.DefaultInterpolation&&(n.interpolation=i)}return n.type=t.ValueTypeName,n}InterpolantFactoryMethodDiscrete(t){return new ol(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodLinear(t){return new rl(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodSmooth(t){return new sl(this.times,this.values,this.getValueSize(),t)}setInterpolation(t){let e;switch(t){case ks:e=this.InterpolantFactoryMethodDiscrete;break;case Hs:e=this.InterpolantFactoryMethodLinear;break;case Wc:e=this.InterpolantFactoryMethodSmooth;break}if(e===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(t!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return console.warn("THREE.KeyframeTrack:",n),this}return this.createInterpolant=e,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return ks;case this.InterpolantFactoryMethodLinear:return Hs;case this.InterpolantFactoryMethodSmooth:return Wc}}getValueSize(){return this.values.length/this.times.length}shift(t){if(t!==0){let e=this.times;for(let n=0,i=e.length;n!==i;++n)e[n]+=t}return this}scale(t){if(t!==1){let e=this.times;for(let n=0,i=e.length;n!==i;++n)e[n]*=t}return this}trim(t,e){let n=this.times,i=n.length,r=0,o=i-1;for(;r!==i&&n[r]<t;)++r;for(;o!==-1&&n[o]>e;)--o;if(++o,r!==0||o!==i){r>=o&&(o=Math.max(o,1),r=o-1);let a=this.getValueSize();this.times=n.slice(r,o),this.values=this.values.slice(r*a,o*a)}return this}validate(){let t=!0,e=this.getValueSize();e-Math.floor(e)!==0&&(console.error("THREE.KeyframeTrack: Invalid value size in track.",this),t=!1);let n=this.times,i=this.values,r=n.length;r===0&&(console.error("THREE.KeyframeTrack: Track is empty.",this),t=!1);let o=null;for(let a=0;a!==r;a++){let c=n[a];if(typeof c=="number"&&isNaN(c)){console.error("THREE.KeyframeTrack: Time is not a valid number.",this,a,c),t=!1;break}if(o!==null&&o>c){console.error("THREE.KeyframeTrack: Out of order keys.",this,a,c,o),t=!1;break}o=c}if(i!==void 0&&G_(i))for(let a=0,c=i.length;a!==c;++a){let l=i[a];if(isNaN(l)){console.error("THREE.KeyframeTrack: Value is not a valid number.",this,a,l),t=!1;break}}return t}optimize(){let t=this.times.slice(),e=this.values.slice(),n=this.getValueSize(),i=this.getInterpolation()===Wc,r=t.length-1,o=1;for(let a=1;a<r;++a){let c=!1,l=t[a],h=t[a+1];if(l!==h&&(a!==1||l!==t[0]))if(i)c=!0;else{let u=a*n,f=u-n,d=u+n;for(let g=0;g!==n;++g){let x=e[u+g];if(x!==e[f+g]||x!==e[d+g]){c=!0;break}}}if(c){if(a!==o){t[o]=t[a];let u=a*n,f=o*n;for(let d=0;d!==n;++d)e[f+d]=e[u+d]}++o}}if(r>0){t[o]=t[r];for(let a=r*n,c=o*n,l=0;l!==n;++l)e[c+l]=e[a+l];++o}return o!==t.length?(this.times=t.slice(0,o),this.values=e.slice(0,o*n)):(this.times=t,this.values=e),this}clone(){let t=this.times.slice(),e=this.values.slice(),n=this.constructor,i=new n(this.name,t,e);return i.createInterpolant=this.createInterpolant,i}};An.prototype.ValueTypeName="";An.prototype.TimeBufferType=Float32Array;An.prototype.ValueBufferType=Float32Array;An.prototype.DefaultInterpolation=Hs;var Gi=class extends An{constructor(t,e,n){super(t,e,n)}};Gi.prototype.ValueTypeName="bool";Gi.prototype.ValueBufferType=Array;Gi.prototype.DefaultInterpolation=ks;Gi.prototype.InterpolantFactoryMethodLinear=void 0;Gi.prototype.InterpolantFactoryMethodSmooth=void 0;var ya=class extends An{constructor(t,e,n,i){super(t,e,n,i)}};ya.prototype.ValueTypeName="color";var wi=class extends An{constructor(t,e,n,i){super(t,e,n,i)}};wi.prototype.ValueTypeName="number";var al=class extends Vi{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t,e,n,i){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,c=(n-e)/(i-e),l=t*a;for(let h=l+a;l!==h;l+=4)Ve.slerpFlat(r,0,o,l-a,o,l,c);return r}},Ei=class extends An{constructor(t,e,n,i){super(t,e,n,i)}InterpolantFactoryMethodLinear(t){return new al(this.times,this.values,this.getValueSize(),t)}};Ei.prototype.ValueTypeName="quaternion";Ei.prototype.InterpolantFactoryMethodSmooth=void 0;var Wi=class extends An{constructor(t,e,n){super(t,e,n)}};Wi.prototype.ValueTypeName="string";Wi.prototype.ValueBufferType=Array;Wi.prototype.DefaultInterpolation=ks;Wi.prototype.InterpolantFactoryMethodLinear=void 0;Wi.prototype.InterpolantFactoryMethodSmooth=void 0;var Ti=class extends An{constructor(t,e,n,i){super(t,e,n,i)}};Ti.prototype.ValueTypeName="vector";var _a=class{constructor(t="",e=-1,n=[],i=Pg){this.name=t,this.tracks=n,this.duration=e,this.blendMode=i,this.uuid=hi(),this.userData={},this.duration<0&&this.resetDuration()}static parse(t){let e=[],n=t.tracks,i=1/(t.fps||1);for(let o=0,a=n.length;o!==a;++o)e.push(q_(n[o]).scale(i));let r=new this(t.name,t.duration,e,t.blendMode);return r.uuid=t.uuid,r.userData=JSON.parse(t.userData||"{}"),r}static toJSON(t){let e=[],n=t.tracks,i={name:t.name,duration:t.duration,tracks:e,uuid:t.uuid,blendMode:t.blendMode,userData:JSON.stringify(t.userData)};for(let r=0,o=n.length;r!==o;++r)e.push(An.toJSON(n[r]));return i}static CreateFromMorphTargetSequence(t,e,n,i){let r=e.length,o=[];for(let a=0;a<r;a++){let c=[],l=[];c.push((a+r-1)%r,a,(a+1)%r),l.push(0,1,0);let h=W_(c);c=Zm(c,1,h),l=Zm(l,1,h),!i&&c[0]===0&&(c.push(r),l.push(l[0])),o.push(new wi(".morphTargetInfluences["+e[a].name+"]",c,l).scale(1/n))}return new this(t,-1,o)}static findByName(t,e){let n=t;if(!Array.isArray(t)){let i=t;n=i.geometry&&i.geometry.animations||i.animations}for(let i=0;i<n.length;i++)if(n[i].name===e)return n[i];return null}static CreateClipsFromMorphTargetSequences(t,e,n){let i={},r=/^([\w-]*?)([\d]+)$/;for(let a=0,c=t.length;a<c;a++){let l=t[a],h=l.name.match(r);if(h&&h.length>1){let u=h[1],f=i[u];f||(i[u]=f=[]),f.push(l)}}let o=[];for(let a in i)o.push(this.CreateFromMorphTargetSequence(a,i[a],e,n));return o}static parseAnimation(t,e){if(console.warn("THREE.AnimationClip: parseAnimation() is deprecated and will be removed with r185"),!t)return console.error("THREE.AnimationClip: No animation in JSONLoader data."),null;let n=function(u,f,d,g,x){if(d.length!==0){let m=[],p=[];qg(d,m,p,g),m.length!==0&&x.push(new u(f,m,p))}},i=[],r=t.name||"default",o=t.fps||30,a=t.blendMode,c=t.length||-1,l=t.hierarchy||[];for(let u=0;u<l.length;u++){let f=l[u].keys;if(!(!f||f.length===0))if(f[0].morphTargets){let d={},g;for(g=0;g<f.length;g++)if(f[g].morphTargets)for(let x=0;x<f[g].morphTargets.length;x++)d[f[g].morphTargets[x]]=-1;for(let x in d){let m=[],p=[];for(let y=0;y!==f[g].morphTargets.length;++y){let v=f[g];m.push(v.time),p.push(v.morphTarget===x?1:0)}i.push(new wi(".morphTargetInfluence["+x+"]",m,p))}c=d.length*o}else{let d=".bones["+e[u].name+"]";n(Ti,d+".position",f,"pos",i),n(Ei,d+".quaternion",f,"rot",i),n(Ti,d+".scale",f,"scl",i)}}return i.length===0?null:new this(r,c,i,a)}resetDuration(){let t=this.tracks,e=0;for(let n=0,i=t.length;n!==i;++n){let r=this.tracks[n];e=Math.max(e,r.times[r.times.length-1])}return this.duration=e,this}trim(){for(let t=0;t<this.tracks.length;t++)this.tracks[t].trim(0,this.duration);return this}validate(){let t=!0;for(let e=0;e<this.tracks.length;e++)t=t&&this.tracks[e].validate();return t}optimize(){for(let t=0;t<this.tracks.length;t++)this.tracks[t].optimize();return this}clone(){let t=[];for(let n=0;n<this.tracks.length;n++)t.push(this.tracks[n].clone());let e=new this.constructor(this.name,this.duration,t,this.blendMode);return e.userData=JSON.parse(JSON.stringify(this.userData)),e}toJSON(){return this.constructor.toJSON(this)}};function X_(s){switch(s.toLowerCase()){case"scalar":case"double":case"float":case"number":case"integer":return wi;case"vector":case"vector2":case"vector3":case"vector4":return Ti;case"color":return ya;case"quaternion":return Ei;case"bool":case"boolean":return Gi;case"string":return Wi}throw new Error("THREE.KeyframeTrack: Unsupported typeName: "+s)}function q_(s){if(s.type===void 0)throw new Error("THREE.KeyframeTrack: track type undefined, can not parse");let t=X_(s.type);if(s.times===void 0){let e=[],n=[];qg(s.keys,e,n,"value"),s.times=e,s.values=n}return t.parse!==void 0?t.parse(s):new t(s.name,s.times,s.values,s.interpolation)}var Si={enabled:!1,files:{},add:function(s,t){this.enabled!==!1&&(this.files[s]=t)},get:function(s){if(this.enabled!==!1)return this.files[s]},remove:function(s){delete this.files[s]},clear:function(){this.files={}}},cl=class{constructor(t,e,n){let i=this,r=!1,o=0,a=0,c,l=[];this.onStart=void 0,this.onLoad=t,this.onProgress=e,this.onError=n,this.abortController=new AbortController,this.itemStart=function(h){a++,r===!1&&i.onStart!==void 0&&i.onStart(h,o,a),r=!0},this.itemEnd=function(h){o++,i.onProgress!==void 0&&i.onProgress(h,o,a),o===a&&(r=!1,i.onLoad!==void 0&&i.onLoad())},this.itemError=function(h){i.onError!==void 0&&i.onError(h)},this.resolveURL=function(h){return c?c(h):h},this.setURLModifier=function(h){return c=h,this},this.addHandler=function(h,u){return l.push(h,u),this},this.removeHandler=function(h){let u=l.indexOf(h);return u!==-1&&l.splice(u,2),this},this.getHandler=function(h){for(let u=0,f=l.length;u<f;u+=2){let d=l[u],g=l[u+1];if(d.global&&(d.lastIndex=0),d.test(h))return g}return null},this.abort=function(){return this.abortController.abort(),this.abortController=new AbortController,this}}},$g=new cl,Ai=class{constructor(t){this.manager=t!==void 0?t:$g,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={}}load(){}loadAsync(t,e){let n=this;return new Promise(function(i,r){n.load(t,i,e,r)})}parse(){}setCrossOrigin(t){return this.crossOrigin=t,this}setWithCredentials(t){return this.withCredentials=t,this}setPath(t){return this.path=t,this}setResourcePath(t){return this.resourcePath=t,this}setRequestHeader(t){return this.requestHeader=t,this}abort(){return this}};Ai.DEFAULT_MATERIAL_NAME="__DEFAULT";var Bi={},af=class extends Error{constructor(t,e){super(t),this.response=e}},no=class extends Ai{constructor(t){super(t),this.mimeType="",this.responseType="",this._abortController=new AbortController}load(t,e,n,i){t===void 0&&(t=""),this.path!==void 0&&(t=this.path+t),t=this.manager.resolveURL(t);let r=Si.get(`file:${t}`);if(r!==void 0)return this.manager.itemStart(t),setTimeout(()=>{e&&e(r),this.manager.itemEnd(t)},0),r;if(Bi[t]!==void 0){Bi[t].push({onLoad:e,onProgress:n,onError:i});return}Bi[t]=[],Bi[t].push({onLoad:e,onProgress:n,onError:i});let o=new Request(t,{headers:new Headers(this.requestHeader),credentials:this.withCredentials?"include":"same-origin",signal:typeof AbortSignal.any=="function"?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal}),a=this.mimeType,c=this.responseType;fetch(o).then(l=>{if(l.status===200||l.status===0){if(l.status===0&&console.warn("THREE.FileLoader: HTTP Status 0 received."),typeof ReadableStream>"u"||l.body===void 0||l.body.getReader===void 0)return l;let h=Bi[t],u=l.body.getReader(),f=l.headers.get("X-File-Size")||l.headers.get("Content-Length"),d=f?parseInt(f):0,g=d!==0,x=0,m=new ReadableStream({start(p){y();function y(){u.read().then(({done:v,value:_})=>{if(v)p.close();else{x+=_.byteLength;let w=new ProgressEvent("progress",{lengthComputable:g,loaded:x,total:d});for(let T=0,R=h.length;T<R;T++){let L=h[T];L.onProgress&&L.onProgress(w)}p.enqueue(_),y()}},v=>{p.error(v)})}}});return new Response(m)}else throw new af(`fetch for "${l.url}" responded with ${l.status}: ${l.statusText}`,l)}).then(l=>{switch(c){case"arraybuffer":return l.arrayBuffer();case"blob":return l.blob();case"document":return l.text().then(h=>new DOMParser().parseFromString(h,a));case"json":return l.json();default:if(a==="")return l.text();{let u=/charset="?([^;"\s]*)"?/i.exec(a),f=u&&u[1]?u[1].toLowerCase():void 0,d=new TextDecoder(f);return l.arrayBuffer().then(g=>d.decode(g))}}}).then(l=>{Si.add(`file:${t}`,l);let h=Bi[t];delete Bi[t];for(let u=0,f=h.length;u<f;u++){let d=h[u];d.onLoad&&d.onLoad(l)}}).catch(l=>{let h=Bi[t];if(h===void 0)throw this.manager.itemError(t),l;delete Bi[t];for(let u=0,f=h.length;u<f;u++){let d=h[u];d.onError&&d.onError(l)}this.manager.itemError(t)}).finally(()=>{this.manager.itemEnd(t)}),this.manager.itemStart(t)}setResponseType(t){return this.responseType=t,this}setMimeType(t){return this.mimeType=t,this}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}};var Fr=new WeakMap,ll=class extends Ai{constructor(t){super(t)}load(t,e,n,i){this.path!==void 0&&(t=this.path+t),t=this.manager.resolveURL(t);let r=this,o=Si.get(`image:${t}`);if(o!==void 0){if(o.complete===!0)r.manager.itemStart(t),setTimeout(function(){e&&e(o),r.manager.itemEnd(t)},0);else{let u=Fr.get(o);u===void 0&&(u=[],Fr.set(o,u)),u.push({onLoad:e,onError:i})}return o}let a=Wr("img");function c(){h(),e&&e(this);let u=Fr.get(this)||[];for(let f=0;f<u.length;f++){let d=u[f];d.onLoad&&d.onLoad(this)}Fr.delete(this),r.manager.itemEnd(t)}function l(u){h(),i&&i(u),Si.remove(`image:${t}`);let f=Fr.get(this)||[];for(let d=0;d<f.length;d++){let g=f[d];g.onError&&g.onError(u)}Fr.delete(this),r.manager.itemError(t),r.manager.itemEnd(t)}function h(){a.removeEventListener("load",c,!1),a.removeEventListener("error",l,!1)}return a.addEventListener("load",c,!1),a.addEventListener("error",l,!1),t.slice(0,5)!=="data:"&&this.crossOrigin!==void 0&&(a.crossOrigin=this.crossOrigin),Si.add(`image:${t}`,a),r.manager.itemStart(t),a.src=t,a}};var Ys=class extends Ai{constructor(t){super(t)}load(t,e,n,i){let r=new Je,o=new ll(this.manager);return o.setCrossOrigin(this.crossOrigin),o.setPath(this.path),o.load(t,function(a){r.image=a,r.needsUpdate=!0,e!==void 0&&e(r)},n,i),r}},Js=class extends be{constructor(t,e=1){super(),this.isLight=!0,this.type="Light",this.color=new Et(t),this.intensity=e}dispose(){}copy(t,e){return super.copy(t,e),this.color.copy(t.color),this.intensity=t.intensity,this}toJSON(t){let e=super.toJSON(t);return e.object.color=this.color.getHex(),e.object.intensity=this.intensity,this.groundColor!==void 0&&(e.object.groundColor=this.groundColor.getHex()),this.distance!==void 0&&(e.object.distance=this.distance),this.angle!==void 0&&(e.object.angle=this.angle),this.decay!==void 0&&(e.object.decay=this.decay),this.penumbra!==void 0&&(e.object.penumbra=this.penumbra),this.shadow!==void 0&&(e.object.shadow=this.shadow.toJSON()),this.target!==void 0&&(e.object.target=this.target.uuid),e}},va=class extends Js{constructor(t,e,n){super(t,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(be.DEFAULT_UP),this.updateMatrix(),this.groundColor=new Et(e)}copy(t,e){return super.copy(t,e),this.groundColor.copy(t.groundColor),this}},Ku=new Pt,jm=new B,Qm=new B,Sa=class{constructor(t){this.camera=t,this.intensity=1,this.bias=0,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new Ht(512,512),this.mapType=fi,this.map=null,this.mapPass=null,this.matrix=new Pt,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Qr,this._frameExtents=new Ht(1,1),this._viewportCount=1,this._viewports=[new de(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(t){let e=this.camera,n=this.matrix;jm.setFromMatrixPosition(t.matrixWorld),e.position.copy(jm),Qm.setFromMatrixPosition(t.target.matrixWorld),e.lookAt(Qm),e.updateMatrixWorld(),Ku.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),this._frustum.setFromProjectionMatrix(Ku,e.coordinateSystem,e.reversedDepth),e.reversedDepth?n.set(.5,0,0,.5,0,.5,0,.5,0,0,1,0,0,0,0,1):n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(Ku)}getViewport(t){return this._viewports[t]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(t){return this.camera=t.camera.clone(),this.intensity=t.intensity,this.bias=t.bias,this.radius=t.radius,this.autoUpdate=t.autoUpdate,this.needsUpdate=t.needsUpdate,this.normalBias=t.normalBias,this.blurSamples=t.blurSamples,this.mapSize.copy(t.mapSize),this}clone(){return new this.constructor().copy(this)}toJSON(){let t={};return this.intensity!==1&&(t.intensity=this.intensity),this.bias!==0&&(t.bias=this.bias),this.normalBias!==0&&(t.normalBias=this.normalBias),this.radius!==1&&(t.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(t.mapSize=this.mapSize.toArray()),t.camera=this.camera.toJSON(!1).object,delete t.camera.matrix,t}},cf=class extends Sa{constructor(){super(new He(50,1,.5,500)),this.isSpotLightShadow=!0,this.focus=1,this.aspect=1}updateMatrices(t){let e=this.camera,n=Vs*2*t.angle*this.focus,i=this.mapSize.width/this.mapSize.height*this.aspect,r=t.distance||e.far;(n!==e.fov||i!==e.aspect||r!==e.far)&&(e.fov=n,e.aspect=i,e.far=r,e.updateProjectionMatrix()),super.updateMatrices(t)}copy(t){return super.copy(t),this.focus=t.focus,this}},Ma=class extends Js{constructor(t,e,n=0,i=Math.PI/3,r=0,o=2){super(t,e),this.isSpotLight=!0,this.type="SpotLight",this.position.copy(be.DEFAULT_UP),this.updateMatrix(),this.target=new be,this.distance=n,this.angle=i,this.penumbra=r,this.decay=o,this.map=null,this.shadow=new cf}get power(){return this.intensity*Math.PI}set power(t){this.intensity=t/Math.PI}dispose(){this.shadow.dispose()}copy(t,e){return super.copy(t,e),this.distance=t.distance,this.angle=t.angle,this.penumbra=t.penumbra,this.decay=t.decay,this.target=t.target.clone(),this.shadow=t.shadow.clone(),this}},tg=new Pt,ea=new B,Zu=new B,lf=class extends Sa{constructor(){super(new He(90,1,.5,500)),this.isPointLightShadow=!0,this._frameExtents=new Ht(4,2),this._viewportCount=6,this._viewports=[new de(2,1,1,1),new de(0,1,1,1),new de(3,1,1,1),new de(1,1,1,1),new de(3,0,1,1),new de(1,0,1,1)],this._cubeDirections=[new B(1,0,0),new B(-1,0,0),new B(0,0,1),new B(0,0,-1),new B(0,1,0),new B(0,-1,0)],this._cubeUps=[new B(0,1,0),new B(0,1,0),new B(0,1,0),new B(0,1,0),new B(0,0,1),new B(0,0,-1)]}updateMatrices(t,e=0){let n=this.camera,i=this.matrix,r=t.distance||n.far;r!==n.far&&(n.far=r,n.updateProjectionMatrix()),ea.setFromMatrixPosition(t.matrixWorld),n.position.copy(ea),Zu.copy(n.position),Zu.add(this._cubeDirections[e]),n.up.copy(this._cubeUps[e]),n.lookAt(Zu),n.updateMatrixWorld(),i.makeTranslation(-ea.x,-ea.y,-ea.z),tg.multiplyMatrices(n.projectionMatrix,n.matrixWorldInverse),this._frustum.setFromProjectionMatrix(tg,n.coordinateSystem,n.reversedDepth)}},ba=class extends Js{constructor(t,e,n=0,i=2){super(t,e),this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=i,this.shadow=new lf}get power(){return this.intensity*4*Math.PI}set power(t){this.intensity=t/(4*Math.PI)}dispose(){this.shadow.dispose()}copy(t,e){return super.copy(t,e),this.distance=t.distance,this.decay=t.decay,this.shadow=t.shadow.clone(),this}},Ks=class extends Gs{constructor(t=-1,e=1,n=1,i=-1,r=.1,o=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=t,this.right=e,this.top=n,this.bottom=i,this.near=r,this.far=o,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.left=t.left,this.right=t.right,this.top=t.top,this.bottom=t.bottom,this.near=t.near,this.far=t.far,this.zoom=t.zoom,this.view=t.view===null?null:Object.assign({},t.view),this}setViewOffset(t,e,n,i,r,o){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=(this.right-this.left)/(2*this.zoom),e=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,i=(this.top+this.bottom)/2,r=n-t,o=n+t,a=i+e,c=i-e;if(this.view!==null&&this.view.enabled){let l=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=l*this.view.offsetX,o=r+l*this.view.width,a-=h*this.view.offsetY,c=a-h*this.view.height}this.projectionMatrix.makeOrthographic(r,o,a,c,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let e=super.toJSON(t);return e.object.zoom=this.zoom,e.object.left=this.left,e.object.right=this.right,e.object.top=this.top,e.object.bottom=this.bottom,e.object.near=this.near,e.object.far=this.far,this.view!==null&&(e.object.view=Object.assign({},this.view)),e}},hf=class extends Sa{constructor(){super(new Ks(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}},ps=class extends Js{constructor(t,e){super(t,e),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(be.DEFAULT_UP),this.updateMatrix(),this.target=new be,this.shadow=new hf}dispose(){this.shadow.dispose()}copy(t){return super.copy(t),this.target=t.target.clone(),this.shadow=t.shadow.clone(),this}};var Xi=class{static extractUrlBase(t){let e=t.lastIndexOf("/");return e===-1?"./":t.slice(0,e+1)}static resolveURL(t,e){return typeof t!="string"||t===""?"":(/^https?:\/\//i.test(e)&&/^\//.test(t)&&(e=e.replace(/(^https?:\/\/[^\/]+).*/i,"$1")),/^(https?:)?\/\//i.test(t)||/^data:.*,.*$/i.test(t)||/^blob:.*$/i.test(t)?t:e+t)}};var ju=new WeakMap,wa=class extends Ai{constructor(t){super(t),this.isImageBitmapLoader=!0,typeof createImageBitmap>"u"&&console.warn("THREE.ImageBitmapLoader: createImageBitmap() not supported."),typeof fetch>"u"&&console.warn("THREE.ImageBitmapLoader: fetch() not supported."),this.options={premultiplyAlpha:"none"},this._abortController=new AbortController}setOptions(t){return this.options=t,this}load(t,e,n,i){t===void 0&&(t=""),this.path!==void 0&&(t=this.path+t),t=this.manager.resolveURL(t);let r=this,o=Si.get(`image-bitmap:${t}`);if(o!==void 0){if(r.manager.itemStart(t),o.then){o.then(l=>{if(ju.has(o)===!0)i&&i(ju.get(o)),r.manager.itemError(t),r.manager.itemEnd(t);else return e&&e(l),r.manager.itemEnd(t),l});return}return setTimeout(function(){e&&e(o),r.manager.itemEnd(t)},0),o}let a={};a.credentials=this.crossOrigin==="anonymous"?"same-origin":"include",a.headers=this.requestHeader,a.signal=typeof AbortSignal.any=="function"?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal;let c=fetch(t,a).then(function(l){return l.blob()}).then(function(l){return createImageBitmap(l,Object.assign(r.options,{colorSpaceConversion:"none"}))}).then(function(l){return Si.add(`image-bitmap:${t}`,l),e&&e(l),r.manager.itemEnd(t),l}).catch(function(l){i&&i(l),ju.set(c,l),Si.remove(`image-bitmap:${t}`),r.manager.itemError(t),r.manager.itemEnd(t)});Si.add(`image-bitmap:${t}`,c),r.manager.itemStart(t)}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}};var hl=class extends He{constructor(t=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=t}};var Uf="\\[\\]\\.:\\/",$_=new RegExp("["+Uf+"]","g"),Ff="[^"+Uf+"]",Y_="[^"+Uf.replace("\\.","")+"]",J_=/((?:WC+[\/:])*)/.source.replace("WC",Ff),K_=/(WCOD+)?/.source.replace("WCOD",Y_),Z_=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",Ff),j_=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",Ff),Q_=new RegExp("^"+J_+K_+Z_+j_+"$"),tv=["material","materials","bones","map"],uf=class{constructor(t,e,n){let i=n||Te.parseTrackName(e);this._targetGroup=t,this._bindings=t.subscribe_(e,i)}getValue(t,e){this.bind();let n=this._targetGroup.nCachedObjects_,i=this._bindings[n];i!==void 0&&i.getValue(t,e)}setValue(t,e){let n=this._bindings;for(let i=this._targetGroup.nCachedObjects_,r=n.length;i!==r;++i)n[i].setValue(t,e)}bind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].bind()}unbind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].unbind()}},Te=class s{constructor(t,e,n){this.path=e,this.parsedPath=n||s.parseTrackName(e),this.node=s.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,e,n){return t&&t.isAnimationObjectGroup?new s.Composite(t,e,n):new s(t,e,n)}static sanitizeNodeName(t){return t.replace(/\s/g,"_").replace($_,"")}static parseTrackName(t){let e=Q_.exec(t);if(e===null)throw new Error("PropertyBinding: Cannot parse trackName: "+t);let n={nodeName:e[2],objectName:e[3],objectIndex:e[4],propertyName:e[5],propertyIndex:e[6]},i=n.nodeName&&n.nodeName.lastIndexOf(".");if(i!==void 0&&i!==-1){let r=n.nodeName.substring(i+1);tv.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,i),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("PropertyBinding: can not parse propertyName from trackName: "+t);return n}static findNode(t,e){if(e===void 0||e===""||e==="."||e===-1||e===t.name||e===t.uuid)return t;if(t.skeleton){let n=t.skeleton.getBoneByName(e);if(n!==void 0)return n}if(t.children){let n=function(r){for(let o=0;o<r.length;o++){let a=r[o];if(a.name===e||a.uuid===e)return a;let c=n(a.children);if(c)return c}return null},i=n(t.children);if(i)return i}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(t,e){t[e]=this.targetObject[this.propertyName]}_getValue_array(t,e){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)t[e++]=n[i]}_getValue_arrayElement(t,e){t[e]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(t,e){this.resolvedProperty.toArray(t,e)}_setValue_direct(t,e){this.targetObject[this.propertyName]=t[e]}_setValue_direct_setNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(t,e){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=t[e++]}_setValue_array_setNeedsUpdate(t,e){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=t[e++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(t,e){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=t[e++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(t,e){this.resolvedProperty[this.propertyIndex]=t[e]}_setValue_arrayElement_setNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(t,e){this.resolvedProperty.fromArray(t,e)}_setValue_fromArray_setNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(t,e){this.bind(),this.getValue(t,e)}_setValue_unbound(t,e){this.bind(),this.setValue(t,e)}bind(){let t=this.node,e=this.parsedPath,n=e.objectName,i=e.propertyName,r=e.propertyIndex;if(t||(t=s.findNode(this.rootNode,e.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){console.warn("THREE.PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let l=e.objectIndex;switch(n){case"materials":if(!t.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.materials){console.error("THREE.PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}t=t.material.materials;break;case"bones":if(!t.skeleton){console.error("THREE.PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}t=t.skeleton.bones;for(let h=0;h<t.length;h++)if(t[h].name===l){l=h;break}break;case"map":if("map"in t){t=t.map;break}if(!t.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.map){console.error("THREE.PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}t=t.material.map;break;default:if(t[n]===void 0){console.error("THREE.PropertyBinding: Can not bind to objectName of node undefined.",this);return}t=t[n]}if(l!==void 0){if(t[l]===void 0){console.error("THREE.PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,t);return}t=t[l]}}let o=t[i];if(o===void 0){let l=e.nodeName;console.error("THREE.PropertyBinding: Trying to update property for track: "+l+"."+i+" but it wasn't found.",t);return}let a=this.Versioning.None;this.targetObject=t,t.isMaterial===!0?a=this.Versioning.NeedsUpdate:t.isObject3D===!0&&(a=this.Versioning.MatrixWorldNeedsUpdate);let c=this.BindingType.Direct;if(r!==void 0){if(i==="morphTargetInfluences"){if(!t.geometry){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!t.geometry.morphAttributes){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}t.morphTargetDictionary[r]!==void 0&&(r=t.morphTargetDictionary[r])}c=this.BindingType.ArrayElement,this.resolvedProperty=o,this.propertyIndex=r}else o.fromArray!==void 0&&o.toArray!==void 0?(c=this.BindingType.HasFromToArray,this.resolvedProperty=o):Array.isArray(o)?(c=this.BindingType.EntireArray,this.resolvedProperty=o):this.propertyName=i;this.getValue=this.GetterByBindingType[c],this.setValue=this.SetterByBindingTypeAndVersioning[c][a]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};Te.Composite=uf;Te.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};Te.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};Te.prototype.GetterByBindingType=[Te.prototype._getValue_direct,Te.prototype._getValue_array,Te.prototype._getValue_arrayElement,Te.prototype._getValue_toArray];Te.prototype.SetterByBindingTypeAndVersioning=[[Te.prototype._setValue_direct,Te.prototype._setValue_direct_setNeedsUpdate,Te.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[Te.prototype._setValue_array,Te.prototype._setValue_array_setNeedsUpdate,Te.prototype._setValue_array_setMatrixWorldNeedsUpdate],[Te.prototype._setValue_arrayElement,Te.prototype._setValue_arrayElement_setNeedsUpdate,Te.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[Te.prototype._setValue_fromArray,Te.prototype._setValue_fromArray_setNeedsUpdate,Te.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var NE=new Float32Array(1);var eg=new Pt,Ea=class{constructor(t,e,n=0,i=1/0){this.ray=new dn(t,e),this.near=n,this.far=i,this.camera=null,this.layers=new $r,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(t,e){this.ray.set(t,e)}setFromCamera(t,e){e.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(t.x,t.y,.5).unproject(e).sub(this.ray.origin).normalize(),this.camera=e):e.isOrthographicCamera?(this.ray.origin.set(t.x,t.y,(e.near+e.far)/(e.near-e.far)).unproject(e),this.ray.direction.set(0,0,-1).transformDirection(e.matrixWorld),this.camera=e):console.error("THREE.Raycaster: Unsupported camera type: "+e.type)}setFromXRController(t){return eg.identity().extractRotation(t.matrixWorld),this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4(eg),this}intersectObject(t,e=!0,n=[]){return ff(t,this,n,e),n.sort(ng),n}intersectObjects(t,e=!0,n=[]){for(let i=0,r=t.length;i<r;i++)ff(t[i],this,n,e);return n.sort(ng),n}};function ng(s,t){return s.distance-t.distance}function ff(s,t,e,n){let i=!0;if(s.layers.test(t.layers)&&s.raycast(t,e)===!1&&(i=!1),i===!0&&n===!0){let r=s.children;for(let o=0,a=r.length;o<a;o++)ff(r[o],t,e,!0)}}var ig=new B,Gc=new B,Br=new B,zr=new B,Qu=new B,ev=new B,nv=new B,en=class{constructor(t=new B,e=new B){this.start=t,this.end=e}set(t,e){return this.start.copy(t),this.end.copy(e),this}copy(t){return this.start.copy(t.start),this.end.copy(t.end),this}getCenter(t){return t.addVectors(this.start,this.end).multiplyScalar(.5)}delta(t){return t.subVectors(this.end,this.start)}distanceSq(){return this.start.distanceToSquared(this.end)}distance(){return this.start.distanceTo(this.end)}at(t,e){return this.delta(e).multiplyScalar(t).add(this.start)}closestPointToPointParameter(t,e){ig.subVectors(t,this.start),Gc.subVectors(this.end,this.start);let n=Gc.dot(Gc),r=Gc.dot(ig)/n;return e&&(r=Yt(r,0,1)),r}closestPointToPoint(t,e,n){let i=this.closestPointToPointParameter(t,e);return this.delta(n).multiplyScalar(i).add(this.start)}distanceSqToLine3(t,e=ev,n=nv){let i=10000000000000001e-32,r,o,a=this.start,c=t.start,l=this.end,h=t.end;Br.subVectors(l,a),zr.subVectors(h,c),Qu.subVectors(a,c);let u=Br.dot(Br),f=zr.dot(zr),d=zr.dot(Qu);if(u<=i&&f<=i)return e.copy(a),n.copy(c),e.sub(n),e.dot(e);if(u<=i)r=0,o=d/f,o=Yt(o,0,1);else{let g=Br.dot(Qu);if(f<=i)o=0,r=Yt(-g/u,0,1);else{let x=Br.dot(zr),m=u*f-x*x;m!==0?r=Yt((x*d-g*f)/m,0,1):r=0,o=(x*r+d)/f,o<0?(o=0,r=Yt(-g/u,0,1)):o>1&&(o=1,r=Yt((x-g)/u,0,1))}}return e.copy(a).add(Br.multiplyScalar(r)),n.copy(c).add(zr.multiplyScalar(o)),e.sub(n),e.dot(e)}applyMatrix4(t){return this.start.applyMatrix4(t),this.end.applyMatrix4(t),this}equals(t){return t.start.equals(this.start)&&t.end.equals(this.end)}clone(){return new this.constructor().copy(this)}};function Bf(s,t,e,n){let i=iv(n);switch(e){case wf:return s*t;case El:return s*t/i.components*i.byteLength;case Tl:return s*t/i.components*i.byteLength;case Tf:return s*t*2/i.components*i.byteLength;case Al:return s*t*2/i.components*i.byteLength;case Ef:return s*t*3/i.components*i.byteLength;case Mn:return s*t*4/i.components*i.byteLength;case Rl:return s*t*4/i.components*i.byteLength;case Ca:case Ia:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*8;case Pa:case La:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*16;case Il:case Ll:return Math.max(s,16)*Math.max(t,8)/4;case Cl:case Pl:return Math.max(s,8)*Math.max(t,8)/2;case Nl:case Dl:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*8;case Ol:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*16;case Ul:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*16;case Fl:return Math.floor((s+4)/5)*Math.floor((t+3)/4)*16;case Bl:return Math.floor((s+4)/5)*Math.floor((t+4)/5)*16;case zl:return Math.floor((s+5)/6)*Math.floor((t+4)/5)*16;case kl:return Math.floor((s+5)/6)*Math.floor((t+5)/6)*16;case Hl:return Math.floor((s+7)/8)*Math.floor((t+4)/5)*16;case Vl:return Math.floor((s+7)/8)*Math.floor((t+5)/6)*16;case Gl:return Math.floor((s+7)/8)*Math.floor((t+7)/8)*16;case Wl:return Math.floor((s+9)/10)*Math.floor((t+4)/5)*16;case Xl:return Math.floor((s+9)/10)*Math.floor((t+5)/6)*16;case ql:return Math.floor((s+9)/10)*Math.floor((t+7)/8)*16;case $l:return Math.floor((s+9)/10)*Math.floor((t+9)/10)*16;case Yl:return Math.floor((s+11)/12)*Math.floor((t+9)/10)*16;case Jl:return Math.floor((s+11)/12)*Math.floor((t+11)/12)*16;case Kl:case Zl:case jl:return Math.ceil(s/4)*Math.ceil(t/4)*16;case Ql:case th:return Math.ceil(s/4)*Math.ceil(t/4)*8;case eh:case nh:return Math.ceil(s/4)*Math.ceil(t/4)*16}throw new Error(`Unable to determine texture byte length for ${e} format.`)}function iv(s){switch(s){case fi:case vf:return{byteLength:1,components:1};case ro:case Sf:case Yi:return{byteLength:2,components:1};case bl:case wl:return{byteLength:2,components:4};case ms:case Ml:case $n:return{byteLength:4,components:1};case Mf:case bf:return{byteLength:4,components:3}}throw new Error(`Unknown texture type ${s}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"180"}}));typeof window<"u"&&(window.__THREE__?console.warn("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="180");function x0(){let s=null,t=!1,e=null,n=null;function i(r,o){e(r,o),n=s.requestAnimationFrame(i)}return{start:function(){t!==!0&&e!==null&&(n=s.requestAnimationFrame(i),t=!0)},stop:function(){s.cancelAnimationFrame(n),t=!1},setAnimationLoop:function(r){e=r},setContext:function(r){s=r}}}function sv(s){let t=new WeakMap;function e(a,c){let l=a.array,h=a.usage,u=l.byteLength,f=s.createBuffer();s.bindBuffer(c,f),s.bufferData(c,l,h),a.onUploadCallback();let d;if(l instanceof Float32Array)d=s.FLOAT;else if(typeof Float16Array<"u"&&l instanceof Float16Array)d=s.HALF_FLOAT;else if(l instanceof Uint16Array)a.isFloat16BufferAttribute?d=s.HALF_FLOAT:d=s.UNSIGNED_SHORT;else if(l instanceof Int16Array)d=s.SHORT;else if(l instanceof Uint32Array)d=s.UNSIGNED_INT;else if(l instanceof Int32Array)d=s.INT;else if(l instanceof Int8Array)d=s.BYTE;else if(l instanceof Uint8Array)d=s.UNSIGNED_BYTE;else if(l instanceof Uint8ClampedArray)d=s.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+l);return{buffer:f,type:d,bytesPerElement:l.BYTES_PER_ELEMENT,version:a.version,size:u}}function n(a,c,l){let h=c.array,u=c.updateRanges;if(s.bindBuffer(l,a),u.length===0)s.bufferSubData(l,0,h);else{u.sort((d,g)=>d.start-g.start);let f=0;for(let d=1;d<u.length;d++){let g=u[f],x=u[d];x.start<=g.start+g.count+1?g.count=Math.max(g.count,x.start+x.count-g.start):(++f,u[f]=x)}u.length=f+1;for(let d=0,g=u.length;d<g;d++){let x=u[d];s.bufferSubData(l,x.start*h.BYTES_PER_ELEMENT,h,x.start,x.count)}c.clearUpdateRanges()}c.onUploadCallback()}function i(a){return a.isInterleavedBufferAttribute&&(a=a.data),t.get(a)}function r(a){a.isInterleavedBufferAttribute&&(a=a.data);let c=t.get(a);c&&(s.deleteBuffer(c.buffer),t.delete(a))}function o(a,c){if(a.isInterleavedBufferAttribute&&(a=a.data),a.isGLBufferAttribute){let h=t.get(a);(!h||h.version<a.version)&&t.set(a,{buffer:a.buffer,type:a.type,bytesPerElement:a.elementSize,version:a.version});return}let l=t.get(a);if(l===void 0)t.set(a,e(a,c));else if(l.version<a.version){if(l.size!==a.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(l.buffer,a,c),l.version=a.version}}return{get:i,remove:r,update:o}}var rv=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,ov=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,av=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,cv=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,lv=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,hv=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,uv=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,fv=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,dv=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec3 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;
	}
#endif`,pv=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,mv=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,gv=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,xv=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,yv=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,_v=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,vv=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,Sv=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,Mv=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,bv=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,wv=`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,Ev=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,Tv=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec3 vColor;
#endif`,Av=`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif
#ifdef USE_BATCHING_COLOR
	vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );
	vColor.xyz *= batchingColor.xyz;
#endif`,Rv=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,Cv=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,Iv=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,Pv=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,Lv=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,Nv=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,Dv=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Ov="gl_FragColor = linearToOutputTexel( gl_FragColor );",Uv=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,Fv=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,Bv=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,zv=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,kv=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Hv=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,Vv=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Gv=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Wv=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,Xv=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,qv=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,$v=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,Yv=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,Jv=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,Kv=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,Zv=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,jv=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Qv=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,tS=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,eS=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,nS=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,iS=`struct PhysicalMaterial {
	vec3 diffuseColor;
	float roughness;
	vec3 specularColor;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return saturate(v);
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColor;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
	return saturate( DG * RECIPROCAL_PI );
}
vec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;
	return fab;
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
	#endif
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );
	#endif
	vec3 totalScattering = singleScattering + multiScattering;
	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );
	reflectedLight.indirectSpecular += radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,sS=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,rS=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,oS=`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,aS=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,cS=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,lS=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,hS=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,uS=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,fS=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,dS=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,pS=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,mS=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,gS=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,xS=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,yS=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,_S=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,vS=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,SS=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,MS=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,bS=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,wS=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,ES=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,TS=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,AS=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,RS=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,CS=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,IS=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,PS=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,LS=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,NS=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,DS=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,OS=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,US=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,FS=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,BS=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,zS=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,kS=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		float depth = unpackRGBAToDepth( texture2D( depths, uv ) );
		#ifdef USE_REVERSED_DEPTH_BUFFER
			return step( depth, compare );
		#else
			return step( compare, depth );
		#endif
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow( sampler2D shadow, vec2 uv, float compare ) {
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		#ifdef USE_REVERSED_DEPTH_BUFFER
			float hard_shadow = step( distribution.x, compare );
		#else
			float hard_shadow = step( compare, distribution.x );
		#endif
		if ( hard_shadow != 1.0 ) {
			float distance = compare - distribution.x;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		
		float lightToPositionLength = length( lightToPosition );
		if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {
			float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
				vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
				shadow = (
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
				) * ( 1.0 / 9.0 );
			#else
				shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
			#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
#endif`,HS=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,VS=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,GS=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,WS=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,XS=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,qS=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,$S=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,YS=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,JS=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,KS=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,ZS=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,jS=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,QS=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,tM=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,eM=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,nM=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,iM=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,sM=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,rM=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,oM=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,aM=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,cM=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,lM=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,hM=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,uM=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,fM=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,dM=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}`,pM=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,mM=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,gM=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,xM=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,yM=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,_M=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,vM=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,SM=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,MM=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,bM=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,wM=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,EM=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <packing>
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,TM=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,AM=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,RM=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,CM=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );
		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;
	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,IM=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,PM=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,LM=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,NM=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,DM=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,OM=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,UM=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,FM=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,te={alphahash_fragment:rv,alphahash_pars_fragment:ov,alphamap_fragment:av,alphamap_pars_fragment:cv,alphatest_fragment:lv,alphatest_pars_fragment:hv,aomap_fragment:uv,aomap_pars_fragment:fv,batching_pars_vertex:dv,batching_vertex:pv,begin_vertex:mv,beginnormal_vertex:gv,bsdfs:xv,iridescence_fragment:yv,bumpmap_pars_fragment:_v,clipping_planes_fragment:vv,clipping_planes_pars_fragment:Sv,clipping_planes_pars_vertex:Mv,clipping_planes_vertex:bv,color_fragment:wv,color_pars_fragment:Ev,color_pars_vertex:Tv,color_vertex:Av,common:Rv,cube_uv_reflection_fragment:Cv,defaultnormal_vertex:Iv,displacementmap_pars_vertex:Pv,displacementmap_vertex:Lv,emissivemap_fragment:Nv,emissivemap_pars_fragment:Dv,colorspace_fragment:Ov,colorspace_pars_fragment:Uv,envmap_fragment:Fv,envmap_common_pars_fragment:Bv,envmap_pars_fragment:zv,envmap_pars_vertex:kv,envmap_physical_pars_fragment:Zv,envmap_vertex:Hv,fog_vertex:Vv,fog_pars_vertex:Gv,fog_fragment:Wv,fog_pars_fragment:Xv,gradientmap_pars_fragment:qv,lightmap_pars_fragment:$v,lights_lambert_fragment:Yv,lights_lambert_pars_fragment:Jv,lights_pars_begin:Kv,lights_toon_fragment:jv,lights_toon_pars_fragment:Qv,lights_phong_fragment:tS,lights_phong_pars_fragment:eS,lights_physical_fragment:nS,lights_physical_pars_fragment:iS,lights_fragment_begin:sS,lights_fragment_maps:rS,lights_fragment_end:oS,logdepthbuf_fragment:aS,logdepthbuf_pars_fragment:cS,logdepthbuf_pars_vertex:lS,logdepthbuf_vertex:hS,map_fragment:uS,map_pars_fragment:fS,map_particle_fragment:dS,map_particle_pars_fragment:pS,metalnessmap_fragment:mS,metalnessmap_pars_fragment:gS,morphinstance_vertex:xS,morphcolor_vertex:yS,morphnormal_vertex:_S,morphtarget_pars_vertex:vS,morphtarget_vertex:SS,normal_fragment_begin:MS,normal_fragment_maps:bS,normal_pars_fragment:wS,normal_pars_vertex:ES,normal_vertex:TS,normalmap_pars_fragment:AS,clearcoat_normal_fragment_begin:RS,clearcoat_normal_fragment_maps:CS,clearcoat_pars_fragment:IS,iridescence_pars_fragment:PS,opaque_fragment:LS,packing:NS,premultiplied_alpha_fragment:DS,project_vertex:OS,dithering_fragment:US,dithering_pars_fragment:FS,roughnessmap_fragment:BS,roughnessmap_pars_fragment:zS,shadowmap_pars_fragment:kS,shadowmap_pars_vertex:HS,shadowmap_vertex:VS,shadowmask_pars_fragment:GS,skinbase_vertex:WS,skinning_pars_vertex:XS,skinning_vertex:qS,skinnormal_vertex:$S,specularmap_fragment:YS,specularmap_pars_fragment:JS,tonemapping_fragment:KS,tonemapping_pars_fragment:ZS,transmission_fragment:jS,transmission_pars_fragment:QS,uv_pars_fragment:tM,uv_pars_vertex:eM,uv_vertex:nM,worldpos_vertex:iM,background_vert:sM,background_frag:rM,backgroundCube_vert:oM,backgroundCube_frag:aM,cube_vert:cM,cube_frag:lM,depth_vert:hM,depth_frag:uM,distanceRGBA_vert:fM,distanceRGBA_frag:dM,equirect_vert:pM,equirect_frag:mM,linedashed_vert:gM,linedashed_frag:xM,meshbasic_vert:yM,meshbasic_frag:_M,meshlambert_vert:vM,meshlambert_frag:SM,meshmatcap_vert:MM,meshmatcap_frag:bM,meshnormal_vert:wM,meshnormal_frag:EM,meshphong_vert:TM,meshphong_frag:AM,meshphysical_vert:RM,meshphysical_frag:CM,meshtoon_vert:IM,meshtoon_frag:PM,points_vert:LM,points_frag:NM,shadow_vert:DM,shadow_frag:OM,sprite_vert:UM,sprite_frag:FM},Ct={common:{diffuse:{value:new Et(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new jt},alphaMap:{value:null},alphaMapTransform:{value:new jt},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new jt}},envmap:{envMap:{value:null},envMapRotation:{value:new jt},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new jt}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new jt}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new jt},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new jt},normalScale:{value:new Ht(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new jt},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new jt}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new jt}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new jt}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Et(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new Et(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new jt},alphaTest:{value:0},uvTransform:{value:new jt}},sprite:{diffuse:{value:new Et(16777215)},opacity:{value:1},center:{value:new Ht(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new jt},alphaMap:{value:null},alphaMapTransform:{value:new jt},alphaTest:{value:0}}},Ci={basic:{uniforms:mn([Ct.common,Ct.specularmap,Ct.envmap,Ct.aomap,Ct.lightmap,Ct.fog]),vertexShader:te.meshbasic_vert,fragmentShader:te.meshbasic_frag},lambert:{uniforms:mn([Ct.common,Ct.specularmap,Ct.envmap,Ct.aomap,Ct.lightmap,Ct.emissivemap,Ct.bumpmap,Ct.normalmap,Ct.displacementmap,Ct.fog,Ct.lights,{emissive:{value:new Et(0)}}]),vertexShader:te.meshlambert_vert,fragmentShader:te.meshlambert_frag},phong:{uniforms:mn([Ct.common,Ct.specularmap,Ct.envmap,Ct.aomap,Ct.lightmap,Ct.emissivemap,Ct.bumpmap,Ct.normalmap,Ct.displacementmap,Ct.fog,Ct.lights,{emissive:{value:new Et(0)},specular:{value:new Et(1118481)},shininess:{value:30}}]),vertexShader:te.meshphong_vert,fragmentShader:te.meshphong_frag},standard:{uniforms:mn([Ct.common,Ct.envmap,Ct.aomap,Ct.lightmap,Ct.emissivemap,Ct.bumpmap,Ct.normalmap,Ct.displacementmap,Ct.roughnessmap,Ct.metalnessmap,Ct.fog,Ct.lights,{emissive:{value:new Et(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:te.meshphysical_vert,fragmentShader:te.meshphysical_frag},toon:{uniforms:mn([Ct.common,Ct.aomap,Ct.lightmap,Ct.emissivemap,Ct.bumpmap,Ct.normalmap,Ct.displacementmap,Ct.gradientmap,Ct.fog,Ct.lights,{emissive:{value:new Et(0)}}]),vertexShader:te.meshtoon_vert,fragmentShader:te.meshtoon_frag},matcap:{uniforms:mn([Ct.common,Ct.bumpmap,Ct.normalmap,Ct.displacementmap,Ct.fog,{matcap:{value:null}}]),vertexShader:te.meshmatcap_vert,fragmentShader:te.meshmatcap_frag},points:{uniforms:mn([Ct.points,Ct.fog]),vertexShader:te.points_vert,fragmentShader:te.points_frag},dashed:{uniforms:mn([Ct.common,Ct.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:te.linedashed_vert,fragmentShader:te.linedashed_frag},depth:{uniforms:mn([Ct.common,Ct.displacementmap]),vertexShader:te.depth_vert,fragmentShader:te.depth_frag},normal:{uniforms:mn([Ct.common,Ct.bumpmap,Ct.normalmap,Ct.displacementmap,{opacity:{value:1}}]),vertexShader:te.meshnormal_vert,fragmentShader:te.meshnormal_frag},sprite:{uniforms:mn([Ct.sprite,Ct.fog]),vertexShader:te.sprite_vert,fragmentShader:te.sprite_frag},background:{uniforms:{uvTransform:{value:new jt},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:te.background_vert,fragmentShader:te.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new jt}},vertexShader:te.backgroundCube_vert,fragmentShader:te.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:te.cube_vert,fragmentShader:te.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:te.equirect_vert,fragmentShader:te.equirect_frag},distanceRGBA:{uniforms:mn([Ct.common,Ct.displacementmap,{referencePosition:{value:new B},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:te.distanceRGBA_vert,fragmentShader:te.distanceRGBA_frag},shadow:{uniforms:mn([Ct.lights,Ct.fog,{color:{value:new Et(0)},opacity:{value:1}}]),vertexShader:te.shadow_vert,fragmentShader:te.shadow_frag}};Ci.physical={uniforms:mn([Ci.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new jt},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new jt},clearcoatNormalScale:{value:new Ht(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new jt},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new jt},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new jt},sheen:{value:0},sheenColor:{value:new Et(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new jt},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new jt},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new jt},transmissionSamplerSize:{value:new Ht},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new jt},attenuationDistance:{value:0},attenuationColor:{value:new Et(0)},specularColor:{value:new Et(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new jt},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new jt},anisotropyVector:{value:new Ht},anisotropyMap:{value:null},anisotropyMapTransform:{value:new jt}}]),vertexShader:te.meshphysical_vert,fragmentShader:te.meshphysical_frag};var ih={r:0,b:0,g:0},er=new pn,BM=new Pt;function zM(s,t,e,n,i,r,o){let a=new Et(0),c=r===!0?0:1,l,h,u=null,f=0,d=null;function g(v){let _=v.isScene===!0?v.background:null;return _&&_.isTexture&&(_=(v.backgroundBlurriness>0?e:t).get(_)),_}function x(v){let _=!1,w=g(v);w===null?p(a,c):w&&w.isColor&&(p(w,1),_=!0);let T=s.xr.getEnvironmentBlendMode();T==="additive"?n.buffers.color.setClear(0,0,0,1,o):T==="alpha-blend"&&n.buffers.color.setClear(0,0,0,0,o),(s.autoClear||_)&&(n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),s.clear(s.autoClearColor,s.autoClearDepth,s.autoClearStencil))}function m(v,_){let w=g(_);w&&(w.isCubeTexture||w.mapping===Ra)?(h===void 0&&(h=new pe(new Yr(1,1,1),new Sn({name:"BackgroundCubeMaterial",uniforms:tr(Ci.backgroundCube.uniforms),vertexShader:Ci.backgroundCube.vertexShader,fragmentShader:Ci.backgroundCube.fragmentShader,side:nn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),h.geometry.deleteAttribute("normal"),h.geometry.deleteAttribute("uv"),h.onBeforeRender=function(T,R,L){this.matrixWorld.copyPosition(L.matrixWorld)},Object.defineProperty(h.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),i.update(h)),er.copy(_.backgroundRotation),er.x*=-1,er.y*=-1,er.z*=-1,w.isCubeTexture&&w.isRenderTargetTexture===!1&&(er.y*=-1,er.z*=-1),h.material.uniforms.envMap.value=w,h.material.uniforms.flipEnvMap.value=w.isCubeTexture&&w.isRenderTargetTexture===!1?-1:1,h.material.uniforms.backgroundBlurriness.value=_.backgroundBlurriness,h.material.uniforms.backgroundIntensity.value=_.backgroundIntensity,h.material.uniforms.backgroundRotation.value.setFromMatrix4(BM.makeRotationFromEuler(er)),h.material.toneMapped=ie.getTransfer(w.colorSpace)!==Se,(u!==w||f!==w.version||d!==s.toneMapping)&&(h.material.needsUpdate=!0,u=w,f=w.version,d=s.toneMapping),h.layers.enableAll(),v.unshift(h,h.geometry,h.material,0,0,null)):w&&w.isTexture&&(l===void 0&&(l=new pe(new bi(2,2),new Sn({name:"BackgroundMaterial",uniforms:tr(Ci.background.uniforms),vertexShader:Ci.background.vertexShader,fragmentShader:Ci.background.fragmentShader,side:fn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(l)),l.material.uniforms.t2D.value=w,l.material.uniforms.backgroundIntensity.value=_.backgroundIntensity,l.material.toneMapped=ie.getTransfer(w.colorSpace)!==Se,w.matrixAutoUpdate===!0&&w.updateMatrix(),l.material.uniforms.uvTransform.value.copy(w.matrix),(u!==w||f!==w.version||d!==s.toneMapping)&&(l.material.needsUpdate=!0,u=w,f=w.version,d=s.toneMapping),l.layers.enableAll(),v.unshift(l,l.geometry,l.material,0,0,null))}function p(v,_){v.getRGB(ih,Df(s)),n.buffers.color.setClear(ih.r,ih.g,ih.b,_,o)}function y(){h!==void 0&&(h.geometry.dispose(),h.material.dispose(),h=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return a},setClearColor:function(v,_=1){a.set(v),c=_,p(a,c)},getClearAlpha:function(){return c},setClearAlpha:function(v){c=v,p(a,c)},render:x,addToRenderList:m,dispose:y}}function kM(s,t){let e=s.getParameter(s.MAX_VERTEX_ATTRIBS),n={},i=f(null),r=i,o=!1;function a(M,b,A,N,C){let I=!1,O=u(N,A,b);r!==O&&(r=O,l(r.object)),I=d(M,N,A,C),I&&g(M,N,A,C),C!==null&&t.update(C,s.ELEMENT_ARRAY_BUFFER),(I||o)&&(o=!1,_(M,b,A,N),C!==null&&s.bindBuffer(s.ELEMENT_ARRAY_BUFFER,t.get(C).buffer))}function c(){return s.createVertexArray()}function l(M){return s.bindVertexArray(M)}function h(M){return s.deleteVertexArray(M)}function u(M,b,A){let N=A.wireframe===!0,C=n[M.id];C===void 0&&(C={},n[M.id]=C);let I=C[b.id];I===void 0&&(I={},C[b.id]=I);let O=I[N];return O===void 0&&(O=f(c()),I[N]=O),O}function f(M){let b=[],A=[],N=[];for(let C=0;C<e;C++)b[C]=0,A[C]=0,N[C]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:b,enabledAttributes:A,attributeDivisors:N,object:M,attributes:{},index:null}}function d(M,b,A,N){let C=r.attributes,I=b.attributes,O=0,k=A.getAttributes();for(let z in k)if(k[z].location>=0){let j=C[z],W=I[z];if(W===void 0&&(z==="instanceMatrix"&&M.instanceMatrix&&(W=M.instanceMatrix),z==="instanceColor"&&M.instanceColor&&(W=M.instanceColor)),j===void 0||j.attribute!==W||W&&j.data!==W.data)return!0;O++}return r.attributesNum!==O||r.index!==N}function g(M,b,A,N){let C={},I=b.attributes,O=0,k=A.getAttributes();for(let z in k)if(k[z].location>=0){let j=I[z];j===void 0&&(z==="instanceMatrix"&&M.instanceMatrix&&(j=M.instanceMatrix),z==="instanceColor"&&M.instanceColor&&(j=M.instanceColor));let W={};W.attribute=j,j&&j.data&&(W.data=j.data),C[z]=W,O++}r.attributes=C,r.attributesNum=O,r.index=N}function x(){let M=r.newAttributes;for(let b=0,A=M.length;b<A;b++)M[b]=0}function m(M){p(M,0)}function p(M,b){let A=r.newAttributes,N=r.enabledAttributes,C=r.attributeDivisors;A[M]=1,N[M]===0&&(s.enableVertexAttribArray(M),N[M]=1),C[M]!==b&&(s.vertexAttribDivisor(M,b),C[M]=b)}function y(){let M=r.newAttributes,b=r.enabledAttributes;for(let A=0,N=b.length;A<N;A++)b[A]!==M[A]&&(s.disableVertexAttribArray(A),b[A]=0)}function v(M,b,A,N,C,I,O){O===!0?s.vertexAttribIPointer(M,b,A,C,I):s.vertexAttribPointer(M,b,A,N,C,I)}function _(M,b,A,N){x();let C=N.attributes,I=A.getAttributes(),O=b.defaultAttributeValues;for(let k in I){let z=I[k];if(z.location>=0){let et=C[k];if(et===void 0&&(k==="instanceMatrix"&&M.instanceMatrix&&(et=M.instanceMatrix),k==="instanceColor"&&M.instanceColor&&(et=M.instanceColor)),et!==void 0){let j=et.normalized,W=et.itemSize,tt=t.get(et);if(tt===void 0)continue;let at=tt.buffer,st=tt.type,ot=tt.bytesPerElement,J=st===s.INT||st===s.UNSIGNED_INT||et.gpuType===Ml;if(et.isInterleavedBufferAttribute){let it=et.data,ft=it.stride,bt=et.offset;if(it.isInstancedInterleavedBuffer){for(let St=0;St<z.locationSize;St++)p(z.location+St,it.meshPerAttribute);M.isInstancedMesh!==!0&&N._maxInstanceCount===void 0&&(N._maxInstanceCount=it.meshPerAttribute*it.count)}else for(let St=0;St<z.locationSize;St++)m(z.location+St);s.bindBuffer(s.ARRAY_BUFFER,at);for(let St=0;St<z.locationSize;St++)v(z.location+St,W/z.locationSize,st,j,ft*ot,(bt+W/z.locationSize*St)*ot,J)}else{if(et.isInstancedBufferAttribute){for(let it=0;it<z.locationSize;it++)p(z.location+it,et.meshPerAttribute);M.isInstancedMesh!==!0&&N._maxInstanceCount===void 0&&(N._maxInstanceCount=et.meshPerAttribute*et.count)}else for(let it=0;it<z.locationSize;it++)m(z.location+it);s.bindBuffer(s.ARRAY_BUFFER,at);for(let it=0;it<z.locationSize;it++)v(z.location+it,W/z.locationSize,st,j,W*ot,W/z.locationSize*it*ot,J)}}else if(O!==void 0){let j=O[k];if(j!==void 0)switch(j.length){case 2:s.vertexAttrib2fv(z.location,j);break;case 3:s.vertexAttrib3fv(z.location,j);break;case 4:s.vertexAttrib4fv(z.location,j);break;default:s.vertexAttrib1fv(z.location,j)}}}}y()}function w(){L();for(let M in n){let b=n[M];for(let A in b){let N=b[A];for(let C in N)h(N[C].object),delete N[C];delete b[A]}delete n[M]}}function T(M){if(n[M.id]===void 0)return;let b=n[M.id];for(let A in b){let N=b[A];for(let C in N)h(N[C].object),delete N[C];delete b[A]}delete n[M.id]}function R(M){for(let b in n){let A=n[b];if(A[M.id]===void 0)continue;let N=A[M.id];for(let C in N)h(N[C].object),delete N[C];delete A[M.id]}}function L(){S(),o=!0,r!==i&&(r=i,l(r.object))}function S(){i.geometry=null,i.program=null,i.wireframe=!1}return{setup:a,reset:L,resetDefaultState:S,dispose:w,releaseStatesOfGeometry:T,releaseStatesOfProgram:R,initAttributes:x,enableAttribute:m,disableUnusedAttributes:y}}function HM(s,t,e){let n;function i(l){n=l}function r(l,h){s.drawArrays(n,l,h),e.update(h,n,1)}function o(l,h,u){u!==0&&(s.drawArraysInstanced(n,l,h,u),e.update(h,n,u))}function a(l,h,u){if(u===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,l,0,h,0,u);let d=0;for(let g=0;g<u;g++)d+=h[g];e.update(d,n,1)}function c(l,h,u,f){if(u===0)return;let d=t.get("WEBGL_multi_draw");if(d===null)for(let g=0;g<l.length;g++)o(l[g],h[g],f[g]);else{d.multiDrawArraysInstancedWEBGL(n,l,0,h,0,f,0,u);let g=0;for(let x=0;x<u;x++)g+=h[x]*f[x];e.update(g,n,1)}}this.setMode=i,this.render=r,this.renderInstances=o,this.renderMultiDraw=a,this.renderMultiDrawInstances=c}function VM(s,t,e,n){let i;function r(){if(i!==void 0)return i;if(t.has("EXT_texture_filter_anisotropic")===!0){let R=t.get("EXT_texture_filter_anisotropic");i=s.getParameter(R.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else i=0;return i}function o(R){return!(R!==Mn&&n.convert(R)!==s.getParameter(s.IMPLEMENTATION_COLOR_READ_FORMAT))}function a(R){let L=R===Yi&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));return!(R!==fi&&n.convert(R)!==s.getParameter(s.IMPLEMENTATION_COLOR_READ_TYPE)&&R!==$n&&!L)}function c(R){if(R==="highp"){if(s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.HIGH_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.HIGH_FLOAT).precision>0)return"highp";R="mediump"}return R==="mediump"&&s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.MEDIUM_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let l=e.precision!==void 0?e.precision:"highp",h=c(l);h!==l&&(console.warn("THREE.WebGLRenderer:",l,"not supported, using",h,"instead."),l=h);let u=e.logarithmicDepthBuffer===!0,f=e.reversedDepthBuffer===!0&&t.has("EXT_clip_control"),d=s.getParameter(s.MAX_TEXTURE_IMAGE_UNITS),g=s.getParameter(s.MAX_VERTEX_TEXTURE_IMAGE_UNITS),x=s.getParameter(s.MAX_TEXTURE_SIZE),m=s.getParameter(s.MAX_CUBE_MAP_TEXTURE_SIZE),p=s.getParameter(s.MAX_VERTEX_ATTRIBS),y=s.getParameter(s.MAX_VERTEX_UNIFORM_VECTORS),v=s.getParameter(s.MAX_VARYING_VECTORS),_=s.getParameter(s.MAX_FRAGMENT_UNIFORM_VECTORS),w=g>0,T=s.getParameter(s.MAX_SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:c,textureFormatReadable:o,textureTypeReadable:a,precision:l,logarithmicDepthBuffer:u,reversedDepthBuffer:f,maxTextures:d,maxVertexTextures:g,maxTextureSize:x,maxCubemapSize:m,maxAttributes:p,maxVertexUniforms:y,maxVaryings:v,maxFragmentUniforms:_,vertexTextures:w,maxSamples:T}}function GM(s){let t=this,e=null,n=0,i=!1,r=!1,o=new ln,a=new jt,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(u,f){let d=u.length!==0||f||n!==0||i;return i=f,n=u.length,d},this.beginShadows=function(){r=!0,h(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(u,f){e=h(u,f,0)},this.setState=function(u,f,d){let g=u.clippingPlanes,x=u.clipIntersection,m=u.clipShadows,p=s.get(u);if(!i||g===null||g.length===0||r&&!m)r?h(null):l();else{let y=r?0:n,v=y*4,_=p.clippingState||null;c.value=_,_=h(g,f,v,d);for(let w=0;w!==v;++w)_[w]=e[w];p.clippingState=_,this.numIntersection=x?this.numPlanes:0,this.numPlanes+=y}};function l(){c.value!==e&&(c.value=e,c.needsUpdate=n>0),t.numPlanes=n,t.numIntersection=0}function h(u,f,d,g){let x=u!==null?u.length:0,m=null;if(x!==0){if(m=c.value,g!==!0||m===null){let p=d+x*4,y=f.matrixWorldInverse;a.getNormalMatrix(y),(m===null||m.length<p)&&(m=new Float32Array(p));for(let v=0,_=d;v!==x;++v,_+=4)o.copy(u[v]).applyMatrix4(y,a),o.normal.toArray(m,_),m[_+3]=o.constant}c.value=m,c.needsUpdate=!0}return t.numPlanes=x,t.numIntersection=0,m}}function WM(s){let t=new WeakMap;function e(o,a){return a===io?o.mapping=Zs:a===vl&&(o.mapping=js),o}function n(o){if(o&&o.isTexture){let a=o.mapping;if(a===io||a===vl)if(t.has(o)){let c=t.get(o).texture;return e(c,o.mapping)}else{let c=o.image;if(c&&c.height>0){let l=new Zc(c.height);return l.fromEquirectangularTexture(s,o),t.set(o,l),o.addEventListener("dispose",i),e(l.texture,o.mapping)}else return null}}return o}function i(o){let a=o.target;a.removeEventListener("dispose",i);let c=t.get(a);c!==void 0&&(t.delete(a),c.dispose())}function r(){t=new WeakMap}return{get:n,dispose:r}}var ho=4,Yg=[.125,.215,.35,.446,.526,.582],sr=20,zf=new Ks,Jg=new Et,kf=null,Hf=0,Vf=0,Gf=!1,ir=(1+Math.sqrt(5))/2,lo=1/ir,Kg=[new B(-ir,lo,0),new B(ir,lo,0),new B(-lo,0,ir),new B(lo,0,ir),new B(0,ir,-lo),new B(0,ir,lo),new B(-1,1,-1),new B(1,1,-1),new B(-1,1,1),new B(1,1,1)],XM=new B,oh=class{constructor(t){this._renderer=t,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._lodPlanes=[],this._sizeLods=[],this._sigmas=[],this._blurMaterial=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._compileMaterial(this._blurMaterial)}fromScene(t,e=0,n=.1,i=100,r={}){let{size:o=256,position:a=XM}=r;kf=this._renderer.getRenderTarget(),Hf=this._renderer.getActiveCubeFace(),Vf=this._renderer.getActiveMipmapLevel(),Gf=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(o);let c=this._allocateTargets();return c.depthBuffer=!0,this._sceneToCubeUV(t,n,i,c,a),e>0&&this._blur(c,0,0,e),this._applyPMREM(c),this._cleanup(c),c}fromEquirectangular(t,e=null){return this._fromTexture(t,e)}fromCubemap(t,e=null){return this._fromTexture(t,e)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Qg(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=jg(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose()}_setSize(t){this._lodMax=Math.floor(Math.log2(t)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let t=0;t<this._lodPlanes.length;t++)this._lodPlanes[t].dispose()}_cleanup(t){this._renderer.setRenderTarget(kf,Hf,Vf),this._renderer.xr.enabled=Gf,t.scissorTest=!1,sh(t,0,0,t.width,t.height)}_fromTexture(t,e){t.mapping===Zs||t.mapping===js?this._setSize(t.image.length===0?16:t.image[0].width||t.image[0].image.width):this._setSize(t.image.width/4),kf=this._renderer.getRenderTarget(),Hf=this._renderer.getActiveCubeFace(),Vf=this._renderer.getActiveMipmapLevel(),Gf=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=e||this._allocateTargets();return this._textureToCubeUV(t,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let t=3*Math.max(this._cubeSize,112),e=4*this._cubeSize,n={magFilter:Ye,minFilter:Ye,generateMipmaps:!1,type:Yi,format:Mn,colorSpace:We,depthBuffer:!1},i=Zg(t,e,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==t||this._pingPongRenderTarget.height!==e){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Zg(t,e,n);let{_lodMax:r}=this;({sizeLods:this._sizeLods,lodPlanes:this._lodPlanes,sigmas:this._sigmas}=qM(r)),this._blurMaterial=$M(r,t,e)}return i}_compileMaterial(t){let e=new pe(this._lodPlanes[0],t);this._renderer.compile(e,zf)}_sceneToCubeUV(t,e,n,i,r){let c=new He(90,1,e,n),l=[1,-1,1,1,1,1],h=[1,1,1,-1,-1,-1],u=this._renderer,f=u.autoClear,d=u.toneMapping;u.getClearColor(Jg),u.toneMapping=$i,u.autoClear=!1,u.state.buffers.depth.getReversed()&&(u.setRenderTarget(i),u.clearDepth(),u.setRenderTarget(null));let x=new ui({name:"PMREM.Background",side:nn,depthWrite:!1,depthTest:!1}),m=new pe(new Yr,x),p=!1,y=t.background;y?y.isColor&&(x.color.copy(y),t.background=null,p=!0):(x.color.copy(Jg),p=!0);for(let v=0;v<6;v++){let _=v%3;_===0?(c.up.set(0,l[v],0),c.position.set(r.x,r.y,r.z),c.lookAt(r.x+h[v],r.y,r.z)):_===1?(c.up.set(0,0,l[v]),c.position.set(r.x,r.y,r.z),c.lookAt(r.x,r.y+h[v],r.z)):(c.up.set(0,l[v],0),c.position.set(r.x,r.y,r.z),c.lookAt(r.x,r.y,r.z+h[v]));let w=this._cubeSize;sh(i,_*w,v>2?w:0,w,w),u.setRenderTarget(i),p&&u.render(m,c),u.render(t,c)}m.geometry.dispose(),m.material.dispose(),u.toneMapping=d,u.autoClear=f,t.background=y}_textureToCubeUV(t,e){let n=this._renderer,i=t.mapping===Zs||t.mapping===js;i?(this._cubemapMaterial===null&&(this._cubemapMaterial=Qg()),this._cubemapMaterial.uniforms.flipEnvMap.value=t.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=jg());let r=i?this._cubemapMaterial:this._equirectMaterial,o=new pe(this._lodPlanes[0],r),a=r.uniforms;a.envMap.value=t;let c=this._cubeSize;sh(e,0,0,3*c,2*c),n.setRenderTarget(e),n.render(o,zf)}_applyPMREM(t){let e=this._renderer,n=e.autoClear;e.autoClear=!1;let i=this._lodPlanes.length;for(let r=1;r<i;r++){let o=Math.sqrt(this._sigmas[r]*this._sigmas[r]-this._sigmas[r-1]*this._sigmas[r-1]),a=Kg[(i-r-1)%Kg.length];this._blur(t,r-1,r,o,a)}e.autoClear=n}_blur(t,e,n,i,r){let o=this._pingPongRenderTarget;this._halfBlur(t,o,e,n,i,"latitudinal",r),this._halfBlur(o,t,n,n,i,"longitudinal",r)}_halfBlur(t,e,n,i,r,o,a){let c=this._renderer,l=this._blurMaterial;o!=="latitudinal"&&o!=="longitudinal"&&console.error("blur direction must be either latitudinal or longitudinal!");let h=3,u=new pe(this._lodPlanes[i],l),f=l.uniforms,d=this._sizeLods[n]-1,g=isFinite(r)?Math.PI/(2*d):2*Math.PI/(2*sr-1),x=r/g,m=isFinite(r)?1+Math.floor(h*x):sr;m>sr&&console.warn(`sigmaRadians, ${r}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${sr}`);let p=[],y=0;for(let R=0;R<sr;++R){let L=R/x,S=Math.exp(-L*L/2);p.push(S),R===0?y+=S:R<m&&(y+=2*S)}for(let R=0;R<p.length;R++)p[R]=p[R]/y;f.envMap.value=t.texture,f.samples.value=m,f.weights.value=p,f.latitudinal.value=o==="latitudinal",a&&(f.poleAxis.value=a);let{_lodMax:v}=this;f.dTheta.value=g,f.mipInt.value=v-n;let _=this._sizeLods[i],w=3*_*(i>v-ho?i-v+ho:0),T=4*(this._cubeSize-_);sh(e,w,T,3*_,2*_),c.setRenderTarget(e),c.render(u,zf)}};function qM(s){let t=[],e=[],n=[],i=s,r=s-ho+1+Yg.length;for(let o=0;o<r;o++){let a=Math.pow(2,i);e.push(a);let c=1/a;o>s-ho?c=Yg[o-s+ho-1]:o===0&&(c=0),n.push(c);let l=1/(a-2),h=-l,u=1+l,f=[h,h,u,h,u,u,h,h,u,u,h,u],d=6,g=6,x=3,m=2,p=1,y=new Float32Array(x*g*d),v=new Float32Array(m*g*d),_=new Float32Array(p*g*d);for(let T=0;T<d;T++){let R=T%3*2/3-1,L=T>2?0:-1,S=[R,L,0,R+2/3,L,0,R+2/3,L+1,0,R,L,0,R+2/3,L+1,0,R,L+1,0];y.set(S,x*g*T),v.set(f,m*g*T);let M=[T,T,T,T,T,T];_.set(M,p*g*T)}let w=new oe;w.setAttribute("position",new re(y,x)),w.setAttribute("uv",new re(v,m)),w.setAttribute("faceIndex",new re(_,p)),t.push(w),i>ho&&i--}return{lodPlanes:t,sizeLods:e,sigmas:n}}function Zg(s,t,e){let n=new qn(s,t,e);return n.texture.mapping=Ra,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function sh(s,t,e,n,i){s.viewport.set(t,e,n,i),s.scissor.set(t,e,n,i)}function $M(s,t,e){let n=new Float32Array(sr),i=new B(0,1,0);return new Sn({name:"SphericalGaussianBlur",defines:{n:sr,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${s}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:i}},vertexShader:Qf(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:qi,depthTest:!1,depthWrite:!1})}function jg(){return new Sn({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Qf(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:qi,depthTest:!1,depthWrite:!1})}function Qg(){return new Sn({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Qf(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:qi,depthTest:!1,depthWrite:!1})}function Qf(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}function YM(s){let t=new WeakMap,e=null;function n(a){if(a&&a.isTexture){let c=a.mapping,l=c===io||c===vl,h=c===Zs||c===js;if(l||h){let u=t.get(a),f=u!==void 0?u.texture.pmremVersion:0;if(a.isRenderTargetTexture&&a.pmremVersion!==f)return e===null&&(e=new oh(s)),u=l?e.fromEquirectangular(a,u):e.fromCubemap(a,u),u.texture.pmremVersion=a.pmremVersion,t.set(a,u),u.texture;if(u!==void 0)return u.texture;{let d=a.image;return l&&d&&d.height>0||h&&d&&i(d)?(e===null&&(e=new oh(s)),u=l?e.fromEquirectangular(a):e.fromCubemap(a),u.texture.pmremVersion=a.pmremVersion,t.set(a,u),a.addEventListener("dispose",r),u.texture):null}}}return a}function i(a){let c=0,l=6;for(let h=0;h<l;h++)a[h]!==void 0&&c++;return c===l}function r(a){let c=a.target;c.removeEventListener("dispose",r);let l=t.get(c);l!==void 0&&(t.delete(c),l.dispose())}function o(){t=new WeakMap,e!==null&&(e.dispose(),e=null)}return{get:n,dispose:o}}function JM(s){let t={};function e(n){if(t[n]!==void 0)return t[n];let i;switch(n){case"WEBGL_depth_texture":i=s.getExtension("WEBGL_depth_texture")||s.getExtension("MOZ_WEBGL_depth_texture")||s.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":i=s.getExtension("EXT_texture_filter_anisotropic")||s.getExtension("MOZ_EXT_texture_filter_anisotropic")||s.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":i=s.getExtension("WEBGL_compressed_texture_s3tc")||s.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||s.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":i=s.getExtension("WEBGL_compressed_texture_pvrtc")||s.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:i=s.getExtension(n)}return t[n]=i,i}return{has:function(n){return e(n)!==null},init:function(){e("EXT_color_buffer_float"),e("WEBGL_clip_cull_distance"),e("OES_texture_float_linear"),e("EXT_color_buffer_half_float"),e("WEBGL_multisampled_render_to_texture"),e("WEBGL_render_shared_exponent")},get:function(n){let i=e(n);return i===null&&Xr("THREE.WebGLRenderer: "+n+" extension not supported."),i}}}function KM(s,t,e,n){let i={},r=new WeakMap;function o(u){let f=u.target;f.index!==null&&t.remove(f.index);for(let g in f.attributes)t.remove(f.attributes[g]);f.removeEventListener("dispose",o),delete i[f.id];let d=r.get(f);d&&(t.remove(d),r.delete(f)),n.releaseStatesOfGeometry(f),f.isInstancedBufferGeometry===!0&&delete f._maxInstanceCount,e.memory.geometries--}function a(u,f){return i[f.id]===!0||(f.addEventListener("dispose",o),i[f.id]=!0,e.memory.geometries++),f}function c(u){let f=u.attributes;for(let d in f)t.update(f[d],s.ARRAY_BUFFER)}function l(u){let f=[],d=u.index,g=u.attributes.position,x=0;if(d!==null){let y=d.array;x=d.version;for(let v=0,_=y.length;v<_;v+=3){let w=y[v+0],T=y[v+1],R=y[v+2];f.push(w,T,T,R,R,w)}}else if(g!==void 0){let y=g.array;x=g.version;for(let v=0,_=y.length/3-1;v<_;v+=3){let w=v+0,T=v+1,R=v+2;f.push(w,T,T,R,R,w)}}else return;let m=new(Nf(f)?la:ca)(f,1);m.version=x;let p=r.get(u);p&&t.remove(p),r.set(u,m)}function h(u){let f=r.get(u);if(f){let d=u.index;d!==null&&f.version<d.version&&l(u)}else l(u);return r.get(u)}return{get:a,update:c,getWireframeAttribute:h}}function ZM(s,t,e){let n;function i(f){n=f}let r,o;function a(f){r=f.type,o=f.bytesPerElement}function c(f,d){s.drawElements(n,d,r,f*o),e.update(d,n,1)}function l(f,d,g){g!==0&&(s.drawElementsInstanced(n,d,r,f*o,g),e.update(d,n,g))}function h(f,d,g){if(g===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,d,0,r,f,0,g);let m=0;for(let p=0;p<g;p++)m+=d[p];e.update(m,n,1)}function u(f,d,g,x){if(g===0)return;let m=t.get("WEBGL_multi_draw");if(m===null)for(let p=0;p<f.length;p++)l(f[p]/o,d[p],x[p]);else{m.multiDrawElementsInstancedWEBGL(n,d,0,r,f,0,x,0,g);let p=0;for(let y=0;y<g;y++)p+=d[y]*x[y];e.update(p,n,1)}}this.setMode=i,this.setIndex=a,this.render=c,this.renderInstances=l,this.renderMultiDraw=h,this.renderMultiDrawInstances=u}function jM(s){let t={geometries:0,textures:0},e={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,o,a){switch(e.calls++,o){case s.TRIANGLES:e.triangles+=a*(r/3);break;case s.LINES:e.lines+=a*(r/2);break;case s.LINE_STRIP:e.lines+=a*(r-1);break;case s.LINE_LOOP:e.lines+=a*r;break;case s.POINTS:e.points+=a*r;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",o);break}}function i(){e.calls=0,e.triangles=0,e.points=0,e.lines=0}return{memory:t,render:e,programs:null,autoReset:!0,reset:i,update:n}}function QM(s,t,e){let n=new WeakMap,i=new de;function r(o,a,c){let l=o.morphTargetInfluences,h=a.morphAttributes.position||a.morphAttributes.normal||a.morphAttributes.color,u=h!==void 0?h.length:0,f=n.get(a);if(f===void 0||f.count!==u){let S=function(){R.dispose(),n.delete(a),a.removeEventListener("dispose",S)};f!==void 0&&f.texture.dispose();let d=a.morphAttributes.position!==void 0,g=a.morphAttributes.normal!==void 0,x=a.morphAttributes.color!==void 0,m=a.morphAttributes.position||[],p=a.morphAttributes.normal||[],y=a.morphAttributes.color||[],v=0;d===!0&&(v=1),g===!0&&(v=2),x===!0&&(v=3);let _=a.attributes.position.count*v,w=1;_>t.maxTextureSize&&(w=Math.ceil(_/t.maxTextureSize),_=t.maxTextureSize);let T=new Float32Array(_*w*4*u),R=new oa(T,_,w,u);R.type=$n,R.needsUpdate=!0;let L=v*4;for(let M=0;M<u;M++){let b=m[M],A=p[M],N=y[M],C=_*w*4*M;for(let I=0;I<b.count;I++){let O=I*L;d===!0&&(i.fromBufferAttribute(b,I),T[C+O+0]=i.x,T[C+O+1]=i.y,T[C+O+2]=i.z,T[C+O+3]=0),g===!0&&(i.fromBufferAttribute(A,I),T[C+O+4]=i.x,T[C+O+5]=i.y,T[C+O+6]=i.z,T[C+O+7]=0),x===!0&&(i.fromBufferAttribute(N,I),T[C+O+8]=i.x,T[C+O+9]=i.y,T[C+O+10]=i.z,T[C+O+11]=N.itemSize===4?i.w:1)}}f={count:u,texture:R,size:new Ht(_,w)},n.set(a,f),a.addEventListener("dispose",S)}if(o.isInstancedMesh===!0&&o.morphTexture!==null)c.getUniforms().setValue(s,"morphTexture",o.morphTexture,e);else{let d=0;for(let x=0;x<l.length;x++)d+=l[x];let g=a.morphTargetsRelative?1:1-d;c.getUniforms().setValue(s,"morphTargetBaseInfluence",g),c.getUniforms().setValue(s,"morphTargetInfluences",l)}c.getUniforms().setValue(s,"morphTargetsTexture",f.texture,e),c.getUniforms().setValue(s,"morphTargetsTextureSize",f.size)}return{update:r}}function t1(s,t,e,n){let i=new WeakMap;function r(c){let l=n.render.frame,h=c.geometry,u=t.get(c,h);if(i.get(u)!==l&&(t.update(u),i.set(u,l)),c.isInstancedMesh&&(c.hasEventListener("dispose",a)===!1&&c.addEventListener("dispose",a),i.get(c)!==l&&(e.update(c.instanceMatrix,s.ARRAY_BUFFER),c.instanceColor!==null&&e.update(c.instanceColor,s.ARRAY_BUFFER),i.set(c,l))),c.isSkinnedMesh){let f=c.skeleton;i.get(f)!==l&&(f.update(),i.set(f,l))}return u}function o(){i=new WeakMap}function a(c){let l=c.target;l.removeEventListener("dispose",a),e.remove(l.instanceMatrix),l.instanceColor!==null&&e.remove(l.instanceColor)}return{update:r,dispose:o}}var y0=new Je,t0=new ma(1,1),_0=new oa,v0=new Jc,S0=new ha,e0=[],n0=[],i0=new Float32Array(16),s0=new Float32Array(9),r0=new Float32Array(4);function po(s,t,e){let n=s[0];if(n<=0||n>0)return s;let i=t*e,r=e0[i];if(r===void 0&&(r=new Float32Array(i),e0[i]=r),t!==0){n.toArray(r,0);for(let o=1,a=0;o!==t;++o)a+=e,s[o].toArray(r,a)}return r}function Xe(s,t){if(s.length!==t.length)return!1;for(let e=0,n=s.length;e<n;e++)if(s[e]!==t[e])return!1;return!0}function qe(s,t){for(let e=0,n=t.length;e<n;e++)s[e]=t[e]}function ch(s,t){let e=n0[t];e===void 0&&(e=new Int32Array(t),n0[t]=e);for(let n=0;n!==t;++n)e[n]=s.allocateTextureUnit();return e}function e1(s,t){let e=this.cache;e[0]!==t&&(s.uniform1f(this.addr,t),e[0]=t)}function n1(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(s.uniform2f(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Xe(e,t))return;s.uniform2fv(this.addr,t),qe(e,t)}}function i1(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(s.uniform3f(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else if(t.r!==void 0)(e[0]!==t.r||e[1]!==t.g||e[2]!==t.b)&&(s.uniform3f(this.addr,t.r,t.g,t.b),e[0]=t.r,e[1]=t.g,e[2]=t.b);else{if(Xe(e,t))return;s.uniform3fv(this.addr,t),qe(e,t)}}function s1(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(s.uniform4f(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Xe(e,t))return;s.uniform4fv(this.addr,t),qe(e,t)}}function r1(s,t){let e=this.cache,n=t.elements;if(n===void 0){if(Xe(e,t))return;s.uniformMatrix2fv(this.addr,!1,t),qe(e,t)}else{if(Xe(e,n))return;r0.set(n),s.uniformMatrix2fv(this.addr,!1,r0),qe(e,n)}}function o1(s,t){let e=this.cache,n=t.elements;if(n===void 0){if(Xe(e,t))return;s.uniformMatrix3fv(this.addr,!1,t),qe(e,t)}else{if(Xe(e,n))return;s0.set(n),s.uniformMatrix3fv(this.addr,!1,s0),qe(e,n)}}function a1(s,t){let e=this.cache,n=t.elements;if(n===void 0){if(Xe(e,t))return;s.uniformMatrix4fv(this.addr,!1,t),qe(e,t)}else{if(Xe(e,n))return;i0.set(n),s.uniformMatrix4fv(this.addr,!1,i0),qe(e,n)}}function c1(s,t){let e=this.cache;e[0]!==t&&(s.uniform1i(this.addr,t),e[0]=t)}function l1(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(s.uniform2i(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Xe(e,t))return;s.uniform2iv(this.addr,t),qe(e,t)}}function h1(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(s.uniform3i(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(Xe(e,t))return;s.uniform3iv(this.addr,t),qe(e,t)}}function u1(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(s.uniform4i(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Xe(e,t))return;s.uniform4iv(this.addr,t),qe(e,t)}}function f1(s,t){let e=this.cache;e[0]!==t&&(s.uniform1ui(this.addr,t),e[0]=t)}function d1(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(s.uniform2ui(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Xe(e,t))return;s.uniform2uiv(this.addr,t),qe(e,t)}}function p1(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(s.uniform3ui(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(Xe(e,t))return;s.uniform3uiv(this.addr,t),qe(e,t)}}function m1(s,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(s.uniform4ui(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Xe(e,t))return;s.uniform4uiv(this.addr,t),qe(e,t)}}function g1(s,t,e){let n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i);let r;this.type===s.SAMPLER_2D_SHADOW?(t0.compareFunction=Cf,r=t0):r=y0,e.setTexture2D(t||r,i)}function x1(s,t,e){let n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),e.setTexture3D(t||v0,i)}function y1(s,t,e){let n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),e.setTextureCube(t||S0,i)}function _1(s,t,e){let n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),e.setTexture2DArray(t||_0,i)}function v1(s){switch(s){case 5126:return e1;case 35664:return n1;case 35665:return i1;case 35666:return s1;case 35674:return r1;case 35675:return o1;case 35676:return a1;case 5124:case 35670:return c1;case 35667:case 35671:return l1;case 35668:case 35672:return h1;case 35669:case 35673:return u1;case 5125:return f1;case 36294:return d1;case 36295:return p1;case 36296:return m1;case 35678:case 36198:case 36298:case 36306:case 35682:return g1;case 35679:case 36299:case 36307:return x1;case 35680:case 36300:case 36308:case 36293:return y1;case 36289:case 36303:case 36311:case 36292:return _1}}function S1(s,t){s.uniform1fv(this.addr,t)}function M1(s,t){let e=po(t,this.size,2);s.uniform2fv(this.addr,e)}function b1(s,t){let e=po(t,this.size,3);s.uniform3fv(this.addr,e)}function w1(s,t){let e=po(t,this.size,4);s.uniform4fv(this.addr,e)}function E1(s,t){let e=po(t,this.size,4);s.uniformMatrix2fv(this.addr,!1,e)}function T1(s,t){let e=po(t,this.size,9);s.uniformMatrix3fv(this.addr,!1,e)}function A1(s,t){let e=po(t,this.size,16);s.uniformMatrix4fv(this.addr,!1,e)}function R1(s,t){s.uniform1iv(this.addr,t)}function C1(s,t){s.uniform2iv(this.addr,t)}function I1(s,t){s.uniform3iv(this.addr,t)}function P1(s,t){s.uniform4iv(this.addr,t)}function L1(s,t){s.uniform1uiv(this.addr,t)}function N1(s,t){s.uniform2uiv(this.addr,t)}function D1(s,t){s.uniform3uiv(this.addr,t)}function O1(s,t){s.uniform4uiv(this.addr,t)}function U1(s,t,e){let n=this.cache,i=t.length,r=ch(e,i);Xe(n,r)||(s.uniform1iv(this.addr,r),qe(n,r));for(let o=0;o!==i;++o)e.setTexture2D(t[o]||y0,r[o])}function F1(s,t,e){let n=this.cache,i=t.length,r=ch(e,i);Xe(n,r)||(s.uniform1iv(this.addr,r),qe(n,r));for(let o=0;o!==i;++o)e.setTexture3D(t[o]||v0,r[o])}function B1(s,t,e){let n=this.cache,i=t.length,r=ch(e,i);Xe(n,r)||(s.uniform1iv(this.addr,r),qe(n,r));for(let o=0;o!==i;++o)e.setTextureCube(t[o]||S0,r[o])}function z1(s,t,e){let n=this.cache,i=t.length,r=ch(e,i);Xe(n,r)||(s.uniform1iv(this.addr,r),qe(n,r));for(let o=0;o!==i;++o)e.setTexture2DArray(t[o]||_0,r[o])}function k1(s){switch(s){case 5126:return S1;case 35664:return M1;case 35665:return b1;case 35666:return w1;case 35674:return E1;case 35675:return T1;case 35676:return A1;case 5124:case 35670:return R1;case 35667:case 35671:return C1;case 35668:case 35672:return I1;case 35669:case 35673:return P1;case 5125:return L1;case 36294:return N1;case 36295:return D1;case 36296:return O1;case 35678:case 36198:case 36298:case 36306:case 35682:return U1;case 35679:case 36299:case 36307:return F1;case 35680:case 36300:case 36308:case 36293:return B1;case 36289:case 36303:case 36311:case 36292:return z1}}var Xf=class{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.setValue=v1(e.type)}},qf=class{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.size=e.size,this.setValue=k1(e.type)}},$f=class{constructor(t){this.id=t,this.seq=[],this.map={}}setValue(t,e,n){let i=this.seq;for(let r=0,o=i.length;r!==o;++r){let a=i[r];a.setValue(t,e[a.id],n)}}},Wf=/(\w+)(\])?(\[|\.)?/g;function o0(s,t){s.seq.push(t),s.map[t.id]=t}function H1(s,t,e){let n=s.name,i=n.length;for(Wf.lastIndex=0;;){let r=Wf.exec(n),o=Wf.lastIndex,a=r[1],c=r[2]==="]",l=r[3];if(c&&(a=a|0),l===void 0||l==="["&&o+2===i){o0(e,l===void 0?new Xf(a,s,t):new qf(a,s,t));break}else{let u=e.map[a];u===void 0&&(u=new $f(a),o0(e,u)),e=u}}}var uo=class{constructor(t,e){this.seq=[],this.map={};let n=t.getProgramParameter(e,t.ACTIVE_UNIFORMS);for(let i=0;i<n;++i){let r=t.getActiveUniform(e,i),o=t.getUniformLocation(e,r.name);H1(r,o,this)}}setValue(t,e,n,i){let r=this.map[e];r!==void 0&&r.setValue(t,n,i)}setOptional(t,e,n){let i=e[n];i!==void 0&&this.setValue(t,n,i)}static upload(t,e,n,i){for(let r=0,o=e.length;r!==o;++r){let a=e[r],c=n[a.id];c.needsUpdate!==!1&&a.setValue(t,c.value,i)}}static seqWithValue(t,e){let n=[];for(let i=0,r=t.length;i!==r;++i){let o=t[i];o.id in e&&n.push(o)}return n}};function a0(s,t,e){let n=s.createShader(t);return s.shaderSource(n,e),s.compileShader(n),n}var V1=37297,G1=0;function W1(s,t){let e=s.split(`
`),n=[],i=Math.max(t-6,0),r=Math.min(t+6,e.length);for(let o=i;o<r;o++){let a=o+1;n.push(`${a===t?">":" "} ${a}: ${e[o]}`)}return n.join(`
`)}var c0=new jt;function X1(s){ie._getMatrix(c0,ie.workingColorSpace,s);let t=`mat3( ${c0.elements.map(e=>e.toFixed(4))} )`;switch(ie.getTransfer(s)){case sa:return[t,"LinearTransferOETF"];case Se:return[t,"sRGBTransferOETF"];default:return console.warn("THREE.WebGLProgram: Unsupported color space: ",s),[t,"LinearTransferOETF"]}}function l0(s,t,e){let n=s.getShaderParameter(t,s.COMPILE_STATUS),r=(s.getShaderInfoLog(t)||"").trim();if(n&&r==="")return"";let o=/ERROR: 0:(\d+)/.exec(r);if(o){let a=parseInt(o[1]);return e.toUpperCase()+`

`+r+`

`+W1(s.getShaderSource(t),a)}else return r}function q1(s,t){let e=X1(t);return[`vec4 ${s}( vec4 value ) {`,`	return ${e[1]}( vec4( value.rgb * ${e[0]}, value.a ) );`,"}"].join(`
`)}function $1(s,t){let e;switch(t){case wg:e="Linear";break;case Eg:e="Reinhard";break;case Tg:e="Cineon";break;case Ag:e="ACESFilmic";break;case Cg:e="AgX";break;case _l:e="Neutral";break;case Rg:e="Custom";break;default:console.warn("THREE.WebGLProgram: Unsupported toneMapping:",t),e="Linear"}return"vec3 "+s+"( vec3 color ) { return "+e+"ToneMapping( color ); }"}var rh=new B;function Y1(){ie.getLuminanceCoefficients(rh);let s=rh.x.toFixed(4),t=rh.y.toFixed(4),e=rh.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${s}, ${t}, ${e} );`,"	return dot( weights, rgb );","}"].join(`
`)}function J1(s){return[s.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",s.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Oa).join(`
`)}function K1(s){let t=[];for(let e in s){let n=s[e];n!==!1&&t.push("#define "+e+" "+n)}return t.join(`
`)}function Z1(s,t){let e={},n=s.getProgramParameter(t,s.ACTIVE_ATTRIBUTES);for(let i=0;i<n;i++){let r=s.getActiveAttrib(t,i),o=r.name,a=1;r.type===s.FLOAT_MAT2&&(a=2),r.type===s.FLOAT_MAT3&&(a=3),r.type===s.FLOAT_MAT4&&(a=4),e[o]={type:r.type,location:s.getAttribLocation(t,o),locationSize:a}}return e}function Oa(s){return s!==""}function h0(s,t){let e=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return s.replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,e).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function u0(s,t){return s.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var j1=/^[ \t]*#include +<([\w\d./]+)>/gm;function Yf(s){return s.replace(j1,tb)}var Q1=new Map;function tb(s,t){let e=te[t];if(e===void 0){let n=Q1.get(t);if(n!==void 0)e=te[n],console.warn('THREE.WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',t,n);else throw new Error("Can not resolve #include <"+t+">")}return Yf(e)}var eb=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function f0(s){return s.replace(eb,nb)}function nb(s,t,e,n){let i="";for(let r=parseInt(t);r<parseInt(e);r++)i+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return i}function d0(s){let t=`precision ${s.precision} float;
	precision ${s.precision} int;
	precision ${s.precision} sampler2D;
	precision ${s.precision} samplerCube;
	precision ${s.precision} sampler3D;
	precision ${s.precision} sampler2DArray;
	precision ${s.precision} sampler2DShadow;
	precision ${s.precision} samplerCubeShadow;
	precision ${s.precision} sampler2DArrayShadow;
	precision ${s.precision} isampler2D;
	precision ${s.precision} isampler3D;
	precision ${s.precision} isamplerCube;
	precision ${s.precision} isampler2DArray;
	precision ${s.precision} usampler2D;
	precision ${s.precision} usampler3D;
	precision ${s.precision} usamplerCube;
	precision ${s.precision} usampler2DArray;
	`;return s.precision==="highp"?t+=`
#define HIGH_PRECISION`:s.precision==="mediump"?t+=`
#define MEDIUM_PRECISION`:s.precision==="lowp"&&(t+=`
#define LOW_PRECISION`),t}function ib(s){let t="SHADOWMAP_TYPE_BASIC";return s.shadowMapType===pf?t="SHADOWMAP_TYPE_PCF":s.shadowMapType===og?t="SHADOWMAP_TYPE_PCF_SOFT":s.shadowMapType===Ri&&(t="SHADOWMAP_TYPE_VSM"),t}function sb(s){let t="ENVMAP_TYPE_CUBE";if(s.envMap)switch(s.envMapMode){case Zs:case js:t="ENVMAP_TYPE_CUBE";break;case Ra:t="ENVMAP_TYPE_CUBE_UV";break}return t}function rb(s){let t="ENVMAP_MODE_REFLECTION";return s.envMap&&s.envMapMode===js&&(t="ENVMAP_MODE_REFRACTION"),t}function ob(s){let t="ENVMAP_BLENDING_NONE";if(s.envMap)switch(s.combine){case yf:t="ENVMAP_BLENDING_MULTIPLY";break;case Mg:t="ENVMAP_BLENDING_MIX";break;case bg:t="ENVMAP_BLENDING_ADD";break}return t}function ab(s){let t=s.envMapCubeUVHeight;if(t===null)return null;let e=Math.log2(t)-2,n=1/t;return{texelWidth:1/(3*Math.max(Math.pow(2,e),112)),texelHeight:n,maxMip:e}}function cb(s,t,e,n){let i=s.getContext(),r=e.defines,o=e.vertexShader,a=e.fragmentShader,c=ib(e),l=sb(e),h=rb(e),u=ob(e),f=ab(e),d=J1(e),g=K1(r),x=i.createProgram(),m,p,y=e.glslVersion?"#version "+e.glslVersion+`
`:"";e.isRawShaderMaterial?(m=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g].filter(Oa).join(`
`),m.length>0&&(m+=`
`),p=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g].filter(Oa).join(`
`),p.length>0&&(p+=`
`)):(m=[d0(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g,e.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",e.batching?"#define USE_BATCHING":"",e.batchingColor?"#define USE_BATCHING_COLOR":"",e.instancing?"#define USE_INSTANCING":"",e.instancingColor?"#define USE_INSTANCING_COLOR":"",e.instancingMorph?"#define USE_INSTANCING_MORPH":"",e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.map?"#define USE_MAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+h:"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.displacementMap?"#define USE_DISPLACEMENTMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.mapUv?"#define MAP_UV "+e.mapUv:"",e.alphaMapUv?"#define ALPHAMAP_UV "+e.alphaMapUv:"",e.lightMapUv?"#define LIGHTMAP_UV "+e.lightMapUv:"",e.aoMapUv?"#define AOMAP_UV "+e.aoMapUv:"",e.emissiveMapUv?"#define EMISSIVEMAP_UV "+e.emissiveMapUv:"",e.bumpMapUv?"#define BUMPMAP_UV "+e.bumpMapUv:"",e.normalMapUv?"#define NORMALMAP_UV "+e.normalMapUv:"",e.displacementMapUv?"#define DISPLACEMENTMAP_UV "+e.displacementMapUv:"",e.metalnessMapUv?"#define METALNESSMAP_UV "+e.metalnessMapUv:"",e.roughnessMapUv?"#define ROUGHNESSMAP_UV "+e.roughnessMapUv:"",e.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+e.anisotropyMapUv:"",e.clearcoatMapUv?"#define CLEARCOATMAP_UV "+e.clearcoatMapUv:"",e.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+e.clearcoatNormalMapUv:"",e.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+e.clearcoatRoughnessMapUv:"",e.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+e.iridescenceMapUv:"",e.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+e.iridescenceThicknessMapUv:"",e.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+e.sheenColorMapUv:"",e.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+e.sheenRoughnessMapUv:"",e.specularMapUv?"#define SPECULARMAP_UV "+e.specularMapUv:"",e.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+e.specularColorMapUv:"",e.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+e.specularIntensityMapUv:"",e.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+e.transmissionMapUv:"",e.thicknessMapUv?"#define THICKNESSMAP_UV "+e.thicknessMapUv:"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.flatShading?"#define FLAT_SHADED":"",e.skinning?"#define USE_SKINNING":"",e.morphTargets?"#define USE_MORPHTARGETS":"",e.morphNormals&&e.flatShading===!1?"#define USE_MORPHNORMALS":"",e.morphColors?"#define USE_MORPHCOLORS":"",e.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+e.morphTextureStride:"",e.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+e.morphTargetsCount:"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+c:"",e.sizeAttenuation?"#define USE_SIZEATTENUATION":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Oa).join(`
`),p=[d0(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g,e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",e.map?"#define USE_MAP":"",e.matcap?"#define USE_MATCAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+l:"",e.envMap?"#define "+h:"",e.envMap?"#define "+u:"",f?"#define CUBEUV_TEXEL_WIDTH "+f.texelWidth:"",f?"#define CUBEUV_TEXEL_HEIGHT "+f.texelHeight:"",f?"#define CUBEUV_MAX_MIP "+f.maxMip+".0":"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoat?"#define USE_CLEARCOAT":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.dispersion?"#define USE_DISPERSION":"",e.iridescence?"#define USE_IRIDESCENCE":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaTest?"#define USE_ALPHATEST":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.sheen?"#define USE_SHEEN":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors||e.instancingColor||e.batchingColor?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.gradientMap?"#define USE_GRADIENTMAP":"",e.flatShading?"#define FLAT_SHADED":"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+c:"",e.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",e.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",e.toneMapping!==$i?"#define TONE_MAPPING":"",e.toneMapping!==$i?te.tonemapping_pars_fragment:"",e.toneMapping!==$i?$1("toneMapping",e.toneMapping):"",e.dithering?"#define DITHERING":"",e.opaque?"#define OPAQUE":"",te.colorspace_pars_fragment,q1("linearToOutputTexel",e.outputColorSpace),Y1(),e.useDepthPacking?"#define DEPTH_PACKING "+e.depthPacking:"",`
`].filter(Oa).join(`
`)),o=Yf(o),o=h0(o,e),o=u0(o,e),a=Yf(a),a=h0(a,e),a=u0(a,e),o=f0(o),a=f0(a),e.isRawShaderMaterial!==!0&&(y=`#version 300 es
`,m=[d,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+m,p=["#define varying in",e.glslVersion===If?"":"layout(location = 0) out highp vec4 pc_fragColor;",e.glslVersion===If?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+p);let v=y+m+o,_=y+p+a,w=a0(i,i.VERTEX_SHADER,v),T=a0(i,i.FRAGMENT_SHADER,_);i.attachShader(x,w),i.attachShader(x,T),e.index0AttributeName!==void 0?i.bindAttribLocation(x,0,e.index0AttributeName):e.morphTargets===!0&&i.bindAttribLocation(x,0,"position"),i.linkProgram(x);function R(b){if(s.debug.checkShaderErrors){let A=i.getProgramInfoLog(x)||"",N=i.getShaderInfoLog(w)||"",C=i.getShaderInfoLog(T)||"",I=A.trim(),O=N.trim(),k=C.trim(),z=!0,et=!0;if(i.getProgramParameter(x,i.LINK_STATUS)===!1)if(z=!1,typeof s.debug.onShaderError=="function")s.debug.onShaderError(i,x,w,T);else{let j=l0(i,w,"vertex"),W=l0(i,T,"fragment");console.error("THREE.WebGLProgram: Shader Error "+i.getError()+" - VALIDATE_STATUS "+i.getProgramParameter(x,i.VALIDATE_STATUS)+`

Material Name: `+b.name+`
Material Type: `+b.type+`

Program Info Log: `+I+`
`+j+`
`+W)}else I!==""?console.warn("THREE.WebGLProgram: Program Info Log:",I):(O===""||k==="")&&(et=!1);et&&(b.diagnostics={runnable:z,programLog:I,vertexShader:{log:O,prefix:m},fragmentShader:{log:k,prefix:p}})}i.deleteShader(w),i.deleteShader(T),L=new uo(i,x),S=Z1(i,x)}let L;this.getUniforms=function(){return L===void 0&&R(this),L};let S;this.getAttributes=function(){return S===void 0&&R(this),S};let M=e.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return M===!1&&(M=i.getProgramParameter(x,V1)),M},this.destroy=function(){n.releaseStatesOfProgram(this),i.deleteProgram(x),this.program=void 0},this.type=e.shaderType,this.name=e.shaderName,this.id=G1++,this.cacheKey=t,this.usedTimes=1,this.program=x,this.vertexShader=w,this.fragmentShader=T,this}var lb=0,Jf=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(t){let e=t.vertexShader,n=t.fragmentShader,i=this._getShaderStage(e),r=this._getShaderStage(n),o=this._getShaderCacheForMaterial(t);return o.has(i)===!1&&(o.add(i),i.usedTimes++),o.has(r)===!1&&(o.add(r),r.usedTimes++),this}remove(t){let e=this.materialCache.get(t);for(let n of e)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(t),this}getVertexShaderID(t){return this._getShaderStage(t.vertexShader).id}getFragmentShaderID(t){return this._getShaderStage(t.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(t){let e=this.materialCache,n=e.get(t);return n===void 0&&(n=new Set,e.set(t,n)),n}_getShaderStage(t){let e=this.shaderCache,n=e.get(t);return n===void 0&&(n=new Kf(t),e.set(t,n)),n}},Kf=class{constructor(t){this.id=lb++,this.code=t,this.usedTimes=0}};function hb(s,t,e,n,i,r,o){let a=new $r,c=new Jf,l=new Set,h=[],u=i.logarithmicDepthBuffer,f=i.vertexTextures,d=i.precision,g={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function x(S){return l.add(S),S===0?"uv":`uv${S}`}function m(S,M,b,A,N){let C=A.fog,I=N.geometry,O=S.isMeshStandardMaterial?A.environment:null,k=(S.isMeshStandardMaterial?e:t).get(S.envMap||O),z=k&&k.mapping===Ra?k.image.height:null,et=g[S.type];S.precision!==null&&(d=i.getMaxPrecision(S.precision),d!==S.precision&&console.warn("THREE.WebGLProgram.getParameters:",S.precision,"not supported, using",d,"instead."));let j=I.morphAttributes.position||I.morphAttributes.normal||I.morphAttributes.color,W=j!==void 0?j.length:0,tt=0;I.morphAttributes.position!==void 0&&(tt=1),I.morphAttributes.normal!==void 0&&(tt=2),I.morphAttributes.color!==void 0&&(tt=3);let at,st,ot,J;if(et){let se=Ci[et];at=se.vertexShader,st=se.fragmentShader}else at=S.vertexShader,st=S.fragmentShader,c.update(S),ot=c.getVertexShaderID(S),J=c.getFragmentShaderID(S);let it=s.getRenderTarget(),ft=s.state.buffers.depth.getReversed(),bt=N.isInstancedMesh===!0,St=N.isBatchedMesh===!0,zt=!!S.map,ue=!!S.matcap,V=!!k,Qt=!!S.aoMap,D=!!S.lightMap,E=!!S.bumpMap,H=!!S.normalMap,ut=!!S.displacementMap,Q=!!S.emissiveMap,yt=!!S.metalnessMap,Bt=!!S.roughnessMap,At=S.anisotropy>0,F=S.clearcoat>0,P=S.dispersion>0,$=S.iridescence>0,nt=S.sheen>0,ct=S.transmission>0,rt=At&&!!S.anisotropyMap,wt=F&&!!S.clearcoatMap,dt=F&&!!S.clearcoatNormalMap,Lt=F&&!!S.clearcoatRoughnessMap,Ft=$&&!!S.iridescenceMap,mt=$&&!!S.iridescenceThicknessMap,Rt=nt&&!!S.sheenColorMap,Dt=nt&&!!S.sheenRoughnessMap,Tt=!!S.specularMap,xt=!!S.specularColorMap,qt=!!S.specularIntensityMap,q=ct&&!!S.transmissionMap,_t=ct&&!!S.thicknessMap,Mt=!!S.gradientMap,It=!!S.alphaMap,gt=S.alphaTest>0,pt=!!S.alphaHash,Ut=!!S.extensions,$t=$i;S.toneMapped&&(it===null||it.isXRRenderTarget===!0)&&($t=s.toneMapping);let _e={shaderID:et,shaderType:S.type,shaderName:S.name,vertexShader:at,fragmentShader:st,defines:S.defines,customVertexShaderID:ot,customFragmentShaderID:J,isRawShaderMaterial:S.isRawShaderMaterial===!0,glslVersion:S.glslVersion,precision:d,batching:St,batchingColor:St&&N._colorsTexture!==null,instancing:bt,instancingColor:bt&&N.instanceColor!==null,instancingMorph:bt&&N.morphTexture!==null,supportsVertexTextures:f,outputColorSpace:it===null?s.outputColorSpace:it.isXRRenderTarget===!0?it.texture.colorSpace:We,alphaToCoverage:!!S.alphaToCoverage,map:zt,matcap:ue,envMap:V,envMapMode:V&&k.mapping,envMapCubeUVHeight:z,aoMap:Qt,lightMap:D,bumpMap:E,normalMap:H,displacementMap:f&&ut,emissiveMap:Q,normalMapObjectSpace:H&&S.normalMapType===Dg,normalMapTangentSpace:H&&S.normalMapType===Rf,metalnessMap:yt,roughnessMap:Bt,anisotropy:At,anisotropyMap:rt,clearcoat:F,clearcoatMap:wt,clearcoatNormalMap:dt,clearcoatRoughnessMap:Lt,dispersion:P,iridescence:$,iridescenceMap:Ft,iridescenceThicknessMap:mt,sheen:nt,sheenColorMap:Rt,sheenRoughnessMap:Dt,specularMap:Tt,specularColorMap:xt,specularIntensityMap:qt,transmission:ct,transmissionMap:q,thicknessMap:_t,gradientMap:Mt,opaque:S.transparent===!1&&S.blending===Bs&&S.alphaToCoverage===!1,alphaMap:It,alphaTest:gt,alphaHash:pt,combine:S.combine,mapUv:zt&&x(S.map.channel),aoMapUv:Qt&&x(S.aoMap.channel),lightMapUv:D&&x(S.lightMap.channel),bumpMapUv:E&&x(S.bumpMap.channel),normalMapUv:H&&x(S.normalMap.channel),displacementMapUv:ut&&x(S.displacementMap.channel),emissiveMapUv:Q&&x(S.emissiveMap.channel),metalnessMapUv:yt&&x(S.metalnessMap.channel),roughnessMapUv:Bt&&x(S.roughnessMap.channel),anisotropyMapUv:rt&&x(S.anisotropyMap.channel),clearcoatMapUv:wt&&x(S.clearcoatMap.channel),clearcoatNormalMapUv:dt&&x(S.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:Lt&&x(S.clearcoatRoughnessMap.channel),iridescenceMapUv:Ft&&x(S.iridescenceMap.channel),iridescenceThicknessMapUv:mt&&x(S.iridescenceThicknessMap.channel),sheenColorMapUv:Rt&&x(S.sheenColorMap.channel),sheenRoughnessMapUv:Dt&&x(S.sheenRoughnessMap.channel),specularMapUv:Tt&&x(S.specularMap.channel),specularColorMapUv:xt&&x(S.specularColorMap.channel),specularIntensityMapUv:qt&&x(S.specularIntensityMap.channel),transmissionMapUv:q&&x(S.transmissionMap.channel),thicknessMapUv:_t&&x(S.thicknessMap.channel),alphaMapUv:It&&x(S.alphaMap.channel),vertexTangents:!!I.attributes.tangent&&(H||At),vertexColors:S.vertexColors,vertexAlphas:S.vertexColors===!0&&!!I.attributes.color&&I.attributes.color.itemSize===4,pointsUvs:N.isPoints===!0&&!!I.attributes.uv&&(zt||It),fog:!!C,useFog:S.fog===!0,fogExp2:!!C&&C.isFogExp2,flatShading:S.flatShading===!0&&S.wireframe===!1,sizeAttenuation:S.sizeAttenuation===!0,logarithmicDepthBuffer:u,reversedDepthBuffer:ft,skinning:N.isSkinnedMesh===!0,morphTargets:I.morphAttributes.position!==void 0,morphNormals:I.morphAttributes.normal!==void 0,morphColors:I.morphAttributes.color!==void 0,morphTargetsCount:W,morphTextureStride:tt,numDirLights:M.directional.length,numPointLights:M.point.length,numSpotLights:M.spot.length,numSpotLightMaps:M.spotLightMap.length,numRectAreaLights:M.rectArea.length,numHemiLights:M.hemi.length,numDirLightShadows:M.directionalShadowMap.length,numPointLightShadows:M.pointShadowMap.length,numSpotLightShadows:M.spotShadowMap.length,numSpotLightShadowsWithMaps:M.numSpotLightShadowsWithMaps,numLightProbes:M.numLightProbes,numClippingPlanes:o.numPlanes,numClipIntersection:o.numIntersection,dithering:S.dithering,shadowMapEnabled:s.shadowMap.enabled&&b.length>0,shadowMapType:s.shadowMap.type,toneMapping:$t,decodeVideoTexture:zt&&S.map.isVideoTexture===!0&&ie.getTransfer(S.map.colorSpace)===Se,decodeVideoTextureEmissive:Q&&S.emissiveMap.isVideoTexture===!0&&ie.getTransfer(S.emissiveMap.colorSpace)===Se,premultipliedAlpha:S.premultipliedAlpha,doubleSided:S.side===Ce,flipSided:S.side===nn,useDepthPacking:S.depthPacking>=0,depthPacking:S.depthPacking||0,index0AttributeName:S.index0AttributeName,extensionClipCullDistance:Ut&&S.extensions.clipCullDistance===!0&&n.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(Ut&&S.extensions.multiDraw===!0||St)&&n.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:n.has("KHR_parallel_shader_compile"),customProgramCacheKey:S.customProgramCacheKey()};return _e.vertexUv1s=l.has(1),_e.vertexUv2s=l.has(2),_e.vertexUv3s=l.has(3),l.clear(),_e}function p(S){let M=[];if(S.shaderID?M.push(S.shaderID):(M.push(S.customVertexShaderID),M.push(S.customFragmentShaderID)),S.defines!==void 0)for(let b in S.defines)M.push(b),M.push(S.defines[b]);return S.isRawShaderMaterial===!1&&(y(M,S),v(M,S),M.push(s.outputColorSpace)),M.push(S.customProgramCacheKey),M.join()}function y(S,M){S.push(M.precision),S.push(M.outputColorSpace),S.push(M.envMapMode),S.push(M.envMapCubeUVHeight),S.push(M.mapUv),S.push(M.alphaMapUv),S.push(M.lightMapUv),S.push(M.aoMapUv),S.push(M.bumpMapUv),S.push(M.normalMapUv),S.push(M.displacementMapUv),S.push(M.emissiveMapUv),S.push(M.metalnessMapUv),S.push(M.roughnessMapUv),S.push(M.anisotropyMapUv),S.push(M.clearcoatMapUv),S.push(M.clearcoatNormalMapUv),S.push(M.clearcoatRoughnessMapUv),S.push(M.iridescenceMapUv),S.push(M.iridescenceThicknessMapUv),S.push(M.sheenColorMapUv),S.push(M.sheenRoughnessMapUv),S.push(M.specularMapUv),S.push(M.specularColorMapUv),S.push(M.specularIntensityMapUv),S.push(M.transmissionMapUv),S.push(M.thicknessMapUv),S.push(M.combine),S.push(M.fogExp2),S.push(M.sizeAttenuation),S.push(M.morphTargetsCount),S.push(M.morphAttributeCount),S.push(M.numDirLights),S.push(M.numPointLights),S.push(M.numSpotLights),S.push(M.numSpotLightMaps),S.push(M.numHemiLights),S.push(M.numRectAreaLights),S.push(M.numDirLightShadows),S.push(M.numPointLightShadows),S.push(M.numSpotLightShadows),S.push(M.numSpotLightShadowsWithMaps),S.push(M.numLightProbes),S.push(M.shadowMapType),S.push(M.toneMapping),S.push(M.numClippingPlanes),S.push(M.numClipIntersection),S.push(M.depthPacking)}function v(S,M){a.disableAll(),M.supportsVertexTextures&&a.enable(0),M.instancing&&a.enable(1),M.instancingColor&&a.enable(2),M.instancingMorph&&a.enable(3),M.matcap&&a.enable(4),M.envMap&&a.enable(5),M.normalMapObjectSpace&&a.enable(6),M.normalMapTangentSpace&&a.enable(7),M.clearcoat&&a.enable(8),M.iridescence&&a.enable(9),M.alphaTest&&a.enable(10),M.vertexColors&&a.enable(11),M.vertexAlphas&&a.enable(12),M.vertexUv1s&&a.enable(13),M.vertexUv2s&&a.enable(14),M.vertexUv3s&&a.enable(15),M.vertexTangents&&a.enable(16),M.anisotropy&&a.enable(17),M.alphaHash&&a.enable(18),M.batching&&a.enable(19),M.dispersion&&a.enable(20),M.batchingColor&&a.enable(21),M.gradientMap&&a.enable(22),S.push(a.mask),a.disableAll(),M.fog&&a.enable(0),M.useFog&&a.enable(1),M.flatShading&&a.enable(2),M.logarithmicDepthBuffer&&a.enable(3),M.reversedDepthBuffer&&a.enable(4),M.skinning&&a.enable(5),M.morphTargets&&a.enable(6),M.morphNormals&&a.enable(7),M.morphColors&&a.enable(8),M.premultipliedAlpha&&a.enable(9),M.shadowMapEnabled&&a.enable(10),M.doubleSided&&a.enable(11),M.flipSided&&a.enable(12),M.useDepthPacking&&a.enable(13),M.dithering&&a.enable(14),M.transmission&&a.enable(15),M.sheen&&a.enable(16),M.opaque&&a.enable(17),M.pointsUvs&&a.enable(18),M.decodeVideoTexture&&a.enable(19),M.decodeVideoTextureEmissive&&a.enable(20),M.alphaToCoverage&&a.enable(21),S.push(a.mask)}function _(S){let M=g[S.type],b;if(M){let A=Ci[M];b=Xg.clone(A.uniforms)}else b=S.uniforms;return b}function w(S,M){let b;for(let A=0,N=h.length;A<N;A++){let C=h[A];if(C.cacheKey===M){b=C,++b.usedTimes;break}}return b===void 0&&(b=new cb(s,M,S,r),h.push(b)),b}function T(S){if(--S.usedTimes===0){let M=h.indexOf(S);h[M]=h[h.length-1],h.pop(),S.destroy()}}function R(S){c.remove(S)}function L(){c.dispose()}return{getParameters:m,getProgramCacheKey:p,getUniforms:_,acquireProgram:w,releaseProgram:T,releaseShaderCache:R,programs:h,dispose:L}}function ub(){let s=new WeakMap;function t(o){return s.has(o)}function e(o){let a=s.get(o);return a===void 0&&(a={},s.set(o,a)),a}function n(o){s.delete(o)}function i(o,a,c){s.get(o)[a]=c}function r(){s=new WeakMap}return{has:t,get:e,remove:n,update:i,dispose:r}}function fb(s,t){return s.groupOrder!==t.groupOrder?s.groupOrder-t.groupOrder:s.renderOrder!==t.renderOrder?s.renderOrder-t.renderOrder:s.material.id!==t.material.id?s.material.id-t.material.id:s.z!==t.z?s.z-t.z:s.id-t.id}function p0(s,t){return s.groupOrder!==t.groupOrder?s.groupOrder-t.groupOrder:s.renderOrder!==t.renderOrder?s.renderOrder-t.renderOrder:s.z!==t.z?t.z-s.z:s.id-t.id}function m0(){let s=[],t=0,e=[],n=[],i=[];function r(){t=0,e.length=0,n.length=0,i.length=0}function o(u,f,d,g,x,m){let p=s[t];return p===void 0?(p={id:u.id,object:u,geometry:f,material:d,groupOrder:g,renderOrder:u.renderOrder,z:x,group:m},s[t]=p):(p.id=u.id,p.object=u,p.geometry=f,p.material=d,p.groupOrder=g,p.renderOrder=u.renderOrder,p.z=x,p.group=m),t++,p}function a(u,f,d,g,x,m){let p=o(u,f,d,g,x,m);d.transmission>0?n.push(p):d.transparent===!0?i.push(p):e.push(p)}function c(u,f,d,g,x,m){let p=o(u,f,d,g,x,m);d.transmission>0?n.unshift(p):d.transparent===!0?i.unshift(p):e.unshift(p)}function l(u,f){e.length>1&&e.sort(u||fb),n.length>1&&n.sort(f||p0),i.length>1&&i.sort(f||p0)}function h(){for(let u=t,f=s.length;u<f;u++){let d=s[u];if(d.id===null)break;d.id=null,d.object=null,d.geometry=null,d.material=null,d.group=null}}return{opaque:e,transmissive:n,transparent:i,init:r,push:a,unshift:c,finish:h,sort:l}}function db(){let s=new WeakMap;function t(n,i){let r=s.get(n),o;return r===void 0?(o=new m0,s.set(n,[o])):i>=r.length?(o=new m0,r.push(o)):o=r[i],o}function e(){s=new WeakMap}return{get:t,dispose:e}}function pb(){let s={};return{get:function(t){if(s[t.id]!==void 0)return s[t.id];let e;switch(t.type){case"DirectionalLight":e={direction:new B,color:new Et};break;case"SpotLight":e={position:new B,direction:new B,color:new Et,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":e={position:new B,color:new Et,distance:0,decay:0};break;case"HemisphereLight":e={direction:new B,skyColor:new Et,groundColor:new Et};break;case"RectAreaLight":e={color:new Et,position:new B,halfWidth:new B,halfHeight:new B};break}return s[t.id]=e,e}}}function mb(){let s={};return{get:function(t){if(s[t.id]!==void 0)return s[t.id];let e;switch(t.type){case"DirectionalLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ht};break;case"SpotLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ht};break;case"PointLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ht,shadowCameraNear:1,shadowCameraFar:1e3};break}return s[t.id]=e,e}}}var gb=0;function xb(s,t){return(t.castShadow?2:0)-(s.castShadow?2:0)+(t.map?1:0)-(s.map?1:0)}function yb(s){let t=new pb,e=mb(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let l=0;l<9;l++)n.probe.push(new B);let i=new B,r=new Pt,o=new Pt;function a(l){let h=0,u=0,f=0;for(let S=0;S<9;S++)n.probe[S].set(0,0,0);let d=0,g=0,x=0,m=0,p=0,y=0,v=0,_=0,w=0,T=0,R=0;l.sort(xb);for(let S=0,M=l.length;S<M;S++){let b=l[S],A=b.color,N=b.intensity,C=b.distance,I=b.shadow&&b.shadow.map?b.shadow.map.texture:null;if(b.isAmbientLight)h+=A.r*N,u+=A.g*N,f+=A.b*N;else if(b.isLightProbe){for(let O=0;O<9;O++)n.probe[O].addScaledVector(b.sh.coefficients[O],N);R++}else if(b.isDirectionalLight){let O=t.get(b);if(O.color.copy(b.color).multiplyScalar(b.intensity),b.castShadow){let k=b.shadow,z=e.get(b);z.shadowIntensity=k.intensity,z.shadowBias=k.bias,z.shadowNormalBias=k.normalBias,z.shadowRadius=k.radius,z.shadowMapSize=k.mapSize,n.directionalShadow[d]=z,n.directionalShadowMap[d]=I,n.directionalShadowMatrix[d]=b.shadow.matrix,y++}n.directional[d]=O,d++}else if(b.isSpotLight){let O=t.get(b);O.position.setFromMatrixPosition(b.matrixWorld),O.color.copy(A).multiplyScalar(N),O.distance=C,O.coneCos=Math.cos(b.angle),O.penumbraCos=Math.cos(b.angle*(1-b.penumbra)),O.decay=b.decay,n.spot[x]=O;let k=b.shadow;if(b.map&&(n.spotLightMap[w]=b.map,w++,k.updateMatrices(b),b.castShadow&&T++),n.spotLightMatrix[x]=k.matrix,b.castShadow){let z=e.get(b);z.shadowIntensity=k.intensity,z.shadowBias=k.bias,z.shadowNormalBias=k.normalBias,z.shadowRadius=k.radius,z.shadowMapSize=k.mapSize,n.spotShadow[x]=z,n.spotShadowMap[x]=I,_++}x++}else if(b.isRectAreaLight){let O=t.get(b);O.color.copy(A).multiplyScalar(N),O.halfWidth.set(b.width*.5,0,0),O.halfHeight.set(0,b.height*.5,0),n.rectArea[m]=O,m++}else if(b.isPointLight){let O=t.get(b);if(O.color.copy(b.color).multiplyScalar(b.intensity),O.distance=b.distance,O.decay=b.decay,b.castShadow){let k=b.shadow,z=e.get(b);z.shadowIntensity=k.intensity,z.shadowBias=k.bias,z.shadowNormalBias=k.normalBias,z.shadowRadius=k.radius,z.shadowMapSize=k.mapSize,z.shadowCameraNear=k.camera.near,z.shadowCameraFar=k.camera.far,n.pointShadow[g]=z,n.pointShadowMap[g]=I,n.pointShadowMatrix[g]=b.shadow.matrix,v++}n.point[g]=O,g++}else if(b.isHemisphereLight){let O=t.get(b);O.skyColor.copy(b.color).multiplyScalar(N),O.groundColor.copy(b.groundColor).multiplyScalar(N),n.hemi[p]=O,p++}}m>0&&(s.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=Ct.LTC_FLOAT_1,n.rectAreaLTC2=Ct.LTC_FLOAT_2):(n.rectAreaLTC1=Ct.LTC_HALF_1,n.rectAreaLTC2=Ct.LTC_HALF_2)),n.ambient[0]=h,n.ambient[1]=u,n.ambient[2]=f;let L=n.hash;(L.directionalLength!==d||L.pointLength!==g||L.spotLength!==x||L.rectAreaLength!==m||L.hemiLength!==p||L.numDirectionalShadows!==y||L.numPointShadows!==v||L.numSpotShadows!==_||L.numSpotMaps!==w||L.numLightProbes!==R)&&(n.directional.length=d,n.spot.length=x,n.rectArea.length=m,n.point.length=g,n.hemi.length=p,n.directionalShadow.length=y,n.directionalShadowMap.length=y,n.pointShadow.length=v,n.pointShadowMap.length=v,n.spotShadow.length=_,n.spotShadowMap.length=_,n.directionalShadowMatrix.length=y,n.pointShadowMatrix.length=v,n.spotLightMatrix.length=_+w-T,n.spotLightMap.length=w,n.numSpotLightShadowsWithMaps=T,n.numLightProbes=R,L.directionalLength=d,L.pointLength=g,L.spotLength=x,L.rectAreaLength=m,L.hemiLength=p,L.numDirectionalShadows=y,L.numPointShadows=v,L.numSpotShadows=_,L.numSpotMaps=w,L.numLightProbes=R,n.version=gb++)}function c(l,h){let u=0,f=0,d=0,g=0,x=0,m=h.matrixWorldInverse;for(let p=0,y=l.length;p<y;p++){let v=l[p];if(v.isDirectionalLight){let _=n.directional[u];_.direction.setFromMatrixPosition(v.matrixWorld),i.setFromMatrixPosition(v.target.matrixWorld),_.direction.sub(i),_.direction.transformDirection(m),u++}else if(v.isSpotLight){let _=n.spot[d];_.position.setFromMatrixPosition(v.matrixWorld),_.position.applyMatrix4(m),_.direction.setFromMatrixPosition(v.matrixWorld),i.setFromMatrixPosition(v.target.matrixWorld),_.direction.sub(i),_.direction.transformDirection(m),d++}else if(v.isRectAreaLight){let _=n.rectArea[g];_.position.setFromMatrixPosition(v.matrixWorld),_.position.applyMatrix4(m),o.identity(),r.copy(v.matrixWorld),r.premultiply(m),o.extractRotation(r),_.halfWidth.set(v.width*.5,0,0),_.halfHeight.set(0,v.height*.5,0),_.halfWidth.applyMatrix4(o),_.halfHeight.applyMatrix4(o),g++}else if(v.isPointLight){let _=n.point[f];_.position.setFromMatrixPosition(v.matrixWorld),_.position.applyMatrix4(m),f++}else if(v.isHemisphereLight){let _=n.hemi[x];_.direction.setFromMatrixPosition(v.matrixWorld),_.direction.transformDirection(m),x++}}}return{setup:a,setupView:c,state:n}}function g0(s){let t=new yb(s),e=[],n=[];function i(h){l.camera=h,e.length=0,n.length=0}function r(h){e.push(h)}function o(h){n.push(h)}function a(){t.setup(e)}function c(h){t.setupView(e,h)}let l={lightsArray:e,shadowsArray:n,camera:null,lights:t,transmissionRenderTarget:{}};return{init:i,state:l,setupLights:a,setupLightsView:c,pushLight:r,pushShadow:o}}function _b(s){let t=new WeakMap;function e(i,r=0){let o=t.get(i),a;return o===void 0?(a=new g0(s),t.set(i,[a])):r>=o.length?(a=new g0(s),o.push(a)):a=o[r],a}function n(){t=new WeakMap}return{get:e,dispose:n}}var vb=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,Sb=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}`;function Mb(s,t,e){let n=new Qr,i=new Ht,r=new Ht,o=new de,a=new nl({depthPacking:Ng}),c=new il,l={},h=e.maxTextureSize,u={[fn]:nn,[nn]:fn,[Ce]:Ce},f=new Sn({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Ht},radius:{value:4}},vertexShader:vb,fragmentShader:Sb}),d=f.clone();d.defines.HORIZONTAL_PASS=1;let g=new oe;g.setAttribute("position",new re(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let x=new pe(g,f),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=pf;let p=this.type;this.render=function(T,R,L){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||T.length===0)return;let S=s.getRenderTarget(),M=s.getActiveCubeFace(),b=s.getActiveMipmapLevel(),A=s.state;A.setBlending(qi),A.buffers.depth.getReversed()===!0?A.buffers.color.setClear(0,0,0,0):A.buffers.color.setClear(1,1,1,1),A.buffers.depth.setTest(!0),A.setScissorTest(!1);let N=p!==Ri&&this.type===Ri,C=p===Ri&&this.type!==Ri;for(let I=0,O=T.length;I<O;I++){let k=T[I],z=k.shadow;if(z===void 0){console.warn("THREE.WebGLShadowMap:",k,"has no shadow.");continue}if(z.autoUpdate===!1&&z.needsUpdate===!1)continue;i.copy(z.mapSize);let et=z.getFrameExtents();if(i.multiply(et),r.copy(z.mapSize),(i.x>h||i.y>h)&&(i.x>h&&(r.x=Math.floor(h/et.x),i.x=r.x*et.x,z.mapSize.x=r.x),i.y>h&&(r.y=Math.floor(h/et.y),i.y=r.y*et.y,z.mapSize.y=r.y)),z.map===null||N===!0||C===!0){let W=this.type!==Ri?{minFilter:Qe,magFilter:Qe}:{};z.map!==null&&z.map.dispose(),z.map=new qn(i.x,i.y,W),z.map.texture.name=k.name+".shadowMap",z.camera.updateProjectionMatrix()}s.setRenderTarget(z.map),s.clear();let j=z.getViewportCount();for(let W=0;W<j;W++){let tt=z.getViewport(W);o.set(r.x*tt.x,r.y*tt.y,r.x*tt.z,r.y*tt.w),A.viewport(o),z.updateMatrices(k,W),n=z.getFrustum(),_(R,L,z.camera,k,this.type)}z.isPointLightShadow!==!0&&this.type===Ri&&y(z,L),z.needsUpdate=!1}p=this.type,m.needsUpdate=!1,s.setRenderTarget(S,M,b)};function y(T,R){let L=t.update(x);f.defines.VSM_SAMPLES!==T.blurSamples&&(f.defines.VSM_SAMPLES=T.blurSamples,d.defines.VSM_SAMPLES=T.blurSamples,f.needsUpdate=!0,d.needsUpdate=!0),T.mapPass===null&&(T.mapPass=new qn(i.x,i.y)),f.uniforms.shadow_pass.value=T.map.texture,f.uniforms.resolution.value=T.mapSize,f.uniforms.radius.value=T.radius,s.setRenderTarget(T.mapPass),s.clear(),s.renderBufferDirect(R,null,L,f,x,null),d.uniforms.shadow_pass.value=T.mapPass.texture,d.uniforms.resolution.value=T.mapSize,d.uniforms.radius.value=T.radius,s.setRenderTarget(T.map),s.clear(),s.renderBufferDirect(R,null,L,d,x,null)}function v(T,R,L,S){let M=null,b=L.isPointLight===!0?T.customDistanceMaterial:T.customDepthMaterial;if(b!==void 0)M=b;else if(M=L.isPointLight===!0?c:a,s.localClippingEnabled&&R.clipShadows===!0&&Array.isArray(R.clippingPlanes)&&R.clippingPlanes.length!==0||R.displacementMap&&R.displacementScale!==0||R.alphaMap&&R.alphaTest>0||R.map&&R.alphaTest>0||R.alphaToCoverage===!0){let A=M.uuid,N=R.uuid,C=l[A];C===void 0&&(C={},l[A]=C);let I=C[N];I===void 0&&(I=M.clone(),C[N]=I,R.addEventListener("dispose",w)),M=I}if(M.visible=R.visible,M.wireframe=R.wireframe,S===Ri?M.side=R.shadowSide!==null?R.shadowSide:R.side:M.side=R.shadowSide!==null?R.shadowSide:u[R.side],M.alphaMap=R.alphaMap,M.alphaTest=R.alphaToCoverage===!0?.5:R.alphaTest,M.map=R.map,M.clipShadows=R.clipShadows,M.clippingPlanes=R.clippingPlanes,M.clipIntersection=R.clipIntersection,M.displacementMap=R.displacementMap,M.displacementScale=R.displacementScale,M.displacementBias=R.displacementBias,M.wireframeLinewidth=R.wireframeLinewidth,M.linewidth=R.linewidth,L.isPointLight===!0&&M.isMeshDistanceMaterial===!0){let A=s.properties.get(M);A.light=L}return M}function _(T,R,L,S,M){if(T.visible===!1)return;if(T.layers.test(R.layers)&&(T.isMesh||T.isLine||T.isPoints)&&(T.castShadow||T.receiveShadow&&M===Ri)&&(!T.frustumCulled||n.intersectsObject(T))){T.modelViewMatrix.multiplyMatrices(L.matrixWorldInverse,T.matrixWorld);let N=t.update(T),C=T.material;if(Array.isArray(C)){let I=N.groups;for(let O=0,k=I.length;O<k;O++){let z=I[O],et=C[z.materialIndex];if(et&&et.visible){let j=v(T,et,S,M);T.onBeforeShadow(s,T,R,L,N,j,z),s.renderBufferDirect(L,null,N,j,T,z),T.onAfterShadow(s,T,R,L,N,j,z)}}}else if(C.visible){let I=v(T,C,S,M);T.onBeforeShadow(s,T,R,L,N,I,null),s.renderBufferDirect(L,null,N,I,T,null),T.onAfterShadow(s,T,R,L,N,I,null)}}let A=T.children;for(let N=0,C=A.length;N<C;N++)_(A[N],R,L,S,M)}function w(T){T.target.removeEventListener("dispose",w);for(let L in l){let S=l[L],M=T.target.uuid;M in S&&(S[M].dispose(),delete S[M])}}}var bb={[fl]:dl,[pl]:xl,[ml]:yl,[zs]:gl,[dl]:fl,[xl]:pl,[yl]:ml,[gl]:zs};function wb(s,t){function e(){let q=!1,_t=new de,Mt=null,It=new de(0,0,0,0);return{setMask:function(gt){Mt!==gt&&!q&&(s.colorMask(gt,gt,gt,gt),Mt=gt)},setLocked:function(gt){q=gt},setClear:function(gt,pt,Ut,$t,_e){_e===!0&&(gt*=$t,pt*=$t,Ut*=$t),_t.set(gt,pt,Ut,$t),It.equals(_t)===!1&&(s.clearColor(gt,pt,Ut,$t),It.copy(_t))},reset:function(){q=!1,Mt=null,It.set(-1,0,0,0)}}}function n(){let q=!1,_t=!1,Mt=null,It=null,gt=null;return{setReversed:function(pt){if(_t!==pt){let Ut=t.get("EXT_clip_control");pt?Ut.clipControlEXT(Ut.LOWER_LEFT_EXT,Ut.ZERO_TO_ONE_EXT):Ut.clipControlEXT(Ut.LOWER_LEFT_EXT,Ut.NEGATIVE_ONE_TO_ONE_EXT),_t=pt;let $t=gt;gt=null,this.setClear($t)}},getReversed:function(){return _t},setTest:function(pt){pt?it(s.DEPTH_TEST):ft(s.DEPTH_TEST)},setMask:function(pt){Mt!==pt&&!q&&(s.depthMask(pt),Mt=pt)},setFunc:function(pt){if(_t&&(pt=bb[pt]),It!==pt){switch(pt){case fl:s.depthFunc(s.NEVER);break;case dl:s.depthFunc(s.ALWAYS);break;case pl:s.depthFunc(s.LESS);break;case zs:s.depthFunc(s.LEQUAL);break;case ml:s.depthFunc(s.EQUAL);break;case gl:s.depthFunc(s.GEQUAL);break;case xl:s.depthFunc(s.GREATER);break;case yl:s.depthFunc(s.NOTEQUAL);break;default:s.depthFunc(s.LEQUAL)}It=pt}},setLocked:function(pt){q=pt},setClear:function(pt){gt!==pt&&(_t&&(pt=1-pt),s.clearDepth(pt),gt=pt)},reset:function(){q=!1,Mt=null,It=null,gt=null,_t=!1}}}function i(){let q=!1,_t=null,Mt=null,It=null,gt=null,pt=null,Ut=null,$t=null,_e=null;return{setTest:function(se){q||(se?it(s.STENCIL_TEST):ft(s.STENCIL_TEST))},setMask:function(se){_t!==se&&!q&&(s.stencilMask(se),_t=se)},setFunc:function(se,Vn,In){(Mt!==se||It!==Vn||gt!==In)&&(s.stencilFunc(se,Vn,In),Mt=se,It=Vn,gt=In)},setOp:function(se,Vn,In){(pt!==se||Ut!==Vn||$t!==In)&&(s.stencilOp(se,Vn,In),pt=se,Ut=Vn,$t=In)},setLocked:function(se){q=se},setClear:function(se){_e!==se&&(s.clearStencil(se),_e=se)},reset:function(){q=!1,_t=null,Mt=null,It=null,gt=null,pt=null,Ut=null,$t=null,_e=null}}}let r=new e,o=new n,a=new i,c=new WeakMap,l=new WeakMap,h={},u={},f=new WeakMap,d=[],g=null,x=!1,m=null,p=null,y=null,v=null,_=null,w=null,T=null,R=new Et(0,0,0),L=0,S=!1,M=null,b=null,A=null,N=null,C=null,I=s.getParameter(s.MAX_COMBINED_TEXTURE_IMAGE_UNITS),O=!1,k=0,z=s.getParameter(s.VERSION);z.indexOf("WebGL")!==-1?(k=parseFloat(/^WebGL (\d)/.exec(z)[1]),O=k>=1):z.indexOf("OpenGL ES")!==-1&&(k=parseFloat(/^OpenGL ES (\d)/.exec(z)[1]),O=k>=2);let et=null,j={},W=s.getParameter(s.SCISSOR_BOX),tt=s.getParameter(s.VIEWPORT),at=new de().fromArray(W),st=new de().fromArray(tt);function ot(q,_t,Mt,It){let gt=new Uint8Array(4),pt=s.createTexture();s.bindTexture(q,pt),s.texParameteri(q,s.TEXTURE_MIN_FILTER,s.NEAREST),s.texParameteri(q,s.TEXTURE_MAG_FILTER,s.NEAREST);for(let Ut=0;Ut<Mt;Ut++)q===s.TEXTURE_3D||q===s.TEXTURE_2D_ARRAY?s.texImage3D(_t,0,s.RGBA,1,1,It,0,s.RGBA,s.UNSIGNED_BYTE,gt):s.texImage2D(_t+Ut,0,s.RGBA,1,1,0,s.RGBA,s.UNSIGNED_BYTE,gt);return pt}let J={};J[s.TEXTURE_2D]=ot(s.TEXTURE_2D,s.TEXTURE_2D,1),J[s.TEXTURE_CUBE_MAP]=ot(s.TEXTURE_CUBE_MAP,s.TEXTURE_CUBE_MAP_POSITIVE_X,6),J[s.TEXTURE_2D_ARRAY]=ot(s.TEXTURE_2D_ARRAY,s.TEXTURE_2D_ARRAY,1,1),J[s.TEXTURE_3D]=ot(s.TEXTURE_3D,s.TEXTURE_3D,1,1),r.setClear(0,0,0,1),o.setClear(1),a.setClear(0),it(s.DEPTH_TEST),o.setFunc(zs),E(!1),H(df),it(s.CULL_FACE),Qt(qi);function it(q){h[q]!==!0&&(s.enable(q),h[q]=!0)}function ft(q){h[q]!==!1&&(s.disable(q),h[q]=!1)}function bt(q,_t){return u[q]!==_t?(s.bindFramebuffer(q,_t),u[q]=_t,q===s.DRAW_FRAMEBUFFER&&(u[s.FRAMEBUFFER]=_t),q===s.FRAMEBUFFER&&(u[s.DRAW_FRAMEBUFFER]=_t),!0):!1}function St(q,_t){let Mt=d,It=!1;if(q){Mt=f.get(_t),Mt===void 0&&(Mt=[],f.set(_t,Mt));let gt=q.textures;if(Mt.length!==gt.length||Mt[0]!==s.COLOR_ATTACHMENT0){for(let pt=0,Ut=gt.length;pt<Ut;pt++)Mt[pt]=s.COLOR_ATTACHMENT0+pt;Mt.length=gt.length,It=!0}}else Mt[0]!==s.BACK&&(Mt[0]=s.BACK,It=!0);It&&s.drawBuffers(Mt)}function zt(q){return g!==q?(s.useProgram(q),g=q,!0):!1}let ue={[us]:s.FUNC_ADD,[ag]:s.FUNC_SUBTRACT,[cg]:s.FUNC_REVERSE_SUBTRACT};ue[lg]=s.MIN,ue[hg]=s.MAX;let V={[ul]:s.ZERO,[Aa]:s.ONE,[ug]:s.SRC_COLOR,[Xc]:s.SRC_ALPHA,[xg]:s.SRC_ALPHA_SATURATE,[mg]:s.DST_COLOR,[dg]:s.DST_ALPHA,[fg]:s.ONE_MINUS_SRC_COLOR,[Hr]:s.ONE_MINUS_SRC_ALPHA,[gg]:s.ONE_MINUS_DST_COLOR,[pg]:s.ONE_MINUS_DST_ALPHA,[yg]:s.CONSTANT_COLOR,[_g]:s.ONE_MINUS_CONSTANT_COLOR,[vg]:s.CONSTANT_ALPHA,[Sg]:s.ONE_MINUS_CONSTANT_ALPHA};function Qt(q,_t,Mt,It,gt,pt,Ut,$t,_e,se){if(q===qi){x===!0&&(ft(s.BLEND),x=!1);return}if(x===!1&&(it(s.BLEND),x=!0),q!==Ta){if(q!==m||se!==S){if((p!==us||_!==us)&&(s.blendEquation(s.FUNC_ADD),p=us,_=us),se)switch(q){case Bs:s.blendFuncSeparate(s.ONE,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case mf:s.blendFunc(s.ONE,s.ONE);break;case gf:s.blendFuncSeparate(s.ZERO,s.ONE_MINUS_SRC_COLOR,s.ZERO,s.ONE);break;case xf:s.blendFuncSeparate(s.DST_COLOR,s.ONE_MINUS_SRC_ALPHA,s.ZERO,s.ONE);break;default:console.error("THREE.WebGLState: Invalid blending: ",q);break}else switch(q){case Bs:s.blendFuncSeparate(s.SRC_ALPHA,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case mf:s.blendFuncSeparate(s.SRC_ALPHA,s.ONE,s.ONE,s.ONE);break;case gf:console.error("THREE.WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case xf:console.error("THREE.WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:console.error("THREE.WebGLState: Invalid blending: ",q);break}y=null,v=null,w=null,T=null,R.set(0,0,0),L=0,m=q,S=se}return}gt=gt||_t,pt=pt||Mt,Ut=Ut||It,(_t!==p||gt!==_)&&(s.blendEquationSeparate(ue[_t],ue[gt]),p=_t,_=gt),(Mt!==y||It!==v||pt!==w||Ut!==T)&&(s.blendFuncSeparate(V[Mt],V[It],V[pt],V[Ut]),y=Mt,v=It,w=pt,T=Ut),($t.equals(R)===!1||_e!==L)&&(s.blendColor($t.r,$t.g,$t.b,_e),R.copy($t),L=_e),m=q,S=!1}function D(q,_t){q.side===Ce?ft(s.CULL_FACE):it(s.CULL_FACE);let Mt=q.side===nn;_t&&(Mt=!Mt),E(Mt),q.blending===Bs&&q.transparent===!1?Qt(qi):Qt(q.blending,q.blendEquation,q.blendSrc,q.blendDst,q.blendEquationAlpha,q.blendSrcAlpha,q.blendDstAlpha,q.blendColor,q.blendAlpha,q.premultipliedAlpha),o.setFunc(q.depthFunc),o.setTest(q.depthTest),o.setMask(q.depthWrite),r.setMask(q.colorWrite);let It=q.stencilWrite;a.setTest(It),It&&(a.setMask(q.stencilWriteMask),a.setFunc(q.stencilFunc,q.stencilRef,q.stencilFuncMask),a.setOp(q.stencilFail,q.stencilZFail,q.stencilZPass)),Q(q.polygonOffset,q.polygonOffsetFactor,q.polygonOffsetUnits),q.alphaToCoverage===!0?it(s.SAMPLE_ALPHA_TO_COVERAGE):ft(s.SAMPLE_ALPHA_TO_COVERAGE)}function E(q){M!==q&&(q?s.frontFace(s.CW):s.frontFace(s.CCW),M=q)}function H(q){q!==sg?(it(s.CULL_FACE),q!==b&&(q===df?s.cullFace(s.BACK):q===rg?s.cullFace(s.FRONT):s.cullFace(s.FRONT_AND_BACK))):ft(s.CULL_FACE),b=q}function ut(q){q!==A&&(O&&s.lineWidth(q),A=q)}function Q(q,_t,Mt){q?(it(s.POLYGON_OFFSET_FILL),(N!==_t||C!==Mt)&&(s.polygonOffset(_t,Mt),N=_t,C=Mt)):ft(s.POLYGON_OFFSET_FILL)}function yt(q){q?it(s.SCISSOR_TEST):ft(s.SCISSOR_TEST)}function Bt(q){q===void 0&&(q=s.TEXTURE0+I-1),et!==q&&(s.activeTexture(q),et=q)}function At(q,_t,Mt){Mt===void 0&&(et===null?Mt=s.TEXTURE0+I-1:Mt=et);let It=j[Mt];It===void 0&&(It={type:void 0,texture:void 0},j[Mt]=It),(It.type!==q||It.texture!==_t)&&(et!==Mt&&(s.activeTexture(Mt),et=Mt),s.bindTexture(q,_t||J[q]),It.type=q,It.texture=_t)}function F(){let q=j[et];q!==void 0&&q.type!==void 0&&(s.bindTexture(q.type,null),q.type=void 0,q.texture=void 0)}function P(){try{s.compressedTexImage2D(...arguments)}catch(q){console.error("THREE.WebGLState:",q)}}function $(){try{s.compressedTexImage3D(...arguments)}catch(q){console.error("THREE.WebGLState:",q)}}function nt(){try{s.texSubImage2D(...arguments)}catch(q){console.error("THREE.WebGLState:",q)}}function ct(){try{s.texSubImage3D(...arguments)}catch(q){console.error("THREE.WebGLState:",q)}}function rt(){try{s.compressedTexSubImage2D(...arguments)}catch(q){console.error("THREE.WebGLState:",q)}}function wt(){try{s.compressedTexSubImage3D(...arguments)}catch(q){console.error("THREE.WebGLState:",q)}}function dt(){try{s.texStorage2D(...arguments)}catch(q){console.error("THREE.WebGLState:",q)}}function Lt(){try{s.texStorage3D(...arguments)}catch(q){console.error("THREE.WebGLState:",q)}}function Ft(){try{s.texImage2D(...arguments)}catch(q){console.error("THREE.WebGLState:",q)}}function mt(){try{s.texImage3D(...arguments)}catch(q){console.error("THREE.WebGLState:",q)}}function Rt(q){at.equals(q)===!1&&(s.scissor(q.x,q.y,q.z,q.w),at.copy(q))}function Dt(q){st.equals(q)===!1&&(s.viewport(q.x,q.y,q.z,q.w),st.copy(q))}function Tt(q,_t){let Mt=l.get(_t);Mt===void 0&&(Mt=new WeakMap,l.set(_t,Mt));let It=Mt.get(q);It===void 0&&(It=s.getUniformBlockIndex(_t,q.name),Mt.set(q,It))}function xt(q,_t){let It=l.get(_t).get(q);c.get(_t)!==It&&(s.uniformBlockBinding(_t,It,q.__bindingPointIndex),c.set(_t,It))}function qt(){s.disable(s.BLEND),s.disable(s.CULL_FACE),s.disable(s.DEPTH_TEST),s.disable(s.POLYGON_OFFSET_FILL),s.disable(s.SCISSOR_TEST),s.disable(s.STENCIL_TEST),s.disable(s.SAMPLE_ALPHA_TO_COVERAGE),s.blendEquation(s.FUNC_ADD),s.blendFunc(s.ONE,s.ZERO),s.blendFuncSeparate(s.ONE,s.ZERO,s.ONE,s.ZERO),s.blendColor(0,0,0,0),s.colorMask(!0,!0,!0,!0),s.clearColor(0,0,0,0),s.depthMask(!0),s.depthFunc(s.LESS),o.setReversed(!1),s.clearDepth(1),s.stencilMask(4294967295),s.stencilFunc(s.ALWAYS,0,4294967295),s.stencilOp(s.KEEP,s.KEEP,s.KEEP),s.clearStencil(0),s.cullFace(s.BACK),s.frontFace(s.CCW),s.polygonOffset(0,0),s.activeTexture(s.TEXTURE0),s.bindFramebuffer(s.FRAMEBUFFER,null),s.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),s.bindFramebuffer(s.READ_FRAMEBUFFER,null),s.useProgram(null),s.lineWidth(1),s.scissor(0,0,s.canvas.width,s.canvas.height),s.viewport(0,0,s.canvas.width,s.canvas.height),h={},et=null,j={},u={},f=new WeakMap,d=[],g=null,x=!1,m=null,p=null,y=null,v=null,_=null,w=null,T=null,R=new Et(0,0,0),L=0,S=!1,M=null,b=null,A=null,N=null,C=null,at.set(0,0,s.canvas.width,s.canvas.height),st.set(0,0,s.canvas.width,s.canvas.height),r.reset(),o.reset(),a.reset()}return{buffers:{color:r,depth:o,stencil:a},enable:it,disable:ft,bindFramebuffer:bt,drawBuffers:St,useProgram:zt,setBlending:Qt,setMaterial:D,setFlipSided:E,setCullFace:H,setLineWidth:ut,setPolygonOffset:Q,setScissorTest:yt,activeTexture:Bt,bindTexture:At,unbindTexture:F,compressedTexImage2D:P,compressedTexImage3D:$,texImage2D:Ft,texImage3D:mt,updateUBOMapping:Tt,uniformBlockBinding:xt,texStorage2D:dt,texStorage3D:Lt,texSubImage2D:nt,texSubImage3D:ct,compressedTexSubImage2D:rt,compressedTexSubImage3D:wt,scissor:Rt,viewport:Dt,reset:qt}}function Eb(s,t,e,n,i,r,o){let a=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,c=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),l=new Ht,h=new WeakMap,u,f=new WeakMap,d=!1;try{d=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function g(F,P){return d?new OffscreenCanvas(F,P):Wr("canvas")}function x(F,P,$){let nt=1,ct=At(F);if((ct.width>$||ct.height>$)&&(nt=$/Math.max(ct.width,ct.height)),nt<1)if(typeof HTMLImageElement<"u"&&F instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&F instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&F instanceof ImageBitmap||typeof VideoFrame<"u"&&F instanceof VideoFrame){let rt=Math.floor(nt*ct.width),wt=Math.floor(nt*ct.height);u===void 0&&(u=g(rt,wt));let dt=P?g(rt,wt):u;return dt.width=rt,dt.height=wt,dt.getContext("2d").drawImage(F,0,0,rt,wt),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+ct.width+"x"+ct.height+") to ("+rt+"x"+wt+")."),dt}else return"data"in F&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+ct.width+"x"+ct.height+")."),F;return F}function m(F){return F.generateMipmaps}function p(F){s.generateMipmap(F)}function y(F){return F.isWebGLCubeRenderTarget?s.TEXTURE_CUBE_MAP:F.isWebGL3DRenderTarget?s.TEXTURE_3D:F.isWebGLArrayRenderTarget||F.isCompressedArrayTexture?s.TEXTURE_2D_ARRAY:s.TEXTURE_2D}function v(F,P,$,nt,ct=!1){if(F!==null){if(s[F]!==void 0)return s[F];console.warn("THREE.WebGLRenderer: Attempt to use non-existing WebGL internal format '"+F+"'")}let rt=P;if(P===s.RED&&($===s.FLOAT&&(rt=s.R32F),$===s.HALF_FLOAT&&(rt=s.R16F),$===s.UNSIGNED_BYTE&&(rt=s.R8)),P===s.RED_INTEGER&&($===s.UNSIGNED_BYTE&&(rt=s.R8UI),$===s.UNSIGNED_SHORT&&(rt=s.R16UI),$===s.UNSIGNED_INT&&(rt=s.R32UI),$===s.BYTE&&(rt=s.R8I),$===s.SHORT&&(rt=s.R16I),$===s.INT&&(rt=s.R32I)),P===s.RG&&($===s.FLOAT&&(rt=s.RG32F),$===s.HALF_FLOAT&&(rt=s.RG16F),$===s.UNSIGNED_BYTE&&(rt=s.RG8)),P===s.RG_INTEGER&&($===s.UNSIGNED_BYTE&&(rt=s.RG8UI),$===s.UNSIGNED_SHORT&&(rt=s.RG16UI),$===s.UNSIGNED_INT&&(rt=s.RG32UI),$===s.BYTE&&(rt=s.RG8I),$===s.SHORT&&(rt=s.RG16I),$===s.INT&&(rt=s.RG32I)),P===s.RGB_INTEGER&&($===s.UNSIGNED_BYTE&&(rt=s.RGB8UI),$===s.UNSIGNED_SHORT&&(rt=s.RGB16UI),$===s.UNSIGNED_INT&&(rt=s.RGB32UI),$===s.BYTE&&(rt=s.RGB8I),$===s.SHORT&&(rt=s.RGB16I),$===s.INT&&(rt=s.RGB32I)),P===s.RGBA_INTEGER&&($===s.UNSIGNED_BYTE&&(rt=s.RGBA8UI),$===s.UNSIGNED_SHORT&&(rt=s.RGBA16UI),$===s.UNSIGNED_INT&&(rt=s.RGBA32UI),$===s.BYTE&&(rt=s.RGBA8I),$===s.SHORT&&(rt=s.RGBA16I),$===s.INT&&(rt=s.RGBA32I)),P===s.RGB&&($===s.UNSIGNED_INT_5_9_9_9_REV&&(rt=s.RGB9_E5),$===s.UNSIGNED_INT_10F_11F_11F_REV&&(rt=s.R11F_G11F_B10F)),P===s.RGBA){let wt=ct?sa:ie.getTransfer(nt);$===s.FLOAT&&(rt=s.RGBA32F),$===s.HALF_FLOAT&&(rt=s.RGBA16F),$===s.UNSIGNED_BYTE&&(rt=wt===Se?s.SRGB8_ALPHA8:s.RGBA8),$===s.UNSIGNED_SHORT_4_4_4_4&&(rt=s.RGBA4),$===s.UNSIGNED_SHORT_5_5_5_1&&(rt=s.RGB5_A1)}return(rt===s.R16F||rt===s.R32F||rt===s.RG16F||rt===s.RG32F||rt===s.RGBA16F||rt===s.RGBA32F)&&t.get("EXT_color_buffer_float"),rt}function _(F,P){let $;return F?P===null||P===ms||P===oo?$=s.DEPTH24_STENCIL8:P===$n?$=s.DEPTH32F_STENCIL8:P===ro&&($=s.DEPTH24_STENCIL8,console.warn("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):P===null||P===ms||P===oo?$=s.DEPTH_COMPONENT24:P===$n?$=s.DEPTH_COMPONENT32F:P===ro&&($=s.DEPTH_COMPONENT16),$}function w(F,P){return m(F)===!0||F.isFramebufferTexture&&F.minFilter!==Qe&&F.minFilter!==Ye?Math.log2(Math.max(P.width,P.height))+1:F.mipmaps!==void 0&&F.mipmaps.length>0?F.mipmaps.length:F.isCompressedTexture&&Array.isArray(F.image)?P.mipmaps.length:1}function T(F){let P=F.target;P.removeEventListener("dispose",T),L(P),P.isVideoTexture&&h.delete(P)}function R(F){let P=F.target;P.removeEventListener("dispose",R),M(P)}function L(F){let P=n.get(F);if(P.__webglInit===void 0)return;let $=F.source,nt=f.get($);if(nt){let ct=nt[P.__cacheKey];ct.usedTimes--,ct.usedTimes===0&&S(F),Object.keys(nt).length===0&&f.delete($)}n.remove(F)}function S(F){let P=n.get(F);s.deleteTexture(P.__webglTexture);let $=F.source,nt=f.get($);delete nt[P.__cacheKey],o.memory.textures--}function M(F){let P=n.get(F);if(F.depthTexture&&(F.depthTexture.dispose(),n.remove(F.depthTexture)),F.isWebGLCubeRenderTarget)for(let nt=0;nt<6;nt++){if(Array.isArray(P.__webglFramebuffer[nt]))for(let ct=0;ct<P.__webglFramebuffer[nt].length;ct++)s.deleteFramebuffer(P.__webglFramebuffer[nt][ct]);else s.deleteFramebuffer(P.__webglFramebuffer[nt]);P.__webglDepthbuffer&&s.deleteRenderbuffer(P.__webglDepthbuffer[nt])}else{if(Array.isArray(P.__webglFramebuffer))for(let nt=0;nt<P.__webglFramebuffer.length;nt++)s.deleteFramebuffer(P.__webglFramebuffer[nt]);else s.deleteFramebuffer(P.__webglFramebuffer);if(P.__webglDepthbuffer&&s.deleteRenderbuffer(P.__webglDepthbuffer),P.__webglMultisampledFramebuffer&&s.deleteFramebuffer(P.__webglMultisampledFramebuffer),P.__webglColorRenderbuffer)for(let nt=0;nt<P.__webglColorRenderbuffer.length;nt++)P.__webglColorRenderbuffer[nt]&&s.deleteRenderbuffer(P.__webglColorRenderbuffer[nt]);P.__webglDepthRenderbuffer&&s.deleteRenderbuffer(P.__webglDepthRenderbuffer)}let $=F.textures;for(let nt=0,ct=$.length;nt<ct;nt++){let rt=n.get($[nt]);rt.__webglTexture&&(s.deleteTexture(rt.__webglTexture),o.memory.textures--),n.remove($[nt])}n.remove(F)}let b=0;function A(){b=0}function N(){let F=b;return F>=i.maxTextures&&console.warn("THREE.WebGLTextures: Trying to use "+F+" texture units while this GPU supports only "+i.maxTextures),b+=1,F}function C(F){let P=[];return P.push(F.wrapS),P.push(F.wrapT),P.push(F.wrapR||0),P.push(F.magFilter),P.push(F.minFilter),P.push(F.anisotropy),P.push(F.internalFormat),P.push(F.format),P.push(F.type),P.push(F.generateMipmaps),P.push(F.premultiplyAlpha),P.push(F.flipY),P.push(F.unpackAlignment),P.push(F.colorSpace),P.join()}function I(F,P){let $=n.get(F);if(F.isVideoTexture&&yt(F),F.isRenderTargetTexture===!1&&F.isExternalTexture!==!0&&F.version>0&&$.__version!==F.version){let nt=F.image;if(nt===null)console.warn("THREE.WebGLRenderer: Texture marked for update but no image data found.");else if(nt.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{J($,F,P);return}}else F.isExternalTexture&&($.__webglTexture=F.sourceTexture?F.sourceTexture:null);e.bindTexture(s.TEXTURE_2D,$.__webglTexture,s.TEXTURE0+P)}function O(F,P){let $=n.get(F);if(F.isRenderTargetTexture===!1&&F.version>0&&$.__version!==F.version){J($,F,P);return}e.bindTexture(s.TEXTURE_2D_ARRAY,$.__webglTexture,s.TEXTURE0+P)}function k(F,P){let $=n.get(F);if(F.isRenderTargetTexture===!1&&F.version>0&&$.__version!==F.version){J($,F,P);return}e.bindTexture(s.TEXTURE_3D,$.__webglTexture,s.TEXTURE0+P)}function z(F,P){let $=n.get(F);if(F.version>0&&$.__version!==F.version){it($,F,P);return}e.bindTexture(s.TEXTURE_CUBE_MAP,$.__webglTexture,s.TEXTURE0+P)}let et={[Mi]:s.REPEAT,[vi]:s.CLAMP_TO_EDGE,[Vr]:s.MIRRORED_REPEAT},j={[Qe]:s.NEAREST,[Sl]:s.NEAREST_MIPMAP_NEAREST,[Qs]:s.NEAREST_MIPMAP_LINEAR,[Ye]:s.LINEAR,[so]:s.LINEAR_MIPMAP_NEAREST,[Un]:s.LINEAR_MIPMAP_LINEAR},W={[Og]:s.NEVER,[Hg]:s.ALWAYS,[Ug]:s.LESS,[Cf]:s.LEQUAL,[Fg]:s.EQUAL,[kg]:s.GEQUAL,[Bg]:s.GREATER,[zg]:s.NOTEQUAL};function tt(F,P){if(P.type===$n&&t.has("OES_texture_float_linear")===!1&&(P.magFilter===Ye||P.magFilter===so||P.magFilter===Qs||P.magFilter===Un||P.minFilter===Ye||P.minFilter===so||P.minFilter===Qs||P.minFilter===Un)&&console.warn("THREE.WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),s.texParameteri(F,s.TEXTURE_WRAP_S,et[P.wrapS]),s.texParameteri(F,s.TEXTURE_WRAP_T,et[P.wrapT]),(F===s.TEXTURE_3D||F===s.TEXTURE_2D_ARRAY)&&s.texParameteri(F,s.TEXTURE_WRAP_R,et[P.wrapR]),s.texParameteri(F,s.TEXTURE_MAG_FILTER,j[P.magFilter]),s.texParameteri(F,s.TEXTURE_MIN_FILTER,j[P.minFilter]),P.compareFunction&&(s.texParameteri(F,s.TEXTURE_COMPARE_MODE,s.COMPARE_REF_TO_TEXTURE),s.texParameteri(F,s.TEXTURE_COMPARE_FUNC,W[P.compareFunction])),t.has("EXT_texture_filter_anisotropic")===!0){if(P.magFilter===Qe||P.minFilter!==Qs&&P.minFilter!==Un||P.type===$n&&t.has("OES_texture_float_linear")===!1)return;if(P.anisotropy>1||n.get(P).__currentAnisotropy){let $=t.get("EXT_texture_filter_anisotropic");s.texParameterf(F,$.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(P.anisotropy,i.getMaxAnisotropy())),n.get(P).__currentAnisotropy=P.anisotropy}}}function at(F,P){let $=!1;F.__webglInit===void 0&&(F.__webglInit=!0,P.addEventListener("dispose",T));let nt=P.source,ct=f.get(nt);ct===void 0&&(ct={},f.set(nt,ct));let rt=C(P);if(rt!==F.__cacheKey){ct[rt]===void 0&&(ct[rt]={texture:s.createTexture(),usedTimes:0},o.memory.textures++,$=!0),ct[rt].usedTimes++;let wt=ct[F.__cacheKey];wt!==void 0&&(ct[F.__cacheKey].usedTimes--,wt.usedTimes===0&&S(P)),F.__cacheKey=rt,F.__webglTexture=ct[rt].texture}return $}function st(F,P,$){return Math.floor(Math.floor(F/$)/P)}function ot(F,P,$,nt){let rt=F.updateRanges;if(rt.length===0)e.texSubImage2D(s.TEXTURE_2D,0,0,0,P.width,P.height,$,nt,P.data);else{rt.sort((mt,Rt)=>mt.start-Rt.start);let wt=0;for(let mt=1;mt<rt.length;mt++){let Rt=rt[wt],Dt=rt[mt],Tt=Rt.start+Rt.count,xt=st(Dt.start,P.width,4),qt=st(Rt.start,P.width,4);Dt.start<=Tt+1&&xt===qt&&st(Dt.start+Dt.count-1,P.width,4)===xt?Rt.count=Math.max(Rt.count,Dt.start+Dt.count-Rt.start):(++wt,rt[wt]=Dt)}rt.length=wt+1;let dt=s.getParameter(s.UNPACK_ROW_LENGTH),Lt=s.getParameter(s.UNPACK_SKIP_PIXELS),Ft=s.getParameter(s.UNPACK_SKIP_ROWS);s.pixelStorei(s.UNPACK_ROW_LENGTH,P.width);for(let mt=0,Rt=rt.length;mt<Rt;mt++){let Dt=rt[mt],Tt=Math.floor(Dt.start/4),xt=Math.ceil(Dt.count/4),qt=Tt%P.width,q=Math.floor(Tt/P.width),_t=xt,Mt=1;s.pixelStorei(s.UNPACK_SKIP_PIXELS,qt),s.pixelStorei(s.UNPACK_SKIP_ROWS,q),e.texSubImage2D(s.TEXTURE_2D,0,qt,q,_t,Mt,$,nt,P.data)}F.clearUpdateRanges(),s.pixelStorei(s.UNPACK_ROW_LENGTH,dt),s.pixelStorei(s.UNPACK_SKIP_PIXELS,Lt),s.pixelStorei(s.UNPACK_SKIP_ROWS,Ft)}}function J(F,P,$){let nt=s.TEXTURE_2D;(P.isDataArrayTexture||P.isCompressedArrayTexture)&&(nt=s.TEXTURE_2D_ARRAY),P.isData3DTexture&&(nt=s.TEXTURE_3D);let ct=at(F,P),rt=P.source;e.bindTexture(nt,F.__webglTexture,s.TEXTURE0+$);let wt=n.get(rt);if(rt.version!==wt.__version||ct===!0){e.activeTexture(s.TEXTURE0+$);let dt=ie.getPrimaries(ie.workingColorSpace),Lt=P.colorSpace===Ji?null:ie.getPrimaries(P.colorSpace),Ft=P.colorSpace===Ji||dt===Lt?s.NONE:s.BROWSER_DEFAULT_WEBGL;s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,P.flipY),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,P.premultiplyAlpha),s.pixelStorei(s.UNPACK_ALIGNMENT,P.unpackAlignment),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,Ft);let mt=x(P.image,!1,i.maxTextureSize);mt=Bt(P,mt);let Rt=r.convert(P.format,P.colorSpace),Dt=r.convert(P.type),Tt=v(P.internalFormat,Rt,Dt,P.colorSpace,P.isVideoTexture);tt(nt,P);let xt,qt=P.mipmaps,q=P.isVideoTexture!==!0,_t=wt.__version===void 0||ct===!0,Mt=rt.dataReady,It=w(P,mt);if(P.isDepthTexture)Tt=_(P.format===ao,P.type),_t&&(q?e.texStorage2D(s.TEXTURE_2D,1,Tt,mt.width,mt.height):e.texImage2D(s.TEXTURE_2D,0,Tt,mt.width,mt.height,0,Rt,Dt,null));else if(P.isDataTexture)if(qt.length>0){q&&_t&&e.texStorage2D(s.TEXTURE_2D,It,Tt,qt[0].width,qt[0].height);for(let gt=0,pt=qt.length;gt<pt;gt++)xt=qt[gt],q?Mt&&e.texSubImage2D(s.TEXTURE_2D,gt,0,0,xt.width,xt.height,Rt,Dt,xt.data):e.texImage2D(s.TEXTURE_2D,gt,Tt,xt.width,xt.height,0,Rt,Dt,xt.data);P.generateMipmaps=!1}else q?(_t&&e.texStorage2D(s.TEXTURE_2D,It,Tt,mt.width,mt.height),Mt&&ot(P,mt,Rt,Dt)):e.texImage2D(s.TEXTURE_2D,0,Tt,mt.width,mt.height,0,Rt,Dt,mt.data);else if(P.isCompressedTexture)if(P.isCompressedArrayTexture){q&&_t&&e.texStorage3D(s.TEXTURE_2D_ARRAY,It,Tt,qt[0].width,qt[0].height,mt.depth);for(let gt=0,pt=qt.length;gt<pt;gt++)if(xt=qt[gt],P.format!==Mn)if(Rt!==null)if(q){if(Mt)if(P.layerUpdates.size>0){let Ut=Bf(xt.width,xt.height,P.format,P.type);for(let $t of P.layerUpdates){let _e=xt.data.subarray($t*Ut/xt.data.BYTES_PER_ELEMENT,($t+1)*Ut/xt.data.BYTES_PER_ELEMENT);e.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,gt,0,0,$t,xt.width,xt.height,1,Rt,_e)}P.clearLayerUpdates()}else e.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,gt,0,0,0,xt.width,xt.height,mt.depth,Rt,xt.data)}else e.compressedTexImage3D(s.TEXTURE_2D_ARRAY,gt,Tt,xt.width,xt.height,mt.depth,0,xt.data,0,0);else console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else q?Mt&&e.texSubImage3D(s.TEXTURE_2D_ARRAY,gt,0,0,0,xt.width,xt.height,mt.depth,Rt,Dt,xt.data):e.texImage3D(s.TEXTURE_2D_ARRAY,gt,Tt,xt.width,xt.height,mt.depth,0,Rt,Dt,xt.data)}else{q&&_t&&e.texStorage2D(s.TEXTURE_2D,It,Tt,qt[0].width,qt[0].height);for(let gt=0,pt=qt.length;gt<pt;gt++)xt=qt[gt],P.format!==Mn?Rt!==null?q?Mt&&e.compressedTexSubImage2D(s.TEXTURE_2D,gt,0,0,xt.width,xt.height,Rt,xt.data):e.compressedTexImage2D(s.TEXTURE_2D,gt,Tt,xt.width,xt.height,0,xt.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):q?Mt&&e.texSubImage2D(s.TEXTURE_2D,gt,0,0,xt.width,xt.height,Rt,Dt,xt.data):e.texImage2D(s.TEXTURE_2D,gt,Tt,xt.width,xt.height,0,Rt,Dt,xt.data)}else if(P.isDataArrayTexture)if(q){if(_t&&e.texStorage3D(s.TEXTURE_2D_ARRAY,It,Tt,mt.width,mt.height,mt.depth),Mt)if(P.layerUpdates.size>0){let gt=Bf(mt.width,mt.height,P.format,P.type);for(let pt of P.layerUpdates){let Ut=mt.data.subarray(pt*gt/mt.data.BYTES_PER_ELEMENT,(pt+1)*gt/mt.data.BYTES_PER_ELEMENT);e.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,pt,mt.width,mt.height,1,Rt,Dt,Ut)}P.clearLayerUpdates()}else e.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,0,mt.width,mt.height,mt.depth,Rt,Dt,mt.data)}else e.texImage3D(s.TEXTURE_2D_ARRAY,0,Tt,mt.width,mt.height,mt.depth,0,Rt,Dt,mt.data);else if(P.isData3DTexture)q?(_t&&e.texStorage3D(s.TEXTURE_3D,It,Tt,mt.width,mt.height,mt.depth),Mt&&e.texSubImage3D(s.TEXTURE_3D,0,0,0,0,mt.width,mt.height,mt.depth,Rt,Dt,mt.data)):e.texImage3D(s.TEXTURE_3D,0,Tt,mt.width,mt.height,mt.depth,0,Rt,Dt,mt.data);else if(P.isFramebufferTexture){if(_t)if(q)e.texStorage2D(s.TEXTURE_2D,It,Tt,mt.width,mt.height);else{let gt=mt.width,pt=mt.height;for(let Ut=0;Ut<It;Ut++)e.texImage2D(s.TEXTURE_2D,Ut,Tt,gt,pt,0,Rt,Dt,null),gt>>=1,pt>>=1}}else if(qt.length>0){if(q&&_t){let gt=At(qt[0]);e.texStorage2D(s.TEXTURE_2D,It,Tt,gt.width,gt.height)}for(let gt=0,pt=qt.length;gt<pt;gt++)xt=qt[gt],q?Mt&&e.texSubImage2D(s.TEXTURE_2D,gt,0,0,Rt,Dt,xt):e.texImage2D(s.TEXTURE_2D,gt,Tt,Rt,Dt,xt);P.generateMipmaps=!1}else if(q){if(_t){let gt=At(mt);e.texStorage2D(s.TEXTURE_2D,It,Tt,gt.width,gt.height)}Mt&&e.texSubImage2D(s.TEXTURE_2D,0,0,0,Rt,Dt,mt)}else e.texImage2D(s.TEXTURE_2D,0,Tt,Rt,Dt,mt);m(P)&&p(nt),wt.__version=rt.version,P.onUpdate&&P.onUpdate(P)}F.__version=P.version}function it(F,P,$){if(P.image.length!==6)return;let nt=at(F,P),ct=P.source;e.bindTexture(s.TEXTURE_CUBE_MAP,F.__webglTexture,s.TEXTURE0+$);let rt=n.get(ct);if(ct.version!==rt.__version||nt===!0){e.activeTexture(s.TEXTURE0+$);let wt=ie.getPrimaries(ie.workingColorSpace),dt=P.colorSpace===Ji?null:ie.getPrimaries(P.colorSpace),Lt=P.colorSpace===Ji||wt===dt?s.NONE:s.BROWSER_DEFAULT_WEBGL;s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,P.flipY),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,P.premultiplyAlpha),s.pixelStorei(s.UNPACK_ALIGNMENT,P.unpackAlignment),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,Lt);let Ft=P.isCompressedTexture||P.image[0].isCompressedTexture,mt=P.image[0]&&P.image[0].isDataTexture,Rt=[];for(let pt=0;pt<6;pt++)!Ft&&!mt?Rt[pt]=x(P.image[pt],!0,i.maxCubemapSize):Rt[pt]=mt?P.image[pt].image:P.image[pt],Rt[pt]=Bt(P,Rt[pt]);let Dt=Rt[0],Tt=r.convert(P.format,P.colorSpace),xt=r.convert(P.type),qt=v(P.internalFormat,Tt,xt,P.colorSpace),q=P.isVideoTexture!==!0,_t=rt.__version===void 0||nt===!0,Mt=ct.dataReady,It=w(P,Dt);tt(s.TEXTURE_CUBE_MAP,P);let gt;if(Ft){q&&_t&&e.texStorage2D(s.TEXTURE_CUBE_MAP,It,qt,Dt.width,Dt.height);for(let pt=0;pt<6;pt++){gt=Rt[pt].mipmaps;for(let Ut=0;Ut<gt.length;Ut++){let $t=gt[Ut];P.format!==Mn?Tt!==null?q?Mt&&e.compressedTexSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pt,Ut,0,0,$t.width,$t.height,Tt,$t.data):e.compressedTexImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pt,Ut,qt,$t.width,$t.height,0,$t.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):q?Mt&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pt,Ut,0,0,$t.width,$t.height,Tt,xt,$t.data):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pt,Ut,qt,$t.width,$t.height,0,Tt,xt,$t.data)}}}else{if(gt=P.mipmaps,q&&_t){gt.length>0&&It++;let pt=At(Rt[0]);e.texStorage2D(s.TEXTURE_CUBE_MAP,It,qt,pt.width,pt.height)}for(let pt=0;pt<6;pt++)if(mt){q?Mt&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pt,0,0,0,Rt[pt].width,Rt[pt].height,Tt,xt,Rt[pt].data):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pt,0,qt,Rt[pt].width,Rt[pt].height,0,Tt,xt,Rt[pt].data);for(let Ut=0;Ut<gt.length;Ut++){let _e=gt[Ut].image[pt].image;q?Mt&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pt,Ut+1,0,0,_e.width,_e.height,Tt,xt,_e.data):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pt,Ut+1,qt,_e.width,_e.height,0,Tt,xt,_e.data)}}else{q?Mt&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pt,0,0,0,Tt,xt,Rt[pt]):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pt,0,qt,Tt,xt,Rt[pt]);for(let Ut=0;Ut<gt.length;Ut++){let $t=gt[Ut];q?Mt&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pt,Ut+1,0,0,Tt,xt,$t.image[pt]):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pt,Ut+1,qt,Tt,xt,$t.image[pt])}}}m(P)&&p(s.TEXTURE_CUBE_MAP),rt.__version=ct.version,P.onUpdate&&P.onUpdate(P)}F.__version=P.version}function ft(F,P,$,nt,ct,rt){let wt=r.convert($.format,$.colorSpace),dt=r.convert($.type),Lt=v($.internalFormat,wt,dt,$.colorSpace),Ft=n.get(P),mt=n.get($);if(mt.__renderTarget=P,!Ft.__hasExternalTextures){let Rt=Math.max(1,P.width>>rt),Dt=Math.max(1,P.height>>rt);ct===s.TEXTURE_3D||ct===s.TEXTURE_2D_ARRAY?e.texImage3D(ct,rt,Lt,Rt,Dt,P.depth,0,wt,dt,null):e.texImage2D(ct,rt,Lt,Rt,Dt,0,wt,dt,null)}e.bindFramebuffer(s.FRAMEBUFFER,F),Q(P)?a.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,nt,ct,mt.__webglTexture,0,ut(P)):(ct===s.TEXTURE_2D||ct>=s.TEXTURE_CUBE_MAP_POSITIVE_X&&ct<=s.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&s.framebufferTexture2D(s.FRAMEBUFFER,nt,ct,mt.__webglTexture,rt),e.bindFramebuffer(s.FRAMEBUFFER,null)}function bt(F,P,$){if(s.bindRenderbuffer(s.RENDERBUFFER,F),P.depthBuffer){let nt=P.depthTexture,ct=nt&&nt.isDepthTexture?nt.type:null,rt=_(P.stencilBuffer,ct),wt=P.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,dt=ut(P);Q(P)?a.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,dt,rt,P.width,P.height):$?s.renderbufferStorageMultisample(s.RENDERBUFFER,dt,rt,P.width,P.height):s.renderbufferStorage(s.RENDERBUFFER,rt,P.width,P.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,wt,s.RENDERBUFFER,F)}else{let nt=P.textures;for(let ct=0;ct<nt.length;ct++){let rt=nt[ct],wt=r.convert(rt.format,rt.colorSpace),dt=r.convert(rt.type),Lt=v(rt.internalFormat,wt,dt,rt.colorSpace),Ft=ut(P);$&&Q(P)===!1?s.renderbufferStorageMultisample(s.RENDERBUFFER,Ft,Lt,P.width,P.height):Q(P)?a.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,Ft,Lt,P.width,P.height):s.renderbufferStorage(s.RENDERBUFFER,Lt,P.width,P.height)}}s.bindRenderbuffer(s.RENDERBUFFER,null)}function St(F,P){if(P&&P.isWebGLCubeRenderTarget)throw new Error("Depth Texture with cube render targets is not supported");if(e.bindFramebuffer(s.FRAMEBUFFER,F),!(P.depthTexture&&P.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");let nt=n.get(P.depthTexture);nt.__renderTarget=P,(!nt.__webglTexture||P.depthTexture.image.width!==P.width||P.depthTexture.image.height!==P.height)&&(P.depthTexture.image.width=P.width,P.depthTexture.image.height=P.height,P.depthTexture.needsUpdate=!0),I(P.depthTexture,0);let ct=nt.__webglTexture,rt=ut(P);if(P.depthTexture.format===Gr)Q(P)?a.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.TEXTURE_2D,ct,0,rt):s.framebufferTexture2D(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.TEXTURE_2D,ct,0);else if(P.depthTexture.format===ao)Q(P)?a.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,s.DEPTH_STENCIL_ATTACHMENT,s.TEXTURE_2D,ct,0,rt):s.framebufferTexture2D(s.FRAMEBUFFER,s.DEPTH_STENCIL_ATTACHMENT,s.TEXTURE_2D,ct,0);else throw new Error("Unknown depthTexture format")}function zt(F){let P=n.get(F),$=F.isWebGLCubeRenderTarget===!0;if(P.__boundDepthTexture!==F.depthTexture){let nt=F.depthTexture;if(P.__depthDisposeCallback&&P.__depthDisposeCallback(),nt){let ct=()=>{delete P.__boundDepthTexture,delete P.__depthDisposeCallback,nt.removeEventListener("dispose",ct)};nt.addEventListener("dispose",ct),P.__depthDisposeCallback=ct}P.__boundDepthTexture=nt}if(F.depthTexture&&!P.__autoAllocateDepthBuffer){if($)throw new Error("target.depthTexture not supported in Cube render targets");let nt=F.texture.mipmaps;nt&&nt.length>0?St(P.__webglFramebuffer[0],F):St(P.__webglFramebuffer,F)}else if($){P.__webglDepthbuffer=[];for(let nt=0;nt<6;nt++)if(e.bindFramebuffer(s.FRAMEBUFFER,P.__webglFramebuffer[nt]),P.__webglDepthbuffer[nt]===void 0)P.__webglDepthbuffer[nt]=s.createRenderbuffer(),bt(P.__webglDepthbuffer[nt],F,!1);else{let ct=F.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,rt=P.__webglDepthbuffer[nt];s.bindRenderbuffer(s.RENDERBUFFER,rt),s.framebufferRenderbuffer(s.FRAMEBUFFER,ct,s.RENDERBUFFER,rt)}}else{let nt=F.texture.mipmaps;if(nt&&nt.length>0?e.bindFramebuffer(s.FRAMEBUFFER,P.__webglFramebuffer[0]):e.bindFramebuffer(s.FRAMEBUFFER,P.__webglFramebuffer),P.__webglDepthbuffer===void 0)P.__webglDepthbuffer=s.createRenderbuffer(),bt(P.__webglDepthbuffer,F,!1);else{let ct=F.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,rt=P.__webglDepthbuffer;s.bindRenderbuffer(s.RENDERBUFFER,rt),s.framebufferRenderbuffer(s.FRAMEBUFFER,ct,s.RENDERBUFFER,rt)}}e.bindFramebuffer(s.FRAMEBUFFER,null)}function ue(F,P,$){let nt=n.get(F);P!==void 0&&ft(nt.__webglFramebuffer,F,F.texture,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,0),$!==void 0&&zt(F)}function V(F){let P=F.texture,$=n.get(F),nt=n.get(P);F.addEventListener("dispose",R);let ct=F.textures,rt=F.isWebGLCubeRenderTarget===!0,wt=ct.length>1;if(wt||(nt.__webglTexture===void 0&&(nt.__webglTexture=s.createTexture()),nt.__version=P.version,o.memory.textures++),rt){$.__webglFramebuffer=[];for(let dt=0;dt<6;dt++)if(P.mipmaps&&P.mipmaps.length>0){$.__webglFramebuffer[dt]=[];for(let Lt=0;Lt<P.mipmaps.length;Lt++)$.__webglFramebuffer[dt][Lt]=s.createFramebuffer()}else $.__webglFramebuffer[dt]=s.createFramebuffer()}else{if(P.mipmaps&&P.mipmaps.length>0){$.__webglFramebuffer=[];for(let dt=0;dt<P.mipmaps.length;dt++)$.__webglFramebuffer[dt]=s.createFramebuffer()}else $.__webglFramebuffer=s.createFramebuffer();if(wt)for(let dt=0,Lt=ct.length;dt<Lt;dt++){let Ft=n.get(ct[dt]);Ft.__webglTexture===void 0&&(Ft.__webglTexture=s.createTexture(),o.memory.textures++)}if(F.samples>0&&Q(F)===!1){$.__webglMultisampledFramebuffer=s.createFramebuffer(),$.__webglColorRenderbuffer=[],e.bindFramebuffer(s.FRAMEBUFFER,$.__webglMultisampledFramebuffer);for(let dt=0;dt<ct.length;dt++){let Lt=ct[dt];$.__webglColorRenderbuffer[dt]=s.createRenderbuffer(),s.bindRenderbuffer(s.RENDERBUFFER,$.__webglColorRenderbuffer[dt]);let Ft=r.convert(Lt.format,Lt.colorSpace),mt=r.convert(Lt.type),Rt=v(Lt.internalFormat,Ft,mt,Lt.colorSpace,F.isXRRenderTarget===!0),Dt=ut(F);s.renderbufferStorageMultisample(s.RENDERBUFFER,Dt,Rt,F.width,F.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+dt,s.RENDERBUFFER,$.__webglColorRenderbuffer[dt])}s.bindRenderbuffer(s.RENDERBUFFER,null),F.depthBuffer&&($.__webglDepthRenderbuffer=s.createRenderbuffer(),bt($.__webglDepthRenderbuffer,F,!0)),e.bindFramebuffer(s.FRAMEBUFFER,null)}}if(rt){e.bindTexture(s.TEXTURE_CUBE_MAP,nt.__webglTexture),tt(s.TEXTURE_CUBE_MAP,P);for(let dt=0;dt<6;dt++)if(P.mipmaps&&P.mipmaps.length>0)for(let Lt=0;Lt<P.mipmaps.length;Lt++)ft($.__webglFramebuffer[dt][Lt],F,P,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+dt,Lt);else ft($.__webglFramebuffer[dt],F,P,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+dt,0);m(P)&&p(s.TEXTURE_CUBE_MAP),e.unbindTexture()}else if(wt){for(let dt=0,Lt=ct.length;dt<Lt;dt++){let Ft=ct[dt],mt=n.get(Ft),Rt=s.TEXTURE_2D;(F.isWebGL3DRenderTarget||F.isWebGLArrayRenderTarget)&&(Rt=F.isWebGL3DRenderTarget?s.TEXTURE_3D:s.TEXTURE_2D_ARRAY),e.bindTexture(Rt,mt.__webglTexture),tt(Rt,Ft),ft($.__webglFramebuffer,F,Ft,s.COLOR_ATTACHMENT0+dt,Rt,0),m(Ft)&&p(Rt)}e.unbindTexture()}else{let dt=s.TEXTURE_2D;if((F.isWebGL3DRenderTarget||F.isWebGLArrayRenderTarget)&&(dt=F.isWebGL3DRenderTarget?s.TEXTURE_3D:s.TEXTURE_2D_ARRAY),e.bindTexture(dt,nt.__webglTexture),tt(dt,P),P.mipmaps&&P.mipmaps.length>0)for(let Lt=0;Lt<P.mipmaps.length;Lt++)ft($.__webglFramebuffer[Lt],F,P,s.COLOR_ATTACHMENT0,dt,Lt);else ft($.__webglFramebuffer,F,P,s.COLOR_ATTACHMENT0,dt,0);m(P)&&p(dt),e.unbindTexture()}F.depthBuffer&&zt(F)}function Qt(F){let P=F.textures;for(let $=0,nt=P.length;$<nt;$++){let ct=P[$];if(m(ct)){let rt=y(F),wt=n.get(ct).__webglTexture;e.bindTexture(rt,wt),p(rt),e.unbindTexture()}}}let D=[],E=[];function H(F){if(F.samples>0){if(Q(F)===!1){let P=F.textures,$=F.width,nt=F.height,ct=s.COLOR_BUFFER_BIT,rt=F.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,wt=n.get(F),dt=P.length>1;if(dt)for(let Ft=0;Ft<P.length;Ft++)e.bindFramebuffer(s.FRAMEBUFFER,wt.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+Ft,s.RENDERBUFFER,null),e.bindFramebuffer(s.FRAMEBUFFER,wt.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+Ft,s.TEXTURE_2D,null,0);e.bindFramebuffer(s.READ_FRAMEBUFFER,wt.__webglMultisampledFramebuffer);let Lt=F.texture.mipmaps;Lt&&Lt.length>0?e.bindFramebuffer(s.DRAW_FRAMEBUFFER,wt.__webglFramebuffer[0]):e.bindFramebuffer(s.DRAW_FRAMEBUFFER,wt.__webglFramebuffer);for(let Ft=0;Ft<P.length;Ft++){if(F.resolveDepthBuffer&&(F.depthBuffer&&(ct|=s.DEPTH_BUFFER_BIT),F.stencilBuffer&&F.resolveStencilBuffer&&(ct|=s.STENCIL_BUFFER_BIT)),dt){s.framebufferRenderbuffer(s.READ_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.RENDERBUFFER,wt.__webglColorRenderbuffer[Ft]);let mt=n.get(P[Ft]).__webglTexture;s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,mt,0)}s.blitFramebuffer(0,0,$,nt,0,0,$,nt,ct,s.NEAREST),c===!0&&(D.length=0,E.length=0,D.push(s.COLOR_ATTACHMENT0+Ft),F.depthBuffer&&F.resolveDepthBuffer===!1&&(D.push(rt),E.push(rt),s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,E)),s.invalidateFramebuffer(s.READ_FRAMEBUFFER,D))}if(e.bindFramebuffer(s.READ_FRAMEBUFFER,null),e.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),dt)for(let Ft=0;Ft<P.length;Ft++){e.bindFramebuffer(s.FRAMEBUFFER,wt.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+Ft,s.RENDERBUFFER,wt.__webglColorRenderbuffer[Ft]);let mt=n.get(P[Ft]).__webglTexture;e.bindFramebuffer(s.FRAMEBUFFER,wt.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+Ft,s.TEXTURE_2D,mt,0)}e.bindFramebuffer(s.DRAW_FRAMEBUFFER,wt.__webglMultisampledFramebuffer)}else if(F.depthBuffer&&F.resolveDepthBuffer===!1&&c){let P=F.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT;s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,[P])}}}function ut(F){return Math.min(i.maxSamples,F.samples)}function Q(F){let P=n.get(F);return F.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&P.__useRenderToTexture!==!1}function yt(F){let P=o.render.frame;h.get(F)!==P&&(h.set(F,P),F.update())}function Bt(F,P){let $=F.colorSpace,nt=F.format,ct=F.type;return F.isCompressedTexture===!0||F.isVideoTexture===!0||$!==We&&$!==Ji&&(ie.getTransfer($)===Se?(nt!==Mn||ct!==fi)&&console.warn("THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):console.error("THREE.WebGLTextures: Unsupported texture color space:",$)),P}function At(F){return typeof HTMLImageElement<"u"&&F instanceof HTMLImageElement?(l.width=F.naturalWidth||F.width,l.height=F.naturalHeight||F.height):typeof VideoFrame<"u"&&F instanceof VideoFrame?(l.width=F.displayWidth,l.height=F.displayHeight):(l.width=F.width,l.height=F.height),l}this.allocateTextureUnit=N,this.resetTextureUnits=A,this.setTexture2D=I,this.setTexture2DArray=O,this.setTexture3D=k,this.setTextureCube=z,this.rebindTextures=ue,this.setupRenderTarget=V,this.updateRenderTargetMipmap=Qt,this.updateMultisampleRenderTarget=H,this.setupDepthRenderbuffer=zt,this.setupFrameBufferTexture=ft,this.useMultisampledRTT=Q}function Tb(s,t){function e(n,i=Ji){let r,o=ie.getTransfer(i);if(n===fi)return s.UNSIGNED_BYTE;if(n===bl)return s.UNSIGNED_SHORT_4_4_4_4;if(n===wl)return s.UNSIGNED_SHORT_5_5_5_1;if(n===Mf)return s.UNSIGNED_INT_5_9_9_9_REV;if(n===bf)return s.UNSIGNED_INT_10F_11F_11F_REV;if(n===vf)return s.BYTE;if(n===Sf)return s.SHORT;if(n===ro)return s.UNSIGNED_SHORT;if(n===Ml)return s.INT;if(n===ms)return s.UNSIGNED_INT;if(n===$n)return s.FLOAT;if(n===Yi)return s.HALF_FLOAT;if(n===wf)return s.ALPHA;if(n===Ef)return s.RGB;if(n===Mn)return s.RGBA;if(n===Gr)return s.DEPTH_COMPONENT;if(n===ao)return s.DEPTH_STENCIL;if(n===El)return s.RED;if(n===Tl)return s.RED_INTEGER;if(n===Tf)return s.RG;if(n===Al)return s.RG_INTEGER;if(n===Rl)return s.RGBA_INTEGER;if(n===Ca||n===Ia||n===Pa||n===La)if(o===Se)if(r=t.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===Ca)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===Ia)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===Pa)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===La)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=t.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===Ca)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===Ia)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===Pa)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===La)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===Cl||n===Il||n===Pl||n===Ll)if(r=t.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===Cl)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===Il)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===Pl)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===Ll)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===Nl||n===Dl||n===Ol)if(r=t.get("WEBGL_compressed_texture_etc"),r!==null){if(n===Nl||n===Dl)return o===Se?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===Ol)return o===Se?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC}else return null;if(n===Ul||n===Fl||n===Bl||n===zl||n===kl||n===Hl||n===Vl||n===Gl||n===Wl||n===Xl||n===ql||n===$l||n===Yl||n===Jl)if(r=t.get("WEBGL_compressed_texture_astc"),r!==null){if(n===Ul)return o===Se?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===Fl)return o===Se?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===Bl)return o===Se?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===zl)return o===Se?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===kl)return o===Se?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===Hl)return o===Se?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===Vl)return o===Se?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===Gl)return o===Se?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===Wl)return o===Se?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===Xl)return o===Se?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===ql)return o===Se?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===$l)return o===Se?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===Yl)return o===Se?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===Jl)return o===Se?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===Kl||n===Zl||n===jl)if(r=t.get("EXT_texture_compression_bptc"),r!==null){if(n===Kl)return o===Se?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===Zl)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===jl)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===Ql||n===th||n===eh||n===nh)if(r=t.get("EXT_texture_compression_rgtc"),r!==null){if(n===Ql)return r.COMPRESSED_RED_RGTC1_EXT;if(n===th)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===eh)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===nh)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===oo?s.UNSIGNED_INT_24_8:s[n]!==void 0?s[n]:null}return{convert:e}}var Ab=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,Rb=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,Zf=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(t,e){if(this.texture===null){let n=new ga(t.texture);(t.depthNear!==e.depthNear||t.depthFar!==e.depthFar)&&(this.depthNear=t.depthNear,this.depthFar=t.depthFar),this.texture=n}}getMesh(t){if(this.texture!==null&&this.mesh===null){let e=t.cameras[0].viewport,n=new Sn({vertexShader:Ab,fragmentShader:Rb,uniforms:{depthColor:{value:this.texture},depthWidth:{value:e.z},depthHeight:{value:e.w}}});this.mesh=new pe(new bi(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},jf=class extends Hi{constructor(t,e){super();let n=this,i=null,r=1,o=null,a="local-floor",c=1,l=null,h=null,u=null,f=null,d=null,g=null,x=typeof XRWebGLBinding<"u",m=new Zf,p={},y=e.getContextAttributes(),v=null,_=null,w=[],T=[],R=new Ht,L=null,S=new He;S.viewport=new de;let M=new He;M.viewport=new de;let b=[S,M],A=new hl,N=null,C=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(J){let it=w[J];return it===void 0&&(it=new Jr,w[J]=it),it.getTargetRaySpace()},this.getControllerGrip=function(J){let it=w[J];return it===void 0&&(it=new Jr,w[J]=it),it.getGripSpace()},this.getHand=function(J){let it=w[J];return it===void 0&&(it=new Jr,w[J]=it),it.getHandSpace()};function I(J){let it=T.indexOf(J.inputSource);if(it===-1)return;let ft=w[it];ft!==void 0&&(ft.update(J.inputSource,J.frame,l||o),ft.dispatchEvent({type:J.type,data:J.inputSource}))}function O(){i.removeEventListener("select",I),i.removeEventListener("selectstart",I),i.removeEventListener("selectend",I),i.removeEventListener("squeeze",I),i.removeEventListener("squeezestart",I),i.removeEventListener("squeezeend",I),i.removeEventListener("end",O),i.removeEventListener("inputsourceschange",k);for(let J=0;J<w.length;J++){let it=T[J];it!==null&&(T[J]=null,w[J].disconnect(it))}N=null,C=null,m.reset();for(let J in p)delete p[J];t.setRenderTarget(v),d=null,f=null,u=null,i=null,_=null,ot.stop(),n.isPresenting=!1,t.setPixelRatio(L),t.setSize(R.width,R.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(J){r=J,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(J){a=J,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return l||o},this.setReferenceSpace=function(J){l=J},this.getBaseLayer=function(){return f!==null?f:d},this.getBinding=function(){return u===null&&x&&(u=new XRWebGLBinding(i,e)),u},this.getFrame=function(){return g},this.getSession=function(){return i},this.setSession=async function(J){if(i=J,i!==null){if(v=t.getRenderTarget(),i.addEventListener("select",I),i.addEventListener("selectstart",I),i.addEventListener("selectend",I),i.addEventListener("squeeze",I),i.addEventListener("squeezestart",I),i.addEventListener("squeezeend",I),i.addEventListener("end",O),i.addEventListener("inputsourceschange",k),y.xrCompatible!==!0&&await e.makeXRCompatible(),L=t.getPixelRatio(),t.getSize(R),x&&"createProjectionLayer"in XRWebGLBinding.prototype){let ft=null,bt=null,St=null;y.depth&&(St=y.stencil?e.DEPTH24_STENCIL8:e.DEPTH_COMPONENT24,ft=y.stencil?ao:Gr,bt=y.stencil?oo:ms);let zt={colorFormat:e.RGBA8,depthFormat:St,scaleFactor:r};u=this.getBinding(),f=u.createProjectionLayer(zt),i.updateRenderState({layers:[f]}),t.setPixelRatio(1),t.setSize(f.textureWidth,f.textureHeight,!1),_=new qn(f.textureWidth,f.textureHeight,{format:Mn,type:fi,depthTexture:new ma(f.textureWidth,f.textureHeight,bt,void 0,void 0,void 0,void 0,void 0,void 0,ft),stencilBuffer:y.stencil,colorSpace:t.outputColorSpace,samples:y.antialias?4:0,resolveDepthBuffer:f.ignoreDepthValues===!1,resolveStencilBuffer:f.ignoreDepthValues===!1})}else{let ft={antialias:y.antialias,alpha:!0,depth:y.depth,stencil:y.stencil,framebufferScaleFactor:r};d=new XRWebGLLayer(i,e,ft),i.updateRenderState({baseLayer:d}),t.setPixelRatio(1),t.setSize(d.framebufferWidth,d.framebufferHeight,!1),_=new qn(d.framebufferWidth,d.framebufferHeight,{format:Mn,type:fi,colorSpace:t.outputColorSpace,stencilBuffer:y.stencil,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1})}_.isXRRenderTarget=!0,this.setFoveation(c),l=null,o=await i.requestReferenceSpace(a),ot.setContext(i),ot.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(i!==null)return i.environmentBlendMode},this.getDepthTexture=function(){return m.getDepthTexture()};function k(J){for(let it=0;it<J.removed.length;it++){let ft=J.removed[it],bt=T.indexOf(ft);bt>=0&&(T[bt]=null,w[bt].disconnect(ft))}for(let it=0;it<J.added.length;it++){let ft=J.added[it],bt=T.indexOf(ft);if(bt===-1){for(let zt=0;zt<w.length;zt++)if(zt>=T.length){T.push(ft),bt=zt;break}else if(T[zt]===null){T[zt]=ft,bt=zt;break}if(bt===-1)break}let St=w[bt];St&&St.connect(ft)}}let z=new B,et=new B;function j(J,it,ft){z.setFromMatrixPosition(it.matrixWorld),et.setFromMatrixPosition(ft.matrixWorld);let bt=z.distanceTo(et),St=it.projectionMatrix.elements,zt=ft.projectionMatrix.elements,ue=St[14]/(St[10]-1),V=St[14]/(St[10]+1),Qt=(St[9]+1)/St[5],D=(St[9]-1)/St[5],E=(St[8]-1)/St[0],H=(zt[8]+1)/zt[0],ut=ue*E,Q=ue*H,yt=bt/(-E+H),Bt=yt*-E;if(it.matrixWorld.decompose(J.position,J.quaternion,J.scale),J.translateX(Bt),J.translateZ(yt),J.matrixWorld.compose(J.position,J.quaternion,J.scale),J.matrixWorldInverse.copy(J.matrixWorld).invert(),St[10]===-1)J.projectionMatrix.copy(it.projectionMatrix),J.projectionMatrixInverse.copy(it.projectionMatrixInverse);else{let At=ue+yt,F=V+yt,P=ut-Bt,$=Q+(bt-Bt),nt=Qt*V/F*At,ct=D*V/F*At;J.projectionMatrix.makePerspective(P,$,nt,ct,At,F),J.projectionMatrixInverse.copy(J.projectionMatrix).invert()}}function W(J,it){it===null?J.matrixWorld.copy(J.matrix):J.matrixWorld.multiplyMatrices(it.matrixWorld,J.matrix),J.matrixWorldInverse.copy(J.matrixWorld).invert()}this.updateCamera=function(J){if(i===null)return;let it=J.near,ft=J.far;m.texture!==null&&(m.depthNear>0&&(it=m.depthNear),m.depthFar>0&&(ft=m.depthFar)),A.near=M.near=S.near=it,A.far=M.far=S.far=ft,(N!==A.near||C!==A.far)&&(i.updateRenderState({depthNear:A.near,depthFar:A.far}),N=A.near,C=A.far),A.layers.mask=J.layers.mask|6,S.layers.mask=A.layers.mask&3,M.layers.mask=A.layers.mask&5;let bt=J.parent,St=A.cameras;W(A,bt);for(let zt=0;zt<St.length;zt++)W(St[zt],bt);St.length===2?j(A,S,M):A.projectionMatrix.copy(S.projectionMatrix),tt(J,A,bt)};function tt(J,it,ft){ft===null?J.matrix.copy(it.matrixWorld):(J.matrix.copy(ft.matrixWorld),J.matrix.invert(),J.matrix.multiply(it.matrixWorld)),J.matrix.decompose(J.position,J.quaternion,J.scale),J.updateMatrixWorld(!0),J.projectionMatrix.copy(it.projectionMatrix),J.projectionMatrixInverse.copy(it.projectionMatrixInverse),J.isPerspectiveCamera&&(J.fov=Vs*2*Math.atan(1/J.projectionMatrix.elements[5]),J.zoom=1)}this.getCamera=function(){return A},this.getFoveation=function(){if(!(f===null&&d===null))return c},this.setFoveation=function(J){c=J,f!==null&&(f.fixedFoveation=J),d!==null&&d.fixedFoveation!==void 0&&(d.fixedFoveation=J)},this.hasDepthSensing=function(){return m.texture!==null},this.getDepthSensingMesh=function(){return m.getMesh(A)},this.getCameraTexture=function(J){return p[J]};let at=null;function st(J,it){if(h=it.getViewerPose(l||o),g=it,h!==null){let ft=h.views;d!==null&&(t.setRenderTargetFramebuffer(_,d.framebuffer),t.setRenderTarget(_));let bt=!1;ft.length!==A.cameras.length&&(A.cameras.length=0,bt=!0);for(let V=0;V<ft.length;V++){let Qt=ft[V],D=null;if(d!==null)D=d.getViewport(Qt);else{let H=u.getViewSubImage(f,Qt);D=H.viewport,V===0&&(t.setRenderTargetTextures(_,H.colorTexture,H.depthStencilTexture),t.setRenderTarget(_))}let E=b[V];E===void 0&&(E=new He,E.layers.enable(V),E.viewport=new de,b[V]=E),E.matrix.fromArray(Qt.transform.matrix),E.matrix.decompose(E.position,E.quaternion,E.scale),E.projectionMatrix.fromArray(Qt.projectionMatrix),E.projectionMatrixInverse.copy(E.projectionMatrix).invert(),E.viewport.set(D.x,D.y,D.width,D.height),V===0&&(A.matrix.copy(E.matrix),A.matrix.decompose(A.position,A.quaternion,A.scale)),bt===!0&&A.cameras.push(E)}let St=i.enabledFeatures;if(St&&St.includes("depth-sensing")&&i.depthUsage=="gpu-optimized"&&x){u=n.getBinding();let V=u.getDepthInformation(ft[0]);V&&V.isValid&&V.texture&&m.init(V,i.renderState)}if(St&&St.includes("camera-access")&&x){t.state.unbindTexture(),u=n.getBinding();for(let V=0;V<ft.length;V++){let Qt=ft[V].camera;if(Qt){let D=p[Qt];D||(D=new ga,p[Qt]=D);let E=u.getCameraImage(Qt);D.sourceTexture=E}}}}for(let ft=0;ft<w.length;ft++){let bt=T[ft],St=w[ft];bt!==null&&St!==void 0&&St.update(bt,it,l||o)}at&&at(J,it),it.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:it}),g=null}let ot=new x0;ot.setAnimationLoop(st),this.setAnimationLoop=function(J){at=J},this.dispose=function(){}}},nr=new pn,Cb=new Pt;function Ib(s,t){function e(m,p){m.matrixAutoUpdate===!0&&m.updateMatrix(),p.value.copy(m.matrix)}function n(m,p){p.color.getRGB(m.fogColor.value,Df(s)),p.isFog?(m.fogNear.value=p.near,m.fogFar.value=p.far):p.isFogExp2&&(m.fogDensity.value=p.density)}function i(m,p,y,v,_){p.isMeshBasicMaterial||p.isMeshLambertMaterial?r(m,p):p.isMeshToonMaterial?(r(m,p),u(m,p)):p.isMeshPhongMaterial?(r(m,p),h(m,p)):p.isMeshStandardMaterial?(r(m,p),f(m,p),p.isMeshPhysicalMaterial&&d(m,p,_)):p.isMeshMatcapMaterial?(r(m,p),g(m,p)):p.isMeshDepthMaterial?r(m,p):p.isMeshDistanceMaterial?(r(m,p),x(m,p)):p.isMeshNormalMaterial?r(m,p):p.isLineBasicMaterial?(o(m,p),p.isLineDashedMaterial&&a(m,p)):p.isPointsMaterial?c(m,p,y,v):p.isSpriteMaterial?l(m,p):p.isShadowMaterial?(m.color.value.copy(p.color),m.opacity.value=p.opacity):p.isShaderMaterial&&(p.uniformsNeedUpdate=!1)}function r(m,p){m.opacity.value=p.opacity,p.color&&m.diffuse.value.copy(p.color),p.emissive&&m.emissive.value.copy(p.emissive).multiplyScalar(p.emissiveIntensity),p.map&&(m.map.value=p.map,e(p.map,m.mapTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,e(p.alphaMap,m.alphaMapTransform)),p.bumpMap&&(m.bumpMap.value=p.bumpMap,e(p.bumpMap,m.bumpMapTransform),m.bumpScale.value=p.bumpScale,p.side===nn&&(m.bumpScale.value*=-1)),p.normalMap&&(m.normalMap.value=p.normalMap,e(p.normalMap,m.normalMapTransform),m.normalScale.value.copy(p.normalScale),p.side===nn&&m.normalScale.value.negate()),p.displacementMap&&(m.displacementMap.value=p.displacementMap,e(p.displacementMap,m.displacementMapTransform),m.displacementScale.value=p.displacementScale,m.displacementBias.value=p.displacementBias),p.emissiveMap&&(m.emissiveMap.value=p.emissiveMap,e(p.emissiveMap,m.emissiveMapTransform)),p.specularMap&&(m.specularMap.value=p.specularMap,e(p.specularMap,m.specularMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest);let y=t.get(p),v=y.envMap,_=y.envMapRotation;v&&(m.envMap.value=v,nr.copy(_),nr.x*=-1,nr.y*=-1,nr.z*=-1,v.isCubeTexture&&v.isRenderTargetTexture===!1&&(nr.y*=-1,nr.z*=-1),m.envMapRotation.value.setFromMatrix4(Cb.makeRotationFromEuler(nr)),m.flipEnvMap.value=v.isCubeTexture&&v.isRenderTargetTexture===!1?-1:1,m.reflectivity.value=p.reflectivity,m.ior.value=p.ior,m.refractionRatio.value=p.refractionRatio),p.lightMap&&(m.lightMap.value=p.lightMap,m.lightMapIntensity.value=p.lightMapIntensity,e(p.lightMap,m.lightMapTransform)),p.aoMap&&(m.aoMap.value=p.aoMap,m.aoMapIntensity.value=p.aoMapIntensity,e(p.aoMap,m.aoMapTransform))}function o(m,p){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,p.map&&(m.map.value=p.map,e(p.map,m.mapTransform))}function a(m,p){m.dashSize.value=p.dashSize,m.totalSize.value=p.dashSize+p.gapSize,m.scale.value=p.scale}function c(m,p,y,v){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,m.size.value=p.size*y,m.scale.value=v*.5,p.map&&(m.map.value=p.map,e(p.map,m.uvTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,e(p.alphaMap,m.alphaMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest)}function l(m,p){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,m.rotation.value=p.rotation,p.map&&(m.map.value=p.map,e(p.map,m.mapTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,e(p.alphaMap,m.alphaMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest)}function h(m,p){m.specular.value.copy(p.specular),m.shininess.value=Math.max(p.shininess,1e-4)}function u(m,p){p.gradientMap&&(m.gradientMap.value=p.gradientMap)}function f(m,p){m.metalness.value=p.metalness,p.metalnessMap&&(m.metalnessMap.value=p.metalnessMap,e(p.metalnessMap,m.metalnessMapTransform)),m.roughness.value=p.roughness,p.roughnessMap&&(m.roughnessMap.value=p.roughnessMap,e(p.roughnessMap,m.roughnessMapTransform)),p.envMap&&(m.envMapIntensity.value=p.envMapIntensity)}function d(m,p,y){m.ior.value=p.ior,p.sheen>0&&(m.sheenColor.value.copy(p.sheenColor).multiplyScalar(p.sheen),m.sheenRoughness.value=p.sheenRoughness,p.sheenColorMap&&(m.sheenColorMap.value=p.sheenColorMap,e(p.sheenColorMap,m.sheenColorMapTransform)),p.sheenRoughnessMap&&(m.sheenRoughnessMap.value=p.sheenRoughnessMap,e(p.sheenRoughnessMap,m.sheenRoughnessMapTransform))),p.clearcoat>0&&(m.clearcoat.value=p.clearcoat,m.clearcoatRoughness.value=p.clearcoatRoughness,p.clearcoatMap&&(m.clearcoatMap.value=p.clearcoatMap,e(p.clearcoatMap,m.clearcoatMapTransform)),p.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=p.clearcoatRoughnessMap,e(p.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),p.clearcoatNormalMap&&(m.clearcoatNormalMap.value=p.clearcoatNormalMap,e(p.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(p.clearcoatNormalScale),p.side===nn&&m.clearcoatNormalScale.value.negate())),p.dispersion>0&&(m.dispersion.value=p.dispersion),p.iridescence>0&&(m.iridescence.value=p.iridescence,m.iridescenceIOR.value=p.iridescenceIOR,m.iridescenceThicknessMinimum.value=p.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=p.iridescenceThicknessRange[1],p.iridescenceMap&&(m.iridescenceMap.value=p.iridescenceMap,e(p.iridescenceMap,m.iridescenceMapTransform)),p.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=p.iridescenceThicknessMap,e(p.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),p.transmission>0&&(m.transmission.value=p.transmission,m.transmissionSamplerMap.value=y.texture,m.transmissionSamplerSize.value.set(y.width,y.height),p.transmissionMap&&(m.transmissionMap.value=p.transmissionMap,e(p.transmissionMap,m.transmissionMapTransform)),m.thickness.value=p.thickness,p.thicknessMap&&(m.thicknessMap.value=p.thicknessMap,e(p.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=p.attenuationDistance,m.attenuationColor.value.copy(p.attenuationColor)),p.anisotropy>0&&(m.anisotropyVector.value.set(p.anisotropy*Math.cos(p.anisotropyRotation),p.anisotropy*Math.sin(p.anisotropyRotation)),p.anisotropyMap&&(m.anisotropyMap.value=p.anisotropyMap,e(p.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=p.specularIntensity,m.specularColor.value.copy(p.specularColor),p.specularColorMap&&(m.specularColorMap.value=p.specularColorMap,e(p.specularColorMap,m.specularColorMapTransform)),p.specularIntensityMap&&(m.specularIntensityMap.value=p.specularIntensityMap,e(p.specularIntensityMap,m.specularIntensityMapTransform))}function g(m,p){p.matcap&&(m.matcap.value=p.matcap)}function x(m,p){let y=t.get(p).light;m.referencePosition.value.setFromMatrixPosition(y.matrixWorld),m.nearDistance.value=y.shadow.camera.near,m.farDistance.value=y.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:i}}function Pb(s,t,e,n){let i={},r={},o=[],a=s.getParameter(s.MAX_UNIFORM_BUFFER_BINDINGS);function c(y,v){let _=v.program;n.uniformBlockBinding(y,_)}function l(y,v){let _=i[y.id];_===void 0&&(g(y),_=h(y),i[y.id]=_,y.addEventListener("dispose",m));let w=v.program;n.updateUBOMapping(y,w);let T=t.render.frame;r[y.id]!==T&&(f(y),r[y.id]=T)}function h(y){let v=u();y.__bindingPointIndex=v;let _=s.createBuffer(),w=y.__size,T=y.usage;return s.bindBuffer(s.UNIFORM_BUFFER,_),s.bufferData(s.UNIFORM_BUFFER,w,T),s.bindBuffer(s.UNIFORM_BUFFER,null),s.bindBufferBase(s.UNIFORM_BUFFER,v,_),_}function u(){for(let y=0;y<a;y++)if(o.indexOf(y)===-1)return o.push(y),y;return console.error("THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function f(y){let v=i[y.id],_=y.uniforms,w=y.__cache;s.bindBuffer(s.UNIFORM_BUFFER,v);for(let T=0,R=_.length;T<R;T++){let L=Array.isArray(_[T])?_[T]:[_[T]];for(let S=0,M=L.length;S<M;S++){let b=L[S];if(d(b,T,S,w)===!0){let A=b.__offset,N=Array.isArray(b.value)?b.value:[b.value],C=0;for(let I=0;I<N.length;I++){let O=N[I],k=x(O);typeof O=="number"||typeof O=="boolean"?(b.__data[0]=O,s.bufferSubData(s.UNIFORM_BUFFER,A+C,b.__data)):O.isMatrix3?(b.__data[0]=O.elements[0],b.__data[1]=O.elements[1],b.__data[2]=O.elements[2],b.__data[3]=0,b.__data[4]=O.elements[3],b.__data[5]=O.elements[4],b.__data[6]=O.elements[5],b.__data[7]=0,b.__data[8]=O.elements[6],b.__data[9]=O.elements[7],b.__data[10]=O.elements[8],b.__data[11]=0):(O.toArray(b.__data,C),C+=k.storage/Float32Array.BYTES_PER_ELEMENT)}s.bufferSubData(s.UNIFORM_BUFFER,A,b.__data)}}}s.bindBuffer(s.UNIFORM_BUFFER,null)}function d(y,v,_,w){let T=y.value,R=v+"_"+_;if(w[R]===void 0)return typeof T=="number"||typeof T=="boolean"?w[R]=T:w[R]=T.clone(),!0;{let L=w[R];if(typeof T=="number"||typeof T=="boolean"){if(L!==T)return w[R]=T,!0}else if(L.equals(T)===!1)return L.copy(T),!0}return!1}function g(y){let v=y.uniforms,_=0,w=16;for(let R=0,L=v.length;R<L;R++){let S=Array.isArray(v[R])?v[R]:[v[R]];for(let M=0,b=S.length;M<b;M++){let A=S[M],N=Array.isArray(A.value)?A.value:[A.value];for(let C=0,I=N.length;C<I;C++){let O=N[C],k=x(O),z=_%w,et=z%k.boundary,j=z+et;_+=et,j!==0&&w-j<k.storage&&(_+=w-j),A.__data=new Float32Array(k.storage/Float32Array.BYTES_PER_ELEMENT),A.__offset=_,_+=k.storage}}}let T=_%w;return T>0&&(_+=w-T),y.__size=_,y.__cache={},this}function x(y){let v={boundary:0,storage:0};return typeof y=="number"||typeof y=="boolean"?(v.boundary=4,v.storage=4):y.isVector2?(v.boundary=8,v.storage=8):y.isVector3||y.isColor?(v.boundary=16,v.storage=12):y.isVector4?(v.boundary=16,v.storage=16):y.isMatrix3?(v.boundary=48,v.storage=48):y.isMatrix4?(v.boundary=64,v.storage=64):y.isTexture?console.warn("THREE.WebGLRenderer: Texture samplers can not be part of an uniforms group."):console.warn("THREE.WebGLRenderer: Unsupported uniform value type.",y),v}function m(y){let v=y.target;v.removeEventListener("dispose",m);let _=o.indexOf(v.__bindingPointIndex);o.splice(_,1),s.deleteBuffer(i[v.id]),delete i[v.id],delete r[v.id]}function p(){for(let y in i)s.deleteBuffer(i[y]);o=[],i={},r={}}return{bind:c,update:l,dispose:p}}var ah=class{constructor(t={}){let{canvas:e=Vg(),context:n=null,depth:i=!0,stencil:r=!1,alpha:o=!1,antialias:a=!1,premultipliedAlpha:c=!0,preserveDrawingBuffer:l=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:u=!1,reversedDepthBuffer:f=!1}=t;this.isWebGLRenderer=!0;let d;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");d=n.getContextAttributes().alpha}else d=o;let g=new Uint32Array(4),x=new Int32Array(4),m=null,p=null,y=[],v=[];this.domElement=e,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=$i,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let _=this,w=!1;this._outputColorSpace=ze;let T=0,R=0,L=null,S=-1,M=null,b=new de,A=new de,N=null,C=new Et(0),I=0,O=e.width,k=e.height,z=1,et=null,j=null,W=new de(0,0,O,k),tt=new de(0,0,O,k),at=!1,st=new Qr,ot=!1,J=!1,it=new Pt,ft=new B,bt=new de,St={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},zt=!1;function ue(){return L===null?z:1}let V=n;function Qt(U,K){return e.getContext(U,K)}try{let U={alpha:!0,depth:i,stencil:r,antialias:a,premultipliedAlpha:c,preserveDrawingBuffer:l,powerPreference:h,failIfMajorPerformanceCaveat:u};if("setAttribute"in e&&e.setAttribute("data-engine",`three.js r${"180"}`),e.addEventListener("webglcontextlost",Mt,!1),e.addEventListener("webglcontextrestored",It,!1),e.addEventListener("webglcontextcreationerror",gt,!1),V===null){let K="webgl2";if(V=Qt(K,U),V===null)throw Qt(K)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}}catch(U){throw console.error("THREE.WebGLRenderer: "+U.message),U}let D,E,H,ut,Q,yt,Bt,At,F,P,$,nt,ct,rt,wt,dt,Lt,Ft,mt,Rt,Dt,Tt,xt,qt;function q(){D=new JM(V),D.init(),Tt=new Tb(V,D),E=new VM(V,D,t,Tt),H=new wb(V,D),E.reversedDepthBuffer&&f&&H.buffers.depth.setReversed(!0),ut=new jM(V),Q=new ub,yt=new Eb(V,D,H,Q,E,Tt,ut),Bt=new WM(_),At=new YM(_),F=new sv(V),xt=new kM(V,F),P=new KM(V,F,ut,xt),$=new t1(V,P,F,ut),mt=new QM(V,E,yt),dt=new GM(Q),nt=new hb(_,Bt,At,D,E,xt,dt),ct=new Ib(_,Q),rt=new db,wt=new _b(D),Ft=new zM(_,Bt,At,H,$,d,c),Lt=new Mb(_,$,E),qt=new Pb(V,ut,E,H),Rt=new HM(V,D,ut),Dt=new ZM(V,D,ut),ut.programs=nt.programs,_.capabilities=E,_.extensions=D,_.properties=Q,_.renderLists=rt,_.shadowMap=Lt,_.state=H,_.info=ut}q();let _t=new jf(_,V);this.xr=_t,this.getContext=function(){return V},this.getContextAttributes=function(){return V.getContextAttributes()},this.forceContextLoss=function(){let U=D.get("WEBGL_lose_context");U&&U.loseContext()},this.forceContextRestore=function(){let U=D.get("WEBGL_lose_context");U&&U.restoreContext()},this.getPixelRatio=function(){return z},this.setPixelRatio=function(U){U!==void 0&&(z=U,this.setSize(O,k,!1))},this.getSize=function(U){return U.set(O,k)},this.setSize=function(U,K,G=!0){if(_t.isPresenting){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}O=U,k=K,e.width=Math.floor(U*z),e.height=Math.floor(K*z),G===!0&&(e.style.width=U+"px",e.style.height=K+"px"),this.setViewport(0,0,U,K)},this.getDrawingBufferSize=function(U){return U.set(O*z,k*z).floor()},this.setDrawingBufferSize=function(U,K,G){O=U,k=K,z=G,e.width=Math.floor(U*G),e.height=Math.floor(K*G),this.setViewport(0,0,U,K)},this.getCurrentViewport=function(U){return U.copy(b)},this.getViewport=function(U){return U.copy(W)},this.setViewport=function(U,K,G,Z){U.isVector4?W.set(U.x,U.y,U.z,U.w):W.set(U,K,G,Z),H.viewport(b.copy(W).multiplyScalar(z).round())},this.getScissor=function(U){return U.copy(tt)},this.setScissor=function(U,K,G,Z){U.isVector4?tt.set(U.x,U.y,U.z,U.w):tt.set(U,K,G,Z),H.scissor(A.copy(tt).multiplyScalar(z).round())},this.getScissorTest=function(){return at},this.setScissorTest=function(U){H.setScissorTest(at=U)},this.setOpaqueSort=function(U){et=U},this.setTransparentSort=function(U){j=U},this.getClearColor=function(U){return U.copy(Ft.getClearColor())},this.setClearColor=function(){Ft.setClearColor(...arguments)},this.getClearAlpha=function(){return Ft.getClearAlpha()},this.setClearAlpha=function(){Ft.setClearAlpha(...arguments)},this.clear=function(U=!0,K=!0,G=!0){let Z=0;if(U){let X=!1;if(L!==null){let lt=L.texture.format;X=lt===Rl||lt===Al||lt===Tl}if(X){let lt=L.texture.type,vt=lt===fi||lt===ms||lt===ro||lt===oo||lt===bl||lt===wl,Nt=Ft.getClearColor(),Ot=Ft.getClearAlpha(),Gt=Nt.r,Xt=Nt.g,Vt=Nt.b;vt?(g[0]=Gt,g[1]=Xt,g[2]=Vt,g[3]=Ot,V.clearBufferuiv(V.COLOR,0,g)):(x[0]=Gt,x[1]=Xt,x[2]=Vt,x[3]=Ot,V.clearBufferiv(V.COLOR,0,x))}else Z|=V.COLOR_BUFFER_BIT}K&&(Z|=V.DEPTH_BUFFER_BIT),G&&(Z|=V.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),V.clear(Z)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){e.removeEventListener("webglcontextlost",Mt,!1),e.removeEventListener("webglcontextrestored",It,!1),e.removeEventListener("webglcontextcreationerror",gt,!1),Ft.dispose(),rt.dispose(),wt.dispose(),Q.dispose(),Bt.dispose(),At.dispose(),$.dispose(),xt.dispose(),qt.dispose(),nt.dispose(),_t.dispose(),_t.removeEventListener("sessionstart",In),_t.removeEventListener("sessionend",Vo),Li.stop()};function Mt(U){U.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),w=!0}function It(){console.log("THREE.WebGLRenderer: Context Restored."),w=!1;let U=ut.autoReset,K=Lt.enabled,G=Lt.autoUpdate,Z=Lt.needsUpdate,X=Lt.type;q(),ut.autoReset=U,Lt.enabled=K,Lt.autoUpdate=G,Lt.needsUpdate=Z,Lt.type=X}function gt(U){console.error("THREE.WebGLRenderer: A WebGL context could not be created. Reason: ",U.statusMessage)}function pt(U){let K=U.target;K.removeEventListener("dispose",pt),Ut(K)}function Ut(U){$t(U),Q.remove(U)}function $t(U){let K=Q.get(U).programs;K!==void 0&&(K.forEach(function(G){nt.releaseProgram(G)}),U.isShaderMaterial&&nt.releaseShaderCache(U))}this.renderBufferDirect=function(U,K,G,Z,X,lt){K===null&&(K=St);let vt=X.isMesh&&X.matrixWorld.determinant()<0,Nt=Sr(U,K,G,Z,X);H.setMaterial(Z,vt);let Ot=G.index,Gt=1;if(Z.wireframe===!0){if(Ot=P.getWireframeAttribute(G),Ot===void 0)return;Gt=2}let Xt=G.drawRange,Vt=G.attributes.position,ne=Xt.start*Gt,Me=(Xt.start+Xt.count)*Gt;lt!==null&&(ne=Math.max(ne,lt.start*Gt),Me=Math.min(Me,(lt.start+lt.count)*Gt)),Ot!==null?(ne=Math.max(ne,0),Me=Math.min(Me,Ot.count)):Vt!=null&&(ne=Math.max(ne,0),Me=Math.min(Me,Vt.count));let Ue=Me-ne;if(Ue<0||Ue===1/0)return;xt.setup(X,Z,Nt,G,Ot);let Pe,Ee=Rt;if(Ot!==null&&(Pe=F.get(Ot),Ee=Dt,Ee.setIndex(Pe)),X.isMesh)Z.wireframe===!0?(H.setLineWidth(Z.wireframeLinewidth*ue()),Ee.setMode(V.LINES)):Ee.setMode(V.TRIANGLES);else if(X.isLine){let Wt=Z.linewidth;Wt===void 0&&(Wt=1),H.setLineWidth(Wt*ue()),X.isLineSegments?Ee.setMode(V.LINES):X.isLineLoop?Ee.setMode(V.LINE_LOOP):Ee.setMode(V.LINE_STRIP)}else X.isPoints?Ee.setMode(V.POINTS):X.isSprite&&Ee.setMode(V.TRIANGLES);if(X.isBatchedMesh)if(X._multiDrawInstances!==null)Xr("THREE.WebGLRenderer: renderMultiDrawInstances has been deprecated and will be removed in r184. Append to renderMultiDraw arguments and use indirection."),Ee.renderMultiDrawInstances(X._multiDrawStarts,X._multiDrawCounts,X._multiDrawCount,X._multiDrawInstances);else if(D.get("WEBGL_multi_draw"))Ee.renderMultiDraw(X._multiDrawStarts,X._multiDrawCounts,X._multiDrawCount);else{let Wt=X._multiDrawStarts,Ne=X._multiDrawCounts,fe=X._multiDrawCount,Pn=Ot?F.get(Ot).bytesPerElement:1,br=Q.get(Z).currentProgram.getUniforms();for(let Ln=0;Ln<fe;Ln++)br.setValue(V,"_gl_DrawID",Ln),Ee.render(Wt[Ln]/Pn,Ne[Ln])}else if(X.isInstancedMesh)Ee.renderInstances(ne,Ue,X.count);else if(G.isInstancedBufferGeometry){let Wt=G._maxInstanceCount!==void 0?G._maxInstanceCount:1/0,Ne=Math.min(G.instanceCount,Wt);Ee.renderInstances(ne,Ue,Ne)}else Ee.render(ne,Ue)};function _e(U,K,G){U.transparent===!0&&U.side===Ce&&U.forceSinglePass===!1?(U.side=nn,U.needsUpdate=!0,is(U,K,G),U.side=fn,U.needsUpdate=!0,is(U,K,G),U.side=Ce):is(U,K,G)}this.compile=function(U,K,G=null){G===null&&(G=U),p=wt.get(G),p.init(K),v.push(p),G.traverseVisible(function(X){X.isLight&&X.layers.test(K.layers)&&(p.pushLight(X),X.castShadow&&p.pushShadow(X))}),U!==G&&U.traverseVisible(function(X){X.isLight&&X.layers.test(K.layers)&&(p.pushLight(X),X.castShadow&&p.pushShadow(X))}),p.setupLights();let Z=new Set;return U.traverse(function(X){if(!(X.isMesh||X.isPoints||X.isLine||X.isSprite))return;let lt=X.material;if(lt)if(Array.isArray(lt))for(let vt=0;vt<lt.length;vt++){let Nt=lt[vt];_e(Nt,G,X),Z.add(Nt)}else _e(lt,G,X),Z.add(lt)}),p=v.pop(),Z},this.compileAsync=function(U,K,G=null){let Z=this.compile(U,K,G);return new Promise(X=>{function lt(){if(Z.forEach(function(vt){Q.get(vt).currentProgram.isReady()&&Z.delete(vt)}),Z.size===0){X(U);return}setTimeout(lt,10)}D.get("KHR_parallel_shader_compile")!==null?lt():setTimeout(lt,10)})};let se=null;function Vn(U){se&&se(U)}function In(){Li.stop()}function Vo(){Li.start()}let Li=new x0;Li.setAnimationLoop(Vn),typeof self<"u"&&Li.setContext(self),this.setAnimationLoop=function(U){se=U,_t.setAnimationLoop(U),U===null?Li.stop():Li.start()},_t.addEventListener("sessionstart",In),_t.addEventListener("sessionend",Vo),this.render=function(U,K){if(K!==void 0&&K.isCamera!==!0){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(w===!0)return;if(U.matrixWorldAutoUpdate===!0&&U.updateMatrixWorld(),K.parent===null&&K.matrixWorldAutoUpdate===!0&&K.updateMatrixWorld(),_t.enabled===!0&&_t.isPresenting===!0&&(_t.cameraAutoUpdate===!0&&_t.updateCamera(K),K=_t.getCamera()),U.isScene===!0&&U.onBeforeRender(_,U,K,L),p=wt.get(U,v.length),p.init(K),v.push(p),it.multiplyMatrices(K.projectionMatrix,K.matrixWorldInverse),st.setFromProjectionMatrix(it,li,K.reversedDepth),J=this.localClippingEnabled,ot=dt.init(this.clippingPlanes,J),m=rt.get(U,y.length),m.init(),y.push(m),_t.enabled===!0&&_t.isPresenting===!0){let lt=_.xr.getDepthSensingMesh();lt!==null&&Go(lt,K,-1/0,_.sortObjects)}Go(U,K,0,_.sortObjects),m.finish(),_.sortObjects===!0&&m.sort(et,j),zt=_t.enabled===!1||_t.isPresenting===!1||_t.hasDepthSensing()===!1,zt&&Ft.addToRenderList(m,U),this.info.render.frame++,ot===!0&&dt.beginShadows();let G=p.state.shadowsArray;Lt.render(G,U,K),ot===!0&&dt.endShadows(),this.info.autoReset===!0&&this.info.reset();let Z=m.opaque,X=m.transmissive;if(p.setupLights(),K.isArrayCamera){let lt=K.cameras;if(X.length>0)for(let vt=0,Nt=lt.length;vt<Nt;vt++){let Ot=lt[vt];Wo(Z,X,U,Ot)}zt&&Ft.render(U);for(let vt=0,Nt=lt.length;vt<Nt;vt++){let Ot=lt[vt];je(m,U,Ot,Ot.viewport)}}else X.length>0&&Wo(Z,X,U,K),zt&&Ft.render(U),je(m,U,K);L!==null&&R===0&&(yt.updateMultisampleRenderTarget(L),yt.updateRenderTargetMipmap(L)),U.isScene===!0&&U.onAfterRender(_,U,K),xt.resetDefaultState(),S=-1,M=null,v.pop(),v.length>0?(p=v[v.length-1],ot===!0&&dt.setGlobalState(_.clippingPlanes,p.state.camera)):p=null,y.pop(),y.length>0?m=y[y.length-1]:m=null};function Go(U,K,G,Z){if(U.visible===!1)return;if(U.layers.test(K.layers)){if(U.isGroup)G=U.renderOrder;else if(U.isLOD)U.autoUpdate===!0&&U.update(K);else if(U.isLight)p.pushLight(U),U.castShadow&&p.pushShadow(U);else if(U.isSprite){if(!U.frustumCulled||st.intersectsSprite(U)){Z&&bt.setFromMatrixPosition(U.matrixWorld).applyMatrix4(it);let vt=$.update(U),Nt=U.material;Nt.visible&&m.push(U,vt,Nt,G,bt.z,null)}}else if((U.isMesh||U.isLine||U.isPoints)&&(!U.frustumCulled||st.intersectsObject(U))){let vt=$.update(U),Nt=U.material;if(Z&&(U.boundingSphere!==void 0?(U.boundingSphere===null&&U.computeBoundingSphere(),bt.copy(U.boundingSphere.center)):(vt.boundingSphere===null&&vt.computeBoundingSphere(),bt.copy(vt.boundingSphere.center)),bt.applyMatrix4(U.matrixWorld).applyMatrix4(it)),Array.isArray(Nt)){let Ot=vt.groups;for(let Gt=0,Xt=Ot.length;Gt<Xt;Gt++){let Vt=Ot[Gt],ne=Nt[Vt.materialIndex];ne&&ne.visible&&m.push(U,vt,ne,G,bt.z,Vt)}}else Nt.visible&&m.push(U,vt,Nt,G,bt.z,null)}}let lt=U.children;for(let vt=0,Nt=lt.length;vt<Nt;vt++)Go(lt[vt],K,G,Z)}function je(U,K,G,Z){let X=U.opaque,lt=U.transmissive,vt=U.transparent;p.setupLightsView(G),ot===!0&&dt.setGlobalState(_.clippingPlanes,G),Z&&H.viewport(b.copy(Z)),X.length>0&&vr(X,K,G),lt.length>0&&vr(lt,K,G),vt.length>0&&vr(vt,K,G),H.buffers.depth.setTest(!0),H.buffers.depth.setMask(!0),H.buffers.color.setMask(!0),H.setPolygonOffset(!1)}function Wo(U,K,G,Z){if((G.isScene===!0?G.overrideMaterial:null)!==null)return;p.state.transmissionRenderTarget[Z.id]===void 0&&(p.state.transmissionRenderTarget[Z.id]=new qn(1,1,{generateMipmaps:!0,type:D.has("EXT_color_buffer_half_float")||D.has("EXT_color_buffer_float")?Yi:fi,minFilter:Un,samples:4,stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:ie.workingColorSpace}));let lt=p.state.transmissionRenderTarget[Z.id],vt=Z.viewport||b;lt.setSize(vt.z*_.transmissionResolutionScale,vt.w*_.transmissionResolutionScale);let Nt=_.getRenderTarget(),Ot=_.getActiveCubeFace(),Gt=_.getActiveMipmapLevel();_.setRenderTarget(lt),_.getClearColor(C),I=_.getClearAlpha(),I<1&&_.setClearColor(16777215,.5),_.clear(),zt&&Ft.render(G);let Xt=_.toneMapping;_.toneMapping=$i;let Vt=Z.viewport;if(Z.viewport!==void 0&&(Z.viewport=void 0),p.setupLightsView(Z),ot===!0&&dt.setGlobalState(_.clippingPlanes,Z),vr(U,G,Z),yt.updateMultisampleRenderTarget(lt),yt.updateRenderTargetMipmap(lt),D.has("WEBGL_multisampled_render_to_texture")===!1){let ne=!1;for(let Me=0,Ue=K.length;Me<Ue;Me++){let Pe=K[Me],Ee=Pe.object,Wt=Pe.geometry,Ne=Pe.material,fe=Pe.group;if(Ne.side===Ce&&Ee.layers.test(Z.layers)){let Pn=Ne.side;Ne.side=nn,Ne.needsUpdate=!0,Rs(Ee,G,Z,Wt,Ne,fe),Ne.side=Pn,Ne.needsUpdate=!0,ne=!0}}ne===!0&&(yt.updateMultisampleRenderTarget(lt),yt.updateRenderTargetMipmap(lt))}_.setRenderTarget(Nt,Ot,Gt),_.setClearColor(C,I),Vt!==void 0&&(Z.viewport=Vt),_.toneMapping=Xt}function vr(U,K,G){let Z=K.isScene===!0?K.overrideMaterial:null;for(let X=0,lt=U.length;X<lt;X++){let vt=U[X],Nt=vt.object,Ot=vt.geometry,Gt=vt.group,Xt=vt.material;Xt.allowOverride===!0&&Z!==null&&(Xt=Z),Nt.layers.test(G.layers)&&Rs(Nt,K,G,Ot,Xt,Gt)}}function Rs(U,K,G,Z,X,lt){U.onBeforeRender(_,K,G,Z,X,lt),U.modelViewMatrix.multiplyMatrices(G.matrixWorldInverse,U.matrixWorld),U.normalMatrix.getNormalMatrix(U.modelViewMatrix),X.onBeforeRender(_,K,G,Z,U,lt),X.transparent===!0&&X.side===Ce&&X.forceSinglePass===!1?(X.side=nn,X.needsUpdate=!0,_.renderBufferDirect(G,K,Z,X,U,lt),X.side=fn,X.needsUpdate=!0,_.renderBufferDirect(G,K,Z,X,U,lt),X.side=Ce):_.renderBufferDirect(G,K,Z,X,U,lt),U.onAfterRender(_,K,G,Z,X,lt)}function is(U,K,G){K.isScene!==!0&&(K=St);let Z=Q.get(U),X=p.state.lights,lt=p.state.shadowsArray,vt=X.state.version,Nt=nt.getParameters(U,X.state,lt,K,G),Ot=nt.getProgramCacheKey(Nt),Gt=Z.programs;Z.environment=U.isMeshStandardMaterial?K.environment:null,Z.fog=K.fog,Z.envMap=(U.isMeshStandardMaterial?At:Bt).get(U.envMap||Z.environment),Z.envMapRotation=Z.environment!==null&&U.envMap===null?K.environmentRotation:U.envMapRotation,Gt===void 0&&(U.addEventListener("dispose",pt),Gt=new Map,Z.programs=Gt);let Xt=Gt.get(Ot);if(Xt!==void 0){if(Z.currentProgram===Xt&&Z.lightsStateVersion===vt)return Cs(U,Nt),Xt}else Nt.uniforms=nt.getUniforms(U),U.onBeforeCompile(Nt,_),Xt=nt.acquireProgram(Nt,Ot),Gt.set(Ot,Xt),Z.uniforms=Nt.uniforms;let Vt=Z.uniforms;return(!U.isShaderMaterial&&!U.isRawShaderMaterial||U.clipping===!0)&&(Vt.clippingPlanes=dt.uniform),Cs(U,Nt),Z.needsLights=ss(U),Z.lightsStateVersion=vt,Z.needsLights&&(Vt.ambientLightColor.value=X.state.ambient,Vt.lightProbe.value=X.state.probe,Vt.directionalLights.value=X.state.directional,Vt.directionalLightShadows.value=X.state.directionalShadow,Vt.spotLights.value=X.state.spot,Vt.spotLightShadows.value=X.state.spotShadow,Vt.rectAreaLights.value=X.state.rectArea,Vt.ltc_1.value=X.state.rectAreaLTC1,Vt.ltc_2.value=X.state.rectAreaLTC2,Vt.pointLights.value=X.state.point,Vt.pointLightShadows.value=X.state.pointShadow,Vt.hemisphereLights.value=X.state.hemi,Vt.directionalShadowMap.value=X.state.directionalShadowMap,Vt.directionalShadowMatrix.value=X.state.directionalShadowMatrix,Vt.spotShadowMap.value=X.state.spotShadowMap,Vt.spotLightMatrix.value=X.state.spotLightMatrix,Vt.spotLightMap.value=X.state.spotLightMap,Vt.pointShadowMap.value=X.state.pointShadowMap,Vt.pointShadowMatrix.value=X.state.pointShadowMatrix),Z.currentProgram=Xt,Z.uniformsList=null,Xt}function Xo(U){if(U.uniformsList===null){let K=U.currentProgram.getUniforms();U.uniformsList=uo.seqWithValue(K.seq,U.uniforms)}return U.uniformsList}function Cs(U,K){let G=Q.get(U);G.outputColorSpace=K.outputColorSpace,G.batching=K.batching,G.batchingColor=K.batchingColor,G.instancing=K.instancing,G.instancingColor=K.instancingColor,G.instancingMorph=K.instancingMorph,G.skinning=K.skinning,G.morphTargets=K.morphTargets,G.morphNormals=K.morphNormals,G.morphColors=K.morphColors,G.morphTargetsCount=K.morphTargetsCount,G.numClippingPlanes=K.numClippingPlanes,G.numIntersection=K.numClipIntersection,G.vertexAlphas=K.vertexAlphas,G.vertexTangents=K.vertexTangents,G.toneMapping=K.toneMapping}function Sr(U,K,G,Z,X){K.isScene!==!0&&(K=St),yt.resetTextureUnits();let lt=K.fog,vt=Z.isMeshStandardMaterial?K.environment:null,Nt=L===null?_.outputColorSpace:L.isXRRenderTarget===!0?L.texture.colorSpace:We,Ot=(Z.isMeshStandardMaterial?At:Bt).get(Z.envMap||vt),Gt=Z.vertexColors===!0&&!!G.attributes.color&&G.attributes.color.itemSize===4,Xt=!!G.attributes.tangent&&(!!Z.normalMap||Z.anisotropy>0),Vt=!!G.morphAttributes.position,ne=!!G.morphAttributes.normal,Me=!!G.morphAttributes.color,Ue=$i;Z.toneMapped&&(L===null||L.isXRRenderTarget===!0)&&(Ue=_.toneMapping);let Pe=G.morphAttributes.position||G.morphAttributes.normal||G.morphAttributes.color,Ee=Pe!==void 0?Pe.length:0,Wt=Q.get(Z),Ne=p.state.lights;if(ot===!0&&(J===!0||U!==M)){let _n=U===M&&Z.id===S;dt.setState(Z,U,_n)}let fe=!1;Z.version===Wt.__version?(Wt.needsLights&&Wt.lightsStateVersion!==Ne.state.version||Wt.outputColorSpace!==Nt||X.isBatchedMesh&&Wt.batching===!1||!X.isBatchedMesh&&Wt.batching===!0||X.isBatchedMesh&&Wt.batchingColor===!0&&X.colorTexture===null||X.isBatchedMesh&&Wt.batchingColor===!1&&X.colorTexture!==null||X.isInstancedMesh&&Wt.instancing===!1||!X.isInstancedMesh&&Wt.instancing===!0||X.isSkinnedMesh&&Wt.skinning===!1||!X.isSkinnedMesh&&Wt.skinning===!0||X.isInstancedMesh&&Wt.instancingColor===!0&&X.instanceColor===null||X.isInstancedMesh&&Wt.instancingColor===!1&&X.instanceColor!==null||X.isInstancedMesh&&Wt.instancingMorph===!0&&X.morphTexture===null||X.isInstancedMesh&&Wt.instancingMorph===!1&&X.morphTexture!==null||Wt.envMap!==Ot||Z.fog===!0&&Wt.fog!==lt||Wt.numClippingPlanes!==void 0&&(Wt.numClippingPlanes!==dt.numPlanes||Wt.numIntersection!==dt.numIntersection)||Wt.vertexAlphas!==Gt||Wt.vertexTangents!==Xt||Wt.morphTargets!==Vt||Wt.morphNormals!==ne||Wt.morphColors!==Me||Wt.toneMapping!==Ue||Wt.morphTargetsCount!==Ee)&&(fe=!0):(fe=!0,Wt.__version=Z.version);let Pn=Wt.currentProgram;fe===!0&&(Pn=is(Z,K,X));let br=!1,Ln=!1,$o=!1,De=Pn.getUniforms(),Gn=Wt.uniforms;if(H.useProgram(Pn.program)&&(br=!0,Ln=!0,$o=!0),Z.id!==S&&(S=Z.id,Ln=!0),br||M!==U){H.buffers.depth.getReversed()&&U.reversedDepth!==!0&&(U._reversedDepth=!0,U.updateProjectionMatrix()),De.setValue(V,"projectionMatrix",U.projectionMatrix),De.setValue(V,"viewMatrix",U.matrixWorldInverse);let wn=De.map.cameraPosition;wn!==void 0&&wn.setValue(V,ft.setFromMatrixPosition(U.matrixWorld)),E.logarithmicDepthBuffer&&De.setValue(V,"logDepthBufFC",2/(Math.log(U.far+1)/Math.LN2)),(Z.isMeshPhongMaterial||Z.isMeshToonMaterial||Z.isMeshLambertMaterial||Z.isMeshBasicMaterial||Z.isMeshStandardMaterial||Z.isShaderMaterial)&&De.setValue(V,"isOrthographic",U.isOrthographicCamera===!0),M!==U&&(M=U,Ln=!0,$o=!0)}if(X.isSkinnedMesh){De.setOptional(V,X,"bindMatrix"),De.setOptional(V,X,"bindMatrixInverse");let _n=X.skeleton;_n&&(_n.boneTexture===null&&_n.computeBoneTexture(),De.setValue(V,"boneTexture",_n.boneTexture,yt))}X.isBatchedMesh&&(De.setOptional(V,X,"batchingTexture"),De.setValue(V,"batchingTexture",X._matricesTexture,yt),De.setOptional(V,X,"batchingIdTexture"),De.setValue(V,"batchingIdTexture",X._indirectTexture,yt),De.setOptional(V,X,"batchingColorTexture"),X._colorsTexture!==null&&De.setValue(V,"batchingColorTexture",X._colorsTexture,yt));let Wn=G.morphAttributes;if((Wn.position!==void 0||Wn.normal!==void 0||Wn.color!==void 0)&&mt.update(X,G,Pn),(Ln||Wt.receiveShadow!==X.receiveShadow)&&(Wt.receiveShadow=X.receiveShadow,De.setValue(V,"receiveShadow",X.receiveShadow)),Z.isMeshGouraudMaterial&&Z.envMap!==null&&(Gn.envMap.value=Ot,Gn.flipEnvMap.value=Ot.isCubeTexture&&Ot.isRenderTargetTexture===!1?-1:1),Z.isMeshStandardMaterial&&Z.envMap===null&&K.environment!==null&&(Gn.envMapIntensity.value=K.environmentIntensity),Ln&&(De.setValue(V,"toneMappingExposure",_.toneMappingExposure),Wt.needsLights&&Is(Gn,$o),lt&&Z.fog===!0&&ct.refreshFogUniforms(Gn,lt),ct.refreshMaterialUniforms(Gn,Z,z,k,p.state.transmissionRenderTarget[U.id]),uo.upload(V,Xo(Wt),Gn,yt)),Z.isShaderMaterial&&Z.uniformsNeedUpdate===!0&&(uo.upload(V,Xo(Wt),Gn,yt),Z.uniformsNeedUpdate=!1),Z.isSpriteMaterial&&De.setValue(V,"center",X.center),De.setValue(V,"modelViewMatrix",X.modelViewMatrix),De.setValue(V,"normalMatrix",X.normalMatrix),De.setValue(V,"modelMatrix",X.matrixWorld),Z.isShaderMaterial||Z.isRawShaderMaterial){let _n=Z.uniformsGroups;for(let wn=0,Su=_n.length;wn<Su;wn++){let Ls=_n[wn];qt.update(Ls,Pn),qt.bind(Ls,Pn)}}return Pn}function Is(U,K){U.ambientLightColor.needsUpdate=K,U.lightProbe.needsUpdate=K,U.directionalLights.needsUpdate=K,U.directionalLightShadows.needsUpdate=K,U.pointLights.needsUpdate=K,U.pointLightShadows.needsUpdate=K,U.spotLights.needsUpdate=K,U.spotLightShadows.needsUpdate=K,U.rectAreaLights.needsUpdate=K,U.hemisphereLights.needsUpdate=K}function ss(U){return U.isMeshLambertMaterial||U.isMeshToonMaterial||U.isMeshPhongMaterial||U.isMeshStandardMaterial||U.isShadowMaterial||U.isShaderMaterial&&U.lights===!0}this.getActiveCubeFace=function(){return T},this.getActiveMipmapLevel=function(){return R},this.getRenderTarget=function(){return L},this.setRenderTargetTextures=function(U,K,G){let Z=Q.get(U);Z.__autoAllocateDepthBuffer=U.resolveDepthBuffer===!1,Z.__autoAllocateDepthBuffer===!1&&(Z.__useRenderToTexture=!1),Q.get(U.texture).__webglTexture=K,Q.get(U.depthTexture).__webglTexture=Z.__autoAllocateDepthBuffer?void 0:G,Z.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(U,K){let G=Q.get(U);G.__webglFramebuffer=K,G.__useDefaultFramebuffer=K===void 0};let Ps=V.createFramebuffer();this.setRenderTarget=function(U,K=0,G=0){L=U,T=K,R=G;let Z=!0,X=null,lt=!1,vt=!1;if(U){let Ot=Q.get(U);if(Ot.__useDefaultFramebuffer!==void 0)H.bindFramebuffer(V.FRAMEBUFFER,null),Z=!1;else if(Ot.__webglFramebuffer===void 0)yt.setupRenderTarget(U);else if(Ot.__hasExternalTextures)yt.rebindTextures(U,Q.get(U.texture).__webglTexture,Q.get(U.depthTexture).__webglTexture);else if(U.depthBuffer){let Vt=U.depthTexture;if(Ot.__boundDepthTexture!==Vt){if(Vt!==null&&Q.has(Vt)&&(U.width!==Vt.image.width||U.height!==Vt.image.height))throw new Error("WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.");yt.setupDepthRenderbuffer(U)}}let Gt=U.texture;(Gt.isData3DTexture||Gt.isDataArrayTexture||Gt.isCompressedArrayTexture)&&(vt=!0);let Xt=Q.get(U).__webglFramebuffer;U.isWebGLCubeRenderTarget?(Array.isArray(Xt[K])?X=Xt[K][G]:X=Xt[K],lt=!0):U.samples>0&&yt.useMultisampledRTT(U)===!1?X=Q.get(U).__webglMultisampledFramebuffer:Array.isArray(Xt)?X=Xt[G]:X=Xt,b.copy(U.viewport),A.copy(U.scissor),N=U.scissorTest}else b.copy(W).multiplyScalar(z).floor(),A.copy(tt).multiplyScalar(z).floor(),N=at;if(G!==0&&(X=Ps),H.bindFramebuffer(V.FRAMEBUFFER,X)&&Z&&H.drawBuffers(U,X),H.viewport(b),H.scissor(A),H.setScissorTest(N),lt){let Ot=Q.get(U.texture);V.framebufferTexture2D(V.FRAMEBUFFER,V.COLOR_ATTACHMENT0,V.TEXTURE_CUBE_MAP_POSITIVE_X+K,Ot.__webglTexture,G)}else if(vt){let Ot=K;for(let Gt=0;Gt<U.textures.length;Gt++){let Xt=Q.get(U.textures[Gt]);V.framebufferTextureLayer(V.FRAMEBUFFER,V.COLOR_ATTACHMENT0+Gt,Xt.__webglTexture,G,Ot)}}else if(U!==null&&G!==0){let Ot=Q.get(U.texture);V.framebufferTexture2D(V.FRAMEBUFFER,V.COLOR_ATTACHMENT0,V.TEXTURE_2D,Ot.__webglTexture,G)}S=-1},this.readRenderTargetPixels=function(U,K,G,Z,X,lt,vt,Nt=0){if(!(U&&U.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let Ot=Q.get(U).__webglFramebuffer;if(U.isWebGLCubeRenderTarget&&vt!==void 0&&(Ot=Ot[vt]),Ot){H.bindFramebuffer(V.FRAMEBUFFER,Ot);try{let Gt=U.textures[Nt],Xt=Gt.format,Vt=Gt.type;if(!E.textureFormatReadable(Xt)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!E.textureTypeReadable(Vt)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}K>=0&&K<=U.width-Z&&G>=0&&G<=U.height-X&&(U.textures.length>1&&V.readBuffer(V.COLOR_ATTACHMENT0+Nt),V.readPixels(K,G,Z,X,Tt.convert(Xt),Tt.convert(Vt),lt))}finally{let Gt=L!==null?Q.get(L).__webglFramebuffer:null;H.bindFramebuffer(V.FRAMEBUFFER,Gt)}}},this.readRenderTargetPixelsAsync=async function(U,K,G,Z,X,lt,vt,Nt=0){if(!(U&&U.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let Ot=Q.get(U).__webglFramebuffer;if(U.isWebGLCubeRenderTarget&&vt!==void 0&&(Ot=Ot[vt]),Ot)if(K>=0&&K<=U.width-Z&&G>=0&&G<=U.height-X){H.bindFramebuffer(V.FRAMEBUFFER,Ot);let Gt=U.textures[Nt],Xt=Gt.format,Vt=Gt.type;if(!E.textureFormatReadable(Xt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!E.textureTypeReadable(Vt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");let ne=V.createBuffer();V.bindBuffer(V.PIXEL_PACK_BUFFER,ne),V.bufferData(V.PIXEL_PACK_BUFFER,lt.byteLength,V.STREAM_READ),U.textures.length>1&&V.readBuffer(V.COLOR_ATTACHMENT0+Nt),V.readPixels(K,G,Z,X,Tt.convert(Xt),Tt.convert(Vt),0);let Me=L!==null?Q.get(L).__webglFramebuffer:null;H.bindFramebuffer(V.FRAMEBUFFER,Me);let Ue=V.fenceSync(V.SYNC_GPU_COMMANDS_COMPLETE,0);return V.flush(),await Gg(V,Ue,4),V.bindBuffer(V.PIXEL_PACK_BUFFER,ne),V.getBufferSubData(V.PIXEL_PACK_BUFFER,0,lt),V.deleteBuffer(ne),V.deleteSync(Ue),lt}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(U,K=null,G=0){let Z=Math.pow(2,-G),X=Math.floor(U.image.width*Z),lt=Math.floor(U.image.height*Z),vt=K!==null?K.x:0,Nt=K!==null?K.y:0;yt.setTexture2D(U,0),V.copyTexSubImage2D(V.TEXTURE_2D,G,0,0,vt,Nt,X,lt),H.unbindTexture()};let Mr=V.createFramebuffer(),qo=V.createFramebuffer();this.copyTextureToTexture=function(U,K,G=null,Z=null,X=0,lt=null){lt===null&&(X!==0?(Xr("WebGLRenderer: copyTextureToTexture function signature has changed to support src and dst mipmap levels."),lt=X,X=0):lt=0);let vt,Nt,Ot,Gt,Xt,Vt,ne,Me,Ue,Pe=U.isCompressedTexture?U.mipmaps[lt]:U.image;if(G!==null)vt=G.max.x-G.min.x,Nt=G.max.y-G.min.y,Ot=G.isBox3?G.max.z-G.min.z:1,Gt=G.min.x,Xt=G.min.y,Vt=G.isBox3?G.min.z:0;else{let Wn=Math.pow(2,-X);vt=Math.floor(Pe.width*Wn),Nt=Math.floor(Pe.height*Wn),U.isDataArrayTexture?Ot=Pe.depth:U.isData3DTexture?Ot=Math.floor(Pe.depth*Wn):Ot=1,Gt=0,Xt=0,Vt=0}Z!==null?(ne=Z.x,Me=Z.y,Ue=Z.z):(ne=0,Me=0,Ue=0);let Ee=Tt.convert(K.format),Wt=Tt.convert(K.type),Ne;K.isData3DTexture?(yt.setTexture3D(K,0),Ne=V.TEXTURE_3D):K.isDataArrayTexture||K.isCompressedArrayTexture?(yt.setTexture2DArray(K,0),Ne=V.TEXTURE_2D_ARRAY):(yt.setTexture2D(K,0),Ne=V.TEXTURE_2D),V.pixelStorei(V.UNPACK_FLIP_Y_WEBGL,K.flipY),V.pixelStorei(V.UNPACK_PREMULTIPLY_ALPHA_WEBGL,K.premultiplyAlpha),V.pixelStorei(V.UNPACK_ALIGNMENT,K.unpackAlignment);let fe=V.getParameter(V.UNPACK_ROW_LENGTH),Pn=V.getParameter(V.UNPACK_IMAGE_HEIGHT),br=V.getParameter(V.UNPACK_SKIP_PIXELS),Ln=V.getParameter(V.UNPACK_SKIP_ROWS),$o=V.getParameter(V.UNPACK_SKIP_IMAGES);V.pixelStorei(V.UNPACK_ROW_LENGTH,Pe.width),V.pixelStorei(V.UNPACK_IMAGE_HEIGHT,Pe.height),V.pixelStorei(V.UNPACK_SKIP_PIXELS,Gt),V.pixelStorei(V.UNPACK_SKIP_ROWS,Xt),V.pixelStorei(V.UNPACK_SKIP_IMAGES,Vt);let De=U.isDataArrayTexture||U.isData3DTexture,Gn=K.isDataArrayTexture||K.isData3DTexture;if(U.isDepthTexture){let Wn=Q.get(U),_n=Q.get(K),wn=Q.get(Wn.__renderTarget),Su=Q.get(_n.__renderTarget);H.bindFramebuffer(V.READ_FRAMEBUFFER,wn.__webglFramebuffer),H.bindFramebuffer(V.DRAW_FRAMEBUFFER,Su.__webglFramebuffer);for(let Ls=0;Ls<Ot;Ls++)De&&(V.framebufferTextureLayer(V.READ_FRAMEBUFFER,V.COLOR_ATTACHMENT0,Q.get(U).__webglTexture,X,Vt+Ls),V.framebufferTextureLayer(V.DRAW_FRAMEBUFFER,V.COLOR_ATTACHMENT0,Q.get(K).__webglTexture,lt,Ue+Ls)),V.blitFramebuffer(Gt,Xt,vt,Nt,ne,Me,vt,Nt,V.DEPTH_BUFFER_BIT,V.NEAREST);H.bindFramebuffer(V.READ_FRAMEBUFFER,null),H.bindFramebuffer(V.DRAW_FRAMEBUFFER,null)}else if(X!==0||U.isRenderTargetTexture||Q.has(U)){let Wn=Q.get(U),_n=Q.get(K);H.bindFramebuffer(V.READ_FRAMEBUFFER,Mr),H.bindFramebuffer(V.DRAW_FRAMEBUFFER,qo);for(let wn=0;wn<Ot;wn++)De?V.framebufferTextureLayer(V.READ_FRAMEBUFFER,V.COLOR_ATTACHMENT0,Wn.__webglTexture,X,Vt+wn):V.framebufferTexture2D(V.READ_FRAMEBUFFER,V.COLOR_ATTACHMENT0,V.TEXTURE_2D,Wn.__webglTexture,X),Gn?V.framebufferTextureLayer(V.DRAW_FRAMEBUFFER,V.COLOR_ATTACHMENT0,_n.__webglTexture,lt,Ue+wn):V.framebufferTexture2D(V.DRAW_FRAMEBUFFER,V.COLOR_ATTACHMENT0,V.TEXTURE_2D,_n.__webglTexture,lt),X!==0?V.blitFramebuffer(Gt,Xt,vt,Nt,ne,Me,vt,Nt,V.COLOR_BUFFER_BIT,V.NEAREST):Gn?V.copyTexSubImage3D(Ne,lt,ne,Me,Ue+wn,Gt,Xt,vt,Nt):V.copyTexSubImage2D(Ne,lt,ne,Me,Gt,Xt,vt,Nt);H.bindFramebuffer(V.READ_FRAMEBUFFER,null),H.bindFramebuffer(V.DRAW_FRAMEBUFFER,null)}else Gn?U.isDataTexture||U.isData3DTexture?V.texSubImage3D(Ne,lt,ne,Me,Ue,vt,Nt,Ot,Ee,Wt,Pe.data):K.isCompressedArrayTexture?V.compressedTexSubImage3D(Ne,lt,ne,Me,Ue,vt,Nt,Ot,Ee,Pe.data):V.texSubImage3D(Ne,lt,ne,Me,Ue,vt,Nt,Ot,Ee,Wt,Pe):U.isDataTexture?V.texSubImage2D(V.TEXTURE_2D,lt,ne,Me,vt,Nt,Ee,Wt,Pe.data):U.isCompressedTexture?V.compressedTexSubImage2D(V.TEXTURE_2D,lt,ne,Me,Pe.width,Pe.height,Ee,Pe.data):V.texSubImage2D(V.TEXTURE_2D,lt,ne,Me,vt,Nt,Ee,Wt,Pe);V.pixelStorei(V.UNPACK_ROW_LENGTH,fe),V.pixelStorei(V.UNPACK_IMAGE_HEIGHT,Pn),V.pixelStorei(V.UNPACK_SKIP_PIXELS,br),V.pixelStorei(V.UNPACK_SKIP_ROWS,Ln),V.pixelStorei(V.UNPACK_SKIP_IMAGES,$o),lt===0&&K.generateMipmaps&&V.generateMipmap(Ne),H.unbindTexture()},this.initRenderTarget=function(U){Q.get(U).__webglFramebuffer===void 0&&yt.setupRenderTarget(U)},this.initTexture=function(U){U.isCubeTexture?yt.setTextureCube(U,0):U.isData3DTexture?yt.setTexture3D(U,0):U.isDataArrayTexture||U.isCompressedArrayTexture?yt.setTexture2DArray(U,0):yt.setTexture2D(U,0),H.unbindTexture()},this.resetState=function(){T=0,R=0,L=null,H.reset(),xt.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return li}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(t){this._outputColorSpace=t;let e=this.getContext();e.drawingBufferColorSpace=ie._getDrawingBufferColorSpace(t),e.unpackColorSpace=ie._getUnpackColorSpace()}};var Zn=class s{static setLevel(t){lh=t}static log(...t){lh<=s.LEVEL.LOG&&console.log(...t)}static warn(...t){lh<=s.LEVEL.WARN&&console.warn(...t)}static error(...t){lh<=s.LEVEL.ERROR&&console.error(...t)}};Zn.LEVEL=Object.freeze({LOG:0,WARN:1,ERROR:2,SILENT:3});var lh=Zn.LEVEL.WARN;var sn=new Array;for(let s=0;s<256;s++)sn[s]=(s<16?"0":"")+s.toString(16);var Fn=class{static area(t,e,n){return(n.x-t.x)*(e.z-t.z)-(e.x-t.x)*(n.z-t.z)}static argmax(t){let e=Math.max(...t),n=[];for(let i=0,r=t.length;i<r;i++)t[i]===e&&n.push(i);return n}static choice(t,e=null){let n=Math.random();if(e===null)return t[Math.floor(Math.random()*t.length)];{let i=0,r=t.map((o,a)=>(i+=e[a],i)).findIndex(o=>o>=n);return t[r]}}static clamp(t,e,n){return Math.max(e,Math.min(n,t))}static generateUUID(){let t=Math.random()*4294967295|0,e=Math.random()*4294967295|0,n=Math.random()*4294967295|0,i=Math.random()*4294967295|0;return(sn[t&255]+sn[t>>8&255]+sn[t>>16&255]+sn[t>>24&255]+"-"+sn[e&255]+sn[e>>8&255]+"-"+sn[e>>16&15|64]+sn[e>>24&255]+"-"+sn[n&63|128]+sn[n>>8&255]+"-"+sn[n>>16&255]+sn[n>>24&255]+sn[i&255]+sn[i>>8&255]+sn[i>>16&255]+sn[i>>24&255]).toUpperCase()}static randFloat(t,e){return t+Math.random()*(e-t)}static randInt(t,e){return t+Math.floor(Math.random()*(e-t+1))}},Y=class{constructor(t=0,e=0,n=0){this.x=t,this.y=e,this.z=n}set(t,e,n){return this.x=t,this.y=e,this.z=n,this}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}clone(){return new this.constructor().copy(this)}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,e){return this.x=t.x*e.x,this.y=t.y*e.y,this.z=t.z*e.z,this}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.x/=t,this.y/=t,this.z/=t,this}divideVectors(t,e){return this.x=t.x/e.x,this.y=t.y/e.y,this.z=t.z/e.z,this}reflect(t){return this.sub(Lb.copy(t).multiplyScalar(2*this.dot(t)))}clamp(t,e){return this.x=Math.max(t.x,Math.min(e.x,this.x)),this.y=Math.max(t.y,Math.min(e.y,this.y)),this.z=Math.max(t.z,Math.min(e.z,this.z)),this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}cross(t){let e=this.x,n=this.y,i=this.z;return this.x=n*t.z-i*t.y,this.y=i*t.x-e*t.z,this.z=e*t.y-n*t.x,this}crossVectors(t,e){let n=t.x,i=t.y,r=t.z,o=e.x,a=e.y,c=e.z;return this.x=i*c-r*a,this.y=r*o-n*c,this.z=n*a-i*o,this}angleTo(t){let e=Math.sqrt(this.squaredLength()*t.squaredLength());if(e===0)return 0;let n=this.dot(t)/e;return Math.acos(Fn.clamp(n,-1,1))}length(){return Math.sqrt(this.squaredLength())}squaredLength(){return this.dot(this)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}distanceTo(t){return Math.sqrt(this.squaredDistanceTo(t))}squaredDistanceTo(t){let e=this.x-t.x,n=this.y-t.y,i=this.z-t.z;return e*e+n*n+i*i}manhattanDistanceTo(t){let e=this.x-t.x,n=this.y-t.y,i=this.z-t.z;return Math.abs(e)+Math.abs(n)+Math.abs(i)}normalize(){return this.divideScalar(this.length()||1)}applyMatrix4(t){let e=this.x,n=this.y,i=this.z,r=t.elements,o=1/(r[3]*e+r[7]*n+r[11]*i+r[15]);return this.x=(r[0]*e+r[4]*n+r[8]*i+r[12])*o,this.y=(r[1]*e+r[5]*n+r[9]*i+r[13])*o,this.z=(r[2]*e+r[6]*n+r[10]*i+r[14])*o,this}applyRotation(t){let e=this.x,n=this.y,i=this.z,r=t.x,o=t.y,a=t.z,c=t.w,l=c*e+o*i-a*n,h=c*n+a*e-r*i,u=c*i+r*n-o*e,f=-r*e-o*n-a*i;return this.x=l*c+f*-r+h*-a-u*-o,this.y=h*c+f*-o+u*-r-l*-a,this.z=u*c+f*-a+l*-o-h*-r,this}extractPositionFromMatrix(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this}transformDirection(t){let e=this.x,n=this.y,i=this.z,r=t.elements;return this.x=r[0]*e+r[4]*n+r[8]*i,this.y=r[1]*e+r[5]*n+r[9]*i,this.z=r[2]*e+r[6]*n+r[10]*i,this.normalize()}fromMatrix3Column(t,e){return this.fromArray(t.elements,e*3)}fromMatrix4Column(t,e){return this.fromArray(t.elements,e*4)}fromSpherical(t,e,n){let i=Math.sin(e)*t;return this.x=i*Math.sin(n),this.y=Math.cos(e)*t,this.z=i*Math.cos(n),this}fromArray(t,e=0){return this.x=t[e+0],this.y=t[e+1],this.z=t[e+2],this}toArray(t,e=0){return t[e+0]=this.x,t[e+1]=this.y,t[e+2]=this.z,t}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}},Lb=new Y,M0=new Y(0,1,0),b0=new Y,Ua=new Y,w0=new Y,E0=new Y,td=[2,2,1],ed=[1,0,0],ji=class{constructor(){this.elements=[1,0,0,0,1,0,0,0,1]}set(t,e,n,i,r,o,a,c,l){let h=this.elements;return h[0]=t,h[3]=e,h[6]=n,h[1]=i,h[4]=r,h[7]=o,h[2]=a,h[5]=c,h[8]=l,this}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],this}clone(){return new this.constructor().copy(this)}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,i=e.elements,r=this.elements,o=n[0],a=n[3],c=n[6],l=n[1],h=n[4],u=n[7],f=n[2],d=n[5],g=n[8],x=i[0],m=i[3],p=i[6],y=i[1],v=i[4],_=i[7],w=i[2],T=i[5],R=i[8];return r[0]=o*x+a*y+c*w,r[3]=o*m+a*v+c*T,r[6]=o*p+a*_+c*R,r[1]=l*x+h*y+u*w,r[4]=l*m+h*v+u*T,r[7]=l*p+h*_+u*R,r[2]=f*x+d*y+g*w,r[5]=f*m+d*v+g*T,r[8]=f*p+d*_+g*R,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[3]*=t,e[6]*=t,e[1]*=t,e[4]*=t,e[7]*=t,e[2]*=t,e[5]*=t,e[8]*=t,this}extractBasis(t,e,n){return t.fromMatrix3Column(this,0),e.fromMatrix3Column(this,1),n.fromMatrix3Column(this,2),this}makeBasis(t,e,n){return this.set(t.x,e.x,n.x,t.y,e.y,n.y,t.z,e.z,n.z),this}lookAt(t,e,n){return b0.crossVectors(n,t).normalize(),Ua.crossVectors(M0,e).normalize(),Ua.squaredLength()===0&&(E0.copy(e).addScalar(Number.EPSILON),Ua.crossVectors(M0,E0).normalize()),w0.crossVectors(e,Ua).normalize(),mo.makeBasis(Ua,w0,e),hh.makeBasis(b0,n,t),this.multiplyMatrices(mo,hh.transpose()),this}transpose(){let t=this.elements,e;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getElementIndex(t,e){return t*3+e}frobeniusNorm(){let t=this.elements,e=0;for(let n=0;n<9;n++)e+=t[n]*t[n];return Math.sqrt(e)}offDiagonalFrobeniusNorm(){let t=this.elements,e=0;for(let n=0;n<3;n++){let i=t[this.getElementIndex(td[n],ed[n])];e+=2*i*i}return Math.sqrt(e)}eigenDecomposition(t){let e=0,n=0,i=10;t.unitary.identity(),t.diagonal.copy(this);let r=t.unitary,o=t.diagonal,a=Number.EPSILON*o.frobeniusNorm();for(;n<i&&o.offDiagonalFrobeniusNorm()>a;)o.shurDecomposition(mo),hh.copy(mo).transpose(),o.multiply(mo),o.premultiply(hh),r.multiply(mo),++e>2&&(n++,e=0);return t}shurDecomposition(t){let e=0,n=1,i=this.elements;for(let l=0;l<3;l++){let h=Math.abs(i[this.getElementIndex(td[l],ed[l])]);h>e&&(e=h,n=l)}let r=1,o=0,a=ed[n],c=td[n];if(Math.abs(i[this.getElementIndex(c,a)])>Number.EPSILON){let l=i[this.getElementIndex(c,c)],h=i[this.getElementIndex(a,a)],u=i[this.getElementIndex(c,a)],f=(l-h)/2/u,d;f<0?d=-1/(-f+Math.sqrt(1+f*f)):d=1/(f+Math.sqrt(1+f*f)),r=1/Math.sqrt(1+d*d),o=d*r}return t.identity(),t.elements[this.getElementIndex(a,a)]=r,t.elements[this.getElementIndex(c,c)]=r,t.elements[this.getElementIndex(c,a)]=o,t.elements[this.getElementIndex(a,c)]=-o,t}fromQuaternion(t){let e=this.elements,n=t.x,i=t.y,r=t.z,o=t.w,a=n+n,c=i+i,l=r+r,h=n*a,u=n*c,f=n*l,d=i*c,g=i*l,x=r*l,m=o*a,p=o*c,y=o*l;return e[0]=1-(d+x),e[3]=u-y,e[6]=f+p,e[1]=u+y,e[4]=1-(h+x),e[7]=g-m,e[2]=f-p,e[5]=g+m,e[8]=1-(h+d),this}fromMatrix4(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[4],e[4]=n[5],e[5]=n[6],e[6]=n[8],e[7]=n[9],e[8]=n[10],this}fromArray(t,e=0){let n=this.elements;for(let i=0;i<9;i++)n[i]=t[i+e];return this}toArray(t,e=0){let n=this.elements;return t[e+0]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t}equals(t){let e=this.elements,n=t.elements;for(let i=0;i<9;i++)if(e[i]!==n[i])return!1;return!0}},mo=new ji,hh=new ji,uh=new ji,nd=new Y,_o=class{constructor(t=0,e=0,n=0,i=1){this.x=t,this.y=e,this.z=n,this.w=i}set(t,e,n,i){return this.x=t,this.y=e,this.z=n,this.w=i,this}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w,this}clone(){return new this.constructor().copy(this)}inverse(){return this.conjugate().normalize()}conjugate(){return this.x*=-1,this.y*=-1,this.z*=-1,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}length(){return Math.sqrt(this.squaredLength())}squaredLength(){return this.dot(this)}normalize(){let t=this.length();return t===0?(this.x=0,this.y=0,this.z=0,this.w=1):(t=1/t,this.x=this.x*t,this.y=this.y*t,this.z=this.z*t,this.w=this.w*t),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,e){let n=t.x,i=t.y,r=t.z,o=t.w,a=e.x,c=e.y,l=e.z,h=e.w;return this.x=n*h+o*a+i*l-r*c,this.y=i*h+o*c+r*a-n*l,this.z=r*h+o*l+n*c-i*a,this.w=o*h-n*a-i*c-r*l,this}angleTo(t){return 2*Math.acos(Math.abs(Fn.clamp(this.dot(t),-1,1)))}rotateTo(t,e,n=1e-4){let i=this.angleTo(t);if(i<n)return!0;let r=Math.min(1,e/i);return this.slerp(t,r),!1}lookAt(t,e,n){uh.lookAt(t,e,n),this.fromMatrix3(uh)}slerp(t,e){if(e===0)return this;if(e===1)return this.copy(t);let n=this.x,i=this.y,r=this.z,o=this.w,a=o*t.w+n*t.x+i*t.y+r*t.z;if(a<0?(this.w=-t.w,this.x=-t.x,this.y=-t.y,this.z=-t.z,a=-a):this.copy(t),a>=1)return this.w=o,this.x=n,this.y=i,this.z=r,this;let c=Math.sqrt(1-a*a);if(Math.abs(c)<.001)return this.w=.5*(o+this.w),this.x=.5*(n+this.x),this.y=.5*(i+this.y),this.z=.5*(r+this.z),this;let l=Math.atan2(c,a),h=Math.sin((1-e)*l)/c,u=Math.sin(e*l)/c;return this.w=o*h+this.w*u,this.x=n*h+this.x*u,this.y=i*h+this.y*u,this.z=r*h+this.z*u,this}extractRotationFromMatrix(t){let e=uh.elements,n=t.elements,i=1/nd.fromMatrix4Column(t,0).length(),r=1/nd.fromMatrix4Column(t,1).length(),o=1/nd.fromMatrix4Column(t,2).length();return e[0]=n[0]*i,e[1]=n[1]*i,e[2]=n[2]*i,e[3]=n[4]*r,e[4]=n[5]*r,e[5]=n[6]*r,e[6]=n[8]*o,e[7]=n[9]*o,e[8]=n[10]*o,this.fromMatrix3(uh),this}fromEuler(t,e,n){let i=Math.cos(e/2),r=Math.cos(t/2),o=Math.cos(n/2),a=Math.sin(e/2),c=Math.sin(t/2),l=Math.sin(n/2);return this.w=i*r*o+a*c*l,this.x=i*c*o+a*r*l,this.y=a*r*o-i*c*l,this.z=i*r*l-a*c*o,this}toEuler(t){let e=-2*(this.y*this.z-this.x*this.w);return Math.abs(e)>.9999?(t.x=Math.PI*.5*e,t.y=Math.atan2(this.x*this.z+this.w*this.y,.5-this.x*this.x-this.y*this.y),t.z=0):(t.x=Math.asin(e),t.y=Math.atan2(this.x*this.z+this.w*this.y,.5-this.x*this.x-this.y*this.y),t.z=Math.atan2(this.x*this.y+this.w*this.z,.5-this.x*this.x-this.z*this.z)),t}fromMatrix3(t){let e=t.elements,n=e[0],i=e[3],r=e[6],o=e[1],a=e[4],c=e[7],l=e[2],h=e[5],u=e[8],f=n+a+u;if(f>0){let d=.5/Math.sqrt(f+1);this.w=.25/d,this.x=(h-c)*d,this.y=(r-l)*d,this.z=(o-i)*d}else if(n>a&&n>u){let d=2*Math.sqrt(1+n-a-u);this.w=(h-c)/d,this.x=.25*d,this.y=(i+o)/d,this.z=(r+l)/d}else if(a>u){let d=2*Math.sqrt(1+a-n-u);this.w=(r-l)/d,this.x=(i+o)/d,this.y=.25*d,this.z=(c+h)/d}else{let d=2*Math.sqrt(1+u-n-a);this.w=(o-i)/d,this.x=(r+l)/d,this.y=(c+h)/d,this.z=.25*d}return this}fromArray(t,e=0){return this.x=t[e+0],this.y=t[e+1],this.z=t[e+2],this.w=t[e+3],this}toArray(t,e=0){return t[e+0]=this.x,t[e+1]=this.y,t[e+2]=this.z,t[e+3]=this.w,t}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}},ys=class{constructor(){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}set(t,e,n,i,r,o,a,c,l,h,u,f,d,g,x,m){let p=this.elements;return p[0]=t,p[4]=e,p[8]=n,p[12]=i,p[1]=r,p[5]=o,p[9]=a,p[13]=c,p[2]=l,p[6]=h,p[10]=u,p[14]=f,p[3]=d,p[7]=g,p[11]=x,p[15]=m,this}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],e[9]=n[9],e[10]=n[10],e[11]=n[11],e[12]=n[12],e[13]=n[13],e[14]=n[14],e[15]=n[15],this}clone(){return new this.constructor().copy(this)}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,i=e.elements,r=this.elements,o=n[0],a=n[4],c=n[8],l=n[12],h=n[1],u=n[5],f=n[9],d=n[13],g=n[2],x=n[6],m=n[10],p=n[14],y=n[3],v=n[7],_=n[11],w=n[15],T=i[0],R=i[4],L=i[8],S=i[12],M=i[1],b=i[5],A=i[9],N=i[13],C=i[2],I=i[6],O=i[10],k=i[14],z=i[3],et=i[7],j=i[11],W=i[15];return r[0]=o*T+a*M+c*C+l*z,r[4]=o*R+a*b+c*I+l*et,r[8]=o*L+a*A+c*O+l*j,r[12]=o*S+a*N+c*k+l*W,r[1]=h*T+u*M+f*C+d*z,r[5]=h*R+u*b+f*I+d*et,r[9]=h*L+u*A+f*O+d*j,r[13]=h*S+u*N+f*k+d*W,r[2]=g*T+x*M+m*C+p*z,r[6]=g*R+x*b+m*I+p*et,r[10]=g*L+x*A+m*O+p*j,r[14]=g*S+x*N+m*k+p*W,r[3]=y*T+v*M+_*C+w*z,r[7]=y*R+v*b+_*I+w*et,r[11]=y*L+v*A+_*O+w*j,r[15]=y*S+v*N+_*k+w*W,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[4]*=t,e[8]*=t,e[12]*=t,e[1]*=t,e[5]*=t,e[9]*=t,e[13]*=t,e[2]*=t,e[6]*=t,e[10]*=t,e[14]*=t,e[3]*=t,e[7]*=t,e[11]*=t,e[15]*=t,this}extractBasis(t,e,n){return t.fromMatrix4Column(this,0),e.fromMatrix4Column(this,1),n.fromMatrix4Column(this,2),this}makeBasis(t,e,n){return this.set(t.x,e.x,n.x,0,t.y,e.y,n.y,0,t.z,e.z,n.z,0,0,0,0,1),this}compose(t,e,n){return this.fromQuaternion(e),this.scale(n),this.setPosition(t),this}scale(t){let e=this.elements,n=t.x,i=t.y,r=t.z;return e[0]*=n,e[4]*=i,e[8]*=r,e[1]*=n,e[5]*=i,e[9]*=r,e[2]*=n,e[6]*=i,e[10]*=r,e[3]*=n,e[7]*=i,e[11]*=r,this}setPosition(t){let e=this.elements;return e[12]=t.x,e[13]=t.y,e[14]=t.z,this}transpose(){let t=this.elements,e;return e=t[1],t[1]=t[4],t[4]=e,e=t[2],t[2]=t[8],t[8]=e,e=t[6],t[6]=t[9],t[9]=e,e=t[3],t[3]=t[12],t[12]=e,e=t[7],t[7]=t[13],t[13]=e,e=t[11],t[11]=t[14],t[14]=e,this}getInverse(t){let e=this.elements,n=t.elements,i=e[0],r=e[1],o=e[2],a=e[3],c=e[4],l=e[5],h=e[6],u=e[7],f=e[8],d=e[9],g=e[10],x=e[11],m=e[12],p=e[13],y=e[14],v=e[15],_=d*y*u-p*g*u+p*h*x-l*y*x-d*h*v+l*g*v,w=m*g*u-f*y*u-m*h*x+c*y*x+f*h*v-c*g*v,T=f*p*u-m*d*u+m*l*x-c*p*x-f*l*v+c*d*v,R=m*d*h-f*p*h-m*l*g+c*p*g+f*l*y-c*d*y,L=i*_+r*w+o*T+a*R;if(L===0)return t.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let S=1/L;return n[0]=_*S,n[1]=(p*g*a-d*y*a-p*o*x+r*y*x+d*o*v-r*g*v)*S,n[2]=(l*y*a-p*h*a+p*o*u-r*y*u-l*o*v+r*h*v)*S,n[3]=(d*h*a-l*g*a-d*o*u+r*g*u+l*o*x-r*h*x)*S,n[4]=w*S,n[5]=(f*y*a-m*g*a+m*o*x-i*y*x-f*o*v+i*g*v)*S,n[6]=(m*h*a-c*y*a-m*o*u+i*y*u+c*o*v-i*h*v)*S,n[7]=(c*g*a-f*h*a+f*o*u-i*g*u-c*o*x+i*h*x)*S,n[8]=T*S,n[9]=(m*d*a-f*p*a-m*r*x+i*p*x+f*r*v-i*d*v)*S,n[10]=(c*p*a-m*l*a+m*r*u-i*p*u-c*r*v+i*l*v)*S,n[11]=(f*l*a-c*d*a-f*r*u+i*d*u+c*r*x-i*l*x)*S,n[12]=R*S,n[13]=(f*p*o-m*d*o+m*r*g-i*p*g-f*r*y+i*d*y)*S,n[14]=(m*l*o-c*p*o-m*r*h+i*p*h+c*r*y-i*l*y)*S,n[15]=(c*d*o-f*l*o+f*r*h-i*d*h-c*r*g+i*l*g)*S,t}getMaxScale(){let t=this.elements,e=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],n=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],i=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(e,n,i))}fromQuaternion(t){let e=this.elements,n=t.x,i=t.y,r=t.z,o=t.w,a=n+n,c=i+i,l=r+r,h=n*a,u=n*c,f=n*l,d=i*c,g=i*l,x=r*l,m=o*a,p=o*c,y=o*l;return e[0]=1-(d+x),e[4]=u-y,e[8]=f+p,e[1]=u+y,e[5]=1-(h+x),e[9]=g-m,e[2]=f-p,e[6]=g+m,e[10]=1-(h+d),e[3]=0,e[7]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}fromMatrix3(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=0,e[4]=n[3],e[5]=n[4],e[6]=n[5],e[7]=0,e[8]=n[6],e[9]=n[7],e[10]=n[8],e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}fromArray(t,e=0){let n=this.elements;for(let i=0;i<16;i++)n[i]=t[i+e];return this}toArray(t,e=0){let n=this.elements;return t[e+0]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t[e+9]=n[9],t[e+10]=n[10],t[e+11]=n[11],t[e+12]=n[12],t[e+13]=n[13],t[e+14]=n[14],t[e+15]=n[15],t}equals(t){let e=this.elements,n=t.elements;for(let i=0;i<16;i++)if(e[i]!==n[i])return!1;return!0}},fh=new _o,gs=new Y,dh=new Y,go=new _o,Md=class{constructor(){this.name="",this.active=!0,this.children=new Array,this.parent=null,this.neighbors=new Array,this.neighborhoodRadius=1,this.updateNeighborhood=!1,this.position=new Y,this.rotation=new _o,this.scale=new Y(1,1,1),this.forward=new Y(0,0,1),this.up=new Y(0,1,0),this.boundingRadius=0,this.maxTurnRate=Math.PI,this.canActivateTrigger=!0,this.manager=null,this._localMatrix=new ys,this._worldMatrix=new ys,this._cache={position:new Y,rotation:new _o,scale:new Y(1,1,1)},this._renderComponent=null,this._renderComponentCallback=null,this._started=!1,this._uuid=null,this._worldMatrixDirty=!1}get worldMatrix(){return this._updateWorldMatrix(),this._worldMatrix}get uuid(){return this._uuid===null&&(this._uuid=Fn.generateUUID()),this._uuid}start(){return this}update(){return this}add(t){return t.parent!==null&&t.parent.remove(t),this.children.push(t),t.parent=this,this}remove(t){let e=this.children.indexOf(t);return this.children.splice(e,1),t.parent=null,this}getDirection(t){return t.copy(this.forward).applyRotation(this.rotation).normalize()}lookAt(t){let e=this.parent;return e!==null?(this.getWorldPosition(dh),gs.subVectors(t,dh).normalize(),this.rotation.lookAt(this.forward,gs,this.up),go.extractRotationFromMatrix(e.worldMatrix).inverse(),this.rotation.premultiply(go)):(gs.subVectors(t,this.position).normalize(),this.rotation.lookAt(this.forward,gs,this.up)),this}rotateTo(t,e,n=1e-4){let i=this.parent;return i!==null?(this.getWorldPosition(dh),gs.subVectors(t,dh).normalize(),fh.lookAt(this.forward,gs,this.up),go.extractRotationFromMatrix(i.worldMatrix).inverse(),fh.premultiply(go)):(gs.subVectors(t,this.position).normalize(),fh.lookAt(this.forward,gs,this.up)),this.rotation.rotateTo(fh,this.maxTurnRate*e,n)}getWorldDirection(t){return go.extractRotationFromMatrix(this.worldMatrix),t.copy(this.forward).applyRotation(go).normalize()}getWorldPosition(t){return t.extractPositionFromMatrix(this.worldMatrix)}setRenderComponent(t,e){return this._renderComponent=t,this._renderComponentCallback=e,this}handleMessage(){return!1}lineOfSightTest(){return null}sendMessage(t,e,n=0,i=null){return this.manager!==null?this.manager.sendMessage(this,t,e,n,i):Zn.error("YUKA.GameEntity: The game entity must be added to a manager in order to send a message."),this}toJSON(){return{type:this.constructor.name,uuid:this.uuid,name:this.name,active:this.active,children:T0(this.children),parent:this.parent!==null?this.parent.uuid:null,neighbors:T0(this.neighbors),neighborhoodRadius:this.neighborhoodRadius,updateNeighborhood:this.updateNeighborhood,position:this.position.toArray(new Array),rotation:this.rotation.toArray(new Array),scale:this.scale.toArray(new Array),forward:this.forward.toArray(new Array),up:this.up.toArray(new Array),boundingRadius:this.boundingRadius,maxTurnRate:this.maxTurnRate,canActivateTrigger:this.canActivateTrigger,worldMatrix:this.worldMatrix.toArray(new Array),_localMatrix:this._localMatrix.toArray(new Array),_cache:{position:this._cache.position.toArray(new Array),rotation:this._cache.rotation.toArray(new Array),scale:this._cache.scale.toArray(new Array)},_started:this._started}}fromJSON(t){return this.name=t.name,this.active=t.active,this.neighborhoodRadius=t.neighborhoodRadius,this.updateNeighborhood=t.updateNeighborhood,this.position.fromArray(t.position),this.rotation.fromArray(t.rotation),this.scale.fromArray(t.scale),this.forward.fromArray(t.forward),this.up.fromArray(t.up),this.boundingRadius=t.boundingRadius,this.maxTurnRate=t.maxTurnRate,this.canActivateTrigger=t.canActivateTrigger,this.children=t.children.slice(),this.neighbors=t.neighbors.slice(),this.parent=t.parent,this._localMatrix.fromArray(t._localMatrix),this._worldMatrix.fromArray(t.worldMatrix),this._cache.position.fromArray(t._cache.position),this._cache.rotation.fromArray(t._cache.rotation),this._cache.scale.fromArray(t._cache.scale),this._started=t._started,this._uuid=t.uuid,this}resolveReferences(t){let e=this.neighbors;for(let i=0,r=e.length;i<r;i++)e[i]=t.get(e[i]);let n=this.children;for(let i=0,r=n.length;i<r;i++)n[i]=t.get(n[i]);return this.parent=t.get(this.parent)||null,this}_updateMatrix(){let t=this._cache;t.position.equals(this.position)&&t.rotation.equals(this.rotation)&&t.scale.equals(this.scale)||(this._localMatrix.compose(this.position,this.rotation,this.scale),t.position.copy(this.position),t.rotation.copy(this.rotation),t.scale.copy(this.scale),this._worldMatrixDirty=!0)}_updateWorldMatrix(){let t=this.parent;if(t!==null&&t._updateWorldMatrix(),this._updateMatrix(),this._worldMatrixDirty===!0){t===null?this._worldMatrix.copy(this._localMatrix):this._worldMatrix.multiplyMatrices(this.parent._worldMatrix,this._localMatrix),this._worldMatrixDirty=!1;let e=this.children;for(let n=0,i=e.length;n<i;n++){let r=e[n];r._worldMatrixDirty=!0}}}updateWorldMatrix(){return console.warn("GameEntity: .updateWorldMatrix() has been removed. World matrices are automatically updated on access."),this}};function T0(s){let t=new Array;for(let e=0,n=s.length;e<n;e++)t.push(s[e].uuid);return t}var A0=new Y,id=new Y,bd=class extends Md{constructor(){super(),this.velocity=new Y,this.maxSpeed=1,this.updateOrientation=!0}update(t){return this.getSpeedSquared()>this.maxSpeed*this.maxSpeed&&(this.velocity.normalize(),this.velocity.multiplyScalar(this.maxSpeed)),A0.copy(this.velocity).multiplyScalar(t),id.copy(this.position).add(A0),this.updateOrientation&&this.getSpeedSquared()>1e-8&&this.lookAt(id),this.position.copy(id),this}getSpeed(){return this.velocity.length()}getSpeedSquared(){return this.velocity.squaredLength()}toJSON(){let t=super.toJSON();return t.velocity=this.velocity.toArray(new Array),t.maxSpeed=this.maxSpeed,t.updateOrientation=this.updateOrientation,t}fromJSON(t){return super.fromJSON(t),this.velocity.fromArray(t.velocity),this.maxSpeed=t.maxSpeed,this.updateOrientation=t.updateOrientation,this}},gn=class{constructor(){this.active=!0,this.weight=1}calculate(){}toJSON(){return{type:this.constructor.name,active:this.active,weight:this.weight}}fromJSON(t){return this.active=t.active,this.weight=t.weight,this}resolveReferences(){}},ph=new Y,mh=new Y,wd=class extends gn{constructor(){super()}calculate(t,e){ph.set(0,0,0);let n=t.neighbors;for(let i=0,r=n.length;i<r;i++)n[i].getDirection(mh),ph.add(mh);return n.length>0&&(ph.divideScalar(n.length),t.getDirection(mh),e.subVectors(ph,mh)),e}},sd=new Y,rd=new Y,vo=class extends gn{constructor(t=new Y,e=3,n=0){super(),this.target=t,this.deceleration=e,this.tolerance=n}calculate(t,e){let n=this.target,i=this.deceleration;rd.subVectors(n,t.position);let r=rd.length();if(r>this.tolerance){let o=r/i;o=Math.min(o,t.maxSpeed),sd.copy(rd).multiplyScalar(o/r)}else sd.set(0,0,0);return e.subVectors(sd,t.velocity)}toJSON(){let t=super.toJSON();return t.target=this.target.toArray(new Array),t.deceleration=this.deceleration,t}fromJSON(t){return super.fromJSON(t),this.target.fromArray(t.target),this.deceleration=t.deceleration,this}},od=new Y,_s=class extends gn{constructor(t=new Y){super(),this.target=t}calculate(t,e){let n=this.target;return od.subVectors(n,t.position).normalize(),od.multiplyScalar(t.maxSpeed),e.subVectors(od,t.velocity)}toJSON(){let t=super.toJSON();return t.target=this.target.toArray(new Array),t}fromJSON(t){return super.fromJSON(t),this.target.fromArray(t.target),this}},gh=new Y,Ed=class extends gn{constructor(){super(),this._seek=new _s}calculate(t,e){gh.set(0,0,0);let n=t.neighbors;for(let i=0,r=n.length;i<r;i++){let o=n[i];gh.add(o.position)}return n.length>0&&(gh.divideScalar(n.length),this._seek.target=gh,this._seek.calculate(t,e),e.normalize()),e}},Fa=new Y,Ih=class extends gn{constructor(t=new Y,e=10){super(),this.target=t,this.panicDistance=e}calculate(t,e){let n=this.target;return t.position.squaredDistanceTo(n)<=this.panicDistance*this.panicDistance&&(Fa.subVectors(t.position,n).normalize(),Fa.squaredLength()===0&&Fa.set(0,0,1),Fa.multiplyScalar(t.maxSpeed),e.subVectors(Fa,t.velocity)),e}toJSON(){let t=super.toJSON();return t.target=this.target.toArray(new Array),t.panicDistance=this.panicDistance,t}fromJSON(t){return super.fromJSON(t),this.target.fromArray(t.target),this.panicDistance=t.panicDistance,this}},R0=new Y,C0=new Y,I0=new Y,Ha=class extends gn{constructor(t=null,e=10,n=1){super(),this.pursuer=t,this.panicDistance=e,this.predictionFactor=n,this._flee=new Ih}calculate(t,e){let n=this.pursuer;R0.subVectors(n.position,t.position);let i=R0.length()/(t.maxSpeed+n.getSpeed());return i*=this.predictionFactor,C0.copy(n.velocity).multiplyScalar(i),I0.addVectors(n.position,C0),this._flee.target=I0,this._flee.panicDistance=this.panicDistance,this._flee.calculate(t,e),e}toJSON(){let t=super.toJSON();return t.pursuer=this.pursuer?this.pursuer.uuid:null,t.panicDistance=this.panicDistance,t.predictionFactor=this.predictionFactor,t}fromJSON(t){return super.fromJSON(t),this.pursuer=t.pursuer,this.panicDistance=t.panicDistance,this.predictionFactor=t.predictionFactor,this}resolveReferences(t){this.pursuer=t.get(this.pursuer)||null}},Td=class{constructor(){this.loop=!1,this._waypoints=new Array,this._index=0}add(t){return this._waypoints.push(t),this}clear(){return this._waypoints.length=0,this._index=0,this}current(){return this._waypoints[this._index]}finished(){let t=this._waypoints.length-1;return this.loop===!0?!1:this._index===t}advance(){return this._index++,this._index===this._waypoints.length&&(this.loop===!0?this._index=0:this._index--),this}toJSON(){let t={type:this.constructor.name,loop:this.loop,_waypoints:new Array,_index:this._index},e=this._waypoints;for(let n=0,i=e.length;n<i;n++){let r=e[n];t._waypoints.push(r.toArray(new Array))}return t}fromJSON(t){this.loop=t.loop,this._index=t._index;let e=t._waypoints;for(let n=0,i=e.length;n<i;n++){let r=e[n];this._waypoints.push(new Y().fromArray(r))}return this}},Ad=class extends gn{constructor(t=new Td,e=1){super(),this.path=t,this.nextWaypointDistance=e,this._arrive=new vo,this._seek=new _s}calculate(t,e){let n=this.path;n.current().squaredDistanceTo(t.position)<this.nextWaypointDistance*this.nextWaypointDistance&&n.advance();let r=n.current();return n.finished()===!0?(this._arrive.target=r,this._arrive.calculate(t,e)):(this._seek.target=r,this._seek.calculate(t,e)),e}toJSON(){let t=super.toJSON();return t.path=this.path.toJSON(),t.nextWaypointDistance=this.nextWaypointDistance,t}fromJSON(t){return super.fromJSON(t),this.path.fromJSON(t.path),this.nextWaypointDistance=t.nextWaypointDistance,this}},xh=new Y,yh=new Y,P0=new Y,L0=new Y,Rd=class extends gn{constructor(t=null,e=null,n=3){super(),this.entity1=t,this.entity2=e,this.deceleration=n,this._arrive=new vo}calculate(t,e){let n=this.entity1,i=this.entity2;xh.addVectors(n.position,i.position).multiplyScalar(.5);let r=t.position.distanceTo(xh)/t.maxSpeed;return yh.copy(n.velocity).multiplyScalar(r),P0.addVectors(n.position,yh),yh.copy(i.velocity).multiplyScalar(r),L0.addVectors(i.position,yh),xh.addVectors(P0,L0).multiplyScalar(.5),this._arrive.deceleration=this.deceleration,this._arrive.target=xh,this._arrive.calculate(t,e),e}toJSON(){let t=super.toJSON();return t.entity1=this.entity1?this.entity1.uuid:null,t.entity2=this.entity2?this.entity2.uuid:null,t.deceleration=this.deceleration,t}fromJSON(t){return super.fromJSON(t),this.entity1=t.entity1,this.entity2=t.entity2,this.deceleration=t.deceleration,this}resolveReferences(t){this.entity1=t.get(this.entity1)||null,this.entity2=t.get(this.entity2)||null}},Yn=new Y,Ba=new Y,xs=new Y,Ki=[new Y,new Y,new Y,new Y,new Y,new Y,new Y,new Y],Va=class{constructor(t=new Y,e=new Y){this.min=t,this.max=e}set(t,e){return this.min=t,this.max=e,this}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}clone(){return new this.constructor().copy(this)}clampPoint(t,e){return e.copy(t).clamp(this.min,this.max),e}containsPoint(t){return!(t.x<this.min.x||t.x>this.max.x||t.y<this.min.y||t.y>this.max.y||t.z<this.min.z||t.z>this.max.z)}expand(t){return this.min.min(t),this.max.max(t),this}getCenter(t){return t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return t.subVectors(this.max,this.min)}intersectsAABB(t){return!(t.max.x<this.min.x||t.min.x>this.max.x||t.max.y<this.min.y||t.min.y>this.max.y||t.max.z<this.min.z||t.min.z>this.max.z)}intersectsBoundingSphere(t){return this.clampPoint(t.center,Yn),Yn.squaredDistanceTo(t.center)<=t.radius*t.radius}intersectsPlane(t){let e=t.normal;this.getCenter(Ba),xs.subVectors(this.max,Ba);let n=xs.x*Math.abs(e.x)+xs.y*Math.abs(e.y)+xs.z*Math.abs(e.z),i=t.distanceToPoint(Ba);return Math.abs(i)<=n}getNormalFromSurfacePoint(t,e){e.set(0,0,0);let n,i=1/0;return this.getCenter(Ba),this.getSize(xs),Yn.copy(t).sub(Ba),n=Math.abs(xs.x-Math.abs(Yn.x)),n<i&&(i=n,e.set(1*Math.sign(Yn.x),0,0)),n=Math.abs(xs.y-Math.abs(Yn.y)),n<i&&(i=n,e.set(0,1*Math.sign(Yn.y),0)),n=Math.abs(xs.z-Math.abs(Yn.z)),n<i&&e.set(0,0,1*Math.sign(Yn.z)),e}fromCenterAndSize(t,e){return Yn.copy(e).multiplyScalar(.5),this.min.copy(t).sub(Yn),this.max.copy(t).add(Yn),this}fromPoints(t){this.min.set(1/0,1/0,1/0),this.max.set(-1/0,-1/0,-1/0);for(let e=0,n=t.length;e<n;e++)this.expand(t[e]);return this}applyMatrix4(t){let e=this.min,n=this.max;return Ki[0].set(e.x,e.y,e.z).applyMatrix4(t),Ki[1].set(e.x,e.y,n.z).applyMatrix4(t),Ki[2].set(e.x,n.y,e.z).applyMatrix4(t),Ki[3].set(e.x,n.y,n.z).applyMatrix4(t),Ki[4].set(n.x,e.y,e.z).applyMatrix4(t),Ki[5].set(n.x,e.y,n.z).applyMatrix4(t),Ki[6].set(n.x,n.y,e.z).applyMatrix4(t),Ki[7].set(n.x,n.y,n.z).applyMatrix4(t),this.fromPoints(Ki)}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}toJSON(){return{type:this.constructor.name,min:this.min.toArray(new Array),max:this.max.toArray(new Array)}}fromJSON(t){return this.min.fromArray(t.min),this.max.fromArray(t.max),this}},ad=new Va,So=class{constructor(t=new Y,e=0){this.center=t,this.radius=e}set(t,e){return this.center=t,this.radius=e,this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}clone(){return new this.constructor().copy(this)}clampPoint(t,e){return e.copy(t),this.center.squaredDistanceTo(t)>this.radius*this.radius&&(e.sub(this.center).normalize(),e.multiplyScalar(this.radius).add(this.center)),e}containsPoint(t){return t.squaredDistanceTo(this.center)<=this.radius*this.radius}intersectsBoundingSphere(t){let e=this.radius+t.radius;return t.center.squaredDistanceTo(this.center)<=e*e}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}getNormalFromSurfacePoint(t,e){return e.subVectors(t,this.center).normalize()}fromPoints(t){return ad.fromPoints(t),ad.getCenter(this.center),this.radius=this.center.distanceTo(ad.max),this}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScale(),this}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}toJSON(){return{type:this.constructor.name,center:this.center.toArray(new Array),radius:this.radius}}fromJSON(t){return this.center.fromArray(t.center),this.radius=t.radius,this}},Jn=new Y,cd=new Y,_h=new Y,ld=new Y,N0=new Y,vh=new ys,Nb=new ys,D0=new Va,Mo=class{constructor(t=new Y,e=new Y){this.origin=t,this.direction=e}set(t,e){return this.origin=t,this.direction=e,this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}clone(){return new this.constructor().copy(this)}at(t,e){return e.copy(this.direction).multiplyScalar(t).add(this.origin)}intersectBoundingSphere(t,e){Jn.subVectors(t.center,this.origin);let n=Jn.dot(this.direction),i=Jn.dot(Jn)-n*n,r=t.radius*t.radius;if(i>r)return null;let o=Math.sqrt(r-i),a=n-o,c=n+o;return a<0&&c<0?null:a<0?this.at(c,e):this.at(a,e)}intersectsBoundingSphere(t){let e=new Y,n,i=e.subVectors(t.center,this.origin).dot(this.direction);return i<0?n=this.origin.squaredDistanceTo(t.center):(e.copy(this.direction).multiplyScalar(i).add(this.origin),n=e.squaredDistanceTo(t.center)),n<=t.radius*t.radius}intersectAABB(t,e){let n,i,r,o,a,c,l=1/this.direction.x,h=1/this.direction.y,u=1/this.direction.z,f=this.origin;return l>=0?(n=(t.min.x-f.x)*l,i=(t.max.x-f.x)*l):(n=(t.max.x-f.x)*l,i=(t.min.x-f.x)*l),h>=0?(r=(t.min.y-f.y)*h,o=(t.max.y-f.y)*h):(r=(t.max.y-f.y)*h,o=(t.min.y-f.y)*h),n>o||r>i||((r>n||n!==n)&&(n=r),(o<i||i!==i)&&(i=o),u>=0?(a=(t.min.z-f.z)*u,c=(t.max.z-f.z)*u):(a=(t.max.z-f.z)*u,c=(t.min.z-f.z)*u),n>c||a>i)||((a>n||n!==n)&&(n=a),(c<i||i!==i)&&(i=c),i<0)?null:this.at(n>=0?n:i,e)}intersectsAABB(t){return this.intersectAABB(t,Jn)!==null}intersectPlane(t,e){let n,i=t.normal.dot(this.direction);if(i===0)if(t.distanceToPoint(this.origin)===0)n=0;else return null;else n=-(this.origin.dot(t.normal)+t.constant)/i;return n>=0?this.at(n,e):null}intersectsPlane(t){let e=t.distanceToPoint(this.origin);return e===0||t.normal.dot(this.direction)*e<0}intersectOBB(t,e){return t.getSize(N0),D0.fromCenterAndSize(Jn.set(0,0,0),N0),vh.fromMatrix3(t.rotation),vh.setPosition(t.center),O0.copy(this).applyMatrix4(vh.getInverse(Nb)),O0.intersectAABB(D0,e)?e.applyMatrix4(vh):null}intersectsOBB(t){return this.intersectOBB(t,Jn)!==null}intersectConvexHull(t,e){let n=t.faces,i=-1/0,r=1/0;for(let o=0,a=n.length;o<a;o++){let l=n[o].plane,h=l.distanceToPoint(this.origin),u=l.normal.dot(this.direction);if(h>0&&u>=0)return null;let f=u!==0?-h/u:0;if(!(f<=0)&&(u>0?r=Math.min(f,r):i=Math.max(f,i),i>r))return null}return i!==-1/0?this.at(i,e):this.at(r,e),e}intersectsConvexHull(t){return this.intersectConvexHull(t,Jn)!==null}intersectTriangle(t,e,n){let i=t.a,r=t.b,o=t.c;cd.subVectors(r,i),_h.subVectors(o,i),ld.crossVectors(cd,_h);let a=this.direction.dot(ld),c;if(a>0){if(e)return null;c=1}else if(a<0)c=-1,a=-a;else return null;Jn.subVectors(this.origin,i);let l=c*this.direction.dot(_h.crossVectors(Jn,_h));if(l<0)return null;let h=c*this.direction.dot(cd.cross(Jn));if(h<0||l+h>a)return null;let u=-c*Jn.dot(ld);return u<0?null:this.at(u/a,n)}intersectBVH(t,e){return t.root.intersectRay(this,e)}intersectsBVH(t){return t.root.intersectsRay(this)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}},O0=new Mo,U0=new ys,xo=new Y,Sh=new Y,hd=new Y,ud=new So,Db=new Mo(new Y(0,0,0),new Y(0,0,1)),Cd=class extends gn{constructor(t=new Array){super(),this.obstacles=t,this.brakingWeight=.2,this.dBoxMinLength=4}calculate(t,e){let n=this.obstacles,i=null,r=1/0,o=this.dBoxMinLength+t.getSpeed()/t.maxSpeed*this.dBoxMinLength;t.worldMatrix.getInverse(U0);for(let a=0,c=n.length;a<c;a++){let l=n[a];if(l!==t&&(xo.copy(l.position).applyMatrix4(U0),xo.z>0&&Math.abs(xo.z)<o)){let h=l.boundingRadius+t.boundingRadius;Math.abs(xo.x)<h&&(ud.center.copy(xo),ud.radius=h,Db.intersectBoundingSphere(ud,hd),hd.z<r&&(r=hd.z,i=l,Sh.copy(xo)))}}if(i!==null){let a=1+(o-Sh.z)/o;e.x=(i.boundingRadius-Sh.x)*a,e.z=(i.boundingRadius-Sh.z)*this.brakingWeight,e.applyRotation(t.rotation)}return e}toJSON(){let t=super.toJSON();t.obstacles=new Array,t.brakingWeight=this.brakingWeight,t.dBoxMinLength=this.dBoxMinLength;for(let e=0,n=this.obstacles.length;e<n;e++)t.obstacles.push(this.obstacles[e].uuid);return t}fromJSON(t){return super.fromJSON(t),this.obstacles=t.obstacles,this.brakingWeight=t.brakingWeight,this.dBoxMinLength=t.dBoxMinLength,this}resolveReferences(t){let e=this.obstacles;for(let n=0,i=e.length;n<i;n++)e[n]=t.get(e[n])}},fd=new Y,F0=new Y,B0=new Y,z0=new Y,Id=class extends gn{constructor(t=null,e=new Y){super(),this.leader=t,this.offset=e,this._arrive=new vo,this._arrive.deceleration=1.5}calculate(t,e){let n=this.leader,i=this.offset;fd.copy(i).applyMatrix4(n.worldMatrix),F0.subVectors(fd,t.position);let r=F0.length()/(t.maxSpeed+n.getSpeed());return B0.copy(n.velocity).multiplyScalar(r),z0.addVectors(fd,B0),this._arrive.target=z0,this._arrive.calculate(t,e),e}toJSON(){let t=super.toJSON();return t.leader=this.leader?this.leader.uuid:null,t.offset=this.offset,t}fromJSON(t){return super.fromJSON(t),this.leader=t.leader,this.offset=t.offset,this}resolveReferences(t){this.leader=t.get(this.leader)||null}},dd=new Y,pd=new Y,k0=new Y,H0=new Y,V0=new Y,Ga=class extends gn{constructor(t=null,e=1){super(),this.evader=t,this.predictionFactor=e,this._seek=new _s}calculate(t,e){let n=this.evader;dd.subVectors(n.position,t.position),t.getDirection(pd),n.getDirection(k0);let i=dd.dot(pd)>0,r=pd.dot(k0)<-.95;if(i===!0&&r===!0)return this._seek.target=n.position,this._seek.calculate(t,e),e;let o=dd.length()/(t.maxSpeed+n.getSpeed());return o*=this.predictionFactor,H0.copy(n.velocity).multiplyScalar(o),V0.addVectors(n.position,H0),this._seek.target=V0,this._seek.calculate(t,e),e}toJSON(){let t=super.toJSON();return t.evader=this.evader?this.evader.uuid:null,t.predictionFactor=this.predictionFactor,t}fromJSON(t){return super.fromJSON(t),this.evader=t.evader,this.predictionFactor=t.predictionFactor,this}resolveReferences(t){this.evader=t.get(this.evader)||null}},Mh=new Y,Pd=class extends gn{constructor(){super()}calculate(t,e){let n=t.neighbors;for(let i=0,r=n.length;i<r;i++){let o=n[i];Mh.subVectors(t.position,o.position);let a=Mh.length();a===0&&(a=1e-4),Mh.normalize().divideScalar(a),e.add(Mh)}return e}},bh=new Y,md=new Y,Ld=class extends gn{constructor(t=1,e=5,n=5){super(),this.radius=t,this.distance=e,this.jitter=n,this._targetLocal=new Y,Ob(this.radius,this._targetLocal)}calculate(t,e,n){let i=this.jitter*n;return md.x=Fn.randFloat(-1,1)*i,md.z=Fn.randFloat(-1,1)*i,this._targetLocal.add(md),this._targetLocal.normalize(),this._targetLocal.multiplyScalar(this.radius),bh.copy(this._targetLocal),bh.z+=this.distance,bh.applyMatrix4(t.worldMatrix),e.subVectors(bh,t.position),e}toJSON(){let t=super.toJSON();return t.radius=this.radius,t.distance=this.distance,t.jitter=this.jitter,t._targetLocal=this._targetLocal.toArray(new Array),t}fromJSON(t){return super.fromJSON(t),this.radius=t.radius,this.distance=t.distance,this.jitter=t.jitter,this._targetLocal.fromArray(t._targetLocal),this}};function Ob(s,t){let e=Math.random()*Math.PI*2;t.x=s*Math.cos(e),t.z=s*Math.sin(e)}var wh=new Y,Ph=class{constructor(t){this.vehicle=t,this.behaviors=new Array,this._steeringForce=new Y,this._typesMap=new Map}add(t){return this.behaviors.push(t),this}remove(t){let e=this.behaviors.indexOf(t);return this.behaviors.splice(e,1),this}clear(){return this.behaviors.length=0,this}calculate(t,e){return this._calculateByOrder(t),e.copy(this._steeringForce)}_accumulate(t){let e=this._steeringForce.length(),n=this.vehicle.maxForce-e;return n<=0?!1:(t.length()>n&&t.normalize().multiplyScalar(n),this._steeringForce.add(t),!0)}_calculateByOrder(t){let e=this.behaviors;this._steeringForce.set(0,0,0);for(let n=0,i=e.length;n<i;n++){let r=e[n];if(r.active===!0&&(wh.set(0,0,0),r.calculate(this.vehicle,wh,t),wh.multiplyScalar(r.weight),this._accumulate(wh)===!1))return}}toJSON(){let t={type:"SteeringManager",behaviors:new Array},e=this.behaviors;for(let n=0,i=e.length;n<i;n++){let r=e[n];t.behaviors.push(r.toJSON())}return t}fromJSON(t){this.clear();let e=t.behaviors;for(let n=0,i=e.length;n<i;n++){let r=e[n],o=r.type,a;switch(o){case"SteeringBehavior":a=new gn().fromJSON(r);break;case"AlignmentBehavior":a=new wd().fromJSON(r);break;case"ArriveBehavior":a=new vo().fromJSON(r);break;case"CohesionBehavior":a=new Ed().fromJSON(r);break;case"EvadeBehavior":a=new Ha().fromJSON(r);break;case"FleeBehavior":a=new Ih().fromJSON(r);break;case"FollowPathBehavior":a=new Ad().fromJSON(r);break;case"InterposeBehavior":a=new Rd().fromJSON(r);break;case"ObstacleAvoidanceBehavior":a=new Cd().fromJSON(r);break;case"OffsetPursuitBehavior":a=new Id().fromJSON(r);break;case"PursuitBehavior":a=new Ga().fromJSON(r);break;case"SeekBehavior":a=new _s().fromJSON(r);break;case"SeparationBehavior":a=new Pd().fromJSON(r);break;case"WanderBehavior":a=new Ld().fromJSON(r);break;default:let c=this._typesMap.get(o);if(c!==void 0)a=new c().fromJSON(r);else{Zn.warn("YUKA.SteeringManager: Unsupported steering behavior type:",o);continue}}this.add(a)}return this}registerType(t,e){return this._typesMap.set(t,e),this}resolveReferences(t){let e=this.behaviors;for(let n=0,i=e.length;n<i;n++)e[n].resolveReferences(t);return this}},Nd=class{constructor(t=10){this.count=t,this._history=new Array,this._slot=0;for(let e=0;e<this.count;e++)this._history[e]=new Y}calculate(t,e){e.set(0,0,0),this._slot===this.count&&(this._slot=0),this._history[this._slot].copy(t),this._slot++;for(let n=0;n<this.count;n++)e.add(this._history[n]);return e.divideScalar(this.count),e}toJSON(){let t={type:this.constructor.name,count:this.count,_history:new Array,_slot:this._slot},e=this._history;for(let n=0,i=e.length;n<i;n++){let r=e[n];t._history.push(r.toArray(new Array))}return t}fromJSON(t){this.count=t.count,this._slot=t._slot;let e=t._history;this._history.length=0;for(let n=0,i=e.length;n<i;n++){let r=e[n];this._history.push(new Y().fromArray(r))}return this}},G0=new Y,Eh=new Y,W0=new Y,za=new Y,X0=new Y,Lh=class extends bd{constructor(){super(),this.mass=1,this.maxForce=100,this.steering=new Ph(this),this.smoother=null}update(t){return this.steering.calculate(t,G0),W0.copy(G0).divideScalar(this.mass),this.velocity.add(W0.multiplyScalar(t)),this.getSpeedSquared()>this.maxSpeed*this.maxSpeed&&(this.velocity.normalize(),this.velocity.multiplyScalar(this.maxSpeed)),Eh.copy(this.velocity).multiplyScalar(t),za.copy(this.position).add(Eh),this.updateOrientation===!0&&this.smoother===null&&this.getSpeedSquared()>1e-8&&this.lookAt(za),this.position.copy(za),this.updateOrientation===!0&&this.smoother!==null&&(this.smoother.calculate(this.velocity,X0),Eh.copy(X0).multiplyScalar(t),za.copy(this.position).add(Eh),this.lookAt(za)),this}toJSON(){let t=super.toJSON();return t.mass=this.mass,t.maxForce=this.maxForce,t.steering=this.steering.toJSON(),t.smoother=this.smoother?this.smoother.toJSON():null,t}fromJSON(t){return super.fromJSON(t),this.mass=t.mass,this.maxForce=t.maxForce,this.steering=new Ph(this).fromJSON(t.steering),this.smoother=t.smoother?new Nd().fromJSON(t.smoother):null,this}resolveReferences(t){super.resolveReferences(t),this.steering.resolveReferences(t)}};var ER=new So,TR=new Y;var AR=new So;var RR=new Array;var yo=new Y,gd=new Y,Th=new Y,Wa=class{constructor(t=new Y(0,0,1),e=0){this.normal=t,this.constant=e}set(t,e){return this.normal=t,this.constant=e,this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}clone(){return new this.constructor().copy(this)}distanceToPoint(t){return this.normal.dot(t)+this.constant}fromNormalAndCoplanarPoint(t,e){return this.normal.copy(t),this.constant=-e.dot(this.normal),this}fromCoplanarPoints(t,e,n){return yo.subVectors(n,e).cross(gd.subVectors(t,e)).normalize(),this.fromNormalAndCoplanarPoint(yo,t),this}intersectPlane(t,e){Th.crossVectors(this.normal,t.normal);let n=Th.dot(Th);return n===0?null:(yo.copy(t.normal).multiplyScalar(this.constant),gd.copy(this.normal).multiplyScalar(t.constant),e.crossVectors(yo.sub(gd),Th).divideScalar(n),e)}intersectsPlane(t){let e=this.normal.dot(t.normal);return Math.abs(e)!==1}projectPoint(t,e){return yo.copy(this.normal).multiplyScalar(this.distanceToPoint(t)),e.subVectors(t,yo),e}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}},CR=new So,IR={a:new Y,b:new Y,c:new Y},PR=new Mo,LR=new Wa,NR=new ys,DR=new Y,OR={a:new Y,b:new Y,c:new Y};var Nh=class{clearDegreeOfMembership(){}getDegreeOfMembership(){}updateDegreeOfMembership(){}toJSON(){return{type:this.constructor.name}}},vs=class s extends Nh{constructor(t=new Array){super(),this.terms=t}clearDegreeOfMembership(){let t=this.terms;for(let e=0,n=t.length;e<n;e++)t[e].clearDegreeOfMembership();return this}updateDegreeOfMembership(t){let e=this.terms;for(let n=0,i=e.length;n<i;n++)e[n].updateDegreeOfMembership(t);return this}toJSON(){let t=super.toJSON();t.terms=new Array;for(let e=0,n=this.terms.length;e<n;e++){let i=this.terms[e];i instanceof s?t.terms.push(i.toJSON()):t.terms.push(i.uuid)}return t}},Dd=class extends vs{constructor(){let t=Array.from(arguments);super(t)}getDegreeOfMembership(){let t=this.terms,e=1/0;for(let n=0,i=t.length;n<i;n++){let o=t[n].getDegreeOfMembership();o<e&&(e=o)}return e}},Od=class extends vs{constructor(t=null){let e=t!==null?[t]:new Array;super(e)}clearDegreeOfMembership(){return this.terms[0].clearDegreeOfMembership(),this}getDegreeOfMembership(){let e=this.terms[0].getDegreeOfMembership();return Math.sqrt(e)}updateDegreeOfMembership(t){return this.terms[0].updateDegreeOfMembership(Math.sqrt(t)),this}},Ud=class extends vs{constructor(){let t=Array.from(arguments);super(t)}getDegreeOfMembership(){let t=this.terms,e=-1/0;for(let n=0,i=t.length;n<i;n++){let o=t[n].getDegreeOfMembership();o>e&&(e=o)}return e}},Fd=class extends vs{constructor(t=null){let e=t!==null?[t]:new Array;super(e)}clearDegreeOfMembership(){return this.terms[0].clearDegreeOfMembership(),this}getDegreeOfMembership(){let e=this.terms[0].getDegreeOfMembership();return e*e}updateDegreeOfMembership(t){return this.terms[0].updateDegreeOfMembership(t*t),this}},bo=class extends Nh{constructor(t=0){super(),this.degreeOfMembership=0,this.representativeValue=t,this.left=0,this.right=0,this._uuid=null}get uuid(){return this._uuid===null&&(this._uuid=Fn.generateUUID()),this._uuid}computeDegreeOfMembership(){}clearDegreeOfMembership(){return this.degreeOfMembership=0,this}getDegreeOfMembership(){return this.degreeOfMembership}updateDegreeOfMembership(t){return t>this.degreeOfMembership&&(this.degreeOfMembership=t),this}toJSON(){let t=super.toJSON();return t.degreeOfMembership=this.degreeOfMembership,t.representativeValue=this.representativeValue,t.left=this.left,t.right=this.right,t.uuid=this.uuid,t}fromJSON(t){return this.degreeOfMembership=t.degreeOfMembership,this.representativeValue=t.representativeValue,this.left=t.left,this.right=t.right,this._uuid=t.uuid,this}};var Bd=class extends bo{constructor(t=0,e=0,n=0){let i=(e+t)/2;super(i),this.left=t,this.midpoint=e,this.right=n}computeDegreeOfMembership(t){let e=this.midpoint,n=this.left,i=this.right;return t>=n&&t<=e?1:t>e&&t<=i?1/(i-e)*(i-t):0}toJSON(){let t=super.toJSON();return t.midpoint=this.midpoint,t}fromJSON(t){return super.fromJSON(t),this.midpoint=t.midpoint,this}};var zd=class extends bo{constructor(t=0,e=0,n=0){let i=(e+n)/2;super(i),this.left=t,this.midpoint=e,this.right=n}computeDegreeOfMembership(t){let e=this.midpoint,n=this.left,i=this.right;return t>=n&&t<=e?1/(e-n)*(t-n):t>e&&t<=i?1:0}toJSON(){let t=super.toJSON();return t.midpoint=this.midpoint,t}fromJSON(t){return super.fromJSON(t),this.midpoint=t.midpoint,this}},kd=class extends bo{constructor(t=0,e=0,n=0){super(e),this.left=t,this.midpoint=e,this.right=n}computeDegreeOfMembership(t){let e=this.left,n=this.right;return t>=e&&t<=n?1:0}toJSON(){let t=super.toJSON();return t.midpoint=this.midpoint,t}fromJSON(t){return super.fromJSON(t),this.midpoint=t.midpoint,this}},Hd=class extends bo{constructor(t=0,e=0,n=0){super(e),this.left=t,this.midpoint=e,this.right=n}computeDegreeOfMembership(t){let e=this.midpoint,n=this.left,i=this.right;return t>=n&&t<=e?1/(e-n)*(t-n):t>e&&t<=i?1/(i-e)*(i-t):0}toJSON(){let t=super.toJSON();return t.midpoint=this.midpoint,t}fromJSON(t){return super.fromJSON(t),this.midpoint=t.midpoint,this}},Vd=class{constructor(t=null,e=null){this.antecedent=t,this.consequence=e}initConsequence(){return this.consequence.clearDegreeOfMembership(),this}evaluate(){return this.consequence.updateDegreeOfMembership(this.antecedent.getDegreeOfMembership()),this}toJSON(){let t={},e=this.antecedent,n=this.consequence;return t.type=this.constructor.name,t.antecedent=e instanceof vs?e.toJSON():e.uuid,t.consequence=n instanceof vs?n.toJSON():n.uuid,t}fromJSON(t,e){function n(i){if(typeof i=="string"){let r=i;return e.get(r)||null}else{let r=i.type,o;switch(r){case"FuzzyAND":o=new Dd;break;case"FuzzyOR":o=new Ud;break;case"FuzzyVERY":o=new Fd;break;case"FuzzyFAIRLY":o=new Od;break;default:Zn.error("YUKA.FuzzyRule: Unsupported operator type:",r);return}let a=i.terms;for(let c=0,l=a.length;c<l;c++)o.terms.push(n(a[c]));return o}}return this.antecedent=n(t.antecedent),this.consequence=n(t.consequence),this}},Gd=class{constructor(){this.fuzzySets=new Array,this.minRange=1/0,this.maxRange=-1/0}add(t){return this.fuzzySets.push(t),t.left<this.minRange&&(this.minRange=t.left),t.right>this.maxRange&&(this.maxRange=t.right),this}remove(t){let e=this.fuzzySets,n=e.indexOf(t);e.splice(n,1),this.minRange=1/0,this.maxRange=-1/0;for(let i=0,r=e.length;i<r;i++){let o=e[i];o.left<this.minRange&&(this.minRange=o.left),o.right>this.maxRange&&(this.maxRange=o.right)}return this}fuzzify(t){if(t<this.minRange||t>this.maxRange){Zn.warn("YUKA.FuzzyVariable: Value for fuzzification out of range.");return}let e=this.fuzzySets;for(let n=0,i=e.length;n<i;n++){let r=e[n];r.degreeOfMembership=r.computeDegreeOfMembership(t)}return this}defuzzifyMaxAv(){let t=this.fuzzySets,e=0,n=0;for(let i=0,r=t.length;i<r;i++){let o=t[i];e+=o.degreeOfMembership,n+=o.representativeValue*o.degreeOfMembership}return e===0?0:n/e}defuzzifyCentroid(t=10){let e=this.fuzzySets,n=(this.maxRange-this.minRange)/t,i=0,r=0;for(let o=1;o<=t;o++){let a=this.minRange+o*n;for(let c=0,l=e.length;c<l;c++){let h=e[c],u=Math.min(h.degreeOfMembership,h.computeDegreeOfMembership(a));i+=u,r+=a*u}}return i===0?0:r/i}toJSON(){let t={type:this.constructor.name,fuzzySets:new Array,minRange:this.minRange.toString(),maxRange:this.maxRange.toString()};for(let e=0,n=this.fuzzySets.length;e<n;e++){let i=this.fuzzySets[e];t.fuzzySets.push(i.toJSON())}return t}fromJSON(t){this.minRange=parseFloat(t.minRange),this.maxRange=parseFloat(t.maxRange);for(let e=0,n=t.fuzzySets.length;e<n;e++){let i=t.fuzzySets[e];switch(i.type){case"LeftShoulderFuzzySet":this.fuzzySets.push(new Bd().fromJSON(i));break;case"RightShoulderFuzzySet":this.fuzzySets.push(new zd().fromJSON(i));break;case"SingletonFuzzySet":this.fuzzySets.push(new kd().fromJSON(i));break;case"TriangularFuzzySet":this.fuzzySets.push(new Hd().fromJSON(i));break;default:Zn.error("YUKA.FuzzyVariable: Unsupported fuzzy set type:",i.type)}}return this}},Wd=class s{constructor(){this.rules=new Array,this.flvs=new Map}addFLV(t,e){return this.flvs.set(t,e),this}removeFLV(t){return this.flvs.delete(t),this}addRule(t){return this.rules.push(t),this}removeRule(t){let e=this.rules,n=e.indexOf(t);return e.splice(n,1),this}fuzzify(t,e){return this.flvs.get(t).fuzzify(e),this}defuzzify(t,e=s.DEFUZ_TYPE.MAXAV){let n=this.flvs,i=this.rules;this._initConsequences();for(let a=0,c=i.length;a<c;a++)i[a].evaluate();let r=n.get(t),o;switch(e){case s.DEFUZ_TYPE.MAXAV:o=r.defuzzifyMaxAv();break;case s.DEFUZ_TYPE.CENTROID:o=r.defuzzifyCentroid();break;default:Zn.warn("YUKA.FuzzyModule: Unknown defuzzification method:",e),o=r.defuzzifyMaxAv()}return o}_initConsequences(){let t=this.rules;for(let e=0,n=t.length;e<n;e++)t[e].initConsequence();return this}toJSON(){let t={rules:new Array,flvs:new Array},e=this.rules;for(let i=0,r=e.length;i<r;i++)t.rules.push(e[i].toJSON());let n=this.flvs;for(let[i,r]of n)t.flvs.push({name:i,flv:r.toJSON()});return t}fromJSON(t){let e=new Map,n=t.flvs;for(let r=0,o=n.length;r<o;r++){let a=n[r],c=a.name,l=new Gd().fromJSON(a.flv);this.addFLV(c,l);for(let h of l.fuzzySets)e.set(h.uuid,h)}let i=t.rules;for(let r=0,o=i.length;r<o;r++){let a=i[r],c=new Vd().fromJSON(a,e);this.addRule(c)}return this}};Wd.DEFUZ_TYPE=Object.freeze({MAXAV:0,CENTROID:1});var Xd=class s{constructor(t=null){this.owner=t,this.status=s.STATUS.INACTIVE}activate(){}execute(){}terminate(){}handleMessage(){return!1}active(){return this.status===s.STATUS.ACTIVE}inactive(){return this.status===s.STATUS.INACTIVE}completed(){return this.status===s.STATUS.COMPLETED}failed(){return this.status===s.STATUS.FAILED}replanIfFailed(){return this.failed()===!0&&(this.status=s.STATUS.INACTIVE),this}activateIfInactive(){return this.inactive()===!0&&(this.status=s.STATUS.ACTIVE,this.activate()),this}toJSON(){return{type:this.constructor.name,owner:this.owner.uuid,status:this.status}}fromJSON(t){return this.owner=t.owner,this.status=t.status,this}resolveReferences(t){return this.owner=t.get(this.owner)||null,this}};Xd.STATUS=Object.freeze({ACTIVE:"active",INACTIVE:"inactive",COMPLETED:"completed",FAILED:"failed"});var UR=new Y,FR=new Y,BR=new Y,zR=new Y(1,0,0),kR=new Y(0,1,0),HR=new Y(0,0,1),VR={a:new Y,b:new Y,c:new Y},GR=new Y,WR=new Array;var q0=new Y,Ah=new Y,Xa=class{constructor(t=new Y,e=new Y){this.from=t,this.to=e}set(t,e){return this.from=t,this.to=e,this}copy(t){return this.from.copy(t.from),this.to.copy(t.to),this}clone(){return new this.constructor().copy(this)}delta(t){return t.subVectors(this.to,this.from)}at(t,e){return this.delta(e).multiplyScalar(t).add(this.from)}closestPointToPoint(t,e,n){let i=this.closestPointToPointParameter(t,e);return this.at(i,n)}closestPointToPointParameter(t,e=!0){q0.subVectors(t,this.from),Ah.subVectors(this.to,this.from);let n=Ah.dot(Ah),r=Ah.dot(q0)/n;return e&&(r=Fn.clamp(r,0,1)),r}equals(t){return t.from.equals(this.from)&&t.to.equals(this.to)}},Rh=new Y,$0=new Y,xd=new Y,yd=new Y,_d=new Y,vd=new Y,Y0=new Y,qd=class{intersects(t,e){return!(this._checkFaceDirections(t,e)||this._checkFaceDirections(e,t)||this._checkEdgeDirections(t,e))}_checkFaceDirections(t,e){let n=t.faces;for(let i=0,r=n.length;i<r;i++){let a=n[i].plane;$0.copy(a.normal).multiplyScalar(-1);let c=this._getSupportVertex(e,$0);if(a.distanceToPoint(c)>0)return!0}return!1}_checkEdgeDirections(t,e){let n=t.edges,i=e.edges;for(let r=0,o=n.length;r<o;r++){let a=n[r];for(let c=0,l=i.length;c<l;c++){let h=i[c];if(a.getDirection(xd),h.getDirection(yd),this._minkowskiFace(a,xd,h,yd)&&this._distanceBetweenEdges(a,xd,h,yd,t)>0)return!0}}return!1}_getSupportVertex(t,e){let n=-1/0,i=null,r=t.vertices;for(let o=0,a=r.length;o<a;o++){let c=r[o],l=c.dot(e);l>n&&(n=l,i=c)}return i}_minkowskiFace(t,e,n,i){let r=t.polygon.plane.normal,o=t.twin.polygon.plane.normal;_d.copy(n.polygon.plane.normal),vd.copy(n.twin.polygon.plane.normal),_d.multiplyScalar(-1),vd.multiplyScalar(-1);let a=_d.dot(e),c=vd.dot(e),l=r.dot(i),h=o.dot(i);return a*c<0&&l*h<0&&a*h>0}_distanceBetweenEdges(t,e,n,i,r){return Math.abs(e.dot(i))===1?-1/0:(Rh.crossVectors(e,i).normalize(),Rh.dot(Y0.subVectors(t.vertex,r.centroid))<0&&Rh.multiplyScalar(-1),Rh.dot(Y0.subVectors(n.vertex,t.vertex)))}},$d=class{constructor(t=new Y){this.vertex=t,this.next=null,this.prev=null,this.twin=null,this.polygon=null}tail(){return this.prev?this.prev.vertex:null}head(){return this.vertex}length(){let t=this.tail(),e=this.head();return t!==null?t.distanceTo(e):-1}squaredLength(){let t=this.tail(),e=this.head();return t!==null?t.squaredDistanceTo(e):-1}linkOpponent(t){return this.twin=t,t.twin=this,this}getDirection(t){return t.subVectors(this.vertex,this.prev.vertex).normalize()}},Zi=class{constructor(){this.centroid=new Y,this.edge=null,this.plane=new Wa}fromContour(t){let e=new Array;if(t.length<3)return Zn.error("YUKA.Polygon: Unable to create polygon from contour. It needs at least three points."),this;for(let n=0,i=t.length;n<i;n++){let r=new $d(t[n]);e.push(r)}for(let n=0,i=e.length;n<i;n++){let r,o,a;n===0?(r=e[n],o=e[i-1],a=e[n+1]):n===i-1?(r=e[n],o=e[n-1],a=e[0]):(r=e[n],o=e[n-1],a=e[n+1]),r.prev=o,r.next=a,r.polygon=this}return this.edge=e[0],this.plane.fromCoplanarPoints(t[0],t[1],t[2]),this}computeCentroid(){let t=this.centroid,e=this.edge,n=0;t.set(0,0,0);do t.add(e.vertex),n++,e=e.next;while(e!==this.edge);return t.divideScalar(n),this}contains(t,e=.001){let n=this.plane,i=this.edge;do{let o=i.tail(),a=i.head();if(Sd(o,a,t)===!1)return!1;i=i.next}while(i!==this.edge);let r=n.distanceToPoint(t);return!(Math.abs(r)>e)}convex(t=!0){let e=this.edge;do{let n=e.tail(),i=e.head(),r=e.next.head();if(t){if(Sd(n,i,r)===!1)return!1}else if(Sd(r,i,n)===!1)return!1;e=e.next}while(e!==this.edge);return!0}coplanar(t=.001){let e=this.plane,n=this.edge;do{let i=e.distanceToPoint(n.vertex);if(Math.abs(i)>t)return!1;n=n.next}while(n!==this.edge);return!0}distanceToPoint(t){return this.plane.distanceToPoint(t)}getContour(t){let e=this.edge;t.length=0;do t.push(e.vertex),e=e.next;while(e!==this.edge);return t}};function Sd(s,t,e){return Fn.area(s,t,e)>=0}var Dh=class{constructor(){this.faces=new Array,this.edges=new Array,this.vertices=new Array,this.centroid=new Y}computeCentroid(){let t=this.centroid,e=this.faces;t.set(0,0,0);for(let n=0,i=e.length;n<i;n++){let r=e[n];t.add(r.centroid)}return t.divideScalar(e.length),this}computeUniqueVertices(){let t=this.faces,e=this.vertices;e.length=0;let n=new Set;for(let i=0,r=t.length;i<r;i++){let o=t[i],a=o.edge;do n.add(a.vertex),a=a.next;while(a!==o.edge)}return e.push(...n),this}computeUniqueEdges(){let t=this.faces,e=this.edges;e.length=0;for(let n=0,i=t.length;n<i;n++){let r=t[n],o=r.edge;do e.includes(o.twin)===!1&&e.push(o),o=o.next;while(o!==r.edge)}return this}fromAABB(t){this.faces.length=0,this.vertices.length=0;let e=t.min,n=t.max,i=[new Y(n.x,n.y,n.z),new Y(n.x,n.y,e.z),new Y(n.x,e.y,n.z),new Y(n.x,e.y,e.z),new Y(e.x,n.y,n.z),new Y(e.x,n.y,e.z),new Y(e.x,e.y,n.z),new Y(e.x,e.y,e.z)];this.vertices.push(...i);let r=new Zi().fromContour([i[4],i[0],i[1],i[5]]),o=new Zi().fromContour([i[2],i[3],i[1],i[0]]),a=new Zi().fromContour([i[6],i[2],i[0],i[4]]),c=new Zi().fromContour([i[3],i[7],i[5],i[1]]),l=new Zi().fromContour([i[3],i[2],i[6],i[7]]),h=new Zi().fromContour([i[7],i[6],i[4],i[5]]);return r.edge.linkOpponent(h.edge.prev),r.edge.next.linkOpponent(a.edge.prev),r.edge.next.next.linkOpponent(o.edge.prev),r.edge.prev.linkOpponent(c.edge.prev),l.edge.linkOpponent(c.edge.next),l.edge.next.linkOpponent(o.edge.next),l.edge.next.next.linkOpponent(a.edge.next),l.edge.prev.linkOpponent(h.edge.next),h.edge.linkOpponent(c.edge.next.next),c.edge.linkOpponent(o.edge.next.next),o.edge.linkOpponent(a.edge.next.next),a.edge.linkOpponent(h.edge.next.next),this.faces.push(r,o,a,c,l,h),r.computeCentroid(),o.computeCentroid(),a.computeCentroid(),c.computeCentroid(),l.computeCentroid(),h.computeCentroid(),t.getCenter(this.centroid),this.computeUniqueEdges(),this}},J0=new Xa,Ch=new Wa,K0=new Y,Ub=new Y(0,1,0),Z0=new qd,ka,Yd=class extends Dh{constructor(){super(),this.mergeFaces=!0,this._tolerance=-1,this._vertices=new Array,this._assigned=new Oh,this._unassigned=new Oh}containsPoint(t){let e=this.faces;for(let n=0,i=e.length;n<i;n++)if(e[n].distanceToPoint(t)>this._tolerance)return!1;return!0}intersectsAABB(t){if(ka===void 0)ka=new Dh().fromAABB(t);else{let e=t.min,n=t.max,i=ka.vertices;i[0].set(n.x,n.y,n.z),i[1].set(n.x,n.y,e.z),i[2].set(n.x,e.y,n.z),i[3].set(n.x,e.y,e.z),i[4].set(e.x,n.y,n.z),i[5].set(e.x,n.y,e.z),i[6].set(e.x,e.y,n.z),i[7].set(e.x,e.y,e.z),t.getCenter(ka.centroid)}return Z0.intersects(this,ka)}intersectsConvexHull(t){return Z0.intersects(this,t)}fromPoints(t){if(t.length<4)return Zn.error("YUKA.ConvexHull: The given points array needs at least four points."),this;for(let e=0,n=t.length;e<n;e++)this._vertices.push(new Jd(t[e]));return this._generate(),this}_addAdjoiningFace(t,e){let n=new di(t.point,e.prev.vertex,e.vertex);return this.faces.push(n),n.getEdge(-1).linkOpponent(e.twin),n.getEdge(0)}_addNewFaces(t,e){let n=[],i=null,r=null;for(let o=0,a=e.length;o<a;o++){let c=this._addAdjoiningFace(t,e[o]);i===null?i=c:c.next.linkOpponent(r),n.push(c.polygon),r=c}return i.next.linkOpponent(r),n}_addVertexToFace(t,e){return t.face=e,e.outside===null?(this._assigned.append(t),e.outside=t):this._assigned.insertAfter(e.outside,t),this}_addVertexToHull(t){let e=[];this._unassigned.clear(),this._computeHorizon(t.point,null,t.face,e);let n=this._addNewFaces(t,e);return this._resolveUnassignedPoints(n),this}_reset(){return this._vertices.length=0,this._assigned.clear(),this._unassigned.clear(),this}_computeInitialHull(){let t,e,n,i,r=this._vertices,o=this._computeExtremes(),a=o.min,c=o.max,l,h;h=c.x.point.x-a.x.point.x,t=a.x,e=c.x,l=c.y.point.y-a.y.point.y,l>h&&(t=a.y,e=c.y,h=l),l=c.z.point.z-a.z.point.z,l>h&&(t=a.z,e=c.z),h=-1/0,J0.set(t.point,e.point);for(let f=0,d=r.length;f<d;f++){let g=r[f];g!==t&&g!==e&&(J0.closestPointToPoint(g.point,!0,K0),l=K0.squaredDistanceTo(g.point),l>h&&(h=l,n=g))}h=-1/0,Ch.fromCoplanarPoints(t.point,e.point,n.point);for(let f=0,d=r.length;f<d;f++){let g=r[f];g!==t&&g!==e&&g!==n&&(l=Math.abs(Ch.distanceToPoint(g.point)),l>h&&(h=l,i=g))}if(Ch.distanceToPoint(i.point)===0)throw"ERROR: YUKA.ConvexHull: All extreme points lie in a single plane. Unable to compute convex hull.";let u=this.faces;Ch.distanceToPoint(i.point)<0?(u.push(new di(t.point,e.point,n.point),new di(i.point,e.point,t.point),new di(i.point,n.point,e.point),new di(i.point,t.point,n.point)),u[1].getEdge(2).linkOpponent(u[0].getEdge(1)),u[2].getEdge(2).linkOpponent(u[0].getEdge(2)),u[3].getEdge(2).linkOpponent(u[0].getEdge(0)),u[1].getEdge(1).linkOpponent(u[2].getEdge(0)),u[2].getEdge(1).linkOpponent(u[3].getEdge(0)),u[3].getEdge(1).linkOpponent(u[1].getEdge(0))):(u.push(new di(t.point,n.point,e.point),new di(i.point,t.point,e.point),new di(i.point,e.point,n.point),new di(i.point,n.point,t.point)),u[1].getEdge(2).linkOpponent(u[0].getEdge(0)),u[2].getEdge(2).linkOpponent(u[0].getEdge(2)),u[3].getEdge(2).linkOpponent(u[0].getEdge(1)),u[1].getEdge(0).linkOpponent(u[2].getEdge(1)),u[2].getEdge(0).linkOpponent(u[3].getEdge(1)),u[3].getEdge(0).linkOpponent(u[1].getEdge(1)));for(let f=0,d=r.length;f<d;f++){let g=r[f];if(g!==t&&g!==e&&g!==n&&g!==i){h=this._tolerance;let x=null;for(let m=0;m<4;m++)l=u[m].distanceToPoint(g.point),l>h&&(h=l,x=u[m]);x!==null&&this._addVertexToFace(g,x)}}return this}_computeExtremes(){let t=new Y(1/0,1/0,1/0),e=new Y(-1/0,-1/0,-1/0),n={x:null,y:null,z:null},i={x:null,y:null,z:null};for(let r=0,o=this._vertices.length;r<o;r++){let a=this._vertices[r],c=a.point;c.x<t.x&&(t.x=c.x,n.x=a),c.y<t.y&&(t.y=c.y,n.y=a),c.z<t.z&&(t.z=c.z,n.z=a),c.x>e.x&&(e.x=c.x,i.x=a),c.y>e.y&&(e.y=c.y,i.y=a),c.z>e.z&&(e.z=c.z,i.z=a)}return this._tolerance=3*Number.EPSILON*(Math.max(Math.abs(t.x),Math.abs(e.x))+Math.max(Math.abs(t.y),Math.abs(e.y))+Math.max(Math.abs(t.z),Math.abs(e.z))),{min:n,max:i}}_computeHorizon(t,e,n,i){if(n.outside){let o=n.outside;this._removeAllVerticesFromFace(n),this._unassigned.appendChain(o)}n.active=!1;let r;e===null?r=e=n.getEdge(0):r=e.next;do{let o=r.twin,a=o.polygon;a.active&&(a.distanceToPoint(t)>this._tolerance?this._computeHorizon(t,o,a,i):i.push(r)),r=r.next}while(r!==e);return this}_generate(){this.faces.length=0,this._computeInitialHull();let t;for(;t=this._nextVertexToAdd();)this._addVertexToHull(t);return this._updateFaces(),this._postprocessHull(),this._reset(),this}_postprocessHull(){let t=this.faces,e=this.edges;if(this.mergeFaces===!0){let n={leftPrev:null,leftNext:null,rightPrev:null,rightNext:null};this.computeUniqueEdges(),e.sort((i,r)=>r.length()-i.length());for(let i=0,r=e.length;i<r;i++){let o=e[i];if(this._mergePossible(o)===!1)continue;let a=o;n.prev=a.prev,n.next=a.next,n.prevTwin=a.twin.prev,n.nextTwin=a.twin.next,a.prev.next=a.twin.next,a.next.prev=a.twin.prev,a.twin.prev.next=a.next,a.twin.next.prev=a.prev;let c=a.polygon;c.edge=a.prev;let l=c.plane.normal.dot(Ub)>=0;if(c.convex(l)===!0&&c.coplanar(this._tolerance)===!0){let h=c.edge;do h.polygon=c,h=h.next;while(h!==c.edge);let u=t.indexOf(o.twin.polygon);t.splice(u,1)}else n.prev.next=a,n.next.prev=a,n.prevTwin.next=a.twin,n.nextTwin.prev=a.twin,c.edge=a}for(let i=0,r=t.length;i<r;i++)t[i].computeCentroid()}return this.computeCentroid(),this.computeUniqueEdges(),this.computeUniqueVertices(),this}_mergePossible(t){let e=t.polygon,n=t.twin;do{if(n!==t.twin&&n.twin.polygon===e)return!1;n=n.next}while(t.twin!==n);return!0}_nextVertexToAdd(){let t=null;if(this._assigned.empty()===!1){let e=0,n=this._assigned.first(),i=n.face;do{let r=i.distanceToPoint(n.point);r>e&&(e=r,t=n),n=n.next}while(n!==null&&n.face===i)}return t}_updateFaces(){let t=this.faces,e=new Array;for(let n=0,i=t.length;n<i;n++){let r=t[n];r.active&&e.push(r)}return this.faces.length=0,this.faces.push(...e),this}_removeAllVerticesFromFace(t){if(t.outside!==null){let e=t.outside;e.face=null;let n=t.outside;for(;n.next!==null&&n.next.face===t;)n=n.next,n.face=null;t.outside=null,this._assigned.removeChain(e,n)}return this}_removeVertexFromFace(t,e){return t.face=null,t===e.outside&&(t.next!==null&&t.next.face===e?e.outside=t.next:e.outside=null),this._assigned.remove(t),this}_resolveUnassignedPoints(t){if(this._unassigned.empty()===!1){let e=this._unassigned.first();do{let n=e.next,i=this._tolerance,r=null;for(let o=0,a=t.length;o<a;o++){let c=t[o];if(c.active){let l=c.distanceToPoint(e.point);l>i&&(i=l,r=c)}}r!==null&&this._addVertexToFace(e,r),e=n}while(e!==null)}return this}},di=class extends Zi{constructor(t=new Y,e=new Y,n=new Y){super(),this.outside=null,this.active=!0,this.fromContour([t,e,n]),this.computeCentroid()}getEdge(t){let e=this.edge;for(;t>0;)e=e.next,t--;for(;t<0;)e=e.prev,t++;return e}},Jd=class{constructor(t=new Y){this.point=t,this.prev=null,this.next=null,this.face=null}},Oh=class{constructor(){this.head=null,this.tail=null}first(){return this.head}last(){return this.tail}clear(){return this.head=this.tail=null,this}insertAfter(t,e){return e.prev=t,e.next=t.next,e.next?e.next.prev=e:this.tail=e,t.next=e,this}append(t){return this.head===null?this.head=t:this.tail.next=t,t.prev=this.tail,t.next=null,this.tail=t,this}appendChain(t){for(this.head===null?this.head=t:this.tail.next=t,t.prev=this.tail;t.next!==null;)t=t.next;return this.tail=t,this}remove(t){return t.prev===null?this.head=t.next:t.prev.next=t.next,t.next===null?this.tail=t.prev:t.next.prev=t.prev,t.prev=null,t.next=null,this}removeChain(t,e){return t.prev===null?this.head=e.next:t.prev.next=e.next,e.next===null?this.tail=t.prev:e.next.prev=t.prev,t.prev=null,e.next=null,this}empty(){return this.head===null}},j0={unitary:new ji,diagonal:new ji},ae={c:null,u:[new Y,new Y,new Y],e:[]},me={c:null,u:[new Y,new Y,new Y],e:[]},Oe=[[],[],[]],Zt=[[],[],[]],Le=[],or=new Y,ar=new Y,cr=new Y,Kn=new Y,Q0=new Y,Kd=class{constructor(t=new Y,e=new Y,n=new ji){this.center=t,this.halfSizes=e,this.rotation=n}set(t,e,n){return this.center=t,this.halfSizes=e,this.rotation=n,this}copy(t){return this.center.copy(t.center),this.halfSizes.copy(t.halfSizes),this.rotation.copy(t.rotation),this}clone(){return new this.constructor().copy(this)}getSize(t){return t.copy(this.halfSizes).multiplyScalar(2)}clampPoint(t,e){let n=this.halfSizes;Kn.subVectors(t,this.center),this.rotation.extractBasis(or,ar,cr),e.copy(this.center);let i=Fn.clamp(Kn.dot(or),-n.x,n.x);e.add(or.multiplyScalar(i));let r=Fn.clamp(Kn.dot(ar),-n.y,n.y);e.add(ar.multiplyScalar(r));let o=Fn.clamp(Kn.dot(cr),-n.z,n.z);return e.add(cr.multiplyScalar(o)),e}containsPoint(t){return Kn.subVectors(t,this.center),this.rotation.extractBasis(or,ar,cr),Math.abs(Kn.dot(or))<=this.halfSizes.x&&Math.abs(Kn.dot(ar))<=this.halfSizes.y&&Math.abs(Kn.dot(cr))<=this.halfSizes.z}intersectsAABB(t){return this.intersectsOBB(Fb.fromAABB(t))}intersectsBoundingSphere(t){return this.clampPoint(t.center,Q0),Q0.squaredDistanceTo(t.center)<=t.radius*t.radius}intersectsOBB(t,e=Number.EPSILON){ae.c=this.center,ae.e[0]=this.halfSizes.x,ae.e[1]=this.halfSizes.y,ae.e[2]=this.halfSizes.z,this.rotation.extractBasis(ae.u[0],ae.u[1],ae.u[2]),me.c=t.center,me.e[0]=t.halfSizes.x,me.e[1]=t.halfSizes.y,me.e[2]=t.halfSizes.z,t.rotation.extractBasis(me.u[0],me.u[1],me.u[2]);for(let r=0;r<3;r++)for(let o=0;o<3;o++)Oe[r][o]=ae.u[r].dot(me.u[o]);Kn.subVectors(me.c,ae.c),Le[0]=Kn.dot(ae.u[0]),Le[1]=Kn.dot(ae.u[1]),Le[2]=Kn.dot(ae.u[2]);for(let r=0;r<3;r++)for(let o=0;o<3;o++)Zt[r][o]=Math.abs(Oe[r][o])+e;let n,i;for(let r=0;r<3;r++)if(n=ae.e[r],i=me.e[0]*Zt[r][0]+me.e[1]*Zt[r][1]+me.e[2]*Zt[r][2],Math.abs(Le[r])>n+i)return!1;for(let r=0;r<3;r++)if(n=ae.e[0]*Zt[0][r]+ae.e[1]*Zt[1][r]+ae.e[2]*Zt[2][r],i=me.e[r],Math.abs(Le[0]*Oe[0][r]+Le[1]*Oe[1][r]+Le[2]*Oe[2][r])>n+i)return!1;return n=ae.e[1]*Zt[2][0]+ae.e[2]*Zt[1][0],i=me.e[1]*Zt[0][2]+me.e[2]*Zt[0][1],!(Math.abs(Le[2]*Oe[1][0]-Le[1]*Oe[2][0])>n+i||(n=ae.e[1]*Zt[2][1]+ae.e[2]*Zt[1][1],i=me.e[0]*Zt[0][2]+me.e[2]*Zt[0][0],Math.abs(Le[2]*Oe[1][1]-Le[1]*Oe[2][1])>n+i)||(n=ae.e[1]*Zt[2][2]+ae.e[2]*Zt[1][2],i=me.e[0]*Zt[0][1]+me.e[1]*Zt[0][0],Math.abs(Le[2]*Oe[1][2]-Le[1]*Oe[2][2])>n+i)||(n=ae.e[0]*Zt[2][0]+ae.e[2]*Zt[0][0],i=me.e[1]*Zt[1][2]+me.e[2]*Zt[1][1],Math.abs(Le[0]*Oe[2][0]-Le[2]*Oe[0][0])>n+i)||(n=ae.e[0]*Zt[2][1]+ae.e[2]*Zt[0][1],i=me.e[0]*Zt[1][2]+me.e[2]*Zt[1][0],Math.abs(Le[0]*Oe[2][1]-Le[2]*Oe[0][1])>n+i)||(n=ae.e[0]*Zt[2][2]+ae.e[2]*Zt[0][2],i=me.e[0]*Zt[1][1]+me.e[1]*Zt[1][0],Math.abs(Le[0]*Oe[2][2]-Le[2]*Oe[0][2])>n+i)||(n=ae.e[0]*Zt[1][0]+ae.e[1]*Zt[0][0],i=me.e[1]*Zt[2][2]+me.e[2]*Zt[2][1],Math.abs(Le[1]*Oe[0][0]-Le[0]*Oe[1][0])>n+i)||(n=ae.e[0]*Zt[1][1]+ae.e[1]*Zt[0][1],i=me.e[0]*Zt[2][2]+me.e[2]*Zt[2][0],Math.abs(Le[1]*Oe[0][1]-Le[0]*Oe[1][1])>n+i)||(n=ae.e[0]*Zt[1][2]+ae.e[1]*Zt[0][2],i=me.e[0]*Zt[2][1]+me.e[1]*Zt[2][0],Math.abs(Le[1]*Oe[0][2]-Le[0]*Oe[1][2])>n+i))}intersectsPlane(t){this.rotation.extractBasis(or,ar,cr);let e=this.halfSizes.x*Math.abs(t.normal.dot(or))+this.halfSizes.y*Math.abs(t.normal.dot(ar))+this.halfSizes.z*Math.abs(t.normal.dot(cr)),n=t.normal.dot(this.center)-t.constant;return Math.abs(n)<=e}fromAABB(t){return t.getCenter(this.center),t.getSize(this.halfSizes).multiplyScalar(.5),this.rotation.identity(),this}fromPoints(t){let n=new Yd().fromPoints(t).faces,i=new Array,r=new Array;for(let O=0,k=n.length;O<k;O++){let z=n[O],et=z.edge;i.length=0;do i.push(et),et=et.next;while(et!==z.edge);let j=i.length-2;for(let W=1,tt=j;W<=tt;W++){let at=i[0].vertex,st=i[W+0].vertex,ot=i[W+1].vertex;r.push(at.x,at.y,at.z),r.push(st.x,st.y,st.z),r.push(ot.x,ot.y,ot.z)}}let o=new Y,a=new Y,c=new Y,l=new Y,h=new Y,u=new Y,f=new Y,d=new Y,g=0,x,m,p,y,v,_;x=m=p=y=v=_=0;for(let O=0,k=r.length;O<k;O+=9){o.fromArray(r,O),a.fromArray(r,O+3),c.fromArray(r,O+6),f.set(0,0,0),f.add(o).add(a).add(c).divideScalar(3),l.subVectors(a,o),h.subVectors(c,o);let z=u.crossVectors(l,h).length()/2;d.add(u.copy(f).multiplyScalar(z)),g+=z,x+=(9*f.x*f.x+o.x*o.x+a.x*a.x+c.x*c.x)*(z/12),m+=(9*f.x*f.y+o.x*o.y+a.x*a.y+c.x*c.y)*(z/12),p+=(9*f.x*f.z+o.x*o.z+a.x*a.z+c.x*c.z)*(z/12),y+=(9*f.y*f.y+o.y*o.y+a.y*a.y+c.y*c.y)*(z/12),v+=(9*f.y*f.z+o.y*o.z+a.y*a.z+c.y*c.z)*(z/12),_+=(9*f.z*f.z+o.z*o.z+a.z*a.z+c.z*c.z)*(z/12)}d.divideScalar(g),x/=g,m/=g,p/=g,y/=g,v/=g,_/=g,x-=d.x*d.x,m-=d.x*d.y,p-=d.x*d.z,y-=d.y*d.y,v-=d.y*d.z,_-=d.z*d.z;let w=new ji;w.elements[0]=x,w.elements[1]=m,w.elements[2]=p,w.elements[3]=m,w.elements[4]=y,w.elements[5]=v,w.elements[6]=p,w.elements[7]=v,w.elements[8]=_,w.eigenDecomposition(j0);let T=j0.unitary,R=new Y,L=new Y,S=new Y;T.extractBasis(R,L,S);let M=-1/0,b=-1/0,A=-1/0,N=1/0,C=1/0,I=1/0;for(let O=0,k=t.length;O<k;O++){let z=t[O];M=Math.max(R.dot(z),M),b=Math.max(L.dot(z),b),A=Math.max(S.dot(z),A),N=Math.min(R.dot(z),N),C=Math.min(L.dot(z),C),I=Math.min(S.dot(z),I)}return R.multiplyScalar(.5*(N+M)),L.multiplyScalar(.5*(C+b)),S.multiplyScalar(.5*(I+A)),this.center.add(R).add(L).add(S),this.halfSizes.x=M-N,this.halfSizes.y=b-C,this.halfSizes.z=A-I,this.halfSizes.multiplyScalar(.5),this.rotation.copy(T),this}equals(t){return t.center.equals(this.center)&&t.halfSizes.equals(this.halfSizes)&&t.rotation.equals(this.rotation)}toJSON(){return{type:this.constructor.name,center:this.center.toArray(new Array),halfSizes:this.halfSizes.toArray(new Array),rotation:this.rotation.toArray(new Array)}}fromJSON(t){return this.center.fromArray(t.center),this.halfSizes.fromArray(t.halfSizes),this.rotation.fromArray(t.rotation),this}},Fb=new Kd;var XR=new Y,qR=new Y,$R=new Y,YR=new Y,JR=new Xa,KR=new Array,ZR={edge:null,closestPoint:new Y};var jR=new Y,QR=new Va,t2=new Array;var e2=new Y,n2=new Y,i2=new Mo,s2=new Y,r2=new Y;var o2=new Y,a2=new Y,c2=new Y,l2=new Xa,h2=new Y;var Bn=ym(tx(),1),zh=ym(jd(),1);var ex=Object.freeze({minX:-.95,maxX:.95,minY:-.28,maxY:.85,minZ:-.32,maxZ:.68}),nx=40,ix=Object.freeze([.025,.032,.04,.048,.06,.074]),Bh=Object.freeze({clown:Object.freeze({scientificName:"Amphiprion percula",name:"\u771F\u5C0F\u4E11\u9C7C",metric:"TL",diet:"prey",min:.025,max:.075,modelTL:1.25,modelSL:.9800000190734863,depthRatio:.4,widthRatio:.12,collisionRadiusRatio:.38}),barramundi:Object.freeze({scientificName:"Lates calcarifer",name:"\u5C16\u543B\u9C88\uFF08\u884C\u4E3A\u6D4B\u8BD5\uFF09",metric:"TL",diet:"predator",gape:.3,min:.18,max:.45,depthRatio:.45,widthRatio:.23,collisionRadiusRatio:.32})});function sx(s,t,e){let n=Bh[t];if(!n||!Number.isFinite(e)||e<n.min||e>n.max)throw new Error("Invalid physical profile");return Object.freeze({id:s,kind:t,scientificName:n.scientificName,totalLengthM:e,metric:"TL",standardLengthM:t==="clown"?e*n.modelSL/n.modelTL:null,bodyDepthM:e*n.depthRatio,bodyWidthM:e*n.widthRatio,radiusM:e*n.collisionRadiusRatio,sizeClass:t==="clown"?e<.04?"\u5C0F\u4F53\u578B":e<.06?"\u4E2D\u4F53\u578B":"\u5927\u4F53\u578B":e<.3?"\u8F83\u5C0F\u6355\u98DF\u8005":"\u8F83\u5927\u6355\u98DF\u8005",lifeStage:null,ageDays:null,version:1})}var rx=new B(1,0,0),Bb=new B(0,1,0),lr=ex,zb=(s,t,e)=>Math.max(t,Math.min(e,s)),kb={clearMotion:()=>!0,clearPose:()=>!0,lineOfSight:()=>!0,avoidance:()=>new B};function Hb(s){let t=s.clone().normalize(),e=new B().crossVectors(t,Bb).normalize();e.lengthSq()<.01&&e.set(0,0,1);let n=new B().crossVectors(e,t).normalize();return new Ve().setFromRotationMatrix(new Pt().makeBasis(t,n,e))}var kh=class{constructor({seed:t=73,spatial:e=kb,empty:n=!1}={}){this.random=Bn.default.seededRandom(t),this.spatial=e,this.fish=[],this.pellets=[],this.time=0,this.revision=0,this.nextId=1,this.nextFoodId=1,this.lastFeed=-1/0,this.lastCapture=-1/0,this.predation=!1,this.events=[],this.captureIds=new Set,this.pointer=null,this.stats={feeds:0,eaten:0,hunts:0,captures:0,escapes:0,blocked:0,refills:0},n||ix.forEach((i,r)=>this.add("clown",i,{id:`clown-${r+1}`,position:new B(-.63+r*.24,.25+r%3*.12,.24+r%2*.13)}))}emit(t,e={}){this.events.push({type:t,time:this.time,...e}),this.events.length>80&&this.events.shift()}add(t="clown",e=null,{id:n=null,position:i=null}={}){if(this.fish.length>=nx||t==="barramundi"&&this.fish.some(h=>h.kind===t))return null;e===null&&(e=t==="clown"?.025+this.random()*.05:.45);let r=n||`${t}-added-${this.nextId++}`;if(this.fish.some(h=>h.id===r))return null;let o=sx(r,t,e),a=t==="clown"?.035+e*.55:.11+e*.22,c=i?.clone()||new B(t==="clown"?-.7+this.random()*1.4:-.75,.35+this.random()*.25,t==="clown"?.3:-.08),l={id:r,kind:t,profile:o,position:c,velocity:new B(a,0,0),direction:rx.clone(),quaternion:new Ve,cruise:a,goal:c.clone(),home:c.clone(),goalAt:0,held:!1,absentUntil:0,phase:this.random()*Math.PI*2,life:"alive",nextHunt:this.time+5,hunt:null,hunger:.6,restUntil:0,fedUntil:0,agent:new Lh,force:new Y,seek:new _s,pursuit:new Ga,evade:new Ha,tailAmplitude:.025,pectoral:0,rowing:.5,bend:0};return l.agent.maxSpeed=a,l.agent.maxForce=a*3,this.fish.push(l),this.revision++,this.findLegal(l),l}remove(t){let e=this.fish.findIndex(n=>n.id===t);if(e<0)return!1;this.fish.splice(e,1),this.captureIds.delete(t),this.revision++;for(let n of this.fish)n.hunt?.target===t&&this.endHunt(n,"removed");return this.emit("removed",{id:t}),!0}active(t){return t.life==="alive"&&!t.held}findLegal(t){if(this.spatial.clearPose(t,t.position,t.quaternion)&&this.inBounds(t,t.position))return!0;for(let e=0;e<48;e++){let n=new B(-.8+this.random()*1.6,.25+this.random()*.5,-.16+this.random()*.65);if(this.inBounds(t,n)&&this.spatial.clearPose(t,n,t.quaternion))return t.position.copy(n),t.goal.copy(n),!0}return!1}inBounds(t,e){let n=t.profile.radiusM;return e.x>=lr.minX+n&&e.x<=lr.maxX-n&&e.y>=lr.minY+n&&e.y<=lr.maxY-n&&e.z>=lr.minZ+n&&e.z<=lr.maxZ-n}canEat(t,e){if(!t||!e||t===e||!this.active(t)||!this.active(e))return!1;let n=Bh[t.kind],i=Bh[e.kind];return!n||!i||!t.profile||!e.profile?!1:Bn.default.canEat({...n,meters:t.profile.totalLengthM},{...i,meters:e.profile.totalLengthM})&&e.profile.bodyDepthM<=t.profile.totalLengthM*.11}mouth(t){return t.position.clone().addScaledVector(t.direction,t.profile.totalLengthM*.43)}feed(t=null){let e=zh.default.PARAMS;if(this.time-this.lastFeed<e.FEED_COOLDOWN_S||this.pellets.length+e.SPRINKLE_COUNT>e.MAX_PELLETS)return{ok:!1,reason:"cooldown"};this.lastFeed=this.time;for(let n=0;n<e.SPRINKLE_COUNT;n++)this.pellets.push({id:this.nextFoodId++,position:t?t.clone().add(new B((this.random()-.5)*.05,0,(this.random()-.5)*.05)):new B(-.55+this.random()*1.1,.78,.3),born:this.time});return this.stats.feeds++,this.emit("feed",{count:e.SPRINKLE_COUNT}),{ok:!0,count:e.SPRINKLE_COUNT}}setPredation(t){this.predation=t===!0;for(let e of this.fish)!this.predation&&e.hunt&&this.endHunt(e,"disabled")}setHeld(t,e){let n=this.fish.find(i=>i.id===t);if(!n||n.life!=="alive")return!1;if(n.held!==(e===!0)&&this.revision++,n.held=e===!0,e){n.velocity.set(0,0,0),n.hunt&&this.endHunt(n,"held");for(let i of this.fish)i.hunt?.target===t&&this.endHunt(i,"held")}return!0}endHunt(t,e){t.hunt&&(this.stats.escapes++,this.emit("escape",{predator:t.id,target:t.hunt.target,reason:e})),t.hunt=null,t.restUntil=this.time+Bn.default.PARAMS.REST_MIN_S+this.random()*(Bn.default.PARAMS.REST_MAX_S-Bn.default.PARAMS.REST_MIN_S)}capture(t,e){if(!this.predation||!this.canEat(t,e)||this.captureIds.has(e.id)||this.time-this.lastCapture<Bn.default.PARAMS.KILL_GAP_S)return!1;let n=this.mouth(t),i=t.profile.totalLengthM*.055+e.profile.bodyDepthM*.35;return n.distanceTo(e.position)>i||!this.spatial.lineOfSight(n,e.position)?!1:(this.captureIds.add(e.id),e.life="absent",e.absentUntil=this.time+Bn.default.PARAMS.REFILL_SCHOOL_S,e.velocity.set(0,0,0),t.hunt=null,t.hunger=.12,t.restUntil=this.time+10,this.lastCapture=this.time,this.revision++,this.stats.captures++,this.emit("capture",{predator:t.id,prey:e.id}),!0)}chooseGoal(t){for(let e=0;e<12;e++){let n=new B(-.8+this.random()*1.6,.12+this.random()*.58,-.2+this.random()*.72);if(this.inBounds(t,n)&&this.spatial.clearPose(t,n,t.quaternion)){t.goal.copy(n);break}}t.goalAt=this.time+4+this.random()*5}findRefuge(t,e){if(!(!this.spatial.active||this.time<(t.refugeCheckAt||0))){t.refugeCheckAt=this.time+.75;for(let n=0;n<12;n++){let i=n*Math.PI/6,r=t.position.clone().add(new B(Math.cos(i)*.18,(n%3-1)*.06,Math.sin(i)*.18));if(this.inBounds(t,r)&&this.spatial.clearPose(t,r,t.quaternion)&&!this.spatial.lineOfSight(e.position,r)&&this.spatial.clearMotion(t,t.position,r,t.quaternion,t.quaternion)){t.refuge=r,t.refugeUntil=this.time+2,this.emit("refuge",{id:t.id});return}}}}updateHunt(t,e){if(!this.predation||t.kind!=="barramundi"||!this.active(t))return;if(t.hunger=Math.min(1,t.hunger+.008*e),t.hunt){let r=this.fish.find(a=>a.id===t.hunt.target);if(!this.canEat(t,r)||this.time-t.hunt.start>Bn.default.PARAMS.HUNT_MAX_S){this.endHunt(t,"ineligible-or-timeout");return}if(this.spatial.lineOfSight(this.mouth(t),r.position))t.hunt.lastSeen.copy(r.position),t.hunt.seen=this.time;else if(this.time-t.hunt.seen>1.4){this.endHunt(t,"lost");return}let o=r.position.clone().sub(this.mouth(t));if(t.hunt.phase==="hunt"&&o.length()<t.profile.totalLengthM*.65&&t.direction.angleTo(o)<=Bn.default.PARAMS.STRIKE_CONE&&(t.hunt.phase="strike",t.hunt.strikeEnd=this.time+Bn.default.PARAMS.STRIKE_S),t.hunt.phase==="strike"&&this.time>t.hunt.strikeEnd){this.endHunt(t,"burst-ended");return}return}if(this.time<t.nextHunt||this.time<t.restUntil||t.hunger<Bn.default.PARAMS.HUNGER_THRESHOLD)return;let n=null,i=1/0;for(let r of this.fish){if(!this.canEat(t,r)||!this.spatial.lineOfSight(this.mouth(t),r.position))continue;let o=t.position.distanceTo(r.position);if(o>1.5)continue;let a=r.position.clone().sub(t.position).normalize(),c=Bn.default.costOf(o,!1,t.direction.angleTo(a));c<i&&(i=c,n=r)}t.nextHunt=this.time+.8,n&&(t.hunt={target:n.id,start:this.time,phase:"hunt",seen:this.time,lastSeen:n.position.clone()},this.stats.hunts++,this.emit("hunt",{predator:t.id,target:n.id}))}step(t){if(!(!Number.isFinite(t)||t<=0)){t=Math.min(t,1/30),this.time+=t;for(let e of this.fish)e.life==="absent"&&this.time>=e.absentUntil&&(e.life="alive",e.position.set(-.82,.5,.1),this.findLegal(e),this.captureIds.delete(e.id),this.stats.refills++,this.revision++),e.agent.position.copy(e.position),e.agent.velocity.copy(e.velocity),e.agent.maxSpeed=e.cruise,e.agent.maxForce=e.cruise*3,e.agent.lookAt(new Y(e.position.x+e.direction.x,e.position.y+e.direction.y,e.position.z+e.direction.z));for(let e of this.fish)this.updateHunt(e,t);for(let e of this.fish){if(!this.active(e))continue;let n="wander",i=null,r=e.cruise,o=this.predation?this.fish.find(m=>m.kind==="barramundi"&&m.hunt&&this.canEat(m,e)&&m.position.distanceTo(e.position)<.65&&this.spatial.lineOfSight(m.position,e.position)):null;if(e.hunt)i=this.fish.find(m=>m.id===e.hunt.target),n=this.time-e.hunt.seen<.1?"pursuit":"seek",r=e.cruise*(e.hunt.phase==="strike"?2.5:1.5);else if(o)this.findRefuge(e,o),i=o,n="evade",r=e.cruise*2.8;else if(e.kind==="clown"){let m=.5;for(let p of this.pellets){let y=e.position.distanceTo(p.position);y<m&&this.spatial.lineOfSight(e.position,p.position)&&(m=y,i=p,n="food",r=e.cruise*1.5)}}if(!e.hunt&&e.refuge&&this.time<e.refugeUntil&&(n="refuge",r=e.cruise*2),n==="wander"&&(this.time>e.goalAt||e.position.distanceTo(e.goal)<.06)&&this.chooseGoal(e),e.agent.maxSpeed=r,e.force.set(0,0,0),n==="pursuit"&&i)e.pursuit.evader=i.agent,e.pursuit.calculate(e.agent,e.force);else if(n==="evade")e.evade.pursuer=i.agent,e.evade.panicDistance=2,e.evade.calculate(e.agent,e.force);else{let m=n==="food"?i.position:n==="seek"?e.hunt.lastSeen:n==="refuge"?e.refuge:e.goal;e.seek.target.copy(m),e.seek.calculate(e.agent,e.force)}let a=new B(e.force.x,e.force.y,e.force.z);for(let m of this.fish){if(m===e||!this.active(m)||e.hunt?.target===m.id)continue;let p=e.position.clone().sub(m.position),y=p.length(),v=(e.profile.radiusM+m.profile.radiusM)*2.3;y>1e-5&&y<v&&a.addScaledVector(p,(1-y/v)*r*2/y)}a.add(this.spatial.avoidance(e)),this.pointer&&e.position.distanceTo(this.pointer)<.1&&a.add(e.position.clone().sub(this.pointer).normalize().multiplyScalar(r*3)),a.clampLength(0,r*4);let c=e.velocity.clone().addScaledVector(a,t).clampLength(0,r),l=c.lengthSq()>1e-8?Hb(c):e.quaternion.clone(),h=e.quaternion.clone(),u=h.angleTo(l),f=e.kind==="clown"?4:1.5;h.slerp(l,Math.min(1,f*t/Math.max(1e-4,u)));let d=rx.clone().applyQuaternion(h),g=e.position.clone().addScaledVector(d,c.length()*t);this.inBounds(e,g)&&this.spatial.clearMotion(e,e.position,g,e.quaternion,h)?(e.position.copy(g),e.velocity.copy(d).multiplyScalar(c.length()),e.quaternion.copy(h),e.direction.copy(d)):(this.stats.blocked++,e.velocity.multiplyScalar(.45),e.goalAt=0,this.spatial.clearMotion(e,e.position,e.position,e.quaternion,h)&&(e.quaternion.copy(h),e.direction.copy(d)));let x=zb(e.velocity.length()/e.cruise,0,3);e.phase+=t*(3+x*3),e.pectoral+=t*(5+x*5),e.tailAmplitude=.012+.035*x,e.rowing=.25+.2*x,e.bend=0,e.behavior=n}for(let e of this.fish)if(e.hunt?.phase==="strike"){let n=this.fish.find(i=>i.id===e.hunt.target);n&&this.capture(e,n)}for(let e of this.pellets){e.position.y-=.035*t;for(let n of this.fish)if(!(n.kind!=="clown"||!this.active(n))&&this.mouth(n).distanceTo(e.position)<Math.max(.006,n.profile.totalLengthM*.15)&&this.spatial.lineOfSight(this.mouth(n),e.position)){e.eaten=!0,n.fedUntil=this.time+zh.default.PARAMS.FED_S,this.stats.eaten++;break}}this.pellets=this.pellets.filter(e=>!e.eaten&&this.time-e.born<zh.default.PARAMS.PELLET_LIFE_S&&e.position.y>lr.minY)}}snapshot(){return{time:this.time,revision:this.revision,predation:this.predation,pellets:this.pellets.length,stats:{...this.stats},fish:this.fish.map(t=>({id:t.id,kind:t.kind,totalLengthM:t.profile.totalLengthM,life:t.life,held:t.held,behavior:t.behavior||"wander",position:t.position.toArray()})),events:this.events.slice(-12)}}};var Eo=Math.pow(2,-24),qa=Symbol("SKIP_GENERATION"),Hh={strategy:0,maxDepth:40,targetLeafSize:10,useSharedArrayBuffer:!1,setBoundingBox:!0,onProgress:null,indirect:!1,verbose:!0,range:null,[qa]:!1};function Ae(s,t,e){return e.min.x=t[s],e.min.y=t[s+1],e.min.z=t[s+2],e.max.x=t[s+3],e.max.y=t[s+4],e.max.z=t[s+5],e}function $a(s){let t=-1,e=-1/0;for(let n=0;n<3;n++){let i=s[n+3]-s[n];i>e&&(e=i,t=n)}return t}function Qd(s,t){t.set(s)}function tp(s,t,e){let n,i;for(let r=0;r<3;r++){let o=r+3;n=s[r],i=t[r],e[r]=n<i?n:i,n=s[o],i=t[o],e[o]=n>i?n:i}}function Ya(s,t,e){for(let n=0;n<3;n++){let i=t[s+2*n],r=t[s+2*n+1],o=i-r,a=i+r;o<e[n]&&(e[n]=o),a>e[n+3]&&(e[n+3]=a)}}function To(s){let t=s[3]-s[0],e=s[4]-s[1],n=s[5]-s[2];return 2*(t*e+e*n+n*t)}function ce(s,t){return t[s+15]===65535}function ye(s,t){return t[s+6]}function we(s,t){return t[s+14]}function ge(s){return s+8}function xe(s,t){let e=t[s+6];return s+e*8}function Ao(s,t){return t[s+7]}function Vh(s,t,e,n,i){let r=1/0,o=1/0,a=1/0,c=-1/0,l=-1/0,h=-1/0,u=1/0,f=1/0,d=1/0,g=-1/0,x=-1/0,m=-1/0,p=s.offset||0;for(let y=(t-p)*6,v=(t+e-p)*6;y<v;y+=6){let _=s[y+0],w=s[y+1],T=_-w,R=_+w;T<r&&(r=T),R>c&&(c=R),_<u&&(u=_),_>g&&(g=_);let L=s[y+2],S=s[y+3],M=L-S,b=L+S;M<o&&(o=M),b>l&&(l=b),L<f&&(f=L),L>x&&(x=L);let A=s[y+4],N=s[y+5],C=A-N,I=A+N;C<a&&(a=C),I>h&&(h=I),A<d&&(d=A),A>m&&(m=A)}n[0]=r,n[1]=o,n[2]=a,n[3]=c,n[4]=l,n[5]=h,i[0]=u,i[1]=f,i[2]=d,i[3]=g,i[4]=x,i[5]=m}var Qi=32,Wb=(s,t)=>s.candidate-t.candidate,Ss=new Array(Qi).fill().map(()=>({count:0,bounds:new Float32Array(6),rightCacheBounds:new Float32Array(6),leftCacheBounds:new Float32Array(6),candidate:0})),Gh=new Float32Array(6);function ax(s,t,e,n,i,r){let o=-1,a=0;if(r===0)o=$a(t),o!==-1&&(a=(t[o]+t[o+3])/2);else if(r===1)o=$a(s),o!==-1&&(a=Xb(e,n,i,o));else if(r===2){let c=To(s),l=1.25*i,h=e.offset||0,u=(n-h)*6,f=(n+i-h)*6;for(let d=0;d<3;d++){let g=t[d],p=(t[d+3]-g)/Qi;if(i<Qi/4){let y=[...Ss];y.length=i;let v=0;for(let w=u;w<f;w+=6,v++){let T=y[v];T.candidate=e[w+2*d],T.count=0;let{bounds:R,leftCacheBounds:L,rightCacheBounds:S}=T;for(let M=0;M<3;M++)S[M]=1/0,S[M+3]=-1/0,L[M]=1/0,L[M+3]=-1/0,R[M]=1/0,R[M+3]=-1/0;Ya(w,e,R)}y.sort(Wb);let _=i;for(let w=0;w<_;w++){let T=y[w];for(;w+1<_&&y[w+1].candidate===T.candidate;)y.splice(w+1,1),_--}for(let w=u;w<f;w+=6){let T=e[w+2*d];for(let R=0;R<_;R++){let L=y[R];T>=L.candidate?Ya(w,e,L.rightCacheBounds):(Ya(w,e,L.leftCacheBounds),L.count++)}}for(let w=0;w<_;w++){let T=y[w],R=T.count,L=i-T.count,S=T.leftCacheBounds,M=T.rightCacheBounds,b=0;R!==0&&(b=To(S)/c);let A=0;L!==0&&(A=To(M)/c);let N=1+1.25*(b*R+A*L);N<l&&(o=d,l=N,a=T.candidate)}}else{for(let _=0;_<Qi;_++){let w=Ss[_];w.count=0,w.candidate=g+p+_*p;let T=w.bounds;for(let R=0;R<3;R++)T[R]=1/0,T[R+3]=-1/0}for(let _=u;_<f;_+=6){let R=~~((e[_+2*d]-g)/p);R>=Qi&&(R=Qi-1);let L=Ss[R];L.count++,Ya(_,e,L.bounds)}let y=Ss[Qi-1];Qd(y.bounds,y.rightCacheBounds);for(let _=Qi-2;_>=0;_--){let w=Ss[_],T=Ss[_+1];tp(w.bounds,T.rightCacheBounds,w.rightCacheBounds)}let v=0;for(let _=0;_<Qi-1;_++){let w=Ss[_],T=w.count,R=w.bounds,S=Ss[_+1].rightCacheBounds;T!==0&&(v===0?Qd(R,Gh):tp(R,Gh,Gh)),v+=T;let M=0,b=0;v!==0&&(M=To(Gh)/c);let A=i-v;A!==0&&(b=To(S)/c);let N=1+1.25*(M*v+b*A);N<l&&(o=d,l=N,a=w.candidate)}}}}else console.warn(`BVH: Invalid build strategy value ${r} used.`);return{axis:o,pos:a}}function Xb(s,t,e,n){let i=0,r=s.offset;for(let o=t,a=t+e;o<a;o++)i+=s[(o-r)*6+n*2];return i/e}var Ro=class{constructor(){this.boundingData=new Float32Array(6)}};function cx(s,t,e,n,i,r){let o=n,a=n+i-1,c=r.pos,l=r.axis*2,h=e.offset||0;for(;;){for(;o<=a&&e[(o-h)*6+l]<c;)o++;for(;o<=a&&e[(a-h)*6+l]>=c;)a--;if(o<a){for(let u=0;u<t;u++){let f=s[o*t+u];s[o*t+u]=s[a*t+u],s[a*t+u]=f}for(let u=0;u<6;u++){let f=o-h,d=a-h,g=e[f*6+u];e[f*6+u]=e[d*6+u],e[d*6+u]=g}o++,a--}else return o}}var lx,Wh,ep,hx,qb=Math.pow(2,32);function Xh(s){return"count"in s?1:1+Xh(s.left)+Xh(s.right)}function ux(s,t,e){return lx=new Float32Array(e),Wh=new Uint32Array(e),ep=new Uint16Array(e),hx=new Uint8Array(e),np(s,t)}function np(s,t){let e=s/4,n=s/2,i="count"in t,r=t.boundingData;for(let o=0;o<6;o++)lx[e+o]=r[o];if(i)return t.buffer?(hx.set(new Uint8Array(t.buffer),s),s+t.buffer.byteLength):(Wh[e+6]=t.offset,ep[n+14]=t.count,ep[n+15]=65535,s+32);{let{left:o,right:a,splitAxis:c}=t,l=s+32,h=np(l,o),u=s/32,d=h/32-u;if(d>qb)throw new Error("MeshBVH: Cannot store relative child node offset greater than 32 bits.");return Wh[e+6]=d,Wh[e+7]=c,np(h,a)}}function $b(s,t,e,n,i,r){let{maxDepth:o,verbose:a,targetLeafSize:c,_strictLeafSize:l=1/0,strategy:h,onProgress:u}=i,f=s.primitiveBuffer,d=s.primitiveBufferStride,g=new Float32Array(6),x=!1,m=new Ro;return Vh(t,e,n,m.boundingData,g),y(m,e,n,g),m;function p(v){u&&u((v-r.offset)/r.count)}function y(v,_,w,T=null,R=0){!x&&R>=o&&(x=!0,a&&console.warn(`BVH: Max depth of ${o} reached when generating BVH. Consider increasing maxDepth.`));let L=w>l;if(w<=c&&!L||R>=o)return p(_+w),v.offset=_,v.count=w,v;let S=ax(v.boundingData,T,t,_,w,h),M=S.axis===-1?-1:cx(f,d,t,_,w,S);if(S.axis===-1||M===_||M===_+w){if(!L)return p(_+w),v.offset=_,v.count=w,v;S.axis=Math.max(0,$a(v.boundingData)),M=_+Math.max(1,Math.floor(w/2))}v.splitAxis=S.axis;let b=new Ro,A=_,N=M-_;v.left=b,Vh(t,A,N,b.boundingData,g),y(b,A,N,g,R+1);let C=new Ro,I=M,O=w-N;return v.right=C,Vh(t,I,O,C.boundingData,g),y(C,I,O,g,R+1),v}}function fx(s,t){let e=t.useSharedArrayBuffer?SharedArrayBuffer:ArrayBuffer,n=s.getRootRanges(t.range),i=n[0],r=n[n.length-1],o={offset:i.offset,count:r.offset+r.count-i.offset},a=new Float32Array(6*o.count);a.offset=o.offset,s.computePrimitiveBounds(o.offset,o.count,a),s._roots=n.map(c=>{let l=$b(s,a,c.offset,c.count,t,o),h=Xh(l),u=new e(32*h);return ux(0,l,u),u})}var Ms=class{constructor(t){this._getNewPrimitive=t,this._primitives=[]}getPrimitive(){let t=this._primitives;return t.length===0?this._getNewPrimitive():t.pop()}releasePrimitive(t){this._primitives.push(t)}};var ip=class{constructor(){this.float32Array=null,this.uint16Array=null,this.uint32Array=null;let t=[],e=null;this.setBuffer=n=>{e&&t.push(e),e=n,this.float32Array=new Float32Array(n),this.uint16Array=new Uint16Array(n),this.uint32Array=new Uint32Array(n)},this.clearBuffer=()=>{e=null,this.float32Array=null,this.uint16Array=null,this.uint32Array=null,t.length!==0&&this.setBuffer(t.pop())}}},he=new ip;var bs,Io,Co=[],qh=new Ms(()=>new le);function dx(s,t,e,n,i,r){bs=qh.getPrimitive(),Io=qh.getPrimitive(),Co.push(bs,Io),he.setBuffer(s._roots[t]);let o=sp(0,s.geometry,e,n,i,r);he.clearBuffer(),qh.releasePrimitive(bs),qh.releasePrimitive(Io),Co.pop(),Co.pop();let a=Co.length;return a>0&&(Io=Co[a-1],bs=Co[a-2]),o}function sp(s,t,e,n,i=null,r=0,o=0){let{float32Array:a,uint16Array:c,uint32Array:l}=he,h=s*2;if(ce(h,c)){let f=ye(s,l),d=we(h,c);return Ae(s,a,bs),n(f,d,!1,o,r+s/8,bs)}else{let M=function(A){let{uint16Array:N,uint32Array:C}=he,I=A*2;for(;!ce(I,N);)A=ge(A),I=A*2;return ye(A,C)},b=function(A){let{uint16Array:N,uint32Array:C}=he,I=A*2;for(;!ce(I,N);)A=xe(A,C),I=A*2;return ye(A,C)+we(I,N)},f=ge(s),d=xe(s,l),g=f,x=d,m,p,y,v;if(i&&(y=bs,v=Io,Ae(g,a,y),Ae(x,a,v),m=i(y),p=i(v),p<m)){g=d,x=f;let A=m;m=p,p=A,y=v}y||(y=bs,Ae(g,a,y));let _=ce(g*2,c),w=e(y,_,m,o+1,r+g/8),T;if(w===2){let A=M(g),C=b(g)-A;T=n(A,C,!0,o+1,r+g/8,y)}else T=w&&sp(g,t,e,n,i,r,o+1);if(T)return!0;v=Io,Ae(x,a,v);let R=ce(x*2,c),L=e(v,R,p,o+1,r+x/8),S;if(L===2){let A=M(x),C=b(x)-A;S=n(A,C,!0,o+1,r+x/8,v)}else S=L&&sp(x,t,e,n,i,r,o+1);return!!S}}var Ja=new he.constructor,$h=new he.constructor,ws=new Ms(()=>new le),Po=new le,Lo=new le,op=new le,ap=new le,cp=!1;function px(s,t,e,n){if(cp)throw new Error("MeshBVH: Recursive calls to bvhcast not supported.");cp=!0;let i=s._roots,r=t._roots,o,a=0,c=0,l=new Pt().copy(e).invert();for(let h=0,u=i.length;h<u;h++){Ja.setBuffer(i[h]),c=0;let f=ws.getPrimitive();Ae(0,Ja.float32Array,f),f.applyMatrix4(l);for(let d=0,g=r.length;d<g&&($h.setBuffer(r[d]),o=pi(0,0,e,l,n,a,c,0,0,f),$h.clearBuffer(),c+=r[d].byteLength/32,!o);d++);if(ws.releasePrimitive(f),Ja.clearBuffer(),a+=i[h].byteLength/32,o)break}return cp=!1,o}function pi(s,t,e,n,i,r=0,o=0,a=0,c=0,l=null,h=!1){let u,f;h?(u=$h,f=Ja):(u=Ja,f=$h);let d=u.float32Array,g=u.uint32Array,x=u.uint16Array,m=f.float32Array,p=f.uint32Array,y=f.uint16Array,v=s*2,_=t*2,w=ce(v,x),T=ce(_,y),R=!1;if(T&&w)h?R=i(ye(t,p),we(t*2,y),ye(s,g),we(s*2,x),c,o+t/8,a,r+s/8):R=i(ye(s,g),we(s*2,x),ye(t,p),we(t*2,y),a,r+s/8,c,o+t/8);else if(T){let L=ws.getPrimitive();Ae(t,m,L),L.applyMatrix4(e);let S=ge(s),M=xe(s,g);Ae(S,d,Po),Ae(M,d,Lo);let b=L.intersectsBox(Po),A=L.intersectsBox(Lo);R=b&&pi(t,S,n,e,i,o,r,c,a+1,L,!h)||A&&pi(t,M,n,e,i,o,r,c,a+1,L,!h),ws.releasePrimitive(L)}else{let L=ge(t),S=xe(t,p);Ae(L,m,op),Ae(S,m,ap);let M=l.intersectsBox(op),b=l.intersectsBox(ap);if(M&&b)R=pi(s,L,e,n,i,r,o,a,c+1,l,h)||pi(s,S,e,n,i,r,o,a,c+1,l,h);else if(M)if(w)R=pi(s,L,e,n,i,r,o,a,c+1,l,h);else{let A=ws.getPrimitive();A.copy(op).applyMatrix4(e);let N=ge(s),C=xe(s,g);Ae(N,d,Po),Ae(C,d,Lo);let I=A.intersectsBox(Po),O=A.intersectsBox(Lo);R=I&&pi(L,N,n,e,i,o,r,c,a+1,A,!h)||O&&pi(L,C,n,e,i,o,r,c,a+1,A,!h),ws.releasePrimitive(A)}else if(b)if(w)R=pi(s,S,e,n,i,r,o,a,c+1,l,h);else{let A=ws.getPrimitive();A.copy(ap).applyMatrix4(e);let N=ge(s),C=xe(s,g);Ae(N,d,Po),Ae(C,d,Lo);let I=A.intersectsBox(Po),O=A.intersectsBox(Lo);R=I&&pi(S,N,n,e,i,o,r,c,a+1,A,!h)||O&&pi(S,C,n,e,i,o,r,c,a+1,A,!h),ws.releasePrimitive(A)}}return R}var Yh=new class{constructor(){let s=null,t=null,e=null,n=!1;this.root=null,this.buffer=null,this.uint32Array=null,this.uint16Array=null,this.setBVH=(r,o)=>{if(n)throw new Error("BVHTraversalHelper: cannot call setBVH during an active traversal.");this.root=o,this.buffer=s=r._roots[o],this.uint16Array=e=new Uint16Array(s),this.uint32Array=t=new Uint32Array(s)},this.reset=()=>{this.root=null,this.buffer=s=null,this.uint16Array=e=null,this.uint32Array=t=null},this.getRangeStart=r=>{let o=r*2;for(;!ce(o,e);)r=ge(r),o=r*2;return ye(r,t)},this.getRangeEnd=r=>{let o=r*2;for(;!ce(o,e);)r=xe(r,t),o=r*2;return ye(r,t)+we(o,e)};let i=(r,o,a)=>{let c=o*2,l=ce(c,e);if(!r(a,l,o)&&!l){let u=ge(o),f=xe(o,t);i(r,u,a+1),i(r,f,a+1)}};this.traverseBuffer=r=>{if(n)throw new Error("BVHTraversalHelper: cannot start a traversal during an active traversal.");n=!0;try{i(r,0,0)}finally{n=!1}},this.traverse=r=>{this.traverseBuffer((o,a,c)=>{if(a){let l=c*2,h=t[c+6],u=e[l+14];return r(o,a,new Float32Array(s,c*4,6),h,u)}else{let l=Ao(c,t);return r(o,a,new Float32Array(s,c*4,6),l)}})}}};var mx=new le,No=new Float32Array(6),Jh=class{constructor(){this._roots=null,this.primitiveBuffer=null,this.primitiveBufferStride=null}init(t){t={...Hh,...t},"maxLeafSize"in t&&(console.warn('BVH: "maxLeafSize" option has been deprecated. Use "targetLeafSize", instead.'),t={...t,targetLeafSize:t.maxLeafSize}),fx(this,t)}getRootRanges(){throw new Error("BVH: getRootRanges() not implemented")}writePrimitiveBounds(){throw new Error("BVH: writePrimitiveBounds() not implemented")}writePrimitiveRangeBounds(t,e,n,i){let r=1/0,o=1/0,a=1/0,c=-1/0,l=-1/0,h=-1/0;for(let u=t,f=t+e;u<f;u++){this.writePrimitiveBounds(u,No,0);let[d,g,x,m,p,y]=No;d<r&&(r=d),m>c&&(c=m),g<o&&(o=g),p>l&&(l=p),x<a&&(a=x),y>h&&(h=y)}return n[i+0]=r,n[i+1]=o,n[i+2]=a,n[i+3]=c,n[i+4]=l,n[i+5]=h,n}computePrimitiveBounds(t,e,n){let i=n.offset||0;for(let r=t,o=t+e;r<o;r++){this.writePrimitiveBounds(r,No,0);let[a,c,l,h,u,f]=No,d=(a+h)/2,g=(c+u)/2,x=(l+f)/2,m=(h-a)/2,p=(u-c)/2,y=(f-l)/2,v=(r-i)*6;n[v+0]=d,n[v+1]=m+(Math.abs(d)+m)*Eo,n[v+2]=g,n[v+3]=p+(Math.abs(g)+p)*Eo,n[v+4]=x,n[v+5]=y+(Math.abs(x)+y)*Eo}return n}shiftPrimitiveOffsets(t){let e=this._indirectBuffer;if(e)for(let n=0,i=e.length;n<i;n++)e[n]+=t;else{let n=this._roots;for(let i=0;i<n.length;i++){let r=n[i],o=new Uint32Array(r),a=new Uint16Array(r),c=r.byteLength/32;for(let l=0;l<c;l++){let h=8*l,u=2*h;ce(u,a)&&(o[h+6]+=t)}}}}traverse(t,e=0){Yh.setBVH(this,e),Yh.traverse(t),Yh.reset()}refit(){let t=this._roots;for(let e=0,n=t.length;e<n;e++){let i=t[e],r=new Uint32Array(i),o=new Uint16Array(i),a=new Float32Array(i),c=i.byteLength/32;for(let l=c-1;l>=0;l--){let h=l*8,u=h*2;if(ce(u,o)){let d=ye(h,r),g=we(u,o);this.writePrimitiveRangeBounds(d,g,No,0),a.set(No,h)}else{let d=ge(h),g=xe(h,r);for(let x=0;x<3;x++){let m=a[d+x],p=a[d+x+3],y=a[g+x],v=a[g+x+3];a[h+x]=m<y?m:y,a[h+x+3]=p>v?p:v}}}}}getBoundingBox(t){return t.makeEmpty(),this._roots.forEach(n=>{Ae(0,new Float32Array(n),mx),t.union(mx)}),t}shapecast(t){let{boundsTraverseOrder:e,intersectsBounds:n,intersectsRange:i,intersectsPrimitive:r,scratchPrimitive:o,iterate:a}=t;if(i&&r){let u=i;i=(f,d,g,x,m)=>u(f,d,g,x,m)?!0:a(f,d,this,r,g,x,o)}else i||(r?i=(u,f,d,g)=>a(u,f,this,r,d,g,o):i=(u,f,d)=>d);let c=!1,l=0,h=this._roots;for(let u=0,f=h.length;u<f;u++){let d=h[u];if(c=dx(this,u,n,i,e,l),c)break;l+=d.byteLength/32}return c}bvhcast(t,e,n){let{intersectsRanges:i}=n;return px(this,t,e,i)}};function gx(){return typeof SharedArrayBuffer<"u"}function lp(s){return s.index?s.index.count:s.attributes.position.count}function Es(s){return lp(s)/3}function Jb(s,t=ArrayBuffer){return s>65535?new Uint32Array(new t(4*s)):new Uint16Array(new t(2*s))}function xx(s,t){if(!s.index){let e=s.attributes.position.count,n=t.useSharedArrayBuffer?SharedArrayBuffer:ArrayBuffer,i=Jb(e,n);s.setIndex(new re(i,1));for(let r=0;r<e;r++)i[r]=r}}function Kb(s,t,e){let n=lp(s)/e,i=t||s.drawRange,r=i.start/e,o=(i.start+i.count)/e,a=Math.max(0,r),c=Math.min(n,o)-a;return{offset:Math.floor(a),count:Math.floor(c)}}function Zb(s,t){return s.groups.map(e=>({offset:e.start/t,count:e.count/t}))}function hp(s,t,e){let n=Kb(s,t,e),i=Zb(s,e);if(!i.length)return[n];let r=[],o=n.offset,a=n.offset+n.count,c=lp(s)/e,l=[];for(let f of i){let{offset:d,count:g}=f,x=d,m=isFinite(g)?g:c-d,p=d+m;x<a&&p>o&&(l.push({pos:Math.max(o,x),isStart:!0}),l.push({pos:Math.min(a,p),isStart:!1}))}l.sort((f,d)=>f.pos!==d.pos?f.pos-d.pos:f.type==="end"?-1:1);let h=0,u=null;for(let f of l){let d=f.pos;h!==0&&d!==u&&r.push({offset:u,count:d-u}),h+=f.isStart?1:-1,u=d}return r}function jb(s,t){let e=s[s.length-1],n=e.offset+e.count>2**16,i=s.reduce((l,h)=>l+h.count,0),r=n?4:2,o=t?new SharedArrayBuffer(i*r):new ArrayBuffer(i*r),a=n?new Uint32Array(o):new Uint16Array(o),c=0;for(let l=0;l<s.length;l++){let{offset:h,count:u}=s[l];for(let f=0;f<u;f++)a[c+f]=h+f;c+=u}return a}var Kh=class extends Jh{get indirect(){return!!this._indirectBuffer}get primitiveStride(){return null}get primitiveBufferStride(){return this.indirect?1:this.primitiveStride}set primitiveBufferStride(t){}get primitiveBuffer(){return this.indirect?this._indirectBuffer:this.geometry.index.array}set primitiveBuffer(t){}constructor(t,e={}){if(t.isBufferGeometry){if(t.index&&t.index.isInterleavedBufferAttribute)throw new Error("BVH: InterleavedBufferAttribute is not supported for the index attribute.")}else throw new Error("BVH: Only BufferGeometries are supported.");if(e.useSharedArrayBuffer&&!gx())throw new Error("BVH: SharedArrayBuffer is not available.");super(),this.geometry=t,this.resolvePrimitiveIndex=e.indirect?n=>this._indirectBuffer[n]:n=>n,this.primitiveBuffer=null,this.primitiveBufferStride=null,this._indirectBuffer=null,e={...Hh,...e},e[qa]||this.init(e)}init(t){let{geometry:e,primitiveStride:n}=this;if(t.indirect){let i=hp(e,t.range,n),r=jb(i,t.useSharedArrayBuffer);this._indirectBuffer=r}else xx(e,t);super.init(t),!e.boundingBox&&t.setBoundingBox&&(e.boundingBox=this.getBoundingBox(new le))}getRootRanges(t){return this.indirect?[{offset:0,count:this._indirectBuffer.length}]:hp(this.geometry,t,this.primitiveStride)}raycastObject3D(){throw new Error("BVH: raycastObject3D() not implemented")}};var zn=class{constructor(){this.min=1/0,this.max=-1/0}setFromPointsField(t,e){let n=1/0,i=-1/0;for(let r=0,o=t.length;r<o;r++){let c=t[r][e];n=c<n?c:n,i=c>i?c:i}this.min=n,this.max=i}setFromPoints(t,e){let n=1/0,i=-1/0;for(let r=0,o=e.length;r<o;r++){let a=e[r],c=t.dot(a);n=c<n?c:n,i=c>i?c:i}this.min=n,this.max=i}isSeparated(t){return this.min>t.max||t.min>this.max}};zn.prototype.setFromBox=(function(){let s=new B;return function(e,n){let i=n.min,r=n.max,o=1/0,a=-1/0;for(let c=0;c<=1;c++)for(let l=0;l<=1;l++)for(let h=0;h<=1;h++){s.x=i.x*c+r.x*(1-c),s.y=i.y*l+r.y*(1-l),s.z=i.z*h+r.z*(1-h);let u=e.dot(s);o=Math.min(u,o),a=Math.max(u,a)}this.min=o,this.max=a}})();var Qb=(function(){let s=new B,t=new B,e=new B;return function(i,r,o){let a=i.start,c=s,l=r.start,h=t;e.subVectors(a,l),s.subVectors(i.end,i.start),t.subVectors(r.end,r.start);let u=e.dot(h),f=h.dot(c),d=h.dot(h),g=e.dot(c),m=c.dot(c)*d-f*f,p,y;m!==0?p=(u*f-g*d)/m:p=0,y=(u+p*f)/d,o.x=p,o.y=y}})(),Ka=(function(){let s=new Ht,t=new B,e=new B;return function(i,r,o,a){Qb(i,r,s);let c=s.x,l=s.y;if(c>=0&&c<=1&&l>=0&&l<=1){i.at(c,o),r.at(l,a);return}else if(c>=0&&c<=1){l<0?r.at(0,a):r.at(1,a),i.closestPointToPoint(a,!0,o);return}else if(l>=0&&l<=1){c<0?i.at(0,o):i.at(1,o),r.closestPointToPoint(o,!0,a);return}else{let h;c<0?h=i.start:h=i.end;let u;l<0?u=r.start:u=r.end;let f=t,d=e;if(i.closestPointToPoint(u,!0,t),r.closestPointToPoint(h,!0,e),f.distanceToSquared(u)<=d.distanceToSquared(h)){o.copy(f),a.copy(u);return}else{o.copy(h),a.copy(d);return}}}})(),yx=(function(){let s=new B,t=new B,e=new ln,n=new en;return function(r,o){let{radius:a,center:c}=r,{a:l,b:h,c:u}=o;if(n.start=l,n.end=h,n.closestPointToPoint(c,!0,s).distanceTo(c)<=a||(n.start=l,n.end=u,n.closestPointToPoint(c,!0,s).distanceTo(c)<=a)||(n.start=h,n.end=u,n.closestPointToPoint(c,!0,s).distanceTo(c)<=a))return!0;let x=o.getPlane(e);if(Math.abs(x.distanceToPoint(c))<=a){let p=x.projectPoint(c,t);if(o.containsPoint(p))return!0}return!1}})();var tw=["x","y","z"],ts=1e-15,_x=ts*ts;function jn(s){return Math.abs(s)<ts}var rn=class extends hn{constructor(...t){super(...t),this.isExtendedTriangle=!0,this.satAxes=new Array(4).fill().map(()=>new B),this.satBounds=new Array(4).fill().map(()=>new zn),this.points=[this.a,this.b,this.c],this.plane=new ln,this.isDegenerateIntoSegment=!1,this.isDegenerateIntoPoint=!1,this.degenerateSegment=new en,this.needsUpdate=!0}intersectsSphere(t){return yx(t,this)}update(){let t=this.a,e=this.b,n=this.c,i=this.points,r=this.satAxes,o=this.satBounds,a=r[0],c=o[0];this.getNormal(a),c.setFromPoints(a,i);let l=r[1],h=o[1];l.subVectors(t,e),h.setFromPoints(l,i);let u=r[2],f=o[2];u.subVectors(e,n),f.setFromPoints(u,i);let d=r[3],g=o[3];d.subVectors(n,t),g.setFromPoints(d,i);let x=l.length(),m=u.length(),p=d.length();this.isDegenerateIntoPoint=!1,this.isDegenerateIntoSegment=!1,x<ts?m<ts||p<ts?this.isDegenerateIntoPoint=!0:(this.isDegenerateIntoSegment=!0,this.degenerateSegment.start.copy(t),this.degenerateSegment.end.copy(n)):m<ts?p<ts?this.isDegenerateIntoPoint=!0:(this.isDegenerateIntoSegment=!0,this.degenerateSegment.start.copy(e),this.degenerateSegment.end.copy(t)):p<ts&&(this.isDegenerateIntoSegment=!0,this.degenerateSegment.start.copy(n),this.degenerateSegment.end.copy(e)),this.plane.setFromNormalAndCoplanarPoint(a,t),this.needsUpdate=!1}};rn.prototype.closestPointToSegment=(function(){let s=new B,t=new B,e=new en;return function(i,r=null,o=null){let{start:a,end:c}=i,l=this.points,h,u=1/0;for(let f=0;f<3;f++){let d=(f+1)%3;e.start.copy(l[f]),e.end.copy(l[d]),Ka(e,i,s,t),h=s.distanceToSquared(t),h<u&&(u=h,r&&r.copy(s),o&&o.copy(t))}return this.closestPointToPoint(a,s),h=a.distanceToSquared(s),h<u&&(u=h,r&&r.copy(s),o&&o.copy(a)),this.closestPointToPoint(c,s),h=c.distanceToSquared(s),h<u&&(u=h,r&&r.copy(s),o&&o.copy(c)),Math.sqrt(u)}})();rn.prototype.intersectsTriangle=(function(){let s=new rn,t=new zn,e=new zn,n=new B,i=new B,r=new B,o=new B,a=new en,c=new en,l=new B,h=new Ht,u=new Ht;function f(v,_,w,T){let R=n;!v.isDegenerateIntoPoint&&!v.isDegenerateIntoSegment?R.copy(v.plane.normal):R.copy(_.plane.normal);let L=v.satBounds,S=v.satAxes;for(let A=1;A<4;A++){let N=L[A],C=S[A];if(t.setFromPoints(C,_.points),N.isSeparated(t)||(o.copy(R).cross(C),t.setFromPoints(o,v.points),e.setFromPoints(o,_.points),t.isSeparated(e)))return!1}let M=_.satBounds,b=_.satAxes;for(let A=1;A<4;A++){let N=M[A],C=b[A];if(t.setFromPoints(C,v.points),N.isSeparated(t)||(o.crossVectors(R,C),t.setFromPoints(o,v.points),e.setFromPoints(o,_.points),t.isSeparated(e)))return!1}return w&&(T||console.warn("ExtendedTriangle.intersectsTriangle: Triangles are coplanar which does not support an output edge. Setting edge to 0, 0, 0."),w.start.set(0,0,0),w.end.set(0,0,0)),!0}function d(v,_,w,T,R,L,S,M,b,A,N){let C=S/(S-M);A.x=T+(R-T)*C,N.start.subVectors(_,v).multiplyScalar(C).add(v),C=S/(S-b),A.y=T+(L-T)*C,N.end.subVectors(w,v).multiplyScalar(C).add(v)}function g(v,_,w,T,R,L,S,M,b,A,N){if(R>0)d(v.c,v.a,v.b,T,_,w,b,S,M,A,N);else if(L>0)d(v.b,v.a,v.c,w,_,T,M,S,b,A,N);else if(M*b>0||S!=0)d(v.a,v.b,v.c,_,w,T,S,M,b,A,N);else if(M!=0)d(v.b,v.a,v.c,w,_,T,M,S,b,A,N);else if(b!=0)d(v.c,v.a,v.b,T,_,w,b,S,M,A,N);else return!0;return!1}function x(v,_,w,T){let R=_.degenerateSegment,L=v.plane.distanceToPoint(R.start),S=v.plane.distanceToPoint(R.end);return jn(L)?jn(S)?f(v,_,w,T):(w&&(w.start.copy(R.start),w.end.copy(R.start)),v.containsPoint(R.start)):jn(S)?(w&&(w.start.copy(R.end),w.end.copy(R.end)),v.containsPoint(R.end)):v.plane.intersectLine(R,n)!=null?(w&&(w.start.copy(n),w.end.copy(n)),v.containsPoint(n)):!1}function m(v,_,w){let T=_.a;return jn(v.plane.distanceToPoint(T))&&v.containsPoint(T)?(w&&(w.start.copy(T),w.end.copy(T)),!0):!1}function p(v,_,w){let T=v.degenerateSegment,R=_.a;return T.closestPointToPoint(R,!0,n),R.distanceToSquared(n)<_x?(w&&(w.start.copy(R),w.end.copy(R)),!0):!1}function y(v,_,w,T){if(v.isDegenerateIntoSegment)if(_.isDegenerateIntoSegment){let R=v.degenerateSegment,L=_.degenerateSegment,S=i,M=r;R.delta(S),L.delta(M);let b=n.subVectors(L.start,R.start),A=S.x*M.y-S.y*M.x;if(jn(A))return!1;let N=(b.x*M.y-b.y*M.x)/A,C=-(S.x*b.y-S.y*b.x)/A;if(N<0||N>1||C<0||C>1)return!1;let I=R.start.z+S.z*N,O=L.start.z+M.z*C;return jn(I-O)?(w&&(w.start.copy(R.start).addScaledVector(S,N),w.end.copy(R.start).addScaledVector(S,N)),!0):!1}else return _.isDegenerateIntoPoint?p(v,_,w):x(_,v,w,T);else{if(v.isDegenerateIntoPoint)return _.isDegenerateIntoPoint?_.a.distanceToSquared(v.a)<_x?(w&&(w.start.copy(v.a),w.end.copy(v.a)),!0):!1:_.isDegenerateIntoSegment?p(_,v,w):m(_,v,w);if(_.isDegenerateIntoPoint)return m(v,_,w);if(_.isDegenerateIntoSegment)return x(v,_,w,T)}}return function(_,w=null,T=!1){this.needsUpdate&&this.update(),_.isExtendedTriangle?_.needsUpdate&&_.update():(s.copy(_),s.update(),_=s);let R=y(this,_,w,T);if(R!==void 0)return R;let L=this.plane,S=_.plane,M=S.distanceToPoint(this.a),b=S.distanceToPoint(this.b),A=S.distanceToPoint(this.c);jn(M)&&(M=0),jn(b)&&(b=0),jn(A)&&(A=0);let N=M*b,C=M*A;if(N>0&&C>0)return!1;let I=L.distanceToPoint(_.a),O=L.distanceToPoint(_.b),k=L.distanceToPoint(_.c);jn(I)&&(I=0),jn(O)&&(O=0),jn(k)&&(k=0);let z=I*O,et=I*k;if(z>0&&et>0)return!1;i.copy(L.normal),r.copy(S.normal);let j=i.cross(r),W=0,tt=Math.abs(j.x),at=Math.abs(j.y);at>tt&&(tt=at,W=1),Math.abs(j.z)>tt&&(W=2);let ot=tw[W],J=this.a[ot],it=this.b[ot],ft=this.c[ot],bt=_.a[ot],St=_.b[ot],zt=_.c[ot];if(g(this,J,it,ft,N,C,M,b,A,h,a))return f(this,_,w,T);if(g(_,bt,St,zt,z,et,I,O,k,u,c))return f(this,_,w,T);if(h.y<h.x){let ue=h.y;h.y=h.x,h.x=ue,l.copy(a.start),a.start.copy(a.end),a.end.copy(l)}if(u.y<u.x){let ue=u.y;u.y=u.x,u.x=ue,l.copy(c.start),c.start.copy(c.end),c.end.copy(l)}return h.y<u.x||u.y<h.x?!1:(w&&(u.x>h.x?w.start.copy(c.start):w.start.copy(a.start),u.y<h.y?w.end.copy(c.end):w.end.copy(a.end)),!0)}})();rn.prototype.distanceToPoint=(function(){let s=new B;return function(e){return this.closestPointToPoint(e,s),e.distanceTo(s)}})();rn.prototype.distanceToTriangle=(function(){let s=new B,t=new B,e=["a","b","c"],n=new en,i=new en;return function(o,a=null,c=null){let l=a||c?n:null;if(this.intersectsTriangle(o,l,!0))return(a||c)&&(a&&l.getCenter(a),c&&l.getCenter(c)),0;let h=1/0;for(let u=0;u<3;u++){let f,d=e[u],g=o[d];this.closestPointToPoint(g,s),f=g.distanceToSquared(s),f<h&&(h=f,a&&a.copy(s),c&&c.copy(g));let x=this[d];o.closestPointToPoint(x,s),f=x.distanceToSquared(s),f<h&&(h=f,a&&a.copy(x),c&&c.copy(s))}for(let u=0;u<3;u++){let f=e[u],d=e[(u+1)%3];n.set(this[f],this[d]);for(let g=0;g<3;g++){let x=e[g],m=e[(g+1)%3];i.set(o[x],o[m]),Ka(n,i,s,t);let p=s.distanceToSquared(t);p<h&&(h=p,a&&a.copy(s),c&&c.copy(t))}}return Math.sqrt(h)}})();var Fe=class{constructor(t,e,n){this.isOrientedBox=!0,this.min=new B,this.max=new B,this.matrix=new Pt,this.invMatrix=new Pt,this.points=new Array(8).fill().map(()=>new B),this.satAxes=new Array(3).fill().map(()=>new B),this.satBounds=new Array(3).fill().map(()=>new zn),this.alignedSatBounds=new Array(3).fill().map(()=>new zn),this.needsUpdate=!1,t&&this.min.copy(t),e&&this.max.copy(e),n&&this.matrix.copy(n)}set(t,e,n){this.min.copy(t),this.max.copy(e),this.matrix.copy(n),this.needsUpdate=!0}copy(t){this.min.copy(t.min),this.max.copy(t.max),this.matrix.copy(t.matrix),this.needsUpdate=!0}};Fe.prototype.update=(function(){return function(){let t=this.matrix,e=this.min,n=this.max,i=this.points;for(let l=0;l<=1;l++)for(let h=0;h<=1;h++)for(let u=0;u<=1;u++){let f=1*l|2*h|4*u,d=i[f];d.x=l?n.x:e.x,d.y=h?n.y:e.y,d.z=u?n.z:e.z,d.applyMatrix4(t)}let r=this.satBounds,o=this.satAxes,a=i[0];for(let l=0;l<3;l++){let h=o[l],u=r[l],f=1<<l,d=i[f];h.subVectors(a,d),u.setFromPoints(h,i)}let c=this.alignedSatBounds;c[0].setFromPointsField(i,"x"),c[1].setFromPointsField(i,"y"),c[2].setFromPointsField(i,"z"),this.invMatrix.copy(this.matrix).invert(),this.needsUpdate=!1}})();Fe.prototype.intersectsBox=(function(){let s=new zn;return function(e){this.needsUpdate&&this.update();let n=e.min,i=e.max,r=this.satBounds,o=this.satAxes,a=this.alignedSatBounds;if(s.min=n.x,s.max=i.x,a[0].isSeparated(s)||(s.min=n.y,s.max=i.y,a[1].isSeparated(s))||(s.min=n.z,s.max=i.z,a[2].isSeparated(s)))return!1;for(let c=0;c<3;c++){let l=o[c],h=r[c];if(s.setFromBox(l,e),h.isSeparated(s))return!1}return!0}})();Fe.prototype.intersectsTriangle=(function(){let s=new rn,t=new Array(3),e=new zn,n=new zn,i=new B;return function(o){this.needsUpdate&&this.update(),o.isExtendedTriangle?o.needsUpdate&&o.update():(s.copy(o),s.update(),o=s);let a=this.satBounds,c=this.satAxes;t[0]=o.a,t[1]=o.b,t[2]=o.c;for(let f=0;f<3;f++){let d=a[f],g=c[f];if(e.setFromPoints(g,t),d.isSeparated(e))return!1}let l=o.satBounds,h=o.satAxes,u=this.points;for(let f=0;f<3;f++){let d=l[f],g=h[f];if(e.setFromPoints(g,u),d.isSeparated(e))return!1}for(let f=0;f<3;f++){let d=c[f];for(let g=0;g<4;g++){let x=h[g];if(i.crossVectors(d,x),e.setFromPoints(i,t),n.setFromPoints(i,u),e.isSeparated(n))return!1}}return!0}})();Fe.prototype.closestPointToPoint=(function(){return function(t,e){return this.needsUpdate&&this.update(),e.copy(t).applyMatrix4(this.invMatrix).clamp(this.min,this.max).applyMatrix4(this.matrix),e}})();Fe.prototype.distanceToPoint=(function(){let s=new B;return function(e){return this.closestPointToPoint(e,s),e.distanceTo(s)}})();Fe.prototype.distanceToBox=(function(){let s=["x","y","z"],t=new Array(12).fill().map(()=>new en),e=new Array(12).fill().map(()=>new en),n=new B,i=new B;return function(o,a=0,c=null,l=null){if(this.needsUpdate&&this.update(),this.intersectsBox(o))return(c||l)&&(o.getCenter(i),this.closestPointToPoint(i,n),o.closestPointToPoint(n,i),c&&c.copy(n),l&&l.copy(i)),0;let h=a*a,u=o.min,f=o.max,d=this.points,g=1/0;for(let m=0;m<8;m++){let p=d[m];i.copy(p).clamp(u,f);let y=p.distanceToSquared(i);if(y<g&&(g=y,c&&c.copy(p),l&&l.copy(i),y<h))return Math.sqrt(y)}let x=0;for(let m=0;m<3;m++)for(let p=0;p<=1;p++)for(let y=0;y<=1;y++){let v=(m+1)%3,_=(m+2)%3,w=p<<v|y<<_,T=1<<m|p<<v|y<<_,R=d[w],L=d[T];t[x].set(R,L);let M=s[m],b=s[v],A=s[_],N=e[x],C=N.start,I=N.end;C[M]=u[M],C[b]=p?u[b]:f[b],C[A]=y?u[A]:f[b],I[M]=f[M],I[b]=p?u[b]:f[b],I[A]=y?u[A]:f[b],x++}for(let m=0;m<=1;m++)for(let p=0;p<=1;p++)for(let y=0;y<=1;y++){i.x=m?f.x:u.x,i.y=p?f.y:u.y,i.z=y?f.z:u.z,this.closestPointToPoint(i,n);let v=i.distanceToSquared(n);if(v<g&&(g=v,c&&c.copy(n),l&&l.copy(i),v<h))return Math.sqrt(v)}for(let m=0;m<12;m++){let p=t[m];for(let y=0;y<12;y++){let v=e[y];Ka(p,v,n,i);let _=n.distanceToSquared(i);if(_<g&&(g=_,c&&c.copy(n),l&&l.copy(i),_<h))return Math.sqrt(_)}}return Math.sqrt(g)}})();var up=class extends Ms{constructor(){super(()=>new rn)}},bn=new up;var Za=new B,fp=new B;function vx(s,t,e={},n=0,i=1/0){let r=n*n,o=i*i,a=1/0,c=null;if(s.shapecast({boundsTraverseOrder:h=>(Za.copy(t).clamp(h.min,h.max),Za.distanceToSquared(t)),intersectsBounds:(h,u,f)=>f<a&&f<o,intersectsTriangle:(h,u)=>{h.closestPointToPoint(t,Za);let f=t.distanceToSquared(Za);return f<a&&(fp.copy(Za),a=f,c=u),f<r}}),a===1/0)return null;let l=Math.sqrt(a);return e.point?e.point.copy(fp):e.point=fp.clone(),e.distance=l,e.faceIndex=c,e}var Zh=parseInt("180")>=169,ew=parseInt("180")<=161,hr=new B,ur=new B,fr=new B,jh=new Ht,Qh=new Ht,tu=new Ht,Sx=new B,Mx=new B,bx=new B,ja=new B;function nw(s,t,e,n,i,r,o,a){let c;if(r===nn?c=s.intersectTriangle(n,e,t,!0,i):c=s.intersectTriangle(t,e,n,r!==Ce,i),c===null)return null;let l=s.origin.distanceTo(i);return l<o||l>a?null:{distance:l,point:i.clone()}}function wx(s,t,e,n,i,r,o,a,c,l,h){hr.fromBufferAttribute(t,r),ur.fromBufferAttribute(t,o),fr.fromBufferAttribute(t,a);let u=nw(s,hr,ur,fr,ja,c,l,h);if(u){if(n){jh.fromBufferAttribute(n,r),Qh.fromBufferAttribute(n,o),tu.fromBufferAttribute(n,a),u.uv=new Ht;let d=hn.getInterpolation(ja,hr,ur,fr,jh,Qh,tu,u.uv);Zh||(u.uv=d)}if(i){jh.fromBufferAttribute(i,r),Qh.fromBufferAttribute(i,o),tu.fromBufferAttribute(i,a),u.uv1=new Ht;let d=hn.getInterpolation(ja,hr,ur,fr,jh,Qh,tu,u.uv1);Zh||(u.uv1=d),ew&&(u.uv2=u.uv1)}if(e){Sx.fromBufferAttribute(e,r),Mx.fromBufferAttribute(e,o),bx.fromBufferAttribute(e,a),u.normal=new B;let d=hn.getInterpolation(ja,hr,ur,fr,Sx,Mx,bx,u.normal);u.normal.dot(s.direction)>0&&u.normal.multiplyScalar(-1),Zh||(u.normal=d)}let f={a:r,b:o,c:a,normal:new B,materialIndex:0};if(hn.getNormal(hr,ur,fr,f.normal),u.face=f,u.faceIndex=r,Zh){let d=new B;hn.getBarycoord(ja,hr,ur,fr,d),u.barycoord=d}}return u}function Ex(s){return s&&s.isMaterial?s.side:s}function Do(s,t,e,n,i,r,o){let a=n*3,c=a+0,l=a+1,h=a+2,{index:u,groups:f}=s;s.index&&(c=u.getX(c),l=u.getX(l),h=u.getX(h));let{position:d,normal:g,uv:x,uv1:m}=s.attributes;if(Array.isArray(t)){let p=n*3;for(let y=0,v=f.length;y<v;y++){let{start:_,count:w,materialIndex:T}=f[y];if(p>=_&&p<_+w){let R=Ex(t[T]),L=wx(e,d,g,x,m,c,l,h,R,r,o);if(L)if(L.faceIndex=n,L.face.materialIndex=T,i)i.push(L);else return L}}}else{let p=Ex(t),y=wx(e,d,g,x,m,c,l,h,p,r,o);if(y)if(y.faceIndex=n,y.face.materialIndex=0,i)i.push(y);else return y}return null}function Re(s,t,e,n){let i=s.a,r=s.b,o=s.c,a=t,c=t+1,l=t+2;e&&(a=e.getX(a),c=e.getX(c),l=e.getX(l)),i.x=n.getX(a),i.y=n.getY(a),i.z=n.getZ(a),r.x=n.getX(c),r.y=n.getY(c),r.z=n.getZ(c),o.x=n.getX(l),o.y=n.getY(l),o.z=n.getZ(l)}function Tx(s,t,e,n,i,r,o,a){let{geometry:c,_indirectBuffer:l}=s;for(let h=n,u=n+i;h<u;h++)Do(c,t,e,h,r,o,a)}function Ax(s,t,e,n,i,r,o){let{geometry:a,_indirectBuffer:c}=s,l=1/0,h=null;for(let u=n,f=n+i;u<f;u++){let d;d=Do(a,t,e,u,null,r,o),d&&d.distance<l&&(h=d,l=d.distance)}return h}function Rx(s,t,e,n,i,r,o){let{geometry:a}=e,{index:c}=a,l=a.attributes.position;for(let h=s,u=t+s;h<u;h++){let f;if(f=h,Re(o,f*3,c,l),o.needsUpdate=!0,n(o,f,i,r))return!0}return!1}function Cx(s,t=null){t&&Array.isArray(t)&&(t=new Set(t));let e=s.geometry,n=e.index?e.index.array:null,i=e.attributes.position,r,o,a,c,l=0,h=s._roots;for(let f=0,d=h.length;f<d;f++)r=h[f],o=new Uint32Array(r),a=new Uint16Array(r),c=new Float32Array(r),u(0,l),l+=r.byteLength;function u(f,d,g=!1){let x=f*2;if(ce(x,a)){let m=ye(f,o),p=we(x,a),y=1/0,v=1/0,_=1/0,w=-1/0,T=-1/0,R=-1/0;for(let L=3*m,S=3*(m+p);L<S;L++){let M=n[L],b=i.getX(M),A=i.getY(M),N=i.getZ(M);b<y&&(y=b),b>w&&(w=b),A<v&&(v=A),A>T&&(T=A),N<_&&(_=N),N>R&&(R=N)}return c[f+0]!==y||c[f+1]!==v||c[f+2]!==_||c[f+3]!==w||c[f+4]!==T||c[f+5]!==R?(c[f+0]=y,c[f+1]=v,c[f+2]=_,c[f+3]=w,c[f+4]=T,c[f+5]=R,!0):!1}else{let m=ge(f),p=xe(f,o),y=g,v=!1,_=!1;if(t){if(!y){let M=m/8+d/32,b=p/8+d/32;v=t.has(M),_=t.has(b),y=!v&&!_}}else v=!0,_=!0;let w=y||v,T=y||_,R=!1;w&&(R=u(m,d,y));let L=!1;T&&(L=u(p,d,y));let S=R||L;if(S)for(let M=0;M<3;M++){let b=m+M,A=p+M,N=c[b],C=c[b+3],I=c[A],O=c[A+3];c[f+M]=N<I?N:I,c[f+M+3]=C>O?C:O}return S}}}function Qn(s,t,e,n,i){let r,o,a,c,l,h,u=1/e.direction.x,f=1/e.direction.y,d=1/e.direction.z,g=e.origin.x,x=e.origin.y,m=e.origin.z,p=t[s],y=t[s+3],v=t[s+1],_=t[s+3+1],w=t[s+2],T=t[s+3+2];return u>=0?(r=(p-g)*u,o=(y-g)*u):(r=(y-g)*u,o=(p-g)*u),f>=0?(a=(v-x)*f,c=(_-x)*f):(a=(_-x)*f,c=(v-x)*f),r>c||a>o||((a>r||isNaN(r))&&(r=a),(c<o||isNaN(o))&&(o=c),d>=0?(l=(w-m)*d,h=(T-m)*d):(l=(T-m)*d,h=(w-m)*d),r>h||l>o)?!1:((l>r||r!==r)&&(r=l),(h<o||o!==o)&&(o=h),r<=i&&o>=n)}function Ix(s,t,e,n,i,r,o,a){let{geometry:c,_indirectBuffer:l}=s;for(let h=n,u=n+i;h<u;h++){let f=l?l[h]:h;Do(c,t,e,f,r,o,a)}}function Px(s,t,e,n,i,r,o){let{geometry:a,_indirectBuffer:c}=s,l=1/0,h=null;for(let u=n,f=n+i;u<f;u++){let d;d=Do(a,t,e,c?c[u]:u,null,r,o),d&&d.distance<l&&(h=d,l=d.distance)}return h}function Lx(s,t,e,n,i,r,o){let{geometry:a}=e,{index:c}=a,l=a.attributes.position;for(let h=s,u=t+s;h<u;h++){let f;if(f=e.resolveTriangleIndex(h),Re(o,f*3,c,l),o.needsUpdate=!0,n(o,f,i,r))return!0}return!1}function Nx(s,t,e,n,i,r,o){he.setBuffer(s._roots[t]),dp(0,s,e,n,i,r,o),he.clearBuffer()}function dp(s,t,e,n,i,r,o){let{float32Array:a,uint16Array:c,uint32Array:l}=he,h=s*2;if(ce(h,c)){let f=ye(s,l),d=we(h,c);Tx(t,e,n,f,d,i,r,o)}else{let f=ge(s);Qn(f,a,n,r,o)&&dp(f,t,e,n,i,r,o);let d=xe(s,l);Qn(d,a,n,r,o)&&dp(d,t,e,n,i,r,o)}}var iw=["x","y","z"];function Dx(s,t,e,n,i,r){he.setBuffer(s._roots[t]);let o=pp(0,s,e,n,i,r);return he.clearBuffer(),o}function pp(s,t,e,n,i,r){let{float32Array:o,uint16Array:a,uint32Array:c}=he,l=s*2;if(ce(l,a)){let u=ye(s,c),f=we(l,a);return Ax(t,e,n,u,f,i,r)}else{let u=Ao(s,c),f=iw[u],g=n.direction[f]>=0,x,m;g?(x=ge(s),m=xe(s,c)):(x=xe(s,c),m=ge(s));let y=Qn(x,o,n,i,r)?pp(x,t,e,n,i,r):null;if(y){let w=y.point[f];if(g?w<=o[m+u]:w>=o[m+u+3])return y}let _=Qn(m,o,n,i,r)?pp(m,t,e,n,i,r):null;return y&&_?y.distance<=_.distance?y:_:y||_||null}}var eu=new le,Oo=new rn,Uo=new rn,Qa=new Pt,Ox=new Fe,nu=new Fe;function Ux(s,t,e,n){he.setBuffer(s._roots[t]);let i=mp(0,s,e,n);return he.clearBuffer(),i}function mp(s,t,e,n,i=null){let{float32Array:r,uint16Array:o,uint32Array:a}=he,c=s*2;if(i===null&&(e.boundingBox||e.computeBoundingBox(),Ox.set(e.boundingBox.min,e.boundingBox.max,n),i=Ox),ce(c,o)){let h=t.geometry,u=h.index,f=h.attributes.position,d=e.index,g=e.attributes.position,x=ye(s,a),m=we(c,o);if(Qa.copy(n).invert(),e.boundsTree)return Ae(s,r,nu),nu.matrix.copy(Qa),nu.needsUpdate=!0,e.boundsTree.shapecast({intersectsBounds:y=>nu.intersectsBox(y),intersectsTriangle:y=>{y.a.applyMatrix4(n),y.b.applyMatrix4(n),y.c.applyMatrix4(n),y.needsUpdate=!0;for(let v=x*3,_=(m+x)*3;v<_;v+=3)if(Re(Uo,v,u,f),Uo.needsUpdate=!0,y.intersectsTriangle(Uo))return!0;return!1}});{let p=Es(e);for(let y=x*3,v=(m+x)*3;y<v;y+=3){Re(Oo,y,u,f),Oo.a.applyMatrix4(Qa),Oo.b.applyMatrix4(Qa),Oo.c.applyMatrix4(Qa),Oo.needsUpdate=!0;for(let _=0,w=p*3;_<w;_+=3)if(Re(Uo,_,d,g),Uo.needsUpdate=!0,Oo.intersectsTriangle(Uo))return!0}}}else{let h=ge(s),u=xe(s,a);return Ae(h,r,eu),!!(i.intersectsBox(eu)&&mp(h,t,e,n,i)||(Ae(u,r,eu),i.intersectsBox(eu)&&mp(u,t,e,n,i)))}}var iu=new Pt,gp=new Fe,tc=new Fe,sw=new B,rw=new B,ow=new B,aw=new B;function Fx(s,t,e,n={},i={},r=0,o=1/0){t.boundingBox||t.computeBoundingBox(),gp.set(t.boundingBox.min,t.boundingBox.max,e),gp.needsUpdate=!0;let a=s.geometry,c=a.attributes.position,l=a.index,h=t.attributes.position,u=t.index,f=bn.getPrimitive(),d=bn.getPrimitive(),g=sw,x=rw,m=null,p=null;i&&(m=ow,p=aw);let y=1/0,v=null,_=null;return iu.copy(e).invert(),tc.matrix.copy(iu),s.shapecast({boundsTraverseOrder:w=>gp.distanceToBox(w),intersectsBounds:(w,T,R)=>R<y&&R<o?(T&&(tc.min.copy(w.min),tc.max.copy(w.max),tc.needsUpdate=!0),!0):!1,intersectsRange:(w,T)=>{if(t.boundsTree)return t.boundsTree.shapecast({boundsTraverseOrder:L=>tc.distanceToBox(L),intersectsBounds:(L,S,M)=>M<y&&M<o,intersectsRange:(L,S)=>{for(let M=L,b=L+S;M<b;M++){Re(d,3*M,u,h),d.a.applyMatrix4(e),d.b.applyMatrix4(e),d.c.applyMatrix4(e),d.needsUpdate=!0;for(let A=w,N=w+T;A<N;A++){Re(f,3*A,l,c),f.needsUpdate=!0;let C=f.distanceToTriangle(d,g,m);if(C<y&&(x.copy(g),p&&p.copy(m),y=C,v=A,_=M),C<r)return!0}}}});{let R=Es(t);for(let L=0,S=R;L<S;L++){Re(d,3*L,u,h),d.a.applyMatrix4(e),d.b.applyMatrix4(e),d.c.applyMatrix4(e),d.needsUpdate=!0;for(let M=w,b=w+T;M<b;M++){Re(f,3*M,l,c),f.needsUpdate=!0;let A=f.distanceToTriangle(d,g,m);if(A<y&&(x.copy(g),p&&p.copy(m),y=A,v=M,_=L),A<r)return!0}}}}}),bn.releasePrimitive(f),bn.releasePrimitive(d),y===1/0?null:(n.point?n.point.copy(x):n.point=x.clone(),n.distance=y,n.faceIndex=v,i&&(i.point?i.point.copy(p):i.point=p.clone(),i.point.applyMatrix4(iu),x.applyMatrix4(iu),i.distance=x.sub(i.point).length(),i.faceIndex=_),n)}function Bx(s,t=null){t&&Array.isArray(t)&&(t=new Set(t));let e=s.geometry,n=e.index?e.index.array:null,i=e.attributes.position,r,o,a,c,l=0,h=s._roots;for(let f=0,d=h.length;f<d;f++)r=h[f],o=new Uint32Array(r),a=new Uint16Array(r),c=new Float32Array(r),u(0,l),l+=r.byteLength;function u(f,d,g=!1){let x=f*2;if(ce(x,a)){let m=ye(f,o),p=we(x,a),y=1/0,v=1/0,_=1/0,w=-1/0,T=-1/0,R=-1/0;for(let L=m,S=m+p;L<S;L++){let M=3*s.resolveTriangleIndex(L);for(let b=0;b<3;b++){let A=M+b;A=n?n[A]:A;let N=i.getX(A),C=i.getY(A),I=i.getZ(A);N<y&&(y=N),N>w&&(w=N),C<v&&(v=C),C>T&&(T=C),I<_&&(_=I),I>R&&(R=I)}}return c[f+0]!==y||c[f+1]!==v||c[f+2]!==_||c[f+3]!==w||c[f+4]!==T||c[f+5]!==R?(c[f+0]=y,c[f+1]=v,c[f+2]=_,c[f+3]=w,c[f+4]=T,c[f+5]=R,!0):!1}else{let m=ge(f),p=xe(f,o),y=g,v=!1,_=!1;if(t){if(!y){let M=m/8+d/32,b=p/8+d/32;v=t.has(M),_=t.has(b),y=!v&&!_}}else v=!0,_=!0;let w=y||v,T=y||_,R=!1;w&&(R=u(m,d,y));let L=!1;T&&(L=u(p,d,y));let S=R||L;if(S)for(let M=0;M<3;M++){let b=m+M,A=p+M,N=c[b],C=c[b+3],I=c[A],O=c[A+3];c[f+M]=N<I?N:I,c[f+M+3]=C>O?C:O}return S}}}function zx(s,t,e,n,i,r,o){he.setBuffer(s._roots[t]),xp(0,s,e,n,i,r,o),he.clearBuffer()}function xp(s,t,e,n,i,r,o){let{float32Array:a,uint16Array:c,uint32Array:l}=he,h=s*2;if(ce(h,c)){let f=ye(s,l),d=we(h,c);Ix(t,e,n,f,d,i,r,o)}else{let f=ge(s);Qn(f,a,n,r,o)&&xp(f,t,e,n,i,r,o);let d=xe(s,l);Qn(d,a,n,r,o)&&xp(d,t,e,n,i,r,o)}}var cw=["x","y","z"];function kx(s,t,e,n,i,r){he.setBuffer(s._roots[t]);let o=yp(0,s,e,n,i,r);return he.clearBuffer(),o}function yp(s,t,e,n,i,r){let{float32Array:o,uint16Array:a,uint32Array:c}=he,l=s*2;if(ce(l,a)){let u=ye(s,c),f=we(l,a);return Px(t,e,n,u,f,i,r)}else{let u=Ao(s,c),f=cw[u],g=n.direction[f]>=0,x,m;g?(x=ge(s),m=xe(s,c)):(x=xe(s,c),m=ge(s));let y=Qn(x,o,n,i,r)?yp(x,t,e,n,i,r):null;if(y){let w=y.point[f];if(g?w<=o[m+u]:w>=o[m+u+3])return y}let _=Qn(m,o,n,i,r)?yp(m,t,e,n,i,r):null;return y&&_?y.distance<=_.distance?y:_:y||_||null}}var su=new le,Fo=new rn,Bo=new rn,ec=new Pt,Hx=new Fe,ru=new Fe;function Vx(s,t,e,n){he.setBuffer(s._roots[t]);let i=_p(0,s,e,n);return he.clearBuffer(),i}function _p(s,t,e,n,i=null){let{float32Array:r,uint16Array:o,uint32Array:a}=he,c=s*2;if(i===null&&(e.boundingBox||e.computeBoundingBox(),Hx.set(e.boundingBox.min,e.boundingBox.max,n),i=Hx),ce(c,o)){let h=t.geometry,u=h.index,f=h.attributes.position,d=e.index,g=e.attributes.position,x=ye(s,a),m=we(c,o);if(ec.copy(n).invert(),e.boundsTree)return Ae(s,r,ru),ru.matrix.copy(ec),ru.needsUpdate=!0,e.boundsTree.shapecast({intersectsBounds:y=>ru.intersectsBox(y),intersectsTriangle:y=>{y.a.applyMatrix4(n),y.b.applyMatrix4(n),y.c.applyMatrix4(n),y.needsUpdate=!0;for(let v=x,_=m+x;v<_;v++)if(Re(Bo,3*t.resolveTriangleIndex(v),u,f),Bo.needsUpdate=!0,y.intersectsTriangle(Bo))return!0;return!1}});{let p=Es(e);for(let y=x,v=m+x;y<v;y++){let _=t.resolveTriangleIndex(y);Re(Fo,3*_,u,f),Fo.a.applyMatrix4(ec),Fo.b.applyMatrix4(ec),Fo.c.applyMatrix4(ec),Fo.needsUpdate=!0;for(let w=0,T=p*3;w<T;w+=3)if(Re(Bo,w,d,g),Bo.needsUpdate=!0,Fo.intersectsTriangle(Bo))return!0}}}else{let h=ge(s),u=xe(s,a);return Ae(h,r,su),!!(i.intersectsBox(su)&&_p(h,t,e,n,i)||(Ae(u,r,su),i.intersectsBox(su)&&_p(u,t,e,n,i)))}}var ou=new Pt,vp=new Fe,nc=new Fe,lw=new B,hw=new B,uw=new B,fw=new B;function Gx(s,t,e,n={},i={},r=0,o=1/0){t.boundingBox||t.computeBoundingBox(),vp.set(t.boundingBox.min,t.boundingBox.max,e),vp.needsUpdate=!0;let a=s.geometry,c=a.attributes.position,l=a.index,h=t.attributes.position,u=t.index,f=bn.getPrimitive(),d=bn.getPrimitive(),g=lw,x=hw,m=null,p=null;i&&(m=uw,p=fw);let y=1/0,v=null,_=null;return ou.copy(e).invert(),nc.matrix.copy(ou),s.shapecast({boundsTraverseOrder:w=>vp.distanceToBox(w),intersectsBounds:(w,T,R)=>R<y&&R<o?(T&&(nc.min.copy(w.min),nc.max.copy(w.max),nc.needsUpdate=!0),!0):!1,intersectsRange:(w,T)=>{if(t.boundsTree){let R=t.boundsTree;return R.shapecast({boundsTraverseOrder:L=>nc.distanceToBox(L),intersectsBounds:(L,S,M)=>M<y&&M<o,intersectsRange:(L,S)=>{for(let M=L,b=L+S;M<b;M++){let A=R.resolveTriangleIndex(M);Re(d,3*A,u,h),d.a.applyMatrix4(e),d.b.applyMatrix4(e),d.c.applyMatrix4(e),d.needsUpdate=!0;for(let N=w,C=w+T;N<C;N++){let I=s.resolveTriangleIndex(N);Re(f,3*I,l,c),f.needsUpdate=!0;let O=f.distanceToTriangle(d,g,m);if(O<y&&(x.copy(g),p&&p.copy(m),y=O,v=N,_=M),O<r)return!0}}}})}else{let R=Es(t);for(let L=0,S=R;L<S;L++){Re(d,3*L,u,h),d.a.applyMatrix4(e),d.b.applyMatrix4(e),d.c.applyMatrix4(e),d.needsUpdate=!0;for(let M=w,b=w+T;M<b;M++){let A=s.resolveTriangleIndex(M);Re(f,3*A,l,c),f.needsUpdate=!0;let N=f.distanceToTriangle(d,g,m);if(N<y&&(x.copy(g),p&&p.copy(m),y=N,v=M,_=L),N<r)return!0}}}}}),bn.releasePrimitive(f),bn.releasePrimitive(d),y===1/0?null:(n.point?n.point.copy(x):n.point=x.clone(),n.distance=y,n.faceIndex=v,i&&(i.point?i.point.copy(p):i.point=p.clone(),i.point.applyMatrix4(ou),x.applyMatrix4(ou),i.distance=x.sub(i.point).length(),i.faceIndex=_),n)}function Sp(s,t,e){return s===null?null:(s.point.applyMatrix4(t.matrixWorld),s.distance=s.point.distanceTo(e.ray.origin),s.object=t,s)}var au=new Fe,cu=new dn,Wx=new B,Xx=new Pt,qx=new B,Mp=["getX","getY","getZ"],lu=class s extends Kh{static serialize(t,e={}){e={cloneBuffers:!0,...e};let n=t.geometry,i=t._roots,r=t._indirectBuffer,o=n.getIndex(),a={version:1,roots:null,index:null,indirectBuffer:null};return e.cloneBuffers?(a.roots=i.map(c=>c.slice()),a.index=o?o.array.slice():null,a.indirectBuffer=r?r.slice():null):(a.roots=i,a.index=o?o.array:null,a.indirectBuffer=r),a}static deserialize(t,e,n={}){n={setIndex:!0,indirect:!!t.indirectBuffer,...n};let{index:i,roots:r,indirectBuffer:o}=t;t.version||(console.warn("MeshBVH.deserialize: Serialization format has been changed and will be fixed up. It is recommended to regenerate any stored serialized data."),c(r));let a=new s(e,{...n,[qa]:!0});if(a._roots=r,a._indirectBuffer=o||null,n.setIndex){let l=e.getIndex();if(l===null){let h=new re(t.index,1,!1);e.setIndex(h)}else l.array!==i&&(l.array.set(i),l.needsUpdate=!0)}return a;function c(l){for(let h=0;h<l.length;h++){let u=l[h],f=new Uint32Array(u),d=new Uint16Array(u);for(let g=0,x=u.byteLength/32;g<x;g++){let m=8*g,p=2*m;ce(p,d)||(f[m+6]=f[m+6]/8-g)}}}}get primitiveStride(){return 3}get resolveTriangleIndex(){return this.resolvePrimitiveIndex}constructor(t,e={}){e.maxLeafTris&&(console.warn('MeshBVH: "maxLeafTris" option has been deprecated. Use "targetLeafSize", instead.'),e={...e,targetLeafSize:e.maxLeafTris}),super(t,e)}shiftTriangleOffsets(t){return super.shiftPrimitiveOffsets(t)}writePrimitiveBounds(t,e,n){let i=this.geometry,r=this._indirectBuffer,o=i.attributes.position,a=i.index?i.index.array:null,l=(r?r[t]:t)*3,h=l+0,u=l+1,f=l+2;a&&(h=a[h],u=a[u],f=a[f]);for(let d=0;d<3;d++){let g=o[Mp[d]](h),x=o[Mp[d]](u),m=o[Mp[d]](f),p=g;x<p&&(p=x),m<p&&(p=m);let y=g;x>y&&(y=x),m>y&&(y=m),e[n+d]=p,e[n+d+3]=y}return e}computePrimitiveBounds(t,e,n){let i=this.geometry,r=this._indirectBuffer,o=i.attributes.position,a=i.index?i.index.array:null,c=o.normalized;if(t<0||e+t-n.offset>n.length/6)throw new Error("MeshBVH: compute triangle bounds range is invalid.");let l=o.array,h=o.offset||0,u=3;o.isInterleavedBufferAttribute&&(u=o.data.stride);let f=["getX","getY","getZ"],d=n.offset;for(let g=t,x=t+e;g<x;g++){let p=(r?r[g]:g)*3,y=(g-d)*6,v=p+0,_=p+1,w=p+2;a&&(v=a[v],_=a[_],w=a[w]),c||(v=v*u+h,_=_*u+h,w=w*u+h);for(let T=0;T<3;T++){let R,L,S;c?(R=o[f[T]](v),L=o[f[T]](_),S=o[f[T]](w)):(R=l[v+T],L=l[_+T],S=l[w+T]);let M=R;L<M&&(M=L),S<M&&(M=S);let b=R;L>b&&(b=L),S>b&&(b=S);let A=(b-M)/2,N=T*2;n[y+N+0]=M+A,n[y+N+1]=A+(Math.abs(M)+A)*Eo}}return n}raycastObject3D(t,e,n=[]){let{material:i}=t;if(i===void 0)return;Xx.copy(t.matrixWorld).invert(),cu.copy(e.ray).applyMatrix4(Xx),qx.setFromMatrixScale(t.matrixWorld),Wx.copy(cu.direction).multiply(qx);let r=Wx.length(),o=e.near/r,a=e.far/r;if(e.firstHitOnly===!0){let c=this.raycastFirst(cu,i,o,a);c=Sp(c,t,e),c&&n.push(c)}else{let c=this.raycast(cu,i,o,a);for(let l=0,h=c.length;l<h;l++){let u=Sp(c[l],t,e);u&&n.push(u)}}return n}refit(t=null){return(this.indirect?Bx:Cx)(this,t)}raycast(t,e=fn,n=0,i=1/0){let r=this._roots,o=[],a=this.indirect?zx:Nx;for(let c=0,l=r.length;c<l;c++)a(this,c,e,t,o,n,i);return o}raycastFirst(t,e=fn,n=0,i=1/0){let r=this._roots,o=null,a=this.indirect?kx:Dx;for(let c=0,l=r.length;c<l;c++){let h=a(this,c,e,t,n,i);h!=null&&(o==null||h.distance<o.distance)&&(o=h)}return o}intersectsGeometry(t,e){let n=!1,i=this._roots,r=this.indirect?Vx:Ux;for(let o=0,a=i.length;o<a&&(n=r(this,o,t,e),!n);o++);return n}shapecast(t){let e=bn.getPrimitive(),n=super.shapecast({...t,intersectsPrimitive:t.intersectsTriangle,scratchPrimitive:e,iterate:this.indirect?Lx:Rx});return bn.releasePrimitive(e),n}bvhcast(t,e,n){let{intersectsRanges:i,intersectsTriangles:r}=n,o=bn.getPrimitive(),a=this.geometry.index,c=this.geometry.attributes.position,l=this.indirect?g=>{let x=this.resolveTriangleIndex(g);Re(o,x*3,a,c)}:g=>{Re(o,g*3,a,c)},h=bn.getPrimitive(),u=t.geometry.index,f=t.geometry.attributes.position,d=t.indirect?g=>{let x=t.resolveTriangleIndex(g);Re(h,x*3,u,f)}:g=>{Re(h,g*3,u,f)};if(r){if(!(t instanceof s))throw new Error('MeshBVH: "intersectsTriangles" callback can only be used with another MeshBVH.');let g=(x,m,p,y,v,_,w,T)=>{for(let R=p,L=p+y;R<L;R++){d(R),h.a.applyMatrix4(e),h.b.applyMatrix4(e),h.c.applyMatrix4(e),h.needsUpdate=!0;for(let S=x,M=x+m;S<M;S++)if(l(S),o.needsUpdate=!0,r(o,h,S,R,v,_,w,T))return!0}return!1};if(i){let x=i;i=function(m,p,y,v,_,w,T,R){return x(m,p,y,v,_,w,T,R)?!0:g(m,p,y,v,_,w,T,R)}}else i=g}return super.bvhcast(t,e,{intersectsRanges:i})}intersectsBox(t,e){return au.set(t.min,t.max,e),au.needsUpdate=!0,this.shapecast({intersectsBounds:n=>au.intersectsBox(n),intersectsTriangle:n=>au.intersectsTriangle(n)})}intersectsSphere(t){return this.shapecast({intersectsBounds:e=>t.intersectsBox(e),intersectsTriangle:e=>e.intersectsSphere(t)})}closestPointToGeometry(t,e,n={},i={},r=0,o=1/0){return(this.indirect?Gx:Fx)(this,t,e,n,i,r,o)}closestPointToPoint(t,e={},n=0,i=1/0){return vx(this,t,e,n,i)}};var dw=new B(1,0,0),$x=()=>new B,hu=class{constructor(){this.entries=[],this.active=!1,this.queryCount=0,this.blockedCount=0}setMeshes(t){this.entries=t.map(({mesh:e,solid:n=!0})=>(e.updateWorldMatrix(!0,!1),e.geometry.computeBoundingBox(),{mesh:e,solid:n,bvh:new lu(e.geometry,{targetLeafSize:8,indirect:!0}),inverse:new Pt})),this.updateMatrices()}updateMatrices(){for(let t of this.entries)t.mesh.updateWorldMatrix(!0,!1),t.inverse.copy(t.mesh.matrixWorld).invert()}setActive(t){this.active=t===!0}capsule(t,e,n,i,r=1){let o=t.profile.radiusM,a=Math.max(t.profile.totalLengthM*.28,t.profile.totalLengthM*.5-o),c=dw.clone().applyQuaternion(n),l=e.clone().addScaledVector(c,-a).multiplyScalar(10).applyMatrix4(i.inverse),h=e.clone().addScaledVector(c,a).multiplyScalar(10).applyMatrix4(i.inverse),u=new B().setFromMatrixScale(i.inverse),f=o*10*Math.max(u.x,u.y,u.z)*r;return{segment:new en(l,h),radius:f,box:new le().setFromPoints([l,h]).expandByScalar(f)}}clearPose(t,e,n,i=1){if(!this.active)return!0;for(let r of this.entries){let o=this.capsule(t,e,n,r,i);if(this.queryCount++,!r.mesh.geometry.boundingBox.intersectsBox(o.box))continue;let a=!1;if(r.bvh.shapecast({intersectsBounds:l=>l.intersectsBox(o.box),intersectsTriangle:l=>l.closestPointToSegment(o.segment,$x(),$x())<o.radius?(a=!0,!0):!1}),a)return this.blockedCount++,!1;let c=e.clone().multiplyScalar(10).applyMatrix4(r.inverse);if(r.solid&&r.mesh.geometry.boundingBox.containsPoint(c)){let l=r.bvh.raycast(new dn(c,new B(.923,.271,.271).normalize()),Ce).sort((f,d)=>f.distance-d.distance),h=0,u=-1/0;for(let f of l)f.distance>1e-6&&f.distance-u>1e-5&&(h++,u=f.distance);if(h%2)return this.blockedCount++,!1}}return!0}clearMotion(t,e,n,i,r){if(!this.active)return!0;let o=e.distanceTo(n)+t.profile.totalLengthM*.5*i.angleTo(r),a=Math.max(1,Math.ceil(o/Math.max(5e-4,t.profile.radiusM*.3)));if(a>24)return this.blockedCount++,!1;for(let c=1;c<=a;c++)if(!this.clearPose(t,e.clone().lerp(n,c/a),i.clone().slerp(r,c/a),1.06))return!1;return!0}lineOfSight(t,e){if(!this.active||t.distanceTo(e)<1e-8)return!0;for(let i of this.entries){let r=t.clone().multiplyScalar(10).applyMatrix4(i.inverse),o=e.clone().multiplyScalar(10).applyMatrix4(i.inverse),a=new dn(r,o.clone().sub(r).normalize()),c=i.bvh.raycastFirst(a,Ce);if(this.queryCount++,c&&c.distance<r.distanceTo(o)-1e-5)return!1}return!0}firstHit(t,e=1/0){if(!this.active)return null;let n=null;for(let i of this.entries){let r=new dn(t.origin.clone().multiplyScalar(10),t.direction.clone()).applyMatrix4(i.inverse),o=i.bvh.raycastFirst(r,Ce);if(!o)continue;let a=o.point.clone().applyMatrix4(i.mesh.matrixWorld).multiplyScalar(.1),c=a.distanceTo(t.origin);c<e&&(!n||c<n.distance)&&(n={distance:c,point:a})}return n}avoidance(t){let e=new B;if(!this.active)return e;for(let n of this.entries){let i=t.position.clone().multiplyScalar(10).applyMatrix4(n.inverse),r=t.profile.radiusM*2.2+.015;if(n.mesh.geometry.boundingBox.distanceToPoint(i)>r*10)continue;let o=n.bvh.closestPointToPoint(i,{},0,r*10);if(!o)continue;let a=o.point.clone().applyMatrix4(n.mesh.matrixWorld).multiplyScalar(.1),c=t.position.clone().sub(a),l=c.length();l>1e-6&&l<r&&e.addScaledVector(c,(1-l/r)*t.cruise*5/l)}return e}dispose(){this.entries=[],this.active=!1}};function bp(s,t){if(t===Af)return console.warn("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles."),s;if(t===co||t===Na){let e=s.getIndex();if(e===null){let o=[],a=s.getAttribute("position");if(a!==void 0){for(let c=0;c<a.count;c++)o.push(c);s.setIndex(o),e=s.getIndex()}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible."),s}let n=e.count-2,i=[];if(t===co)for(let o=1;o<=n;o++)i.push(e.getX(0)),i.push(e.getX(o)),i.push(e.getX(o+1));else for(let o=0;o<n;o++)o%2===0?(i.push(e.getX(o)),i.push(e.getX(o+1)),i.push(e.getX(o+2))):(i.push(e.getX(o+2)),i.push(e.getX(o+1)),i.push(e.getX(o)));i.length/3!==n&&console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.");let r=s.clone();return r.setIndex(i),r.clearGroups(),r}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:",t),s}var uu=class extends Ai{constructor(t){super(t),this.dracoLoader=null,this.ktx2Loader=null,this.meshoptDecoder=null,this.pluginCallbacks=[],this.register(function(e){return new Ip(e)}),this.register(function(e){return new Pp(e)}),this.register(function(e){return new kp(e)}),this.register(function(e){return new Hp(e)}),this.register(function(e){return new Vp(e)}),this.register(function(e){return new Np(e)}),this.register(function(e){return new Dp(e)}),this.register(function(e){return new Op(e)}),this.register(function(e){return new Up(e)}),this.register(function(e){return new Cp(e)}),this.register(function(e){return new Fp(e)}),this.register(function(e){return new Lp(e)}),this.register(function(e){return new zp(e)}),this.register(function(e){return new Bp(e)}),this.register(function(e){return new Ap(e)}),this.register(function(e){return new Gp(e)}),this.register(function(e){return new Wp(e)})}load(t,e,n,i){let r=this,o;if(this.resourcePath!=="")o=this.resourcePath;else if(this.path!==""){let l=Xi.extractUrlBase(t);o=Xi.resolveURL(l,this.path)}else o=Xi.extractUrlBase(t);this.manager.itemStart(t);let a=function(l){i?i(l):console.error(l),r.manager.itemError(t),r.manager.itemEnd(t)},c=new no(this.manager);c.setPath(this.path),c.setResponseType("arraybuffer"),c.setRequestHeader(this.requestHeader),c.setWithCredentials(this.withCredentials),c.load(t,function(l){try{r.parse(l,o,function(h){e(h),r.manager.itemEnd(t)},a)}catch(h){a(h)}},n,a)}setDRACOLoader(t){return this.dracoLoader=t,this}setKTX2Loader(t){return this.ktx2Loader=t,this}setMeshoptDecoder(t){return this.meshoptDecoder=t,this}register(t){return this.pluginCallbacks.indexOf(t)===-1&&this.pluginCallbacks.push(t),this}unregister(t){return this.pluginCallbacks.indexOf(t)!==-1&&this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(t),1),this}parse(t,e,n,i){let r,o={},a={},c=new TextDecoder;if(typeof t=="string")r=JSON.parse(t);else if(t instanceof ArrayBuffer)if(c.decode(new Uint8Array(t,0,4))===jx){try{o[ee.KHR_BINARY_GLTF]=new Xp(t)}catch(u){i&&i(u);return}r=JSON.parse(o[ee.KHR_BINARY_GLTF].content)}else r=JSON.parse(c.decode(t));else r=t;if(r.asset===void 0||r.asset.version[0]<2){i&&i(new Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported."));return}let l=new jp(r,{path:e||this.resourcePath||"",crossOrigin:this.crossOrigin,requestHeader:this.requestHeader,manager:this.manager,ktx2Loader:this.ktx2Loader,meshoptDecoder:this.meshoptDecoder});l.fileLoader.setRequestHeader(this.requestHeader);for(let h=0;h<this.pluginCallbacks.length;h++){let u=this.pluginCallbacks[h](l);u.name||console.error("THREE.GLTFLoader: Invalid plugin found: missing name"),a[u.name]=u,o[u.name]=!0}if(r.extensionsUsed)for(let h=0;h<r.extensionsUsed.length;++h){let u=r.extensionsUsed[h],f=r.extensionsRequired||[];switch(u){case ee.KHR_MATERIALS_UNLIT:o[u]=new Rp;break;case ee.KHR_DRACO_MESH_COMPRESSION:o[u]=new qp(r,this.dracoLoader);break;case ee.KHR_TEXTURE_TRANSFORM:o[u]=new $p;break;case ee.KHR_MESH_QUANTIZATION:o[u]=new Yp;break;default:f.indexOf(u)>=0&&a[u]===void 0&&console.warn('THREE.GLTFLoader: Unknown extension "'+u+'".')}}l.setExtensions(o),l.setPlugins(a),l.parse(n,i)}parseAsync(t,e){let n=this;return new Promise(function(i,r){n.parse(t,e,i,r)})}};function pw(){let s={};return{get:function(t){return s[t]},add:function(t,e){s[t]=e},remove:function(t){delete s[t]},removeAll:function(){s={}}}}var ee={KHR_BINARY_GLTF:"KHR_binary_glTF",KHR_DRACO_MESH_COMPRESSION:"KHR_draco_mesh_compression",KHR_LIGHTS_PUNCTUAL:"KHR_lights_punctual",KHR_MATERIALS_CLEARCOAT:"KHR_materials_clearcoat",KHR_MATERIALS_DISPERSION:"KHR_materials_dispersion",KHR_MATERIALS_IOR:"KHR_materials_ior",KHR_MATERIALS_SHEEN:"KHR_materials_sheen",KHR_MATERIALS_SPECULAR:"KHR_materials_specular",KHR_MATERIALS_TRANSMISSION:"KHR_materials_transmission",KHR_MATERIALS_IRIDESCENCE:"KHR_materials_iridescence",KHR_MATERIALS_ANISOTROPY:"KHR_materials_anisotropy",KHR_MATERIALS_UNLIT:"KHR_materials_unlit",KHR_MATERIALS_VOLUME:"KHR_materials_volume",KHR_TEXTURE_BASISU:"KHR_texture_basisu",KHR_TEXTURE_TRANSFORM:"KHR_texture_transform",KHR_MESH_QUANTIZATION:"KHR_mesh_quantization",KHR_MATERIALS_EMISSIVE_STRENGTH:"KHR_materials_emissive_strength",EXT_MATERIALS_BUMP:"EXT_materials_bump",EXT_TEXTURE_WEBP:"EXT_texture_webp",EXT_TEXTURE_AVIF:"EXT_texture_avif",EXT_MESHOPT_COMPRESSION:"EXT_meshopt_compression",EXT_MESH_GPU_INSTANCING:"EXT_mesh_gpu_instancing"},Ap=class{constructor(t){this.parser=t,this.name=ee.KHR_LIGHTS_PUNCTUAL,this.cache={refs:{},uses:{}}}_markDefs(){let t=this.parser,e=this.parser.json.nodes||[];for(let n=0,i=e.length;n<i;n++){let r=e[n];r.extensions&&r.extensions[this.name]&&r.extensions[this.name].light!==void 0&&t._addNodeRef(this.cache,r.extensions[this.name].light)}}_loadLight(t){let e=this.parser,n="light:"+t,i=e.cache.get(n);if(i)return i;let r=e.json,c=((r.extensions&&r.extensions[this.name]||{}).lights||[])[t],l,h=new Et(16777215);c.color!==void 0&&h.setRGB(c.color[0],c.color[1],c.color[2],We);let u=c.range!==void 0?c.range:0;switch(c.type){case"directional":l=new ps(h),l.target.position.set(0,0,-1),l.add(l.target);break;case"point":l=new ba(h),l.distance=u;break;case"spot":l=new Ma(h),l.distance=u,c.spot=c.spot||{},c.spot.innerConeAngle=c.spot.innerConeAngle!==void 0?c.spot.innerConeAngle:0,c.spot.outerConeAngle=c.spot.outerConeAngle!==void 0?c.spot.outerConeAngle:Math.PI/4,l.angle=c.spot.outerConeAngle,l.penumbra=1-c.spot.innerConeAngle/c.spot.outerConeAngle,l.target.position.set(0,0,-1),l.add(l.target);break;default:throw new Error("THREE.GLTFLoader: Unexpected light type: "+c.type)}return l.position.set(0,0,0),Ii(l,c),c.intensity!==void 0&&(l.intensity=c.intensity),l.name=e.createUniqueName(c.name||"light_"+t),i=Promise.resolve(l),e.cache.add(n,i),i}getDependency(t,e){if(t==="light")return this._loadLight(e)}createNodeAttachment(t){let e=this,n=this.parser,r=n.json.nodes[t],a=(r.extensions&&r.extensions[this.name]||{}).light;return a===void 0?null:this._loadLight(a).then(function(c){return n._getNodeRef(e.cache,a,c)})}},Rp=class{constructor(){this.name=ee.KHR_MATERIALS_UNLIT}getMaterialType(){return ui}extendParams(t,e,n){let i=[];t.color=new Et(1,1,1),t.opacity=1;let r=e.pbrMetallicRoughness;if(r){if(Array.isArray(r.baseColorFactor)){let o=r.baseColorFactor;t.color.setRGB(o[0],o[1],o[2],We),t.opacity=o[3]}r.baseColorTexture!==void 0&&i.push(n.assignTexture(t,"map",r.baseColorTexture,ze))}return Promise.all(i)}},Cp=class{constructor(t){this.parser=t,this.name=ee.KHR_MATERIALS_EMISSIVE_STRENGTH}extendMaterialParams(t,e){let i=this.parser.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=i.extensions[this.name].emissiveStrength;return r!==void 0&&(e.emissiveIntensity=r),Promise.resolve()}},Ip=class{constructor(t){this.parser=t,this.name=ee.KHR_MATERIALS_CLEARCOAT}getMaterialType(t){let n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Ze}extendMaterialParams(t,e){let n=this.parser,i=n.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=[],o=i.extensions[this.name];if(o.clearcoatFactor!==void 0&&(e.clearcoat=o.clearcoatFactor),o.clearcoatTexture!==void 0&&r.push(n.assignTexture(e,"clearcoatMap",o.clearcoatTexture)),o.clearcoatRoughnessFactor!==void 0&&(e.clearcoatRoughness=o.clearcoatRoughnessFactor),o.clearcoatRoughnessTexture!==void 0&&r.push(n.assignTexture(e,"clearcoatRoughnessMap",o.clearcoatRoughnessTexture)),o.clearcoatNormalTexture!==void 0&&(r.push(n.assignTexture(e,"clearcoatNormalMap",o.clearcoatNormalTexture)),o.clearcoatNormalTexture.scale!==void 0)){let a=o.clearcoatNormalTexture.scale;e.clearcoatNormalScale=new Ht(a,a)}return Promise.all(r)}},Pp=class{constructor(t){this.parser=t,this.name=ee.KHR_MATERIALS_DISPERSION}getMaterialType(t){let n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Ze}extendMaterialParams(t,e){let i=this.parser.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=i.extensions[this.name];return e.dispersion=r.dispersion!==void 0?r.dispersion:0,Promise.resolve()}},Lp=class{constructor(t){this.parser=t,this.name=ee.KHR_MATERIALS_IRIDESCENCE}getMaterialType(t){let n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Ze}extendMaterialParams(t,e){let n=this.parser,i=n.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=[],o=i.extensions[this.name];return o.iridescenceFactor!==void 0&&(e.iridescence=o.iridescenceFactor),o.iridescenceTexture!==void 0&&r.push(n.assignTexture(e,"iridescenceMap",o.iridescenceTexture)),o.iridescenceIor!==void 0&&(e.iridescenceIOR=o.iridescenceIor),e.iridescenceThicknessRange===void 0&&(e.iridescenceThicknessRange=[100,400]),o.iridescenceThicknessMinimum!==void 0&&(e.iridescenceThicknessRange[0]=o.iridescenceThicknessMinimum),o.iridescenceThicknessMaximum!==void 0&&(e.iridescenceThicknessRange[1]=o.iridescenceThicknessMaximum),o.iridescenceThicknessTexture!==void 0&&r.push(n.assignTexture(e,"iridescenceThicknessMap",o.iridescenceThicknessTexture)),Promise.all(r)}},Np=class{constructor(t){this.parser=t,this.name=ee.KHR_MATERIALS_SHEEN}getMaterialType(t){let n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Ze}extendMaterialParams(t,e){let n=this.parser,i=n.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=[];e.sheenColor=new Et(0,0,0),e.sheenRoughness=0,e.sheen=1;let o=i.extensions[this.name];if(o.sheenColorFactor!==void 0){let a=o.sheenColorFactor;e.sheenColor.setRGB(a[0],a[1],a[2],We)}return o.sheenRoughnessFactor!==void 0&&(e.sheenRoughness=o.sheenRoughnessFactor),o.sheenColorTexture!==void 0&&r.push(n.assignTexture(e,"sheenColorMap",o.sheenColorTexture,ze)),o.sheenRoughnessTexture!==void 0&&r.push(n.assignTexture(e,"sheenRoughnessMap",o.sheenRoughnessTexture)),Promise.all(r)}},Dp=class{constructor(t){this.parser=t,this.name=ee.KHR_MATERIALS_TRANSMISSION}getMaterialType(t){let n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Ze}extendMaterialParams(t,e){let n=this.parser,i=n.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=[],o=i.extensions[this.name];return o.transmissionFactor!==void 0&&(e.transmission=o.transmissionFactor),o.transmissionTexture!==void 0&&r.push(n.assignTexture(e,"transmissionMap",o.transmissionTexture)),Promise.all(r)}},Op=class{constructor(t){this.parser=t,this.name=ee.KHR_MATERIALS_VOLUME}getMaterialType(t){let n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Ze}extendMaterialParams(t,e){let n=this.parser,i=n.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=[],o=i.extensions[this.name];e.thickness=o.thicknessFactor!==void 0?o.thicknessFactor:0,o.thicknessTexture!==void 0&&r.push(n.assignTexture(e,"thicknessMap",o.thicknessTexture)),e.attenuationDistance=o.attenuationDistance||1/0;let a=o.attenuationColor||[1,1,1];return e.attenuationColor=new Et().setRGB(a[0],a[1],a[2],We),Promise.all(r)}},Up=class{constructor(t){this.parser=t,this.name=ee.KHR_MATERIALS_IOR}getMaterialType(t){let n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Ze}extendMaterialParams(t,e){let i=this.parser.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=i.extensions[this.name];return e.ior=r.ior!==void 0?r.ior:1.5,Promise.resolve()}},Fp=class{constructor(t){this.parser=t,this.name=ee.KHR_MATERIALS_SPECULAR}getMaterialType(t){let n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Ze}extendMaterialParams(t,e){let n=this.parser,i=n.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=[],o=i.extensions[this.name];e.specularIntensity=o.specularFactor!==void 0?o.specularFactor:1,o.specularTexture!==void 0&&r.push(n.assignTexture(e,"specularIntensityMap",o.specularTexture));let a=o.specularColorFactor||[1,1,1];return e.specularColor=new Et().setRGB(a[0],a[1],a[2],We),o.specularColorTexture!==void 0&&r.push(n.assignTexture(e,"specularColorMap",o.specularColorTexture,ze)),Promise.all(r)}},Bp=class{constructor(t){this.parser=t,this.name=ee.EXT_MATERIALS_BUMP}getMaterialType(t){let n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Ze}extendMaterialParams(t,e){let n=this.parser,i=n.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=[],o=i.extensions[this.name];return e.bumpScale=o.bumpFactor!==void 0?o.bumpFactor:1,o.bumpTexture!==void 0&&r.push(n.assignTexture(e,"bumpMap",o.bumpTexture)),Promise.all(r)}},zp=class{constructor(t){this.parser=t,this.name=ee.KHR_MATERIALS_ANISOTROPY}getMaterialType(t){let n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Ze}extendMaterialParams(t,e){let n=this.parser,i=n.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=[],o=i.extensions[this.name];return o.anisotropyStrength!==void 0&&(e.anisotropy=o.anisotropyStrength),o.anisotropyRotation!==void 0&&(e.anisotropyRotation=o.anisotropyRotation),o.anisotropyTexture!==void 0&&r.push(n.assignTexture(e,"anisotropyMap",o.anisotropyTexture)),Promise.all(r)}},kp=class{constructor(t){this.parser=t,this.name=ee.KHR_TEXTURE_BASISU}loadTexture(t){let e=this.parser,n=e.json,i=n.textures[t];if(!i.extensions||!i.extensions[this.name])return null;let r=i.extensions[this.name],o=e.options.ktx2Loader;if(!o){if(n.extensionsRequired&&n.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");return null}return e.loadTextureImage(t,r.source,o)}},Hp=class{constructor(t){this.parser=t,this.name=ee.EXT_TEXTURE_WEBP}loadTexture(t){let e=this.name,n=this.parser,i=n.json,r=i.textures[t];if(!r.extensions||!r.extensions[e])return null;let o=r.extensions[e],a=i.images[o.source],c=n.textureLoader;if(a.uri){let l=n.options.manager.getHandler(a.uri);l!==null&&(c=l)}return n.loadTextureImage(t,o.source,c)}},Vp=class{constructor(t){this.parser=t,this.name=ee.EXT_TEXTURE_AVIF}loadTexture(t){let e=this.name,n=this.parser,i=n.json,r=i.textures[t];if(!r.extensions||!r.extensions[e])return null;let o=r.extensions[e],a=i.images[o.source],c=n.textureLoader;if(a.uri){let l=n.options.manager.getHandler(a.uri);l!==null&&(c=l)}return n.loadTextureImage(t,o.source,c)}},Gp=class{constructor(t){this.name=ee.EXT_MESHOPT_COMPRESSION,this.parser=t}loadBufferView(t){let e=this.parser.json,n=e.bufferViews[t];if(n.extensions&&n.extensions[this.name]){let i=n.extensions[this.name],r=this.parser.getDependency("buffer",i.buffer),o=this.parser.options.meshoptDecoder;if(!o||!o.supported){if(e.extensionsRequired&&e.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files");return null}return r.then(function(a){let c=i.byteOffset||0,l=i.byteLength||0,h=i.count,u=i.byteStride,f=new Uint8Array(a,c,l);return o.decodeGltfBufferAsync?o.decodeGltfBufferAsync(h,u,f,i.mode,i.filter).then(function(d){return d.buffer}):o.ready.then(function(){let d=new ArrayBuffer(h*u);return o.decodeGltfBuffer(new Uint8Array(d),h,u,f,i.mode,i.filter),d})})}else return null}},Wp=class{constructor(t){this.name=ee.EXT_MESH_GPU_INSTANCING,this.parser=t}createNodeMesh(t){let e=this.parser.json,n=e.nodes[t];if(!n.extensions||!n.extensions[this.name]||n.mesh===void 0)return null;let i=e.meshes[n.mesh];for(let l of i.primitives)if(l.mode!==ti.TRIANGLES&&l.mode!==ti.TRIANGLE_STRIP&&l.mode!==ti.TRIANGLE_FAN&&l.mode!==void 0)return null;let o=n.extensions[this.name].attributes,a=[],c={};for(let l in o)a.push(this.parser.getDependency("accessor",o[l]).then(h=>(c[l]=h,c[l])));return a.length<1?null:(a.push(this.parser.createNodeMesh(t)),Promise.all(a).then(l=>{let h=l.pop(),u=h.isGroup?h.children:[h],f=l[0].count,d=[];for(let g of u){let x=new Pt,m=new B,p=new Ve,y=new B(1,1,1),v=new On(g.geometry,g.material,f);for(let _=0;_<f;_++)c.TRANSLATION&&m.fromBufferAttribute(c.TRANSLATION,_),c.ROTATION&&p.fromBufferAttribute(c.ROTATION,_),c.SCALE&&y.fromBufferAttribute(c.SCALE,_),v.setMatrixAt(_,x.compose(m,p,y));for(let _ in c)if(_==="_COLOR_0"){let w=c[_];v.instanceColor=new tn(w.array,w.itemSize,w.normalized)}else _!=="TRANSLATION"&&_!=="ROTATION"&&_!=="SCALE"&&g.geometry.setAttribute(_,c[_]);be.prototype.copy.call(v,g),this.parser.assignFinalMaterial(v),d.push(v)}return h.isGroup?(h.clear(),h.add(...d),h):d[0]}))}},jx="glTF",ic=12,Yx={JSON:1313821514,BIN:5130562},Xp=class{constructor(t){this.name=ee.KHR_BINARY_GLTF,this.content=null,this.body=null;let e=new DataView(t,0,ic),n=new TextDecoder;if(this.header={magic:n.decode(new Uint8Array(t.slice(0,4))),version:e.getUint32(4,!0),length:e.getUint32(8,!0)},this.header.magic!==jx)throw new Error("THREE.GLTFLoader: Unsupported glTF-Binary header.");if(this.header.version<2)throw new Error("THREE.GLTFLoader: Legacy binary file detected.");let i=this.header.length-ic,r=new DataView(t,ic),o=0;for(;o<i;){let a=r.getUint32(o,!0);o+=4;let c=r.getUint32(o,!0);if(o+=4,c===Yx.JSON){let l=new Uint8Array(t,ic+o,a);this.content=n.decode(l)}else if(c===Yx.BIN){let l=ic+o;this.body=t.slice(l,l+a)}o+=a}if(this.content===null)throw new Error("THREE.GLTFLoader: JSON content not found.")}},qp=class{constructor(t,e){if(!e)throw new Error("THREE.GLTFLoader: No DRACOLoader instance provided.");this.name=ee.KHR_DRACO_MESH_COMPRESSION,this.json=t,this.dracoLoader=e,this.dracoLoader.preload()}decodePrimitive(t,e){let n=this.json,i=this.dracoLoader,r=t.extensions[this.name].bufferView,o=t.extensions[this.name].attributes,a={},c={},l={};for(let h in o){let u=Kp[h]||h.toLowerCase();a[u]=o[h]}for(let h in t.attributes){let u=Kp[h]||h.toLowerCase();if(o[h]!==void 0){let f=n.accessors[t.attributes[h]],d=zo[f.componentType];l[u]=d.name,c[u]=f.normalized===!0}}return e.getDependency("bufferView",r).then(function(h){return new Promise(function(u,f){i.decodeDracoFile(h,function(d){for(let g in d.attributes){let x=d.attributes[g],m=c[g];m!==void 0&&(x.normalized=m)}u(d)},a,l,We,f)})})}},$p=class{constructor(){this.name=ee.KHR_TEXTURE_TRANSFORM}extendTexture(t,e){return(e.texCoord===void 0||e.texCoord===t.channel)&&e.offset===void 0&&e.rotation===void 0&&e.scale===void 0||(t=t.clone(),e.texCoord!==void 0&&(t.channel=e.texCoord),e.offset!==void 0&&t.offset.fromArray(e.offset),e.rotation!==void 0&&(t.rotation=e.rotation),e.scale!==void 0&&t.repeat.fromArray(e.scale),t.needsUpdate=!0),t}},Yp=class{constructor(){this.name=ee.KHR_MESH_QUANTIZATION}},fu=class extends Vi{constructor(t,e,n,i){super(t,e,n,i)}copySampleValue_(t){let e=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=t*i*3+i;for(let o=0;o!==i;o++)e[o]=n[r+o];return e}interpolate_(t,e,n,i){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,c=a*2,l=a*3,h=i-e,u=(n-e)/h,f=u*u,d=f*u,g=t*l,x=g-l,m=-2*d+3*f,p=d-f,y=1-m,v=p-f+u;for(let _=0;_!==a;_++){let w=o[x+_+a],T=o[x+_+c]*h,R=o[g+_+a],L=o[g+_]*h;r[_]=y*w+v*T+m*R+p*L}return r}},mw=new Ve,Jp=class extends fu{interpolate_(t,e,n,i){let r=super.interpolate_(t,e,n,i);return mw.fromArray(r).normalize().toArray(r),r}},ti={FLOAT:5126,FLOAT_MAT3:35675,FLOAT_MAT4:35676,FLOAT_VEC2:35664,FLOAT_VEC3:35665,FLOAT_VEC4:35666,LINEAR:9729,REPEAT:10497,SAMPLER_2D:35678,POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6,UNSIGNED_BYTE:5121,UNSIGNED_SHORT:5123},zo={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},Jx={9728:Qe,9729:Ye,9984:Sl,9985:so,9986:Qs,9987:Un},Kx={33071:vi,33648:Vr,10497:Mi},wp={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},Kp={POSITION:"position",NORMAL:"normal",TANGENT:"tangent",TEXCOORD_0:"uv",TEXCOORD_1:"uv1",TEXCOORD_2:"uv2",TEXCOORD_3:"uv3",COLOR_0:"color",WEIGHTS_0:"skinWeight",JOINTS_0:"skinIndex"},Ts={scale:"scale",translation:"position",rotation:"quaternion",weights:"morphTargetInfluences"},gw={CUBICSPLINE:void 0,LINEAR:Hs,STEP:ks},Ep={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};function xw(s){return s.DefaultMaterial===void 0&&(s.DefaultMaterial=new Ke({color:16777215,emissive:0,metalness:1,roughness:1,transparent:!1,depthTest:!0,side:fn})),s.DefaultMaterial}function dr(s,t,e){for(let n in e.extensions)s[n]===void 0&&(t.userData.gltfExtensions=t.userData.gltfExtensions||{},t.userData.gltfExtensions[n]=e.extensions[n])}function Ii(s,t){t.extras!==void 0&&(typeof t.extras=="object"?Object.assign(s.userData,t.extras):console.warn("THREE.GLTFLoader: Ignoring primitive type .extras, "+t.extras))}function yw(s,t,e){let n=!1,i=!1,r=!1;for(let l=0,h=t.length;l<h;l++){let u=t[l];if(u.POSITION!==void 0&&(n=!0),u.NORMAL!==void 0&&(i=!0),u.COLOR_0!==void 0&&(r=!0),n&&i&&r)break}if(!n&&!i&&!r)return Promise.resolve(s);let o=[],a=[],c=[];for(let l=0,h=t.length;l<h;l++){let u=t[l];if(n){let f=u.POSITION!==void 0?e.getDependency("accessor",u.POSITION):s.attributes.position;o.push(f)}if(i){let f=u.NORMAL!==void 0?e.getDependency("accessor",u.NORMAL):s.attributes.normal;a.push(f)}if(r){let f=u.COLOR_0!==void 0?e.getDependency("accessor",u.COLOR_0):s.attributes.color;c.push(f)}}return Promise.all([Promise.all(o),Promise.all(a),Promise.all(c)]).then(function(l){let h=l[0],u=l[1],f=l[2];return n&&(s.morphAttributes.position=h),i&&(s.morphAttributes.normal=u),r&&(s.morphAttributes.color=f),s.morphTargetsRelative=!0,s})}function _w(s,t){if(s.updateMorphTargets(),t.weights!==void 0)for(let e=0,n=t.weights.length;e<n;e++)s.morphTargetInfluences[e]=t.weights[e];if(t.extras&&Array.isArray(t.extras.targetNames)){let e=t.extras.targetNames;if(s.morphTargetInfluences.length===e.length){s.morphTargetDictionary={};for(let n=0,i=e.length;n<i;n++)s.morphTargetDictionary[e[n]]=n}else console.warn("THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.")}}function vw(s){let t,e=s.extensions&&s.extensions[ee.KHR_DRACO_MESH_COMPRESSION];if(e?t="draco:"+e.bufferView+":"+e.indices+":"+Tp(e.attributes):t=s.indices+":"+Tp(s.attributes)+":"+s.mode,s.targets!==void 0)for(let n=0,i=s.targets.length;n<i;n++)t+=":"+Tp(s.targets[n]);return t}function Tp(s){let t="",e=Object.keys(s).sort();for(let n=0,i=e.length;n<i;n++)t+=e[n]+":"+s[e[n]]+";";return t}function Zp(s){switch(s){case Int8Array:return 1/127;case Uint8Array:return 1/255;case Int16Array:return 1/32767;case Uint16Array:return 1/65535;default:throw new Error("THREE.GLTFLoader: Unsupported normalized accessor component type.")}}function Sw(s){return s.search(/\.jpe?g($|\?)/i)>0||s.search(/^data\:image\/jpeg/)===0?"image/jpeg":s.search(/\.webp($|\?)/i)>0||s.search(/^data\:image\/webp/)===0?"image/webp":s.search(/\.ktx2($|\?)/i)>0||s.search(/^data\:image\/ktx2/)===0?"image/ktx2":"image/png"}var Mw=new Pt,jp=class{constructor(t={},e={}){this.json=t,this.extensions={},this.plugins={},this.options=e,this.cache=new pw,this.associations=new Map,this.primitiveCache={},this.nodeCache={},this.meshCache={refs:{},uses:{}},this.cameraCache={refs:{},uses:{}},this.lightCache={refs:{},uses:{}},this.sourceCache={},this.textureCache={},this.nodeNamesUsed={};let n=!1,i=-1,r=!1,o=-1;if(typeof navigator<"u"){let a=navigator.userAgent;n=/^((?!chrome|android).)*safari/i.test(a)===!0;let c=a.match(/Version\/(\d+)/);i=n&&c?parseInt(c[1],10):-1,r=a.indexOf("Firefox")>-1,o=r?a.match(/Firefox\/([0-9]+)\./)[1]:-1}typeof createImageBitmap>"u"||n&&i<17||r&&o<98?this.textureLoader=new Ys(this.options.manager):this.textureLoader=new wa(this.options.manager),this.textureLoader.setCrossOrigin(this.options.crossOrigin),this.textureLoader.setRequestHeader(this.options.requestHeader),this.fileLoader=new no(this.options.manager),this.fileLoader.setResponseType("arraybuffer"),this.options.crossOrigin==="use-credentials"&&this.fileLoader.setWithCredentials(!0)}setExtensions(t){this.extensions=t}setPlugins(t){this.plugins=t}parse(t,e){let n=this,i=this.json,r=this.extensions;this.cache.removeAll(),this.nodeCache={},this._invokeAll(function(o){return o._markDefs&&o._markDefs()}),Promise.all(this._invokeAll(function(o){return o.beforeRoot&&o.beforeRoot()})).then(function(){return Promise.all([n.getDependencies("scene"),n.getDependencies("animation"),n.getDependencies("camera")])}).then(function(o){let a={scene:o[0][i.scene||0],scenes:o[0],animations:o[1],cameras:o[2],asset:i.asset,parser:n,userData:{}};return dr(r,a,i),Ii(a,i),Promise.all(n._invokeAll(function(c){return c.afterRoot&&c.afterRoot(a)})).then(function(){for(let c of a.scenes)c.updateMatrixWorld();t(a)})}).catch(e)}_markDefs(){let t=this.json.nodes||[],e=this.json.skins||[],n=this.json.meshes||[];for(let i=0,r=e.length;i<r;i++){let o=e[i].joints;for(let a=0,c=o.length;a<c;a++)t[o[a]].isBone=!0}for(let i=0,r=t.length;i<r;i++){let o=t[i];o.mesh!==void 0&&(this._addNodeRef(this.meshCache,o.mesh),o.skin!==void 0&&(n[o.mesh].isSkinnedMesh=!0)),o.camera!==void 0&&this._addNodeRef(this.cameraCache,o.camera)}}_addNodeRef(t,e){e!==void 0&&(t.refs[e]===void 0&&(t.refs[e]=t.uses[e]=0),t.refs[e]++)}_getNodeRef(t,e,n){if(t.refs[e]<=1)return n;let i=n.clone(),r=(o,a)=>{let c=this.associations.get(o);c!=null&&this.associations.set(a,c);for(let[l,h]of o.children.entries())r(h,a.children[l])};return r(n,i),i.name+="_instance_"+t.uses[e]++,i}_invokeOne(t){let e=Object.values(this.plugins);e.push(this);for(let n=0;n<e.length;n++){let i=t(e[n]);if(i)return i}return null}_invokeAll(t){let e=Object.values(this.plugins);e.unshift(this);let n=[];for(let i=0;i<e.length;i++){let r=t(e[i]);r&&n.push(r)}return n}getDependency(t,e){let n=t+":"+e,i=this.cache.get(n);if(!i){switch(t){case"scene":i=this.loadScene(e);break;case"node":i=this._invokeOne(function(r){return r.loadNode&&r.loadNode(e)});break;case"mesh":i=this._invokeOne(function(r){return r.loadMesh&&r.loadMesh(e)});break;case"accessor":i=this.loadAccessor(e);break;case"bufferView":i=this._invokeOne(function(r){return r.loadBufferView&&r.loadBufferView(e)});break;case"buffer":i=this.loadBuffer(e);break;case"material":i=this._invokeOne(function(r){return r.loadMaterial&&r.loadMaterial(e)});break;case"texture":i=this._invokeOne(function(r){return r.loadTexture&&r.loadTexture(e)});break;case"skin":i=this.loadSkin(e);break;case"animation":i=this._invokeOne(function(r){return r.loadAnimation&&r.loadAnimation(e)});break;case"camera":i=this.loadCamera(e);break;default:if(i=this._invokeOne(function(r){return r!=this&&r.getDependency&&r.getDependency(t,e)}),!i)throw new Error("Unknown type: "+t);break}this.cache.add(n,i)}return i}getDependencies(t){let e=this.cache.get(t);if(!e){let n=this,i=this.json[t+(t==="mesh"?"es":"s")]||[];e=Promise.all(i.map(function(r,o){return n.getDependency(t,o)})),this.cache.add(t,e)}return e}loadBuffer(t){let e=this.json.buffers[t],n=this.fileLoader;if(e.type&&e.type!=="arraybuffer")throw new Error("THREE.GLTFLoader: "+e.type+" buffer type is not supported.");if(e.uri===void 0&&t===0)return Promise.resolve(this.extensions[ee.KHR_BINARY_GLTF].body);let i=this.options;return new Promise(function(r,o){n.load(Xi.resolveURL(e.uri,i.path),r,void 0,function(){o(new Error('THREE.GLTFLoader: Failed to load buffer "'+e.uri+'".'))})})}loadBufferView(t){let e=this.json.bufferViews[t];return this.getDependency("buffer",e.buffer).then(function(n){let i=e.byteLength||0,r=e.byteOffset||0;return n.slice(r,r+i)})}loadAccessor(t){let e=this,n=this.json,i=this.json.accessors[t];if(i.bufferView===void 0&&i.sparse===void 0){let o=wp[i.type],a=zo[i.componentType],c=i.normalized===!0,l=new a(i.count*o);return Promise.resolve(new re(l,o,c))}let r=[];return i.bufferView!==void 0?r.push(this.getDependency("bufferView",i.bufferView)):r.push(null),i.sparse!==void 0&&(r.push(this.getDependency("bufferView",i.sparse.indices.bufferView)),r.push(this.getDependency("bufferView",i.sparse.values.bufferView))),Promise.all(r).then(function(o){let a=o[0],c=wp[i.type],l=zo[i.componentType],h=l.BYTES_PER_ELEMENT,u=h*c,f=i.byteOffset||0,d=i.bufferView!==void 0?n.bufferViews[i.bufferView].byteStride:void 0,g=i.normalized===!0,x,m;if(d&&d!==u){let p=Math.floor(f/d),y="InterleavedBuffer:"+i.bufferView+":"+i.componentType+":"+p+":"+i.count,v=e.cache.get(y);v||(x=new l(a,p*d,i.count*d/h),v=new Kr(x,d/h),e.cache.add(y,v)),m=new Zr(v,c,f%d/h,g)}else a===null?x=new l(i.count*c):x=new l(a,f,i.count*c),m=new re(x,c,g);if(i.sparse!==void 0){let p=wp.SCALAR,y=zo[i.sparse.indices.componentType],v=i.sparse.indices.byteOffset||0,_=i.sparse.values.byteOffset||0,w=new y(o[1],v,i.sparse.count*p),T=new l(o[2],_,i.sparse.count*c);a!==null&&(m=new re(m.array.slice(),m.itemSize,m.normalized)),m.normalized=!1;for(let R=0,L=w.length;R<L;R++){let S=w[R];if(m.setX(S,T[R*c]),c>=2&&m.setY(S,T[R*c+1]),c>=3&&m.setZ(S,T[R*c+2]),c>=4&&m.setW(S,T[R*c+3]),c>=5)throw new Error("THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.")}m.normalized=g}return m})}loadTexture(t){let e=this.json,n=this.options,r=e.textures[t].source,o=e.images[r],a=this.textureLoader;if(o.uri){let c=n.manager.getHandler(o.uri);c!==null&&(a=c)}return this.loadTextureImage(t,r,a)}loadTextureImage(t,e,n){let i=this,r=this.json,o=r.textures[t],a=r.images[e],c=(a.uri||a.bufferView)+":"+o.sampler;if(this.textureCache[c])return this.textureCache[c];let l=this.loadImageSource(e,n).then(function(h){h.flipY=!1,h.name=o.name||a.name||"",h.name===""&&typeof a.uri=="string"&&a.uri.startsWith("data:image/")===!1&&(h.name=a.uri);let f=(r.samplers||{})[o.sampler]||{};return h.magFilter=Jx[f.magFilter]||Ye,h.minFilter=Jx[f.minFilter]||Un,h.wrapS=Kx[f.wrapS]||Mi,h.wrapT=Kx[f.wrapT]||Mi,h.generateMipmaps=!h.isCompressedTexture&&h.minFilter!==Qe&&h.minFilter!==Ye,i.associations.set(h,{textures:t}),h}).catch(function(){return null});return this.textureCache[c]=l,l}loadImageSource(t,e){let n=this,i=this.json,r=this.options;if(this.sourceCache[t]!==void 0)return this.sourceCache[t].then(u=>u.clone());let o=i.images[t],a=self.URL||self.webkitURL,c=o.uri||"",l=!1;if(o.bufferView!==void 0)c=n.getDependency("bufferView",o.bufferView).then(function(u){l=!0;let f=new Blob([u],{type:o.mimeType});return c=a.createObjectURL(f),c});else if(o.uri===void 0)throw new Error("THREE.GLTFLoader: Image "+t+" is missing URI and bufferView");let h=Promise.resolve(c).then(function(u){return new Promise(function(f,d){let g=f;e.isImageBitmapLoader===!0&&(g=function(x){let m=new Je(x);m.needsUpdate=!0,f(m)}),e.load(Xi.resolveURL(u,r.path),g,void 0,d)})}).then(function(u){return l===!0&&a.revokeObjectURL(c),Ii(u,o),u.userData.mimeType=o.mimeType||Sw(o.uri),u}).catch(function(u){throw console.error("THREE.GLTFLoader: Couldn't load texture",c),u});return this.sourceCache[t]=h,h}assignTexture(t,e,n,i){let r=this;return this.getDependency("texture",n.index).then(function(o){if(!o)return null;if(n.texCoord!==void 0&&n.texCoord>0&&(o=o.clone(),o.channel=n.texCoord),r.extensions[ee.KHR_TEXTURE_TRANSFORM]){let a=n.extensions!==void 0?n.extensions[ee.KHR_TEXTURE_TRANSFORM]:void 0;if(a){let c=r.associations.get(o);o=r.extensions[ee.KHR_TEXTURE_TRANSFORM].extendTexture(o,a),r.associations.set(o,c)}}return i!==void 0&&(o.colorSpace=i),t[e]=o,o})}assignFinalMaterial(t){let e=t.geometry,n=t.material,i=e.attributes.tangent===void 0,r=e.attributes.color!==void 0,o=e.attributes.normal===void 0;if(t.isPoints){let a="PointsMaterial:"+n.uuid,c=this.cache.get(a);c||(c=new to,Tn.prototype.copy.call(c,n),c.color.copy(n.color),c.map=n.map,c.sizeAttenuation=!1,this.cache.add(a,c)),n=c}else if(t.isLine){let a="LineBasicMaterial:"+n.uuid,c=this.cache.get(a);c||(c=new fs,Tn.prototype.copy.call(c,n),c.color.copy(n.color),c.map=n.map,this.cache.add(a,c)),n=c}if(i||r||o){let a="ClonedMaterial:"+n.uuid+":";i&&(a+="derivative-tangents:"),r&&(a+="vertex-colors:"),o&&(a+="flat-shading:");let c=this.cache.get(a);c||(c=n.clone(),r&&(c.vertexColors=!0),o&&(c.flatShading=!0),i&&(c.normalScale&&(c.normalScale.y*=-1),c.clearcoatNormalScale&&(c.clearcoatNormalScale.y*=-1)),this.cache.add(a,c),this.associations.set(c,this.associations.get(n))),n=c}t.material=n}getMaterialType(){return Ke}loadMaterial(t){let e=this,n=this.json,i=this.extensions,r=n.materials[t],o,a={},c=r.extensions||{},l=[];if(c[ee.KHR_MATERIALS_UNLIT]){let u=i[ee.KHR_MATERIALS_UNLIT];o=u.getMaterialType(),l.push(u.extendParams(a,r,e))}else{let u=r.pbrMetallicRoughness||{};if(a.color=new Et(1,1,1),a.opacity=1,Array.isArray(u.baseColorFactor)){let f=u.baseColorFactor;a.color.setRGB(f[0],f[1],f[2],We),a.opacity=f[3]}u.baseColorTexture!==void 0&&l.push(e.assignTexture(a,"map",u.baseColorTexture,ze)),a.metalness=u.metallicFactor!==void 0?u.metallicFactor:1,a.roughness=u.roughnessFactor!==void 0?u.roughnessFactor:1,u.metallicRoughnessTexture!==void 0&&(l.push(e.assignTexture(a,"metalnessMap",u.metallicRoughnessTexture)),l.push(e.assignTexture(a,"roughnessMap",u.metallicRoughnessTexture))),o=this._invokeOne(function(f){return f.getMaterialType&&f.getMaterialType(t)}),l.push(Promise.all(this._invokeAll(function(f){return f.extendMaterialParams&&f.extendMaterialParams(t,a)})))}r.doubleSided===!0&&(a.side=Ce);let h=r.alphaMode||Ep.OPAQUE;if(h===Ep.BLEND?(a.transparent=!0,a.depthWrite=!1):(a.transparent=!1,h===Ep.MASK&&(a.alphaTest=r.alphaCutoff!==void 0?r.alphaCutoff:.5)),r.normalTexture!==void 0&&o!==ui&&(l.push(e.assignTexture(a,"normalMap",r.normalTexture)),a.normalScale=new Ht(1,1),r.normalTexture.scale!==void 0)){let u=r.normalTexture.scale;a.normalScale.set(u,u)}if(r.occlusionTexture!==void 0&&o!==ui&&(l.push(e.assignTexture(a,"aoMap",r.occlusionTexture)),r.occlusionTexture.strength!==void 0&&(a.aoMapIntensity=r.occlusionTexture.strength)),r.emissiveFactor!==void 0&&o!==ui){let u=r.emissiveFactor;a.emissive=new Et().setRGB(u[0],u[1],u[2],We)}return r.emissiveTexture!==void 0&&o!==ui&&l.push(e.assignTexture(a,"emissiveMap",r.emissiveTexture,ze)),Promise.all(l).then(function(){let u=new o(a);return r.name&&(u.name=r.name),Ii(u,r),e.associations.set(u,{materials:t}),r.extensions&&dr(i,u,r),u})}createUniqueName(t){let e=Te.sanitizeNodeName(t||"");return e in this.nodeNamesUsed?e+"_"+ ++this.nodeNamesUsed[e]:(this.nodeNamesUsed[e]=0,e)}loadGeometries(t){let e=this,n=this.extensions,i=this.primitiveCache;function r(a){return n[ee.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(a,e).then(function(c){return Zx(c,a,e)})}let o=[];for(let a=0,c=t.length;a<c;a++){let l=t[a],h=vw(l),u=i[h];if(u)o.push(u.promise);else{let f;l.extensions&&l.extensions[ee.KHR_DRACO_MESH_COMPRESSION]?f=r(l):f=Zx(new oe,l,e),i[h]={primitive:l,promise:f},o.push(f)}}return Promise.all(o)}loadMesh(t){let e=this,n=this.json,i=this.extensions,r=n.meshes[t],o=r.primitives,a=[];for(let c=0,l=o.length;c<l;c++){let h=o[c].material===void 0?xw(this.cache):this.getDependency("material",o[c].material);a.push(h)}return a.push(e.loadGeometries(o)),Promise.all(a).then(function(c){let l=c.slice(0,c.length-1),h=c[c.length-1],u=[];for(let d=0,g=h.length;d<g;d++){let x=h[d],m=o[d],p,y=l[d];if(m.mode===ti.TRIANGLES||m.mode===ti.TRIANGLE_STRIP||m.mode===ti.TRIANGLE_FAN||m.mode===void 0)p=r.isSkinnedMesh===!0?new ua(x,y):new pe(x,y),p.isSkinnedMesh===!0&&p.normalizeSkinWeights(),m.mode===ti.TRIANGLE_STRIP?p.geometry=bp(p.geometry,Na):m.mode===ti.TRIANGLE_FAN&&(p.geometry=bp(p.geometry,co));else if(m.mode===ti.LINES)p=new $s(x,y);else if(m.mode===ti.LINE_STRIP)p=new qs(x,y);else if(m.mode===ti.LINE_LOOP)p=new da(x,y);else if(m.mode===ti.POINTS)p=new pa(x,y);else throw new Error("THREE.GLTFLoader: Primitive mode unsupported: "+m.mode);Object.keys(p.geometry.morphAttributes).length>0&&_w(p,r),p.name=e.createUniqueName(r.name||"mesh_"+t),Ii(p,r),m.extensions&&dr(i,p,m),e.assignFinalMaterial(p),u.push(p)}for(let d=0,g=u.length;d<g;d++)e.associations.set(u[d],{meshes:t,primitives:d});if(u.length===1)return r.extensions&&dr(i,u[0],r),u[0];let f=new un;r.extensions&&dr(i,f,r),e.associations.set(f,{meshes:t});for(let d=0,g=u.length;d<g;d++)f.add(u[d]);return f})}loadCamera(t){let e,n=this.json.cameras[t],i=n[n.type];if(!i){console.warn("THREE.GLTFLoader: Missing camera parameters.");return}return n.type==="perspective"?e=new He(Lf.radToDeg(i.yfov),i.aspectRatio||1,i.znear||1,i.zfar||2e6):n.type==="orthographic"&&(e=new Ks(-i.xmag,i.xmag,i.ymag,-i.ymag,i.znear,i.zfar)),n.name&&(e.name=this.createUniqueName(n.name)),Ii(e,n),Promise.resolve(e)}loadSkin(t){let e=this.json.skins[t],n=[];for(let i=0,r=e.joints.length;i<r;i++)n.push(this._loadNodeShallow(e.joints[i]));return e.inverseBindMatrices!==void 0?n.push(this.getDependency("accessor",e.inverseBindMatrices)):n.push(null),Promise.all(n).then(function(i){let r=i.pop(),o=i,a=[],c=[];for(let l=0,h=o.length;l<h;l++){let u=o[l];if(u){a.push(u);let f=new Pt;r!==null&&f.fromArray(r.array,l*16),c.push(f)}else console.warn('THREE.GLTFLoader: Joint "%s" could not be found.',e.joints[l])}return new fa(a,c)})}loadAnimation(t){let e=this.json,n=this,i=e.animations[t],r=i.name?i.name:"animation_"+t,o=[],a=[],c=[],l=[],h=[];for(let u=0,f=i.channels.length;u<f;u++){let d=i.channels[u],g=i.samplers[d.sampler],x=d.target,m=x.node,p=i.parameters!==void 0?i.parameters[g.input]:g.input,y=i.parameters!==void 0?i.parameters[g.output]:g.output;x.node!==void 0&&(o.push(this.getDependency("node",m)),a.push(this.getDependency("accessor",p)),c.push(this.getDependency("accessor",y)),l.push(g),h.push(x))}return Promise.all([Promise.all(o),Promise.all(a),Promise.all(c),Promise.all(l),Promise.all(h)]).then(function(u){let f=u[0],d=u[1],g=u[2],x=u[3],m=u[4],p=[];for(let v=0,_=f.length;v<_;v++){let w=f[v],T=d[v],R=g[v],L=x[v],S=m[v];if(w===void 0)continue;w.updateMatrix&&w.updateMatrix();let M=n._createAnimationTracks(w,T,R,L,S);if(M)for(let b=0;b<M.length;b++)p.push(M[b])}let y=new _a(r,void 0,p);return Ii(y,i),y})}createNodeMesh(t){let e=this.json,n=this,i=e.nodes[t];return i.mesh===void 0?null:n.getDependency("mesh",i.mesh).then(function(r){let o=n._getNodeRef(n.meshCache,i.mesh,r);return i.weights!==void 0&&o.traverse(function(a){if(a.isMesh)for(let c=0,l=i.weights.length;c<l;c++)a.morphTargetInfluences[c]=i.weights[c]}),o})}loadNode(t){let e=this.json,n=this,i=e.nodes[t],r=n._loadNodeShallow(t),o=[],a=i.children||[];for(let l=0,h=a.length;l<h;l++)o.push(n.getDependency("node",a[l]));let c=i.skin===void 0?Promise.resolve(null):n.getDependency("skin",i.skin);return Promise.all([r,Promise.all(o),c]).then(function(l){let h=l[0],u=l[1],f=l[2];f!==null&&h.traverse(function(d){d.isSkinnedMesh&&d.bind(f,Mw)});for(let d=0,g=u.length;d<g;d++)h.add(u[d]);return h})}_loadNodeShallow(t){let e=this.json,n=this.extensions,i=this;if(this.nodeCache[t]!==void 0)return this.nodeCache[t];let r=e.nodes[t],o=r.name?i.createUniqueName(r.name):"",a=[],c=i._invokeOne(function(l){return l.createNodeMesh&&l.createNodeMesh(t)});return c&&a.push(c),r.camera!==void 0&&a.push(i.getDependency("camera",r.camera).then(function(l){return i._getNodeRef(i.cameraCache,r.camera,l)})),i._invokeAll(function(l){return l.createNodeAttachment&&l.createNodeAttachment(t)}).forEach(function(l){a.push(l)}),this.nodeCache[t]=Promise.all(a).then(function(l){let h;if(r.isBone===!0?h=new jr:l.length>1?h=new un:l.length===1?h=l[0]:h=new be,h!==l[0])for(let u=0,f=l.length;u<f;u++)h.add(l[u]);if(r.name&&(h.userData.name=r.name,h.name=o),Ii(h,r),r.extensions&&dr(n,h,r),r.matrix!==void 0){let u=new Pt;u.fromArray(r.matrix),h.applyMatrix4(u)}else r.translation!==void 0&&h.position.fromArray(r.translation),r.rotation!==void 0&&h.quaternion.fromArray(r.rotation),r.scale!==void 0&&h.scale.fromArray(r.scale);if(!i.associations.has(h))i.associations.set(h,{});else if(r.mesh!==void 0&&i.meshCache.refs[r.mesh]>1){let u=i.associations.get(h);i.associations.set(h,{...u})}return i.associations.get(h).nodes=t,h}),this.nodeCache[t]}loadScene(t){let e=this.extensions,n=this.json.scenes[t],i=this,r=new un;n.name&&(r.name=i.createUniqueName(n.name)),Ii(r,n),n.extensions&&dr(e,r,n);let o=n.nodes||[],a=[];for(let c=0,l=o.length;c<l;c++)a.push(i.getDependency("node",o[c]));return Promise.all(a).then(function(c){for(let h=0,u=c.length;h<u;h++)r.add(c[h]);let l=h=>{let u=new Map;for(let[f,d]of i.associations)(f instanceof Tn||f instanceof Je)&&u.set(f,d);return h.traverse(f=>{let d=i.associations.get(f);d!=null&&u.set(f,d)}),u};return i.associations=l(r),r})}_createAnimationTracks(t,e,n,i,r){let o=[],a=t.name?t.name:t.uuid,c=[];Ts[r.path]===Ts.weights?t.traverse(function(f){f.morphTargetInfluences&&c.push(f.name?f.name:f.uuid)}):c.push(a);let l;switch(Ts[r.path]){case Ts.weights:l=wi;break;case Ts.rotation:l=Ei;break;case Ts.translation:case Ts.scale:l=Ti;break;default:n.itemSize===1?l=wi:l=Ti;break}let h=i.interpolation!==void 0?gw[i.interpolation]:Hs,u=this._getArrayFromAccessor(n);for(let f=0,d=c.length;f<d;f++){let g=new l(c[f]+"."+Ts[r.path],e.array,u,h);i.interpolation==="CUBICSPLINE"&&this._createCubicSplineTrackInterpolant(g),o.push(g)}return o}_getArrayFromAccessor(t){let e=t.array;if(t.normalized){let n=Zp(e.constructor),i=new Float32Array(e.length);for(let r=0,o=e.length;r<o;r++)i[r]=e[r]*n;e=i}return e}_createCubicSplineTrackInterpolant(t){t.createInterpolant=function(n){let i=this instanceof Ei?Jp:fu;return new i(this.times,this.values,this.getValueSize()/3,n)},t.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline=!0}};function bw(s,t,e){let n=t.attributes,i=new le;if(n.POSITION!==void 0){let a=e.json.accessors[n.POSITION],c=a.min,l=a.max;if(c!==void 0&&l!==void 0){if(i.set(new B(c[0],c[1],c[2]),new B(l[0],l[1],l[2])),a.normalized){let h=Zp(zo[a.componentType]);i.min.multiplyScalar(h),i.max.multiplyScalar(h)}}else{console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");return}}else return;let r=t.targets;if(r!==void 0){let a=new B,c=new B;for(let l=0,h=r.length;l<h;l++){let u=r[l];if(u.POSITION!==void 0){let f=e.json.accessors[u.POSITION],d=f.min,g=f.max;if(d!==void 0&&g!==void 0){if(c.setX(Math.max(Math.abs(d[0]),Math.abs(g[0]))),c.setY(Math.max(Math.abs(d[1]),Math.abs(g[1]))),c.setZ(Math.max(Math.abs(d[2]),Math.abs(g[2]))),f.normalized){let x=Zp(zo[f.componentType]);c.multiplyScalar(x)}a.max(c)}else console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.")}}i.expandByVector(a)}s.boundingBox=i;let o=new En;i.getCenter(o.center),o.radius=i.min.distanceTo(i.max)/2,s.boundingSphere=o}function Zx(s,t,e){let n=t.attributes,i=[];function r(o,a){return e.getDependency("accessor",o).then(function(c){s.setAttribute(a,c)})}for(let o in n){let a=Kp[o]||o.toLowerCase();a in s.attributes||i.push(r(n[o],a))}if(t.indices!==void 0&&!s.index){let o=e.getDependency("accessor",t.indices).then(function(a){s.setIndex(a)});i.push(o)}return ie.workingColorSpace!==We&&"COLOR_0"in n&&console.warn(`THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${ie.workingColorSpace}" not supported.`),Ii(s,t),bw(s,t,e),Promise.all(i).then(function(){return t.targets!==void 0?yw(s,t.targets,e):s})}function ei(s=7731){return()=>{s|=0,s=s+1831565813|0;let t=Math.imul(s^s>>>15,1|s);return t=t+Math.imul(t^t>>>7,61|t)^t,((t^t>>>14)>>>0)/4294967296}}var kn=(s,t,e)=>Math.max(t,Math.min(e,s)),Qp=(s,t,e)=>s+(t-s)*e,Kt=(s,t,e)=>{let n=kn((e-s)/(t-s),0,1);return n*n*(3-2*n)};function Be(s,t,e){return Math.sin(s*2.37+Math.sin(e*3.1))*Math.sin(t*2.73+e*.73)*.55+Math.sin(s*5.7-t*4.1+e*3.8)*.24+Math.sin(s*12.3+t*8.9-e*11.2)*.09}function sc(s,t){return-.3+.12*Math.sin(s*.49+t*.22)+.075*Math.sin(t*.75-s*.25)+.25*Math.exp(-((s-6)**2/17+(t+1)**2/13))}var es={left:-9.65,right:9.65,back:-4.1,front:6.1,surface:8.5},du=[[-5.65,.65,-.8,2.55,1.18,1.75],[-6.85,1.8,-1.35,1.63,1.56,1.48],[-5.3,2.8,-1.12,1.66,1.3,1.39],[-3.96,1.77,.62,1.88,1.23,1.42],[-3.24,.52,1.53,1.63,.78,1.08],[-7.7,.15,1.62,1.36,.63,1.04],[-5.77,.3,2.23,1.54,.71,.93],[5.32,.59,-1.06,2.61,1.19,1.69],[6.56,1.98,-1.38,1.6,1.6,1.43],[4.68,1.9,-.64,1.54,1.19,1.33],[3.06,.65,.65,1.29,.85,1.16],[5.57,.24,1.9,1.79,.63,1.12],[7.62,.1,2.34,1.02,.48,.89],[2.19,.05,2.12,.98,.43,.77],[-1.55,1,-1.05,.95,1.55,1.1],[1.8,.9,-1.15,.95,1.45,1.05],[-.55,2.62,-1.2,1.65,.78,1],[1.25,2.98,-1.28,1.5,.72,.92]],tm={x:-3.95,y:3.16,z:1,radius:1.7,lean:[.1,.3]},em=[tm,{x:5.5,y:1.24,z:2,radius:.7,form:"compact",lean:[.15,.8]},{x:4.8,y:1.1,z:2.5,radius:.42,form:"compact",lean:[-.3,.5]},{x:-2.35,y:1.02,z:2.25,radius:.4,form:"compact",lean:[.2,.5]},{x:-2.45,y:1.3,z:1.75,radius:.26,form:"compact",lean:[0,.6]}],Qx=[{x:2.23,y:.57,z:2.22},{x:-5.15,y:.98,z:2.72}],ww=[[-6,4.35,-1.05,1.4,1.4,1.3],[6,4.2,-1.4,1.5,1.3,1.3],[4.4,3.1,-.2,1.65,.45,1.5],[6.98,4.95,-.7,1.35,1.75,.6],[-.45,3.95,-1.14,.8,.7,.7],[1.34,4.2,-1.24,.7,.65,.65]],R3=ww.slice(0,2).map(([s,t,e,,n])=>({x:s,y:t,z:e,top:t+n}));var lc={value:0},ay=es.surface,gi=(()=>{let s=Math.hypot(-2.2,13,2);return{x:-2.2/s,y:13/s,z:2/s}})(),pu=14.2,Ew=98.1,Rn=ay,Tw=.05,cy=Array.from({length:11},(s,t)=>{let e=2.1*1.19**t,n=.18+t*2.39996;return{a:Tw/(e*e),k:e,angle:n,phase:t*1.618034%1*6.2832,dx:Math.cos(n),dz:Math.sin(n),omega:Math.sqrt(Ew*e*Math.tanh(e*Rn))}}),ly=.025,ht=s=>Number(s).toFixed(7),Aw=[{amp:.25,omega:.88,phase:.2},{amp:.115,omega:.49,phase:1.8}];var nm=s=>`(-.30+.12*sin(${s}.x*.49+${s}.y*.22)+.075*sin(${s}.y*.75-${s}.x*.25)+.25*exp(-((${s}.x-6.)*(${s}.x-6.)/17.+(${s}.y+1.)*(${s}.y+1.)/13.)))`,mu=`
float reefBed(vec2 p){return ${nm("p")};}
vec2 reefResponse(vec3 p,float t,float tau){
  float y=clamp(p.y,0.,${ht(Rn)});
  float boundary=(.12+.88*smoothstep(0.,.9,p.y-reefBed(p.xz)))*max(0.,1.-pow(p.x/9.65,8.));
  float profile=(.64+.36*sin(3.14159265*y/${ht(Rn)}))*boundary;
  float drive=.10;
  ${Aw.map(s=>`drive+=${ht(s.amp)}*cos(${ht(s.omega)}*t+${ht(s.phase)}-atan(${ht(s.omega)}*tau))/sqrt(1.+pow(${ht(s.omega)}*tau,2.));`).join(`
`)}
  return vec2(profile,.12*sin(p.x*.23+p.z*.37)*profile)*drive;
}`,hy=`vec3 warp=1.1*sin(vec3(dot(q,vec2(.62,.31)),dot(q,vec2(-.27,.58)),dot(q,vec2(.45,-.50)))+st*vec3(.13,-.17,.11)+vec3(0.,2.1,4.2));
  vec3 swell=1.+.35*sin(st*vec3(.09,.071,.113)+vec3(1.,3.3,5.6));`,uy=(s,t)=>`float w=${ht(s.k)}*dot(q,vec2(${ht(s.dx)},${ht(s.dz)}))-${ht(s.omega)}*st+${ht(s.phase)}+warp[${t%3}];float a=${ht(s.a)}*swell[${(t+1)%3}];`,ni=1.333,oc=34,ty=(()=>{let s=-gi.x/ni,t=-gi.z/ni,e=Math.sqrt(1-s*s-t*t);return{x:s/e,z:t/e}})(),mi={x:-ty.x*oc,y:Rn+oc,z:1-ty.z*oc},ey=.85/(1-1/ni),yn={x:-11.5,z:-4.4,width:22,depth:11.6},ac=[0,3.2],Rw=10,Cw=.1,ny={eco:[224,118],balanced:[320,168],detail:[448,236],native:[448,236]},Iw={eco:[384,202],balanced:[512,270],detail:[1024,540],native:[1024,540]},iy=[.25,.2,.15],Pw=.06,Lw=.55,Nw=.0025,sy=.3,im={value:null},fy=`
#ifndef REEF_CAUSTIC_MAP
#define REEF_CAUSTIC_MAP
uniform sampler2D reefCaustics;
// Where the lamp's unbent ray through p crossed the surface, on the map.
vec2 reefCausticUV(vec3 p){
  vec2 fan=vec2(${ht(mi.x)},${ht(mi.z)});
  return (fan+(p.xz-fan)*${ht(oc)}/max(${ht(mi.y)}-p.y,1.)-vec2(${ht(yn.x)},${ht(yn.z)}))/vec2(${ht(yn.width)},${ht(yn.depth)});
}
// Off the map's edge the light is even.
float reefCausticCover(vec2 uv){vec2 e=min(uv,1.-uv)*vec2(${ht(yn.width)},${ht(yn.depth)});return smoothstep(0.,1.,min(e.x,e.y));}
#endif`,dy=`${fy}
// The lamp's light arriving at p, its caustics blurred over the given radius, and never
// sharper than the map's own texels, so a close view never sees them.
vec3 reefIrradianceBlurred(vec3 p,float blur){
  float depth=clamp(${ht(Rn)}-p.y,.02,9.),texels=blur*float(textureSize(reefCaustics,0).x)/${ht(yn.width)};
  // Four taps a blur radius apart, each read from the mip level whose texels span that
  // radius, so the blur is smooth however wide it gets.
  vec2 uv=reefCausticUV(p),r=blur*max(1.,.7/texels)/vec2(${ht(yn.width)},${ht(yn.depth)});
  float lod=max(0.,log2(texels));
  vec2 slices=.25*(textureLod(reefCaustics,uv+r*vec2(1.,.4),lod).rg+textureLod(reefCaustics,uv+r*vec2(-.4,1.),lod).rg
    +textureLod(reefCaustics,uv-r*vec2(1.,.4),lod).rg+textureLod(reefCaustics,uv-r*vec2(-.4,1.),lod).rg);
  float shallow=${ht(Rn-ac[1])};
  slices.g=mix(1.,slices.g,${ht(Lw)});
  float focus=depth<shallow?mix(1.,slices.g,depth/shallow):mix(slices.g,slices.r,min(1.,(depth-shallow)/${ht(ac[1]-ac[0])}));
  // A share of the bank's light reaches every point by too many paths to focus, so the
  // cells between the lines hold a mid-tone instead of going dark.
  focus=mix(1.,${ht(sy)}+${ht(1-sy)}*focus,reefCausticCover(uv));
  // The bank sits over the front half of the tank, so the rear hardscape is lit at a slant
  // and through more water: it falls off toward the back wall instead of meeting it lit.
  float reach=.46+.54*smoothstep(-4.6,-.6,p.z);
  float path=depth*length(p-vec3(${ht(mi.x)},${ht(mi.y)},${ht(mi.z)}))/(${ht(mi.y)}-p.y);
  return reefDownwelling(path)*focus*reach;
}
// The bank is not a point, so the farther below the surface, the softer each line.
vec3 reefIrradiance(vec3 p,float t){return reefIrradianceBlurred(p,(${ht(Rn)}-p.y)*${ht(Nw)}+${ht(Pw)}*smoothstep(.4,1.5,p.y));}`;function py(){let s=new qn(1,1,{type:Yi,depthBuffer:!1,generateMipmaps:!0,minFilter:Un,magFilter:Ye});im.value=s.texture;let t={reefTime:lc,texels:{value:new Ht(1,1)},blend:{value:1}},e=new Ws,n=new Gs,i=1,r=(u,f)=>new Sn({uniforms:t,side:Ce,depthTest:!1,depthWrite:!1,blending:Ta,blendSrc:Aa,blendDst:Aa,vertexShader:`uniform float reefTime;uniform vec2 texels;varying vec2 vSource;
      void main(){
        vec2 origin=vec2(${ht(yn.x)},${ht(yn.z)}),size=vec2(${ht(yn.width)},${ht(yn.depth)});
        vec2 q=origin-${ht(i)}+(position.xy+.5)*(size+${ht(2*i)});
        float t=reefTime,st=t*${ht(ly)};vec2 slope=vec2(0.);
        ${hy}
        ${cy.map((d,g)=>`{${uy(d,g)}slope+=a*${ht(d.k)}*vec2(${ht(d.dx)},${ht(d.dz)})*cos(w);}`).join(`
        `)}
        ${_y.slice(0,iy.length).map((d,g)=>`slope+=${ht(iy[g])}*${vy(d,g)};`).join(`
        `)}
        // The lamp's ray in air that flat water would bend onto the fan, bent instead by
        // this point's facet.
        vec3 fan=vec3(${ht(mi.x)},${ht(mi.y)},${ht(mi.z)}),unbent=normalize(vec3(q.x,${ht(Rn)},q.y)-fan);
        vec3 air=vec3(unbent.x*${ht(ni)},0.,unbent.z*${ht(ni)});air.y=-sqrt(max(0.,1.-dot(air.xz,air.xz)));
        vec3 ray=refract(air,normalize(vec3(-${ht(ey)}*slope.x,1.,-${ht(ey)}*slope.y)),${ht(1/ni)});
        vec2 landed=q+ray.xz*${ht(Rn-u)}/max(-ray.y,.2);
        // Back onto the map along the fan, so an unbent ray lands where it started.
        vec2 onMap=fan.xz+(landed-fan.xz)*${ht(oc/(mi.y-u))};
        vSource=(q-origin)/size*texels;
        gl_Position=vec4((onMap-origin)/size*2.-1.,0.,1.);
      }`,fragmentShader:`uniform float blend;varying vec2 vSource;
      void main(){
        // The patch's area on the surface, in texels, per texel it covers where it landed.
        vec2 dx=dFdx(vSource),dy=dFdy(vSource);
        gl_FragColor=vec4(${f}*min(abs(dx.x*dy.y-dx.y*dy.x),${ht(Rw)})*blend,0.);
      }`}),o=[r(ac[0],"vec3(1.,0.,0.)"),r(ac[1],"vec3(0.,1.,0.)")],a=o.map(u=>{let f=new pe(new oe,u);return f.frustumCulled=!1,e.add(f),f}),c=new pe(new bi(2,2),new Sn({uniforms:t,depthTest:!1,depthWrite:!1,blending:Ta,blendSrc:ul,blendDst:Hr,vertexShader:"void main(){gl_Position=vec4(position.xy,0.,1.);}",fragmentShader:"uniform float blend;void main(){gl_FragColor=vec4(0.,0.,0.,blend);}"}));c.frustumCulled=!1,c.renderOrder=-1,e.add(c);let l=null,h=!0;return{setQuality(u){let f=ny[u]?u:"balanced";if(f===l)return;l=f;let[d,g]=ny[l],[x,m]=Iw[l],p=new bi(1,1,d-1,g-1);for(let y of a)y.geometry.dispose(),y.geometry=p;s.setSize(x,m),t.texels.value.set(x,m),h=!0},render(u){t.blend.value=h?1:Cw,h=!1;let f=u.autoClear;u.autoClear=!1,u.setRenderTarget(s),u.render(e,n),u.autoClear=f},dispose(){a[0].geometry.dispose(),o.forEach(u=>u.dispose()),s.dispose()}}}var my=[.045,.016,.01],gu=[.012,.016,.02],cc=my.map((s,t)=>s+gu[t]),Dw=my.map((s,t)=>1.25*s+.25*gu[t]),gy=14,xy=`
float reefAirPath(vec3 eye,vec3 ray){return eye.z>${ht(es.front)}?(eye.z-${ht(es.front)})/max(-ray.z,.05):0.;}
float reefWaterPath(vec3 p,vec3 eye){vec3 ray=p-eye;float d=length(ray);return max(0.,d-reefAirPath(eye,ray/max(d,1e-5)));}
vec3 reefTransmittance(float path){return exp(-vec3(${cc.map(ht).join(",")})*path);}
vec3 reefDownwelling(float depth){return exp(-vec3(${Dw.map(ht).join(",")})*depth);}`,Ow=[.03,.085,.38],Uw=[.3,.42,.6],ry=[.6,.8],Fw=2,Bw=6,zw=.75,kw=.6,oy=[[.35,.8],[.65,.35]],yy=`${fy}
float reefShafts(vec3 p,float t){
  float depth=clamp(${ht(Rn)}-p.y,0.,${ht(Rn)});
  vec2 uv=reefCausticUV(p);
  float lod=log2(mix(${ht(ry[0])},${ht(ry[1])},depth/${ht(Rn)})*float(textureSize(reefCaustics,0).x)/${ht(yn.width)});
  float line=textureLod(reefCaustics,uv,lod).r,mean=textureLod(reefCaustics,uv,lod+${ht(Fw)}).r;
  float shaft=max(0.,mean+${ht(Bw)}*(line-mean)-${ht(zw)});
  // Brightest under the bank, fading toward the tank's ends.
  float across=uv.x*${ht(yn.width)}+${ht(yn.x)};
  return ${ht(kw)}*shaft*exp(-across*across/90.)*reefCausticCover(uv);
}
vec3 reefAmbientLight(vec3 p){
  float depth=clamp(${ht(Rn)}-p.y,0.,12.);
  return vec3(${Ow.map(ht).join(",")})*reefDownwelling(depth)*(.25+.75*exp(-.45*depth));
}
vec3 reefBeamLight(vec3 p,float t,float lit){
  // A shaft needs some water to scatter in before it shows, so none is drawn on the surface.
  float depth=clamp(${ht(Rn)}-p.y,0.,12.);
  return vec3(${Uw.map(ht).join(",")})*reefDownwelling(depth)*reefShafts(p,t)*lit*exp(-.1*depth)*smoothstep(.1,1.,depth);
}
float reefPhase(vec3 ray){
  float mu=dot(ray,vec3(${ht(gi.x)},${ht(gi.y)},${ht(gi.z)}));
  ${oy.map(([s,t])=>`float hg${Math.round(t*100)}=${ht(1-t*t)}/pow(${ht(1+t*t)}-${ht(2*t)}*mu,1.5);`).join("")}
  return ${oy.map(([s,t])=>`${ht(s)}*hg${Math.round(t*100)}`).join("+")};
}
vec3 reefInscatter(vec3 p,vec3 ray,float t,float lit){
  return vec3(${gu.map(ht).join(",")})*(reefAmbientLight(p)+reefBeamLight(p,t,lit)*reefPhase(ray));
}
// The water past the back pane, as the back wall paints it: the glow of BEYOND more units
// of it seen from p along ray.
vec3 reefFarWater(vec3 p,vec3 ray,float t){
  vec3 extinction=vec3(${cc.map(ht).join(",")});
  return reefInscatter(p,ray,t,1.)*(1.-exp(-extinction*${ht(gy)}))/extinction;
}`,_y=[[13,.3,.9,.06],[19,-1.1,1.4,.05],[27,.8,2.1,.04],[38,2,2.9,.03],[53,-.6,3.6,.022]].map(([s,t,e,n])=>({k:s,dx:Math.cos(t),dz:Math.sin(t),speed:e,slope:n})),vy=(s,t)=>`${ht(s.slope)}*vec2(${ht(s.dx)},${ht(s.dz)})*cos(${ht(s.k)}*dot(q,vec2(${ht(s.dx)},${ht(s.dz)}))+${ht(s.speed)}*t*.1+${(t*1.7+.4).toFixed(2)}*sin(q.y*.9+q.x*.4))`,Hw=3,Vw=[.36,.36,.32],Gw=.02,Pi={y:gi.y*pu,z:gi.z*pu,xs:[-7.5,-2.5,2.5,7.5],radius:.9,radiance:9};function Sy(){let e=new Uint16Array(131072),n=aa.toHalfFloat,i=[0,4,0],r=Math.asin(1/ni),o=Pi.xs.map(c=>{let l=[c-i[0],Pi.y-i[1],Pi.z-i[2]],h=Math.hypot(...l);return{d:l.map(u=>u/h),r:Pi.radius/h}});for(let c=0;c<128;c++)for(let l=0;l<256;l++){let h=((c+.5)/128-.5)*Math.PI,u=((l+.5)/256-.5)*2*Math.PI,f=[Math.cos(h)*Math.cos(u),Math.sin(h),Math.cos(h)*Math.sin(u)],d=Math.max(0,f[1]),g=Math.acos(Math.min(1,d)),x=[.004,.016,.045].map((y,v)=>y*(1-Kt(0,.9,-f[1]))+[.034,.032,.026][v]*Kt(.1,.9,-f[1])),m=Math.exp(-(((g-r)/.06)**2)),p=Kt(.15,.6,d);if(x=x.map((y,v)=>y+[.01,.03,.065][v]*p+[.05,.09,.13][v]*m),g<r){let y=Math.asin(Math.min(1,Math.sin(g)*ni)),v=Math.sin(y)/Math.max(1e-5,Math.sin(g)),_=[f[0]*v,Math.cos(y),f[2]*v],w=0;for(let T of o){let R=_[0]*T.d[0]+_[1]*T.d[1]+_[2]*T.d[2],L=T.r*1.4;w+=Kt(1-L*L*.5*1.8,1-L*L*.5*.3,R)}x=x.map((T,R)=>T*.4+[.02,.032,.045][R]+[.86,.92,1][R]*Pi.radiance*.2*w)}for(let y=0;y<3;y++)e[(c*256+l)*4+y]=n(x[y]);e[(c*256+l)*4+3]=n(1)}let a=new Xs(e,256,128,Mn,Yi);return a.mapping=io,a.colorSpace=We,a.magFilter=a.minFilter=Ye,a.needsUpdate=!0,a}var Ww=`
vec3 reefAboveWater(vec3 s,vec3 ray){
  // The hood over a reef tank is lit by its own lamps and reflects them, so through the
  // window it reads as a bright cyan-white, brightest straight up.
  vec3 light=vec3(.30,.48,.70)*(.4+.6*ray.y);
  ${Pi.xs.map(s=>`{vec3 to=vec3(${ht(s)},${ht(Pi.y)},${ht(Pi.z)})-s;float d=length(to),c=max(dot(ray,to/d),0.);
    float r=${ht(Pi.radius)}/d;
    light+=vec3(.78,.84,1.)*(${ht(Pi.radiance)}*smoothstep(1.-r*r*.8,1.-r*r*.2,c)+.6*pow(c,24.))+vec3(.42,.52,1.)*(.5*pow(c,10.)+.1*pow(c,4.));}`).join(`
`)}
  return light;
}
vec3 reefSurfaceUnderside(vec3 s,vec3 dir,float t){
  vec2 q=s.xz;float st=t*${ht(ly)};vec2 slope=vec2(0.);
  // A wave finer than a couple of pixels cannot be drawn, only aliased, so each fades out
  // as its wavelength nears the pixel's footprint on the surface.
  float footprint=length(fwidth(q));
  ${hy}
  ${cy.map((s,t)=>`{${uy(s,t)}slope+=(1.-smoothstep(.5,1.4,${ht(s.k)}*footprint))*a*${ht(s.k*Hw)}*vec2(${ht(s.dx)},${ht(s.dz)})*cos(w);}`).join(`
  `)}
  ${_y.map((s,t)=>`slope+=(1.-smoothstep(.5,1.4,${ht(s.k)}*footprint))*${vy(s,t)};`).join(`
  `)}
  vec3 facet=normalize(vec3(-slope.x,1.,-slope.y));
  float cosI=clamp(dot(dir,facet),0.,1.),sin2T=${ht(ni*ni)}*(1.-cosI*cosI);
  // The mirror holds the water under the surface. Turned back nearly level it shows the
  // water's own glow; turned steeper by a facet it finds the lit bed and reef, caught in
  // their caustics and veiled by the water between, so every ripple is a bright line on
  // one flank and the blue water on the other, and the underside reads as one membrane.
  vec3 down=reflect(dir,facet);
  vec3 water=vec3(${gu.map(ht).join(",")})*reefAmbientLight(s-vec3(0.,1.,0.))*(1.-exp(-vec3(${cc.map(ht).join(",")})*${ht(gy)}))/vec3(${cc.map(ht).join(",")});
  vec3 bed=vec3(s.x,${nm("s.xz")},s.z);
  vec3 veil=reefTransmittance((s.y-bed.y)/max(-down.y,.12));
  // Seen in a rippled mirror, the caustics below are softened further.
  vec3 lit=vec3(${Vw.map(ht).join(",")})*reefIrradianceBlurred(bed,${ht(Gw)});
  vec3 mirror=mix(water,water*(1.-veil)+lit*veil,smoothstep(.0,.45,-down.y));
  float cosT=sqrt(max(1.-sin2T,0.));
  vec3 refracted=normalize(${ht(ni)}*dir+(cosT-${ht(ni)}*cosI)*facet);
  // Schlick's approximation from the air side, where it holds through the window's edge.
  // A pixel spans many facets, so the edge of total reflection is a soft band, not a cut.
  float fresnel=max(.02+.98*pow(1.-cosT,5.),smoothstep(.55,1.,sin2T));
  return mix(reefAboveWater(s,refracted),mirror,fresnel);
}`;var rc=(()=>{let s=Math.hypot(3,12,-2);return{color:[.12,.24,1],intensity:.85,x:3/s,y:12/s,z:-2/s}})(),Xw=.25,pr=(s,t=!1)=>Array.isArray(s)?`vec3(${s.map(ht).join(",")})`:typeof s=="number"?t?`vec3(${ht(s)})`:ht(s):`(${s})`;function ii(s,{vertex:t="",begin:e="",normal:n="",fragment:i="",color:r="",map:o="",surfaceNormal:a="",key:c="reef",transmission:l=0,wrap:h=.4,transmissionColor:u=null,fluorescence:f=null,specular:d=Xw,contact:g=!1,recede:x=0}={}){let m=`vec3(${ht(rc.x)},${ht(rc.y)},${ht(rc.z)})`;return s.onBeforeCompile=p=>{p.uniforms.reefTime=lc,p.uniforms.reefCaustics=im,p.vertexShader=p.vertexShader.replace("#include <common>",`#include <common>
uniform float reefTime;varying vec3 vReefWorld;${t}`).replace("#include <beginnormal_vertex>",`#include <beginnormal_vertex>
${n}`).replace("#include <begin_vertex>",`#include <begin_vertex>
${e}`).replace("#include <worldpos_vertex>",`#include <worldpos_vertex>
vec4 reefPosition=vec4(transformed,1.);
      #ifdef USE_INSTANCING
      reefPosition=instanceMatrix*reefPosition;
      #endif
      vReefWorld=(modelMatrix*reefPosition).xyz;`),p.fragmentShader=p.fragmentShader.replace("#include <common>",`#include <common>
uniform float reefTime;varying vec3 vReefWorld;vec3 reefLight=vec3(1.);${xy}${dy}${x?yy:""}${i}`).replace("#include <map_fragment>",o||"#include <map_fragment>").replace("#include <normal_fragment_maps>",`#include <normal_fragment_maps>
`+a).replace("#include <color_fragment>",`#include <color_fragment>
${r}`).replace("#include <lights_physical_pars_fragment>",`#include <lights_physical_pars_fragment>
      #undef RE_Direct
      void RE_Direct_Reef(const in IncidentLight directLight,const in vec3 geometryPosition,const in vec3 geometryNormal,const in vec3 geometryViewDir,const in vec3 geometryClearcoatNormal,const in PhysicalMaterial material,inout ReflectedLight reflectedLight){
        IncidentLight light=directLight;light.color*=reefLight;
        RE_Direct_Physical(light,geometryPosition,geometryNormal,geometryViewDir,geometryClearcoatNormal,material,reflectedLight);
        ${l?`{// Light striking the far face, wrapped past the terminator, diffused through
        // the membrane and scattered mostly onward, so backlit tissue glows when seen against
        // the lamp and only faintly from the side.
        float wrap=${pr(h)},back=clamp(dot(-geometryNormal,light.direction)*(1.-wrap)+wrap,0.,1.);
        float forward=pow(clamp(dot(-geometryViewDir,light.direction),0.,1.),3.);
        reflectedLight.directDiffuse+=light.color*${u?pr(u,!0):"material.diffuseColor"}*RECIPROCAL_PI*back*back*(.55+1.2*forward)*${pr(l)};}`:""}
      }
      #define RE_Direct RE_Direct_Reef`).replace("#include <lights_physical_fragment>",`#include <lights_physical_fragment>
      material.specularColor*=${pr(d)};`).replace("#include <lights_fragment_begin>",`reefLight=reefIrradiance(vReefWorld,reefTime);
#include <lights_fragment_begin>`).replace("#include <lights_fragment_end>",`#include <lights_fragment_end>
      ${g?`reflectedLight.indirectDiffuse*=mix(.45,1.,smoothstep(0.,.9,vReefWorld.y-${nm("vReefWorld.xz")}));`:""}
      ${f?`{vec3 actinicView=normalize((viewMatrix*vec4(${m},0.)).xyz);
        float absorbed=${ht(rc.intensity*rc.color[2])}*reefLight.b*(.35+.65*max(dot(normal,actinicView),0.));
        totalEmissiveRadiance+=${pr(f,!0)}*absorbed*RECIPROCAL_PI;}`:""}`).replace("#include <opaque_fragment>",`${x?`outgoingLight=mix(outgoingLight,reefFarWater(vReefWorld,normalize(vReefWorld-cameraPosition),reefTime),${pr(x)});`:""}
        outgoingLight*=reefTransmittance(reefWaterPath(vReefWorld,cameraPosition));
        #include <opaque_fragment>
        ${x?`// As open water it takes no contact shading in the post pass, as the back wall takes none.
        gl_FragColor.a*=1.-${pr(x)};`:""}`)},s.customProgramCacheKey=()=>c,s}var Ie=(s=0,t=0,e=0)=>new B(s,t,e);function Hn(s){let t=0,e=0,n={position:3,normal:3,uv:2,color:3};for(let l of s){t+=l.attributes.position.count,e+=l.index?l.index.count:l.attributes.position.count;for(let[h,u]of Object.entries(l.attributes))n[h]??=u.itemSize}let i=new oe,r=Object.fromEntries(Object.entries(n).map(([l,h])=>[l,new Float32Array(t*h)])),o=t>65535?new Uint32Array(e):new Uint16Array(e),a=0,c=0;for(let l of s){let h=l.attributes.position.count;for(let[u,f]of Object.entries(r)){let d=n[u],g=l.attributes[u];g?f.set(g.array,a*d):u==="color"&&f.fill(1,a*d,(a+h)*d)}if(l.index)for(let u of l.index.array)o[c++]=u+a;else for(let u=0;u<h;u++)o[c++]=u+a;a+=h,l.dispose()}for(let[l,h]of Object.entries(r))i.setAttribute(l,new re(h,n[l]));return i.setIndex(new re(o,1)),i.computeBoundingSphere(),i}function My(s,t,e){let n=s.attributes.position,i=new Float32Array(n.count*3),r=Ie();for(let o=0;o<n.count;o++){r.fromBufferAttribute(n,o);let a=e(r,o);i[o*3]=a.r,i[o*3+1]=a.g,i[o*3+2]=a.b}return s.setAttribute(t,new re(i,3)),s}var mr=(s,t)=>My(s,"color",t),xu=(s,t)=>My(s,"fluor",t),qw=new Et(0,0,0),ko=([s,t]=["#000000",0])=>new Et(s).multiplyScalar(t);function rm(s,t,e=1,n=24){let i=new ds(1,n,Math.round(n*.66)),r=i.attributes.position;for(let o=0;o<r.count;o++){let a=r.getX(o),c=r.getY(o),l=r.getZ(o),h=1+.12*Be(a*1.3+e,c*1.3,l*1.3)+.018*Be(a*5,c*5+e,l*5);r.setXYZ(o,a*t[0]*h+s[0],c*t[1]*h+s[1],l*t[2]*h+s[2])}return i.computeVertexNormals(),i}function sm(s,t,e=7,n=0){let i=[],r=[],o=[],a=Ie(),c=Ie(),l=Ie(),h=Ie(0,0,1);for(let f=0;f<s.length;f++){let d=s[f];a.subVectors(s[Math.min(f+1,s.length-1)],s[Math.max(f-1,0)]).normalize(),h.set(0,0,1),Math.abs(a.z)>.92&&h.set(1,0,0),c.crossVectors(a,h).normalize(),l.crossVectors(c,a).normalize();for(let g=0;g<=e;g++){let x=g/e*Math.PI*2,m=Math.cos(x)*c.x+Math.sin(x)*l.x,p=Math.cos(x)*c.y+Math.sin(x)*l.y,y=Math.cos(x)*c.z+Math.sin(x)*l.z,v=n?t[f]*(1+n*Be((d.x+t[f]*m)*23,(d.y+t[f]*p)*23,(d.z+t[f]*y)*23)):t[f];if(i.push(d.x+v*m,d.y+v*p,d.z+v*y),r.push(g/e,f/(s.length-1)),f<s.length-1&&g<e){let _=f*(e+1)+g;o.push(_,_+e+1,_+1,_+1,_+e+1,_+e+2)}}}let u=new oe;return u.setAttribute("position",new Jt(i,3)),u.setAttribute("uv",new Jt(r,2)),u.setIndex(o),u.computeVertexNormals(),u}function by(s,t,e,n,i,r="#cfe2f2",{thickness:o=.026,forks:a=6,roots:c=8,order:l=2,taper:h=.62,corallite:u=.14,rise:f=.64,blunt:d=.7,spread:g=.26,reach:x=.8,vary:m=.14,radials:p=0,pale:y=.34,fluor:v}={}){let _=ei(n),w=[],T=[],R=Ie(...s),L=new Et(i),S=new Et(r),M=ko(v),b=Ie(),A=Ie(),N=Ie(),C=!(d>=.75),I=(at,st,ot,J)=>kn(((at.x-st.x)*ot.x+(at.y-st.y)*ot.y+(at.z-st.z)*ot.z)/J,0,1),O=(at,st,ot,J,it=0)=>{let ft=kn((at.y-s[1])/t,0,1);return L.clone().lerp(S,Math.min(1,it+(ot?.1*st:.05+y*Kt(.55,1,st)**1.5))).multiplyScalar(J*(.52+.52*Math.sqrt(ft))+.08*Be(at.x*15,at.y*15,at.z*15)+.07*Be(at.x*4.5+n,at.y*4.5,at.z*4.5))},k=(at,st,ot,J=0)=>M.clone().multiplyScalar((.25+.75*kn((at.y-s[1])/t,0,1))*(.4+(ot?.1*st:.5*st*st+1.1*Kt(.8,1,st))+J)),z=(at,st,ot,J,it,ft,bt)=>(mr(at,St=>O(St,I(St,st,ot,J),it,ft,bt?.12*bt(St):0)),xu(at,St=>k(St,I(St,st,ot,J),it,bt?.4*bt(St):0)));function et(at,st,ot,J,it){let ft=[],bt=[],St=Ie((_()-.5)*.28,.12,(_()-.5)*.28),zt=it?6:5,ue=.84+_()*.32,V=_()*20;b.crossVectors(st,Math.abs(st.y)<.9?Ie(0,1,0):Ie(1,0,0)).normalize(),A.crossVectors(st,b);for(let E=0;E<=zt;E++){let H=E/zt,ut=ot*.035*H;ft.push(at.clone().addScaledVector(st,ot*H).addScaledVector(St,ot*H*H).addScaledVector(b,ut*Math.sin(H*5.3+V)).addScaledVector(A,ut*Math.cos(H*4.1+V))),bt.push(J*(1-.52*H)*(1+.1*Math.sin(H*7+n+V)))}let Qt=ft.at(-1).clone(),D=bt.at(-1);if(C?(ft.push(Qt.clone().addScaledVector(st,D*.55),Qt.clone().addScaledVector(st,D*1.15),Qt.clone().addScaledVector(st,D*.95),Qt.clone().addScaledVector(st,D*.45)),bt.push(D*(.86-.16*(1-d)),D*(.72-.12*(1-d)),D*.4,.001)):(ft.push(Qt.clone().addScaledVector(st,D*(.5-.2*d)),Qt.clone().addScaledVector(st,D*(1.05-.45*d)),Qt.clone().addScaledVector(st,D*(1.5-.75*d))),bt.push(D*(.42+.46*d),D*(.22+.4*d),.001)),w.push(z(sm(ft,bt,it?9:7,u),at,st,ot,it,ue)),p&&it<2)for(let E=0,H=Math.round(ot*p);E<H;E++){let ut=.08+.86*(E+_())/H,Q=_()*Math.PI*2,yt=J*(1-.52*ut),Bt=yt*(.5+.45*_()),At=yt*.26;N.copy(b).multiplyScalar(Math.cos(Q)).addScaledVector(A,Math.sin(Q));let F=at.clone().addScaledVector(st,ot*ut).addScaledVector(St,ot*ut*ut).addScaledVector(N,yt*.7),P=N.clone().multiplyScalar(.8).addScaledVector(st,.62).normalize(),$=sm([F,F.clone().addScaledVector(P,Bt),F.clone().addScaledVector(P,Bt*.62)],[At,At*.86,.001],6);T.push(z($,at,st,ot,it,ue,nt=>Math.min(1,nt.distanceTo(F)/Bt)))}if(it!==0)for(let E=0;E<a;E++){let H=_()*Math.PI*2,ut=Math.min(zt-1,2+Math.floor(E*.65)),Q=st.clone().multiplyScalar(.4).add(Ie(Math.cos(H)*e,f+_()*.35,Math.sin(H)*e)).normalize();et(ft[ut],Q,ot*(it>1?.38+_()*.22:.29+_()*.18),J*h,it-1)}}for(let at=0;at<c;at++){let st=at*2.39996,ot=Math.sqrt(at/c),J=ot*t*g,it=R.clone().add(Ie(Math.cos(st)*J,-J*.25,Math.sin(st)*J*.7));et(it,Ie(Math.cos(st)*(.16+.6*ot),.95,Math.sin(st)*(.13+.48*ot)).normalize(),t*(x-.3*ot*x/.8+_()*m),t*o*(.9+_()*.2),l)}let j=t*(g*.62+o*1.5),W=rm([R.x,R.y-j*.12,R.z],[j,j*.22,j*.72],n,16),tt=new Et("#3a2638");return mr(W,at=>L.clone().lerp(tt,.45).multiplyScalar(.5+.1*Be(at.x*9,at.y*9,at.z*9))),xu(W,()=>M.clone().multiplyScalar(.15)),w.push(W),{skeleton:Hn(w),radials:T.length?Hn(T):null}}function wy(s,t,e,n,i,{order:r=6,thickness:o=.085,stems:a=3,yaw:c=0,bow:l=.13,split:h=.27,shorten:u=.85}={}){let f=ei(e),d=[],g=new Et(n),x=new Et(i),m=Ie(Math.cos(c),0,Math.sin(c)),p=Ie(-Math.sin(c),0,Math.cos(c)),y=Ie(...s),v=(j,W)=>y.clone().addScaledVector(m,j).addScaledVector(p,-l*j*j+.07*Math.sin(W*2.3+j*1.7+e)*Math.min(1,Math.hypot(j,W))).add(Ie(0,W,0)),_=40,w=1.5*Math.PI,T=new Float32Array(_),R=(j,W)=>kn(Math.floor((Math.atan2(j,W)/w+.5)*_),0,_-1);function L(j,W,tt,at,st,ot){let J=[],it=[],ft=(f()-.5)*.8,bt=(r-ot)/r,St=j,zt=W;for(let V=0;V<=3;V++){if(V){let D=tt+ft*(V-.5)/3;St+=Math.sin(D)*at/3,zt+=Math.cos(D)*at/3}J.push(v(St,zt)),it.push(st*(ot?1-.2*V/3:1-.6*V/3));let Qt=R(St,zt);T[Qt]=Math.max(T[Qt],Math.hypot(St,zt+.12))}let ue=sm(J,it,ot>2?7:5);if(mr(ue,V=>g.clone().lerp(x,bt*.45).multiplyScalar(.7+.3*bt+.08*Be(V.x*9,V.y*9,V.z*9))),d.push(ue),ot!==0)for(let V of[-1,1])L(St,zt,tt+ft+V*h*(.65+f()*.75),at*(u+f()*.1),st*.8,ot-1)}for(let j=0;j<a;j++)L((j-(a-1)/2)*.16,-.12,(j-(a-1)/2)*.3,.95+f()*.2,o,r);{let j=T.slice();for(let W=0;W<_;W++)T[W]=Math.max(j[W],(j[Math.max(0,W-1)]+2*j[W]+j[Math.min(_-1,W+1)])/4)}let S=36,M=[],b=[],A=[],N=[],C=Ie();for(let j=0;j<=S;j++)for(let W=0;W<_;W++){let tt=((W+.5)/_-.5)*w,at=j/S,st=at*T[W]*(.99+.03*Be(W*.7,e,0)),ot=Math.sin(tt)*st,J=Math.cos(tt)*st-.12;C.copy(v(ot,J)),M.push(C.x,C.y,C.z),b.push(ot,J+.12);let it=g.clone().lerp(x,.3+.3*at).multiplyScalar(.8+.12*Be(ot*6,J*6,e));if(N.push(it.r,it.g,it.b),j<S&&W<_-1){let ft=j*_+W;A.push(ft,ft+1,ft+_,ft+1,ft+_+1,ft+_)}}let I=new oe;I.setAttribute("position",new Jt(M,3)),I.setAttribute("uv",new Jt(b,2)),I.setAttribute("color",new Jt(N,3)),I.setIndex(A),I.computeVertexNormals();let O=Hn(d),k=s[1];for(let j=0,W=O.attributes.position;j<W.count;j++)k=Math.max(k,W.getY(j));let z=t/(k-s[1]),et=new Pt().makeTranslation(...s).multiply(new Pt().makeScale(z,z,z)).multiply(new Pt().makeTranslation(-s[0],-s[1],-s[2]));O.applyMatrix4(et),I.applyMatrix4(et);for(let j=0,W=I.attributes.uv;j<W.count;j++)W.setXY(j,W.getX(j)*z,W.getY(j)*z);return O.computeBoundingSphere(),I.computeBoundingSphere(),{ribs:O,net:I}}function Ey(s){let t=s.attributes.position,e=s.attributes.normal,n=new Map;for(let r=0;r<t.count;r++){let o=`${t.getX(r).toFixed(5)},${t.getY(r).toFixed(5)},${t.getZ(r).toFixed(5)}`;(n.get(o)??n.set(o,[]).get(o)).push(r)}let i=Ie();for(let r of n.values())if(r.length>1){i.set(0,0,0);for(let o of r)i.x+=e.getX(o),i.y+=e.getY(o),i.z+=e.getZ(o);i.normalize();for(let o of r)e.setXYZ(o,i.x,i.y,i.z)}return s}function Ty(s,t,e,n,i,r){let o=new ds(1,e,n,0,Math.PI*2,0,i),a=o.attributes.position;for(let c=0;c<a.count;c++){let l=a.getX(c),h=a.getY(c),u=a.getZ(c),f=(1+.13*Be(l*1.6+t,h*1.6,u*1.6))*r(l,h,u,c);a.setXYZ(c,l*s[0]*f,h*s[1]*f,u*s[2]*f)}return o}function Ay(s,t,e,n,i,{wavelength:r=.09,relief:o=.05,fluor:a,waves:c=40,spread:l=.8}={}){let h=ei(e),u=2*Math.PI/r,f=[0,1,2].map(()=>{let R=h()*Math.PI;return Array.from({length:c},(L,S)=>{let M=R+l*Math.PI*((S+h())/c-.5);return[Math.cos(M)*u,Math.sin(M)*u,h()*Math.PI*2]})}),d=(R,L,S)=>{let M=0;for(let[b,A,N]of R)M+=Math.cos(b*L+A*S+N);return M*Math.sqrt(2/c)},g=(R,L,S)=>{let M=R*t[0],b=L*t[1],A=S*t[2],N=[R/t[0],L/t[1],S/t[2]],C=Math.hypot(...N),I=N.map(z=>(Math.abs(z)/C)**4),O=I[0]+I[1]+I[2],k=0;return I[0]>.01*O&&(k+=I[0]*d(f[0],b,A)),I[1]>.01*O&&(k+=I[1]*d(f[1],M,A)),I[2]>.01*O&&(k+=I[2]*d(f[2],M,b)),k/Math.sqrt(I[0]*I[0]+I[1]*I[1]+I[2]*I[2])},x=R=>2*Kt(-.4,.4,R)-1,m=[],p=Ty(t,e,360,120,1.95,(R,L,S,M)=>(m[M]=g(R,L,S),1+o*x(m[M])));p.translate(...s),p.computeVertexNormals(),Ey(p);let y=new Et(n),v=new Et(i),_=ko(a),w=R=>kn((R.y-s[1])/t[1]/(1+o),0,1),T=R=>.5+.5*x(m[R]);return mr(p,(R,L)=>{let S=T(L),M=w(R),b=.86+.28*Be(R.x*2.4+e,R.y*2.4,R.z*2.4)+.1*Be(R.x*9,R.y*9,R.z*9);return v.clone().lerp(y,Kt(.3,.85,S)).multiplyScalar((.45+.5*Kt(0,.35,M))*b*(.8+.2*Kt(0,.35,S)))}),xu(p,(R,L)=>_.clone().multiplyScalar((1-Kt(.25,.65,T(L)))*(.4+.6*w(R)))),p.setAttribute("wall",new Jt(m,1)),p}function Ry(s,t,e,n,i,{cell:r=.11,relief:o=.05,fluor:a}={}){let c=(t[0]+t[2])/2,l=(y,v,_,w)=>{let T=Math.sin(y*127.1+v*311.7+_*74.7+w*53.3+e)*43758.5453;return T-Math.floor(T)},h=(y,v,_)=>{let w=y*c/r,T=v*c/r,R=_*c/r,L=Math.floor(w),S=Math.floor(T),M=Math.floor(R),b=9,A=9;for(let N=-1;N<=1;N++)for(let C=-1;C<=1;C++)for(let I=-1;I<=1;I++){let O=L+N,k=S+C,z=M+I,et=O+.15+.7*l(O,k,z,0)-w,j=k+.15+.7*l(O,k,z,1)-T,W=z+.15+.7*l(O,k,z,2)-R,tt=et*et+j*j+W*W;tt<b?(A=b,b=tt):tt<A&&(A=tt)}return b=Math.sqrt(b),2*b/(b+Math.sqrt(A))},u=y=>-.8*(1-Kt(.05,.64,y))+.4*Math.exp(-(((y-.78)/.12)**2))-.18*Kt(.84,1,y),f=[],d=Ty(t,e,440,130,1.95,(y,v,_,w)=>(f[w]=h(y,v,_),1+o*u(f[w])));d.translate(...s),d.computeVertexNormals(),Ey(d);let g=new Et(n),x=new Et(i),m=ko(a),p=y=>kn((y.y-s[1])/t[1],0,1);return mr(d,(y,v)=>{let _=f[v],w=.86+.28*Be(y.x*2.4+e,y.y*2.4,y.z*2.4)+.1*Be(y.x*9,y.y*9,y.z*9);return x.clone().lerp(g,Kt(.58,.74,_)).multiplyScalar((.62+.3*p(y))*w*(.75+.25*Kt(0,.4,_))*(1-.35*Kt(.86,1,_)))}),xu(d,(y,v)=>m.clone().multiplyScalar((1-Kt(.48,.68,f[v]))*(.5+.5*p(y))))}function om({mouth:s,disc:t,ring:e,tentacle:n,column:i},{disc:r,ring:o}={},{sides:a=16,tentacles:c=20}={}){let l=[],h=[],u=[],f=[],[d,g,x,m,p]=[s,t,e,n,i].map(b=>new Et(b)),y=ko(r),v=ko(o),_=(b,A,N,C,I=qw)=>(l.push(b,A,N),h.push(C.r,C.g,C.b),u.push(I.r,I.g,I.b),l.length/3-1),w=[[.62,-.35,p.clone().multiplyScalar(.3)],[.58,.35,p.clone().multiplyScalar(.65)],[.7,.8,p],[.8,.96,x,v],[.7,.92,x,v],[.52,.88,g,y],[.24,.86,g.clone().lerp(d,.35),y],[.1,.9,d,v]];for(let[b,A,N,C]of w)for(let I=0;I<=a;I++){let O=I/a*Math.PI*2;_(Math.cos(O)*b,A,Math.sin(O)*b,N,C)}let T=_(0,.86,0,d.clone().multiplyScalar(.5),v);for(let b=0;b<w.length-1;b++)for(let A=0;A<a;A++){let N=b*(a+1)+A,C=N+a+1;f.push(N,C,N+1,N+1,C,C+1)}let R=(w.length-1)*(a+1);for(let b=0;b<a;b++)f.push(T,R+b+1,R+b);let L=m.clone().multiplyScalar(.85),S=m.clone().lerp(new Et(1,1,1),.25);for(let b=0;b<2;b++)for(let A=0;A<c;A++){let N=(A+b*.5)/c*Math.PI*2,C=.065,I=(b?.3:.24)*(.8+.4*Math.abs(Math.sin(A*12.9898+b*4.1))),O=b?.03:.14,k=.76,z=v.clone().multiplyScalar(.4),et=(it,ft,bt,St)=>_(Math.cos(N+it)*ft,bt,Math.sin(N+it)*ft,St,z),j=k+I,W=et(-C,k,.95,L),tt=et(C,k,.95,L),at=et(-C*.85,k+I*.6,.96+O*.7,m),st=et(C*.85,k+I*.6,.96+O*.7,m),ot=et(-C*.45,j,.95+O,S),J=et(C*.45,j,.95+O,S);f.push(W,at,tt,tt,at,st,at,ot,st,st,ot,J)}let M=new oe;return M.setAttribute("position",new Jt(l,3)),M.setAttribute("color",new Jt(h,3)),M.setAttribute("fluor",new Jt(u,3)),M.setIndex(f),M.computeVertexNormals(),M}function gr(s,t,e,n,i,{yaw:r=0,tilt:o=0,span:a=3,fluor:c}={}){let l=ei(e),h=l()*6,u=new Et(n),f=new Et(i),d=ko(c),g=28,x=88,m=Ie(Math.sin(r),0,Math.cos(r)),p=Ie(Math.cos(r),0,-Math.sin(r)),y=Ie(...s).addScaledVector(m,-t*.42),v=t*.42,_=[],w=[],T=[],R=[],L=C=>t*(1+.1*Math.sin(C*3.1+h)+.05*Math.sin(C*7.3-h))*Math.pow(Math.cos(C/a*Math.PI),.45),S=(C,I,O)=>{_.push(C.x,C.y,C.z),w.push(I.r,I.g,I.b),T.push(O.r,O.g,O.b)};for(let C of[1,-1])for(let I=0;I<=g;I++)for(let O=0;O<=x;O++){let k=(O/x-.5)*a,z=I/g,et=L(k)*z,j=t*(.022*(1-z)+.008*(1-z*z)+.005),W=t*(.04*z*z+.05*z*z*Math.sin(2*k+h)+.03*z*Math.sin(5*k-h)+.035*z*z*z*Math.sin(9*k+h*1.7)+.04*Kt(.7,1,z)+.1*z*k/a)+C*j*.5,tt=y.clone().addScaledVector(p,v*2*k/a).add(Ie(Math.sin(r+k*.6)*et,W,Math.cos(r+k*.6)*et)),at=Kt(.86,1,z),st=Be(tt.x*25,tt.y*25,tt.z*25),ot=Math.sin(z*t*95+2.5*Be(k*2,z*3,e)),J=Math.sin(k*L(k)*z*160+3*Be(z*4,k,e)),it=.55+.45*Kt(0,.25,z);S(tt,C>0?u.clone().lerp(f,at*.8+.1*Math.max(0,ot)*z).multiplyScalar((.78+.14*z+.06*st+.08*ot+.05*J)*(.85+.3*Be(tt.x*4+e,tt.y*4,tt.z*4))*it):u.clone().lerp(f,.25).multiplyScalar((.45+.12*z)*it),d.clone().multiplyScalar(C>0?(.25+.75*at)*(.8+.2*ot):.05))}let M=x+1,b=(g+1)*M,A=(C,I)=>C*M+I;for(let C=0;C<g;C++)for(let I=0;I<x;I++){let O=A(C,I);R.push(O,O+M,O+1,O+1,O+M,O+M+1,b+O,b+O+1,b+O+M,b+O+1,b+O+M+1,b+O+M)}for(let C=0;C<x;C++){let I=A(g,C),O=b+I;R.push(I,O,I+1,I+1,O,O+1)}for(let C=0;C<g;C++){let I=A(C,0),O=b+I;R.push(I,O,I+M,I+M,O,O+M),I=A(C,x),O=b+I,R.push(I,I+M,O,I+M,O+M,O)}let N=new oe;return N.setAttribute("position",new Jt(_,3)),N.setAttribute("color",new Jt(w,3)),N.setAttribute("fluor",new Jt(T,3)),N.setIndex(R),o&&N.applyMatrix4(new Pt().makeTranslation(y.x,y.y,y.z).multiply(new Pt().makeRotationAxis(Ie(Math.cos(r),0,-Math.sin(r)),-o)).multiply(new Pt().makeTranslation(-y.x,-y.y,-y.z))),N.computeVertexNormals(),N}var Cn=(s=0,t=0,e=0)=>new B(s,t,e),kt=s=>Number(s).toFixed(5),$w={part:1,finRay:2};function hm(s,t,e=()=>[0,0]){let n=s.attributes.position.count,i=new Float32Array(n*2);for(let r=0;r<n;r++)i.set(e(r),r*2);return s.setAttribute("part",new Jt(new Float32Array(n).fill(t),1)),s.setAttribute("finRay",new Jt(i,2)),s}function Yw(s){let t=Object.fromEntries(Object.entries($w).map(([n,i])=>[n,{size:i,data:[]}]));for(let n of s)for(let[i,r]of Object.entries(t))r.data.push(...n.attributes[i].array);let e=Hn(s);for(let[n,i]of Object.entries(t))e.setAttribute(n,new Jt(i.data,i.size));return e}var Oy=.54,xi=[0,.05,.12,.2,.3,.42,.55,.68,.8,.9,1],_i={clown:{len:.98,back:[.007,.112,.188,.236,.256,.25,.226,.188,.146,.112,.088],belly:[.005,.078,.14,.196,.23,.236,.218,.18,.138,.1,.08],half:[.004,.04,.058,.066,.069,.067,.06,.05,.039,.03,.023],snout:2,eye:{u:.135,v:.36,r:.033,pupil:.52},scales:[70,32,.035],cheek:.22,veil:[.92,.72,.84],mouth:{a:1.86,corner:.04,tilt:.12},gill:[.215,.09],line:{at:.48,top:.21,bend:.9,to:.64},dorsal:{from:.195,to:.875,sink:.016,rays:26,spines:.5,reach:[.03,.07,.08,.074,.038,.1,.124,.118,.06]},anal:{from:.605,to:.895,sink:.013,rays:14,spines:.16,reach:[.03,.082,.104,.104,.06]},caudal:{rays:15,margin:[[-.54,.15,0],[-.61,.19,0],[-.668,.172,0],[-.7,.1,0],[-.71,0,0],[-.7,-.098,0],[-.668,-.17,0],[-.61,-.186,0],[-.54,-.146,0]]},pectoral:{rays:17,base:[[.262,.3],[.29,0],[.318,-.3]],tip:[[.34,.04,.1],[.4,.026,.124],[.452,-.02,.134],[.48,-.086,.128],[.468,-.15,.11],[.42,-.186,.088],[.36,-.17,.066]]},pelvic:{rays:6,base:[[.365,-.88],[.4,-.98]],tip:[[.42,-.3,.04],[.47,-.36,.048],[.522,-.382,.048],[.556,-.35,.038],[.548,-.31,.03]]}},chromis:{len:.82,back:[.016,.08,.14,.172,.184,.182,.17,.144,.11,.082,.058],belly:[.012,.058,.116,.156,.172,.172,.16,.13,.096,.072,.052],half:[.005,.027,.035,.038,.039,.037,.033,.027,.019,.014,.01],snout:1.6,eye:{u:.115,v:.34,r:.036,pupil:.6},scales:[30,14,.11],cheek:.11,veil:[.55,.2,.6],mouth:{a:1.7,corner:.058,tilt:.14},gill:[.2,.08],line:{at:.45,top:.2,bend:.8,to:.66},dorsal:{from:.2,to:.815,sink:.011,rays:23,spines:.56,reach:[.03,.062,.062,.062,.062,.07,.086,.058,.018]},anal:{from:.575,to:.83,sink:.01,rays:12,spines:.18,reach:[.028,.066,.078,.058,.018]},caudal:{rays:17,margin:[[-.6,.204,0],[-.522,.15,0],[-.446,.096,0],[-.384,.046,0],[-.356,0,0],[-.384,-.045,0],[-.446,-.094,0],[-.522,-.148,0],[-.6,-.202,0]]},pectoral:{rays:18,base:[[.252,.3],[.285,0],[.318,-.3]],tip:[[.35,.016,.066],[.418,-.024,.082],[.46,-.094,.078],[.428,-.144,.056],[.36,-.13,.04]]},pelvic:{rays:6,base:[[.345,-.88],[.38,-.98]],tip:[[.42,-.215,.026],[.49,-.24,.03],[.54,-.214,.02]]}},anthias:{len:1.14,back:[.012,.05,.096,.144,.18,.192,.182,.154,.116,.08,.048],belly:[.016,.066,.114,.152,.176,.18,.166,.134,.096,.066,.044],half:[.006,.03,.047,.056,.06,.059,.052,.04,.029,.019,.012],snout:2,eye:{u:.11,v:.38,r:.037,pupil:.52},scales:[56,22,.1],cheek:.08,veil:[.7,.22,.7],mouth:{a:1.42,corner:.088,tilt:.52},gill:[.2,.085],line:{at:.45,top:.22,bend:1,to:.97},dorsal:{from:.175,to:.865,sink:.012,rays:26,spines:.4,reach:[.044,.072,.078,.074,.072,.082,.092,.068,.024]},anal:{from:.64,to:.855,sink:.011,rays:10,spines:.26,reach:[.034,.082,.094,.07,.024]},caudal:{rays:17,margin:[[-1,.236,0],[-.86,.176,0],[-.782,.116,0],[-.724,.058,0],[-.706,0,0],[-.724,-.056,0],[-.782,-.114,0],[-.86,-.174,0],[-1,-.234,0]]},pectoral:{rays:17,base:[[.248,.3],[.282,0],[.316,-.3]],tip:[[.348,.02,.074],[.416,-.026,.092],[.462,-.106,.088],[.428,-.166,.066],[.356,-.148,.046]]},pelvic:{rays:6,base:[[.34,-.88],[.375,-.98]],tip:[[.43,-.236,.03],[.51,-.262,.034],[.566,-.228,.022]]}}},As=(s,t)=>Oy-t*_i[s].len;function Cy(s,t,e){let n=xi.length-1;return t===0?e*(s[1]-s[0])/xi[1]:t===n?(s[n]-s[n-1])/(xi[n]-xi[n-1]):(s[t+1]-s[t-1])/(xi[t+1]-xi[t-1])}function am(s,t,e=3){let n=1;for(;n<xi.length-1&&xi[n]<t;)n++;let i=xi[n]-xi[n-1],r=(t-xi[n-1])/i,o=r*r,a=o*r;return(2*a-3*o+1)*s[n-1]+(a-2*o+r)*i*Cy(s,n-1,e)+(3*o-2*a)*s[n]+(a-o)*i*Cy(s,n,e)}function um(s,t){let e=_i[s];return t=Math.max(0,Math.min(1,t)),{top:am(e.back,t,e.snout),bottom:am(e.belly,t,e.snout),half:am(e.half,t,e.snout)}}var Uy=(s,t)=>{let e=_i[s].mouth;return e.a-e.tilt*(1-Math.min(1,t/e.corner))};function yi(s,t,e,n=Cn()){let i=_i[s],r=um(s,t),o=Math.cos(e),a=Math.abs(Math.sin(e)),c=Math.min(e,2*Math.PI-e),l=.95+.48*Math.pow(Math.max(0,o),1.6)+.4*Math.pow(Math.max(0,-o),1.6),h=1-Kt(i.gill[0]-.03,i.gill[0]+i.gill[1],t),u=1+i.cheek*Math.exp(-(((t-.155)/.072)**2))*(.5-o*.5),{corner:f}=i.mouth,d=c-Uy(s,t),g=1-.015*Math.exp(-((d/.045)**2))*(1-Kt(f*.75,f,t)),x=i.gill[0]+i.gill[1]*Math.sin(c),m=1-.026*Kt(x-.004,x+.012,t)*(1-Kt(x+.012,x+.12,t))*Kt(.35,.7,c)*(1-Kt(2.45,2.85,c)),p=g*m,y=r.half*u*(Math.pow(a,l)*(1-h)+Jw(o)*h)*Math.sign(Math.sin(e))*p;return n.set(As(s,t),(o>=0?o*r.top:o*r.bottom)*p,y)}function Jw(s){let t=s>0?4:2.6;return Math.pow(Math.max(0,1-Math.pow(Math.abs(s),t)),1/t)*(1-.36*Kt(.3,.95,s)-.22*Kt(.3,.9,-s))}var Iy=(s,t,e,n)=>{let i=yi(s,t,Math.acos(e));return[i.x,i.y,n*Math.abs(i.z)]},Fy={sides:48,rings:72,pleats:4,steps:1},Kw={sides:30,rings:44,pleats:2,steps:.6};function Py(s,t,e){let n=e/2,i=_i[s].mouth.a,r=Math.round(i/Math.PI*n),o=a=>a<=r?i*a/r:i+(Math.PI-i)*(a-r)/(n-r);return t<=n?o(t):2*Math.PI-o(e-t)}function cm(s,t,e,n=96){let i=0,r=yi(s,t,0),o=Cn();for(let a=1;a<=n;a++)yi(s,t,e*a/n,o),i+=o.distanceTo(r),r.copy(o);return i}var Ly=(s,t,e)=>cm(s,t,e)/cm(s,t,Math.PI);function Zw(s,{sides:t,rings:e}){let n=[],i=[],r=[],o=Cn(),a=Cn();for(let d=0;d<=e;d++){let g=Math.pow(d/e,1.24),x=[0];yi(s,g,0,a);for(let p=1;p<=t;p++)yi(s,g,Py(s,p,t),o),x.push(x[p-1]+o.distanceTo(a)),a.copy(o);let m=Math.max(x[t>>1],1e-6);for(let p=0;p<=t;p++)if(yi(s,g,Py(s,p,t),o),n.push(o.x,o.y,o.z),i.push(g,p<=t>>1?x[p]/m:(x[t]-x[p])/m),d<e&&p<t){let y=d*(t+1)+p;r.push(y,y+t+1,y+1,y+1,y+t+1,y+t+2)}}let c=yi(s,0,Uy(s,0)).y;for(let[d,g,x]of[[0,0,!1],[e,1,!0]]){let m=n.length/3;n.push(As(s,g),g?0:c,0),i.push(g,.5);for(let p=0;p<t;p++){let y=d*(t+1)+p,v=y+1;r.push(...x?[m,v,y]:[m,y,v])}}let l=new oe;l.setAttribute("position",new Jt(n,3)),l.setAttribute("uv",new Jt(i,2)),l.setIndex(r),l.computeVertexNormals();let h=l.attributes.normal,u=Cn(),f=Cn();for(let d=0;d<=e;d++){let g=d*(t+1),x=g+t;u.fromBufferAttribute(h,g).add(f.fromBufferAttribute(h,x)).normalize(),h.setXYZ(g,u.x,u.y,u.z),h.setXYZ(x,u.x,u.y,u.z)}return hm(l,0)}function hc(s,t,e,{rays:n,spines:i=0,notch:r=.006,cup:o=0,steps:a=6},{pleats:c,steps:l}){let h=Math.max(3,Math.round(a*l)),u=new eo(s.map(N=>Cn(...N))),f=new eo(t.map(N=>Cn(...N))),d=f.getLength(),g=(n-1)*c,x=.06*d/n,m=.018*d,p=n*.37,y=o*d,v=[],_=[],w=[],T=[],R=Cn(),L=Cn(),S=Cn(),M=Cn(),b=Cn();for(let N=0;N<=g;N++){let C=N/g,I=C*(n-1),O=C<i?1:0,k=Math.pow(Math.sin(Math.PI*(I%1)),1.5);u.getPoint(C,R),f.getPoint(C,L),u.getTangent(C,M),b.subVectors(L,R).cross(M).normalize();let z=1-(O?.04:r)*k,et=x*Math.cos(Math.PI*I)+m*Math.sin(Math.PI*2*(2.3*C)+p)+y*Math.sin(Math.PI*C);for(let j=0;j<=h;j++){let W=j/h;if(S.lerpVectors(R,L,W*z).addScaledVector(b,et*W*W),v.push(S.x,S.y,S.z),_.push(C,W),w.push(I,O),N<g&&j<h){let tt=N*(h+1)+j;T.push(tt,tt+1,tt+h+1,tt+1,tt+h+2,tt+h+1)}}}let A=new oe;return A.setAttribute("position",new Jt(v,3)),A.setAttribute("uv",new Jt(_,2)),A.setIndex(T),A.computeVertexNormals(),hm(A,e,N=>[w[N*2],w[N*2+1]])}function Ny(s,{from:t,to:e,sink:n,reach:i},r){let o=[],a=[],c=i.length-1;for(let l=0;l<=c;l++){let h=t+(e-t)*l/c,u=um(s,h),f=As(s,h),d=r?u.top:-u.bottom;o.push([f,d-(r?n:-n),0]),a.push([f,d+(r?i[l]:-i[l]),0])}return[o,a]}var jw=s=>{let t=um(s,1),e=[];for(let n=0;n<=8;n++){let i=n/8;e.push([As(s,1)+.024*Math.sin(Math.PI*i),t.top+(-t.bottom-t.top)*i,0])}return e};function Qw(s,t){let e=_i[s],{u:n,v:i,r,pupil:o}=e.eye,a=Math.acos(i),c=24,l=yi(s,n,a),h=yi(s,n+.002,a).sub(l),u=yi(s,n,a+.002).sub(l),f=u.clone().cross(h).normalize();f.z<0&&f.negate();let d=[0,.12,.24,.34,o-.06,o,o+.06,.7,.8,.9,1,1.1],g=u.length()/.002,x=w=>.03+.07*Math.sqrt(Math.max(0,o*o-w*w))/o-.25*Kt(1,1.1,w),m=[],p=[],y=[],v=Cn();for(let w=0;w<d.length;w++)for(let T=0;T<=c;T++){let R=T/c*Math.PI*2,L=Math.cos(R)*d[w],S=Math.sin(R)*d[w];if(yi(s,n-L*r/e.len,a-S*r/g,v).addScaledVector(f,x(d[w])*r),m.push(v.x,v.y,t*v.z),p.push(L,S),w<d.length-1&&T<c){let M=w*(c+1)+T,b=M+c+1;y.push(...t>0?[M,b,M+1,M+1,b,b+1]:[M,M+1,b,M+1,b+1,b])}}let _=new oe;_.setAttribute("position",new Jt(m,3)),_.setAttribute("uv",new Jt(p,2)),_.setIndex(y),_.computeVertexNormals();for(let w=0;w<=c;w++)_.attributes.normal.setXYZ(w,f.x,f.y,t*f.z);return hm(_,4)}function tE(s="clown",t=Fy){let e=_i[s],n=[Zw(s,t)];n.push(hc(...Ny(s,e.dorsal,!0),1,e.dorsal,t)),n.push(hc(...Ny(s,e.anal,!1),1,e.anal,t)),n.push(hc(jw(s),e.caudal.margin,1,e.caudal,t));for(let i of[-1,1])n.push(hc(e.pectoral.base.map(([r,o])=>Iy(s,r,o,i)),e.pectoral.tip.map(([r,o,a])=>[As(s,r),o,i*a]),2,{rays:e.pectoral.rays,cup:.07,steps:5},t)),n.push(hc(e.pelvic.base.map(([r,o])=>Iy(s,r,o,i)),e.pelvic.tip.map(([r,o,a])=>[As(s,r),o,i*a]),3,{rays:e.pelvic.rays,spines:.12,cup:.05,steps:4},t)),n.push(Qw(s,i));return Yw(n)}var eE={clown:`
    // Orange from xanthophores across the whole flank, deeper and redder on the head and
    // along the back, paling a little toward the belly.
    vec3 skin=mix(vec3(.46,.085,.018),vec3(.80,.215,.034),smoothstep(.04,.42,band));
    skin=mix(skin,vec3(.86,.320,.080),smoothstep(.66,.98,band));
    skin=mix(skin,skin*vec3(.92,.80,.70),(1.-smoothstep(.04,.20,u))*.6);
    // Three bars, in the rostro-caudal order a settling juvenile grows them: the head bar
    // behind the eye leaning forward at the throat, the trunk bar with the forward wedge
    // that marks percula, the peduncle bar. The white is a guanine iridophore plate and
    // the black edge is the melanophore band those iridophores position, so the two are
    // one feature and are drawn from one signed distance. Neither edge is ruled: the
    // melanophores stop cell by cell, so both borders wander a little.
    float wander=(fishNoise(vec2(u*30.,band*7.)+vTrim.x*11.)-.5)*.002;
    // The head bar is a crescent that follows the gill cover, bowed back at mid-flank; the
    // trunk bar's wedge is a modest forward point, not an S.
    float b1=abs(u-(.212+.044*sin(3.1416*band)-.020*band))-.040;
    float b2=abs(u-(.512-.058*exp(-pow((band-.50)/.26,2.))))-.056;
    float d=min(min(b1,b2),abs(u-.872)-.030)+wander;
    // percula carries thick black borders where ocellaris has a hairline or none at all,
    // and the black broadens with age: the big female in a group is the blackest fish.
    float edge=.008+.012*band+.013*vTrim.x+(fishNoise(vec2(u*9.,band*3.5)+3.1)-.5)*.018,aa=max(fwidth(d),.0012);
    float white=1.-smoothstep(-aa,aa,d);
    skin=mix(skin,vec3(.010,.011,.014),1.-smoothstep(edge-aa,edge+aa*1.5,d));
    // Living tissue under a thin white plate: a faint warmth comes through it toward the
    // middle of each bar and a cool blue-white at its rim.
    skin=mix(skin,mix(vec3(.72,.75,.79),vec3(.78,.73,.68),smoothstep(-.012,-.040,d)*.50),white);
    silver=white;`,chromis:`
    // A blue-green chromis is a pale fish: a faint apple-green over the back washing out
    // to silver-white at the belly, with what blue it has held in the peduncle and in the
    // iridophore flare rather than in the base coat. Measured reflectance for the species
    // carries nothing above green \u2014 no yellow, no orange, no red \u2014 so the whole coat is
    // built from green and cyan over a silver belly. Most of what the eye takes for its
    // colour is the water, mirrored in the platelets (SHEEN), which is how a shoal of them
    // all but vanishes against open water.
    vec3 skin=mix(vec3(.100,.270,.200),vec3(.260,.500,.360),smoothstep(.04,.34,band));
    skin=mix(skin,vec3(.560,.620,.610),smoothstep(.52,.94,band));
    skin=mix(skin,vec3(.130,.330,.400),smoothstep(.70,1.,u)*.55);
    // A pair of turquoise lines runs from the upper lip to the front of the orbit.
    skin=mix(skin,vec3(.18,.58,.62),exp(-pow((band-(.30+1.5*u))/.030,2.))*(1.-smoothstep(.04,.11,u))*.6);
    // The solid black axil is Chromis atripectoralis, sold beside this fish and mistaken
    // for it; on viridis the upper pectoral base only carries scattered black dots, and
    // even those show solely when the fin swings forward.
    skin*=1.-.13*exp(-pow((u-.292)/.032,2.)-pow((band-.44)/.070,2.));
    // One aggregation runs from green through to blue, and the same fish shifts as it
    // turns, so the per-animal constant only picks where in that range it sits.
    skin=mix(skin,skin*vec3(.60,.94,1.34),vTrim.x*.52);
    // The nesting male goes yellowish while he tends his patch of rubble.
    skin=mix(skin,skin*vec3(1.55,1.14,.40),vTrim.y*.70);
    silver=.70+.30*smoothstep(.45,.85,band);`,anthias:`
    // Golden orange, deepest along the back and paling to a peach-yellow belly, with the
    // lavender wash a live sea goldie carries over its cheek and throat.
    vec3 skin=mix(vec3(.62,.170,.070),vec3(.84,.320,.110),smoothstep(.05,.40,band));
    skin=mix(skin,vec3(.86,.480,.280),smoothstep(.56,.96,band));
    skin=mix(skin,vec3(.62,.36,.46),smoothstep(.40,.80,band)*(1.-smoothstep(.10,.26,u))*.45);
    // The species character, and it is not a violet bar: an orange stripe edged in violet
    // running diagonally from below the eye down to the pectoral-fin base.
    float line=(band-(.40+2.2*(u-.12)))/.050;
    float stripe=exp(-line*line)*smoothstep(.10,.13,u)*(1.-smoothstep(.22,.27,u));
    // The terminal male: a violet-magenta head and peduncle over a rose-orange flank. The
    // pale square patch behind the pectoral belongs to P. pleurotaenia, not to this fish,
    // so it is deliberately absent; his one body mark is the red blotch on the pectoral fin.
    vec3 male=mix(vec3(.44,.130,.270),vec3(.68,.270,.200),smoothstep(.12,.50,u));
    male=mix(male,vec3(.50,.150,.250),smoothstep(.66,.96,u));
    skin=mix(skin,mix(male,male*vec3(1.18,.92,1.12),smoothstep(.54,1.,band)),vTrim.y);
    skin=mix(skin,vec3(.88,.380,.100),stripe*.85);
    skin=mix(skin,vec3(.42,.18,.56),stripe*min(1.,abs(line)));
    // Each scale of a sea goldie carries a yellow centre on a rosier rim, which is what
    // makes the flank read as a fine net at arm's length.
    skin=mix(skin,skin*vec3(1.08,1.14,.90),scaleCore*.45);
    silver=.30+.25*vTrim.y;`},nE={clown:`
    // Orange membrane with a heavy black margin on the median fins, a clear rim outside it,
    // and pelvics that are all but solid black.
    vec3 web=mix(vec3(.70,.160,.026),vec3(.86,.270,.050),span);
    float inner=.80+.05*(fishNoise(vec2(vRay.x*.7,3.))-.5);
    float black=smoothstep(inner,inner+.05,span)*(1.-smoothstep(.95,.975,span))*(1.-paired+pelvic);
    // The peduncle bar's black runs on across the base of the caudal, a third of the way out.
    black=max(black,tail*(1.-smoothstep(.18,.34,span)));
    black=max(black,pelvic*.82);
    web=mix(web,vec3(.011,.013,.017),black);
    web=mix(web,vec3(.66,.69,.72),smoothstep(.96,.99,span)*(1.-paired)*tail);
    // The trunk bar does not stop at the skin: it carries on up the soft dorsal and down
    // the anal, which is why those two fins look notched white on a photograph.
    float notchWhite=(1.-tail)*(1.-paired)*(1.-smoothstep(.040,.056,abs(axial-.510)))*(1.-smoothstep(.18,.40,span));
    web=mix(web,vec3(.72,.75,.79),notchWhite);
    ink=black*.92+notchWhite*.4;`,chromis:`
    // Hyaline fins the colour of the water it hovers in. Only the outer edges of the
    // caudal lobes take the livery; a blackish dorsal margin, or a caudal that ran out
    // into dark filaments, would make this C. atripectoralis instead.
    vec3 web=mix(vec3(.300,.480,.450),vec3(.520,.640,.620),span);
    float lobe=tail*smoothstep(.34,1.,span)*smoothstep(.34,.04,min(vSkinUv.x,1.-vSkinUv.x));
    web=mix(web,vec3(.160,.380,.420),lobe);
    ink=lobe*.20;`,anthias:`
    // Golden membrane on both sexes. The male carries it rose instead, and adds a dusky
    // blue anal, a red blotch on the pectoral and a violet edge along both lobes of the
    // lyre \u2014 the three marks that separate a terminal male from a big female.
    vec3 web=mix(vec3(.76,.280,.060),vec3(.86,.440,.110),smoothstep(.16,.82,span));
    web=mix(web,mix(vec3(.72,.200,.220),vec3(.42,.130,.320),smoothstep(.45,1.,span)),vTrim.y*(.50+.44*tail));
    web=mix(web,vec3(.150,.170,.380),vTrim.y*below*(1.-tail)*.55);
    // The blotch sits on the fin's upper rays, not across the whole blade.
    float blotch=vTrim.y*(paired-pelvic)*smoothstep(.22,.60,span)*(1.-smoothstep(.70,.95,span))*(1.-smoothstep(.35,.75,vSkinUv.x));
    web=mix(web,vec3(.66,.080,.060),blotch);
    ink=blotch*.45+vTrim.y*below*(1.-tail)*.25;`},iE={clown:"vec3(.020,.018,.016)+silver*vec3(.30,.32,.36)",chromis:"silver*vec3(.26,.42,.38)",anthias:"silver*vec3(.22,.12,.30)"},sE={clown:.6,chromis:1.3,anthias:1},rE={clown:"vec3 iris=vec3(.82,.360,.060),rim=vec3(.50,.100,.012);",chromis:"vec3 iris=vec3(.56,.66,.72),rim=vec3(.20,.40,.42);",anthias:"vec3 iris=vec3(.70,.400,.110),rim=mix(vec3(.44,.16,.46),vec3(.50,.10,.24),vTrim.y);"},Dy={clown:.04,chromis:.09,anthias:.05};function fm(s){let t=_i[s],e=t.eye,n=Math.acos(e.v),i=cm(s,e.u,Math.PI);return{eye:[e.u,Ly(s,e.u,n)],eyeR:[e.r/t.len,e.r/i],mouth:Ly(s,t.mouth.corner,t.mouth.a),arc:i}}function lm(s){let t=_i[s].mouth;return`(${kt(fm(s).mouth)}-${kt(t.tilt/Math.PI)}*(1.-min(1.,u/${kt(t.corner)})))`}function oE(s){let t=_i[s],e=fm(s),{at:n,top:i,bend:r,to:o}=t.line,[a,c]=e.eye,[l,h]=e.eyeR;return`
// The head's sensory canals open through rows of pores: under the orbit, over it, down
// the preopercle's edge and along the lower jaw. They are the finest structure a close
// look at a fish's face finds, and a smooth head has none. 1 at a pore's centre.
float fishPore(float across,float along,float spacing){
  float k=floor(along/spacing+.5),size=.004+.006*fishHash(vec2(k,spacing*7.));along-=spacing*k;
  return exp(-(across*across+along*along)/size);}
float fishPores(vec2 q){
  // In eye radii, so a pore is round whichever way the uv is stretched.
  vec2 o=(q-vec2(${kt(a)},${kt(c)}))/vec2(${kt(l)},${kt(h)});
  float r=length(o),angle=atan(o.y,o.x),p=0.;
  // Under the orbit from the snout side back to below its rear, and over it.
  p+=fishPore(r-1.55,angle*1.55,.48)*smoothstep(-.3,.3,o.y)*smoothstep(-.4,.2,.5-o.x);
  p+=fishPore(r-1.40,angle*1.40,.42)*smoothstep(.45,.75,-o.y/r)*smoothstep(-.2,.3,.3-o.x);
  // Down the preopercle and along the mandible.
  float u=q.x,band=q.y,pre=(u-${kt(t.gill[0])}+.070-.012*sin(3.1416*band))/${kt(l)};
  p+=fishPore(pre,band/${kt(h)},.55)*smoothstep(.40,.50,band)*(1.-smoothstep(.80,.88,band));
  float jaw=(band-${lm(s)}-.07)/${kt(h)};
  p+=fishPore(jaw,u/${kt(l)},.50)*smoothstep(.01,.03,u)*(1.-smoothstep(${kt(t.mouth.corner*1.5)},${kt(t.mouth.corner*2.2)},u));
  return min(p,1.);
}
float fishRelief(vec2 q){
  float u=q.x,band=q.y,h=0.;
  float edge=${kt(t.gill[0])}+${kt(t.gill[1])}*sin(3.1416*clamp(band,0.,1.));
  float opening=smoothstep(.10,.24,band)*(1.-smoothstep(.80,.93,band));
  h+=.0018*smoothstep(edge-.07,edge-.002,u)*(1.-smoothstep(edge-.002,edge+.008,u))*opening;
  h-=.0012*exp(-pow((u-edge+.070-.012*sin(3.1416*band))/.006,2.))*opening*(1.-smoothstep(.55,.80,band));
  // The mouth is a slit between hard jaws, not a pair of lips. Above its corner the
  // maxilla's rounded end, a slip of bone under thin skin, is outlined from the cheek.
  float cleft=${lm(s)},jaw=u/${kt(t.mouth.corner)};
  h-=.0010*exp(-pow((band-cleft)/.007,2.))*(1.-smoothstep(.88,1.02,jaw));
  float slip=band-cleft+.060;
  h-=.0004*exp(-pow((jaw-1.10)/.07,2.))*smoothstep(-.012,0.,slip)*(1.-smoothstep(0.,.012,band-cleft));
  // The nostrils, two small pits in front of the eye. The eye itself needs no relief: it
  // sits flush under the head's transparent skin.
  vec2 o=(q-vec2(${kt(a)},${kt(c)}))/vec2(${kt(l)},${kt(h)}),n1=o-vec2(-1.75,-.30),n2=o-vec2(-2.45,-.10);
  h-=.0010*(exp(-dot(n1,n1)/.04)+exp(-dot(n2,n2)/.03));
  float line=exp(-pow((band-${kt(i)}-${kt(r)}*pow(u-${kt(n)},2.))/.010,2.))*smoothstep(edge,edge+.03,u)*(1.-smoothstep(${kt(o-.03)},${kt(o)},u));
  h+=${kt(8e-4*Math.min(1,t.scales[2]*4))}*line*(.4+.6*cos(6.2832*u*${kt(t.scales[0])}));
  return h;
}`}var aE=`
const float SCALE_R=.74;
vec3 fishScale(vec2 p){
  vec2 best=vec2(9.);float bestX=1e9,id=0.;
  float file=floor(p.y);
  for(int j=-1;j<=1;j++){
    float f=file+float(j),shift=mod(f,2.)*.5,col=floor(p.x-shift);
    for(int i=-1;i<=1;i++){
      vec2 c=vec2(col+float(i)+.5+shift,f+.5);
      // No two scales grow quite in line or quite the same size.
      float grow=fishHash(c+5.3);c+=(vec2(fishHash(c+3.7),fishHash(c+9.1))-.5)*.16;
      vec2 d=(p-c)/(SCALE_R*(.92+.16*grow));
      if(dot(d,d)<1.&&c.x<bestX){bestX=c.x;best=d;id=fishHash(c);}
    }
  }
  return vec3(best,id);
}
// A scale rises from its buried front to a rounded shoulder at its free margin.
float fishScaleHeight(vec2 d){return (.55+.45*d.x)*(1.-smoothstep(.74,1.,length(d)));}`,cE=`
float fishHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float fishNoise(vec2 p){vec2 i=floor(p),f=fract(p);f*=f*(3.-2.*f);
  return mix(mix(fishHash(i),fishHash(i+vec2(1,0)),f.x),mix(fishHash(i+vec2(0,1)),fishHash(i+vec2(1,1)),f.x),f.y);}`;function lE(s){let t=_i[s],[e,n,i]=t.scales,[r,o,a]=t.veil,c=fm(s),l=s==="clown"?[.05,.034]:s==="chromis"?[.024,.01]:[.03,.014];return hE(ii(new Ke({roughness:.38,metalness:0,side:Ce,transparent:!0,forceSinglePass:!0}),{key:`fish-${s}`,transmission:"fishTransmission",wrap:"fishWrap",specular:"fishSpecular*25.",vertex:`attribute float part;attribute vec2 finRay;attribute vec4 aFishTrim;attribute vec4 aFishGait;varying float vPart;varying vec3 vAnatomy;varying vec2 vSkinUv;varying vec2 vTrim;varying vec2 vRay;
      #define fishTrim aFishTrim
      #define fishGait aFishGait
      // The propulsive wave grows toward the tail, and a turn bends the whole body the same
      // way: a fish turns as a C, not as a rigid arrow swung about its middle.
      float fishFlex(float x) {float q=clamp((.30-x)/1.14,0.,1.);return (sin(fishTrim.x-q*3.7)*fishTrim.y+fishGait.z)*q*q;}
      float fishSlope(float x){float q=clamp((.30-x)/1.14,0.,1.);return -(2.*q*(fishTrim.y*sin(fishTrim.x-q*3.7)+fishGait.z)-3.7*q*q*fishTrim.y*cos(fishTrim.x-q*3.7))/1.14;}`,normal:"objectNormal=normalize(vec3(normal.x-fishSlope(position.x)*normal.z,normal.y,normal.z));",begin:`vPart=part;vAnatomy=position;vSkinUv=uv;vTrim=fishTrim.zw;vRay=finRay;
      transformed.z+=fishFlex(position.x);
      // A pectoral rows through an abduction\u2013adduction cycle rather than flapping: the
      // blade sweeps out and then back along the flank, so the stroke has a fore-aft part.
      if(part>1.5&&part<3.5){
        float hinge=clamp((.30-position.x)*3.4,0.,1.),row=sin(fishGait.x)*fishGait.y;
        transformed.z+=sign(position.z)*row*hinge*${kt(l[0])};
        transformed.x-=row*hinge*hinge*${kt(l[1])};
      }
      ${s==="anthias"?`// Both sexes carry the lyre and a prolonged third dorsal spine; on the terminal
      // male the lobe tips run out a little further and that spine stands about twice the
      // fin height, not the whips the species is often drawn with.
      if(part>.5&&part<1.5){
        if(position.x<${kt(As(s,1))}){float lobe=uv.y*uv.y*smoothstep(.12,.24,abs(position.y));transformed.x-=fishTrim.w*.12*lobe;transformed.y+=sign(position.y)*fishTrim.w*.035*lobe;}
        else if(position.y>.10){float spine=uv.y*uv.y*exp(-pow((uv.x-.150)/.034,2.));transformed.y+=(.045+.11*fishTrim.w)*spine;transformed.x-=.05*fishTrim.w*spine;}
      }`:""}`,fragment:`varying float vPart;varying vec3 vAnatomy;varying vec2 vSkinUv;varying vec2 vTrim;varying vec2 vRay;
      float fishTransmission=${kt(Dy[s])};float fishWrap=.4;vec3 fishSpecular=vec3(.02);float fishSilver=0.;vec3 fishScaleHit=vec3(0.,0.,.5);float fishFine=0.;vec2 fishScaleRate=vec2(1.);const vec2 fishGrain=vec2(480.,170.);
      ${cE}${aE}${oE(s)}`,color:`
      // The material is double sided for the fins; the body's inner face is never seen and
      // would otherwise be shaded under the outer one.
      if(vPart<.5&&!gl_FrontFacing)discard;
      float u=vSkinUv.x,band=vSkinUv.y,span=clamp(vSkinUv.y,0.,1.);
      // Scales are largest at mid-flank and shrink toward the back, the belly, the head and
      // the peduncle. They fade in behind the scaleless snout, stay faint over the small
      // embedded scales of the cheek and gill cover, and fade out once one falls under a pixel.
      vec2 scaleAt=vec2(${kt(e)}*(u+.025*sin(6.2832*u)),${kt(n)}*(band+.03*sin(6.2832*band)));
      fishScaleRate=vec2(${kt(e)}*(1.+.1571*cos(6.2832*u)),${kt(n)}*(1.+.1885*cos(6.2832*band)));
      // Each fine term is searched for only where it can show, which on a wallpaper is most
      // of the time nowhere: a fish a few hundred pixels long has no visible scale, pore or
      // grain, and skipping them is most of what the skin costs. fishFine falls from 1 to 0
      // as a hundredth of the body's length shrinks to a pixel.
      fishFine=1.-smoothstep(.0025,.007,max(fwidth(vSkinUv.x),fwidth(vSkinUv.y)));
      float scaleDetail=(1.-smoothstep(.22,.60,max(fwidth(scaleAt.x),fwidth(scaleAt.y))))*(.12+.88*smoothstep(${kt(t.gill[0]-.05)},${kt(t.gill[0]+t.gill[1]+.12)},u))*smoothstep(.07,.16,u)*smoothstep(.03,.12,band)*(1.-smoothstep(.93,.99,u));
      // A frugal frame (FISH_COARSE, eco) leaves the scales and the micro relief out at any
      // distance; the pigment pattern, the sheen and the fins carry the fish there.
      #ifdef FISH_COARSE
      scaleDetail=0.;fishFine=0.;
      #endif
      if(scaleDetail>0.)fishScaleHit=fishScale(scaleAt);
      float scaleCore=(1.-smoothstep(.10,.75,length(fishScaleHit.xy)))*scaleDetail;
      if(vPart<.5){
        float silver=0.;
        ${eE[s]}
        // Each scale's pigment cells were laid down on their own: a slightly different shade.
        // Close up the colour itself is grained, the chromatophores showing as specks.
        skin*=1.+(fishScaleHit.z-.5)*${kt(Math.min(.12,i*.6))}*scaleDetail;
        vec2 cells=vSkinUv*fishGrain*1.7;
        float speck=1.-smoothstep(.25,.7,max(fwidth(cells.x),fwidth(cells.y)));
        if(speck>0.)skin*=1.-.10*smoothstep(.62,.9,fishNoise(cells))*speck;
        // The mouth's cleft and the gill cover's margin are shaded cavities as well as
        // relief: the slit is dark inside, and the flank under the cover's edge is in its
        // shadow.
        float gill=${kt(t.gill[0])}+${kt(t.gill[1])}*sin(3.1416*span);
        skin*=1.-.10*smoothstep(gill-.004,gill+.004,u)*(1.-smoothstep(gill+.004,gill+.020,u))*smoothstep(.12,.26,band)*(1.-smoothstep(.78,.92,band));
        if(fishFine>0.)skin*=1.-.22*fishPores(vSkinUv)*fishFine;
        skin*=1.-.55*exp(-pow((band-${lm(s)})/.008,2.))*(1.-smoothstep(${kt(t.mouth.corner*.8)},${kt(t.mouth.corner)},u));
        // A scale's buried front is a shade darker than its exposed margin, and pigment
        // cells are never laid on evenly: a soft mottle, a little different on every fish.
        skin*=1.-${kt(.1*i)}*(1.-fishScaleHeight(fishScaleHit.xy))*scaleDetail;
        skin*=1.-${kt(.6*i)}*smoothstep(.70,.95,length(fishScaleHit.xy))*scaleDetail;
        skin*=.90+.20*fishNoise(vec2(u*23.,band*8.)+vTrim.x*17.);
        // Countershading, spread down the upper flank rather than drawn as a dark line along
        // the ridge, and a per-animal shift, so no two of a species read identical.
        skin*=1.-.20*(1.-smoothstep(0.,.32,band));
        skin*=vec3(.93+.14*vTrim.x,.96+.08*vTrim.x,1.03-.10*vTrim.x);
        diffuseColor.rgb=skin;
        fishSilver=silver*(.70+.60*fishScaleHit.z)*mix(1.,.6,scaleDetail*(1.-fishScaleHeight(fishScaleHit.xy)));
        fishTransmission=${kt(Dy[s])}*(1.+silver*${s==="clown"?"2.5":"0."});
      }else if(vPart<3.5){
        // Which fin this is. The three median fins are lofted from one sheet, so a caudal
        // is told from a dorsal by sitting behind the gap between the anal fin's last ray
        // and the front of the tail, and an anal from a dorsal by sitting below the spine.
        float tail=step(vAnatomy.x,${kt(As(s,1)+.06)}),below=step(vAnatomy.y,0.);
        float paired=step(1.5,vPart),pelvic=step(2.5,vPart),ink=0.;
        float axial=(${kt(Oy)}-vAnatomy.x)/${kt(t.len)};
        ${nE[s]}
        // The rays: bone splints in the membrane. A soft ray is jointed every few
        // millimetres and forks in its outer half; a spine is neither.
        float spine=step(.5,vRay.y),ray=abs(fract(vRay.x+.5)-.5);
        float fork=(1.-spine)*.16*smoothstep(.45,1.,span),aaRay=max(fwidth(vRay.x),.02);
        float rib=1.-smoothstep(.03,.03+aaRay*1.5,abs(ray-fork+.04*(fishNoise(vec2(vRay.x*7.,span*3.))-.5)));
        rib*=1.-(1.-spine)*.10*smoothstep(.80,.97,cos(span*${kt(Math.PI*2/.075)}))*step(.18,span);
        diffuseColor.rgb=web*(.94+.14*rib)*(.94+.12*vTrim.x);
        // The membrane between the splints is a couple of cell layers, clear enough to see
        // the water through; the rays and the melanin carry most of the opacity. Thickest
        // at the hinge, thinnest at the free margin, and the paired fins thinner again.
        float veil=(${kt(o)}+${kt(r-o)}*pow(1.-span,1.4))*(.78+.22*rib)*(paired>.5?.70:1.);
        // Toward the free edge the membrane thins to a film the rays outrun, so a fin has no
        // edge of its own: the web between the rays fades first, the rays last, each ray to
        // its own length, and the margin breaks up ray by ray instead of ending on a line.
        float tip=fishNoise(vec2(vRay.x*2.3,7.));
        float fade=1.-smoothstep(${kt(a)}+.10*tip,1.+.06*tip,span-.06*rib);
        ink*=1.-smoothstep(.93,1.,span);
        diffuseColor.a=max(veil*fade,ink);
        if(diffuseColor.a<.02)discard;
        // A fin is a film far thinner than light's scattering length in it, so what it
        // carries spreads all round it.
        fishTransmission=.85*(1.-.5*ink);fishWrap=.8;fishSpecular=vec3(.012);
      }else{
        vec2 e=vSkinUv;float r=length(e),angle=atan(e.y,e.x),pupil=${kt(t.eye.pupil)};
        ${rE[s]}
        // A fish's pupil fills most of the eye: the iris is only a narrow ring round it,
        // radially fibred, dusky at the pupil's margin and paling outward until, toward
        // the rim, the cornea is the head's own skin and the eye fades into it.
        float fibre=.55*fishNoise(vec2(angle*9.55,r*6.))+.45*fishNoise(vec2(angle*25.5,r*11.));
        vec3 eyeColor=iris*(.80+.30*fibre)*mix(.50,1.,smoothstep(pupil,pupil+.18,r));
        eyeColor*=1.-.35*smoothstep(.68,.85,fishNoise(e*14.+3.));
        eyeColor=mix(eyeColor,rim,smoothstep(.70,.94,r));
        diffuseColor.rgb=mix(vec3(.004,.005,.007),eyeColor,smoothstep(pupil-.02,pupil+.01,r));
        diffuseColor.a=1.-smoothstep(.86,1.02,r);
        fishTransmission=0.;fishSpecular=vec3(.035);
      }
    `,surfaceNormal:`
      {
        // The body's relief, as a bump on the shading normal: finite differences across
        // the analytic height field, carried to the screen through uv's own derivatives.
        float body=1.-step(.5,vPart);
        vec2 q=vSkinUv,du=vec2(.0012,0.);
        vec2 grad=vec2(0.);
        if(fishFine>0.&&body>.5){float h0=fishRelief(q);grad=vec2(fishRelief(q+du.xy)-h0,fishRelief(q+du.yx)-h0)/.0012*fishFine;}
        // Each scale's shoulder, and its own small tilt: the platelets of neighbouring
        // scales never face quite the same way, so a highlight breaks scale by scale.
        vec2 d=fishScaleHit.xy;float s0=fishScaleHeight(d);
        vec2 sgrad=vec2(fishScaleHeight(d+vec2(.02,0.))-s0,fishScaleHeight(d+vec2(0.,.02))-s0)/(.02*SCALE_R);
        // Skin is never a polished shell: a fine grain of cells and mucus breaks every
        // highlight up, fading out once it falls under a pixel.
        vec2 grain=q*fishGrain,dg=vec2(.35,0.);float grainFade=1.-smoothstep(.25,.7,max(fwidth(grain.x),fwidth(grain.y)));
        if(fishFine>0.&&grainFade>0.&&body>.5){float g0=fishNoise(grain);grad+=vec2(fishNoise(grain+dg.xy)-g0,fishNoise(grain+dg.yx)-g0)/.35*fishGrain*.00005*grainFade;}
        grad+=(sgrad*${kt(.0016*i)}+(vec2(fishHash(vec2(fishScaleHit.z,7.)),fishHash(vec2(fishScaleHit.z,3.)))-.5)*${kt(.012*i)})*fishScaleRate*scaleDetail;
        vec2 dh=vec2(dot(grad,dFdx(vSkinUv)),dot(grad,dFdy(vSkinUv)))*body;
        vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition),r1=cross(sy,normal),r2=cross(normal,sx);
        float det=dot(sx,r1)*faceDirection;
        if(body>.5&&abs(det)>1e-12)normal=normalize(abs(det)*normal-sign(det)*(dh.x*r1+dh.y*r2));
      }
      if(vPart<.5){
        float nv=abs(dot(normal,normalize(vViewPosition)));
        float flank=smoothstep(.06,.30,vSkinUv.y)*(1.-smoothstep(.70,.95,vSkinUv.y));
        // The platelets are a stack of thin films: their colour slides as the angle to the
        // eye changes, and every scale starts the slide from its own place.
        vec3 film=.5+.5*cos(6.2832*(${kt(sE[s])}*(1.-nv)+fishScaleHit.z*.18+vec3(0.,.33,.67)));
        float silver=fishSilver;
        fishSpecular=vec3(.012)+(${iE[s]})*mix(vec3(1.),film*1.6,.40)*(.35+.65*flank)*(.75+.5*vTrim.x);
        // Mucus over scales is wet; each scale's margin breaks it, and the dorsal ridge
        // and the belly keel stay a little rougher, or the back reads as a white stripe.
        roughnessFactor=.30-.10*fishSilver+.08*(1.-smoothstep(.12,.30,vSkinUv.x))+.20*(1.-smoothstep(.05,.26,vSkinUv.y))+.08*smoothstep(.78,1.,vSkinUv.y)
          +.10*scaleDetail*(1.-fishScaleHeight(fishScaleHit.xy))+.06*fishNoise(vSkinUv*vec2(60.,20.));
      }else if(vPart>3.5){
        // The lens is glass-smooth under the cornea; the iris round it is a touch softer.
        roughnessFactor=mix(.05,.40,smoothstep(${kt(t.eye.pupil-.02)},${kt(t.eye.pupil+.04)},length(vSkinUv)));
      }else{
        // A fin is a membrane stretched between round splints and the geometry pleats it;
        // each ray's own roundness is added here so a ray takes its own thin highlight.
        float ray=fract(vRay.x+.5)-.5;
        normal=normalize(normal+vec3(.20,.08,0.)*clamp(ray*6.,-1.,1.)*(1.-smoothstep(.05,.18,abs(ray))));
        roughnessFactor=.50;
      }
    `}))}function hE(s){let t=s.onBeforeCompile;return s.onBeforeCompile=(e,n)=>{t(e,n),e.fragmentShader=e.fragmentShader.replace("#include <lights_fragment_end>",`#include <lights_fragment_end>
      {float under=smoothstep(.15,-.85,inverseTransformDirection(normal,viewMatrix).y)*smoothstep(.8,4.,vReefWorld.y);
      reflectedLight.indirectDiffuse*=mix(vec3(1.),vec3(.30,.40,.62),under);
      reflectedLight.indirectSpecular*=1.-.5*under;}`)},s}var uE=.25;function dm(s,t){let e=[];for(let r of["clown","chromis","anthias"]){let o=t.fish.filter(f=>f.kind===r),a=lE(r),c=f=>{let d=tE(r,f),g=new Float32Array(o.length*4),x=new tn(g,4).setUsage(Da),m=new Float32Array(o.length*4),p=new tn(m,4).setUsage(Da);d.setAttribute("aFishTrim",x),d.setAttribute("aFishGait",p);let y=new On(d,a,o.length);return y.frustumCulled=!1,y.instanceMatrix.setUsage(Da),s.add(y),y.receiveShadow=!0,{data:g,attribute:x,gait:m,gaitAttribute:p,mesh:y}},l=c(Fy),h=c(Kw),u=Math.max(...o.map(f=>f.size));e.push({fish:o,...l,lods:[l,h],material:a,trim:o.map((f,d)=>[r==="clown"?f.size/u:(d*.6180339887+.31)%1,(r==="anthias"||r==="chromis")&&f.rank===0?1:0])})}let n=new be,i=new pn(0,0,0,"YZX");return{setQuality(r){let o=r==="eco";for(let{material:a}of e)!!a.defines?.FISH_COARSE!==o&&(a.defines=o?{FISH_COARSE:1}:{},a.needsUpdate=!0)},update(r){for(let o of e){let[a,c]=o.lods;a.mesh.count=c.mesh.count=0;for(let l=0;l<o.fish.length;l++){let h=o.fish[l],u=!r||h.size*r.projectionMatrix.elements[5]>uE*h.position.distanceTo(r.position)?a:c,f=u.mesh.count++;n.position.copy(h.position),n.scale.setScalar(h.size),i.set(h.roll,h.yaw,h.pitch),n.quaternion.setFromEuler(i),n.updateMatrix(),u.mesh.setMatrixAt(f,n.matrix),u.data.set([h.phase,h.tailAmplitude,...o.trim[l]],f*4),u.gait.set([h.pectoral,h.rowing,h.bend,0],f*4)}for(let{attribute:l,gaitAttribute:h,mesh:u}of o.lods)l.needsUpdate=!0,h.needsUpdate=!0,u.instanceMatrix.needsUpdate=!0}},groups:e}}var Ho=null,ns=0,uc=0;function on(s,t){if(Ho){let n=Math.max(0,Math.min(ns-1,(s+9.65)/19.3*(ns-1))),i=Math.max(0,Math.min(uc-1,(t+4.1)/10.2*(uc-1))),r=Math.min(ns-2,Math.floor(n)),o=Math.min(uc-2,Math.floor(i)),a=n-r,c=i-o;return(Ho[o*ns+r]*(1-a)+Ho[o*ns+r+1]*a)*(1-c)+(Ho[(o+1)*ns+r]*(1-a)+Ho[(o+1)*ns+r+1]*a)*c}let e=sc(s,t);for(let n of du){let i=((s-n[0])/n[3])**2+((t-n[2])/n[5])**2;i<1&&(e=Math.max(e,n[1]+n[4]*Math.sqrt(1-i)*.95))}return e}async function fE(){let s=await fetch(new URL("../assets/live-rock.bin",new URL("./upstream/scenes/reefscape/src/terrain.js",import.meta.url).href));if(!s.ok&&s.status!==0)throw new Error("Unable to load live-rock geometry.");let t=await fetch(new URL("../assets/rock-support.bin",new URL("./upstream/scenes/reefscape/src/terrain.js",import.meta.url).href));if(!t.ok&&t.status!==0)throw new Error("Unable to load attachment field.");let e=await t.arrayBuffer(),n=new Uint32Array(e,0,2);ns=n[0],uc=n[1],Ho=new Float32Array(e,8,ns*uc);let i=await s.arrayBuffer(),r=new Uint32Array(i,0,4),o=r[2],a=r[3];if(r[0]!==1380271430||r[1]!==1||i.byteLength<16+o*27+a*4)throw new Error("Invalid live-rock asset.");let c=new oe,l=16;return c.setAttribute("position",new re(new Float32Array(i,l,o*3),3)),l+=o*12,c.setAttribute("normal",new re(new Float32Array(i,l,o*3),3)),l+=o*12,c.setAttribute("surface",new re(new Uint8Array(i,l,o*3),3,!0)),l=Math.ceil((l+o*3)/4)*4,c.setIndex(new re(new Uint32Array(i,l,a),1)),c.computeBoundingSphere(),c}async function By(s){let t=ei(952),e=new Ys,[n,i,r,o]=await Promise.all([fE(),...["aragonite.png","live-rock-surface.png","live-rock-normal.png"].map(y=>e.loadAsync(new URL("../assets/"+y,new URL("./upstream/scenes/reefscape/src/terrain.js",import.meta.url).href).href))]);for(let y of[i,r,o])y.wrapS=y.wrapT=Mi,y.anisotropy=8;let a=ii(new Ke({roughness:.92,map:i}),{key:"tank-sand",vertex:"attribute float shade;varying float vShade;varying vec3 vBedNormal;",begin:"vShade=shade;",normal:"vBedNormal=normal;",fragment:"varying float vShade;varying vec3 vBedNormal;",map:`vec2 bed=vReefWorld.xz;
      float coarse=smoothstep(-.35,.55,sin(bed.x*.37+1.3*sin(bed.y*.52))*sin(bed.y*.61-bed.x*.18+.7));
      vec3 fineGrain=mix(texture2D(map,bed*.5).rgb,texture2D(map,bed*.21+.43).rgb,.55),coarseGrain=texture2D(map,bed*.27+.17).rgb;
      vec3 reefGrain=mix(fineGrain,coarseGrain,coarse*.8);
      float drift=sin(bed.x*.71+2.*sin(bed.y*.93))*sin(bed.y*.83+bed.x*.37)+.5*sin(bed.x*2.3-bed.y*1.7+sin(bed.y*2.9));
      // Two crossed wave sets, each bent by a slow warp, give the low hummocks of a bed
      // the pumps keep stirring rather than a ruled field of dune ripples.
      float warpA=bed.x*.83+1.7*sin(bed.y*.61),warpB=bed.y*1.37-bed.x*.29;
      float phase=dot(bed,vec2(.34,.94))*10.5+1.1*sin(warpA)+.6*sin(warpB),cross=dot(bed,vec2(.91,-.41))*7.3+.9*sin(warpB);
      vec2 dPhase=vec2(.34,.94)*10.5+1.1*cos(warpA)*vec2(.83,1.7*.61*cos(bed.y*.61))+.6*cos(warpB)*vec2(-.29,1.37),dCross=vec2(.91,-.41)*7.3+.9*cos(warpB)*vec2(-.29,1.37);
      float ripple=sin(phase)+.25*sin(2.*phase+.8)+.6*sin(cross);
      vec2 rippleSlope=.10*vShade*((cos(phase)+.5*cos(2.*phase+.8))*dPhase+.6*cos(cross)*dCross);`,color:`vec3 sand=mix(vec3(.36,.30,.22),vec3(.88,.80,.66),smoothstep(.40,.90,reefGrain.r));
      // Shell fragments are the brightest flat grains; each takes its own cream or blush.
      float shell=smoothstep(.86,.95,reefGrain.r),tone=fract(sin(dot(floor(bed*41.),vec2(12.99,78.23)))*43758.5);
      sand=mix(sand,mix(vec3(.80,.74,.66),vec3(.78,.62,.58),step(.7,tone)),shell*.85);
      sand*=mix(1.,.86+.2*tone,.5*(1.-shell));
      // The back pane's foot gathers detritus and shade, so the bed darkens into it.
      diffuseColor.rgb=sand*(.90+.08*drift)*(.90+.055*ripple)*(.95-.07*coarse)*vShade*mix(.2,1.,smoothstep(${es.back.toFixed(2)},${(es.back+2.6).toFixed(2)},vReefWorld.z));`,surfaceNormal:`vec2 grainSlope=reefGrain.gb*2.-1.;
      normal=normalize(mat3(viewMatrix)*normalize(normalize(vBedNormal)+vec3(grainSlope.x*.7-rippleSlope.x,0.,grainSlope.y*.7-rippleSlope.y)));`,recede:`smoothstep(${(es.back+3.4).toFixed(2)},${(es.back+.15).toFixed(2)},vReefWorld.z)`}),c=new bi(30,14,180,84);c.rotateX(-Math.PI/2),c.translate(0,0,1);let l=c.attributes.position,h=new Float32Array(l.count);for(let y=0;y<l.count;y++){let v=l.getX(y),_=l.getZ(y);l.setY(y,sc(v,_));let w=0;for(let T of du){let R=Math.max(0,Math.hypot((v-T[0])/T[3],(_-T[2])/T[5])-1)*Math.min(T[3],T[5]);w=Math.max(w,Math.exp(-R*R/(.55*T[4])))}h[y]=1-.62*w}c.setAttribute("shade",new re(h,1)),c.computeVertexNormals();let u=new pe(c,a);u.receiveShadow=!0,s.add(u);let f=ii(new Ke({roughness:1,map:r}),{key:"live-rock",vertex:"attribute vec3 surface;varying vec3 vRockNormal,vSurface;",begin:"vSurface=surface;",normal:"vRockNormal=normal;",fragment:"varying vec3 vRockNormal,vSurface;uniform sampler2D reefRelief;",map:`
    vec3 w=pow(abs(normalize(vRockNormal)),vec3(4.));w/=max(.001,w.x+w.y+w.z);
    vec3 q=vReefWorld*.62,f=vReefWorld*2.3+.37,o=vReefWorld*.13+.71;
    vec3 crust=texture2D(map,q.yz).rgb*w.x+texture2D(map,q.xz).rgb*w.y+texture2D(map,q.xy).rgb*w.z;
    vec3 fine=texture2D(map,f.yz).rgb*w.x+texture2D(map,f.xz).rgb*w.y+texture2D(map,f.xy).rgb*w.z;
    // A very low octave of the same atlas: which way a whole face of rock has gone, so a
    // boulder is not one even mix of everything.
    vec3 broad=texture2D(map,o.yz).rgb*w.x+texture2D(map,o.xz).rgb*w.y+texture2D(map,o.xy).rgb*w.z;
    vec3 rx=texture2D(reefRelief,q.yz).xyz,ry=texture2D(reefRelief,q.xz).xyz,rz=texture2D(reefRelief,q.xy).xyz;
    float relief=min(crust.r,fine.r*.9+.12),speck=rx.z*w.x+ry.z*w.y+rz.z*w.z;
    float up=normalize(vRockNormal).y;
    // Aquacultured limestone is laid down in beds, so a face shows faint layering under
    // the pitting.
    float bedding=.5+.5*sin(vReefWorld.y*7.3+fine.r*2.6+broad.r*5.);
    vec3 stone=mix(vec3(.10,.064,.038),vec3(.180,.122,.072),smoothstep(.25,.85,fine.r*.6+crust.r*.4))*(.88+.18*broad.r)*(.92+.10*bedding);
    // A grain finer than the atlas's own, for the crust's speckled, eroded margins.
    vec3 g=vReefWorld*7.9+.13;
    float grain=texture2D(map,g.yz).g*w.x+texture2D(map,g.xz).g*w.y+texture2D(map,g.xy).g*w.z;
    // Coralline grows on the raised crust of upward faces open to the lamp; how thick it
    // runs drifts over each boulder, and its edge breaks into flecks instead of a clean
    // outline. Bare stone and film still hold most of the rock.
    float crustSite=broad.g*.45+crust.g*.30+(vSurface.g-.5)*.6+.22*up+(relief-.5)*.35+(fine.g-.5)*.22+(grain-.5)*.30;
    float cover=smoothstep(.73,.87,crustSite)*(.55+.45*smoothstep(.3,.7,broad.g))*smoothstep(-.2,.5,up)*smoothstep(.35,.75,vSurface.r);
    float hue=clamp(vSurface.b+(crust.b-.45)*.7+(fine.b-.5)*.4,0.,1.);
    // Each crust patch its own colour: maroon, rose, a little purple, and pale pink where
    // a patch has bleached thin.
    vec3 coralline=mix(mix(vec3(.26,.06,.09),vec3(.48,.20,.24),smoothstep(.10,.50,hue)),vec3(.30,.12,.28),smoothstep(.68,.95,hue));
    coralline=mix(coralline,vec3(.52,.37,.39),.75*smoothstep(.58,.70,broad.r));
    coralline*=.62+.55*fine.r*grain;
    coralline=mix(coralline,vec3(.52,.38,.43),smoothstep(.6,1.,cover*(1.-cover)*4.)*grain*.5);
    // Film and short turf in the hollows and on faces the lamp misses.
    float turf=smoothstep(.40,.62,broad.b*.40+crust.b*.30+(.6-relief)*.35+(.6-vSurface.r)*.3+(fine.b-.5)*.25-.10*up)*(1.-cover);
    vec3 film=mix(mix(vec3(.08,.09,.035),vec3(.12,.085,.045),fine.b),vec3(.05,.055,.025),crust.b*(1.-fine.r));
    // A thin film of diatoms and green algae over the open stone, brown in some stretches
    // and green in others.
    float algae=smoothstep(.42,.64,broad.r*.45+fine.g*.35+crust.b*.20+(grain-.5)*.2)*smoothstep(-.2,.5,up)*(1.-turf);
    vec3 algaeTint=mix(vec3(.15,.10,.045),vec3(.09,.115,.04),smoothstep(.45,.75,broad.b));
    vec3 rock=mix(mix(mix(stone,algaeTint,algae*.7),film,turf*.8),coralline,cover);
    rock=mix(rock,mix(vec3(.46,.50,.22),vec3(.64,.36,.40),step(.55,fine.b)),speck*.3);
    // Porous limestone: every pit, hole and undercut falls to a dark purple-brown, the
    // atlas's relief at two scales plus the baked sky visibility.
    float cavity=smoothstep(.34,.70,relief)*mix(.25,1.,smoothstep(.22,.55,fine.r))*pow(vSurface.r,2.2);
    diffuseColor.rgb=mix(vec3(.018,.010,.014),rock,cavity);`,surfaceNormal:`vec3 rn=normalize(vRockNormal);
      vec3 rq=vReefWorld*4.0;
      vec3 perturb=vec3(0.,rx.xy*2.-1.)*w.x+vec3(ry.x*2.-1.,0.,ry.y*2.-1.)*w.y+vec3(rz.xy*2.-1.,0.)*w.z;
      // The first octave lays the atlas over 1.6 units, so its pits land at the 1-3 cm the
      // eye resolves; this second one is the millimetre grain between them, for close views.
      vec2 fx=texture2D(reefRelief,rq.yz).xy*2.-1.,fy=texture2D(reefRelief,rq.xz).xy*2.-1.,fz=texture2D(reefRelief,rq.xy).xy*2.-1.;
      perturb+=(vec3(0.,fx)*w.x+vec3(fy.x,0.,fy.y)*w.y+vec3(fz,0.)*w.z)*.6;
      normal=normalize(mat3(viewMatrix)*normalize(rn+perturb*.9));
      // Coralline and turf are matt; only the bare raised limestone keeps a faint wet film.
      roughnessFactor*=1.-.15*smoothstep(.7,.95,relief)*(1.-cover)*(1.-turf)*(1.-algae);`,specular:.2}),d=f.onBeforeCompile;f.onBeforeCompile=y=>{d(y),y.uniforms.reefRelief={value:o}},f.userData.extraTextures=[o];let g=new pe(n,f);g.castShadow=g.receiveShadow=!0,s.add(g);let x=[];for(let y=0;y<220;y++){let v=(t()-.5)*22,_=-2.8+t()*8;if(Math.abs(v)<1.2&&t()>.32)continue;let w=.025+Math.pow(t(),3)*.13,T=rm([v,sc(v,_)+w*.14,_],[w,w*.53,w*.76],y+91,12),R=new Et(.65+t()*.25,t(),t());mr(T,()=>R),x.push(T)}let m=Hn(x);m.setAttribute("surface",m.getAttribute("color")),m.deleteAttribute("color");let p=new pe(m,f);return p.receiveShadow=!0,s.add(p),{obstacles:du,host:tm,stations:Qx,rockSurface:g}}var dE=`vec3 polypV1=vec3(1.,0.,0.);vec3 polypV2=vec3(0.,1.,0.);float polypFade;float polypD=1.;float polypE=1.;
vec3 polypHash(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yxz+33.33);return fract((p.xxy+p.yxx)*p.zyx);}
void polypCells(vec3 p){vec3 i=floor(p),f=fract(p);float d1=8.,d2=8.;
  for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec3 g=vec3(x,y,z),v=f-g-polypHash(i+g);float d=dot(v,v);
    if(d<d1){d2=d1;polypV2=polypV1;d1=d;polypV1=v;}else if(d<d2){d2=d;polypV2=v;}}
  polypD=sqrt(d1);polypE=sqrt(d2)-polypD;}
float reefValue(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(mix(polypHash(i).x,polypHash(i+vec3(1,0,0)).x,f.x),mix(polypHash(i+vec3(0,1,0)).x,polypHash(i+vec3(1,1,0)).x,f.x),f.y),
             mix(mix(polypHash(i+vec3(0,0,1)).x,polypHash(i+vec3(1,0,1)).x,f.x),mix(polypHash(i+vec3(0,1,1)).x,polypHash(i+vec3(1,1,1)).x,f.x),f.y),f.z);}`,pE="mix(1.,.55+.9*(1.-smoothstep(0.,.38,polypD)),polypFade)",mE=".8*(1.-smoothstep(0.,.45,d))+.3*smoothstep(0.,.25,e)",gE=".85*exp(-pow((d-.30)/.11,2.))-.75*(1.-smoothstep(.0,.20,d))+.15*smoothstep(0.,.3,e)";function fc(s,{cells:t=60,shape:e=mE,relief:n=.35,cup:i=[1.18,1.14,1.06],groove:r=.84,lip:o=0,mottle:a=.18,sheen:c=0,sheenColor:l="#d8d4c4",roughness:h=.7,transmission:u=.15,side:f=fn,glow:d=pE,...g}={}){let x=v=>Number(v).toFixed(4),[m,p,y]=i.map(x);return ii(new Ze({vertexColors:!0,roughness:h,side:f,sheen:c,sheenRoughness:.55,sheenColor:new Et(l)}),{key:s,transmission:u,...g,vertex:"attribute vec3 fluor;varying vec3 vFluor;"+(g.vertex||""),begin:`vFluor=fluor;
      #ifdef USE_INSTANCING_COLOR
      vFluor*=instanceColor;
      #endif
      ${g.begin||""}`,fluorescence:`vFluor*(${d})`,fragment:"varying vec3 vFluor;"+dE+`float polypShape(float d,float e){return ${e};}`+(g.fragment||""),color:`polypFade=1.-smoothstep(.20,.60,length(fwidth(vReefWorld))*${x(t)});if(polypFade>0.)polypCells(vReefWorld*${x(t)});
      diffuseColor.rgb*=mix(vec3(1.),mix(vec3(${x(r)}),vec3(${m},${p},${y}),1.-smoothstep(.0,.42,polypD))*mix(.9,1.,smoothstep(0.,.2,polypE))*(1.+${x(o)}*exp(-pow((polypD-.30)/.10,2.))),polypFade);
      {float m=reefValue(vReefWorld*${x(t*.09)})*.65+reefValue(vReefWorld*${x(t*.31)}+7.)*.35;diffuseColor.rgb*=1.+${x(a)}*(2.*m-1.)*vec3(1.,.92,.84);}${g.color||""}`,surfaceNormal:`{float h0=polypShape(polypD,polypE),hd=(polypShape(polypD+.01,polypE)-h0)*100.,he=(polypShape(polypD,polypE+.01)-h0)*100.;
      vec3 n1=normalize(polypV1),grad=mat3(viewMatrix)*(hd*n1+he*(normalize(polypV2)-n1));
      normal=normalize(normal-${x(n)}*polypFade*(grad-dot(grad,normal)*normal));}${g.surfaceNormal||""}`})}var xr=(s,t,e=!0)=>{let n=new pe(s,t);return n.castShadow=e,n.receiveShadow=!0,n},si=s=>["#3dff6e",s],dc=s=>["#9cff3a",s],pc=s=>["#ff7a2a",s],mc=s=>["#ff3d8a",s],zy=s=>["#2ee6ff",s];function ky(s){let t=ei(22097),e=(I,O,k,...z)=>by([I,on(I,O)-k,O],...z),n={roots:18,forks:5,thickness:.047,reach:.5,spread:.44,radials:26,pale:.66},i={thickness:.033,forks:3,roots:6,order:3,rise:.8,corallite:.08,blunt:.2,pale:.5},r={thickness:.092,forks:3,roots:6,order:2,rise:.85,taper:.7,blunt:1,spread:.3,reach:.4,pale:.45},o={roots:16,forks:3,order:1,thickness:.062,reach:.66,spread:.36,taper:.7,blunt:.6,radials:56,pale:.55},a=[e(-5.82,-1,.42,2.1,1.05,39,"#c09858","#f8eab0",{...n,fluor:dc(.55)}),e(-7.1,-1.05,.42,1.75,1.16,74,"#5e7a3c","#d4f0a0",{...n,roots:14,thickness:.05,reach:.58,spread:.34,fluor:si(1.05)}),e(-4.35,-2.15,.6,2.3,.99,122,"#b8607a","#f8d0de",{...i,fluor:mc(1)}),e(5.45,-1.52,.05,1.8,1.22,82,"#8e7646","#e8f4c8",{...n,fluor:si(.78)}),e(7.34,-1.62,.38,1.3,1,417,"#c4a87c","#f6ecd8",{...n,roots:12,thickness:.052,reach:.62,spread:.34,fluor:zy(.22)}),e(3.28,-1.52,.38,1.6,.86,23,"#bca282","#f6ecdc",{...i,fluor:dc(.3)}),e(4.3,1.55,.17,.84,.98,611,"#c0622e","#f8c894",{...r,vary:.3,fluor:pc(1.05)}),e(-.45,-1.14,.12,.95,.9,707,"#a08456","#e4f4d4",{...n,roots:12,forks:4,reach:.56,fluor:si(.62)}),e(1.34,-1.24,.3,.95,.55,811,"#74407e","#ecc4e4",{...o,fluor:mc(.48)}),e(-3.66,1.34,.1,.7,.95,1201,"#5a7038","#d0e49a",{...r,roots:5,vary:.25,fluor:si(.62)}),e(-4.38,1.3,.1,.62,.8,1207,"#8a5068","#f0c8d8",{...r,roots:4,vary:.25,fluor:mc(.4)}),e(-7.3,1.1,.06,.55,.9,1213,"#b89a70","#f0e0c0",{...r,roots:5,vary:.25,fluor:dc(.22)}),e(6.15,.5,.02,.85,1.05,905,"#b8607a","#f6cad8",{...r,roots:30,forks:3,order:1,thickness:.11,reach:.46,spread:.5,taper:.72,radials:40,pale:.5,vary:.25,fluor:mc(.66)})],c=fc("branching-coral",{cells:46,shape:gE,relief:.55,cup:[.62,.6,.66],groove:.82,lip:.3,mottle:.22,sheen:.2,roughness:.82,transmission:.2});s.add(xr(Hn(a.map(I=>I.skeleton)),c));let l=xr(Hn(a.flatMap(I=>I.radials?[I.radials]:[])),c);s.add(l);let h=[gr([4.38,2.98,-.3],.6,180,"#3c4a2a","#a8d070",{yaw:.3,tilt:-.45,fluor:si(.55)}),gr([4.7,2.8,-.05],.46,183,"#3a4628","#a8d070",{yaw:.55,tilt:-.35,fluor:si(.55)}),gr([4.95,2.55,.18],.38,184,"#3a4628","#a8d070",{yaw:.75,tilt:-.5,fluor:si(.55)}),gr([-6.05,2.22,.3],.58,271,"#8a3426","#f09070",{yaw:-.3,tilt:-.4,fluor:pc(.6)}),gr([-5.75,1.98,.55],.46,274,"#84302a","#f09070",{yaw:-.1,tilt:-.35,fluor:pc(.6)}),gr([-4.05,on(-4.05,1.85)+.04,1.85],.36,277,"#3c4a2a","#a8d070",{yaw:.1,tilt:-.4,fluor:si(.55)})];s.add(xr(Hn(h),fc("plate-coral",{cells:45,relief:.4,side:Ce,roughness:.75,sheen:.35,transmission:.16,cup:[.62,.58,.7],groove:1.05})));let u=Ay([-4.95,on(-4.95,2.05)+.1,2.05],[.66,.4,.54],-94,"#9a8458","#3e5030",{fluor:si(.8)});s.add(xr(u,fc("brain-coral",{cells:60,relief:.015,roughness:.42,specular:.6,transmission:.16,cup:[1.02,1.03,1],groove:.97,mottle:.12,sheen:.35,sheenColor:"#d8e0c0",vertex:"attribute float wall;varying float vWall;",begin:"vWall=wall;",fragment:"varying float vWall;",surfaceNormal:`{vec3 dpx=dFdx(-vViewPosition),dpy=dFdy(-vViewPosition),r1=cross(dpy,normal),r2=cross(normal,dpx);float det=dot(dpx,r1);
      vec3 grad=(r1*dFdx(vWall)+r2*dFdy(vWall))/(abs(det)>1e-12?det:1e-12);float gl=length(grad);
      if(gl>1e-4){vec3 run=normalize(cross(normal,grad/gl)),runWorld=(vec4(run,0.)*viewMatrix).xyz;float septa=sin(dot(vReefWorld,runWorld)*${(2*Math.PI/.012).toFixed(3)});
        float onWall=smoothstep(-.45,.15,vWall)*(1.-smoothstep(.20,.36,length(fwidth(vReefWorld))*${(1/.012).toFixed(3)}));
        normal=normalize(normal+.18*onWall*septa*run);diffuseColor.rgb*=1.+.06*onWall*septa;}}`})));let f=Ry([3.35,on(3.35,1.45)+.08,1.45],[.7,.44,.58],64,"#8c7450","#5a7a3a",{fluor:si(.85)});s.add(xr(f,fc("favia-coral",{cells:150,relief:.06,roughness:.55,transmission:.12,cup:[1.05,1.05,1],groove:.9,glow:"1."})));let d=[[{mouth:"#e07a2a",disc:"#3c7a34",ring:"#d86a28",tentacle:"#6a7a30",column:"#3a4a26"},{disc:si(1.1),ring:pc(.8)}],[{mouth:"#b8e060",disc:"#6e5a36",ring:"#8a7444",tentacle:"#a08a54",column:"#4a3e28"},{disc:dc(.4),ring:dc(.22)}],[{mouth:"#f08a3a",disc:"#2a6a72",ring:"#3a8a6e",tentacle:"#4a8a6a",column:"#22383a"},{disc:zy(.62),ring:si(.6)}],[{mouth:"#e8c840",disc:"#6a3460",ring:"#b85888",tentacle:"#7a4470",column:"#36202e"},{disc:mc(.62),ring:pc(.38)}]],g=[[-6,1.85,1.02,0,3],[-3.13,2.03,.86,1,0],[2.72,.4,.8,0,2],[-5.45,-.26,.58,2,3],[4.74,-.81,.74,1,3],[-1.3,2.05,.55,2,0],[6.95,1.8,.62,0,1],[-6.95,1.25,.55,1,2]],x=new B,m=new B,p=new B(0,1,0),y=new Ve,v=new Ve,_=new Pt,w=new Et,T=d.map(()=>({placed:[],colors:[]})),R=fc("zoanthid-gardens",{cells:150,relief:.12,roughness:.45,specular:.6,side:Ce,sheen:.4,sheenColor:"#c8f0a0",transmission:.24,cup:[1,1,1],groove:1,mottle:.08,glow:"1."}),L=(I,O)=>[(on(I+.05,O)-on(I-.05,O))/(2*.05),(on(I,O+.05)-on(I,O-.05))/(2*.05)];for(let[I,O,k,z,et]of g){let j=[];for(let W=0;W<160&&j.length<Math.round(k*k*12);W++){let tt=t()*Math.PI*2,at=k*Math.sqrt(t()),st=I+Math.cos(tt)*at,ot=O+Math.sin(tt)*at*.66,J=.2+t()*.14,[it,ft]=L(st,ot);Math.hypot(it,ft)>5||on(st,ot)<.15||j.some(bt=>Math.hypot(bt.x-st,bt.z-ot)<(bt.R+J)*.75)||j.push({x:st,z:ot,R:J,morph:t()<.7?z:et})}for(let{x:W,z:tt,R:at,morph:st}of j){let{placed:ot,colors:J}=T[st],it=Math.round(at*at*470);for(let ft=0;ft<it;ft++){let bt=ft*2.399963+t()*.4,St=at*Math.sqrt((ft+.5)/it),zt=W+Math.cos(bt)*St,ue=tt+Math.sin(bt)*St,[V,Qt]=L(zt,ue),D=St/at;if(Math.hypot(V,Qt)>6)continue;m.set(Math.cos(bt),0,Math.sin(bt)),x.set(-V,1,-Qt).normalize().lerp(p,.25).addScaledVector(m,.3*D*D).add(new B((t()-.5)*.1,0,(t()-.5)*.1)).normalize();let E=.04+t()*.014,H=.05+t()*.012+.02*D*D;y.setFromUnitVectors(p,x).multiply(v.setFromAxisAngle(p,t()*Math.PI*2)),_.compose(new B(zt,on(zt,ue)-.03,ue),y,new B(E,H,E)),ot.push(_.clone()),w.setRGB(1,1,1).offsetHSL((t()-.5)*.07,(t()-.5)*.25,(t()-.5)*.16),J.push(w.r,w.g,w.b)}}}let S=[];d.forEach(([I,O],k)=>{let{placed:z,colors:et}=T[k];if(!z.length)return;let j=om(I,O),W=om(I,O,{sides:8,tentacles:12}),tt=new On(j,R,z.length);z.forEach((at,st)=>tt.setMatrixAt(st,at)),tt.instanceColor=new tn(new Float32Array(et),3),tt.receiveShadow=!0,tt.computeBoundingSphere(),s.add(tt),S.push({zoanthids:tt,detail:j,coarse:W})});let M=3.3,b=3.05,A=wy([6.85,M,-.62],b,54,"#3e1c22","#6e3e42",{yaw:-.26,order:5,thickness:.08,shorten:.9,bow:.22}),N={vertex:mu+`float fanReach(vec3 p){return clamp((p.y-${M.toFixed(3)})/${b.toFixed(3)},0.,1.);}`,normal:"objectNormal.y-=.52*fanReach(position)*dot(reefResponse(position,reefTime,.85),objectNormal.xz);",begin:"{float h=fanReach(position);transformed.xz+=reefResponse(position,reefTime,.85)*h*h*.30;}"};s.add(xr(A.ribs,ii(new Ze({vertexColors:!0,roughness:.65,sheen:.35,sheenRoughness:.5,sheenColor:new Et("#a89090")}),{key:"gorgonian-ribs",transmission:.18,...N}),!1)),s.add(xr(A.net,ii(new Ze({vertexColors:!0,roughness:.7,side:Ce,sheen:.25,sheenRoughness:.5,sheenColor:new Et("#a89090")}),{key:"gorgonian-net",transmission:.3,wrap:.8,...N,vertex:N.vertex+"varying vec2 vNet;",begin:N.begin+"vNet=uv;",fragment:`varying vec2 vNet;
      vec2 netHash(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return fract(sin(p)*43758.5453);}
      float netWall(vec2 p){vec2 i=floor(p),f=fract(p);float d1=8.,d2=8.;
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(x,y),v=g+.15+.7*netHash(i+g)-f;float d=dot(v,v);if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;}
        return sqrt(d1/d2);}`,color:`float netR=length(vNet),netK=.75+.55*netR/${b.toFixed(3)},netE=netWall(vec2(atan(vNet.x,vNet.y)*netR*20.,netR*11.)*netK),netPatch=netWall(vNet*2.3+3.1);
      float netW=1.-max((.15+.12*netPatch)*(1.-.25*netR/${b.toFixed(3)}),fwidth(netE)*.8);
      if(netE<netW)discard;diffuseColor.rgb*=(.62+.42*smoothstep(netW,1.,netE))*(.80+.25*smoothstep(0.,${b.toFixed(3)},netR));`}),!1));function C(I){let O=I==="eco";l.visible=!O;for(let k of S)k.zoanthids.geometry=O?k.coarse:k.detail}return{setQuality:C}}var xE=.9,yE=Math.PI*(3-Math.sqrt(5)),yr=.24,_E=180,pm=.3;function mm(s){let t=s.radius/xE,e=s.form==="compact",n=e?t>.65?[10,10,20,40,80]:t>.4?[8,8,16,32]:[8,8,16]:null;return{S:t,compact:e,rim:e?.53:.36,height:e?.43:pm,count:e?n.reduce((i,r)=>i+r,0):Math.round(_E*Math.pow(t,1.3)),cycles:n}}function Hy(s,t=0){let e=mm(s),{S:n,compact:i,count:r,cycles:o,rim:a}=e,c=ei(8945+t*977),l=[];if(i){let h=o.length===5?[.26,.38,.52,.68,.89]:o.length===4?[.31,.47,.66,.89]:[.35,.6,.88],u=c()*Math.PI*2,f=2*a*n;o.forEach((d,g)=>{for(let x=0;x<d;x++){let m=g/(o.length-1),p=u+(x+g%2*.5+(c()-.5)*.23)*Math.PI*2/d,y=h[g]+(c()-.5)*.022,v=f*(.43-.14*m)*(.9+.2*c());l.push({angle:p,radius:y,ring:m,length:v,girth:f*.044*(.88+.22*c()),tilt:.2+.68*m+(c()-.5)*.1,curl:.13+.24*c(),tone:c(),lag:c(),seed:c(),flex:.46+.12*c()})}});for(let d of l){let g=1/0;for(let x of l)d!==x&&(g=Math.min(g,Math.hypot(Math.cos(d.angle)*d.radius-Math.cos(x.angle)*x.radius,Math.sin(d.angle)*d.radius-Math.sin(x.angle)*x.radius)*a*n));d.girth=Math.min(d.girth,g*.42)}}else for(let h=0;h<r;h++){let u=Math.sqrt(yr*yr+(1-yr*yr)*(h+.5)/r),f=(u-yr)/(1-yr),d=h*yE+(c()-.5)*.44,g=kn(u+(c()-.5)*.1,yr*.9,1),x=.4*Math.pow(n,1.15)*(.92-.12*f)*(.62+.6*c()),m=.025*Math.pow(n,.9)*(.7+.6*c()**1.5),p=.18+.95*Math.pow(f,1.2)+(c()-.5)*.24,y=(.1+.55*c())*(.55+.75*f)+(c()<.12?.6:0);l.push({angle:d,radius:g,ring:f,length:x,girth:m,tilt:p,curl:y,tone:c(),lag:c(),seed:c(),flex:1})}return{...e,roots:l}}function Vy(s){let t=[],e=new Uint8Array(s.length),n=new Float64Array(s.length).fill(1/0),i=0;for(let r=0;r<s.length;r++){t.push(i),e[i]=1;let o=s[i];for(let a=0;a<s.length;a++)if(!e[a]){let c=s[a],l=(Math.cos(o.angle)*o.radius-Math.cos(c.angle)*c.radius)**2+(Math.sin(o.angle)*o.radius-Math.sin(c.angle)*c.radius)**2;n[a]=Math.min(n[a],l)}i=-1;for(let a=0;a<s.length;a++)!e[a]&&(i<0||n[a]>n[i])&&(i=a)}return t}function Gy(s,t){let e=t==="eco"?.57:t==="balanced"?.7:1;return Math.min(s.count,Math.max(s.compact?36:0,Math.round(s.count*e)))}var gm=.36,yu=[[0,.3],[.1,.25],[.5,.23],[1,gm]];function Wy(s){if(s<0)return yu[0][1]*Math.max(.6,1+s*.4);for(let t=1;t<yu.length;t++){let[e,n]=yu[t-1],[i,r]=yu[t];if(s<=i)return Qp(n,r,.5-.5*Math.cos(Math.PI*(s-e)/(i-e)))}return gm}var Xy=s=>.045*Kt(0,.45,s),vE=s=>.03*Math.exp(-(((s-.2)/.08)**2))-.045*(1-Kt(0,.11,s)),_u=Math.E,gc=s=>{let t=Math.sin(s*_u)*Math.cos(s*Math.PI)*1e4;return t-Math.floor(t)},qy={rows:12,cols:20,skip:.22,jitter:.9,topBias:.55,size:.02};function SE(s,t,e){let{rows:n,cols:i,skip:r,jitter:o,topBias:a,size:c}=qy,l=Math.pow(kn(t,0,1),1/a)*n,h=0;for(let u=-1;u<=1;u++){let f=Math.floor(l)+u;if(f<0||f>=n)continue;let d=s/(2*Math.PI)*i-f%2/2;for(let g=-1;g<=1;g++){let x=((Math.floor(d)+g)%i+i)%i,m=f*i+x+e;if(gc(m*_u+401)<r)continue;let p=Math.pow((f+.5+(gc(m*Math.PI+411)-.5)*o)/n,a),y=(x+.5+f%2/2+(gc(m*_u+421)-.5)*o)/i*2*Math.PI,v=c*(.45+.9*gc(m*_u+441))*(.5+.5*p),_=Math.atan2(Math.sin(s-y),Math.cos(s-y))*Wy(kn(t,0,1)),w=(t-p)*pm;h=Math.max(h,Math.exp(-(_*_+w*w)/(v*v)*1.6)*(.55+.45*gc(m*Math.PI+431)))}}return h}var ME=new Et("#1e0c0a"),bE=new Et("#3e1a12"),wE=new Et("#4a2216"),EE=new Et("#8e5a48"),TE=new Et("#6a3a2c"),AE=new Et("#8a5040"),RE=new Et("#2a0c10");function CE(s,t){let e=Hy(s,t),{S:n,rim:i,compact:r}=e,o=e.height*n,a=new B(0,1,0),c=new B,l=.25,h=s.lean||[0,0],u=(on(s.x+l,s.z)-on(s.x-l,s.z))/(2*l),f=(on(s.x,s.z+l)-on(s.x,s.z-l))/(2*l);c.set(-u*.35+h[0],1,-f*.35+h[1]).normalize();let d=new Ve().setFromUnitVectors(a,c),x=new B(s.x,s.y-(r?.12*n:0),s.z).clone().addScaledVector(c,-o),m=Math.max(.12*n,x.y-on(x.x,x.z)+.04);return{S:n,H:o,rim:i,compact:r,crown:e,frame:d,foot:x,sunk:m,seed:t*977,count:e.count}}function IE(s){let{S:t,H:e,rim:n,frame:i,foot:r,sunk:o,seed:a}=s,c=56,l=72,h=[],u=[],f=[],d=new B,g=new Et,x=.68;for(let p=0;p<=c;p++){let y=p/c;for(let v=0;v<=l;v++){let _=v/l*Math.PI*2,w,T,R=1;if(y<x){let L=Qp(-o/e,1,y/x),S=SE(_,L,a),M=1+.012*Be(Math.cos(_)*3+a,L*4,Math.sin(_)*3),b=Math.pow(.5+.5*Math.cos(_*14+a),1.5)*(1-Kt(.7,.92,L)),A=Wy(L)*(1+(n/gm-1)*Kt(.35,1,L)),N=Be(Math.cos(_)*1.6+a,L*9,Math.sin(_)*1.6)*(1-Kt(.8,.98,L));w=t*A*M*(1-.012*b)*(1+.8*qy.size*S/A)*(1+.035*N),T=e*L,g.copy(ME).lerp(bE,Kt(.05,.55,L)).lerp(wE,Kt(.55,1,L)).lerp(EE,Math.min(1,S*.55)),R=(1-.6*Kt(.55,1,L))*(1-.3*b)*(.86+.14*N)}else{let L=(y-x)/(1-x),S=(1-L)*(1+.3*Math.cos(2*_+a));w=t*n*(1-L),T=e+t*(Xy(L)+vE(S)),g.copy(TE).lerp(AE,Math.exp(-(((S-.2)/.1)**2))).lerp(RE,1-Kt(.04,.13,S)),R=.45*(1-.14*Kt(.55,1,Math.cos(_*24))*Kt(.15,.4,L)*(1-Kt(.7,.9,L)))}if(d.set(Math.cos(_)*w,T,Math.sin(_)*w).applyQuaternion(i).add(r),h.push(d.x,d.y,d.z),u.push(g.r*R,g.g*R,g.b*R),p<c&&v<l){let L=p*(l+1)+v;f.push(L,L+l+1,L+1,L+1,L+l+1,L+l+2)}}}let m=new oe;return m.setAttribute("position",new Jt(h,3)),m.setAttribute("color",new Jt(u,3)),m.setIndex(f),m.computeVertexNormals(),m}function PE(){let s=[0,.12,.24,.36,.48,.58,.66,.72,.77,.81,.845,.875,.9,.92,.94,.955,.968,.979,.988,.995,1],t=14,e=.955,n=[],i=[],r=l=>1-.32*Math.pow(l,1.4),o=l=>l<=e?r(l):r(e)*Math.sqrt(Math.max(0,1-((l-e)/(1-e))**2));for(let l=0;l<s.length;l++){let h=s[l],u=o(h);for(let f=0;f<=t;f++){let d=f/t*Math.PI*2;if(n.push(Math.cos(d)*u,h,Math.sin(d)*u),l<s.length-1&&f<t){let g=l*(t+1)+f;i.push(g,g+t+1,g+1,g+1,g+t+1,g+t+2)}}}let a=n.length/3;n.push(0,0,0);for(let l=0;l<t;l++)i.push(a,l,l+1);let c=new oe;return c.setAttribute("position",new Jt(n,3)),c.setIndex(i),c.computeVertexNormals(),c}var xc=em.reduce((s,t)=>s+mm(t).count,0);function $y(s){let t=em.map(CE),e=`attribute vec4 aShape;attribute vec4 aCurve;attribute float aFlex;varying float vAxis;varying float vAround;varying float vTone;varying float vRing;varying float vSeed;varying float vBulb;${mu}
    // The resting strand is a circular arc in the local x-y plane (x outward from the disc,
    // y the anemone's axis): it leaves the disc aCurve.x from the axis and turns a further
    // aCurve.y by the tip, so a small curl is a straight finger and a large one hooks over
    // the rim. A slight wander out of that plane, phased per tentacle, keeps a crown seen
    // face-on from reading as spines on a ball. The flow adds a cantilever bend on top,
    // solved once in the normal hook, which three runs before begin_vertex.
    vec2 tSway;vec2 tTip;
    void tentacleSolve(){vec3 root=instanceMatrix[3].xyz;mat3 toLocal=transpose(mat3(instanceMatrix));
      vec2 f=reefResponse(root,reefTime,.45+aShape.x*.60+aCurve.z*.50),g=reefResponse(root,reefTime,1.3+aShape.x*.80);
      float gain=.90*aShape.x*aFlex;
      tSway=(toLocal*vec3(f.x,0.,f.y)).xz*gain;tTip=(toLocal*vec3(g.x,0.,g.y)).xz*gain*.5;}
    vec3 arcPoint(float s){float c=max(aCurve.y,.02),t=aCurve.x+c*s;return vec3(cos(aCurve.x)-cos(t),sin(t)-sin(aCurve.x),.05*s*sin(s*5.5+aCurve.w*25.)*c)*aShape.x/c;}
    vec3 tentacleCenter(float s){vec2 h=tSway*s*s+tTip*s*s*s*s;return arcPoint(s)+vec3(h.x,0.,h.y);}
    vec3 tentacleSlope(float s){vec2 dh=tSway*2.*s+tTip*4.*s*s*s;float t=aCurve.x+aCurve.y*s;float z=.05*(sin(s*5.5+aCurve.w*25.)+5.5*s*cos(s*5.5+aCurve.w*25.));return vec3(sin(t),cos(t),z)*aShape.x+vec3(dh.x,0.,dh.y);}
    // The bubble: the tentacle swells below its tip and pinches to a narrow waist before
    // the tip itself. How far a tentacle bubbles varies from one to the next, and a rare
    // one stays slender. m is the swelling as a share of the taper, dm its slope along s.
    float bulbAmount(){float b=fract(aCurve.w*7.31);return step(.05,fract(aCurve.w*3.7))*(.60+.40*b);}
    float bump(float s,float c,float w){return exp(-pow((s-c)/w,2.));}
    float bulbM(float s,float b){return 1.+b*(1.45*bump(s,.80,.085)-.30*bump(s,.915,.03));}
    float bulbDM(float s,float b){return b*(-1.45*bump(s,.80,.085)*2.*(s-.80)/(.085*.085)+.30*bump(s,.915,.03)*2.*(s-.915)/(.03*.03));}`,n=ii(new Ke({color:"#ffffff",roughness:.5,metalness:0}),{key:"tank-anemone",vertex:e,transmission:"(.24+.40*smoothstep(.20,1.,vAxis))",wrap:"(.62+.30*smoothstep(.40,.85,vAxis))",specular:.7,fluorescence:`(vec3(.05,.42,.13)*exp(-pow((vAxis-.70)/.05,2.))*(.5+.5*vBulb)+vec3(.24,.03,.09)*smoothstep(.70,1.,vAxis)*(.55+.45*vBulb))
      *(1.-.60*(1.-smoothstep(.18,.78,vAxis))*(1.-.65*vRing*vRing))`,normal:`tentacleSolve();float tb=bulbAmount(),tm=bulbM(position.y,tb);vec3 slope=normalize(tentacleSlope(position.y));vec3 tx=normalize(vec3(slope.y,-slope.x,0.));vec3 tz=normalize(cross(tx,slope));
      objectNormal=normalize((tx*normal.x+tz*normal.z)/(aShape.y*tm)+slope*(normal.y-bulbDM(position.y,tb)/tm*length(position.xz)*length(normal.xz))/length(tentacleSlope(position.y)));`,begin:`float s=position.y;vec3 dir=normalize(tentacleSlope(s));vec3 ax=normalize(vec3(dir.y,-dir.x,0.));vec3 az=normalize(cross(ax,dir));
      transformed=tentacleCenter(s)+(ax*position.x+az*position.z)*aShape.y*tm;
      vAxis=s;vAround=atan(position.z,position.x);vTone=aShape.z;vRing=aShape.w;vSeed=aCurve.w;vBulb=tb;`,fragment:"varying float vAxis;varying float vAround;varying float vTone;varying float vRing;varying float vSeed;varying float vBulb;",surfaceNormal:`float thin=smoothstep(.45,.85,vAxis)*(.4+.6*vBulb),rim=pow(1.-abs(dot(normal,normalize(vViewPosition))),2.);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.74,.40,.34),rim*thin*.34);roughnessFactor*=1.+.15*thin;`,color:`float stripe=.5+.5*cos(vAround*6.+vSeed*31.),bulbZone=smoothstep(.60,.76,vAxis)*(1.-smoothstep(.87,.90,vAxis));
      vec3 root=vec3(.12,.04,.035),shaft=mix(vec3(.30,.09,.07),vec3(.38,.13,.10),vTone),bulb=mix(vec3(.44,.13,.10),vec3(.54,.19,.14),vTone),band=vec3(.66,.52,.44),tip=mix(vec3(.50,.14,.18),vec3(.62,.26,.28),fract(vSeed*5.3));
      vec3 tissue=mix(root,shaft,smoothstep(0.,.20,vAxis))*(.84+.16*stripe)*(1.+.35*smoothstep(.25,.65,vAxis));
      tissue=mix(tissue,bulb*(.92+.08*stripe),bulbZone*(.40+.60*vBulb));
      tissue=mix(tissue,band,exp(-pow((vAxis-.915)/.03,2.))*(.15+.35*vBulb));
      tissue=mix(tissue,tip,smoothstep(.80,1.,vAxis)*smoothstep(.80,1.,vAxis)*(.45+.45*fract(vSeed*11.7)));
      // Inside the crown the roots and the inner rings' shafts are buried among their
      // neighbours and only the bulbs and the outer envelope stand in the light; what
      // reaches the depths has come through tissue, so they go deep red-brown rather than
      // grey. Cheaper and steadier than shadowing a few hundred swaying instances.
      float buried=(1.-smoothstep(.18,.78,vAxis))*(1.-.65*vRing*vRing);
      diffuseColor.rgb=mix(tissue,vec3(.10,.03,.02),buried*.78);`}),i=new On(PE(),n,xc),r=new Float32Array(xc*4),o=new Float32Array(xc*4),a=new Float32Array(xc),c=new Pt,l=new Pt,h=new B,u=new B,f=new B,d=new B,g=[];for(let w of t){let{S:T,H:R,rim:L,frame:S,foot:M,crown:b}=w,A=[];for(let N of b.roots)h.set(Math.cos(N.angle),0,Math.sin(N.angle)),u.set(0,1,0),f.crossVectors(h,u),d.set(h.x*N.radius*L*T,R+T*Xy(1-N.radius)-.006*T,h.z*N.radius*L*T).applyQuaternion(S).add(M),l.makeBasis(h,u,f),c.makeRotationFromQuaternion(S).multiply(l).setPosition(d),A.push({matrix:c.clone(),shape:[N.length,N.girth,N.tone,N.ring],curve:[N.tilt,N.curl,N.lag,N.seed],flex:N.flex});g.push({crown:b,instances:A,order:Vy(b.roots)})}let x=new tn(r,4),m=new tn(o,4),p=new tn(a,1);i.geometry.setAttribute("aShape",x),i.geometry.setAttribute("aCurve",m),i.geometry.setAttribute("aFlex",p);let y=null;function v(w){if(w===y)return;y=w;let T=0;for(let{crown:R,instances:L,order:S}of g){let M=Gy(R,w);for(let b=0;b<M;b++){let A=L[S[b]];i.setMatrixAt(T,A.matrix),r.set(A.shape,T*4),o.set(A.curve,T*4),a[T]=A.flex,T++}}i.count=T,i.instanceMatrix.needsUpdate=!0,x.needsUpdate=!0,m.needsUpdate=!0,p.needsUpdate=!0}v("detail"),i.frustumCulled=!1,i.receiveShadow=!0,s.add(i);let _=new pe(Hn(t.map(IE)),ii(new Ke({vertexColors:!0,roughness:.62}),{key:"anemone-body",transmission:.22}));return _.castShadow=_.receiveShadow=!0,s.add(_),{tentacles:i,count:xc,setQuality:v}}function _r(s,t=!1){let e=new Set,n=new Set,i=new Set;s.traverse(r=>{r.geometry&&e.add(r.geometry);for(let o of r.material?Array.isArray(r.material)?r.material:[r.material]:[])n.add(o)}),e.forEach(r=>r.dispose()),n.forEach(r=>{if(t){for(let o of Object.values(r))o?.isTexture&&i.add(o);for(let o of r.userData.extraTextures||[])i.add(o)}r.dispose()}),i.forEach(r=>r.dispose()),s.clear()}var vu=class{constructor(t,e,n,i){this.canvas=t,this.world=e,this.spatial=n,this.report=i,this.mode="natural",this.angle=0,this.coverage=.32,this.zoom=1.6,this.reefVisible=!1,this.reefReady=!1,this.reefPromise=null,this.disposed=!1,this.renderRevision=-1,this.records=[],this.frames=0,this.cpuMs=0,this.acc=0,this.renderer=new ah({canvas:t,alpha:!0,antialias:!0,powerPreference:"low-power"}),this.renderer.setClearColor(0,0),this.renderer.setPixelRatio(1),this.renderer.outputColorSpace=ze,this.renderer.toneMapping=_l,this.renderer.toneMappingExposure=1.7,this.scene=new Ws,this.camera=new He(34,1,.01,120),this.fishGroup=new un,this.heldGroup=new un,this.reefGroup=new un,this.reefGroup.visible=!1,this.scene.add(this.fishGroup,this.heldGroup,this.reefGroup),this.testStone=new pe(new xa(.4,2),new Ke({color:9150098,roughness:.85})),this.testStone.visible=!1,this.scene.add(this.testStone),this.depthSide="front",this.scene.add(new va("#89b8dc","#a28f6d",.8)),this.sun=new ps("#f2f5ff",4.2),this.sun.position.set(gi.x,gi.y,gi.z).multiplyScalar(pu),this.sun.shadow.mapSize.set(1024,1024),Object.assign(this.sun.shadow.camera,{left:-12,right:12,top:12,bottom:-14,near:1,far:45}),this.sun.shadow.normalBias=.015,this.scene.add(this.sun,this.sun.target);let r=new ps("#b4dbed",.25);r.position.set(3,5,9),this.scene.add(r),this.environment=Sy(),this.scene.environment=this.environment,this.caustics=py(),this.caustics.setQuality("eco"),this.foodMesh=new On(new ds(.02,8,6),new Ke({color:14921046,roughness:.6}),24),this.foodMesh.count=0,this.scene.add(this.foodMesh),this.dummy=new be,this.raycaster=new Ea,this.ruler=this.makeRuler(),this.scene.add(this.ruler),this.shaderErrors=[],this.renderer.debug.onShaderError=(o,a,c,l)=>{this.shaderErrors.push((o.getProgramInfoLog(a)||"Shader failure").slice(0,500)),this.report("\u6750\u8D28\u7F16\u8BD1\u5931\u8D25\uFF0C\u8BF7\u67E5\u770B\u8BCA\u65AD\u3002")},t.addEventListener("webglcontextlost",o=>{o.preventDefault(),this.failed=!0,this.report("\u56FE\u5F62\u4E0A\u4E0B\u6587\u4E22\u5931\uFF0C\u8BF7\u91CD\u8F7D\u5B9E\u9A8C\u9875\u3002")}),this.resize(innerWidth,innerHeight)}makeRuler(){let t=new un,e=[];for(let n=0;n<=10;n++){let i=-.5+n*.1;e.push(new B(i,-.9,0),new B(i,-.9+(n%5===0?.11:.06),0))}return e.push(new B(-.5,-.9,0),new B(.5,-.9,0)),t.add(new $s(new oe().setFromPoints(e),new fs({color:10939355}))),t.visible=!1,t}resize(t,e){this.width=t,this.height=e;let n=Math.min(devicePixelRatio||1,1.25,Math.sqrt(17e5/(t*e)));this.renderer.setSize(Math.max(1,Math.round(t*n)),Math.max(1,Math.round(e*n)),!1),this.canvas.style.width=t+"px",this.canvas.style.height=e+"px",this.camera.aspect=t/e,this.configureCamera()}configureCamera(){this.camera.up.set(0,1,0),this.mode==="turntable"?(this.camera.up.set(0,1,0),this.top?(this.camera.position.set(0,2.5,.01),this.camera.up.set(0,0,-1)):this.camera.position.set(0,.45,2.5),this.camera.lookAt(0,0,0),this.camera.fov=35):this.mode==="depth"?(this.camera.up.set(0,1,0),this.camera.position.set(0,0,4),this.camera.lookAt(0,0,0),this.camera.fov=35):this.mode==="scale"?(this.camera.position.set(0,3.5,11),this.camera.lookAt(0,3.5,0),this.camera.fov=25):(this.camera.position.set(0,4.3,this.zoom*10),this.camera.lookAt(0,3.5,0),this.camera.fov=34),(!this.top||this.mode!=="turntable")&&this.camera.up.set(0,1,0),this.camera.updateProjectionMatrix(),this.camera.updateMatrixWorld(),this.layoutReef()}setMode(t){this.mode=["natural","scale","turntable","depth"].includes(t)?t:"natural",this.renderRevision=-1,this.spatial.setActive(this.reefVisible&&this.mode==="natural"),this.configureCamera()}setAngle(t){this.top=t==="top",this.angle=this.top?0:Number(t)*Math.PI/180,this.configureCamera()}setZoom(t){this.zoom=Math.max(1,Math.min(2.4,t)),this.configureCamera()}setCoverage(t){this.coverage=Math.max(.2,Math.min(.42,t)),this.layoutReef(),this.reconcileSceneChange()}async setReef(t){if(this.reefVisible=t===!0,this.reefVisible&&!this.reefReady&&!this.reefPromise&&(this.reefError=null,this.report("\u8F7D\u5165\u771F\u5B9E\u7901\u77F3\u4E0E\u78B0\u649E\u67E5\u8BE2\u2026"),this.reefPromise=(async()=>{let e=await By(this.reefGroup);if(this.disposed){_r(this.reefGroup,!0);return}let n=this.reefGroup.children.filter(o=>o.isMesh);ky(this.reefGroup).setQuality("eco"),$y(this.reefGroup).setQuality("eco"),this.reefReady=!0,this.reefBoxes=this.reefGroup.children.map(o=>new le().setFromObject(o)),this.layoutReef(),this.spatial.setMeshes(n.map(o=>({mesh:o,solid:o===e.rockSurface}))),this.reconcileSceneChange()})().catch(e=>{this.reefError=e,this.reefVisible=!1,this.reefGroup.visible=!1,this.spatial.setActive(!1),this.report("\u9020\u666F\u672A\u5C31\u7EEA\uFF1A"+e.message),console.error(e)}).finally(()=>{this.reefPromise=null})),await this.reefPromise,this.reefError)return!1;this.reefGroup.visible=this.reefVisible&&this.reefReady&&this.mode==="natural",this.spatial.setActive(this.reefGroup.visible),this.sun.castShadow=this.reefGroup.visible,this.renderer.shadowMap.enabled=this.reefGroup.visible,this.renderer.shadowMap.autoUpdate=!0,this.report(this.reefVisible?"\u56FA\u5B9A\u9020\u666F\u5DF2\u5F00\u542F\uFF0C\u9C7C\u4E0E\u7901\u77F3\u5171\u4EAB\u6DF1\u5EA6\u3002":"\u56FA\u5B9A\u9020\u666F\u5DF2\u5173\u95ED\uFF0C\u989C\u8272\u3001\u6DF1\u5EA6\u548C\u78B0\u649E\u540C\u65F6\u64A4\u9664\u3002"),this.reconcileSceneChange()}layoutReef(){if(!this.reefReady||(this.reefGroup.visible=this.reefVisible&&this.mode==="natural",this.mode!=="natural"))return;let t=-35,e=5,n=1-this.coverage,i=r=>{let o=2;for(let a of this.reefBoxes)for(let c of[a.min.x,a.max.x])for(let l of[a.min.z,a.max.z]){let h=new B(c,a.max.y+r,l).project(this.camera);h.z>=-1&&h.z<=1&&(o=Math.min(o,(1-h.y)/2))}return o};for(let r=0;r<24;r++){let o=(t+e)/2;i(o)>n?t=o:e=o}this.reefGroup.position.y=(t+e)/2,this.reefGroup.updateMatrixWorld(!0),this.spatial.updateMatrices(),this.sun.shadow.needsUpdate=!0}reconcileSceneChange(){this.spatial.setActive(this.reefVisible&&this.reefReady&&this.mode==="natural");for(let t of this.world.fish)this.world.findLegal(t),t.goalAt=0,t.hunt&&this.world.endHunt(t,"scenery-change")}rebuildFish(){_r(this.fishGroup),_r(this.heldGroup);let t=this.world.fish.filter(n=>n.kind==="clown"&&n.life==="alive"),e=["turntable","depth"].includes(this.mode)?[t.at(-1)].filter(Boolean):this.mode==="scale"?t.slice(0,6):t;this.records=e.map((n,i)=>({id:n.id,fish:n,kind:"clown",size:n.profile.totalLengthM/.125,position:new B,yaw:0,pitch:0,roll:0,phase:0,tailAmplitude:.02,pectoral:0,rowing:.4,bend:0,rank:i})),this.school=dm(this.fishGroup,{fish:this.records.filter(n=>!n.fish.held)}),this.school.setQuality("balanced"),this.heldSchool=dm(this.heldGroup,{fish:this.records.filter(n=>n.fish.held)}),this.heldSchool.setQuality("balanced"),this.heldGroup.traverse(n=>{if(n.isMesh){n.renderOrder=100;for(let i of Array.isArray(n.material)?n.material:[n.material])i.depthTest=!1,i.depthWrite=!1}}),this.renderRevision=this.world.revision}async loadPredator(){if(!this.predator)return this.predatorPromise?this.predatorPromise:(this.predatorPromise=(async()=>{let t=await new uu().loadAsync(new URL("./assets/barramundi/BarramundiFish.gltf",import.meta.url).href);t.scene.updateMatrixWorld(!0);let e=[];if(t.scene.traverse(c=>{c.isMesh&&e.push(c)}),e.length!==1)throw new Error("Predator asset contract changed");let n=e[0],i=n.geometry.clone();i.applyMatrix4(n.matrixWorld),i.rotateY(Math.PI/2),i.center(),i.computeBoundingBox();let r=i.boundingBox.max.x-i.boundingBox.min.x;this.predatorModelLength=r;let o=n.material.clone(),a={phase:{value:0},amplitude:{value:0}};if(this.predatorUniforms=a,o.onBeforeCompile=c=>{c.uniforms.swimPhase=a.phase,c.uniforms.swimAmplitude=a.amplitude,c.vertexShader=c.vertexShader.replace("#include <common>",`#include <common>
uniform float swimPhase;uniform float swimAmplitude;float bendAt(float x){float a=clamp(.5-x/${r.toFixed(7)},0.,1.);return sin(swimPhase-a*4.)*swimAmplitude*a*a;}float slopeAt(float x){return (bendAt(x+.0001)-bendAt(x-.0001))/.0002;}`).replace("#include <beginnormal_vertex>",`#include <beginnormal_vertex>
objectNormal.x-=slopeAt(position.x)*objectNormal.z;
#ifdef USE_TANGENT
objectTangent.z+=slopeAt(position.x)*objectTangent.x;
#endif`).replace("#include <begin_vertex>",`#include <begin_vertex>
transformed.z+=bendAt(position.x);`)},o.customProgramCacheKey=()=>"reef-lab-barramundi-v1",this.predator=new pe(i,o),this.predator.receiveShadow=!0,this.predator.visible=!1,this.scene.add(this.predator),n.geometry.dispose(),n.material.dispose(),this.disposed){for(let c of Object.values(o))c?.isTexture&&c.dispose();i.dispose(),o.dispose(),this.scene.remove(this.predator)}})().catch(t=>{throw this.predatorPromise=null,t}),this.predatorPromise)}render(t=!1){if(this.disposed||this.failed)return;let e=performance.now();if(!t&&e-(this.lastRender||0)<32)return;this.lastRender&&(this.fpsWindow=this.fpsWindow||[],this.fpsWindow.push(e-this.lastRender),this.fpsWindow.length>120&&this.fpsWindow.shift()),this.lastRender=e,this.renderRevision!==this.world.revision&&this.rebuildFish();let n=new pn(0,0,0,"YZX");this.records.forEach((r,o)=>{let a=r.fish;r.size=a.profile.totalLengthM/.125,this.mode==="natural"?(r.position.copy(a.position).multiplyScalar(10),n.setFromQuaternion(a.quaternion,"YZX"),r.roll=n.x,r.yaw=n.y,r.pitch=n.z):this.mode==="scale"?(r.position.set(-2.45+o*1.1,3.5,0),r.roll=r.yaw=r.pitch=0):this.mode==="depth"?(r.position.set(this.depthSide==="partial"?.35:0,0,this.depthSide==="front"?.75:-.75),r.roll=r.yaw=r.pitch=0):(r.position.set(0,0,0),r.roll=0,r.yaw=this.angle,r.pitch=0),r.center=r.position.clone();let c=new B(1,0,0).applyEuler(new pn(r.roll,r.yaw,r.pitch,"YZX"));r.position.addScaledVector(c,a.profile.totalLengthM*10*.068),r.phase=a.phase,r.tailAmplitude=this.mode==="natural"?a.tailAmplitude:0,r.pectoral=a.pectoral,r.rowing=this.mode==="natural"?a.rowing:0,r.bend=a.bend}),this.school.update(this.camera),this.heldSchool.update(this.camera),this.testStone.visible=this.mode==="depth";let i=this.world.fish.find(r=>r.kind==="barramundi");this.predator&&(this.predator.visible=!!i&&this.mode==="natural"&&i.life==="alive",i&&(this.predator.material.depthTest=!i.held,this.predator.material.depthWrite=!i.held,this.predator.renderOrder=i.held?100:0,this.predator.position.copy(i.position).multiplyScalar(10),this.predator.quaternion.copy(i.quaternion),this.predator.scale.setScalar(i.profile.totalLengthM*10/this.predatorModelLength),this.predatorUniforms.phase.value=i.phase,this.predatorUniforms.amplitude.value=this.predatorModelLength*(.008+Math.min(.025,i.velocity.length()*.04)))),this.foodMesh.count=this.mode==="natural"?this.world.pellets.length:0,this.world.pellets.forEach((r,o)=>{this.dummy.position.copy(r.position).multiplyScalar(10),this.dummy.scale.setScalar(1),this.dummy.updateMatrix(),this.foodMesh.setMatrixAt(o,this.dummy.matrix)}),this.foodMesh.instanceMatrix.needsUpdate=!0,this.ruler.visible=this.mode==="scale",this.ruler.position.set(0,3.5,0),lc.value=this.world.time,e-(this.lastCaustics||0)>95&&(this.caustics.render(this.renderer),this.lastCaustics=e),this.renderer.setRenderTarget(null),this.renderer.clear(),this.renderer.render(this.scene,this.camera),this.reefGroup.visible&&(this.renderer.shadowMap.autoUpdate=!1),this.frames++,this.cpuMs=performance.now()-e}project(t){let e=(this.records.find(n=>n.id===t.id)?.center||t.position.clone().multiplyScalar(10)).clone().project(this.camera);return{x:(e.x+1)*this.width/2,y:(1-e.y)*this.height/2,visible:e.z>=-1&&e.z<=1}}ray(t,e){return this.raycaster.setFromCamera(new Ht(t/this.width*2-1,1-e/this.height*2),this.camera),new dn(this.raycaster.ray.origin.clone().multiplyScalar(.1),this.raycaster.ray.direction.clone())}pick(t,e){if(this.mode!=="natural")return null;let n=this.ray(t,e),i=this.spatial.firstHit(n),r=null;for(let o of this.world.fish){if(!this.world.active(o))continue;let a=o.profile.radiusM,c=Math.max(o.profile.totalLengthM*.28,o.profile.totalLengthM*.5-a),l=o.position.clone().addScaledVector(o.direction,-c),h=o.position.clone().addScaledVector(o.direction,c),u=new B,f=new B,d=n.distanceSqToSegment(l,h,u,f),g=u.distanceTo(n.origin),x=Math.min(.008,g*.005);d<=(a+x)**2&&(!i||g<i.distance-.001)&&(!r||g<r.distance)&&(r={fish:o,distance:g,point:u})}return r}pointerPlane(t,e,n){let i=this.camera.getWorldDirection(new B),r=new ln().setFromNormalAndCoplanarPoint(i,n);return this.ray(t,e).intersectPlane(r,new B)}diagnostics(){return{frames:this.frames,fps:this.fpsWindow?.length?1e3*this.fpsWindow.length/this.fpsWindow.reduce((t,e)=>t+e,0):0,cpuMs:this.cpuMs,mode:this.mode,reefVisible:this.reefVisible,reefReady:this.reefReady,coverage:this.coverage,three:"180",queries:this.spatial.queryCount,shaderErrors:this.shaderErrors.slice(),triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures}}dispose(){if(this.disposed=!0,_r(this.fishGroup),_r(this.heldGroup),_r(this.reefGroup,!0),this.predator){for(let t of Object.values(this.predator.material))t?.isTexture&&t.dispose();this.predator.geometry.dispose(),this.predator.material.dispose()}this.testStone.geometry.dispose(),this.testStone.material.dispose(),this.foodMesh.geometry.dispose(),this.foodMesh.material.dispose(),_r(this.ruler),this.caustics.dispose(),this.environment.dispose(),this.spatial.dispose(),this.renderer.dispose()}};function gP(s,t){let e=new hu,n=new kh({spatial:e}),i=new vu(s,n,e,t),r=!1,o=!1,a=null,c=0,l=null,h=0,u=!1,f=document.getElementById("fish-list"),d=document.getElementById("fish-net"),g=document.getElementById("guides"),x=()=>({started:r,failed:o,entries:n.fish.length,fish:n.fish.filter(S=>S.life==="alive").length,grabbing:!!a});function m(){f.replaceChildren(...n.fish.map(S=>{let M=document.createElement("li"),b=document.createElement("span"),A=document.createElement("button");return b.textContent=`${S.kind==="clown"?"\u5C0F\u4E11\u9C7C":"\u5C16\u543B\u9C88"} \xB7 ${(S.profile.totalLengthM*100).toFixed(1)} cm${S.life==="absent"?" \xB7 \u6682\u65F6\u79BB\u573A":""}`,A.type="button",A.textContent="\u635E\u51FA",A.setAttribute("aria-label",`\u635E\u51FA ${S.id}`),A.disabled=i.mode!=="natural",A.addEventListener("click",()=>{n.remove(S.id),m(),t("\u5DF2\u4ECE\u6F14\u793A\u5C45\u6C11\u4E2D\u635E\u51FA\u3002")}),M.append(b,A),M}))}let p=0;function y(){if(u&&performance.now()-p<100)return;if(p=performance.now(),!u){g.replaceChildren();return}let S=[];for(let b of n.fish){if(b.life!=="alive"||i.mode!=="natural")continue;let A=i.project(b);if(!A.visible)continue;let N=document.createElement("div");N.className="marker",N.dataset.kind="fish",N.dataset.id=b.id,N.textContent=`${(b.profile.totalLengthM*100).toFixed(1)} cm`,N.style.left=A.x+"px",N.style.top=A.y+"px",S.push(N)}for(let b of window.JellyfishSkin?._world()?.jellies||[]){if(i.mode!=="natural"||b.taskId==null)continue;let A=document.createElement("div");A.className="marker jelly-marker",A.dataset.kind="jelly",A.style.left=b.x+"px",A.style.top=b.y+"px",A.textContent="\u4EFB\u52A1\u6C34\u6BCD",S.push(A)}let M=window.TaskCrumpleCore?.binPlacement(null,{width:innerWidth,height:innerHeight},0);if(M){let b=document.createElement("div");b.className="drop-guide",b.dataset.kind="task-bin",b.style.left=M.left+"px",b.style.top=M.top+"px",b.style.width=M.width+"px",b.style.height=M.height+"px",b.textContent="\u4EFB\u52A1\u7EB8\u7BD3",S.push(b)}g.replaceChildren(...S)}function v(){if(!a)return!1;let S=a.fish;return S.position.copy(a.origin),n.setHeld(S.id,!1),n.findLegal(S),a=null,d.hidden=!0,!0}function _(S,M){if(!r||o||a||i.mode!=="natural")return!1;let b=i.pick(S,M);return b?(l=b.fish.id,t("\u5DF2\u6293\u4F4F "+l+"\uFF0C\u62D6\u5230\u5E95\u90E8\u7F51\u515C\u53EF\u635E\u51FA\u3002"),n.setHeld(l,!0),a={fish:b.fish,origin:b.fish.position.clone(),plane:b.fish.position.clone(),x:S,y:M,dragging:!1},!0):!1}function w(S,M){if(!a)return!1;let b=a,A=d.getBoundingClientRect(),N=b.dragging&&S>=A.left&&S<=A.right&&M>=A.top&&M<=A.bottom;return n.setHeld(b.fish.id,!1),a=null,d.hidden=!0,N?(n.remove(b.fish.id),m(),t("\u5DF2\u62D6\u5165\u7F51\u515C\u5E76\u635E\u51FA\u3002")):((!e.clearPose(b.fish,b.fish.position,b.fish.quaternion)||!n.inBounds(b.fish,b.fish.position))&&b.fish.position.copy(b.origin),n.findLegal(b.fish),t(`\u9009\u4E2D ${b.fish.id}\uFF1A\u603B\u957F ${(b.fish.profile.totalLengthM*100).toFixed(1)} cm\uFF0C\u5E74\u9F84\u672A\u77E5\u3002`)),b.dragging}function T(S){if(!(!r||o))try{if((S.width!==i.width||S.height!==i.height)&&i.resize(S.width,S.height),a&&S.pointer){let M=S.pointer;Math.hypot(M.x-a.x,M.y-a.y)>6&&(a.dragging=!0),d.hidden=!a.dragging;let b=i.pointerPlane(M.x,M.y,a.plane);b&&a.fish.position.copy(b)}if(i.mode==="natural"){c+=Math.min(.1,Math.max(0,S.dt/1e3));let M=0;for(;c>=1/60&&M<4;)n.step(1/60),c-=1/60,M++;M===4&&(c=0)}i.render(),y()}catch(M){o=!0,t("\u4E09\u7EF4\u5B9E\u9A8C\u5DF2\u505C\u6B62\uFF1A"+M.message),console.error(M)}}let R={start(){r=!0,s.hidden=!1,m()},stop(){r=!1,v(),s.hidden=!0},isActive:()=>r&&!o,frame:T,hoverAt:(S,M)=>!!(r&&!a&&i.pick(S,M)),grabAt:_,drop:w,cancel:v,state:x,add(){if(i.mode!=="natural")return;let S=n.add();S?(m(),t(`\u52A0\u5165 ${(S.profile.totalLengthM*100).toFixed(1)} cm \u7684\u5C0F\u4E11\u9C7C\u3002`)):t("\u6F14\u793A\u5C45\u6C11\u5DF2\u8FBE\u4E0A\u9650\u3002")},feed(){if(i.mode!=="natural")return;let S=n.feed();t(S.ok?`\u5DF2\u6295\u653E ${S.count} \u7C92\u9972\u6599\uFF1B\u5B9E\u9645\u5403\u5230\u4F1A\u5355\u72EC\u8BA1\u6570\u3002`:"\u6295\u653E\u8FC7\u5FEB\u6216\u9972\u6599\u5DF2\u6EE1\u3002")},async setPredator(S,M=.45){let b=++h;if(!S){n.setPredation(!1);for(let A of[...n.fish])A.kind==="barramundi"&&n.remove(A.id);m();return}t("\u8F7D\u5165 CC0 \u6355\u98DF\u6D4B\u8BD5\u6A21\u578B\u2026");try{if(await i.loadPredator(),b!==h||i.disposed)return;for(let A of[...n.fish])A.kind==="barramundi"&&n.remove(A.id);n.add("barramundi",M),n.setPredation(!0),m(),t("\u6355\u98DF\u884C\u4E3A\u6D4B\u8BD5\u5F00\u542F\uFF1B\u8FD9\u4E0D\u662F\u81EA\u7136\u5171\u6816\u7269\u79CD\u7EC4\u5408\u3002")}catch(A){t("\u6355\u98DF\u6D4B\u8BD5\u6A21\u578B\u52A0\u8F7D\u5931\u8D25\uFF1A"+A.message),document.getElementById("predation").checked=!1}},setReef:async S=>{await i.setReef(S)===!1&&(document.getElementById("reef").checked=!1),i.render(!0)},setCoverage:S=>{i.setCoverage(S),i.render(!0)},setZoom:S=>{i.setZoom(S),i.render(!0)},setMode(S){window.backgroundExperience?.cancelGrab(),v(),i.setMode(S),i.render(!0),document.getElementById("scale-labels").replaceChildren(),document.body.classList.toggle("inspection",S!=="natural"),window.backgroundExperience&&(window.backgroundExperience.settings.jellyfishTasks=S==="natural"),m(),t(S==="natural"?"\u81EA\u7136\u6E38\u52A8\uFF1A\u53EF\u5582\u98DF\u3001\u6293\u53D6\u4E0E\u635E\u51FA\u3002":S==="scale"?"\u540C\u6DF1\u5EA6\u5C3A\u6807\uFF1A\u524D\u516D\u4F4D\u5C45\u6C11\uFF0C\u4E0B\u65B9\u6A2A\u5C3A\u4E3A 10 cm\uFF1B\u8EAB\u4F53\u6CA1\u6709\u5355\u72EC\u653E\u5927\u3002":S==="depth"?"\u5171\u4EAB\u6DF1\u5EA6\u68C0\u67E5\uFF1A\u6D4B\u8BD5\u77F3\u4E0E\u540C\u4E00\u6761\u9C7C\uFF0C\u53EF\u5207\u6362\u524D\u65B9\u3001\u540E\u65B9\u548C\u5C40\u90E8\u906E\u6321\u3002":"\u8F6C\u8EAB\u89C2\u5BDF\uFF1A\u540C\u4E00\u6761\u771F 3D \u9C7C\uFF0C\u89C6\u89D2\u6539\u53D8\u800C\u8EAB\u4F53\u5C3A\u5BF8\u4E0D\u53D8\u3002")},setAngle:S=>{i.setAngle(S),i.render(!0)},setDepth:S=>{i.depthSide=S,i.render(!0),t(S==="front"?"\u540C\u4E00\u6761\u9C7C\u4F4D\u4E8E\u6D4B\u8BD5\u77F3\u524D\u65B9\u3002":S==="back"?"\u540C\u4E00\u6761\u9C7C\u4F4D\u4E8E\u6D4B\u8BD5\u77F3\u540E\u65B9\uFF0C\u6DF1\u5EA6\u6D4B\u8BD5\u5C06\u5176\u906E\u4F4F\u3002":"\u9C7C\u8EAB\u5728\u77F3\u540E\uFF0C\u9732\u51FA\u7684\u90E8\u5206\u4ECD\u53EF\u89C1\uFF1B\u6CA1\u6709\u6539\u53D8\u900F\u660E\u5EA6\u3002")},setGuide:S=>{u=S,y()},diagnostics:()=>({...i.diagnostics(),...n.snapshot(),selected:l,failed:o}),project:()=>n.fish.map(S=>({id:S.id,...i.project(S)})),dispose(){r=!1,v(),i.dispose()}};for(let S of["pointerdown","pointerup"])document.addEventListener(S,M=>{u&&(document.getElementById("interaction-log").textContent=`${S} (${Math.round(M.clientX)}, ${Math.round(M.clientY)}) \xB7 \u547D\u4E2D ${i.pick(M.clientX,M.clientY)?.fish.id||"\u7A7A\u767D"} \xB7 \u6293\u53D6 ${a?.fish.id||"\u65E0"}`)},!0);let L=0;return R.updateUI=()=>{let S=R.diagnostics();document.getElementById("counts").textContent=`\u6E38\u52A8 ${S.fish.filter(b=>b.life==="alive").length} / \u5C45\u6C11 ${S.fish.length} \xB7 \u5DF2\u5403\u9972\u6599 ${S.stats.eaten} \xB7 \u8FFD\u9010 ${S.stats.hunts} \xB7 \u6355\u83B7 ${S.stats.captures} \xB7 \u653E\u5F03 ${S.stats.escapes}`,document.getElementById("diagnostics").textContent=`Three r${S.three} \xB7 \u4E09\u89D2\u5F62 ${S.triangles} \xB7 \u51E0\u4F55 ${S.geometries} \xB7 \u7EB9\u7406 ${S.textures} \xB7 \u5E27\u7387 ${S.fps.toFixed(1)} \xB7 CPU \u63D0\u4EA4 ${S.cpuMs.toFixed(1)} ms\uFF08\u4E0D\u542B GPU\uFF09 \xB7 \u5E27 ${S.frames} \xB7 \u4E16\u754C ${S.time.toFixed(1)} s \xB7 \u9519\u8BEF ${S.shaderErrors.length}`,document.getElementById("event-log").textContent=S.events.filter(b=>["capture","escape","refuge","removed"].includes(b.type)).map(b=>`${b.time.toFixed(1)}s ${b.type} ${b.prey||b.target||b.id} ${b.reason||""}`).join(`
`),n.revision!==L&&(m(),L=n.revision),document.getElementById("scale-labels").replaceChildren(...i.mode==="scale"?i.records.map(b=>{let A=b.fish,N=i.project(A),C=document.createElement("span");return C.textContent=(A.profile.totalLengthM*100).toFixed(1)+" cm",C.style.left=N.x+"px",C.style.top=N.y+45+"px",C}):[])},R}export{gP as createOcean};
/*! Bundled license information:

three/build/three.core.js:
three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2025 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)
*/
