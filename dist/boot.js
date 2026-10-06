(()=>{
  try{
    const stored=localStorage.getItem('almazov.theme')||'system';
    const prefersLight=window.matchMedia?.('(prefers-color-scheme: light)').matches===true;
    const light=stored==='light'||(stored==='system'&&prefersLight);
    document.documentElement.dataset.theme=light?'light':'dark';
    document.documentElement.dataset.themePreference=stored;
    document.documentElement.style.colorScheme=light?'light':'dark';
  }catch{
    document.documentElement.dataset.theme='dark';
    document.documentElement.dataset.themePreference='system';
    document.documentElement.style.colorScheme='dark';
  }
  if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{});}
})();
