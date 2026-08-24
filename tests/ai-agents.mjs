import assert from 'node:assert/strict';

if(!globalThis.localStorage){
  const mem=new Map();
  globalThis.localStorage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k),clear:()=>mem.clear()};
}
if(!globalThis.CustomEvent){
  globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,init={}){super(type);this.detail=init.detail}}
}

const {LiveEngine}=await import('../src/modules/live-engine.js');

class FakeClient extends EventTarget{
  constructor(){super();this.actions=[]}
  push(message){this.dispatchEvent(new CustomEvent('message',{detail:message}))}
  emitAction(action,payload,ruleId){this.actions.push({action,payload,ruleId})}
}

const say=(agent,msg)=>console.log(`[${agent}] ${msg}`);
const luna=(client,event)=>{say('LUNA','evento '+event.type);client.push(event)};
const nexus=(engine,rule)=>{const saved=engine.saveRule({...rule,cooldown:0});say('NEXUS',`regra ${saved.trigger} criada`);return saved};
const sentinel=(cond,msg)=>{assert.ok(cond,msg);say('SENTINEL','OK · '+msg)};

localStorage.clear();
const client=new FakeClient();
const engine=new LiveEngine(client);
engine.saveSettings({automation:true,capture:true,endpoint:'',key:'',username:'qa-live'});
engine.resetSession();

nexus(engine,{trigger:'gift',giftId:'1001',giftName:'Rose',quantity:2});
nexus(engine,{trigger:'giftvalue',quantity:10});
nexus(engine,{trigger:'giftany',quantity:1});
nexus(engine,{trigger:'like',quantity:5});
nexus(engine,{trigger:'follow',quantity:1});
nexus(engine,{trigger:'share',quantity:1});
nexus(engine,{trigger:'chat',quantity:1});

luna(client,{type:'gift',user:'ana',gift:'Rose',giftId:'1001',count:2,diamondCount:5,icon:'https://example.invalid/rose.png'});
luna(client,{type:'like',user:'bia',count:3});
luna(client,{type:'like',user:'bia',count:2});
luna(client,{type:'follow',user:'carlos'});
luna(client,{type:'share',user:'duda'});
luna(client,{type:'chat',user:'eva',comment:'oi'});

sentinel(engine.stats.gift===1,'contador de gifts');
sentinel(engine.stats.like===5,'acumulo de curtidas');
sentinel(engine.stats.follow===1,'contador de seguidores');
sentinel(engine.stats.share===1,'contador de compartilhamentos');
sentinel(engine.stats.chat===1,'contador de comentarios');

const verified=engine.catalog.find(g=>g.id==='1001');
sentinel(Boolean(verified?.liveVerified),'gift real entra como verificado');
sentinel(verified?.diamondCount===5,'valor em diamantes preservado');
sentinel(engine.discovered.some(g=>g.id==='1001'),'gift novo entra em descobertas');

const fired=client.actions.map(x=>x.payload.trigger);
for(const trigger of ['gift','giftvalue','giftany','like','follow','share','chat']) sentinel(fired.includes(trigger),`regra ${trigger} disparou`);
sentinel(client.actions.every(x=>x.action==='live.rule'),'saida universal live.rule');

const giftAction=client.actions.find(x=>x.payload.trigger==='gift');
sentinel(giftAction.payload.event.totalDiamonds===10,'gift calcula valor total corretamente');
sentinel(giftAction.payload.event.user==='ana','usuario do evento preservado');

const likeActions=client.actions.filter(x=>x.payload.trigger==='like');
sentinel(likeActions.length===1,'limiar de likes dispara uma vez ao atingir 5');

const before=client.actions.length;
engine.saveSettings({automation:false});
luna(client,{type:'follow',user:'fran'});
sentinel(client.actions.length===before,'automacao OFF bloqueia disparos');

say('SENTINEL',`AUDITORIA CONCLUIDA · ${client.actions.length} acoes universais validadas`);
