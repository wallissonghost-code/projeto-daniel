import {ConnectorClient} from './modules/connection.js';
import {LiveEngine} from './modules/live-engine.js';
import {elements,renderState,renderGifts,setLiveStatus} from './modules/ui.js';

const els=elements(),client=new ConnectorClient(),engine=new LiveEngine(client);
const settings=engine.settings;
els.endpoint.value=settings.endpoint||'';els.accessKey.value=settings.key||'';els.username.value=settings.username||'';

function persist(){engine.saveSettings({endpoint:els.endpoint.value.trim(),key:els.accessKey.value,username:els.username.value.trim().replace(/^@/,'')})}
function notice(text,tone='neutral'){els.connectorNotice.dataset.tone=tone;els.connectorNotice.innerHTML=`<span class="noticeDot"></span><span>${String(text)}</span>`}
function redraw(){renderState(engine,client,els);if(els.heroStatusText)els.heroStatusText.textContent=client.connected?(client.authenticated?'Conector autenticado':'WebSocket conectado'):'Aguardando conector'}
function requireConnector(){if(!client.connected){notice('Conecte seu WebSocket antes de iniciar a Live.','error');return false}if(!client.authenticated){notice('O WebSocket abriu, mas a autenticação ainda não foi confirmada.','error');return false}return true}

engine.addEventListener('state',redraw);
client.addEventListener('cloud',e=>{if(e.detail.online&&e.detail.authenticated)notice('Conector autenticado e pronto.','ok');else if(e.detail.online)notice('WebSocket aberto. Validando chave…');else if(e.detail.error)notice(e.detail.error,'error');redraw()});
client.addEventListener('status',e=>setLiveStatus(els,e.detail));
client.addEventListener('error',e=>notice(e.detail.message||'Erro no conector','error'));
client.addEventListener('observe',e=>{els.observerBadge.textContent=e.detail.ok&&!e.detail.stopped?'OBSERVADOR ON':'OBSERVADOR OFF'});
client.addEventListener('gift_catalog_error',e=>notice(e.detail.message||'Falha ao capturar catálogo','error'));

els.connectCloud.onclick=async()=>{
  persist();const endpoint=els.endpoint.value.trim();
  if(!endpoint){notice('Informe o WebSocket do seu conector. Ex.: wss://meu-app.onrender.com','error');els.endpoint.focus();return}
  els.connectCloud.disabled=true;els.connectCloud.textContent='CONECTANDO…';notice('Abrindo WebSocket e validando autenticação…');
  try{await client.connect(endpoint,els.accessKey.value);notice('Conector autenticado e pronto.','ok')}
  catch(error){notice(error?.message||'Não foi possível conectar ao endpoint informado.','error')}
  finally{els.connectCloud.disabled=false;els.connectCloud.textContent='CONECTAR';redraw()}
};
els.disconnectCloud.onclick=()=>{client.disconnect();notice('Conector desconectado.');redraw()};
els.connectLive.onclick=()=>{persist();if(!requireConnector())return;const user=els.username.value.trim();if(!user){notice('Informe a conta @ da TikTok Live.','error');els.username.focus();return}engine.resetSession();if(!client.startLive(user))notice('Não foi possível enviar o comando de conexão da Live.','error');else notice(`Solicitando conexão com ${user.startsWith('@')?user:'@'+user}…`)};
els.stopLive.onclick=()=>{if(!requireConnector())return;client.stopLive();notice('Comando para parar a Live enviado.')};
els.captureCatalog.onclick=()=>{persist();if(!requireConnector())return;const user=els.username.value.trim();if(!user){notice('Informe a conta da Live para capturar o catálogo.','error');return}client.captureCatalog(user);notice('Solicitação de catálogo enviada.')};
els.captureToggle.onchange=()=>engine.saveSettings({capture:els.captureToggle.checked});
els.automationToggle.onchange=()=>engine.saveSettings({automation:els.automationToggle.checked});
els.giftSearch.oninput=()=>renderGifts(engine,els);els.giftSort.onchange=()=>renderGifts(engine,els);
els.giftList.onclick=e=>{const b=e.target.closest('[data-gift]');if(!b)return;els.ruleGift.value=b.dataset.gift;els.ruleTrigger.value='gift';els.ruleTrigger.scrollIntoView({behavior:'smooth',block:'center'})};
els.saveRule.onclick=()=>{const gift=engine.catalog.find(g=>(g.id||g.name)===els.ruleGift.value);engine.saveRule({trigger:els.ruleTrigger.value,giftId:gift?.id||'',giftName:gift?.name||'',quantity:els.ruleQuantity.value,cooldown:els.ruleCooldown.value})};
els.ruleList.onclick=e=>{const b=e.target.closest('[data-delete-rule]');if(b)engine.deleteRule(b.dataset.deleteRule)};
els.startObserver.onclick=()=>{persist();if(!requireConnector())return;const user=els.observerUser.value.trim()||els.username.value.trim();if(!user){notice('Informe uma conta para observar.','error');return}client.observe(user);notice(`Observando @${user.replace(/^@/,'')}…`)};
els.stopObserver.onclick=()=>{if(requireConnector())client.stopObserve()};

els.testPanel.onclick=async()=>{
  const originalAutomation=engine.settings.automation;engine.saveSettings({capture:true,automation:true});engine.resetSession();
  notice('Modo de teste: simulando uma Live completa no navegador.','ok');
  const samples=[
    {type:'status',status:'connected',username:'liveplus_teste'},
    {type:'like',user:'luna.qa',count:7},
    {type:'chat',user:'nexus.qa',comment:'teste live+'},
    {type:'follow',user:'sentinel.qa'},
    {type:'share',user:'luna.qa'},
    {type:'gift',user:'nexus.qa',gift:'Rose Test',giftId:'qa-rose',diamondCount:1,count:2,icon:''}
  ];
  for(const event of samples){engine.onMessage(event);await new Promise(r=>setTimeout(r,220))}
  setLiveStatus(els,{status:'connected',username:'liveplus_teste'});notice('Teste concluído: eventos, contadores e presente verificado foram simulados.','ok');
  if(!originalAutomation)engine.saveSettings({automation:false});
};

setInterval(()=>{if(client.connected)client.ping();const started=engine.stats.startedAt;if(started){const sec=Math.floor((Date.now()-started)/1000),m=Math.floor(sec/60),s=sec%60;els.duration.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}},1000);
redraw();
