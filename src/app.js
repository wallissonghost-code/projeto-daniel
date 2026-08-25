import {ConnectorClient} from './modules/connection.js';
import {LiveEngine} from './modules/live-engine.js';
import {elements,renderState,renderGifts,setLiveStatus} from './modules/ui.js';
import {LiveDiagnostics} from './modules/diagnostics.js';

const els=elements(),client=new ConnectorClient(),observerClient=new ConnectorClient(),engine=new LiveEngine(client);
const diagnostics=new LiveDiagnostics(client,els);
const settings=engine.settings;
let primaryLiveUser='',observerMode='off';
els.endpoint.value=settings.endpoint||'';els.accessKey.value=settings.key||'';els.username.value=settings.username||'';

function persist(){engine.saveSettings({endpoint:els.endpoint.value.trim(),key:els.accessKey.value,username:els.username.value.trim().replace(/^@/,'')})}
function notice(text,tone='neutral'){els.connectorNotice.dataset.tone=tone;els.connectorNotice.innerHTML=`<span class="noticeDot"></span><span>${String(text)}</span>`}
function redraw(){renderState(engine,client,els);diagnostics.render();if(els.heroStatusText)els.heroStatusText.textContent=client.connected?(client.authenticated?'Conector autenticado':'WebSocket conectado'):'Aguardando conector'}
function requireConnector(){if(!client.connected){notice('Conecte seu WebSocket antes de iniciar a Live.','error');return false}if(!client.authenticated){notice('O WebSocket abriu, mas a autenticação ainda não foi confirmada.','error');return false}return true}
function cleanUser(v=''){return String(v||'').trim().replace(/^@/,'').toLowerCase()}
function observerBadge(text,tone=''){if(!els.observerBadge)return;els.observerBadge.textContent=text;els.observerBadge.dataset.tone=tone}

async function loadMasterCatalog(){
  try{
    const response=await fetch('./data/verified-gifts.json',{cache:'no-store'});
    if(!response.ok)return;
    const data=await response.json(),gifts=Array.isArray(data?.gifts)?data.gifts:[];
    if(!gifts.length)return;
    const verifiedAt=Number(data.verifiedAt)||Date.now();
    engine.mergeCatalog(gifts.map(g=>({...g,masterVerified:true,verifiedAt:Number(g.verifiedAt)||verifiedAt,liveVerified:true,liveDivergence:false})),verifiedAt,false);
  }catch(error){console.warn('Master gift catalog unavailable',error)}
}

engine.addEventListener('state',redraw);
client.addEventListener('cloud',e=>{if(e.detail.online&&e.detail.authenticated)notice('Conector autenticado e pronto.','ok');else if(e.detail.online)notice('WebSocket aberto. Validando chave…');else if(e.detail.error)notice(e.detail.error,'error');redraw()});
client.addEventListener('status',e=>{
  const m=e.detail;setLiveStatus(els,m);
  if(m.status==='connected'){
    primaryLiveUser=cleanUser(m.username||els.username.value);
    notice(`TikTok conectada em @${primaryLiveUser}. Capturando metadados dos presentes…`,'ok');
    setTimeout(()=>client.captureCatalog(primaryLiveUser),350);
    if(observerMode==='primary'&&cleanUser(els.observerUser?.value||els.username.value)===primaryLiveUser)observerBadge('OBSERVANDO','ok');
  }else if(['disconnected','offline','error'].includes(m.status))primaryLiveUser='';
});
client.addEventListener('error',e=>notice(e.detail.message||'Erro no conector','error'));
client.addEventListener('gift_catalog',()=>notice('Catálogo da Live atualizado. Somente presentes realmente verificados ficam visíveis.','ok'));
client.addEventListener('gift_catalog_error',e=>notice(`Live conectada, mas o catálogo detalhado falhou: ${e.detail.message||'erro desconhecido'}`,'error'));
client.addEventListener('diagnostic_drop_result',e=>{const d=e.detail||{};diagnostics.log(d.ok?'QUEDA TIKTOK SIMULADA':'SIMULAÇÃO RECUSADA',d.message||'Auto Recovery deve assumir a sessão.',d.ok?'warn':'error');diagnostics.render();notice(d.ok?'Sessão TikTok derrubada de propósito. Acompanhe o Auto Recovery no diagnóstico.':d.message||'Não foi possível simular a queda.',d.ok?'ok':'error')});

observerClient.addEventListener('status',e=>{const m=e.detail;if(m.status==='connected'){observerBadge('OBSERVANDO','ok');observerMode='own'}else if(['checking','reconnecting'].includes(m.status))observerBadge('CONECTANDO');else if(observerMode==='own'){observerBadge('OBSERVADOR OFF');observerMode='off'}});
observerClient.addEventListener('message',e=>{const m=e.detail;if(m.type==='gift')engine.onMessage({...m,observer:true})});
observerClient.addEventListener('error',e=>{observerBadge('FALHA');notice(`Observador: ${e.detail.message||'erro na conexão'}`,'error')});
observerClient.addEventListener('cloud',e=>{if(!e.detail.online&&observerMode==='own')observerBadge('OBSERVADOR OFF')});

els.connectCloud.onclick=async()=>{
  persist();const endpoint=els.endpoint.value.trim();
  if(!endpoint){notice('Informe o WebSocket do seu conector. Ex.: wss://meu-app.onrender.com','error');els.endpoint.focus();return}
  els.connectCloud.disabled=true;els.connectCloud.textContent='CONECTANDO…';notice('Abrindo WebSocket e validando autenticação…');
  try{await client.connect(endpoint,els.accessKey.value);client.ping();notice('Conector autenticado e pronto.','ok')}
  catch(error){notice(error?.message||'Não foi possível conectar ao endpoint informado.','error')}
  finally{els.connectCloud.disabled=false;els.connectCloud.textContent='CONECTAR';redraw()}
};
els.disconnectCloud.onclick=()=>{client.disconnect();observerClient.disconnect();observerMode='off';observerBadge('OBSERVADOR OFF');primaryLiveUser='';notice('Conector desconectado.');redraw()};
els.connectLive.onclick=()=>{persist();if(!requireConnector())return;const user=els.username.value.trim();if(!user){notice('Informe a conta @ da TikTok Live.','error');els.username.focus();return}engine.resetSession();if(!client.startLive(user))notice('Não foi possível enviar o comando de conexão da Live.','error');else notice(`Solicitando conexão com ${user.startsWith('@')?user:'@'+user}…`)};
els.stopLive.onclick=()=>{if(!requireConnector())return;client.stopLive();primaryLiveUser='';notice('Comando para parar a Live enviado.')};
els.captureCatalog.onclick=()=>{persist();if(!requireConnector())return;const user=els.username.value.trim();if(!user){notice('Informe a conta da Live para atualizar o catálogo.','error');return}client.captureCatalog(user);notice('Atualizando metadados do catálogo da sala…')};
els.captureToggle.onchange=()=>engine.saveSettings({capture:els.captureToggle.checked});
els.automationToggle.onchange=()=>engine.saveSettings({automation:els.automationToggle.checked});
els.giftSearch.oninput=()=>renderGifts(engine,els);els.giftSort.onchange=()=>renderGifts(engine,els);
els.giftList.onclick=e=>{const b=e.target.closest('[data-gift]');if(!b)return;els.ruleGift.value=b.dataset.gift;els.ruleTrigger.value='gift';els.ruleTrigger.scrollIntoView({behavior:'smooth',block:'center'})};
els.saveRule.onclick=()=>{const gift=engine.catalog.find(g=>(g.id||g.name)===els.ruleGift.value);engine.saveRule({trigger:els.ruleTrigger.value,giftId:gift?.id||'',giftName:gift?.name||'',quantity:els.ruleQuantity.value,cooldown:els.ruleCooldown.value})};
els.ruleList.onclick=e=>{const b=e.target.closest('[data-delete-rule]');if(b)engine.deleteRule(b.dataset.deleteRule)};

els.toggleDiagnostics.onclick=()=>{const opening=els.diagnosticsPanel.hidden;els.diagnosticsPanel.hidden=!opening;els.toggleDiagnostics.setAttribute('aria-expanded',String(opening));els.toggleDiagnostics.querySelector('b').textContent=opening?'−':'+';if(opening){diagnostics.render();setTimeout(()=>els.diagnosticsPanel.scrollIntoView({behavior:'smooth',block:'nearest'}),50)}};
els.diagClear.onclick=()=>diagnostics.clear();
els.diagPing.onclick=()=>{if(!requireConnector())return;const before=client.lastPong;els.diagPing.disabled=true;els.diagPing.textContent='TESTANDO…';diagnostics.log('HEARTBEAT MANUAL','Ping enviado ao Connector','neutral');client.ping();setTimeout(()=>{const ok=client.lastPong>before;diagnostics.log(ok?'HEARTBEAT OK':'HEARTBEAT SEM RESPOSTA',ok?`pong ${new Date(client.lastPong).toLocaleTimeString()}`:'nenhum pong novo em 2s',ok?'ok':'error');diagnostics.render();els.diagPing.disabled=false;els.diagPing.textContent='TESTAR HEARTBEAT'},2000)};
els.simulateTikTokDrop.onclick=()=>{if(!requireConnector())return;diagnostics.log('TESTE CONTROLADO','Solicitando queda intencional da sessão TikTok','warn');diagnostics.render();if(!client.simulateTikTokDrop())notice('Não foi possível enviar o teste de queda.','error')};

els.startObserver.onclick=async()=>{
  persist();const user=cleanUser(els.observerUser?.value||els.username.value);if(!user){notice('Informe uma conta para observar.','error');return}
  if(primaryLiveUser&&user===primaryLiveUser){observerMode='primary';observerBadge('OBSERVANDO','ok');notice(`Verificação ativa em @${user} usando a sessão principal.`,'ok');return}
  const endpoint=els.endpoint.value.trim();if(!endpoint){notice('Informe o WebSocket antes de iniciar o observador.','error');return}
  observerBadge('CONECTANDO');
  try{await observerClient.connect(endpoint,els.accessKey.value);observerMode='own';observerClient.startLive(user)}catch(error){observerMode='off';observerBadge('FALHA');notice(`Não foi possível iniciar o observador: ${error?.message||'erro de conexão'}`,'error')}
};
els.stopObserver.onclick=()=>{if(observerMode==='own'){observerClient.stopLive();observerClient.disconnect()}observerMode='off';observerBadge('OBSERVADOR OFF');notice('Observador parado.')};

els.testConnector.onclick=async()=>{
  persist();const endpoint=els.endpoint.value.trim();
  if(!endpoint){notice('Informe o WebSocket para testar o Connector.','error');els.endpoint.focus();return}
  const diagnostic=new ConnectorClient();els.testConnector.disabled=true;els.testConnector.textContent='TESTANDO…';notice('Diagnóstico: WebSocket → autenticação → heartbeat. Nenhuma Live será aberta.');
  try{
    await diagnostic.connect(endpoint,els.accessKey.value);
    const started=performance.now();
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Connector autenticou, mas não respondeu ao heartbeat.')),3500);
      diagnostic.addEventListener('pong',()=>{clearTimeout(timer);resolve()},{once:true});
      if(!diagnostic.ping()){clearTimeout(timer);reject(new Error('Não foi possível enviar o heartbeat.'))}
    });
    const latency=Math.max(1,Math.round(performance.now()-started));
    diagnostics.log('TESTE DO CONNECTOR OK',`autenticação OK · heartbeat ${latency} ms`,'ok');notice(`✅ Connector OK · autenticação OK · heartbeat ${latency} ms`,'ok');
  }catch(error){diagnostics.log('TESTE DO CONNECTOR FALHOU',error?.message||String(error),'error');notice(`❌ Diagnóstico falhou: ${error?.message||error}`,'error')}
  finally{diagnostic.disconnect();diagnostics.render();els.testConnector.disabled=false;els.testConnector.textContent='TESTAR'}
};

els.testPanel.onclick=async()=>{
  const originalAutomation=engine.settings.automation;engine.saveSettings({capture:true,automation:true});engine.resetSession();
  notice('Simulação local: testando interface, eventos e regras sem TikTok e sem Render.','ok');
  const samples=[
    {type:'status',status:'connected',username:'liveplus_teste'},
    {type:'like',user:'luna.qa',count:7},
    {type:'chat',user:'nexus.qa',comment:'teste live+'},
    {type:'follow',user:'sentinel.qa'},
    {type:'share',user:'luna.qa'},
    {type:'gift_catalog',gifts:[{id:'qa-rose',name:'Rose Test',diamondCount:1,icon:''}]},
    {type:'gift',user:'nexus.qa',gift:'Rose Test',giftId:'qa-rose',diamondCount:1,count:2,icon:''}
  ];
  for(const event of samples){engine.onMessage(event);await new Promise(r=>setTimeout(r,160))}
  setLiveStatus(els,{status:'connected',username:'liveplus_teste'});diagnostics.log('SIMULAÇÃO DO PAINEL OK','interface, eventos e regras responderam localmente','ok');diagnostics.render();notice('✅ Simulação concluída. Interface, eventos e regras responderam sem abrir Live.','ok');
  if(!originalAutomation)engine.saveSettings({automation:false});
};

const advanced=new URLSearchParams(location.search).get('dev')==='1';
if(els.observerSection)els.observerSection.hidden=!advanced;
setInterval(()=>{if(client.connected)client.ping();if(observerClient.connected)observerClient.ping();const started=engine.stats.startedAt;if(started){const sec=Math.floor((Date.now()-started)/1000),m=Math.floor(sec/60),s=sec%60;els.duration.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}redraw()},1000);
await loadMasterCatalog();
redraw();
