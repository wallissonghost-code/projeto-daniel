const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const TRIGGER_LABELS={gift:'🎁 Presente específico',giftvalue:'💎 Valor da doação',giftany:'🎁 Qualquer presente',like:'❤️ Curtidas',follow:'➕ Novo seguidor',share:'🔁 Compartilhou a Live',chat:'💬 Comentário'};
const giftValue=g=>Number(g?.diamondCount)>0?`${Number(g.diamondCount)} 💎`:'valor não identificado';
const ageLabel=at=>{if(!at)return'—';const s=Math.max(0,Math.floor((Date.now()-at)/1000));return s<2?'AGORA':s<60?`HÁ ${s}s`:s<3600?`HÁ ${Math.floor(s/60)}min`:`HÁ ${Math.floor(s/3600)}h`};
let lastGiftRenderKey='';
export function elements(){return new Proxy({}, {get:(_,k)=>$(k)})}
export function verifiedCatalog(engine){return engine.catalog.filter(g=>g.masterVerified===true)}
export function renderState(engine,client,els){
  const s=engine.snapshot(),st=s.stats,verified=verifiedCatalog(engine),now=Date.now();
  const socketOk=client.connected&&client.authenticated;
  els.cloudBadge.textContent=socketOk?'CONECTOR ONLINE':client.connected?'AUTENTICANDO':'DESCONECTADO';
  els.connectorBadge.textContent=socketOk?'ONLINE':client.connected?'AUTH':'OFFLINE';
  els.healthCloud.textContent=socketOk?'ONLINE':client.connected?'AUTH':'OFF';
  els.healthAccount.textContent=s.settings.username?`@${s.settings.username.replace(/^@/,'')}`:'—';
  els.likes.textContent=st.like;els.chat.textContent=st.chat;els.follow.textContent=st.follow;els.share.textContent=st.share;els.gift.textContent=st.gift;
  els.lastEvent.textContent=st.last?`${st.last.type.toUpperCase()} · ${st.last.user||'viewer'}${st.last.gift?' · '+st.last.gift:''}${st.last.type==='gift'&&!st.last.verifiedGift?' · NÃO VERIFICADO':''}`:'—';
  els.lastSignal.textContent=client.connected?ageLabel(client.lastPong):'—';
  const eventAge=st.last?now-st.last.at:Infinity;
  els.healthEvents.textContent=st.last?(eventAge<15000?'RECEBENDO':'SEM EVENTO RECENTE'):'AGUARDANDO';
  els.captureToggle.checked=s.settings.capture!==false;els.automationToggle.checked=!!s.settings.automation;els.engineBadge.textContent=s.settings.automation?'REGRAS ON':'CAPTURA';els.catalogCount.textContent=`${verified.length} verificados`;
  renderGifts(engine,els);renderRules(engine,els);
}
export function renderGifts(engine,els){
  const q=(els.giftSearch.value||'').toLowerCase(),sort=els.giftSort.value;
  let list=verifiedCatalog(engine).filter(g=>!q||`${g.name} ${g.id||''}`.toLowerCase().includes(q));
  list=[...list].sort(sort==='name'?(a,b)=>a.name.localeCompare(b.name):(a,b)=>(a.diamondCount-b.diamondCount)||a.name.localeCompare(b.name));
  const renderKey=JSON.stringify({q,sort,gifts:list.map(g=>[String(g.id||''),String(g.name||''),Number(g.diamondCount)||0,String(g.icon||'')])});
  if(renderKey===lastGiftRenderKey)return;
  lastGiftRenderKey=renderKey;
  els.giftList.innerHTML=list.slice(0,100).map(g=>`<div class="item verifiedGift"><div class="giftMeta">${g.icon?`<img class="giftIcon" src="${esc(g.icon)}" alt="${esc(g.name)}" loading="lazy" decoding="async">`:'<div class="giftIcon giftMissing">?</div>'}<div class="giftText"><b>${esc(g.name)}</b><small>${esc(giftValue(g))}</small><small class="green">✓ CATÁLOGO MESTRE</small></div></div><button data-gift="${esc(g.id||g.name)}">USAR NA REGRA</button></div>`).join('')||'<div class="notice">Nenhum presente verificado disponível.</div>';
  els.ruleGift.innerHTML='<option value="">Selecione um verificado</option>'+verifiedCatalog(engine).map(g=>`<option value="${esc(g.id||g.name)}">${esc(g.name)} · ${esc(giftValue(g))}</option>`).join('');
}
export function renderRules(engine,els){
  els.ruleList.innerHTML=engine.rules.map(r=>`<div class="item"><div class="giftText"><b>${esc(TRIGGER_LABELS[r.trigger]||r.trigger)}</b><small>${r.giftName?`presente ${esc(r.giftName)} · `:''}limite ${r.quantity} · cooldown ${r.cooldown}s</small></div><button data-delete-rule="${esc(r.id)}">EXCLUIR</button></div>`).join('')||'<div class="notice">Nenhuma regra configurada.</div>';
}
export function setLiveStatus(els,m){
  const connected=m.status==='connected',checking=['checking','reconnecting','zombie'].includes(m.status);
  els.healthTikTok.textContent=connected?'ON':checking?'CONECTANDO':'OFF';
  els.healthBadge.textContent=connected?'SAUDÁVEL':checking?'RECUPERANDO':'AGUARDANDO';
  els.healthBadge.classList.toggle('fail',!connected);
  els.connectorNotice.textContent=connected?`TikTok conectada em @${m.username||''}`:m.reason||`TikTok: ${m.status||'desconectada'}`;
}
