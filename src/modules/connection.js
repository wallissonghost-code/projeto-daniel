const LIVE_EVENT_TYPES=new Set(['like','chat','gift','follow','share']);
const traceId=()=>`evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
export class ConnectorClient extends EventTarget{
  constructor(){
    super();this.ws=null;this.endpoint='';this.accessKey='';this.connected=false;this.authenticated=false;this.lastPong=0;this.lastError='';
    this.wantConnected=false;this.wantedLive='';this.recoveryInFlight=false;this.recoveryTimer=null;this.isLifecycleOwner=false;
    if(typeof window!=='undefined'&&!window.__livePlusCloudOwner){
      window.__livePlusCloudOwner=this;this.isLifecycleOwner=true;
      window.addEventListener('liveplus-cloud-send',e=>{const payload=e?.detail;if(payload&&typeof payload==='object')this.send(payload)});
      const resume=()=>this.scheduleResumeRecovery();
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resume()});
      window.addEventListener('pageshow',resume);window.addEventListener('focus',resume);window.addEventListener('online',resume);
    }
  }
  emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}))}
  validateEndpoint(endpoint){
    const value=String(endpoint||'').trim();
    if(!value)throw new Error('Informe o endereço WebSocket do conector.');
    let url;try{url=new URL(value)}catch{throw new Error('Endpoint inválido. Use ws:// ou wss://.')}
    if(!['ws:','wss:'].includes(url.protocol))throw new Error('O endpoint precisa começar com ws:// ou wss://.');
    if(location?.protocol==='https:'&&url.protocol==='ws:')throw new Error('Em uma página HTTPS use wss://, não ws://.');
    return url.toString();
  }
  connect(endpoint,key='',options={}){
    const recovery=options?.recovery===true;
    if(!recovery){this.wantConnected=true;this.accessKey=String(key||'')}
    this.closeSocket({preserveIntent:true});
    let validated;try{validated=this.validateEndpoint(endpoint)}catch(error){return Promise.reject(error)}
    this.endpoint=validated;if(recovery&&key!==undefined)this.accessKey=String(key||this.accessKey||'');this.lastError='';
    try{if(typeof window!=='undefined'&&window.__livePlusCloudOwner===this)localStorage.setItem('liveplus-relay-endpoint',validated)}catch{}
    return new Promise((resolve,reject)=>{
      let settled=false,opened=false,authSeen=false;
      const fail=(message,error)=>{this.lastError=message;this.connected=false;this.authenticated=false;this.emit('cloud',{online:false,error:message,recovery});if(!settled){settled=true;clearTimeout(timer);reject(error||new Error(message))}};
      const timer=setTimeout(()=>fail(opened&&!authSeen?'O conector abriu, mas não respondeu à autenticação.':'Tempo limite ao conectar ao WebSocket.'),7000);
      let ws;try{ws=new WebSocket(validated)}catch(error){clearTimeout(timer);return fail('Não foi possível abrir o WebSocket.',error)}
      this.ws=ws;
      ws.onopen=()=>{if(this.ws!==ws)return;opened=true;this.connected=true;this.emit('cloud',{online:true,stage:'socket',recovery});try{ws.send(JSON.stringify({type:'auth',key:String(this.accessKey||key||'')}))}catch(error){fail('Falha ao enviar autenticação.',error)}};
      ws.onerror=()=>{if(this.ws===ws)fail('Falha de rede/WebSocket. Confira endereço, HTTPS/WSS e servidor online.')};
      ws.onclose=event=>{if(this.ws!==ws)return;this.connected=false;this.authenticated=false;this.emit('cloud',{online:false,code:event.code,reason:event.reason||'',background:typeof document!=='undefined'&&document.visibilityState!=='visible'});if(typeof window!=='undefined'&&window.__livePlusCloudOwner===this)window.dispatchEvent(new CustomEvent('liveplus-cloud-state',{detail:{online:false}}));if(!settled)fail(`Conexão encerrada antes de autenticar${event.code?` (código ${event.code})`:''}.`)};
      ws.onmessage=ev=>{
        if(this.ws!==ws)return;
        let m;try{m=JSON.parse(ev.data)}catch{return}
        if(LIVE_EVENT_TYPES.has(m.type)){
          const receivedAt=Date.now();m.traceId=String(m.traceId||traceId());m.panelReceivedAt=Number(m.panelReceivedAt)||receivedAt;m.connectorSentAt=Number(m.connectorSentAt)||Number(m.at)||0;
        }
        if(m.type==='auth'){
          authSeen=true;this.authenticated=!!m.ok;if(!m.ok)return fail('Chave do conector recusada.');
          clearTimeout(timer);if(!settled){settled=true;resolve(true)}this.emit('cloud',{online:true,authenticated:true,recovery});
        }
        if(m.type==='bridge'&&m.authRequired===false&&!authSeen){authSeen=true;this.authenticated=true;clearTimeout(timer);if(!settled){settled=true;resolve(true)}this.emit('cloud',{online:true,authenticated:true,recovery})}
        if(m.type==='pong')this.lastPong=Date.now();
        if(typeof window!=='undefined'&&window.__livePlusCloudOwner===this){
          window.dispatchEvent(new CustomEvent('liveplus-cloud-message',{detail:m}));
          if((m.type==='auth'&&m.ok)||(m.type==='bridge'&&m.authRequired===false))window.dispatchEvent(new CustomEvent('liveplus-cloud-state',{detail:{online:true,authenticated:true,endpoint:this.endpoint}}));
        }
        this.emit('message',m);this.emit(m.type,m);
      };
    })
  }
  scheduleResumeRecovery(){
    if(!this.isLifecycleOwner||!this.wantConnected||!this.endpoint)return;
    clearTimeout(this.recoveryTimer);this.recoveryTimer=setTimeout(()=>this.recoverAfterResume(),220);
  }
  async recoverAfterResume(){
    this.recoveryTimer=null;
    if(this.recoveryInFlight||!this.wantConnected||!this.endpoint)return;
    if(typeof document!=='undefined'&&document.visibilityState!=='visible')return;
    if(this.connected&&this.authenticated){this.ping();return}
    this.recoveryInFlight=true;const live=this.wantedLive;
    this.emit('cloud',{online:false,recovering:true});
    try{
      let ok=false,lastError=null;
      for(let attempt=1;attempt<=2&&this.wantConnected;attempt++){
        try{await this.connect(this.endpoint,this.accessKey,{recovery:true});ok=true;break}catch(error){lastError=error;if(attempt<2)await new Promise(r=>setTimeout(r,650))}
      }
      if(!this.wantConnected)return;
      if(!ok){this.emit('cloud',{online:false,error:lastError?.message||'Não foi possível recuperar o Connector.',recoveryFailed:true});return}
      this.ping();
      if(live&&this.wantedLive===live&&this.wantConnected){this.send({type:'connect',username:live,recovery:true});this.emit('cloud',{online:true,authenticated:true,recovered:true,liveRestored:true})}
      else this.emit('cloud',{online:true,authenticated:true,recovered:true});
    }finally{this.recoveryInFlight=false}
  }
  send(payload){if(this.ws?.readyState!==WebSocket.OPEN||!this.connected)return false;try{this.ws.send(JSON.stringify(payload));return true}catch{return false}}
  startLive(username){const u=String(username||'').trim().replace(/^@/,'');if(!u){this.emit('error',{message:'Informe a conta @ da Live.'});return false}this.wantedLive=u;return this.send({type:'connect',username:u})}
  stopLive(){this.wantedLive='';return this.send({type:'disconnect'})}
  simulateTikTokDrop(){return this.send({type:'diagnostic_simulate_tiktok_drop',diagnostic:true})}
  ping(){return this.send({type:'ping'})}
  emitAction(action,payload,id=crypto.randomUUID?.()||String(Date.now())){return this.send({type:'emit_action',id,action,payload})}
  closeSocket({preserveIntent=false}={}){const ws=this.ws;this.ws=null;try{ws?.close()}catch{}this.connected=false;this.authenticated=false;this.lastError='';if(!preserveIntent){this.wantConnected=false;this.wantedLive='';clearTimeout(this.recoveryTimer);this.recoveryTimer=null}}
  disconnect(){this.closeSocket({preserveIntent:false})}
}
