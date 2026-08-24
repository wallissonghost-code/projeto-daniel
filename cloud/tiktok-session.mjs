import {TikTokLiveConnection,WebcastEvent} from 'tiktok-live-connector';
import {cleanUsername,deepValue,normalizeGift,normalizeCatalog,safeSend} from './protocol.mjs';

const RECOVERY_DELAYS_MS=[3000,12000];
const userOf=d=>deepValue(d,['uniqueId','unique_id','uniqueID','userName','username','displayId','nickname'])||'viewer';
const commentOf=d=>deepValue(d,['comment','content','text','message','msg'])||'';

function onMany(live,names,handler){for(const name of [...new Set(names.filter(Boolean))]) live.on(name,handler)}
function clearRecovery(s){if(s.recoveryTimer){clearTimeout(s.recoveryTimer);s.recoveryTimer=null}s.recovering=false}

export class TikTokSession{
  constructor(ws,{signApiKey=''}={}){
    this.ws=ws;this.signApiKey=signApiKey;
    this.state={live:null,username:'',wantedUsername:'',connecting:false,connected:false,generation:0,manualStop:true,hadConnected:false,recoveryTimer:null,recoveryAttempt:0,recovering:false};
  }
  status(extra={}){safeSend(this.ws,{type:'status',username:this.state.username||this.state.wantedUsername,...extra})}
  makeLive(username){
    const options={processInitialData:false,enableExtendedGiftInfo:false,fetchRoomInfoOnConnect:true,webClientOptions:{timeout:{request:12000}},wsClientOptions:{handshakeTimeout:12000}};
    if(this.signApiKey) options.signApiKey=this.signApiKey;
    return new TikTokLiveConnection(username,options);
  }
  attach(live,generation){
    const active=()=>this.state.live===live&&this.state.generation===generation;
    onMany(live,[WebcastEvent?.CHAT,'chat','comment'],d=>active()&&safeSend(this.ws,{type:'chat',user:userOf(d),comment:commentOf(d),liveUser:this.state.username}));
    onMany(live,[WebcastEvent?.LIKE,'like'],d=>{if(!active())return;safeSend(this.ws,{type:'like',user:userOf(d),count:Math.max(1,Number(d?.likeCount??d?.like_count??d?.count??1)||1),liveUser:this.state.username})});
    onMany(live,[WebcastEvent?.FOLLOW,'follow'],d=>active()&&safeSend(this.ws,{type:'follow',user:userOf(d),liveUser:this.state.username}));
    onMany(live,[WebcastEvent?.SHARE,'share'],d=>active()&&safeSend(this.ws,{type:'share',user:userOf(d),liveUser:this.state.username}));
    onMany(live,[WebcastEvent?.GIFT,'gift'],d=>{if(!active())return;safeSend(this.ws,{...normalizeGift(d),liveUser:this.state.username})});
    live.on('disconnected',()=>{if(!active())return;this.state.live=null;this.state.connected=false;this.state.connecting=false;this.status({status:'disconnected',reason:'tiktok',unexpected:!this.state.manualStop});if(!this.state.manualStop&&this.state.hadConnected)this.scheduleRecovery('TikTok desconectou')});
    live.on('error',e=>active()&&safeSend(this.ws,{type:'debug',event:'TIKTOK_ERROR',detail:String(e?.message||e).slice(0,900),at:Date.now()}));
  }
  async dispose({clearUser=false,bump=true}={}){
    if(bump)this.state.generation+=1;
    const live=this.state.live;this.state.live=null;this.state.connected=false;this.state.connecting=false;
    if(clearUser)this.state.username='';
    if(live){try{live.removeAllListeners?.()}catch{}try{await live.disconnect?.()}catch{}}
  }
  async connect(raw,{recovery=false}={}){
    const username=cleanUsername(raw);if(!username){safeSend(this.ws,{type:'error',message:'Informe o @usuario da LIVE.'});return false}
    if(this.state.connecting)return false;
    await this.dispose({clearUser:false,bump:true});
    const generation=this.state.generation;
    this.state.username=username;this.state.wantedUsername=username;this.state.connecting=true;this.state.manualStop=false;
    this.status({status:'checking',recovery,attempt:this.state.recoveryAttempt});
    const live=this.makeLive(username);this.state.live=live;this.attach(live,generation);
    try{
      const info=await live.connect();
      if(this.state.generation!==generation||this.state.live!==live)return false;
      this.state.connecting=false;this.state.connected=true;this.state.hadConnected=true;this.state.recoveryAttempt=0;clearRecovery(this.state);
      this.status({status:'connected',roomId:info?.roomId||null,recovered:recovery});return true;
    }catch(e){
      if(this.state.generation!==generation)return false;
      const detail=String(e?.message||e).slice(0,1200);await this.dispose({clearUser:false,bump:false});
      if(recovery){safeSend(this.ws,{type:'debug',event:'RECOVERY_FAILED',detail,at:Date.now()});this.scheduleRecovery(detail)}else{safeSend(this.ws,{type:'error',message:detail});this.status({status:'error',reason:detail})}
      return false;
    }
  }
  scheduleRecovery(reason='queda inesperada'){
    const s=this.state;if(s.manualStop||s.connected||s.connecting||s.recoveryTimer||!s.wantedUsername)return;
    const attempt=(s.recoveryAttempt||0)+1;if(attempt>RECOVERY_DELAYS_MS.length){this.status({status:'disconnected',recoveryExhausted:true,reason:'Auto recovery esgotado'});return}
    const delay=RECOVERY_DELAYS_MS[attempt-1];s.recoveryAttempt=attempt;s.recovering=true;
    this.status({status:'reconnecting',attempt,maxAttempts:RECOVERY_DELAYS_MS.length,delay,reason});
    const epoch=s.generation;s.recoveryTimer=setTimeout(async()=>{s.recoveryTimer=null;if(s.manualStop||s.connected||s.connecting||epoch!==s.generation)return;await this.connect(s.wantedUsername,{recovery:true})},delay);
  }
  async disconnect(){this.state.manualStop=true;clearRecovery(this.state);this.state.wantedUsername='';this.state.hadConnected=false;await this.dispose({clearUser:true,bump:true});this.status({status:'disconnected',manual:true})}
  ping(){return {type:'pong',at:Date.now(),username:this.state.username||this.state.wantedUsername,tiktokConnected:this.state.connected,reconnecting:Boolean(this.state.recovering||this.state.recoveryTimer),attempt:this.state.recoveryAttempt}}
  async giftCatalog(rawUsername=''){
    const username=cleanUsername(rawUsername||this.state.username||this.state.wantedUsername);if(!username)throw Error('Informe o @ da Live para capturar presentes.');
    let live=this.state.live,owned=false;
    if(!live||typeof live.fetchAvailableGifts!=='function'){live=this.makeLive(username);owned=true}
    try{
      if(owned)await live.connect();
      if(typeof live.fetchAvailableGifts!=='function')throw Error('Connector não expõe fetchAvailableGifts().');
      const raw=await live.fetchAvailableGifts();const gifts=normalizeCatalog(raw,live);if(!gifts.length)throw Error('TikTok não retornou presentes.');return gifts;
    }finally{if(owned){try{live.removeAllListeners?.();await live.disconnect?.()}catch{}}}
  }
}
