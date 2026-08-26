(()=>{
  function openRulesAndFocus(){
    const section=document.getElementById('rulesSection');
    if(!section)return;

    const toggle=[...section.querySelectorAll('button')].find(button=>/ABRIR/i.test(button.textContent||''));
    if(toggle)toggle.click();

    section.classList.remove('is-collapsed');
    const body=section.querySelector('.collapsibleBody');
    if(body)body.hidden=false;

    window.setTimeout(()=>{
      const target=document.getElementById('ruleTrigger')?.closest('.formGrid')||document.getElementById('ruleTrigger')||section;
      target.scrollIntoView({behavior:'smooth',block:'start'});
      section.classList.remove('ruleFocusPulse');
      void section.offsetWidth;
      section.classList.add('ruleFocusPulse');
      window.setTimeout(()=>section.classList.remove('ruleFocusPulse'),1600);
    },90);
  }

  document.addEventListener('click',event=>{
    if(!event.target.closest('[data-gift]'))return;
    window.setTimeout(openRulesAndFocus,0);
  });
})();
