(() => {
  const VALIDATE_URL='https://pa.wallissonghost.workers.dev/api/licenses/validate';
  const STORAGE_KEY='not_license_key';
  const DEVICE_KEY='not_device_id';

  function makeDeviceId(){
    const bytes=new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  }
  function getDeviceId(){
    let id=localStorage.getItem(DEVICE_KEY);
    if(!id||!/^[A-Za-z0-9_-]{16,128}$/.test(id)){
      id=makeDeviceId();
      localStorage.setItem(DEVICE_KEY,id);
    }
    return id;
  }

  const deviceId=getDeviceId();
  const gate=document.createElement('div');
  gate.id='notInitialLicenseGate';

  const style=document.createElement('style');
  style.textContent=`html.not-initial-license-locked body>*:not(#notInitialLicenseGate){visibility:hidden!important}#notInitialLicenseGate{visibility:visible!important;position:fixed;inset:0;z-index:2147483647;background:radial-gradient(circle at 50% 15%,#15251d 0,#070b09 42%,#030504 100%);display:grid;place-items:center;padding:22px;font-family:Inter,system-ui,-apple-system,sans-serif;color:#f5fff8;box-sizing:border-box}#notInitialLicenseGate *{box-sizing:border-box}.not-access-card{width:min(430px,100%);padding:28px;border:1px solid #294436;border-radius:22px;background:rgba(8,14,11,.96);box-shadow:0 24px 80px #0009}.not-access-brand{font-size:12px;letter-spacing:.18em;font-weight:800;color:#65f59a}.not-access-card h1{font-size:28px;margin:10px 0 8px}.not-access-card p{color:#9eb2a6;line-height:1.45;margin:0 0 20px}.not-access-card input{width:100%;padding:15px;border:1px solid #30493b;border-radius:12px;background:#050806;color:#fff;font-size:15px;outline:none}.not-access-card input:focus{border-color:#65f59a}.not-access-card button{width:100%;margin-top:12px;padding:15px;border:0;border-radius:12px;background:#65f59a;color:#041008;font-weight:900;font-size:14px}.not-access-card button:disabled{opacity:.55}.not-access-msg{min-height:20px;margin-top:13px;color:#9eb2a6;font-size:13px}.not-access-msg.error{color:#ff8181}.not-access-splash{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center}.not-access-logo{width:76px;height:76px;border-radius:22px;background:#f7f7f7;color:#050505;display:grid;place-items:center;font-size:30px;font-weight:950;letter-spacing:-.08em;box-shadow:0 18px 60px #0008}.not-access-splash-brand{font-size:20px;font-weight:900;letter-spacing:.08em}.not-access-splash-brand b{color:#65f59a}.not-access-spinner{width:28px;height:28px;border:3px solid #294436;border-top-color:#65f59a;border-radius:50%;animation:notAccessSpin .8s linear infinite}.not-access-splash-msg{font-size:12px;letter-spacing:.12em;color:#91a499;text-transform:uppercase;font-weight:700}@keyframes notAccessSpin{to{transform:rotate(360deg)}}`;
  document.head.appendChild(style);

  function showSplash(){
    gate.innerHTML='<div class="not-access-splash"><div class="not-access-logo">L+</div><div class="not-access-splash-brand">NOT · LIVE<b>+</b></div><div class="not-access-spinner" aria-hidden="true"></div><div class="not-access-splash-msg">Validando assinatura…</div></div>';
  }

  function showLogin(message='Aguardando uma licença válida.',isError=false){
    gate.innerHTML=`<div class="not-access-card"><div class="not-access-brand">NOT · LIVE+ CONNECTOR</div><h1>Assinatura necessária</h1><p>Digite sua licença NOT para liberar o Projeto Daniel.</p><input id="notInitialLicenseKey" type="password" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="NOT-XXXX-XXXX-XXXX-XXXX-XXXX"><button id="notInitialLicenseValidate" type="button">VALIDAR ASSINATURA</button><div id="notInitialLicenseMessage" class="not-access-msg${isError?' error':''}">${message}</div></div>`;
    const input=gate.querySelector('#notInitialLicenseKey');
    const button=gate.querySelector('#notInitialLicenseValidate');
    button.onclick=()=>validate(input.value,false);
    input.onkeydown=e=>{if(e.key==='Enter')validate(input.value,false)};
  }

  async function validate(raw,silent){
    const key=String(raw||'').trim().toUpperCase();
    if(!key)return;
    if(silent)showSplash();
    else{
      const button=gate.querySelector('#notInitialLicenseValidate');
      const msg=gate.querySelector('#notInitialLicenseMessage');
      if(button)button.disabled=true;
      if(msg){msg.textContent='Validando…';msg.classList.remove('error')}
    }
    try{
      const response=await fetch(VALIDATE_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,deviceId,activationMode:silent?'revalidate':'activate'}),cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.authorized!==true)throw new Error(data.reason||data.status||'LICENSE_DENIED');
      localStorage.setItem(STORAGE_KEY,key);
      document.documentElement.classList.add('not-initial-license-authorized');
      document.documentElement.classList.remove('not-initial-license-locked');
      gate.remove();
      window.dispatchEvent(new CustomEvent('not-initial-license-authorized',{detail:{authorized:true,plan:data.plan,expiresAt:data.expiresAt}}));
    }catch(error){
      localStorage.removeItem(STORAGE_KEY);
      const reason=error?.message||'';
      const labels={INVALID_KEY:'chave inválida.',EXPIRED:'assinatura expirada.',SUSPENDED:'assinatura suspensa.',REVOKED:'assinatura revogada.',DEVICE_LIMIT_REACHED:'limite de dispositivos atingido.'};
      showLogin(`Acesso bloqueado: ${labels[reason]||'não foi possível validar a assinatura.'}`,true);
    }
  }

  function mount(){
    if(!document.body.contains(gate))document.body.appendChild(gate);
    const saved=localStorage.getItem(STORAGE_KEY);
    if(saved){showSplash();validate(saved,true)}else showLogin();
  }

  document.documentElement.classList.remove('not-initial-license-authorized');
  document.documentElement.classList.add('not-initial-license-locked');
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
