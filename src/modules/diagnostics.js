const fmtTime=at=>at?new Date(at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
const fmtAgo=at=>{if(!at)return'—';const s=Math.max(0,Math.floor((Date.now()-at)/1000));return s<2?'agora':s<60?`há ${s}s`:s<3600?`há ${Math.floor(s/60)}min`:`há ${Math.floor(s/3600)}h`};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));

export class LiveDiagnostics{
  constructor(client,els){this.client=client;this.els=els;this.entries=[];this.mode='—';this.liveStatus='AGUARDANDO';this.lastCause='nenhuma';this.reconnections=0;this.lastInteractionAt=0;this.lastInteractionType='—';this.lastPong=0;this.maxEntries=40;this.bind()}
  bind(){
    this.client.addEventListener('cloud',e=>{const d=e.detail||{};if(d.online&&d.authenticated)this.log('CONNECTOR AUTENTICADO','WebSocket + chave validados','ok');else if(!d.online&&d.error)this.log('ERRO DO CONNECTOR',d.error,'error');else if(!d.online&&d.code)this.log('CLOUD WEBSOCKET OSCILOU',`código ${d.code}${d.reason?' · '+d.reason:''}`,'warn');this.render()});
    this.client.addEventListener('pong',e=>{const d=e.detail||{};this.lastPong=Number(d.at)||Date.now();if(d.mode)this.mode=d.mode;if(d.reconnecting){this.liveStatus='RECUPERANDO';this.lastCause=`Auto Recovery · tentativa ${d.attempt||1}`}this.render()});
    this.client.addEventListener('status',e=>this.onStatus(e.detail||{}));
    this.client.addEventListener('debug',e=>this.onDebug(e.detail||{}));
    for(const type of ['like','chat','gift','follow','share'])this.client.addEventListener(type,()=>{this.lastInteractionAt=Date.now();this.lastInteractionType=type;this.render()});
    this.client.addEventListener('gift_catalog_error',e=>{this.log('CATÁLOGO INDISPONÍVEL',e.detail?.message||'falha ao consultar presentes','warn');this.render()});
    this.client.addEventListener('gift_catalog',()=>{this.log('CATÁLOGO ATUALIZADO','Metadados dos presentes recebidos','ok');this.render()});
  }
  onStatus(m){if(m.mode)this.mode=m.mode;const s=m.status||'';
    if(s==='connected'){this.liveStatus='LIVE OK';this.lastCause=m.recovered?'sessão recuperada':'nova sessão TikTok';this.log(m.recovered?'TIKTOK RECUPERADA':'TIKTOK CONECTADA',`${this.mode}${m.username?' · @'+m.username:''}`,'ok')}
    else if(s==='checking'){this.liveStatus='CONECTANDO';this.lastCause=m.recovery?'tentativa de recuperação':'abrindo sessão TikTok';this.log(m.recovery?'RECOVERY TENTANDO':'CONEXÃO TIKTOK INICIADA',m.attempt?`tentativa ${m.attempt}`:'aguardando resposta','warn')}
    else if(s==='reconnecting'){this.liveStatus='RECUPERANDO';this.reconnections+=1;this.lastCause=m.reason||'queda inesperada';this.log(`RECONEXÃO #${this.reconnections}`,`${this.lastCause} · tentativa ${m.attempt||1}/${m.maxAttempts||2}`,'warn')}
    else if(s==='disconnected'){this.liveStatus='DESCONECTADA';this.lastCause=m.manual?'parada manualmente':m.reason||'TikTok desconectou';this.log('TIKTOK DESCONECTADA',this.lastCause,m.manual?'neutral':'error')}
    else if(s==='error'){this.liveStatus='FALHA';this.lastCause=m.reason||'erro TikTok';this.log('ERRO TIKTOK',this.lastCause,'error')}
    this.render()}
  onDebug(m){const event=String(m.event||'DEBUG').replaceAll('_',' ');if(m.mode)this.mode=m.mode;const detail=m.detail||m.reason||m.username||'';if(/RECUPERADA/i.test(event))this.lastCause='sessão recuperada';if(/FALHOU|ERROR|FAILED/i.test(event))this.lastCause=detail||event;this.log(event,detail,/FALHOU|ERROR|FAILED/i.test(event)?'error':/RECOVERY|AGENDADO/i.test(event)?'warn':'neutral',m.at);this.render()}
  log(title,detail='',tone='neutral',at=Date.now()){const last=this.entries[0];if(last&&last.title===title&&last.detail===detail&&Date.now()-last.at<700)return;this.entries.unshift({title,detail,tone,at:Number(at)||Date.now()});this.entries=this.entries.slice(0,this.maxEntries)}
  clear(){this.entries=[];this.render()}
  snapshot(){return{mode:this.mode,cloud:this.client.connected?'OK':'FECHADO',live:this.liveStatus,reconnections:this.reconnections,lastCause:this.lastCause,lastInteraction:this.lastInteractionAt?`${this.lastInteractionType} · ${fmtAgo(this.lastInteractionAt)}`:'—',heartbeat:this.lastPong?fmtTime(this.lastPong):'—'}}
  render(){const e=this.els;if(!e?.diagMode)return;const s=this.snapshot();e.diagMode.textContent=s.mode;e.diagCloud.textContent=s.cloud;e.diagLive.textContent=s.live;e.diagReconnects.textContent=String(s.reconnections);e.diagLastCause.textContent=s.lastCause;e.diagInteraction.textContent=s.lastInteraction;e.diagHeartbeat.textContent=s.heartbeat;e.diagLog.innerHTML=this.entries.map(x=>`<div class="diagEntry ${esc(x.tone)}"><div><b>${esc(x.title)}</b><small>${esc(x.detail||'—')}</small></div><time>${esc(fmtTime(x.at))}</time></div>`).join('')||'<div class="diagEmpty">Nenhum evento técnico registrado nesta sessão.</div>'}
}
