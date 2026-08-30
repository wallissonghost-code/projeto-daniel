(()=>{'use strict';
function cleanCode(value=''){const s=String(value).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);return s.length===8?s.slice(0,4)+'-'+s.slice(4):s}
function relayEndpoint(){try{return String(window.LivePlusServerRelay?.endpoint?.()||'').trim()}catch{return''}}
function makeTicket(code){const c=cleanCode(code);if(c.length!==9)return c;const relay=relayEndpoint();if(!relay)return c;return 'LIVEPLUS1|'+c+'|'+encodeURIComponent(relay)}
async function copyTicket(event){const button=event.currentTarget;const text=makeTicket(window.LivePlusMatch?.getCode?.()||'');if(!text)return;event.preventDefault();event.stopImmediatePropagation();let ok=false;try{await navigator.clipboard.writeText(text);ok=true}catch{}if(!ok){try{const ta=document.createElement('textarea');ta.value=text;ta.readOnly=true;ta.style.position='fixed';ta.style.opacity='0';document.body.append(ta);ta.select();ok=document.execCommand('copy');ta.remove()}catch{}}if(ok){button.classList.add('copied');button.textContent='✓';setTimeout(()=>location.reload?button.classList.remove('copied'):0,1200)}}
function provision(){const endpoint=relayEndpoint();if(!endpoint)return false;try{return !!window.LivePlusMatch?.send?.({type:'relay_config',protocol:'liveplus-relay-config-v1',endpoint,version:1,at:Date.now()})}catch{return false}}
function install(){const button=document.getElementById('copyMatchCode');if(button&&!button.dataset.ticketReady){button.dataset.ticketReady='1';button.addEventListener('click',copyTicket,true)}}
window.addEventListener('load',install);window.addEventListener('pageshow',install);window.addEventListener('liveplus-game-manifest',()=>{install();setTimeout(provision,0)});
window.LivePlusTicket={make:makeTicket,provision};
})();