import crypto from 'node:crypto';

const sha=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const decode=value=>{try{return JSON.parse(Buffer.from(String(value),'base64url').toString('utf8'))}catch{return null}};

export function verifyConnectorLicenseSession(token,secret,{deviceId='',now=Date.now()}={}){
  const raw=String(token||'').trim();
  if(!raw||!secret)return{ok:false,reason:'missing_credentials'};
  const parts=raw.split('.');
  if(parts.length!==2)return{ok:false,reason:'malformed_token'};
  const [payloadPart,signaturePart]=parts;
  const expected=crypto.createHmac('sha256',String(secret)).update(payloadPart).digest('base64url');
  const supplied=Buffer.from(signaturePart);
  const wanted=Buffer.from(expected);
  if(supplied.length!==wanted.length||!crypto.timingSafeEqual(supplied,wanted))return{ok:false,reason:'invalid_signature'};
  const payload=decode(payloadPart);
  if(!payload||payload.v!==1||!payload.lid||!payload.dev)return{ok:false,reason:'invalid_payload'};
  const expiresAt=Number(payload.exp||0)*1000;
  if(!expiresAt||expiresAt<=now)return{ok:false,reason:'expired'};
  if(String(payload.aud||'game')!=='connector')return{ok:false,reason:'audience_mismatch'};
  if(!deviceId)return{ok:false,reason:'missing_device_id'};
  if(String(payload.dev)!==sha(deviceId))return{ok:false,reason:'device_mismatch'};
  return{ok:true,payload,expiresAt};
}
