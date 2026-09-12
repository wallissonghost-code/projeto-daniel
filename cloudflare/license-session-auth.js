const enc=new TextEncoder();
const b64urlDecode=value=>{const s=String(value||'').replace(/-/g,'+').replace(/_/g,'/');const pad=s+'='.repeat((4-s.length%4)%4);const raw=atob(pad);return Uint8Array.from(raw,c=>c.charCodeAt(0))};
const safeJson=value=>{try{return JSON.parse(new TextDecoder().decode(b64urlDecode(value)))}catch{return null}};
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const hashDeviceId=async deviceId=>hex(await crypto.subtle.digest('SHA-256',enc.encode(String(deviceId))));

export async function verifyNotLicenseSession(token,secret,{deviceId='',now=Date.now(),audience='game'}={}){
  const raw=String(token||'').trim();
  if(!raw||!secret)return{ok:false,reason:'missing_credentials'};
  const parts=raw.split('.');
  if(parts.length!==2)return{ok:false,reason:'malformed_token'};
  const [payloadPart,signaturePart]=parts;
  let supplied;
  try{supplied=b64urlDecode(signaturePart)}catch{return{ok:false,reason:'malformed_signature'}}
  const key=await crypto.subtle.importKey('raw',enc.encode(String(secret)),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('HMAC',key,supplied,enc.encode(payloadPart));
  if(!valid)return{ok:false,reason:'invalid_signature'};
  const payload=safeJson(payloadPart);
  if(!payload||payload.v!==1)return{ok:false,reason:'invalid_payload'};
  const exp=Number(payload.exp||0)*1000;
  if(!exp||exp<=now)return{ok:false,reason:'expired'};
  const actualAudience=String(payload.aud||'game');
  if(audience&&actualAudience!==String(audience))return{ok:false,reason:'audience_mismatch'};
  if(deviceId&&String(payload.dev||'')!==await hashDeviceId(deviceId))return{ok:false,reason:'device_mismatch'};
  return{ok:true,payload,expiresAt:exp,audience:actualAudience};
}
