export class ConnectorClient extends EventTarget{
  constructor(){super();this.ws=null;this.endpoint='';this.connected=false;this.authenticated=false;this.lastPong=0;this.lastError=''}
  emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}))}
  validateEndpoint(endpoint){
    const value=String(endpoint||'').trim();
    if(!value)throw new Error('Informe o endereço WebSocket do conector.');
    let url;try{url=new URL(value)}catch{throw new Error('Endpoint inválido. Use ws:// ou wss://.')} 
    if(!['ws:','wss:'].includes(url.protocol))throw new Error('O endpoint precisa começar com ws:// ou wss://.');
    if(location?.protocol==='https:'&&url.protocol==='ws:')throw new Error('Em uma página HTTPS use wss://, não ws://.');
    return url.toString();
  }
  connect(endpoint,key=''){
    this.disconnect();
    let validated;try{validated=this.validateEndpoint(endpoint)}catch(error){return Promise.reject(error)}
    this.endpoint=validated;this.lastError='';
    return new Promise((resolve,reject)=>{
      let settled=false,opened=false,authSeen=false;
      const fail=(message,error)=>{this.lastError=message;this.connected=false;this.authenticated=false;this.emit('cloud',{online:false,error:message});if(!settled){settled=true;clearTimeout(timer);reject(error||new Error(message))}};
      const timer=setTimeout(()=>fail(opened&&!authSeen?'O conector abriu, mas não respondeu à autenticação.':'Tempo limite ao conectar ao WebSocket.'),7000);
      let ws;try{ws=new WebSocket(validated)}catch(error){clearTimeout(timer);return fail('Não foi possível abrir o WebSocket.',error)}
      this.ws=ws;
      ws.onopen=()=>{opened=true;this.connected=true;this.emit('cloud',{online:true,stage:'socket'});try{ws.send(JSON.stringify({type:'auth',key:String(key||'')}))}catch(error){fail('Falha ao enviar autenticação.',error)}};
      ws.onerror=()=>fail('Falha de rede/WebSocket. Confira endereço, HTTPS/WSS e servidor online.');
      ws.onclose=event=>{this.connected=false;this.authenticated=false;this.emit('cloud',{online:false,code:event.code,reason:event.reason||''});if(!settled)fail(`Conexão encerrada antes de autenticar${event.code?` (código ${event.code})`:''}.`)};
      ws.onmessage=ev=>{
        let m;try{m=JSON.parse(ev.data)}catch{return}
        if(m.type==='auth'){
          authSeen=true;this.authenticated=!!m.ok;
          if(!m.ok)return fail('Chave do conector recusada.');
          clearTimeout(timer);if(!settled){settled=true;resolve(true)}
          this.emit('cloud',{online:true,authenticated:true});
        }
        if(m.type==='bridge'&&m.authRequired===false&&!authSeen){authSeen=true;this.authenticated=true;clearTimeout(timer);if(!settled){settled=true;resolve(true)}this.emit('cloud',{online:true,authenticated:true})}
        if(m.type==='pong')this.lastPong=Date.now();
        this.emit('message',m);this.emit(m.type,m);
      };
    })
  }
  send(payload){if(this.ws?.readyState!==WebSocket.OPEN||!this.connected)return false;this.ws.send(JSON.stringify(payload));return true}
  startLive(username){const u=String(username||'').trim().replace(/^@/,'');if(!u){this.emit('error',{message:'Informe a conta @ da Live.'});return false}return this.send({type:'connect',username:u})}
  stopLive(){return this.send({type:'disconnect'})}
  simulateTikTokDrop(){return this.send({type:'diagnostic_simulate_tiktok_drop',diagnostic:true})}
  captureCatalog(username){return this.send({type:'giftcatalog',username:String(username||'').trim().replace(/^@/,'')})}
  observe(username){return this.send({type:'observe',username:String(username||'').trim().replace(/^@/,'')})}
  stopObserve(){return this.send({type:'unobserve'})}
  ping(){return this.send({type:'ping'})}
  emitAction(action,payload,id=crypto.randomUUID?.()||String(Date.now())){return this.send({type:'emit_action',id,action,payload})}
  disconnect(){try{this.ws?.close()}catch{}this.ws=null;this.connected=false;this.authenticated=false;this.lastError=''}
}
