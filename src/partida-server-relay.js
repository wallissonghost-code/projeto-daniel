(()=>{'use strict';
const SETTINGS_KEY='daniel.live.plus.v2.settings';
const state={code:'',ready:false,game:false,transport:'websocket-relay-v1',socket:'offline',authenticated:false};
let ws=null,connectPromise=null,reconnectTimer=null,manualClose=false;
const log=(text,tone='')=>{const out=document.getElementById('matchLog');if(!out)return;const row=document.createElement('div');row.className='matchLogItem '+tone;row.textContent=new Date().toLocaleTimeString('pt-BR')+' · '+text;out.prepend(row);while(out.children.length>12)out.lastChild.remove()};
function currentCode(){return String(window.LivePlusMatch?.getCode?.()||'').trim().toUpperCase()}
function readConfig(){
  let saved={};try{saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')||{}}catch{}
  const endpoint=String(document.getElementById('endpoint')?.value||localStorage.getItem('liveplus-relay-endpoint')||saved.endpoint||'').trim();
  const key=String(document.getElementById('accessKey')?.value||saved.key||'');
  return{endpoint,key};
}
function normalizeEndpoint(raw){try{const u=new URL(String(raw||''));if(!['ws:','wss:'].includes(u.protocol))return'';if(location.protocol==='https:'&&u.protocol==='ws:')u.protocol='wss:';return u.toString()}catch{return''}}
function refreshTransport(){
  const el=document.getElementById('matchTransport');if(!el)return;
  if(state.game)el.textContent='SERVIDOR ONLINE';
  else if(state.ready)el.textContent='SERVIDOR AGUARDANDO';
  else if(state.socket==='connecting')el.textContent='SERVIDOR CONECTANDO';
}
function send(payload){if(ws?.readyState!==WebSocket.OPEN||!state.authenticated)return false;try{ws.send(JSON.stringify(payload));return true}catch{return false}}
function registerRoom(){const code=currentCode()||state.code;if(!code||!state.authenticated)return false;state.code=code;state.ready=false;state.game=false;const ok=send({type:'relay_panel_create',code,ttlMs:5*60*1000});refreshTransport();return ok}
function handleGamePayload(data){
  if(!data||typeof data!=='object')return;
  if(data.type==='game_manifest'){window.dispatchEvent(new CustomEvent('liveplus-game-manifest',{detail:data.manifest||data}));return}
  if(data.type==='state'){window.dispatchEvent(new CustomEvent('liveplus-game-state',{detail:data}));return}
  if(data.type==='event'){window.dispatchEvent(new CustomEvent('liveplus-game-event',{detail:data}));return}
  window.dispatchEvent(new CustomEvent('liveplus-game-message',{detail:data}));
}
function handleMessage(m){
  if(!m||typeof m!=='object')return;
  if(m.type==='bridge'&&m.authRequired===false){state.authenticated=true;state.socket='online';registerRoom();return}
  if(m.type==='auth'){
    state.authenticated=!!m.ok;
    if(!m.ok){state.socket='auth-error';log('Relay servidor recusou a chave salva. WebRTC segue como fallback.','error');try{ws?.close()}catch{};return}
    state.socket='online';registerRoom();return;
  }
  if(m.type==='relay_panel_ready'&&(!state.code||m.code===state.code)){state.code=m.code;state.ready=true;state.game=!!m.gameConnected;log('Relay do servidor pronto · '+m.code,'ok');refreshTransport();return}
  if(m.type==='relay_game_connected'&&m.code===state.code){state.ready=true;state.game=true;log('Jogo conectado pelo servidor.','ok');refreshTransport();return}
  if(m.type==='relay_game_disconnected'&&m.code===state.code){state.game=false;log('Jogo saiu do relay do servidor. WebRTC continua disponível.','warn');refreshTransport();window.dispatchEvent(new CustomEvent('liveplus-game-disconnected'));return}
  if(m.type==='relay_message'&&m.from==='game'&&m.code===state.code){state.game=true;handleGamePayload(m.payload);refreshTransport();return}
  if(m.type==='relay_error'&&String(m.scope||'').startsWith('panel')){log('Relay servidor · '+(m.message||'erro'),'error')}
}
function scheduleReconnect(){if(manualClose||reconnectTimer||!currentCode())return;reconnectTimer=setTimeout(()=>{reconnectTimer=null;ensureSocket().catch(()=>{})},900)}
function ensureSocket(){
  const code=currentCode();if(!code)return Promise.resolve(false);
  const {endpoint,key}=readConfig(),target=normalizeEndpoint(endpoint);
  if(!target){state.socket='unconfigured';refreshTransport();return Promise.resolve(false)}
  try{localStorage.setItem('liveplus-relay-endpoint',target)}catch{}
  if(ws?.readyState===WebSocket.OPEN){if(state.authenticated)registerRoom();return Promise.resolve(true)}
  if(connectPromise)return connectPromise;
  manualClose=false;state.socket='connecting';state.authenticated=false;refreshTransport();
  connectPromise=new Promise(resolve=>{
    let settled=false;const done=value=>{if(!settled){settled=true;resolve(value)}};
    try{ws=new WebSocket(target)}catch(error){state.socket='error';log('Relay servidor não abriu. WebRTC segue disponível.','warn');connectPromise=null;done(false);return}
    const timeout=setTimeout(()=>{if(!state.authenticated){state.socket='timeout';try{ws?.close()}catch{};done(false)}},6500);
    ws.onopen=()=>{state.socket='authenticating';refreshTransport();try{ws.send(JSON.stringify({type:'auth',key}))}catch{}};
    ws.onmessage=ev=>{let m;try{m=JSON.parse(ev.data)}catch{return}handleMessage(m);if(state.authenticated){clearTimeout(timeout);done(true)}};
    ws.onerror=()=>{state.socket='error';refreshTransport();done(false)};
    ws.onclose=()=>{clearTimeout(timeout);const hadRoom=state.ready||state.game;state.socket='offline';state.authenticated=false;state.ready=false;state.game=false;ws=null;connectPromise=null;refreshTransport();if(hadRoom&&!manualClose)log('Relay do servidor suspenso. A sessão continua registrada e será retomada ao voltar ao painel.','warn');scheduleReconnect();done(false)};
  }).finally(()=>{connectPromise=null});
  return connectPromise;
}
async function create(){const code=currentCode();if(!code)return false;state.code=code;state.ready=false;state.game=false;await ensureSocket();if(state.authenticated)registerRoom();return state.ready||state.authenticated}
function leave(){manualClose=true;clearTimeout(reconnectTimer);reconnectTimer=null;if(state.code&&state.authenticated)send({type:'relay_leave',code:state.code});state.code='';state.ready=false;state.game=false;state.authenticated=false;state.socket='offline';try{ws?.close()}catch{}ws=null;refreshTransport()}
function resumeRelay(){if(!currentCode())return;manualClose=false;ensureSocket().catch(()=>{})}
window.addEventListener('load',()=>{
  const start=document.getElementById('newMatchCode'),end=document.getElementById('endMatchSession');
  start?.addEventListener('click',()=>setTimeout(create,0));
  end?.addEventListener('click',leave);
  const match=window.LivePlusMatch;if(!match||match.__serverRelayWrapped)return;
  const peerSend=match.send.bind(match),peerEnd=match.end.bind(match);
  match.send=data=>{if(state.game&&state.code&&send({type:'relay_panel_message',code:state.code,payload:data}))return true;return peerSend(data)};
  match.end=()=>{leave();return peerEnd()};
  match.getTransport=()=>state.game?'server':state.ready?'server-waiting':'peer';
  match.__serverRelayWrapped=true;
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resumeRelay()});
window.addEventListener('pageshow',resumeRelay);window.addEventListener('online',resumeRelay);
setInterval(()=>{if(state.ready||state.game||state.socket==='connecting')refreshTransport()},500);
window.LivePlusServerRelay={create,leave,resume:resumeRelay,state:()=>({...state})};
})();
