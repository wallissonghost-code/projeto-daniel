import WebSocket from 'ws';

const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const cleanCode=v=>String(v||'').trim().toUpperCase();
const alive=ws=>ws&&ws.readyState===WebSocket.OPEN;

export class ServerAutomation{
  constructor(clientWs){this.clientWs=clientWs;this.ws=null;this.endpoint='';this.key='';this.code='';this.rules=[];this.catalog=[];this.ready=false;this.game=false;this.cooldowns=new Map();this.likeProgress=new Map();}
  configure({endpoint='',key='',code='',rules=[],catalog=[]}={}){
    const nextEndpoint=String(endpoint||'').trim(),nextCode=cleanCode(code);
    if(!/^wss?:\/\//i.test(nextEndpoint)||!nextCode)return false;
    const reconnect=nextEndpoint!==this.endpoint||nextCode!==this.code||String(key||'')!==this.key;
    this.endpoint=nextEndpoint;this.key=String(key||'');this.code=nextCode;this.rules=Array.isArray(rules)?rules:[];this.catalog=Array.isArray(catalog)?catalog:[];
    if(reconnect)this.connect();
    else if(alive(this.ws))this.register();
    return true;
  }
  update({rules,catalog}={}){if(Array.isArray(rules))this.rules=rules;if(Array.isArray(catalog))this.catalog=catalog;return true;}
  connect(){this.close();let ws;try{ws=new WebSocket(this.endpoint)}catch{return false}this.ws=ws;ws.on('open',()=>{});ws.on('message',raw=>{let m;try{m=JSON.parse(raw.toString())}catch{return}if(m.type==='bridge'){if(m.authRequired)ws.send(JSON.stringify({type:'auth',key:this.key}));else this.register()}else if(m.type==='auth'&&m.ok)this.register();else if(m.type==='relay_panel_ready'){this.ready=true;this.game=!!m.gameConnected}else if(m.type==='relay_game_connected')this.game=true;else if(m.type==='relay_game_disconnected')this.game=false});ws.on('close',()=>{this.ready=false;this.game=false;if(this.ws===ws)this.ws=null});ws.on('error',()=>{});return true;}
  register(){if(!alive(this.ws)||!this.code)return false;this.ws.send(JSON.stringify({type:'relay_panel_create',code:this.code,ttlMs:300000}));return true;}
  giftMeta(m){const id=m.giftId==null?'':String(m.giftId),name=String(m.gift||''),found=(id&&this.catalog.find(g=>String(g.id||'')===id))||this.catalog.find(g=>norm(g.name)===norm(name)),unit=Math.max(0,Number(found?.diamondCount)||Number(m.diamondCount)||0),count=Math.max(1,Number(m.count)||1);return{id,name:found?.name||name,count,unit,total:unit*count,verified:Boolean(found||id||name)};}
  match(rule,m){if(rule?.enabled===false)return false;if(rule.trigger==='gift'&&m.type==='gift'){const g=this.giftMeta(m);return g.verified&&((rule.giftId&&g.id===String(rule.giftId))||(!rule.giftId&&rule.giftName&&norm(g.name)===norm(rule.giftName)))&&g.count>=Math.max(1,Number(rule.quantity)||1)}if(rule.trigger==='giftvalue'&&m.type==='gift')return this.giftMeta(m).total>=Math.max(1,Number(rule.quantity)||1);if(rule.trigger==='giftany'&&m.type==='gift')return this.giftMeta(m).verified;if(rule.trigger==='like'&&m.type==='like'){const p=(this.likeProgress.get(rule.id)||0)+Math.max(1,Number(m.count)||1);this.likeProgress.set(rule.id,p);return p>=Math.max(1,Number(rule.quantity)||1)}if(rule.trigger==='chat'&&m.type==='chat'){const wanted=norm(rule.commentText);return !wanted||norm(m.comment).includes(wanted)}return rule.trigger===m.type;}
  canFire(rule){const t=Date.now(),until=this.cooldowns.get(rule.id)||0;if(t<until)return false;this.cooldowns.set(rule.id,t+Math.max(0,Number(rule.cooldown)||0)*1000);return true;}
  onTikTok(m){if(!this.ready||!this.game||!alive(this.ws)||!m||!['gift','like','chat','follow','share'].includes(m.type))return 0;if(m.type==='gift'&&Number(m.giftType)===1&&m.repeatEnd===false)return 0;let sent=0;for(const rule of this.rules){if(!rule?.actionId||!this.match(rule,m)||!this.canFire(rule))continue;if(rule.trigger==='like')this.likeProgress.set(rule.id,Math.max(0,(this.likeProgress.get(rule.id)||0)-Math.max(1,Number(rule.quantity)||1));const command={type:'command',protocol:'liveplus-command-v1',gameId:String(rule.gameId||''),action:String(rule.actionId),params:rule.actionParams&&typeof rule.actionParams==='object'?rule.actionParams:{},ruleId:rule.id||'',event:m,at:Date.now()};this.ws.send(JSON.stringify({type:'relay_panel_message',code:this.code,payload:command}));sent++}return sent;}
  close(){this.ready=false;this.game=false;try{this.ws?.close()}catch{}this.ws=null;}
}
