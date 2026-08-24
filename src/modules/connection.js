export class ConnectorClient extends EventTarget{
  constructor(){super();this.ws=null;this.endpoint='';this.connected=false;this.authenticated=false;this.lastPong=0}
  emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}))}
  connect(endpoint,key=''){
    this.disconnect();this.endpoint=endpoint;return new Promise((resolve,reject)=>{
      let settled=false;const ws=new WebSocket(endpoint);this.ws=ws;
      ws.onopen=()=>{this.connected=true;this.emit('cloud',{online:true});ws.send(JSON.stringify({type:'auth',key}));if(!settled){settled=true;resolve(true)}};
      ws.onerror=e=>{this.emit('cloud',{online:false,error:'WebSocket falhou'});if(!settled){settled=true;reject(e)}};
      ws.onclose=()=>{this.connected=false;this.authenticated=false;this.emit('cloud',{online:false})};
      ws.onmessage=ev=>{let m;try{m=JSON.parse(ev.data)}catch{return}if(m.type==='auth')this.authenticated=!!m.ok;if(m.type==='pong')this.lastPong=Date.now();this.emit('message',m);this.emit(m.type,m)};
    })
  }
  send(payload){if(this.ws?.readyState!==WebSocket.OPEN)return false;this.ws.send(JSON.stringify(payload));return true}
  startLive(username){return this.send({type:'connect',username})}
  stopLive(){return this.send({type:'disconnect'})}
  captureCatalog(username){return this.send({type:'giftcatalog',username})}
  observe(username){return this.send({type:'observe',username})}
  stopObserve(){return this.send({type:'unobserve'})}
  ping(){return this.send({type:'ping'})}
  emitAction(action,payload,id=crypto.randomUUID?.()||String(Date.now())){return this.send({type:'emit_action',id,action,payload})}
  disconnect(){try{this.ws?.close()}catch{}this.ws=null;this.connected=false;this.authenticated=false}
}
