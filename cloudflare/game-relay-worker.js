import { DurableObject } from 'cloudflare:workers';
import { verifyNotLicenseSession } from './license-session-auth.js';

const PROTOCOL='websocket-relay-v1';
const VERSION='cloudflare-relay-v10';
const ROBLOX_PROTOCOL='not-roblox-bridge-v1';
const AUTOMATION_PROTOCOL='liveplus-cloud-automation-v1';
const CODE_RE=/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/;
const DEFAULT_TTL=5*60*1000;
const ACTIVE_TTL=2*60*60*1000;
const EVENT_MAX_AGE=8000;
const json=(ws,data)=>{try{ws.send(JSON.stringify(data));return true}catch{return false}};
const parse=data=>{try{return JSON.parse(typeof data==='string'?data:new TextDecoder().decode(data))}catch{return null}};
const cleanCode=v=>String(v||'').trim().toUpperCase();
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const enabled=v=>['1','true','yes','on'].includes(String(v||'').trim().toLowerCase());
const protectedGameIds=v=>new Set(String(v||'').split(',').map(x=>x.trim()).filter(Boolean));
const requiresLicense=(env,gameId)=>enabled(env.REQUIRE_NOT_LICENSE_SESSION)||protectedGameIds(env.REQUIRE_NOT_LICENSE_SESSION_GAME_IDS).has(String(gameId||'').trim());

export class LivePlusRelayRoom extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;this.cooldowns=new Map();this.likeProgress=new Map();this.seenEvents=new Map()}
  async roomState(){return await this.ctx.storage.get('session')||null}
  async automationState(){return await this.ctx.storage.get('automation')||{enabled:false,rules:[],catalog:[],actions:[],updatedAt:0}}
  async robloxState(){return await this.ctx.storage.get('roblox')||{cursor:0,commands:[],lastSeenAt:0,gameId:''}}
  async saveRoblox(patch={}){const current=await this.robloxState();const next={...current,...patch};await this.ctx.storage.put('roblox',next);return next}
  async queueRobloxCommand(command){const state=await this.robloxState(),cursor=Number(state.cursor||0)+1,commands=[...(Array.isArray(state.commands)?state.commands:[]),{cursor,command,at:Date.now()}].slice(-100);await this.saveRoblox({cursor,commands});return cursor}
  robloxLive(state){return Number(state?.lastSeenAt||0)>Date.now()-45000}
  async saveRoom(patch={}){const current=await this.roomState()||{};const next={...current,...patch,updatedAt:Date.now()};await this.ctx.storage.put('session',next);if(next.expiresAt)await this.ctx.storage.setAlarm(next.expiresAt);return next}
  async saveAutomation(payload={}){const actions=(Array.isArray(payload.actions)?payload.actions:[]).map(a=>({id:String(a?.id||''),params:a?.params&&typeof a.params==='object'?a.params:{}})).filter(a=>a.id);const next={enabled:payload.automationEnabled===true,rules:Array.isArray(payload.rules)?payload.rules:[],catalog:Array.isArray(payload.catalog)?payload.catalog:[],actions,updatedAt:Date.now()};await this.ctx.storage.put('automation',next);return next}
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/roblox/internal/')){
      if(String(request.headers.get('x-not-roblox-auth')||'')!==String(this.env.GAME_RELAY_KEY||''))return Response.json({ok:false,reason:'unauthorized'},{status:401});
      let body={};try{body=await request.json()}catch{return Response.json({ok:false,reason:'invalid_json'},{status:400})}
      const room=await this.roomState();if(!room||!room.active||Number(room.expiresAt||0)<=Date.now())return Response.json({ok:false,reason:'session_not_found'},{status:404});
      const current=await this.robloxState(),serverId=String(body.serverId||''),credential=String(body.credential||'');
      if(!serverId)return Response.json({ok:false,reason:'missing_server_id'},{status:400});
      if(this.game())return Response.json({ok:false,reason:'session_occupied_by_web_game'},{status:409});
      if(current.serverId&&current.serverId!==serverId&&this.robloxLive(current))return Response.json({ok:false,reason:'session_occupied'},{status:409});
      let activeCredential=String(current.credential||'');
      if(activeCredential){
        if(!credential||credential!==activeCredential)return Response.json({ok:false,reason:'invalid_credential'},{status:401});
      }else{
        activeCredential=crypto.randomUUID();
      }
      if(url.pathname.endsWith('/leave')){
        if(!credential||credential!==activeCredential)return Response.json({ok:false,reason:'invalid_credential'},{status:401});
        await this.saveRoblox({lastSeenAt:0,serverId:'',gameId:'',credential:''});
        return Response.json({ok:true,protocol:ROBLOX_PROTOCOL,connected:false});
      }
      const cursor=Math.max(0,Number(body.cursor||0)),commands=(Array.isArray(current.commands)?current.commands:[]).filter(x=>Number(x.cursor)>cursor);
      const robloxGameId=String(body.gameId||room.gameId||'roblox');
      await this.saveRoblox({lastSeenAt:Date.now(),serverId,gameId:robloxGameId,credential:activeCredential,transport:'roblox-http'});
      const panel=this.panel();
      if(panel)json(panel,{type:'relay_game_connected',code:body.code,gameId:robloxGameId,pairId:body.code,pairState:'paired',transport:'roblox-http',platform:'roblox'});
      if(panel&&body.manifest&&typeof body.manifest==='object'){
        const raw=body.manifest,game=raw.game&&typeof raw.game==='object'?raw.game:{};
        const manifest={
          type:'game_manifest',
          protocol:'liveplus-game-manifest-v1',
          gameId:String(raw.gameId||raw.id||game.id||robloxGameId),
          name:String(raw.name||raw.gameName||game.name||'Roblox'),
          icon:String(raw.icon||game.icon||'🎮'),
          version:String(raw.version||game.version||''),
          actions:(Array.isArray(raw.actions)?raw.actions:[]).map(action=>({
            ...action,
            params:Array.isArray(action?.params)?action.params:Array.isArray(action?.parameters)?action.parameters:[]
          }))
        };
        json(panel,{type:'relay_message',from:'game',code:body.code,payload:manifest});
      }
      return Response.json({ok:true,authorized:true,connected:true,protocol:ROBLOX_PROTOCOL,roomCode:body.code,gameId:robloxGameId,pairId:body.code,pairState:panel?'paired':'game-solo',transport:'roblox-http',credential:activeCredential,cursor:Number(current.cursor||0),commands,panelConnected:!!panel});
    }
    if(request.headers.get('Upgrade')!=='websocket')return new Response('WebSocket required',{status:426});
    const code=cleanCode(url.searchParams.get('code'));
    if(!CODE_RE.test(code))return new Response('Invalid session code',{status:400});
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];
    this.ctx.acceptWebSocket(server,['pending']);
    server.serializeAttachment({role:'pending',code,authenticated:false});
    const room=await this.roomState();
    json(server,{type:'bridge',status:'ready',authRequired:!!this.env.GAME_RELAY_KEY,licenseSessionRequired:enabled(this.env.REQUIRE_NOT_LICENSE_SESSION),selectiveLicenseSessionRequired:protectedGameIds(this.env.REQUIRE_NOT_LICENSE_SESSION_GAME_IDS).size>0,service:'liveplus-game-relay',relay:PROTOCOL,automation:AUTOMATION_PROTOCOL,version:VERSION,roomActive:!!room&&Number(room.expiresAt||0)>Date.now()});
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
  async routeTikTokEvent(ws,m){const event=m.event&&typeof m.event==='object'?m.event:null;if(!event)return json(ws,{type:'automation_event_ack',ok:false,reason:'invalid_event'});const now=Date.now(),eventId=String(m.eventId||event.eventId||''),receivedAt=Number(m.receivedAt||event.receivedAt||now);this.pruneSeen(now);if(eventId&&this.seenEvents.has(eventId))return json(ws,{type:'automation_event_ack',ok:true,eventId,sent:0,deduplicated:true});if(eventId)this.seenEvents.set(eventId,now);if(now-receivedAt>EVENT_MAX_AGE)return json(ws,{type:'automation_event_ack',ok:true,eventId,sent:0,stale:true});if(event.type==='gift'&&Number(event.giftType)===1&&event.repeatEnd===false)return json(ws,{type:'automation_event_ack',ok:true,eventId,sent:0,pendingGift:true});const cfg=await this.automationState(),game=this.game(),roblox=await this.robloxState(),robloxConnected=this.robloxLive(roblox);if(!cfg.enabled||(!game&&!robloxConnected))return json(ws,{type:'automation_event_ack',ok:true,eventId,sent:0,enabled:cfg.enabled,gameConnected:!!game,robloxConnected});let sent=0;for(const rule of cfg.rules){if(!rule?.actionId||!this.matchRule(rule,event,cfg.catalog)||!this.canFire(rule))continue;if(rule.trigger==='like'){const id=String(rule.id||rule.actionId||'like'),target=Math.max(1,Number(rule.quantity)||1);this.likeProgress.set(id,Math.max(0,(this.likeProgress.get(id)||0)-target))}const selected=this.resolveAction(rule,cfg);if(!selected?.id)continue;const command={type:'command',protocol:'liveplus-command-v1',gameId:String(rule.gameId||''),action:selected.id,params:selected.params,ruleId:rule.id||'',event:{...event,randomAction:String(rule.actionId||'')==='__random__'?selected.id:undefined},eventId,at:now};if(game){json(game,{type:'relay_message',from:'panel',code:ws.deserializeAttachment()?.code,payload:command});sent++}else if(robloxConnected){await this.queueRobloxCommand(command);sent++}}json(ws,{type:'automation_event_ack',ok:true,eventId,sent,gameConnected:!!game,robloxConnected});const panel=this.panel();if(panel)json(panel,{type:'automation_event_result',eventId,sent,at:now});return true}
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
      this.closeOthers('panel',ws);this.setRole(ws,'panel',{authenticated:true,pairId:a.code});
      json(ws,{type:'relay_panel_ready',code:a.code,gameConnected:!!this.game(),ingressConnected:!!this.ingress(),relay:PROTOCOL,automation:AUTOMATION_PROTOCOL,resumed:!!previous});
      const game=this.game();if(game)json(game,{type:'relay_game_ready',code:a.code,panelConnected:true,relay:PROTOCOL,resumed:true});
      if(room.manifest)json(ws,{type:'relay_message',from:'game',code:a.code,payload:room.manifest});
      if(room.lastState)json(ws,{type:'relay_message',from:'game',code:a.code,payload:room.lastState});
      return;
    }
    if(m.type==='relay_game_join'){
      const gameId=String(m.gameId||'').trim();
      const requireLicense=requiresLicense(this.env,gameId);
      let license=null,deviceId='';
      if(requireLicense){
        deviceId=String(m.deviceId||'').trim();
        if(!deviceId)return json(ws,{type:'relay_error',scope:'license_session',reason:'missing_device_id',message:'Identificação do dispositivo é obrigatória para validar a sessão NOT.'});
        license=await verifyNotLicenseSession(m.licenseSession,this.env.LICENSE_SESSION_SIGNING_KEY,{deviceId});
        if(!license.ok)return json(ws,{type:'relay_error',scope:'license_session',reason:license.reason,message:'Sessão de licença NOT inválida, expirada ou incompatível com este dispositivo.'});
      }
      let room=await this.roomState();
      if(!room||!room.active||Number(room.expiresAt||0)<=Date.now()){
        room=await this.saveRoom({code:a.code,createdAt:Date.now(),expiresAt:Date.now()+DEFAULT_TTL,consumed:true,gameId,active:true,provisional:true,manifest:null,lastState:null});
      }
      this.closeOthers('game',ws);this.setRole(ws,'game',requireLicense?{licenseVerified:true,licenseExpiresAt:license.expiresAt,deviceId,gameId,pairId:a.code}:{licenseVerified:false,gameId,pairId:a.code});
      room=await this.saveRoom({consumed:true,gameId:gameId||room.gameId||'',expiresAt:Date.now()+ACTIVE_TTL,active:true});
      const panel=this.panel();json(ws,{type:'relay_game_ready',code:a.code,panelConnected:!!panel,gameId:room.gameId||gameId,pairId:a.code,pairState:panel?'paired':'game-solo',relay:PROTOCOL,resumed:!panel,licenseVerified:requireLicense});if(panel)json(panel,{type:'relay_game_connected',code:a.code,gameId:room.gameId||'',pairId:a.code,pairState:'paired'});this.notifyRole('ingress',{type:'relay_game_connected',code:a.code});return;
    }
    if(m.type==='relay_ingress_join'){
      const ok=!this.env.GAME_RELAY_KEY||a.authenticated;if(!ok)return json(ws,{type:'relay_error',scope:'auth',message:'Ingress não autenticado.'});const room=await this.roomState();if(!room||!room.active||Number(room.expiresAt||0)<=Date.now())return json(ws,{type:'relay_error',scope:'ingress_join',message:'Sessão não encontrada ou expirada.'});this.closeOthers('ingress',ws);this.setRole(ws,'ingress',{authenticated:true});json(ws,{type:'relay_ingress_ready',code:a.code,gameConnected:!!this.game(),automation:AUTOMATION_PROTOCOL});const panel=this.panel();if(panel)json(panel,{type:'relay_ingress_connected',code:a.code});return;
    }
    if(m.type==='automation_config'){
      const roleAllowed=a.role==='panel'||a.role==='ingress',ok=roleAllowed&&(!this.env.GAME_RELAY_KEY||a.authenticated);if(!ok)return json(ws,{type:'relay_error',scope:'automation_config',message:'Configuração exige painel ou ingress autenticado.'});const cfg=await this.saveAutomation(m);json(ws,{type:'automation_config_ack',ok:true,enabled:cfg.enabled,rules:cfg.rules.length,actions:cfg.actions.length,updatedAt:cfg.updatedAt,automation:AUTOMATION_PROTOCOL,source:a.role});return;
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
      const room=await this.roomState(),cfg=await this.automationState(),roblox=await this.robloxState(),robloxConnected=this.robloxLive(roblox),gameConnected=!!this.game()||robloxConnected;return json(ws,{type:'relay_status',code:a.code,pairId:a.code,pairState:this.panel()&&gameConnected?'paired':gameConnected?'game-solo':this.panel()?'panel-solo':'inactive',roomActive:!!room&&Number(room.expiresAt||0)>Date.now(),consumed:!!room?.consumed,panelConnected:!!this.panel(),gameConnected,robloxConnected,gameId:robloxConnected?String(roblox.gameId||''):String(room?.gameId||''),transport:robloxConnected?'roblox-http':this.game()?'websocket':'',ingressConnected:!!this.ingress(),automationEnabled:!!cfg.enabled,expiresAt:Number(room?.expiresAt||0),relay:PROTOCOL,automation:AUTOMATION_PROTOCOL});
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
    if(url.pathname==='/'||url.pathname==='/health')return Response.json({ok:true,service:'liveplus-game-relay',version:VERSION,relay:PROTOCOL,automation:AUTOMATION_PROTOCOL,roblox:ROBLOX_PROTOCOL,authRequired:!!env.GAME_RELAY_KEY,licenseSessionRequired:enabled(env.REQUIRE_NOT_LICENSE_SESSION),selectiveLicenseSessionRequired:protectedGameIds(env.REQUIRE_NOT_LICENSE_SESSION_GAME_IDS).size>0,protectedGameCount:protectedGameIds(env.REQUIRE_NOT_LICENSE_SESSION_GAME_IDS).size,provider:'cloudflare'});
    if(url.pathname==='/roblox/poll'||url.pathname==='/roblox/leave'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405});
      let body={};try{body=await request.json()}catch{return Response.json({ok:false,reason:'invalid_json'},{status:400})}
      const code=cleanCode(body.roomCode||body.code);if(!CODE_RE.test(code))return Response.json({ok:false,reason:'invalid_session_code'},{status:400});
      const gameId=String(body.gameId||'').trim(),serverId=String(body.serverId||'').trim();
      if(!serverId)return Response.json({ok:false,reason:'missing_server_id'},{status:400});
      const id=env.LIVEPLUS_RELAY.idFromName(code.replace('-','')),stub=env.LIVEPLUS_RELAY.get(id);
      return stub.fetch(new Request(new URL(`/roblox/internal${url.pathname.endsWith('leave')?'/leave':'/poll'}`,request.url),{method:'POST',headers:{'content-type':'application/json','x-not-roblox-auth':String(env.GAME_RELAY_KEY||'')},body:JSON.stringify({code,gameId,serverId,cursor:Number(body.cursor||0),credential:String(body.credential||'')})}));
    }
    if(url.pathname!=='/relay')return new Response('Not found',{status:404});
    if(request.headers.get('Upgrade')!=='websocket')return new Response('WebSocket required',{status:426});
    const code=cleanCode(url.searchParams.get('code'));if(!CODE_RE.test(code))return new Response('Invalid session code',{status:400});
    const id=env.LIVEPLUS_RELAY.idFromName(code.replace('-',''));
    return env.LIVEPLUS_RELAY.get(id).fetch(request);
  }
};
