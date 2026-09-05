import { DurableObject } from 'cloudflare:workers';

const PROTOCOL='websocket-relay-v1';
const VERSION='cloudflare-relay-v5';
const AUTOMATION_PROTOCOL='liveplus-cloud-automation-v1';
const CODE_RE=/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/;
const DEFAULT_TTL=5*60*1000;
const ACTIVE_TTL=2*60*60*1000;
const EVENT_MAX_AGE=8000;
const json=(ws,data)=>{try{ws.send(JSON.stringify(data));return true}catch{return false}};
const parse=data=>{try{return JSON.parse(typeof data==='string'?data:new TextDecoder().decode(data))}catch{return null}};
const cleanCode=v=>String(v||'').trim().toUpperCase();
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();

export class LivePlusRelayRoom extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;this.cooldowns=new Map();this.likeProgress=new Map();this.seenEvents=new Map()}
  async roomState(){return await this.ctx.storage.get('session')||null}
  async automationState(){return await this.ctx.storage.get('automation')||{enabled:false,rules:[],catalog:[],actions:[],updatedAt:0}}
  async saveRoom(patch={}){const current=await this.roomState()||{};const next={...current,...patch,updatedAt:Date.now()};await this.ctx.storage.put('session',next);if(next.expiresAt)await this.ctx.storage.setAlarm(next.expiresAt);return next}
  async saveAutomation(payload={}){const actions=(Array.isArray(payload.actions)?payload.actions:[]).map(a=>({id:String(a?.id||''),params:a?.params&&typeof a.params==='object'?a.params:{}})).filter(a=>a.id);const next={enabled:payload.automationEnabled===true,rules:Array.isArray(payload.rules)?payload.rules:[],catalog:Array.isArray(payload.catalog)?payload.catalog:[],actions,updatedAt:Date.now()};await this.ctx.storage.put('automation',next);return next}
  async fetch(request){
    if(request.headers.get('Upgrade')!=='websocket')return new Response('WebSocket required',{status:426});
    const url=new URL(request.url),code=cleanCode(url.searchParams.get('code'));
    if(!CODE_RE.test(code))return new Response('Invalid session code',{status:400});
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];
    this.ctx.acceptWebSocket(server,['pending']);
    server.serializeAttachment({role:'pending',code,authenticated:false});
    const room=await this.roomState();
    json(server,{type:'bridge',status:'ready',authRequired:!!this.env.GAME_RELAY_KEY,service:'liveplus-game-relay',relay:PROTOCOL,automation:AUTOMATION_PROTOCOL,version:VERSION,roomActive:!!room&&Number(room.expiresAt||0)>Date.now()});
    return new Response(null,{status:101,webSocket:client});
  }
  sockets(role){return this.ctx.getWebSockets().filter(ws=>ws.deserializeAttachment()?.role===role)}
  setRole(ws,role,extra={}){const old=ws.deserializeAttachment()||{};ws.serializeAttachment({...old,...extra,role})}
  panel(){return this.sockets('panel')[0]||null}
  game(){return this.sockets('game')[0]||null}
  ingress(){return this.sockets('ingress')[0]||null}
  closeOthers(role,except){for(const s of this.sockets(role))if(s!==except){try{s.close(4001,'session replaced')}catch{}}}
  notifyRole(role,payload){for(const s of this.sockets(role))json(s,payload)}
  giftMeta(m,catalog){const id=m.giftId==null?'':String(m.giftId),name=String(m.gift||''),found=(id&&catalog.find(g=>String(g.id||'')===id))||catalog.find(g=>norm(g.name)===norm(name)),unit=Math.max(0,Number(found?.diamondCount)||Number(m.diamondCount)||0),count=Math.max(1,Number(m.count)||1);return{id,name:found?.name||name,count,unit,total:unit*count,verified:Boolean(found||id||name)}}
  matchRule(rule,m,catalog){if(rule?.enabled===false)return false;if(rule.trigger==='any')return ['like','chat','follow','share','gift'].includes(m.type);if(rule.trigger==='gift'&&m.type==='gift'){const g=this.giftMeta(m,catalog);return g.verified&&((rule.giftId&&g.id===String(rule.giftId))||(!rule.giftId&&rule.giftName&&norm(g.name)===norm(rule.giftName)))&&g.count>=Math.max(1,Number(rule.quantity)||1)}if(rule.trigger==='giftvalue'&&m.type==='gift')return this.giftMeta(m,catalog).total>=Math.max(1,Number(rule.quantity)||1);if(rule.trigger==='giftany'&&m.type==='gift')return this.giftMeta(m,catalog).verified;if(rule.trigger==='like'&&m.type==='like'){const id=String(rule.id||rule.actionId||'like'),p=(this.likeProgress.get(id)||0)+Math.max(1,Number(m.count)||1);this.likeProgress.set(id,p);return p>=Math.max(1,Number(rule.quantity)||1)}if(rule.trigger==='chat'&&m.type==='chat'){const wanted=norm(rule.commentText);return !wanted||wanted==='*'||norm(m.comment).includes(wanted)}return rule.trigger===m.type}
  canFire(rule){const id=String(rule.id||rule.actionId||''),now=Date.now(),until=this.cooldowns.get(id)||0;if(now<until)return false;this.cooldowns.set(id,now+Math.max(0,Number(rule.cooldown)||0)*1000);return true}
  resolveAction(rule,cfg){if(String(rule.actionId||'')!=='__random__')return{id:String(rule.actionId||''),params:rule.actionParams&&typeof rule.actionParams==='object'?rule.actionParams:{}};const actions=Array.isArray(cfg.actions)?cfg.actions.filter(a=>a?.id&&a.id!=='__random__'):[];if(!actions.length)return null;const selected=actions[Math.floor(Math.random()*actions.length)];return{id:String(selected.id),params:selected.params&&typeof selected.params==='object'?selected.params:{}}}
  pruneSeen(now){for(const [id,at] of this.seenEvents)if(now-at>60000)this.seenEvents.delete(id)}
  async routeTikTokEvent(ws,m){const event=m.event&&typeof m.event==='object'?m.event:null;if(!event)return json(ws,{type:'automation_event_ack',ok:false,reason:'invalid_event'});const now=Date.now(),eventId=String(m.eventId||event.eventId||''),receivedAt=Number(m.receivedAt||event.receivedAt||now);this.pruneSeen(now);if(eventId&&this.seenEvents.has(eventId))return json(ws,{type:'automation_event_ack',ok:true,eventId,sent:0,deduplicated:true});if(eventId)this.seenEvents.set(eventId,now);if(now-receivedAt>EVENT_MAX_AGE)return json(ws,{type:'automation_event_ack',ok:true,eventId,sent:0,stale:true});if(event.type==='gift'&&Number(event.giftType)===1&&event.repeatEnd===false)return json(ws,{type:'automation_event_ack',ok:true,eventId,sent:0,pendingGift:true});const cfg=await this.automationState(),game=this.game();if(!cfg.enabled||!game)return json(ws,{type:'automation_event_ack',ok:true,eventId,sent:0,enabled:cfg.enabled,gameConnected:!!game});let sent=0;for(const rule of cfg.rules){if(!rule?.actionId||!this.matchRule(rule,event,cfg.catalog)||!this.canFire(rule))continue;if(rule.trigger==='like'){const id=String(rule.id||rule.actionId||'like'),target=Math.max(1,Number(rule.quantity)||1);this.likeProgress.set(id,Math.max(0,(this.likeProgress.get(id)||0)-target))}const selected=this.resolveAction(rule,cfg);if(!selected?.id)continue;const command={type:'command',protocol:'liveplus-command-v1',gameId:String(rule.gameId||''),action:selected.id,params:selected.params,ruleId:rule.id||'',event:{...event,randomAction:String(rule.actionId||'')==='__random__'?selected.id:undefined},eventId,at:now};json(game,{type:'relay_message',from:'panel',code:ws.deserializeAttachment()?.code,payload:command});sent++}json(ws,{type:'automation_event_ack',ok:true,eventId,sent});const panel=this.panel();if(panel)json(panel,{type:'automation_event_result',eventId,sent,at:now});return true}
  async webSocketMessage(ws,raw){
    const m=parse(raw);if(!m||typeof m!=='object')return;
    const a=ws.deserializeAttachment()||{role:'pending',authenticated:false};
    if(m.type==='auth'){
      const ok=!this.env.GAME_RELAY_KEY||String(m.key||'')===String(this.env.GAME_RELAY_KEY);
      ws.serializeAttachment({...a,authenticated:ok});json(ws,{type:'auth',ok,scope:'game-relay'});if(!ok)try{ws.close(4003,'relay auth failed')}catch{};return;
    }
    if(m.type==='relay_panel_create'){
      const ok=!this.env.GAME_RELAY_KEY||a.authenticated;if(!ok)return json(ws,{type:'relay_error',scope:'auth',message:'Chave privada do relay inválida ou ausente.'});
      const ttl=Math.max(60000,Math.min(ACTIVE_TTL,Number(m.ttlMs)||DEFAULT_TTL));
      const previous=await this.roomState();
      const expiresAt=previous?.consumed?Math.max(Number(previous.expiresAt||0),Date.now()+ACTIVE_TTL):Date.now()+ttl;
      const room=await this.saveRoom({code:a.code,createdAt:previous?.createdAt||Date.now(),expiresAt,consumed:!!previous?.consumed,gameId:previous?.gameId||'',active:true,provisional:false});
      this.closeOthers('panel',ws);this.setRole(ws,'panel',{authenticated:true});
      json(ws,{type:'relay_panel_ready',code:a.code,gameConnected:!!this.game(),ingressConnected:!!this.ingress(),relay:PROTOCOL,automation:AUTOMATION_PROTOCOL,resumed:!!previous});
      const game=this.game();if(game)json(game,{type:'relay_game_ready',code:a.code,panelConnected:true,relay:PROTOCOL,resumed:true});
      if(room.manifest)json(ws,{type:'relay_message',from:'game',code:a.code,payload:room.manifest});
      if(room.lastState)json(ws,{type:'relay_message',from:'game',code:a.code,payload:room.lastState});
      return;
    }
    if(m.type==='relay_game_join'){
      let room=await this.roomState();
      if(!room||!room.active||Number(room.expiresAt||0)<=Date.now()){
        room=await this.saveRoom({code:a.code,createdAt:Date.now(),expiresAt:Date.now()+DEFAULT_TTL,consumed:true,gameId:String(m.gameId||''),active:true,provisional:true,manifest:null,lastState:null});
      }
      this.closeOthers('game',ws);this.setRole(ws,'game');
      room=await this.saveRoom({consumed:true,gameId:String(m.gameId||room.gameId||''),expiresAt:Date.now()+ACTIVE_TTL,active:true});
      const panel=this.panel();json(ws,{type:'relay_game_ready',code:a.code,panelConnected:!!panel,relay:PROTOCOL,resumed:!panel});if(panel)json(panel,{type:'relay_game_connected',code:a.code,gameId:room.gameId||''});this.notifyRole('ingress',{type:'relay_game_connected',code:a.code});return;
    }
    if(m.type==='relay_ingress_join'){
      const ok=!this.env.GAME_RELAY_KEY||a.authenticated;if(!ok)return json(ws,{type:'relay_error',scope:'auth',message:'Ingress não autenticado.'});const room=await this.roomState();if(!room||!room.active||Number(room.expiresAt||0)<=Date.now())return json(ws,{type:'relay_error',scope:'ingress_join',message:'Sessão não encontrada ou expirada.'});this.closeOthers('ingress',ws);this.setRole(ws,'ingress',{authenticated:true});json(ws,{type:'relay_ingress_ready',code:a.code,gameConnected:!!this.game(),automation:AUTOMATION_PROTOCOL});const panel=this.panel();if(panel)json(panel,{type:'relay_ingress_connected',code:a.code});return;
    }
    if(m.type==='automation_config'){
      if(a.role!=='panel'||(!a.authenticated&&this.env.GAME_RELAY_KEY))return json(ws,{type:'relay_error',scope:'automation_config',message:'Somente o painel autenticado pode configurar automações.'});const cfg=await this.saveAutomation(m);json(ws,{type:'automation_config_ack',ok:true,enabled:cfg.enabled,rules:cfg.rules.length,actions:cfg.actions.length,updatedAt:cfg.updatedAt,automation:AUTOMATION_PROTOCOL});return;
    }
    if(m.type==='relay_ingress_event'){if(a.role!=='ingress')return json(ws,{type:'relay_error',scope:'ingress_event',message:'Ingress não registrado.'});return this.routeTikTokEvent(ws,m)}
    if(m.type==='relay_panel_message'){
      if(a.role!=='panel')return;const game=this.game();if(game)json(game,{type:'relay_message',from:'panel',code:a.code,payload:m.payload});return;
    }
    if(m.type==='relay_game_message'){
      if(a.role!=='game')return;
      const payload=m.payload;
      if(payload&&typeof payload==='object'){
        if(payload.type==='game_manifest')await this.saveRoom({manifest:payload});
        if(payload.type==='state')await this.saveRoom({lastState:payload});
      }
      const panel=this.panel();if(panel)json(panel,{type:'relay_message',from:'game',code:a.code,payload});return;
    }
    if(m.type==='relay_status'){
      const room=await this.roomState(),cfg=await this.automationState();return json(ws,{type:'relay_status',code:a.code,roomActive:!!room&&Number(room.expiresAt||0)>Date.now(),consumed:!!room?.consumed,panelConnected:!!this.panel(),gameConnected:!!this.game(),ingressConnected:!!this.ingress(),automationEnabled:!!cfg.enabled,expiresAt:Number(room?.expiresAt||0),relay:PROTOCOL,automation:AUTOMATION_PROTOCOL});
    }
    if(m.type==='relay_leave'){try{ws.close(1000,'leave')}catch{};return}
    if(m.type==='ping')return json(ws,{type:'pong',at:Date.now(),service:'liveplus-game-relay',version:VERSION,automation:AUTOMATION_PROTOCOL});
    json(ws,{type:'relay_error',scope:'protocol',message:'Mensagem não suportada pelo relay.'});
  }
  async webSocketClose(ws,code,reason){
    const a=ws.deserializeAttachment()||{};
    if(a.role==='game'){const panel=this.panel();if(panel)json(panel,{type:'relay_game_disconnected',code:a.code});this.notifyRole('ingress',{type:'relay_game_disconnected',code:a.code})}
    if(a.role==='panel'){const game=this.game();if(game)json(game,{type:'relay_panel_disconnected',code:a.code,roomPreserved:true})}
    if(a.role==='ingress'){const panel=this.panel();if(panel)json(panel,{type:'relay_ingress_disconnected',code:a.code})}
    try{ws.close(code,reason)}catch{}
  }
  async alarm(){
    const room=await this.roomState();if(!room)return;
    if(this.panel()||this.game()||this.ingress()){await this.saveRoom({expiresAt:Date.now()+ACTIVE_TTL,active:true});return}
    if(Number(room.expiresAt||0)<=Date.now()){await this.ctx.storage.delete('session');await this.ctx.storage.delete('automation')}
  }
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/'||url.pathname==='/health')return Response.json({ok:true,service:'liveplus-game-relay',version:VERSION,relay:PROTOCOL,automation:AUTOMATION_PROTOCOL,authRequired:!!env.GAME_RELAY_KEY,provider:'cloudflare'});
    if(url.pathname!=='/relay')return new Response('Not found',{status:404});
    if(request.headers.get('Upgrade')!=='websocket')return new Response('WebSocket required',{status:426});
    const code=cleanCode(url.searchParams.get('code'));if(!CODE_RE.test(code))return new Response('Invalid session code',{status:400});
    const id=env.LIVEPLUS_RELAY.idFromName(code.replace('-',''));
    return env.LIVEPLUS_RELAY.get(id).fetch(request);
  }
};
