import {storage} from './storage.js';

const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();

export class LiveEngine extends EventTarget{
  constructor(client){
    super();this.client=client;this.settings=storage.settings();this.catalog=storage.catalog();this.rules=storage.rules();this.discovered=storage.discovered();
    this.stats={like:0,chat:0,follow:0,share:0,gift:0,last:null,startedAt:0};this.cooldowns=new Map();this.likeProgress=new Map();
    client.addEventListener('message',e=>this.onMessage(e.detail));
  }
  emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}))}
  saveSettings(patch){this.settings={...this.settings,...patch};storage.saveSettings(this.settings);this.emit('state',this.snapshot())}
  snapshot(){return {settings:this.settings,catalog:this.catalog,rules:this.rules,discovered:this.discovered,stats:{...this.stats}}}
  resetSession(){this.stats={like:0,chat:0,follow:0,share:0,gift:0,last:null,startedAt:Date.now()};this.likeProgress.clear();this.emit('state',this.snapshot())}
  onMessage(m){
    if(m.type==='status'&&m.status==='connected'&&!this.stats.startedAt&&!m.observer)this.stats.startedAt=Date.now();
    if(m.type==='gift_catalog')this.mergeCatalog(m.gifts||[],m.capturedAt||Date.now(),false);
    if(['like','chat','follow','share','gift'].includes(m.type)){this.captureEvent(m);if(!m.observer)this.runRules(m)}
    this.emit('message',m);this.emit('state',this.snapshot());
  }
  findGift(id,name){
    const sid=id==null?'':String(id),n=norm(name);
    return (sid&&this.catalog.find(g=>String(g.id||'')===sid))||(n&&this.catalog.find(g=>norm(g.name)===n))||null;
  }
  captureEvent(m){
    if(!m.observer){if(m.type==='like')this.stats.like+=Math.max(1,Number(m.count)||1);else this.stats[m.type]=(this.stats[m.type]||0)+1;this.stats.last={...m,at:Date.now()}}
    if(m.type==='gift'&&this.settings.capture!==false){
      const known=this.findGift(m.giftId,m.gift);
      const gift={
        id:m.giftId==null?(known?.id??null):String(m.giftId),
        name:m.gift||known?.name||`gift-${m.giftId||'unknown'}`,
        diamondCount:Number(m.diamondCount)>0?Number(m.diamondCount):Number(known?.diamondCount)||0,
        icon:m.icon||known?.icon||'',
        verifiedAt:Date.now(),liveVerified:true,liveDivergence:false,
        liveVerifiedCount:(Number(known?.liveVerifiedCount)||0)+Math.max(1,Number(m.count)||1)
      };
      const existed=Boolean(known);
      this.mergeCatalog([gift],Date.now(),true);
      if(!existed){
        const key=gift.id||norm(gift.name);
        const old=this.discovered.find(g=>(g.id||norm(g.name))===key);
        const merged={...(old||{}),...gift,diamondCount:gift.diamondCount||old?.diamondCount||0,icon:gift.icon||old?.icon||'',lastSeen:Date.now(),seen:(Number(old?.seen)||0)+Math.max(1,Number(m.count)||1)};
        this.discovered=[merged,...this.discovered.filter(g=>(g.id||norm(g.name))!==key)].slice(0,500);storage.saveDiscovered(this.discovered);
      }
    }
  }
  mergeCatalog(incoming,capturedAt=Date.now(),verified=false){
    const map=new Map(this.catalog.map(g=>[String(g.id||norm(g.name)),g]));
    for(const raw of incoming){
      const id=raw.id==null?null:String(raw.id),name=String(raw.name||'Presente'),key=String(id||norm(name));
      const previous=map.get(key)||this.findGift(id,name)||{};
      const incomingDiamonds=Number(raw.diamondCount)||0;
      const merged={
        ...previous,...raw,id:id??previous.id??null,name:name||previous.name||'Presente',capturedAt,
        diamondCount:incomingDiamonds>0?incomingDiamonds:(Number(previous.diamondCount)||0),
        icon:String(raw.icon||previous.icon||''),
        verifiedAt:verified?capturedAt:(raw.verifiedAt||previous.verifiedAt||null),
        liveVerified:verified?true:Boolean(raw.liveVerified??previous.liveVerified),
        liveDivergence:raw.liveDivergence??previous.liveDivergence??false
      };
      map.set(String(merged.id||norm(merged.name)),merged);
    }
    this.catalog=[...map.values()].sort((a,b)=>(a.diamondCount-b.diamondCount)||a.name.localeCompare(b.name));storage.saveCatalog(this.catalog);this.emit('catalog',this.catalog);
  }
  saveRule(rule){
    const normalized={id:rule.id||crypto.randomUUID?.()||String(Date.now()),enabled:rule.enabled!==false,trigger:rule.trigger||'gift',giftId:rule.giftId?String(rule.giftId):'',giftName:rule.giftName||'',quantity:Math.max(1,Number(rule.quantity)||1),cooldown:Math.max(0,Number(rule.cooldown)||0)};
    const i=this.rules.findIndex(r=>r.id===normalized.id);if(i>=0)this.rules[i]=normalized;else this.rules.push(normalized);storage.saveRules(this.rules);this.emit('state',this.snapshot());return normalized;
  }
  deleteRule(id){this.rules=this.rules.filter(r=>r.id!==id);storage.saveRules(this.rules);this.emit('state',this.snapshot())}
  giftMeta(m){const id=m.giftId==null?'':String(m.giftId),name=String(m.gift||''),g=this.findGift(id,name),unit=Math.max(0,Number(m.diamondCount)||Number(g?.diamondCount)||0),count=Math.max(1,Number(m.count)||1);return{id,name,count,unit,total:unit*count}}
  canFire(rule){const now=Date.now(),until=this.cooldowns.get(rule.id)||0;if(now<until)return false;this.cooldowns.set(rule.id,now+rule.cooldown*1000);return true}
  match(rule,m){
    if(!rule.enabled)return false;
    if(rule.trigger==='gift'&&m.type==='gift'){const g=this.giftMeta(m),same=rule.giftId?g.id===String(rule.giftId):rule.giftName?norm(g.name)===norm(rule.giftName):false;return same&&g.count>=rule.quantity}
    if(rule.trigger==='giftvalue'&&m.type==='gift')return this.giftMeta(m).total>=rule.quantity;
    if(rule.trigger==='giftany'&&m.type==='gift')return true;
    if(rule.trigger==='like'&&m.type==='like'){const key=rule.id,progress=(this.likeProgress.get(key)||0)+Math.max(1,Number(m.count)||1);this.likeProgress.set(key,progress);return progress>=rule.quantity}
    if(rule.trigger==='chat'&&m.type==='chat')return true;
    return rule.trigger===m.type;
  }
  runRules(m){
    if(!this.settings.automation)return;
    const now=Date.now();for(const rule of this.rules){if(!this.match(rule,m)||!this.canFire(rule))continue;if(rule.trigger==='like')this.likeProgress.set(rule.id,Math.max(0,(this.likeProgress.get(rule.id)||0)-rule.quantity));const gift=m.type==='gift'?this.giftMeta(m):null;const payload={type:'live.rule',version:1,ruleId:rule.id,trigger:rule.trigger,threshold:rule.quantity,event:{type:m.type,user:m.user||'',comment:m.comment||'',gift:m.gift||null,giftId:m.giftId||null,count:m.count||1,diamondValue:gift?.unit||0,totalDiamonds:gift?.total||0,at:now}};this.client.emitAction('live.rule',payload,rule.id);this.emit('automation',{rule,event:m,payload})}
  }
}
