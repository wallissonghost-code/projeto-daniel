import {TikTokLiveConnection,WebcastEvent} from 'tiktok-live-connector';
import {cleanUsername,commentOf,likeCountOf,normalizeGift,safeSend,userOf} from './protocol.mjs';
import {classifyTikTokError,normalizeModernConnectError,reconnectDelayMs} from './tiktok-resilience.mjs';

const LIKE_FLUSH_MS=800;
const CHAT_BATCH_SIZE=24;
const CHAT_QUEUE_WARN=120;
const CHAT_QUEUE_HARD_MAX=3000;
const MAX_RECOVERY_ATTEMPTS=2;
function onMany(live,names,handler){for(const name of [...new Set(names.filter(Boolean))])live.on(name,handler)}
function firstText(values){for(const value of values){if(typeof value==='string'&&value.trim())return value.trim();if(typeof value==='number'&&Number.isFinite(value))return String(value)}return''}
function fastUserOf(data={}){const user=data?.user||data?.userInfo||data?.author||{};return firstText([data.uniqueId,data.unique_id,data.uniqueID,data.userName,data.username,data.displayId,data.nickname,data.nickName,user.uniqueId,user.unique_id,user.uniqueID,user.userName,user.username,user.displayId,user.nickname,user.nickName])||userOf(data)}
function fastCommentOf(data={}){const msg=data?.message||data?.chat||data?.commentInfo||{};return firstText([data.comment,data.content,data.text,data.msg,typeof data.message==='string'?data.message:'',msg.comment,msg.content,msg.text,msg.message,msg.msg])||commentOf(data)}

export class TikTokSession{
  constructor(ws,{signApiKey='',onEvent=null}={}){
    this.ws=ws;this.signApiKey=signApiKey;this.onEvent=typeof onEvent==='function'?onEvent:null;
    this.mode=signApiKey?'modern-signed':'modern-direct';
    this.state={live:null,username:'',wantedUsername:'',connecting:false,connected:false,generation:0,manualStop:true,hadConnected:false,recoveryTimer:null,recoveryAttempt:0,likeBuffer:new Map(),likeFlushTimer:null,chatQueue:[],chatFlushTimer:null,chatFlushing:false,chatReceived:0,chatDelivered:0,chatDropped:0,chatQueuePeak:0,lastEventAt:0,lastSignal:''};
  }
  status(extra={}){safeSend(this.ws,{type:'status',mode:this.mode,username:this.state.username||this.state.wantedUsername,...extra})}
  debug(event,data={}){safeSend(this.ws,{type:'debug',event,mode:this.mode,...data,at:Date.now()})}
  emitLive(payload){try{this.onEvent?.(payload)}catch(error){this.debug('SERVER_AUTOMATION_ERROR',{detail:String(error?.message||error).slice(0,500)})}safeSend(this.ws,payload)}
  makeLive(username){const options={processInitialData:false,enableExtendedGiftInfo:false,fetchRoomInfoOnConnect:true,webClientOptions:{timeout:{request:12000}},wsClientOptions:{handshakeTimeout:12000}};if(this.signApiKey)options.signApiKey=this.signApiKey;return new TikTokLiveConnection(username,options)}
  touch(kind='event'){this.state.lastEventAt=Date.now();this.state.lastSignal=kind}
  clearRecovery(){if(this.state.recoveryTimer){clearTimeout(this.state.recoveryTimer);this.state.recoveryTimer=null}}
  clearLikes(){if(this.state.likeFlushTimer){clearTimeout(this.state.likeFlushTimer);this.state.likeFlushTimer=null}this.state.likeBuffer.clear()}
  clearChats(){if(this.state.chatFlushTimer){clearTimeout(this.state.chatFlushTimer);this.state.chatFlushTimer=null}this.state.chatQueue.length=0;this.state.chatFlushing=false}
  flushLikes(){this.state.likeFlushTimer=null;for(const item of this.state.likeBuffer.values())this.emitLive({type:'like',user:item.user,count:item.count,liveUser:this.state.username,passive:true});this.state.likeBuffer.clear()}
  queueLike(data){this.touch('like');const user=fastUserOf(data),count=likeCountOf(data),key=String(user).toLowerCase(),prev=this.state.likeBuffer.get(key);if(prev)prev.count=Math.min(50000,prev.count+count);else this.state.likeBuffer.set(key,{user,count});if(!this.state.likeFlushTimer)this.state.likeFlushTimer=setTimeout(()=>this.flushLikes(),LIKE_FLUSH_MS)}
  scheduleChatFlush(){if(this.state.chatFlushTimer||this.state.chatFlushing)return;this.state.chatFlushTimer=setTimeout(()=>{this.state.chatFlushTimer=null;this.flushChats()},0)}
  queueChat(data){
    this.touch('chat');
    const s=this.state,user=fastUserOf(data),comment=fastCommentOf(data);
    s.chatReceived++;
    if(!comment){s.chatDropped++;this.debug('CHAT_IGNORADO_SEM_TEXTO',{received:s.chatReceived,dropped:s.chatDropped});return}
    if(s.chatQueue.length>=CHAT_QUEUE_HARD_MAX){s.chatDropped++;if(s.chatDropped===1||s.chatDropped%25===0)this.debug('CHAT_QUEUE_SATURADA',{queued:s.chatQueue.length,received:s.chatReceived,delivered:s.chatDelivered,dropped:s.chatDropped});return}
    s.chatQueue.push({type:'chat',user,comment,liveUser:s.username});
    s.chatQueuePeak=Math.max(s.chatQueuePeak,s.chatQueue.length);
    if(s.chatQueue.length===CHAT_QUEUE_WARN||s.chatQueue.length===CHAT_QUEUE_WARN*2)this.debug('CHAT_QUEUE_ALTA',{queued:s.chatQueue.length,peak:s.chatQueuePeak,received:s.chatReceived,delivered:s.chatDelivered});
    this.scheduleChatFlush();
  }
  flushChats(){
    const s=this.state;if(s.chatFlushing)return;s.chatFlushing=true;
    try{let count=0;while(count<CHAT_BATCH_SIZE&&s.chatQueue.length){const item=s.chatQueue.shift();this.emitLive(item);s.chatDelivered++;count++}}
    finally{s.chatFlushing=false;if(s.chatQueue.length)this.scheduleChatFlush()}
  }
  attach(live,generation){
    const active=()=>this.state.live===live&&this.state.generation===generation;
    onMany(live,[WebcastEvent?.CHAT,'chat','comment'],d=>{if(!active())return;this.queueChat(d)});
    onMany(live,[WebcastEvent?.LIKE,'like'],d=>active()&&this.queueLike(d));
    onMany(live,[WebcastEvent?.FOLLOW,'follow'],d=>{if(!active())return;this.touch('follow');this.emitLive({type:'follow',user:fastUserOf(d),liveUser:this.state.username})});
    onMany(live,[WebcastEvent?.SHARE,'share'],d=>{if(!active())return;this.touch('share');this.emitLive({type:'share',user:fastUserOf(d),liveUser:this.state.username})});
    onMany(live,[WebcastEvent?.GIFT,'gift'],d=>{if(!active())return;this.touch('gift');this.emitLive({...normalizeGift(d),liveUser:this.state.username})});
    live.on('disconnected',()=>{if(!active())return;this.state.live=null;this.state.connected=false;this.state.connecting=false;this.status({status:'disconnected',reason:'TikTok desconectou',unexpected:!this.state.manualStop});if(!this.state.manualStop&&this.state.hadConnected)this.scheduleRecovery('TikTok desconectou inesperadamente')});
    live.on('error',e=>active()&&this.debug('TIKTOK_ERROR',{detail:String(e?.message||e).slice(0,900)}));
  }
  async dispose({clearUser=false,bump=true}={}){if(bump)this.state.generation+=1;this.clearLikes();this.clearChats();const live=this.state.live;this.state.live=null;this.state.connected=false;this.state.connecting=false;if(clearUser)this.state.username='';if(live){try{live.removeAllListeners?.()}catch{}try{await live.disconnect?.()}catch{}}}
  async connect(raw,{recovery=false}={}){
    const username=cleanUsername(raw);if(!username){safeSend(this.ws,{type:'error',message:'Informe o @usuario da LIVE.'});return false}
    const s=this.state;if(s.connecting)return false;if(s.connected&&s.live&&!recovery){this.status({status:'connected'});return true}
    if(!recovery){this.clearRecovery();s.manualStop=false;s.recoveryAttempt=0;s.hadConnected=false;s.wantedUsername=username;s.chatReceived=0;s.chatDelivered=0;s.chatDropped=0;s.chatQueuePeak=0}
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
  async simulateUnexpectedDrop(){
    const s=this.state;
    if(!s.connected||!s.live||!s.wantedUsername){safeSend(this.ws,{type:'diagnostic_drop_result',ok:false,message:'Nenhuma sessão TikTok ativa para derrubar.'});return false}
    const username=s.wantedUsername;s.manualStop=false;s.hadConnected=true;this.debug('DIAGNOSTIC_DROP_TIKTOK',{username});await this.dispose({clearUser:false,bump:true});s.username=username;s.wantedUsername=username;this.status({status:'disconnected',reason:'Queda simulada pelo diagnóstico',unexpected:true,diagnostic:true});safeSend(this.ws,{type:'diagnostic_drop_result',ok:true,username});this.scheduleRecovery('Queda simulada pelo diagnóstico');return true;
  }
  async disconnect(){const s=this.state;s.manualStop=true;this.clearRecovery();s.recoveryAttempt=0;s.wantedUsername='';s.hadConnected=false;await this.dispose({clearUser:true,bump:true});this.status({status:'disconnected',manual:true})}
  ping(){const s=this.state;return{type:'pong',at:Date.now(),mode:this.mode,username:s.username||s.wantedUsername,tiktokConnected:s.connected,reconnecting:Boolean(s.recoveryTimer),attempt:s.recoveryAttempt,maxAttempts:MAX_RECOVERY_ATTEMPTS,lastEventAt:s.lastEventAt,lastSignal:s.lastSignal,chat:{received:s.chatReceived,delivered:s.chatDelivered,dropped:s.chatDropped,queued:s.chatQueue.length,peak:s.chatQueuePeak}}}
}
