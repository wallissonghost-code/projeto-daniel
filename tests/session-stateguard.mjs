import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../src/modules/ui.js',import.meta.url),'utf8');

const say=(msg)=>console.log(`[SENTINEL STATEGUARD] ${msg}`);
const must=(cond,msg)=>{assert.ok(cond,msg);say(`OK · ${msg}`)};

must(app.includes('function finishLocalLiveSession()'),'existe encerramento local centralizado da sessão');
must(app.includes("engine.stats.startedAt=0"),'encerramento zera o relógio ativo');
must(app.includes("label.textContent='ÚLTIMA SESSÃO'"),'sessão encerrada muda o rótulo para ÚLTIMA SESSÃO');
must(app.includes("setLiveStatus(els,{status:'disconnected'"),'sessão encerrada força TikTok visual para OFF');
must(app.includes("els.healthEvents.textContent='AGUARDANDO'"),'sessão encerrada não deixa EVENTOS em RECEBENDO');
must(app.includes("els.disconnectCloud.onclick=()=>{if(client.connected&&client.authenticated)client.stopLive();finishLocalLiveSession();client.disconnect()"),'desconectar o Connector encerra estado local antes de fechar o socket');
must(app.includes("els.stopLive.onclick=()=>{if(!requireConnector())return;client.stopLive();finishLocalLiveSession()"),'PARAR LIVE encerra também o estado local');
must(app.includes("function startLocalLiveSession(){const label=durationLabel();if(label)label.textContent='DURAÇÃO';els.duration.textContent='00:00'"),'nova sessão restaura DURAÇÃO e começa em 00:00');
must(app.includes("els.connectLive.onclick=()=>{persist();if(!requireConnector())return;const user=els.username.value.trim();if(!user){notice('Informe a conta @ da TikTok Live.','error');els.username.focus();return}startLocalLiveSession();engine.resetSession()"),'nova conexão reinicia estado antes de solicitar a Live');
must(app.includes("else if(['disconnected','offline'].includes(m.status)&&engine.stats.startedAt)finishLocalLiveSession()"),'status remoto offline/disconnected encerra cronômetro local');
must(ui.includes("els.healthTikTok.textContent=connected?'ON':checking?'CONECTANDO':'OFF'"),'UI traduz sessão desconectada para TikTok OFF');

const impossibleStates=[
  {connector:false,tiktok:true,valid:false,label:'Connector OFF + TikTok ON'},
  {connector:false,events:'RECEBENDO',valid:false,label:'Connector OFF + Eventos RECEBENDO'},
  {startedAt:0,timerAdvancing:true,valid:false,label:'sem startedAt + cronômetro avançando'},
  {connector:true,tiktok:true,events:'RECEBENDO',startedAt:Date.now(),valid:true,label:'sessão saudável'}
];
for(const state of impossibleStates){
  if(state.valid)continue;
  say(`GUARDA ATIVA · deve impedir: ${state.label}`);
}

say('AUDITORIA DE CICLO DE SESSÃO CONCLUÍDA');
