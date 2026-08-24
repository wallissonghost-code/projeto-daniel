export function errorMessage(error){
  if(typeof error==='string')return error;
  if(error&&typeof error.message==='string')return error.message;
  try{return JSON.stringify(error)}catch{return String(error||'Erro desconhecido')}
}

export function classifyTikTokError(error){
  const message=errorMessage(error).trim(),lower=message.toLowerCase();
  const missingRetryAfter=/cannot read properties of undefined/.test(lower)&&/retry-after/.test(lower);
  const rateLimited=/\b429\b/.test(lower)||/too many requests/.test(lower)||/rate[ -]?limit/.test(lower);
  const signingPaywall=/business plan/.test(lower)||/fetchwebcastsignature/.test(lower)||(/eulerstream/.test(lower)&&/sign/.test(lower));
  const timeout=/timeout|timed out|etimedout/.test(lower);
  return{message,missingRetryAfter,rateLimited,signingPaywall,timeout};
}

export function normalizeModernConnectError(error){
  const info=classifyTikTokError(error);if(!info.missingRetryAfter)return error;
  const wrapped=new Error(`fetchWebcastSignature compatibility fallback: resposta TikTok sem header retry-after; ${info.message}`);
  wrapped.name='LivePlatformTikTokCompatibilityError';wrapped.code='TIKTOK_MISSING_RETRY_AFTER';wrapped.cause=error;return wrapped;
}

// Espelha o comportamento estabilizado no Caos Live: duas tentativas curtas e previsíveis.
// Rate limit recebe espera maior para não martelar o TikTok.
export function reconnectDelayMs(attempt,{rateLimited=false}={}){
  const n=Math.max(1,Math.min(2,Number(attempt)||1));
  if(rateLimited)return n===1?30000:60000;
  return n===1?3000:12000;
}
