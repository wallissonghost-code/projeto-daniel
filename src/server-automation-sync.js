(()=>{'use strict';
const RULES_KEY='daniel.live.plus.v2.rules',SETTINGS_KEY='daniel.live.plus.v2.settings';
const state={bound:false,ready:false,game:false,code:'',endpoint:'',catalog:[],lastSync:'',handoff:false};
const readRules=()=>{try{return JSON.parse(localStorage.getItem(RULES_KEY)||'[]')||[]}catch{return[]}};
const automationEnabled=()=>{try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')?.automation===true}catch{return false}};
const relayKey=()=>{try{return String(localStorage.getItem('liveplus-game-relay-key')||'')}catch{return''}};
const send=payload=>window.dispatchEvent(new CustomEvent('liveplus-cloud-send',{detail:payload}));
async function loadCatalog(){try{const r=await fetch('./data/verified-gifts.json',{cache:'no-store'}),j=await r.json();state.catalog=Array.isArray(j?.gifts)?j.gifts:[]}catch{state.catalog=[]}}
function gamePayload(payload){if(!payload||typeof payload!=='object')return;if(payload.type==='game_manifest')window.dispatchEvent(new CustomEvent('liveplus-game-manifest',{detail:payload.manifest||payload}));else if(payload.type==='state')window.dispatchEvent(new CustomEvent('liveplus-game-state',{detail:payload}));else if(payload.type==='event')window.dispatchEvent(new CustomEvent('liveplus-game-event',{detail:payload}));else window.dispatchEvent(new CustomEvent('liveplus-game-message',{detail:payload}))}
function bindIfPossible(){const relay=window.LivePlusServerRelay,match=window.LivePlusMatch;if(!relay||!match||state.handoff)return false;const rs=relay.state?.()||{},code=String(match.getCode?.()||'').trim().toUpperCase(),endpoint=String(rs.endpoint||relay.endpoint?.()||'').trim();if(!code||!endpoint||!rs.game)return false;state.code=code;state.endpoint=endpoint;state.handoff=true;const payload={type:'server_automation_bind',code,endpoint,key:relayKey(),rules:readRules(),catalog:state.catalog,automationEnabled:automationEnabled()};relay.leave?.();setTimeout(()=>{state.bound=true;state.ready=false;state.game=false;state.handoff=false;send(payload)},180);return true}
function sync(){if(!state.bound)return bindIfPossible();const rules=readRules(),enabled=automationEnabled(),signature=JSON.stringify([enabled,rules]);if(signature!==state.lastSync){state.lastSync=signature;send({type:'server_automation_sync',rules,catalog:state.catalog,automationEnabled:enabled})}return true}
window.addEventListener('liveplus-cloud-message',e=>{const m=e.detail||{};if(m.type==='server_automation_status'&&(!state.code||m.code===state.code)){state.ready=!!m.ready;state.game=!!m.game;if(m.ok===false){state.ready=false;state.game=false}}else if(m.type==='server_game_message')gamePayload(m.payload)});
window.addEventListener('liveplus-cloud-state',e=>{if(e.detail?.online)setTimeout(sync,100)});
window.addEventListener('liveplus-game-manifest',()=>setTimeout(sync,50));
window.addEventListener('storage',()=>setTimeout(sync,50));
document.addEventListener('change',e=>{if(e.target?.id==='automationToggle')setTimeout(sync,50)});
setInterval(sync,1500);loadCatalog().then(()=>setTimeout(sync,100));
window.LivePlusServerAutomation={active:()=>state.ready&&state.game,sync,state:()=>({...state})};
})();
