import {storage} from './storage.js';

export class LiveEngine extends EventTarget{
  constructor(client){
    super();this.client=client;this.settings=storage.settings();this.catalog=storage.catalog();this.rules=storage.rules();this.discovered=storage.discovered();
    this.stats={like:0,chat:0,follow:0,share:0,gift:0,last:null,startedAt:0};this.cooldowns=new Map();
    client.addEventListener('message',e=>this.onMessage(e.detail));
  }
  emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}))}
  saveSettings(patch){this.settings={...this.settings,...patch};storage.saveSettings(this.settings);this.emit('state',this.snapshot())}
  snapshot(){return {settings:this.settings,catalog:this.catalog,rules:this.rules,discovered:this.discovered,stats:{...this.stats}}}
  resetSession(){this.stats={like:0,chat:0,follow:0,share:0,gift:0,last:null,startedAt:Date.now()};this.emit('state',this.snapshot())}
  onMessage(m){
    if(m.type==='status'&&m.status==='connected'&&!this.stats.startedAt)this.stats.startedAt=Date.now();
    if(m.type==='gift_catalog'){this.mergeCatalog(m.gifts||[],m.capturedAt||Date.now());}
    if(['like','chat','follow','share','gift'].includes(m.type)){this.captureEvent(m);this.runRules(m)}
    this.emit('message',m);this.emit('state',this.snapshot());
  }
  captureEvent(m){
    if(m.type==='like')this.stats.like+=Math.max(1,Number(m.count)||1);else this.stats[m.type]=(this.stats[m.type]||0)+1;
    this.stats.last={...m,at:Date.now()};
    if(m.type==='gift'&&this.settings.capture!==false){
      const gift={id:m.giftId==null?null:String(m.giftId),name:m.gift||`gift-${m.giftId||'unknown'}`,diamondCount:Number(m.diamondCount)||0,icon:m.icon||'',verifiedAt:Date.now()};
      this.mergeCatalog([gift],Date.now(),true);
      const key=gift.id||gift.name.toLowerCase();if(!this.catalog.some(g=>(g.id||g.name.toLowerCase())===key)){this.discovered=[gift,...this.discovered].slice(0,500);storage.saveDiscovered(this.discovered)}
    }
  }
  mergeCatalog(incoming,capturedAt=Date.now(),verified=false){
    const map=new Map(this.catalog.map(g=>[g.id||g.name.toLowerCase(),g]));
    for(const raw of incoming){const g={...raw,id:raw.id==null?null:String(raw.id),name:String(raw.name||'Presente'),diamondCount:Number(raw.diamondCount)||0,capturedAt,verifiedAt:verified?capturedAt:(raw.verifiedAt||null)};const key=g.id||g.name.toLowerCase();map.set(key,{...(map.get(key)||{}),...g})}
    this.catalog=[...map.values()].sort((a,b)=>(a.diamondCount-b.diamondCount)||a.name.localeCompare(b.name));storage.saveCatalog(this.catalog);this.emit('catalog',this.catalog);
  }
  saveRule(rule){
    const normalized={id:rule.id||crypto.randomUUID?.()||String(Date.now()),enabled:rule.enabled!==false,trigger:rule.trigger||'gift',giftId:rule.giftId?String(rule.giftId):'',giftName:rule.giftName||'',quantity:Math.max(1,Number(rule.quantity)||1),action:String(rule.action||'custom.command'),payload:rule.payload??{},cooldown:Math.max(0,Number(rule.cooldown)||0)};
    const i=this.rules.findIndex(r=>r.id===normalized.id);if(i>=0)this.rules[i]=normalized;else this.rules.push(normalized);storage.saveRules(this.rules);this.emit('state',this.snapshot());return normalized;
  }
  deleteRule(id){this.rules=this.rules.filter(r=>r.id!==id);storage.saveRules(this.rules);this.emit('state',this.snapshot())}
  match(rule,m){
    if(!rule.enabled||rule.trigger!==m.type)return false;
    if(m.type==='gift'){
      const same=rule.giftId?String(m.giftId||'')===String(rule.giftId):rule.giftName?String(m.gift||'').toLowerCase()===String(rule.giftName).toLowerCase():true;
      return same&&Math.max(1,Number(m.count)||1)>=rule.quantity;
    }
    return true;
  }
  runRules(m){
    if(!this.settings.automation)return;
    const now=Date.now();for(const rule of this.rules){if(!this.match(rule,m))continue;const until=this.cooldowns.get(rule.id)||0;if(now<until)continue;this.cooldowns.set(rule.id,now+rule.cooldown*1000);const payload={...rule.payload,trigger:{type:m.type,user:m.user||'',gift:m.gift||null,giftId:m.giftId||null,count:m.count||1,at:now}};this.client.emitAction(rule.action,payload,rule.id);this.emit('automation',{rule,event:m,payload})}
  }
}
