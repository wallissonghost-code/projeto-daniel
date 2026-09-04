(()=>{'use strict';
if(window.__livePlusTransportRouteProbe)return;window.__livePlusTransportRouteProbe=true;
const relayHits=new Map();
const cleanId=data=>String(data?.traceId||data?.event?.traceId||data?.commandId||'');
function noteRelayPayload(raw){try{const m=typeof raw==='string'?JSON.parse(raw):null;if(!m||m.type!=='relay_panel_message'||!m.payload)return;const id=cleanId(m.payload);if(id)relayHits.set(id,Date.now())}catch{}}
const nativeWsSend=WebSocket.prototype.send;
WebSocket.prototype.send=function(data){noteRelayPayload(data);return nativeWsSend.apply(this,arguments)};
function install(){const match=window.LivePlusMatch;if(!match?.send||match.__liveplusRouteObserved)return false;const original=match.send.bind(match);match.__liveplusRouteObserved=true;match.send=data=>{if(!data||typeof data!=='object'||data.type!=='command')return original(data);const id=cleanId(data);const before=Date.now();if(id)relayHits.delete(id);let ok=false;try{ok=!!original(data)}finally{const relayAt=id?relayHits.get(id):0;const route=ok?(relayAt&&relayAt>=before?'server':'webrtc'):'failed';window.dispatchEvent(new CustomEvent('liveplus-transport-route',{detail:{traceId:id,commandId:String(data.commandId||''),route,ok,sentAt:Date.now()}}));if(id)relayHits.delete(id)}return ok};return true}
window.addEventListener('load',()=>{if(install())return;const timer=setInterval(()=>{if(install())clearInterval(timer)},100);setTimeout(()=>clearInterval(timer),8000)});
})();
