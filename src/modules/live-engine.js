import {storage} from './storage.js';

const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();

export class LiveEngine extends EventTarget{
  constructor(client){
    super();
    this.client=client;
    this.settings=storage.settings();
    this.catalog=[];
    this.activeGameId='';
    this.rules=[];
    this.stats={like:0,chat:0,follow:0,share:0,gift:0,last:null,startedAt:0};
    this.cooldowns=new Map();
    this.likeProgress=new Map();
    storage.profiles();
    storage.setActiveGameId('');
    client.addEventListener('message',e=>this.onMessage(e.detail));
    window.addEventListener('liveplus-game-manifest',e=>this.setActiveGame(e.detail?.gameId||e.detail?.id||''));
    window.addEventListener('liveplus-game-disconnected',()=>this.setActiveGame(''));
  }
  emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}))}
  saveSettings(patch){this.settings={...this.settings,...patch};storage.saveSettings(this.settings);this.emit('state',this.snapshot())}
  snapshot(){return {settings:this.settings,catalog:this.catalog,rules:this.rules,activeGameId:this.activeGameId,stats:{...this.stats}}}
  setActiveGame(gameId){
    const next=String(gameId||'').trim();
    if(next===this.activeGameId&&storage.activeGameId()===next)return false;
    this.activeGameId=next;
    storage.setActiveGameId(next);
    this.rules=next?storage.rulesForGame(next):[];
    this.cooldowns.clear();
    this.likeProgress.clear();
    this.emit('rules-profile',{gameId:next,rules:this.rules,initialized:next?storage.profileInitialized(next):false});
    this.emit('state',this.snapshot());
    return true;
  }
  profileInitialized(gameId=this.activeGameId){return !!gameId&&storage.profileInitialized(gameId)}
  markProfileInitialized(gameId=this.activeGameId,patch={}){if(!gameId)return null;return storage.markProfileInitialized(gameId,patch)}
  resetSession(){this.stats={like:0,chat:0,follow:0,share:0,gift:0,last:null,startedAt:Date.now()};this.likeProgress.clear();this.emit('state',this.snapshot())}
  setMasterCatalog(gifts=[]){const map=new Map();for(const raw of gifts){const id=raw.id==null?'':String(raw.id),name=String(raw.name||'Presente'),key=id||norm(name);if(!key)continue;map.set(key,{...raw,id:id||null,name,diamondCount:Math.max(0,Number(raw.diamondCount)||0),icon:String(raw.icon||''),masterVerified:true,liveVerified:true,liveDivergence:false,verifiedAt:Number(raw.verifiedAt)||Date.now()})}this.catalog=[...map.values()].sort((a,b)=>(a.diamondCount-b.diamondCount)||a.name.localeCompare(b.name));this.emit('catalog',this.catalog);this.emit('state',this.snapshot())}
  onMessage(m){if(m.type==='status'&&m.status==='connected'&&!this.stats.startedAt)this.stats.startedAt=Date.now();if(m.type==='status'&&(m.status==='offline'||(m.status==='disconnected'&&m.unexpected!==true)))this.stats.startedAt=0;const unfinishedStreak=m.type==='gift'&&Number(m.giftType)===1&&m.repeatEnd===false;if(['like','chat','follow','share','gift'].includes(m.type)&&!unfinishedStreak){if(this.settings.capture!==false)this.captureEvent(m);if(this.settings.automation&&this.activeGameId)this.runRules(m)}this.emit('message',m);this.emit('state',this.snapshot())}
  findGift(id,name){const sid=id==null?'':String(id),n=norm(name);return (sid&&this.catalog.find(g=>String(g.id||'')===sid))||(n&&this.catalog.find(g=>norm(g.name)===n))||null}
  captureEvent(m){if(m.type==='like')this.stats.like+=Math.max(1,Number(m.count)||1);else this.stats[m.type]=(this.stats[m.type]||0)+1;this.stats.last={...m,at:Date.now(),verifiedGift:m.type==='gift'?Boolean(this.findGift(m.giftId,m.gift)):undefined}}
  saveRule(rule,{source='user'}={}){
    if(!this.activeGameId)return null;
    const trigger=rule.trigger||'gift';
    const normalized={id:rule.id||crypto.randomUUID?.()||String(Date.now()),enabled:rule.enabled!==false,trigger,giftId:trigger==='gift'&&rule.giftId?String(rule.giftId):'',giftName:trigger==='gift'?String(rule.giftName||''):'',giftIcon:trigger==='gift'?String(rule.giftIcon||''):'',giftValue:trigger==='gift'?Math.max(0,Number(rule.giftValue)||0):0,quantity:['gift','giftvalue','like'].includes(trigger)?Math.max(1,Number(rule.quantity)||1):1,commentText:trigger==='chat'?String(rule.commentText||'').trim():'',cooldown:Math.max(0,Number(rule.cooldown)||0),gameId:this.activeGameId,gameName:String(rule.gameName||''),gameIcon:String(rule.gameIcon||''),actionId:String(rule.actionId||''),actionLabel:String(rule.actionLabel||''),actionIcon:String(rule.actionIcon||''),actionIconImage:String(rule.actionIconImage||''),actionDescription:String(rule.actionDescription||''),actionParams:rule.actionParams&&typeof rule.actionParams==='object'?structuredClone(rule.actionParams):{}};
    const i=this.rules.findIndex(r=>r.id===normalized.id);if(i>=0)this.rules[i]=normalized;else this.rules.push(normalized);
    storage.saveRulesForGame(this.activeGameId,this.rules,{markInitialized:true,userModified:source==='user',source});
    this.emit('state',this.snapshot());return normalized
  }
  deleteRule(id){if(!this.activeGameId)return;this.rules=this.rules.filter(r=>r.id!==id);storage.saveRulesForGame(this.activeGameId,this.rules,{markInitialized:true,userModified:true,source:'user'});this.emit('state',this.snapshot())}
  giftMeta(m){const id=m.giftId==null?'':String(m.giftId),name=String(m.gift||''),g=this.findGift(id,name),unit=Math.max(0,Number(g?.diamondCount)||Number(m.diamondCount)||0),count=Math.max(1,Number(m.count)||1);return{id,name:g?.name||name,count,unit,total:unit*count,verified:Boolean(g)}}
  canFire(rule){const now=Date.now(),until=this.cooldowns.get(rule.id)||0;if(now<until)return false;this.cooldowns.set(rule.id,now+rule.cooldown*1000);return true}
  match(rule,m){if(!rule.enabled||String(rule.gameId||'')!==this.activeGameId)return false;if(rule.trigger==='gift'&&m.type==='gift'){const g=this.giftMeta(m);return g.verified&&((rule.giftId&&g.id===String(rule.giftId))||(!rule.giftId&&rule.giftName&&norm(g.name)===norm(rule.giftName)))&&g.count>=rule.quantity}if(rule.trigger==='giftvalue'&&m.type==='gift'){const g=this.giftMeta(m);return g.verified&&g.total>=rule.quantity}if(rule.trigger==='giftany'&&m.type==='gift')return this.giftMeta(m).verified;if(rule.trigger==='like'&&m.type==='like'){const key=rule.id,progress=(this.likeProgress.get(key)||0)+Math.max(1,Number(m.count)||1);this.likeProgress.set(key,progress);return progress>=rule.quantity}if(rule.trigger==='chat'&&m.type==='chat'){const wanted=norm(rule.commentText);return !wanted||norm(m.comment).includes(wanted)}return rule.trigger===m.type}
  runRules(m){const now=Date.now();for(const rule of this.rules){if(!this.match(rule,m)||!this.canFire(rule))continue;if(rule.trigger==='like')this.likeProgress.set(rule.id,Math.max(0,(this.likeProgress.get(rule.id)||0)-rule.quantity));const gift=m.type==='gift'?this.giftMeta(m):null;const payload={type:'live.rule',version:2,ruleId:rule.id,trigger:rule.trigger,threshold:rule.quantity,commentText:rule.commentText||'',game:{id:rule.gameId||'',name:rule.gameName||''},action:{id:rule.actionId||'',label:rule.actionLabel||'',params:rule.actionParams||{}},event:{type:m.type,user:m.user||'',comment:m.comment||'',gift:gift?.name||m.gift||null,giftId:m.giftId||null,count:m.count||1,diamondValue:gift?.unit||0,totalDiamonds:gift?.total||0,verifiedGift:gift?.verified??null,at:now}};this.client.emitAction('live.rule',payload,rule.id);if(!globalThis.LivePlusServerAutomation?.active?.())this.emit('automation',{rule,event:m,payload})}}
}
