(()=>{'use strict';
const $=id=>document.getElementById(id);
let manifest=null;
function sendPresence(){
  if(!manifest?.gameId)return false;
  return !!window.LivePlusMatch?.send?.({type:'panel_heartbeat',protocol:'liveplus-panel-presence-v1',gameId:manifest.gameId,at:Date.now()})
}
function init(){
  window.addEventListener('liveplus-game-manifest',e=>{manifest=e.detail?.manifest||e.detail||null;sendPresence()});
  setInterval(sendPresence,10000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sendPresence()});
  window.addEventListener('pageshow',sendPresence);
}
init();
})();