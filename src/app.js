import {ConnectorClient} from './modules/connection.js';
import {LiveEngine} from './modules/live-engine.js';
import {elements,renderState,renderGifts,setLiveStatus} from './modules/ui.js';

const els=elements(),client=new ConnectorClient(),engine=new LiveEngine(client);
const settings=engine.settings;
els.endpoint.value=settings.endpoint||'';els.accessKey.value=settings.key||'';els.username.value=settings.username||'';
function persist(){engine.saveSettings({endpoint:els.endpoint.value.trim(),key:els.accessKey.value,username:els.username.value.trim().replace(/^@/,'')})}
function redraw(){renderState(engine,client,els)}
engine.addEventListener('state',redraw);
client.addEventListener('cloud',e=>{els.connectorNotice.textContent=e.detail.online?'Conector conectado.':'Conector desconectado.';redraw()});
client.addEventListener('status',e=>setLiveStatus(els,e.detail));
client.addEventListener('error',e=>els.connectorNotice.textContent=e.detail.message||'Erro no conector');
client.addEventListener('observe',e=>{els.observerBadge.textContent=e.detail.ok&&!e.detail.stopped?'OBSERVADOR ON':'OBSERVADOR OFF'});
client.addEventListener('gift_catalog_error',e=>els.connectorNotice.textContent=e.detail.message||'Falha ao capturar catálogo');

els.connectCloud.onclick=async()=>{persist();if(!els.endpoint.value.trim()){els.connectorNotice.textContent='Informe o WebSocket do seu conector.';return}try{await client.connect(els.endpoint.value.trim(),els.accessKey.value);els.connectorNotice.textContent='Conector conectado.'}catch{els.connectorNotice.textContent='Não foi possível conectar ao endpoint informado.'}redraw()};
els.disconnectCloud.onclick=()=>{client.disconnect();redraw()};
els.connectLive.onclick=()=>{persist();engine.resetSession();client.startLive(els.username.value.trim())};
els.stopLive.onclick=()=>client.stopLive();
els.captureCatalog.onclick=()=>{persist();client.captureCatalog(els.username.value.trim())};
els.captureToggle.onchange=()=>engine.saveSettings({capture:els.captureToggle.checked});
els.automationToggle.onchange=()=>engine.saveSettings({automation:els.automationToggle.checked});
els.giftSearch.oninput=()=>renderGifts(engine,els);els.giftSort.onchange=()=>renderGifts(engine,els);
els.giftList.onclick=e=>{const b=e.target.closest('[data-gift]');if(!b)return;els.ruleGift.value=b.dataset.gift;els.ruleTrigger.value='gift';els.ruleTrigger.scrollIntoView({behavior:'smooth',block:'center'})};
els.saveRule.onclick=()=>{const gift=engine.catalog.find(g=>(g.id||g.name)===els.ruleGift.value);engine.saveRule({trigger:els.ruleTrigger.value,giftId:gift?.id||'',giftName:gift?.name||'',quantity:els.ruleQuantity.value,cooldown:els.ruleCooldown.value})};
els.ruleList.onclick=e=>{const b=e.target.closest('[data-delete-rule]');if(b)engine.deleteRule(b.dataset.deleteRule)};
els.startObserver.onclick=()=>{persist();client.observe(els.observerUser.value.trim()||els.username.value.trim())};els.stopObserver.onclick=()=>client.stopObserve();
setInterval(()=>{client.ping();const started=engine.stats.startedAt;if(started){const sec=Math.floor((Date.now()-started)/1000),m=Math.floor(sec/60),s=sec%60;els.duration.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}},1000);
redraw();
