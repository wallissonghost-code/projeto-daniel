const PREFIX='daniel.live.plus.v2';
const UNSCOPED='__unscoped__';
const keys={settings:`${PREFIX}.settings`,rules:`${PREFIX}.rules`,ruleProfiles:`${PREFIX}.rulesByGame`,ruleProfileMeta:`${PREFIX}.ruleProfileMeta`,activeGame:`${PREFIX}.activeGameId`};
for(const legacy of [`${PREFIX}.catalog`,`${PREFIX}.discovered`]){try{localStorage.removeItem(legacy)}catch{}}
function read(key,fallback){try{const v=JSON.parse(localStorage.getItem(key));return v??fallback}catch{return fallback}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));return value}
function cleanGameId(v){return String(v||'').trim()}
function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()}
function migrateProfiles(){
  const existing=read(keys.ruleProfiles,null);if(existing&&typeof existing==='object'&&!Array.isArray(existing))return existing;
  const legacy=read(keys.rules,[]),profiles={};
  for(const rule of Array.isArray(legacy)?legacy:[]){const gameId=cleanGameId(rule?.gameId)||UNSCOPED;(profiles[gameId]||(profiles[gameId]=[])).push(rule)}
  write(keys.ruleProfiles,profiles);
  const meta=read(keys.ruleProfileMeta,{});for(const gameId of Object.keys(profiles)){if(gameId!==UNSCOPED)meta[gameId]={...(meta[gameId]||{}),initialized:true,migrated:true,updatedAt:Date.now()}}write(keys.ruleProfileMeta,meta);
  return profiles;
}
function profiles(){return migrateProfiles()}
function saveProfiles(value){return write(keys.ruleProfiles,value&&typeof value==='object'?value:{})}
function profileMeta(){const v=read(keys.ruleProfileMeta,{});return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
function setProfileMeta(gameId,patch={}){const id=cleanGameId(gameId);if(!id)return null;const all=profileMeta();all[id]={...(all[id]||{}),...patch,updatedAt:Date.now()};write(keys.ruleProfileMeta,all);return all[id]}
function rulesForGame(gameId){const id=cleanGameId(gameId);if(!id)return[];const all=profiles();return Array.isArray(all[id])?all[id]:[]}
function saveRulesForGame(gameId,value,{markInitialized=true,userModified=false,source='local'}={}){const id=cleanGameId(gameId);if(!id)return[];const all=profiles(),rules=Array.isArray(value)?value:[];all[id]=rules;saveProfiles(all);if(markInitialized)setProfileMeta(id,{initialized:true,userModified:!!userModified,source});return rules}
function migrateGiftReferences(catalog=[]){
  const gifts=Array.isArray(catalog)?catalog:[];
  const byId=new Map(),byName=new Map();
  for(const gift of gifts){const id=gift?.id==null?'':String(gift.id),name=norm(gift?.name);if(id)byId.set(id,gift);if(name){const arr=byName.get(name)||[];arr.push(gift);byName.set(name,arr)}}
  const all=profiles();let changedRules=0,changedProfiles=0;
  for(const [gameId,rules] of Object.entries(all)){
    if(!Array.isArray(rules)||gameId===UNSCOPED)continue;
    let profileChanged=false;
    const next=rules.map(rule=>{
      if(!rule||rule.__profileMarker||rule.trigger!=='gift')return rule;
      const oldId=rule.giftId==null?'':String(rule.giftId),oldName=norm(rule.giftName);
      let gift=oldId?byId.get(oldId):null;
      if(!gift&&oldName){const matches=byName.get(oldName)||[];if(matches.length===1)gift=matches[0]}
      if(!gift)return rule;
      const newId=gift.id==null?'':String(gift.id),newName=String(gift.name||rule.giftName||''),newIcon=String(gift.icon||''),newValue=Math.max(0,Number(gift.diamondCount)||0);
      const changed=oldId!==newId||String(rule.giftName||'')!==newName||String(rule.giftIcon||'')!==newIcon||Number(rule.giftValue||0)!==newValue;
      if(!changed)return rule;
      profileChanged=true;changedRules++;
      return{...rule,giftId:newId,giftName:newName,giftIcon:newIcon,giftValue:newValue,catalogMigratedAt:Date.now(),catalogPreviousGiftId:oldId&&oldId!==newId?oldId:(rule.catalogPreviousGiftId||'')};
    });
    if(profileChanged){all[gameId]=next;changedProfiles++;setProfileMeta(gameId,{catalogMigrated:true,catalogMigratedAt:Date.now(),catalogMigrationSource:'master-catalog'})}
  }
  if(changedProfiles)saveProfiles(all);
  return{changedRules,changedProfiles};
}
export const storage={
  settings:()=>read(keys.settings,{endpoint:'',key:'',username:'',capture:true,automation:false}),
  saveSettings:v=>write(keys.settings,v),
  activeGameId:()=>cleanGameId(read(keys.activeGame,'')),
  setActiveGameId:v=>write(keys.activeGame,cleanGameId(v)),
  profiles,
  rulesForGame,
  saveRulesForGame,
  migrateGiftReferences,
  profileInitialized:gameId=>!!profileMeta()[cleanGameId(gameId)]?.initialized,
  profileMeta:gameId=>profileMeta()[cleanGameId(gameId)]||null,
  markProfileInitialized:(gameId,patch={})=>setProfileMeta(gameId,{initialized:true,...patch}),
  rules:()=>rulesForGame(cleanGameId(read(keys.activeGame,''))),
  saveRules:v=>saveRulesForGame(cleanGameId(read(keys.activeGame,'')),v,{markInitialized:true,userModified:true,source:'user'})
};