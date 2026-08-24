import {TikTokLiveConnection,WebcastEvent} from 'tiktok-live-connector';
import {cleanUsername,commentOf,likeCountOf,normalizeGift,normalizeCatalog,safeSend,userOf} from './protocol.mjs';
import {classifyTikTokError,normalizeModernConnectError,reconnectDelayMs} from './tiktok-resilience.mjs';

const WATCHDOG_INTERVAL_MS=30000,PROBE_AFTER_MS=90000,HARD_STALE_MS=600000,PROBE_TIMEOUT_MS=8000,LIKE_FLUSH_MS=800;
function onMany(live,names,handler){for(const name of [...new Set(names.filter(Boolean))])live.on(name,handler)}
function timeoutPromise(ms,label='timeout'){return new Promise((_,reject)=>setTimeout(()=>reject(new Error(label)),ms))}

export class TikTokSession{
  constructor(ws,{signApiKey=''}={}){
    this.ws=ws;this.signApiKey=signApiKey;
    this.state={live:null,username:'',wantedUsername:'',connecting:false,connected:false,generation:0,manualStop:true,hadConnected:false,recoveryTimer:null,recoveryAttempt:0,lastConnectedAt:0,lastEventAt:0,lastSignal:'',probeBusy:false,probeFailures:0,watchdogTimer:null,likeBuffer:new Map(),likeFlushTimer:null};
  }
  status(extra={}){safeSend(this.ws,{type:'status',username:this.state.username||this.state.wantedUsername,...extra})}
  debug(event,data={}){safeSend(this.ws,{type:'debug',event,...data,at:Date.now()})}
  makeLive(username){
    const options={processInitialData:false,enableExtendedGiftInfo:false,fetchRoomInfoOnConnect:true,webClientOptions:{timeout:{request:12000}},wsClientOptions:{handshakeTimeout:12000}};
    if(this.signApiKey)options.signApiKey=this.signApiKey;
    return new TikTokLiveConnection(username,options);
  }
  touch(kind='event'){this.state.lastEventAt=Date.now();this.state.lastSignal=kind;this.state.probeFailures=0}
  clearRecovery(){if(this.state.recoveryTimer){clearTimeout(this.state.recoveryTimer);this.state.recoveryTimer=null}}
  clearLikes(){if(this.state.likeFlushTimer){clearTimeout(this.state.likeFlushTimer);this.state.likeFlushTimer=null}this.state.likeBuffer.clear()}
  flushLikes(){
    this.state.likeFlushTimer=null;for(const item of this.state.likeBuffer.values())safeSend(this.ws,{type:'like',user:item.user,count:item.count,liveUser:this.state.username,passive:true});this.state.likeBuffer.clear();
  }
  queueLike(data){
    this.touch('like');const user=userOf(data),count=likeCountOf(data),key=String(user).toLowerCase(),prev=this.state.likeBuffer.get(key);
    if(prev)prev.count=Math.min(50000,prev.count+count);else this.state.likeBuffer.set(key,{user,count});
    if(!this.state.likeFlushTimer)this.state.likeFlushTimer=setTimeout(()=>this.flushLikes(),LIKE_FLUSH_MS);
  }
  attach(live,generation){
    const active=()=>this.state.live===live&&this.state.generation===generation;
    onMany(live,[WebcastEvent?.CHAT,'chat','comment'],d=>{if(!active())return;this.touch('chat');safeSend(this.ws,{type:'chat',user:userOf(d),comment:commentOf(d),liveUser:this.state.username})});
    onMany(live,[WebcastEvent?.LIKE,'like'],d=>active()&&this.queueLike(d));
    onMany(live,[WebcastEvent?.FOLLOW,'follow'],d=>{if(!active())return;this.touch('follow');safeSend(this.ws,{type:'follow',user:userOf(d),liveUser:this.state.username})});
    onMany(live,[WebcastEvent?.SHARE,'share'],d=>{if(!active())return;this.touch('share');safeSend(this.ws,{type:'share',user:userOf(d),liveUser:this.state.username})});
    onMany(live,[WebcastEvent?.GIFT,'gift'],d=>{if(!active())return;this.touch('gift');const gift=normalizeGift(d);safeSend(this.ws,{...gift,liveUser:this.state.username})});
    live.on('disconnected',()=>{if(!active())return;this.state.live=null;this.state.connected=false;this.state.connecting=false;this.status({status:'disconnected',reason:'TikTok desconectou',unexpected:!this.state.manualStop});if(!this.state.manualStop&&this.state.hadConnected)this.scheduleRecovery('TikTok desconectou')});
    live.on('error',e=>active()&&this.debug('TIKTOK_ERROR',{detail:String(e?.message||e).slice(0,900)}));
  }
  startWatchdog(){
    if(this.state.watchdogTimer)clearInterval(this.state.watchdogTimer);
    this.state.watchdogTimer=setInterval(()=>this.probe().catch(()=>{}),WATCHDOG_INTERVAL_MS);
  }
  stopWatchdog(){if(this.state.watchdogTimer){clearInterval(this.state.watchdogTimer);this.state.watchdogTimer=null}}
  async probe(){
    const s=this.state,live=s.live,generation=s.generation;if(!live||s.manualStop||s.connecting||s.probeBusy||!s.connected)return;
    const age=Date.now()-(s.lastEventAt||s.lastConnectedAt||Date.now());
    if(typeof live.isConnected==='boolean'&&!live.isConnected)return this.hardReconnect('isConnected=false',generation);
    if(age>HARD_STALE_MS)return this.hardReconnect(`sem sinal por ${Math.round(age/1000)}s`,generation);
    if(age<PROBE_AFTER_MS)return;
    s.probeBusy=true;
    try{
      if(typeof live.fetchIsLive==='function'){
        const isLive=await Promise.race([Promise.resolve(live.fetchIsLive()),timeoutPromise(PROBE_TIMEOUT_MS,'probe timeout')]);
        if(generation!==s.generation||s.live!==live)return;
        if(isLive===false){this.status({status:'offline',reason:'TikTok informou Live offline'});return}
      }
      s.probeFailures=0;this.debug('WATCHDOG_OK',{eventAge:age,quiet:true});
    }catch(e){
      if(generation!==s.generation||s.live!==live)return;s.probeFailures+=1;this.debug('WATCHDOG_FAILED',{detail:String(e?.message||e).slice(0,180),failures:s.probeFailures,eventAge:age});
      if(s.probeFailures>=3)await this.hardReconnect('watchdog falhou 3 vezes',generation);
    }finally{s.probeBusy=false}
  }
  async dispose({clearUser=false,bump=true}={}){
    if(bump)this.state.generation+=1;this.clearLikes();
    const live=this.state.live;this.state.live=null;this.state.connected=false;this.state.connecting=false;
    if(clearUser)this.state.username='';
    if(live){try{live.removeAllListeners?.()}catch{}try{await live.disconnect?.()}catch{}}
  }
  async connect(raw,{recovery=false}={}){
    const username=cleanUsername(raw);if(!username){safeSend(this.ws,{type:'error',message:'Informe o @usuario da LIVE.'});return false}
    if(this.state.connecting)return false;
    await this.dispose({clearUser:false,bump:true});
    const generation=this.state.generation,s=this.state;
    s.username=username;s.wantedUsername=username;s.connecting=true;s.manualStop=false;
    this.status({status:'checking',recovery,attempt:s.recoveryAttempt});
    const live=this.makeLive(username);s.live=live;this.attach(live,generation);
    try{
      const info=await live.connect();
      if(s.generation!==generation||s.live!==live)return false;
      s.connecting=false;s.connected=true;s.hadConnected=true;s.recoveryAttempt=0;s.lastConnectedAt=Date.now();this.touch('connected');this.clearRecovery();this.startWatchdog();
      this.status({status:'connected',roomId:info?.roomId||null,recovered:recovery});return true;
    }catch(rawError){
      if(s.generation!==generation)return false;
      const error=normalizeModernConnectError(rawError),info=classifyTikTokError(error);await this.dispose({clearUser:false,bump:false});
      this.debug('CONNECT_FAILED',{detail:info.message.slice(0,900),rateLimited:info.rateLimited,signingPaywall:info.signingPaywall});
      if(recovery){this.scheduleRecovery(info.message,{rateLimited:info.rateLimited})}else{safeSend(this.ws,{type:'error',message:info.message});this.status({status:'error',reason:info.message})}
      return false;
    }
  }
  scheduleRecovery(reason='queda inesperada',{rateLimited=false}={}){
    const s=this.state;if(s.manualStop||s.connected||s.connecting||s.recoveryTimer||!s.wantedUsername)return;
    const attempt=Math.min(8,(s.recoveryAttempt||0)+1);s.recoveryAttempt=attempt;const delay=reconnectDelayMs(attempt,{rateLimited});
    this.status({status:'reconnecting',attempt,delay,reason});const epoch=s.generation;
    s.recoveryTimer=setTimeout(async()=>{s.recoveryTimer=null;if(s.manualStop||s.connected||s.connecting||epoch!==s.generation)return;await this.connect(s.wantedUsername,{recovery:true})},delay);
  }
  async hardReconnect(reason,generation=this.state.generation){
    const s=this.state;if(generation!==s.generation||s.manualStop||s.connecting||!s.wantedUsername)return;
    this.status({status:'zombie',reason});const username=s.wantedUsername;await this.dispose({clearUser:false,bump:true});s.username=username;s.wantedUsername=username;this.scheduleRecovery(reason);
  }
  async disconnect(){this.state.manualStop=true;this.clearRecovery();this.stopWatchdog();this.state.wantedUsername='';this.state.hadConnected=false;await this.dispose({clearUser:true,bump:true});this.status({status:'disconnected',manual:true})}
  ping(){return{type:'pong',at:Date.now(),username:this.state.username||this.state.wantedUsername,tiktokConnected:this.state.connected,reconnecting:Boolean(this.state.recoveryTimer),attempt:this.state.recoveryAttempt,lastEventAt:this.state.lastEventAt,lastSignal:this.state.lastSignal}}
  async giftCatalog(rawUsername=''){
    const username=cleanUsername(rawUsername||this.state.username||this.state.wantedUsername);if(!username)throw Error('Informe o @ da Live para capturar presentes.');
    let live=this.state.live,owned=false;
    if(!live||typeof live.fetchAvailableGifts!=='function'){live=this.makeLive(username);owned=true}
    try{
      if(owned)await live.connect();
      if(typeof live.fetchAvailableGifts!=='function')throw Error('Connector não expõe fetchAvailableGifts().');
      let raw;
      try{raw=await live.fetchAvailableGifts()}
      catch(e){
        const msg=String(e?.message||e);
        if(/roomid/i.test(msg)&&!owned){
          const fresh=this.makeLive(username);try{await fresh.connect();raw=await fresh.fetchAvailableGifts()}finally{try{fresh.removeAllListeners?.();await fresh.disconnect?.()}catch{}}
        }else throw e;
      }
      const gifts=normalizeCatalog(raw,live);if(!gifts.length)throw Error('TikTok não retornou presentes para esta sala.');return gifts;
    }finally{if(owned){try{live.removeAllListeners?.();await live.disconnect?.()}catch{}}}
  }
}
