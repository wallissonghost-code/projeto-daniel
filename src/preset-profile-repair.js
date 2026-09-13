(()=>{'use strict';
const PREFIX='daniel.live.plus.v2',GAME_ID='frutas';
const RULES_KEY=`${PREFIX}.rulesByGame`,META_KEY=`${PREFIX}.ruleProfileMeta`,MIGRATION_KEY=`${PREFIX}.migrations.frutas-central-preset-v1`;
try{
  if(localStorage.getItem(MIGRATION_KEY)!=='1'){
    const profiles=JSON.parse(localStorage.getItem(RULES_KEY)||'{}');
    const rules=Array.isArray(profiles?.[GAME_ID])?profiles[GAME_ID]:[];
    if(rules.length===0){
      const meta=JSON.parse(localStorage.getItem(META_KEY)||'{}');
      if(meta&&typeof meta==='object'&&meta[GAME_ID]){delete meta[GAME_ID];localStorage.setItem(META_KEY,JSON.stringify(meta));}
    }
    localStorage.setItem(MIGRATION_KEY,'1');
  }
}catch(error){console.warn('Frutas preset profile repair skipped',error);}

function addRestoreControl(){
  const section=document.getElementById('rulesSection');if(!section||document.getElementById('restoreGameDefaults'))return;
  const banner=section.querySelector('.infoBanner');if(!banner)return;
  const wrap=document.createElement('div');wrap.className='ruleFormActions';wrap.style.marginTop='12px';
  const button=document.createElement('button');button.id='restoreGameDefaults';button.type='button';button.textContent='VOLTAR À CONFIGURAÇÃO PADRÃO';
  const help=document.createElement('small');help.textContent='Restaura os presentes e ações recomendados deste jogo.';help.style.display='block';help.style.marginTop='8px';help.style.opacity='.7';
  wrap.append(button,help);banner.insertAdjacentElement('afterend',wrap);
  button.addEventListener('click',async()=>{
    const engine=globalThis.LivePlusEngine,gameId=String(engine?.activeGameId||'').trim();
    if(!engine||!gameId){alert('Conecte um jogo antes de restaurar a configuração padrão.');return;}
    if(!confirm('Isso vai substituir as regras atuais pelas configurações padrão do jogo. Deseja continuar?'))return;
    button.disabled=true;const previous=button.textContent;button.textContent='RESTAURANDO…';
    try{
      const response=await fetch(`./data/presets/${encodeURIComponent(gameId)}.json`,{cache:'no-store'});
      if(!response.ok)throw new Error('Este jogo ainda não possui uma configuração padrão salva.');
      const preset=await response.json();
      if(preset?.format!=='liveplus-game-preset'||String(preset?.game?.id||'')!==gameId||!Array.isArray(preset.rules)||!preset.rules.length)throw new Error('A configuração padrão deste jogo está inválida.');
      const count=engine.replaceRules(preset.rules,{source:'official-preset'});
      if(!count)throw new Error('Nenhuma regra padrão pôde ser restaurada.');
      const rules=engine.rules.filter(r=>!r.__profileMarker&&r.actionId).map(r=>({actionId:r.actionId,trigger:r.trigger,giftId:r.giftId||'',giftName:r.giftName||'',giftIcon:r.giftIcon||'',giftValue:Number(r.giftValue)||0,quantity:Number(r.quantity)||1,commentText:r.commentText||'',actionParams:r.actionParams&&typeof r.actionParams==='object'?structuredClone(r.actionParams):{}}));
      globalThis.LivePlusMatch?.send?.({type:'rules_sync',gameId,rules,at:Date.now()});
      alert(`Configuração padrão restaurada com ${count} regra${count===1?'':'s'}.`);
    }catch(error){console.error('Game default restore failed',error);alert(error?.message||'Não foi possível restaurar a configuração padrão.');}
    finally{button.disabled=false;button.textContent=previous;}
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addRestoreControl,{once:true});else addRestoreControl();
})();
