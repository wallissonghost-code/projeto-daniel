(()=>{'use strict';
const $=id=>document.getElementById(id);
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SESSION_TTL_MS=5*60*1000;
const RECONNECT_GRACE_MS=30*1000;
let peer=null,activeConn=null,code='',expiresAt=0,lockedPeer='',sessionToken='',graceUntil=0,timer=null,manifest=null;
const log=(text,tone='')=>{const out=$('matchLog');if(!out)return;const row=document.createElement('div');row.className='matchLogItem '+tone;row.textContent=new Date().toLocaleTimeString('pt-BR')+' · '+text;out.prepend(row);while(out.children.length>12)out.lastChild.remove()};
const randomCode=()=>{let s='';for(let i=0;i<8;i++)s+=ALPHABET[Math.floor(Math.random()*ALPHABET.length)];return s.slice(0,4)+'-'+s.slice(4)};
const randomToken=()=>{const a=new Uint32Array(4);crypto.getRandomValues(a);return [...a].map(n=>n.toString(36)).join('')};
const peerId=()=>`liveplus-session-${code.replace(/-/g,'').toLowerCase()}`;
function setState(text,kind=''){const el=$('matchCodeState');if(!el)return;el.textContent=text;el.className='matchCodeState '+kind}
function render(){
  if($('matchCode'))$('matchCode').textContent=code||'—';
  if($('matchExpires')){const left=Math.max(0,expiresAt-Date.now());$('matchExpires').textContent=activeConn?.open?'CÓDIGO CONSUMIDO':left?`${Math.ceil(left/60000)} MIN`:'EXPIRADO'}
  if($('matchController'))$('matchController').textContent=activeConn?.open?'1 JOGO':'0 JOGOS';
  if($('matchPeer'))$('matchPeer').textContent=lockedPeer||'—';
  if($('matchLockState'))$('matchLockState').textContent=activeConn?.open?'TRAVADO · 1 JOGO':lockedPeer&&Date.now()<graceUntil?'RESERVADO PARA RECONEXÃO':'LIVRE';
  if($('matchTransport'))$('matchTransport').textContent=peer&&!peer.destroyed?'WEBRTC ONLINE':'AGUARDANDO';
  if(activeConn?.open)setState(manifest?.name?`${manifest.name} CONECTADO`:'JOGO CONECTADO','busy');else if(peer&&!peer.destroyed)setState('AGUARDANDO JOGO','online');else setState('SESSÃO OFFLINE');
}
function cleanupPeer(){clearInterval(timer);timer=null;try{activeConn?.close()}catch{}try{peer?.destroy()}catch{}activeConn=null;peer=null;lockedPeer='';sessionToken='';graceUntil=0;manifest=null;window.dispatchEvent(new CustomEvent('liveplus-game-disconnected'))}
function reject(conn,reason='SALA EM USO'){try{conn.on('open',()=>{try{conn.send({type:'session_reject',reason})}catch{}setTimeout(()=>{try{conn.close()}catch{}},120)})}catch{try{conn.close()}catch{}}log(`Conexão recusada · ${reason}`,'warn')}
function acceptConnection(conn){
  const incoming=String(conn.peer||'');
  if(activeConn?.open)return reject(conn,'SALA EM USO');
  if(lockedPeer&&incoming!==lockedPeer&&Date.now()<graceUntil)return reject(conn,'SESSÃO RESERVADA PARA O JOGO ANTERIOR');
  activeConn=conn;lockedPeer=incoming||lockedPeer;sessionToken=sessionToken||randomToken();
  conn.on('open',()=>{expiresAt=0;graceUntil=0;try{conn.send({type:'session_accept',token:sessionToken,exclusive:true,transport:'webrtc',protocol:'liveplus-match-v1',manifestProtocol:'liveplus-game-manifest-v1'})}catch{}log('Jogo conectado. Código consumido e sessão travada.','ok');render()});
  conn.on('data',data=>{if(!data||typeof data!=='object')return;if(data.type==='session_hello'&&data.token&&data.token!==sessionToken){reject(conn,'TOKEN DE SESSÃO INVÁLIDO');return}if(data.type==='game_manifest'){manifest=data.manifest||data;window.dispatchEvent(new CustomEvent('liveplus-game-manifest',{detail:manifest}));log(`Manifesto recebido · ${manifest?.name||manifest?.gameName||'jogo'} · ${(manifest?.actions||[]).length} ações`,'ok');render();return}if(data.type==='state')window.dispatchEvent(new CustomEvent('liveplus-game-state',{detail:data}));if(data.type==='event')window.dispatchEvent(new CustomEvent('liveplus-game-event',{detail:data}))});
  conn.on('close',()=>{if(activeConn===conn)activeConn=null;manifest=null;window.dispatchEvent(new CustomEvent('liveplus-game-disconnected'));graceUntil=Date.now()+RECONNECT_GRACE_MS;log('Jogo desconectou · vaga reservada por 30s para reconexão.','warn');render()});
  conn.on('error',()=>log('Oscilação na conexão WebRTC da Partida.','error'));
}
function startSession(){
  cleanupPeer();code=randomCode();expiresAt=Date.now()+SESSION_TTL_MS;sessionToken=randomToken();render();
  if(typeof Peer==='undefined'){setState('PEERJS INDISPONÍVEL');log('PeerJS não carregou no navegador.','error');return}
  peer=new Peer(peerId(),{debug:0});
  peer.on('open',()=>{log(`Sessão criada · ${code}`,'ok');render()});
  peer.on('connection',acceptConnection);
  peer.on('error',e=>{const type=String(e?.type||'');if(type==='unavailable-id'){log('Código colidiu. Gerando outro automaticamente.','warn');setTimeout(startSession,250)}else{log('Erro PeerJS · '+(type||'desconhecido'),'error');setState('ERRO NA SESSÃO')}});
  peer.on('disconnected',()=>{log('Sinalização PeerJS oscilou. Tentando recuperar…','warn');try{peer.reconnect()}catch{}});
  timer=setInterval(()=>{if(!activeConn?.open&&expiresAt&&Date.now()>expiresAt){log('Código temporário expirou. Gere uma nova sessão.','warn');cleanupPeer();code='';expiresAt=0}if(lockedPeer&&graceUntil&&Date.now()>graceUntil&&!activeConn?.open){lockedPeer='';sessionToken='';graceUntil=0;log('Reserva de reconexão liberada.','warn')}render()},1000);
}
function endSession(){cleanupPeer();code='';expiresAt=0;render();log('Sessão encerrada pelo painel.','warn')}
function initTabs(){const tabs=[...document.querySelectorAll('[data-view-tab]')],views=[...document.querySelectorAll('[data-view]')];if(!tabs.length)return;const show=name=>{tabs.forEach(b=>b.classList.toggle('active',b.dataset.viewTab===name));views.forEach(v=>v.hidden=v.dataset.view!==name);try{sessionStorage.setItem('liveplus-view',name)}catch{}};tabs.forEach(b=>b.addEventListener('click',()=>show(b.dataset.viewTab)));show(sessionStorage.getItem('liveplus-view')||'live')}
window.LivePlusMatch={start:startSession,end:endSession,getCode:()=>code,getManifest:()=>manifest,send:data=>{if(!activeConn?.open)return false;try{activeConn.send(data);return true}catch{return false}}};
window.addEventListener('load',()=>{initTabs();render();$('newMatchCode')?.addEventListener('click',startSession);$('endMatchSession')?.addEventListener('click',endSession)});
})();