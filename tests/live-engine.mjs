import assert from 'node:assert/strict';

if(!globalThis.localStorage){const mem=new Map();globalThis.localStorage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k),clear:()=>mem.clear()}}
if(!globalThis.CustomEvent){globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,init={}){super(type);this.detail=init.detail}}}

const {LiveEngine}=await import('../src/modules/live-engine.js');
const {normalizeGift}=await import('../cloud/protocol.mjs');

class FakeClient extends EventTarget{
  constructor(){super();this.actions=[]}
  push(message){this.dispatchEvent(new CustomEvent('message',{detail:message}))}
  emitAction(action,payload,ruleId){this.actions.push({action,payload,ruleId})}
}

const nestedGift=normalizeGift({user:{uniqueId:'tester'},giftId:777,giftName:'Nested Rose',repeatCount:2,extendedGiftInfo:{diamond_count:5,picture:{url_list:['https://cdn.example.com/gift.webp']}}});
assert.equal(nestedGift.diamondCount,5);
assert.equal(nestedGift.icon,'https://cdn.example.com/gift.webp');

localStorage.clear();
const client=new FakeClient(),engine=new LiveEngine(client);
engine.setMasterCatalog([{id:'5655',name:'Rose',diamondCount:1,icon:'https://cdn.example.com/rose.png',verifiedAt:1}]);
engine.saveSettings({automation:true,capture:true,endpoint:'',key:'',username:'qa-live'});
engine.resetSession();
engine.saveRule({trigger:'gift',giftId:'5655',giftName:'Rose',quantity:1,cooldown:0});
engine.saveRule({trigger:'giftany',quantity:1,cooldown:0});
engine.saveRule({trigger:'giftvalue',quantity:2,cooldown:0});
engine.saveRule({trigger:'like',quantity:5,cooldown:0});
const chatRule=engine.saveRule({trigger:'chat',commentText:'boss',cooldown:0});

client.push({type:'gift',user:'ana',gift:'Rose',giftId:'5655',count:1,diamondCount:999,icon:'https://wrong.example/x.png'});
assert.equal(engine.catalog.length,1,'evento não altera catálogo mestre');
assert.equal(engine.catalog[0].diamondCount,1,'valor oficial vem do catálogo mestre');
assert.equal(engine.catalog[0].icon,'https://cdn.example.com/rose.png','imagem oficial permanece intacta');
assert.equal(client.actions.filter(x=>x.payload.trigger==='gift').length,1);
assert.equal(client.actions.find(x=>x.payload.trigger==='gift').payload.event.totalDiamonds,1);
assert.equal(client.actions.filter(x=>x.payload.trigger==='giftvalue').length,0,'valor mínimo respeita diamantes oficiais');

client.push({type:'gift',user:'ana',gift:'Rose',giftId:'5655',count:2,diamondCount:999});
assert.equal(client.actions.filter(x=>x.payload.trigger==='giftvalue').length,1,'valor mínimo dispara quando total oficial atinge o limite');

const beforeUnknown=client.actions.length;
client.push({type:'gift',user:'bia',gift:'Unknown Gift',giftId:'999999',count:1,diamondCount:500});
assert.equal(engine.catalog.length,1,'presente desconhecido não entra no catálogo mestre');
assert.equal(client.actions.length,beforeUnknown,'presente desconhecido não dispara regras de gift');
assert.equal(engine.stats.last.verifiedGift,false,'último evento marca gift desconhecido como não verificado');

client.push({type:'like',user:'carlos',count:3});
client.push({type:'like',user:'carlos',count:2});
assert.equal(client.actions.filter(x=>x.payload.trigger==='like').length,1,'likes acumulam e disparam no limiar');

client.push({type:'chat',user:'dani',comment:'oi pessoal'});
assert.equal(client.actions.filter(x=>x.payload.trigger==='chat').length,0,'comentário diferente não dispara');
client.push({type:'chat',user:'dani',comment:'solta o BOSS agora'});
assert.equal(client.actions.filter(x=>x.payload.trigger==='chat').length,1,'comentário configurado dispara sem diferenciar maiúsculas');

const countBeforeEdit=engine.rules.length;
engine.saveRule({...chatRule,commentText:'meteoro',cooldown:3});
assert.equal(engine.rules.length,countBeforeEdit,'editar regra não cria duplicata');
assert.equal(engine.rules.find(r=>r.id===chatRule.id).commentText,'meteoro');
assert.equal(engine.rules.find(r=>r.id===chatRule.id).cooldown,3);

console.log('OK · regras dinâmicas, editáveis e Catálogo Mestre protegidos.');
