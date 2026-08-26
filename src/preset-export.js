(()=>{'use strict';
const RULES_KEY='daniel.live.plus.v2.rules';
const button=()=>document.getElementById('exportGamePreset');
const notice=(text)=>{const el=document.getElementById('connectorNotice');if(!el)return;el.dataset.tone='neutral';el.innerHTML=`<span class="noticeDot"></span><span>${text}</span>`};
const safeName=value=>String(value||'jogo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase()||'jogo';
const readRules=()=>{try{const value=JSON.parse(localStorage.getItem(RULES_KEY));return Array.isArray(value)?value:[]}catch{return[]}};
function exportPreset(){
  const manifest=window.LivePlusMatch?.getManifest?.();
  if(!manifest?.gameId){notice('Conecte um jogo antes de salvar o preset.');return}
  const rules=readRules().filter(rule=>String(rule.gameId||'')===String(manifest.gameId));
  if(!rules.length){notice(`Nenhuma regra configurada para ${manifest.name||manifest.gameName||'este jogo'}.`);return}
  const preset={
    format:'liveplus-game-preset',
    version:1,
    game:{id:String(manifest.gameId),name:String(manifest.name||manifest.gameName||'Jogo'),version:String(manifest.version||''),icon:String(manifest.icon||'')},
    exportedAt:new Date().toISOString(),
    rules:rules.map(({id,...rule})=>({...rule}))
  };
  const blob=new Blob([JSON.stringify(preset,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`${safeName(preset.game.name)}.preset.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  const b=button();if(b){const original=b.textContent;b.textContent='PRESET SALVO ✓';setTimeout(()=>{b.textContent=original},1600)}
  notice(`Preset de ${preset.game.name} exportado com ${rules.length} regra${rules.length===1?'':'s'}.`);
}
window.addEventListener('load',()=>button()?.addEventListener('click',exportPreset));
})();