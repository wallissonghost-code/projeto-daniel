const PREFIX='daniel.live.plus.v2';
const keys={settings:`${PREFIX}.settings`,catalog:`${PREFIX}.catalog`,rules:`${PREFIX}.rules`,discovered:`${PREFIX}.discovered`};
function read(key,fallback){try{const v=JSON.parse(localStorage.getItem(key));return v??fallback}catch{return fallback}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));return value}
export const storage={
  settings:()=>read(keys.settings,{endpoint:'',key:'',username:'',capture:true,automation:false}),
  saveSettings:v=>write(keys.settings,v),
  catalog:()=>read(keys.catalog,[]),
  saveCatalog:v=>write(keys.catalog,v),
  rules:()=>read(keys.rules,[]),
  saveRules:v=>write(keys.rules,v),
  discovered:()=>read(keys.discovered,[]),
  saveDiscovered:v=>write(keys.discovered,v)
};
