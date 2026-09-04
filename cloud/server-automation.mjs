import WebSocket from 'ws';
import {safeSend} from './protocol.mjs';
const cleanCode=v=>String(v||'').trim().toUpperCase(),alive=ws=>ws&&ws.readyState===WebSocket.OPEN;
function relayUrl(base,code){try{const u=new URL(base);if(!u.pathname||u.pathname==='/')u.pathname='/relay';if(!u.searchParams.has('code'))u.searchParams.set('code',code);return u.toString()}catch{return base}}
export class ServerAutomation{
  constructor(clientWs){this.clientWs=clientWs;this.ws=null;this.endpoint='';this.key='';this.code='';this.ready=false;this.game=false;this.seq=0}
  setClientWs(ws){this.clientWs=ws||null;return this}
  notify(extra={}){safeSend(this.clientWs,{type:'server_automation_status',ok:true,provider:'cloudflare',code:this.code,ready:this.ready,game:this.game,...extra})}
  configure({endpoint='',key='',code=''}={}){const nextEndpoint=String(endpoint||'').trim(),nextCode=cleanCode(code);if(!/^wss?:\/\//i.test(nextEndpoint)||!nextCode)return false;const reconnect=nextEndpoint!==this.endpoint||nextCode!==this.code||String(key||'')!==this.key;this.endpoint=nextEndpoint;this.key=String(key||'');this.code=nextCode;if(reconnect)this.connect();else if(alive(this.ws))this.register();return true}
  update(){this.notify();return true}
  connect(){this.close();let ws;try{ws=new WebSocket(relayUrl(this.endpoint,this.code))}catch{return false}this.ws=ws;ws.on('message',raw=>{let m;try{m=JSON.parse(raw.toString())}catch{return}if(m.type==='bridge'){if(m.authRequired)ws.send(JSON.stringify({type:'auth',key:this.key}));else this.register()}else if(m.type==='auth'){if(m.ok)this.register();else this.notify({ok:false,error:'relay_auth'})}else if(m.type==='relay_ingress_ready'){this.ready=true;this.game=!!m.gameConnected;this.notify({automation:m.automation||''})}else if(m.type==='relay_game_connected'){this.game=true;this.notify()}else if(m.type==='relay_game_disconnected'){this.game=false;this.notify()}else if(m.type==='automation_event_ack'){safeSend(this.clientWs,{type:'server_automation_event_ack',code:this.code,...m})}else if(m.type==='relay_error')this.notify({ok:false,error:m.message||m.scope||'relay_error'})});ws.on('close',()=>{this.ready=false;this.game=false;if(this.ws===ws)this.ws=null;this.notify({ok:false,error:'relay_closed'})});ws.on('error',()=>{});return true}
  register(){if(!alive(this.ws)||!this.code)return false;this.ws.send(JSON.stringify({type:'relay_ingress_join',code:this.code,protocol:'liveplus-cloud-automation-v1'}));return true}
  onTikTok(event){if(!this.ready||!alive(this.ws)||!event||!['gift','like','chat','follow','share'].includes(event.type))return 0;const now=Date.now(),eventId=String(event.eventId||event.msgId||event.messageId||`${this.code}:${now}:${++this.seq}`),payload={...event,eventId,receivedAt:now};try{this.ws.send(JSON.stringify({type:'relay_ingress_event',code:this.code,eventId,receivedAt:now,event:payload}));return 1}catch{return 0}}
  close(){this.ready=false;this.game=false;try{this.ws?.close()}catch{}this.ws=null}
}
