const PREFIX='daniel.live.plus.v2';
const UNSCOPED='__unscoped__';
const keys={settings:`${PREFIX}.settings`,rules:`${PREFIX}.rules`,ruleProfiles:`${PREFIX}.rulesByGame`,ruleProfileMeta:`${PREFIX}.ruleProfileMeta`,activeGame:`${PREFIX}.activeGameId`};
for(const legacy of [`${PREFIX}.catalog`,`${PREFIX}.discovered`]){try{localStorage.removeItem(legacy)}catch{}}
function read(key,fallback){try{const v=JSON.parse(localStorage.getItem(key));return v??fallback}catch{return fallback}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));return value}
function cleanGameId(v){return String(v||'').trim()}
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
export const storage={
  settings:()=>read(keys.settings,{endpoint:'',key:'',username:'',capture:true,automation:false}),
  saveSettings:v=>write(keys.settings,v),
  activeGameId:()=>cleanGameId(read(keys.activeGame,'')),
  setActiveGameId:v=>write(keys.activeGame,cleanGameId(v)),
  profiles,
  rulesForGame,
  saveRulesForGame,
  profileInitialized:gameId=>!!profileMeta()[cleanGameId(gameId)]?.initialized,
  profileMeta:gameId=>profileMeta()[cleanGameId(gameId)]||null,
  markProfileInitialized:(gameId,patch={})=>setProfileMeta(gameId,{initialized:true,...patch}),
  rules:()=>rulesForGame(cleanGameId(read(keys.activeGame,''))),
  saveRules:v=>saveRulesForGame(cleanGameId(read(keys.activeGame,'')),v,{markInitialized:true,userModified:true,source:'user'})
};
