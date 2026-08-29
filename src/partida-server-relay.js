(()=>{'use strict';
const state={code:'',ready:false,game:false,transport:'websocket-relay-v1'};
const sendCloud=payload=>{window.dispatchEvent(new CustomEvent('liveplus-cloud-send',{detail:payload}));return true};
const log=(text,tone='')=>{const out=document.getElementById('matchLog');if(!out)return;const row=document.createElement('div');row.className='matchLogItem '+tone;row.textContent=new Date().toLocaleTimeString('pt-BR')+' · '+text;out.prepend(row);while(out.children.length>12)out.lastChild.remove()};
function currentCode(){return String(window.LivePlusMatch?.getCode?.()||'').trim().toUpperCase()}
function refreshTransport(){const el=document.getElementById('matchTransport');if(!el)return;if(state.game)el.textContent='SERVIDOR ONLINE';else if(state.ready)el.textContent='SERVIDOR AGUARDANDO';}
function create(){const code=currentCode();if(!code)return false;state.code=code;state.ready=false;state.game=false;sendCloud({type:'relay_panel_create',code,ttlMs:5*60*1000});return true}
function leave(){if(state.code)sendCloud({type:'relay_leave',code:state.code});state.code='';state.ready=false;state.game=false}
function handleGamePayload(data){
  if(!data||typeof data!=='object')return;
  if(data.type==='game_manifest'){window.dispatchEvent(new CustomEvent('liveplus-game-manifest',{detail:data.manifest||data}));return}
  if(data.type==='state'){window.dispatchEvent(new CustomEvent('liveplus-game-state',{detail:data}));return}
  if(data.type==='event'){window.dispatchEvent(new CustomEvent('liveplus-game-event',{detail:data}));return}
  window.dispatchEvent(new CustomEvent('liveplus-game-message',{detail:data}));
}
window.addEventListener('liveplus-cloud-message',e=>{
  const m=e.detail||{};
  if(m.type==='relay_panel_ready'&&(!state.code||m.code===state.code)){state.code=m.code;state.ready=true;state.game=!!m.gameConnected;log('Relay do servidor pronto · '+m.code,'ok');refreshTransport();return}
  if(m.type==='relay_game_connected'&&m.code===state.code){state.ready=true;state.game=true;log('Jogo conectado pelo servidor.','ok');refreshTransport();return}
  if(m.type==='relay_game_disconnected'&&m.code===state.code){state.game=false;log('Jogo saiu do relay do servidor. PeerJS continua disponível.','warn');refreshTransport();window.dispatchEvent(new CustomEvent('liveplus-game-disconnected'));return}
  if(m.type==='relay_message'&&m.from==='game'&&m.code===state.code){state.game=true;handleGamePayload(m.payload);refreshTransport();return}
  if(m.type==='relay_error'&&String(m.scope||'').startsWith('panel')){log('Relay servidor · '+(m.message||'erro'),'error')}
});
window.addEventListener('liveplus-cloud-state',e=>{if(e.detail?.online&&e.detail?.authenticated&&currentCode())setTimeout(create,50)});
window.addEventListener('load',()=>{
  const start=document.getElementById('newMatchCode'),end=document.getElementById('endMatchSession');
  start?.addEventListener('click',()=>setTimeout(create,0));
  end?.addEventListener('click',leave);
  const match=window.LivePlusMatch;if(!match||match.__serverRelayWrapped)return;
  const peerSend=match.send.bind(match),peerEnd=match.end.bind(match);
  match.send=data=>{
    if(state.game&&state.code){sendCloud({type:'relay_panel_message',code:state.code,payload:data});return true}
    return peerSend(data);
  };
  match.end=()=>{leave();return peerEnd()};
  match.getTransport=()=>state.game?'server':state.ready?'server-waiting':'peer';
  match.__serverRelayWrapped=true;
});
window.LivePlusServerRelay={create,leave,state:()=>({...state})};
})();
