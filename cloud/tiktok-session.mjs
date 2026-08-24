import {TikTokLiveConnection,WebcastEvent} from 'tiktok-live-connector';
import {cleanUsername,commentOf,likeCountOf,normalizeGift,normalizeCatalog,safeSend,userOf} from './protocol.mjs';
import {classifyTikTokError,normalizeModernConnectError,reconnectDelayMs} from './tiktok-resilience.mjs';

const LIKE_FLUSH_MS=800;
const MAX_RECOVERY_ATTEMPTS=2;
function onMany(live,names,handler){for(const name of [...new Set(names.filter(Boolean))])live.on(name,handler)}

export class TikTokSession{
  constructor(ws,{signApiKey=''}={}){
    this.ws=ws;this.signApiKey=signApiKey;
    this.mode=signApiKey?'modern-signed':'modern-direct';
    this.state={live:null,username:'',wantedUsername:'',connecting:false,connected:false,generation:0,manualStop:true,hadConnected:false,recoveryTimer:null,recoveryAttempt:0,likeBuffer:new Map(),likeFlushTimer:null,lastEventAt:0,lastSignal:''};
  }
  status(extra={}){safeSend(this.ws,{type:'status',mode:this.mode,username:this.state.username||this.state.wantedUsername,...extra})}
  debug(event,data={}){safeSend(this.ws,{type:'debug',event,mode:this.mode,...data,at:Date.now()})}
  makeLive(username){const options={processInitialData:false,enableExtendedGiftInfo:false,fetchRoomInfoOnConnect:true,webClientOptions:{timeout:{request:12000}},wsClientOptions:{handshakeTimeout:12000}};if(this.signApiKey)options.signApiKey=this.signApiKey;return new TikTokLiveConnection(username,options)}
  touch(kind='event'){this.state.lastEventAt=Date.now();this.state.lastSignal=kind}
  clearRecovery(){if(this.state.recoveryTimer){clearTimeout(this.state.recoveryTimer);this.state.recoveryTimer=null}}
  clearLikes(){if(this.state.likeFlushTimer){clearTimeout(this.state.likeFlushTimer);this.state.likeFlushTimer=null}this.state.likeBuffer.clear()}
  flushLikes(){this.state.likeFlushTimer=null;for(const item of this.state.likeBuffer.values())safeSend(this.ws,{type:'like',user:item.user,count:item.count,liveUser:this.state.username,passive:true});this.state.likeBuffer.clear()}
  queueLike(data){this.touch('like');const user=userOf(data),count=likeCountOf(data),key=String(user).toLowerCase(),prev=this.state.likeBuffer.get(key);if(prev)prev.count=Math.min(50000,prev.count+count);else this.state.likeBuffer.set(key,{user,count});if(!this.state.likeFlushTimer)this.state.likeFlushTimer=setTimeout(()=>this.flushLikes(),LIKE_FLUSH_MS)}
  attach(live,generation){
    const active=()=>this.state.live===live&&this.state.generation===generation;
    onMany(live,[WebcastEvent?.CHAT,'chat','comment'],d=>{if(!active())return;this.touch('chat');safeSend(this.ws,{type:'chat',user:userOf(d),comment:commentOf(d),liveUser:this.state.username})});
    onMany(live,[WebcastEvent?.LIKE,'like'],d=>active()&&this.queueLike(d));
    onMany(live,[WebcastEvent?.FOLLOW,'follow'],d=>{if(!active())return;this.touch('follow');safeSend(this.ws,{type:'follow',user:userOf(d),liveUser:this.state.username})});
    onMany(live,[WebcastEvent?.SHARE,'share'],d=>{if(!active())return;this.touch('share');safeSend(this.ws,{type:'share',user:userOf(d),liveUser:this.state.username})});
    onMany(live,[WebcastEvent?.GIFT,'gift'],d=>{if(!active())return;this.touch('gift');safeSend(this.ws,{...normalizeGift(d),liveUser:this.state.username})});
    live.on('disconnected',()=>{if(!active())return;this.state.live=null;this.state.connected=false;this.state.connecting=false;this.status({status:'disconnected',reason:'TikTok desconectou',unexpected:!this.state.manualStop});if(!this.state.manualStop&&this.state.hadConnected)this.scheduleRecovery('TikTok desconectou inesperadamente')});
    live.on('error',e=>active()&&this.debug('TIKTOK_ERROR',{detail:String(e?.message||e).slice(0,900)}));
  }
  async dispose({clearUser=false,bump=true}={}){if(bump)this.state.generation+=1;this.clearLikes();const live=this.state.live;this.state.live=null;this.state.connected=false;this.state.connecting=false;if(clearUser)this.state.username='';if(live){try{live.removeAllListeners?.()}catch{}try{await live.disconnect?.()}catch{}}}
  async connect(raw,{recovery=false}={}){
    const username=cleanUsername(raw);if(!username){safeSend(this.ws,{type:'error',message:'Informe o @usuario da LIVE.'});return false}
    const s=this.state;if(s.connecting)return false;if(s.connected&&s.live&&!recovery){this.status({status:'connected'});return true}
    if(!recovery){this.clearRecovery();s.manualStop=false;s.recoveryAttempt=0;s.hadConnected=false;s.wantedUsername=username}
    await this.dispose({clearUser:false,bump:true});const generation=s.generation;
    s.username=username;s.wantedUsername=username;s.connecting=true;s.connected=false;
    this.status({status:'checking',recovery,attempt:s.recoveryAttempt,maxAttempts:MAX_RECOVERY_ATTEMPTS});
    this.debug(recovery?'AUTO RECOVERY TENTANDO':'CONEXÃO MODERNA INICIADA',{username,attempt:s.recoveryAttempt,signerKey:Boolean(this.signApiKey)});
    const live=this.makeLive(username);s.live=live;this.attach(live,generation);
    try{
      const info=await live.connect();if(s.generation!==generation||s.live!==live)return false;
      s.connecting=false;s.connected=true;s.hadConnected=true;s.recoveryAttempt=0;s.lastEventAt=Date.now();s.lastSignal='connected';this.clearRecovery();
      this.status({status:'connected',roomId:info?.roomId||null,recovered:recovery});this.debug(recovery?'LIVE RECUPERADA':'TIKTOK CONECTADA',{username,roomId:info?.roomId||null});return true;
    }catch(rawError){
      if(s.generation!==generation)return false;const error=normalizeModernConnectError(rawError),info=classifyTikTokError(error);await this.dispose({clearUser:false,bump:false});
      this.debug(recovery?'AUTO RECOVERY FALHOU':'CONNECT_FAILED',{detail:info.message.slice(0,900),rateLimited:info.rateLimited,signingPaywall:info.signingPaywall});
      if(recovery)this.scheduleRecovery(info.message,{rateLimited:info.rateLimited});else{safeSend(this.ws,{type:'error',message:info.message});this.status({status:'error',reason:info.message})}return false;
    }
  }
  scheduleRecovery(reason='queda inesperada',{rateLimited=false}={}){
    const s=this.state;if(s.manualStop||s.connected||s.connecting||s.recoveryTimer||!s.wantedUsername)return;
    const attempt=(s.recoveryAttempt||0)+1;if(attempt>MAX_RECOVERY_ATTEMPTS){this.status({status:'disconnected',reason:'Auto Recovery esgotado. Reconecte manualmente.',recoveryExhausted:true,attempt:s.recoveryAttempt,maxAttempts:MAX_RECOVERY_ATTEMPTS});this.debug('AUTO RECOVERY ESGOTADO',{reason});return}
    s.recoveryAttempt=attempt;const delay=reconnectDelayMs(attempt,{rateLimited});this.status({status:'reconnecting',attempt,maxAttempts:MAX_RECOVERY_ATTEMPTS,delay,reason});this.debug('AUTO RECOVERY AGENDADO',{attempt,maxAttempts:MAX_RECOVERY_ATTEMPTS,delay,reason});const epoch=s.generation;
    s.recoveryTimer=setTimeout(async()=>{s.recoveryTimer=null;if(s.manualStop||s.connected||s.connecting||epoch!==s.generation)return;await this.connect(s.wantedUsername,{recovery:true})},delay);
  }
  async disconnect(){const s=this.state;s.manualStop=true;this.clearRecovery();s.recoveryAttempt=0;s.wantedUsername='';s.hadConnected=false;await this.dispose({clearUser:true,bump:true});this.status({status:'disconnected',manual:true})}
  ping(){return{type:'pong',at:Date.now(),mode:this.mode,username:this.state.username||this.state.wantedUsername,tiktokConnected:this.state.connected,reconnecting:Boolean(this.state.recoveryTimer),attempt:this.state.recoveryAttempt,maxAttempts:MAX_RECOVERY_ATTEMPTS,lastEventAt:this.state.lastEventAt,lastSignal:this.state.lastSignal}}
  async giftCatalog(rawUsername=''){
    const username=cleanUsername(rawUsername||this.state.username||this.state.wantedUsername);if(!username)throw Error('Informe o @ da Live para capturar presentes.');let live=this.state.live,owned=false;if(!live||typeof live.fetchAvailableGifts!=='function'){live=this.makeLive(username);owned=true}
    try{if(owned)await live.connect();if(typeof live.fetchAvailableGifts!=='function')throw Error('Connector não expõe fetchAvailableGifts().');let raw;try{raw=await live.fetchAvailableGifts()}catch(e){const msg=String(e?.message||e);if(/roomid/i.test(msg)&&!owned){const fresh=this.makeLive(username);try{await fresh.connect();raw=await fresh.fetchAvailableGifts()}finally{try{fresh.removeAllListeners?.();await fresh.disconnect?.()}catch{}}}else throw e}const gifts=normalizeCatalog(raw,live);if(!gifts.length)throw Error('TikTok não retornou presentes para esta sala.');return gifts}finally{if(owned){try{live.removeAllListeners?.();await live.disconnect?.()}catch{}}}
  }
}
