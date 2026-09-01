import {safeSend} from './protocol.mjs';

const DEFAULT_TTL_MS=5*60*1000;
const DEFAULT_GRACE_MS=30*1000;
const CODE_RE=/^[A-HJ-NP-Z2-9]{4}-?[A-HJ-NP-Z2-9]{4}$/i;
const sessions=new Map();

const cleanCode=value=>String(value||'').trim().toUpperCase();
const validCode=code=>CODE_RE.test(code);
const alive=ws=>ws&&ws.readyState===1;
const now=()=>Date.now();

function getSession(code){
  const key=cleanCode(code);return sessions.get(key)||null;
}
function newSession(code){
  return{code:cleanCode(code),createdAt:now(),panel:null,game:null,gameId:'',manifest:null,lastState:null,lastGameSeen:0,panelSeen:0,expiresAt:now()+DEFAULT_TTL_MS};
}
function replayCached(session){
  if(!alive(session?.panel))return;
  if(alive(session.game))safeSend(session.panel,{type:'relay_game_connected',code:session.code,gameId:session.gameId||''});
  if(session.manifest)safeSend(session.panel,{type:'relay_message',from:'game',code:session.code,payload:session.manifest});
  if(session.lastState)safeSend(session.panel,{type:'relay_message',from:'game',code:session.code,payload:session.lastState});
}
function createSession(code,panel,options={}){
  const key=cleanCode(code);if(!validCode(key))return{ok:false,error:'Código de sessão inválido.'};
  const existing=sessions.get(key);
  if(existing&&existing.panel!==panel&&alive(existing.panel))return{ok:false,error:'Código de sessão já está em uso.'};
  const session=existing||newSession(key);
  session.panel=panel;session.expiresAt=now()+Number(options.ttlMs||DEFAULT_TTL_MS);session.panelSeen=now();sessions.set(key,session);
  return{ok:true,session};
}
function joinGame(code,game,gameId=''){
  const key=cleanCode(code);if(!validCode(key))return{ok:false,error:'Código de sessão inválido.'};
  let session=sessions.get(key);
  if(!session){
    session=newSession(key);
    sessions.set(key,session);
  }
  if(session.expiresAt&&now()>session.expiresAt&&!alive(session.panel)&&!alive(session.game)){
    session=newSession(key);
    sessions.set(key,session);
  }
  if(session.game&&session.game!==game&&alive(session.game))return{ok:false,error:'Sessão já possui um jogo conectado.'};
  session.game=game;session.gameId=String(gameId||session.gameId||'');session.lastGameSeen=now();session.expiresAt=Math.max(Number(session.expiresAt||0),now()+DEFAULT_TTL_MS);
  return{ok:true,session};
}
function relay(target,message){if(!alive(target))return false;safeSend(target,message);return true}
function handle(ws,m){
  if(m.type==='relay_panel_create'){
    const result=createSession(m.code,ws,{ttlMs:m.ttlMs});
    safeSend(ws,result.ok?{type:'relay_panel_ready',code:result.session.code,transport:'websocket-relay-v1',gameConnected:alive(result.session.game)}:{type:'relay_error',scope:'panel_create',message:result.error});
    if(result.ok)replayCached(result.session);
    return true;
  }
  if(m.type==='relay_game_join'){
    const result=joinGame(m.code,ws,m.gameId);
    if(!result.ok){safeSend(ws,{type:'relay_error',scope:'game_join',message:result.error});return true}
    const s=result.session;safeSend(ws,{type:'relay_game_ready',code:s.code,transport:'websocket-relay-v1',panelConnected:alive(s.panel)});relay(s.panel,{type:'relay_game_connected',code:s.code,gameId:s.gameId});return true;
  }
  if(m.type==='relay_panel_message'){
    const s=getSession(m.code);if(!s||s.panel!==ws){safeSend(ws,{type:'relay_error',scope:'panel_message',message:'Sessão inválida.'});return true}
    relay(s.game,{type:'relay_message',from:'panel',code:s.code,payload:m.payload??null});return true;
  }
  if(m.type==='relay_game_message'){
    const s=getSession(m.code);if(!s||s.game!==ws){safeSend(ws,{type:'relay_error',scope:'game_message',message:'Sessão inválida.'});return true}
    s.lastGameSeen=now();
    const payload=m.payload??null;
    if(payload&&typeof payload==='object'){
      if(payload.type==='game_manifest')s.manifest=payload;
      if(payload.type==='state')s.lastState=payload;
    }
    relay(s.panel,{type:'relay_message',from:'game',code:s.code,payload});return true;
  }
  if(m.type==='relay_leave'){
    detach(ws,m.code);return true;
  }
  return false;
}
function detach(ws,onlyCode=''){
  const wanted=cleanCode(onlyCode);
  for(const [code,s] of sessions){
    if(wanted&&code!==wanted)continue;
    if(s.game===ws){s.game=null;s.lastGameSeen=now();relay(s.panel,{type:'relay_game_disconnected',code});}
    if(s.panel===ws){s.panel=null;s.panelSeen=now();relay(s.game,{type:'relay_panel_disconnected',code});}
  }
}
function sweep(){
  const t=now();for(const [code,s] of sessions){
    const panelGone=!alive(s.panel),gameGone=!alive(s.game);
    const expired=s.expiresAt&&t>s.expiresAt;
    const graceDone=gameGone&&s.lastGameSeen&&t-s.lastGameSeen>DEFAULT_GRACE_MS;
    if((expired&&panelGone&&gameGone)||(panelGone&&gameGone&&graceDone))sessions.delete(code);
  }
}
const sweepTimer=setInterval(sweep,15000);sweepTimer.unref?.();

export const GameRelay={handle,detach,getSession,stats:()=>({sessions:sessions.size})};
