(()=>{
  try{
    const stored=localStorage.getItem('almazov.theme')||'system';
    const prefersLight=window.matchMedia?.('(prefers-color-scheme: light)').matches===true;
    const light=stored==='light'||(stored==='system'&&prefersLight);
    const actual=light?'light':'dark';
    document.documentElement.dataset.theme=actual;
    document.documentElement.dataset.themePreference=stored;
    document.documentElement.style.colorScheme=actual;
    const meta=document.querySelector('meta[name=theme-color]');
    if(meta)meta.setAttribute('content',actual==='dark'?'#111722':'#f4f7fb');
  }catch{
    document.documentElement.dataset.theme='dark';
    document.documentElement.dataset.themePreference='system';
    document.documentElement.style.colorScheme='dark';
    const meta=document.querySelector('meta[name=theme-color]');
    if(meta)meta.setAttribute('content','#111722');
  }
  if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{});}
})();
