(()=>{'use strict';
const PREFIX='daniel.live.plus.v2';
const LEGACY_RULES_KEY=`${PREFIX}.rules`;
const RULE_PROFILES_KEY=`${PREFIX}.rulesByGame`;
const PROFILE_META_KEY=`${PREFIX}.ruleProfileMeta`;
const ACTIVE_GAME_KEY=`${PREFIX}.activeGameId`;
const button=()=>document.getElementById('exportGamePreset');
const restoreButton=()=>document.getElementById('restoreOfficialPreset');
const notice=(text,tone='neutral')=>{const el=document.getElementById('connectorNotice');if(!el)return;el.dataset.tone=tone;el.innerHTML=`<span class="noticeDot"></span><span>${text}</span>`};
const safeName=value=>String(value||'jogo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase()||'jogo';
const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const readJSON=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key));return value??fallback}catch{return fallback}};
const writeJSON=(key,value)=>{localStorage.setItem(key,JSON.stringify(value));return value};
const cleanRules=value=>(Array.isArray(value)?value:[]).filter(rule=>rule&&!rule.__profileMarker);
function resolveRules(manifest){
  const gameId=String(manifest?.gameId||'').trim();
  const activeId=String(readJSON(ACTIVE_GAME_KEY,'')||'').trim();
  const profiles=readJSON(RULE_PROFILES_KEY,{});
  if(profiles&&typeof profiles==='object'&&!Array.isArray(profiles)){
    const direct=cleanRules(profiles[gameId]);if(direct.length)return{rules:direct,profileId:gameId,source:'manifest'};
    const active=cleanRules(profiles[activeId]);if(active.length)return{rules:active,profileId:activeId,source:'active'};
    const wantedName=norm(manifest?.name||manifest?.gameName||'');
    if(wantedName){for(const [id,list] of Object.entries(profiles)){const rules=cleanRules(list);if(rules.some(r=>norm(r.gameName)===wantedName))return{rules,profileId:id,source:'name'}}}
    const nonEmpty=Object.entries(profiles).map(([id,list])=>[id,cleanRules(list)]).filter(([,rules])=>rules.length);
    if(nonEmpty.length===1)return{rules:nonEmpty[0][1],profileId:nonEmpty[0][0],source:'single-profile'};
  }
  const legacy=cleanRules(readJSON(LEGACY_RULES_KEY,[]));
  const matched=legacy.filter(rule=>String(rule?.gameId||'')===gameId||String(rule?.gameId||'')===activeId);
  return{rules:matched.length?matched:legacy,profileId:gameId||activeId,source:matched.length?'legacy-match':'legacy'};
}
async function deliverPreset(preset,rules){
  const filename=`${safeName(preset.game.name)}.preset.json`;
  const json=JSON.stringify(preset,null,2);
  const file=new File([json],filename,{type:'application/json'});
  if(navigator.canShare?.({files:[file]})&&navigator.share){
    try{await navigator.share({files:[file],title:`Preset ${preset.game.name}`});return 'share'}catch(error){if(error?.name!=='AbortError')console.warn('[preset-export] share failed',error);if(error?.name==='AbortError')return 'cancel'}
  }
  const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);return 'download';
}
async function exportPreset(){
  const b=button();if(b.disabled)return;
  const manifest=window.LivePlusMatch?.getManifest?.();
  if(!manifest?.gameId){notice('Conecte um jogo antes de salvar o preset.','error');return}
  const resolved=resolveRules(manifest),rules=resolved.rules;
  if(!rules.length){notice(`Nenhuma regra encontrada para ${manifest.name||manifest.gameName||'este jogo'}. Abra Gatilhos e salve uma regra primeiro.`,'error');return}
  const preset={format:'liveplus-game-preset',version:1,game:{id:String(manifest.gameId),name:String(manifest.name||manifest.gameName||'Jogo'),version:String(manifest.version||''),icon:String(manifest.icon||'')},exportedAt:new Date().toISOString(),rules:rules.map(({id,__profileMarker,...rule})=>({...rule,gameId:String(manifest.gameId),gameName:String(rule.gameName||manifest.name||manifest.gameName||'Jogo')}))};
  if(b){b.disabled=true;b.textContent='GERANDO…'}
  try{
    const mode=await deliverPreset(preset,rules);
    if(mode==='cancel'){notice('Exportação cancelada.');return}
    notice(`Preset de ${preset.game.name} pronto com ${rules.length} regra${rules.length===1?'':'s'}.`,'ok');
    if(b)b.textContent='PRESET SALVO ✓';
  }catch(error){console.error('[preset-export]',error);notice(`Erro ao exportar preset: ${error?.message||error}`,'error')}
  finally{setTimeout(()=>{if(b){b.disabled=false;b.textContent='SALVAR PRESET'}},1600)}
}
async function officialRules(manifest){
  const gameId=String(manifest?.gameId||'').trim();
  const fromGame=cleanRules(manifest?.defaultRules).filter(rule=>String(rule?.gameId||gameId)===gameId&&rule?.actionId);
  if(fromGame.length)return{rules:fromGame,source:'game'};
  const response=await fetch(`./data/presets/${encodeURIComponent(gameId)}.json`,{cache:'no-store'});
  if(!response.ok)return{rules:[],source:'missing'};
  const preset=await response.json();
  if(preset?.format!=='liveplus-game-preset'||String(preset?.game?.id||'')!==gameId)return{rules:[],source:'invalid'};
  return{rules:cleanRules(preset.rules).filter(rule=>String(rule?.gameId||gameId)===gameId&&rule?.actionId),source:'connector'};
}
function normalizeOfficialRules(manifest,rules){
  const gameId=String(manifest.gameId),gameName=String(manifest.name||manifest.gameName||'Jogo'),gameIcon=String(manifest.icon||'');
  return rules.map((raw,index)=>({...raw,id:crypto.randomUUID?.()||`${Date.now()}-${index}`,gameId,gameName:String(raw.gameName||gameName),gameIcon:String(raw.gameIcon||gameIcon)}));
}
function saveOfficialProfile(gameId,rules){
  const profiles=readJSON(RULE_PROFILES_KEY,{});const safeProfiles=profiles&&typeof profiles==='object'&&!Array.isArray(profiles)?profiles:{};
  safeProfiles[gameId]=rules;writeJSON(RULE_PROFILES_KEY,safeProfiles);
  const meta=readJSON(PROFILE_META_KEY,{});const safeMeta=meta&&typeof meta==='object'&&!Array.isArray(meta)?meta:{};
  safeMeta[gameId]={...(safeMeta[gameId]||{}),initialized:true,userModified:false,source:'game-default',restoredAt:Date.now(),updatedAt:Date.now()};writeJSON(PROFILE_META_KEY,safeMeta);
  writeJSON(ACTIVE_GAME_KEY,gameId);
}
function refreshActiveGame(manifest,rules){
  window.dispatchEvent(new CustomEvent('liveplus-game-disconnected'));
  window.dispatchEvent(new CustomEvent('liveplus-game-manifest',{detail:manifest}));
  window.LivePlusMatch?.send?.({type:'rules_sync',gameId:String(manifest.gameId),rules:rules.map(r=>({actionId:r.actionId,trigger:r.trigger,giftId:r.giftId||'',giftName:r.giftName||'',giftIcon:r.giftIcon||'',giftValue:Number(r.giftValue)||0,quantity:Number(r.quantity)||1,commentText:r.commentText||'',actionParams:r.actionParams&&typeof r.actionParams==='object'?structuredClone(r.actionParams):{}})),at:Date.now()});
  setTimeout(()=>window.LivePlusServerAutomation?.sync?.(),80);
}
async function restoreOfficialPreset(){
  const b=restoreButton();if(b?.disabled)return;
  const manifest=window.LivePlusMatch?.getManifest?.();
  if(!manifest?.gameId){notice('Conecte um jogo antes de restaurar o padrão.','error');return}
  if(!confirm(`Restaurar as regras oficiais de ${manifest.name||manifest.gameName||'este jogo'}? Suas alterações deste jogo serão substituídas.`))return;
  if(b){b.disabled=true;b.textContent='…'}
  try{
    const official=await officialRules(manifest);
    if(!official.rules.length){notice('Este jogo não enviou regras padrão e não possui preset oficial no Connector.','error');return}
    const rules=normalizeOfficialRules(manifest,official.rules),gameId=String(manifest.gameId);
    saveOfficialProfile(gameId,rules);refreshActiveGame(manifest,rules);
    notice(`↺ ${manifest.name||manifest.gameName||'Jogo'} voltou ao padrão oficial (${rules.length} regra${rules.length===1?'':'s'}).`,'ok');
  }catch(error){console.error('[preset-restore]',error);notice(`Erro ao restaurar padrão: ${error?.message||error}`,'error')}
  finally{if(b){b.disabled=false;b.textContent='↺'}}
}
function ensureRestoreButton(){
  if(restoreButton())return restoreButton();const exportBtn=button();if(!exportBtn)return null;
  const b=document.createElement('button');b.id='restoreOfficialPreset';b.type='button';b.className='badge';b.textContent='↺';b.title='Restaurar regras oficiais do jogo';b.setAttribute('aria-label','Restaurar regras oficiais do jogo');
  b.style.marginRight='8px';b.style.minWidth='40px';b.style.fontSize='18px';b.style.cursor='pointer';exportBtn.parentElement?.insertBefore(b,exportBtn);return b;
}
function bind(){const b=button();if(b&&b.dataset.presetExportBound!=='1'){b.dataset.presetExportBound='1';b.addEventListener('click',exportPreset)}const restore=ensureRestoreButton();if(restore&&restore.dataset.presetRestoreBound!=='1'){restore.dataset.presetRestoreBound='1';restore.addEventListener('click',restoreOfficialPreset)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
window.LivePlusPresetExport={exportPreset,resolveRules,restoreOfficialPreset};
})();