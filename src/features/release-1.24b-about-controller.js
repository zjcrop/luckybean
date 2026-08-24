const $=(s,r=document)=>r?.querySelector?.(s)||null;

function ensureAboutContacts(){
  const settings=$('#settingsContent');
  const about=$('.settings-category[data-settings-key="about"]',settings);
  if(!settings||!about)return;
  let contact=$('[data-lb-contact]',settings);
  if(!contact){
    contact=document.createElement('div');
    contact.dataset.lbContact='1';
    contact.innerHTML='<p>微信：<strong>zj_crop</strong></p><p>小红书：<strong>端茶倒水的秦始皇🐻</strong></p>';
  }
  contact.classList.remove('panel');
  contact.classList.add('lb-about-contact');
  contact.querySelector('.panel-title')?.remove();
  const mount=$('.nested-content',about)||about;
  if(contact.parentElement!==mount)mount.append(contact);
}

new MutationObserver(ensureAboutContacts).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('luckybean:about-ready',ensureAboutContacts);
document.addEventListener('luckybean:app-refreshed',ensureAboutContacts);
ensureAboutContacts();

console.info('[LuckyBean] 1.24B 本物 contact placement active');
