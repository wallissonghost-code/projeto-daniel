const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TRIGGER_LABELS={gift:'🎁 Presente específico',giftvalue:'💎 Valor da doação',giftany:'🎁 Qualquer presente',like:'❤️ Curtidas',follow:'➕ Novo seguidor',share:'🔁 Compartilhou a Live',chat:'💬 Comentário'};
export function elements(){return new Proxy({}, {get:(_,k)=>$(k)})}
export function verifiedCatalog(engine){return engine.catalog.filter(g=>g.verifiedAt&&!g.liveDivergence)}
export function renderState(engine,client,els){
  const s=engine.snapshot(),st=s.stats,verified=verifiedCatalog(engine);
  els.cloudBadge.textContent=client.connected?'CONECTOR ONLINE':'DESCONECTADO';els.connectorBadge.textContent=client.connected?'ONLINE':'OFFLINE';els.healthCloud.textContent=client.connected?'ONLINE':'OFF';
  els.healthAccount.textContent=s.settings.username?`@${s.settings.username.replace(/^@/,'')}`:'—';els.likes.textContent=st.like;els.chat.textContent=st.chat;els.follow.textContent=st.follow;els.share.textContent=st.share;els.gift.textContent=st.gift;
  els.lastEvent.textContent=st.last?`${st.last.type.toUpperCase()} · ${st.last.user||'viewer'}${st.last.gift?' · '+st.last.gift:''}`:'—';els.lastSignal.textContent=st.last?new Date(st.last.at).toLocaleTimeString():'—';els.healthEvents.textContent=st.last?'RECEBENDO':'AGUARDANDO';
  els.captureToggle.checked=s.settings.capture!==false;els.automationToggle.checked=!!s.settings.automation;els.engineBadge.textContent=s.settings.automation?'REGRAS ON':'CAPTURA';els.catalogCount.textContent=`${verified.length} verificados`;
  renderGifts(engine,els);renderRules(engine,els);renderDiscovered(engine,els);
}
export function renderGifts(engine,els){
  const q=(els.giftSearch.value||'').toLowerCase(),sort=els.giftSort.value;let list=verifiedCatalog(engine).filter(g=>!q||`${g.name} ${g.id||''}`.toLowerCase().includes(q));list=[...list].sort(sort==='name'?(a,b)=>a.name.localeCompare(b.name):(a,b)=>(a.diamondCount-b.diamondCount)||a.name.localeCompare(b.name));
  els.giftList.innerHTML=list.slice(0,100).map(g=>`<div class="item verifiedGift"><div class="giftMeta">${g.icon?`<img class="giftIcon" src="${esc(g.icon)}" alt="">`:'<div class="giftIcon"></div>'}<div class="giftText"><b>${esc(g.name)}</b><small>ID ${esc(g.id||'—')} · ${Number(g.diamondCount)||0} 💎</small><small class="green">✓ VERIFICADO AO VIVO</small></div></div><button data-gift="${esc(g.id||g.name)}">USAR NA REGRA</button></div>`).join('')||'<div class="notice">Nenhum presente verificado ainda. Conecte uma Live para confirmar gifts reais.</div>';
  els.ruleGift.innerHTML='<option value="">Selecione um verificado</option>'+verifiedCatalog(engine).map(g=>`<option value="${esc(g.id||g.name)}">${esc(g.name)} · ${Number(g.diamondCount)||0} 💎</option>`).join('');
}
export function renderRules(engine,els){
  els.ruleList.innerHTML=engine.rules.map(r=>`<div class="item"><div class="giftText"><b>${esc(TRIGGER_LABELS[r.trigger]||r.trigger)}</b><small>${r.giftName||r.giftId?`presente ${esc(r.giftName||r.giftId)} · `:''}limite ${r.quantity} · cooldown ${r.cooldown}s</small></div><button data-delete-rule="${esc(r.id)}">EXCLUIR</button></div>`).join('')||'<div class="notice">Nenhuma regra configurada.</div>';
}
export function renderDiscovered(engine,els){
  els.discoveredList.innerHTML=engine.discovered.slice(0,80).map(g=>`<div class="item"><div class="giftMeta">${g.icon?`<img class="giftIcon" src="${esc(g.icon)}" alt="">`:'<div class="giftIcon"></div>'}<div class="giftText"><b>${esc(g.name)}</b><small>ID ${esc(g.id||'—')} · ${Number(g.diamondCount)||0} 💎</small><small class="green">confirmado nesta sessão</small></div></div></div>`).join('')||'<div class="notice">Nenhum presente novo observado.</div>';
}
export function setLiveStatus(els,m){
  const connected=m.status==='connected',checking=['checking','reconnecting'].includes(m.status);els.healthTikTok.textContent=connected?'ON':checking?'CONECTANDO':'OFF';els.healthBadge.textContent=connected?'SAUDÁVEL':checking?'CONECTANDO':'AGUARDANDO';els.healthBadge.classList.toggle('fail',!connected);els.connectorNotice.textContent=connected?`TikTok conectada em @${m.username||''}`:m.reason||`TikTok: ${m.status||'desconectada'}`;
}
