(()=>{'use strict';
const RULES_KEY='daniel.live.plus.v2.rules',SETTINGS_KEY='daniel.live.plus.v2.settings';
const CAPABILITY='cloudflare-automation-forward-v1';
const state={capable:false,bound:false,ready:false,game:false,code:'',endpoint:'',catalog:[],lastCloudSync:'',lastBackendBind:'',cloudConfigured:false,provider:''};
const readRules=()=>{try{return JSON.parse(localStorage.getItem(RULES_KEY)||'[]')||[]}catch{return[]}};
const automationEnabled=()=>{try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')?.automation===true}catch{return false}};
const relayKey=()=>{try{return String(localStorage.getItem('liveplus-game-relay-key')||'')}catch{return''}};
const relayState=()=>{try{return window.LivePlusServerRelay?.state?.()||{}}catch{return{}}};
const sendConnector=payload=>window.dispatchEvent(new CustomEvent('liveplus-cloud-send',{detail:payload}));
async function loadCatalog(){try{const r=await fetch('./data/verified-gifts.json',{cache:'no-store'}),j=await r.json();state.catalog=Array.isArray(j?.gifts)?j.gifts:[]}catch{state.catalog=[]}}
function serverRuntimeReady(){const rs=relayState();return !!(state.capable&&state.ready&&state.cloudConfigured&&rs.ready&&rs.automation&&rs.ingress&&rs.game)}
function syncCloud(){const relay=window.LivePlusServerRelay,match=window.LivePlusMatch;if(!relay||!match)return false;const rs=relay.state?.()||{},code=String(match.getCode?.()||'').trim().toUpperCase();if(!code||!rs.ready||!rs.automation||typeof relay.sendControl!=='function')return false;const rules=readRules(),enabled=automationEnabled(),signature=JSON.stringify([code,enabled,rules,state.catalog]);if(signature===state.lastCloudSync&&state.cloudConfigured)return true;const ok=relay.sendControl({type:'automation_config',protocol:'liveplus-cloud-automation-v1',code,automationEnabled:enabled,rules,catalog:state.catalog});if(ok){state.lastCloudSync=signature;state.code=code}return ok}
function bindBackend(){if(!state.capable)return false;const relay=window.LivePlusServerRelay,match=window.LivePlusMatch;if(!relay||!match)return false;const rs=relay.state?.()||{},code=String(match.getCode?.()||'').trim().toUpperCase(),endpoint=String(rs.endpoint||relay.endpoint?.()||'').trim();if(!code||!endpoint||!rs.ready||!rs.automation)return false;const signature=JSON.stringify([code,endpoint,relayKey()]);if(signature===state.lastBackendBind&&state.bound)return true;state.code=code;state.endpoint=endpoint;state.lastBackendBind=signature;state.bound=true;state.ready=false;sendConnector({type:'server_automation_bind',protocol:'liveplus-cloud-automation-v1',code,endpoint,key:relayKey()});return true}
function sync(){syncCloud();bindBackend();return true}
window.addEventListener('liveplus-cloud-message',e=>{const m=e.detail||{};if(m.type==='bridge'){const caps=Array.isArray(m.capabilities)?m.capabilities:[];state.capable=m.serverAutomation==='liveplus-server-automation-v2'||caps.includes(CAPABILITY);if(!state.capable){state.bound=false;state.ready=false;state.game=false;state.provider='';state.lastBackendBind=''}setTimeout(sync,50);return}if(m.type==='server_automation_status'&&(!state.code||m.code===state.code)){state.ready=!!m.ready;state.game=!!m.game;state.provider=String(m.provider||'');if(m.ok===false){state.ready=false;state.game=false}}});
window.addEventListener('liveplus-cloud-automation-config',()=>{state.cloudConfigured=true});
window.addEventListener('liveplus-relay-ready',()=>setTimeout(sync,30));
window.addEventListener('liveplus-cloud-state',e=>{if(e.detail?.online)setTimeout(sync,100)});
window.addEventListener('liveplus-game-manifest',()=>setTimeout(sync,50));
window.addEventListener('storage',()=>setTimeout(sync,50));
document.addEventListener('change',e=>{if(e.target?.id==='automationToggle')setTimeout(sync,50)});
setInterval(sync,1500);loadCatalog().then(()=>setTimeout(sync,100));
window.LivePlusServerAutomation={active:serverRuntimeReady,sync,state:()=>({...state,serverRuntimeReady:serverRuntimeReady(),relay:relayState()})};
})();
