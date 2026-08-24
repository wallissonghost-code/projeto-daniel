const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const TRIGGER_LABELS={gift:'🎁 Presente específico',giftvalue:'💎 Valor da doação',giftany:'🎁 Qualquer presente',like:'❤️ Curtidas',follow:'➕ Novo seguidor',share:'🔁 Compartilhou a Live',chat:'💬 Comentário'};
const giftValue=g=>Number(g?.diamondCount)>0?`${Number(g.diamondCount)} 💎`:'valor não identificado';
export function elements(){return new Proxy({}, {get:(_,k)=>$(k)})}
export function verifiedCatalog(engine){return engine.catalog.filter(g=>g.verifiedAt&&!g.liveDivergence)}
export function renderState(engine,client,els){
  const s=engine.snapshot(),st=s.stats,verified=verifiedCatalog(engine),now=Date.now();
  const socketOk=client.connected&&client.authenticated;
  els.cloudBadge.textContent=socketOk?'CONECTOR ONLINE':client.connected?'AUTENTICANDO':'DESCONECTADO';
  els.connectorBadge.textContent=socketOk?'ONLINE':client.connected?'AUTH':'OFFLINE';
  els.healthCloud.textContent=socketOk?'ONLINE':client.connected?'AUTH':'OFF';
  els.healthAccount.textContent=s.settings.username?`@${s.settings.username.replace(/^@/,'')}`:'—';
  els.likes.textContent=st.like;els.chat.textContent=st.chat;els.follow.textContent=st.follow;els.share.textContent=st.share;els.gift.textContent=st.gift;
  els.lastEvent.textContent=st.last?`${st.last.type.toUpperCase()} · ${st.last.user||'viewer'}${st.last.gift?' · '+st.last.gift:''}`:'—';
  els.lastSignal.textContent=client.lastPong?new Date(client.lastPong).toLocaleTimeString():client.connected?'AGUARDANDO':'—';
  const eventAge=st.last?now-st.last.at:Infinity;
  els.healthEvents.textContent=st.last?(eventAge<15000?'RECEBENDO':'SEM EVENTO RECENTE'):(st.startedAt?'AGUARDANDO':'AGUARDANDO');
  els.captureToggle.checked=s.settings.capture!==false;els.automationToggle.checked=!!s.settings.automation;els.engineBadge.textContent=s.settings.automation?'REGRAS ON':'CAPTURA';els.catalogCount.textContent=`${verified.length} verificados`;
  renderGifts(engine,els);renderRules(engine,els);renderDiscovered(engine,els);
}
export function renderGifts(engine,els){
  const q=(els.giftSearch.value||'').toLowerCase(),sort=els.giftSort.value;
  let list=verifiedCatalog(engine).filter(g=>!q||`${g.name} ${g.id||''}`.toLowerCase().includes(q));
  list=[...list].sort(sort==='name'?(a,b)=>a.name.localeCompare(b.name):(a,b)=>(a.diamondCount-b.diamondCount)||a.name.localeCompare(b.name));
  els.giftList.innerHTML=list.slice(0,100).map(g=>`<div class="item verifiedGift"><div class="giftMeta">${g.icon?`<img class="giftIcon" src="${esc(g.icon)}" alt="${esc(g.name)}" loading="lazy">`:'<div class="giftIcon giftMissing">?</div>'}<div class="giftText"><b>${esc(g.name)}</b><small>${esc(giftValue(g))}</small><small class="green">✓ PRESENTE VERIFICADO</small></div></div><button data-gift="${esc(g.id||g.name)}">USAR NA REGRA</button></div>`).join('')||'<div class="notice">Nenhum presente verificado disponível ainda.</div>';
  els.ruleGift.innerHTML='<option value="">Selecione um verificado</option>'+verifiedCatalog(engine).map(g=>`<option value="${esc(g.id||g.name)}">${esc(g.name)} · ${esc(giftValue(g))}</option>`).join('');
}
export function renderRules(engine,els){
  els.ruleList.innerHTML=engine.rules.map(r=>`<div class="item"><div class="giftText"><b>${esc(TRIGGER_LABELS[r.trigger]||r.trigger)}</b><small>${r.giftName?`presente ${esc(r.giftName)} · `:''}limite ${r.quantity} · cooldown ${r.cooldown}s</small></div><button data-delete-rule="${esc(r.id)}">EXCLUIR</button></div>`).join('')||'<div class="notice">Nenhuma regra configurada.</div>';
}
export function renderDiscovered(engine,els){
  if(!els.discoveredList)return;
  els.discoveredList.innerHTML=engine.discovered.slice(0,80).map(g=>`<div class="item"><div class="giftMeta">${g.icon?`<img class="giftIcon" src="${esc(g.icon)}" alt="${esc(g.name)}" loading="lazy">`:'<div class="giftIcon giftMissing">?</div>'}<div class="giftText"><b>${esc(g.name)}</b><small>${esc(giftValue(g))}</small><small class="green">confirmado nesta sessão · ${Number(g.seen)||1}×</small></div></div></div>`).join('')||'<div class="notice">Nenhum presente novo observado.</div>';
}
export function setLiveStatus(els,m){
  const connected=m.status==='connected',checking=['checking','reconnecting','zombie'].includes(m.status);
  els.healthTikTok.textContent=connected?'ON':checking?'CONECTANDO':'OFF';
  els.healthBadge.textContent=connected?'SAUDÁVEL':checking?'RECUPERANDO':'AGUARDANDO';
  els.healthBadge.classList.toggle('fail',!connected);
  els.connectorNotice.textContent=connected?`TikTok conectada em @${m.username||''}`:m.reason||`TikTok: ${m.status||'desconectada'}`;
}
