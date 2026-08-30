import { DurableObject } from 'cloudflare:workers';

const PROTOCOL='websocket-relay-v1';
const VERSION='cloudflare-relay-v1';
const CODE_RE=/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/;
const json=(ws,data)=>{try{ws.send(JSON.stringify(data));return true}catch{return false}};
const parse=data=>{try{return JSON.parse(typeof data==='string'?data:new TextDecoder().decode(data))}catch{return null}};
const cleanCode=v=>String(v||'').trim().toUpperCase();

export class LivePlusRelayRoom extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env}
  async fetch(request){
    if(request.headers.get('Upgrade')!=='websocket')return new Response('WebSocket required',{status:426});
    const url=new URL(request.url),code=cleanCode(url.searchParams.get('code'));
    if(!CODE_RE.test(code))return new Response('Invalid session code',{status:400});
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];
    this.ctx.acceptWebSocket(server,['pending']);
    server.serializeAttachment({role:'pending',code,authenticated:false});
    json(server,{type:'bridge',status:'ready',authRequired:!!this.env.GAME_RELAY_KEY,service:'liveplus-game-relay',relay:PROTOCOL,version:VERSION});
    return new Response(null,{status:101,webSocket:client});
  }
  sockets(role){return this.ctx.getWebSockets().filter(ws=>ws.deserializeAttachment()?.role===role)}
  setRole(ws,role,extra={}){const old=ws.deserializeAttachment()||{};ws.serializeAttachment({...old,...extra,role});}
  panel(){return this.sockets('panel')[0]||null}
  game(){return this.sockets('game')[0]||null}
  closeOthers(role,except){for(const s of this.sockets(role))if(s!==except){try{s.close(4001,'session replaced')}catch{}}}
  async webSocketMessage(ws,raw){
    const m=parse(raw);if(!m||typeof m!=='object')return;
    const a=ws.deserializeAttachment()||{role:'pending',authenticated:false};
    if(m.type==='auth'){
      const ok=!this.env.GAME_RELAY_KEY||String(m.key||'')===String(this.env.GAME_RELAY_KEY);
      ws.serializeAttachment({...a,authenticated:ok});json(ws,{type:'auth',ok,scope:'game-relay'});if(!ok)try{ws.close(4003,'relay auth failed')}catch{};return;
    }
    if(m.type==='relay_panel_create'){
      const ok=!this.env.GAME_RELAY_KEY||a.authenticated;if(!ok)return json(ws,{type:'relay_error',scope:'auth',message:'Chave privada do relay inválida ou ausente.'});
      this.closeOthers('panel',ws);this.setRole(ws,'panel',{authenticated:true});
      json(ws,{type:'relay_panel_ready',code:a.code,gameConnected:!!this.game(),relay:PROTOCOL});
      const game=this.game();if(game)json(game,{type:'relay_game_ready',code:a.code,panelConnected:true,relay:PROTOCOL});return;
    }
    if(m.type==='relay_game_join'){
      this.closeOthers('game',ws);this.setRole(ws,'game');const panel=this.panel();
      json(ws,{type:'relay_game_ready',code:a.code,panelConnected:!!panel,relay:PROTOCOL});if(panel)json(panel,{type:'relay_game_connected',code:a.code});return;
    }
    if(m.type==='relay_panel_message'){
      if(a.role!=='panel')return;const game=this.game();if(game)json(game,{type:'relay_message',from:'panel',code:a.code,payload:m.payload});return;
    }
    if(m.type==='relay_game_message'){
      if(a.role!=='game')return;const panel=this.panel();if(panel)json(panel,{type:'relay_message',from:'game',code:a.code,payload:m.payload});return;
    }
    if(m.type==='relay_leave'){try{ws.close(1000,'leave')}catch{};return}
    if(m.type==='ping')return json(ws,{type:'pong',at:Date.now(),service:'liveplus-game-relay',version:VERSION});
    json(ws,{type:'relay_error',scope:'protocol',message:'Mensagem não suportada pelo relay.'});
  }
  async webSocketClose(ws,code,reason){
    const a=ws.deserializeAttachment()||{};if(a.role==='game'){const panel=this.panel();if(panel)json(panel,{type:'relay_game_disconnected',code:a.code})}
    try{ws.close(code,reason)}catch{}
  }
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/'||url.pathname==='/health')return Response.json({ok:true,service:'liveplus-game-relay',version:VERSION,relay:PROTOCOL,authRequired:!!env.GAME_RELAY_KEY,provider:'cloudflare'});
    if(url.pathname!=='/relay')return new Response('Not found',{status:404});
    if(request.headers.get('Upgrade')!=='websocket')return new Response('WebSocket required',{status:426});
    const code=cleanCode(url.searchParams.get('code'));if(!CODE_RE.test(code))return new Response('Invalid session code',{status:400});
    const id=env.LIVEPLUS_RELAY.idFromName(code.replace('-',''));
    return env.LIVEPLUS_RELAY.get(id).fetch(request);
  }
};
