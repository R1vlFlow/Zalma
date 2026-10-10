(()=>{
  const BUILD_ID='e20ab0a42137613c';
  document.documentElement.dataset.buildId=BUILD_ID;
  const showBuildLabel=()=>{const buildLabel=document.getElementById('appBuildLabel');if(buildLabel)buildLabel.textContent=BUILD_ID;};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',showBuildLabel,{once:true});
  else showBuildLabel();
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

  // Verify the deployed build on every page load. The unique query and no-store
  // bypass both the browser HTTP cache and stale service-worker entries.
  async function checkForNewBuild(showStatus=false){
    const status=document.getElementById('appUpdateStatus');
    if(showStatus&&status)status.textContent='Проверяем опубликованную версию…';
    try{
      const url=new URL('./version.json',window.location.href);
      url.searchParams.set('check',String(Date.now()));
      const response=await fetch(url,{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
      if(!response.ok){if(showStatus&&status)status.textContent=`Не удалось проверить релиз (HTTP ${response.status}).`;return;}
      const release=await response.json();
      if(!release?.buildId){if(showStatus&&status)status.textContent='Опубликованный version.json не содержит идентификатор сборки.';return;}
      const pageUrl=new URL(window.location.href);
      if(release.buildId===BUILD_ID){
        let cleanUrl=false;
        for(const key of ['__app_build','__root_refresh']){if(pageUrl.searchParams.has(key)){pageUrl.searchParams.delete(key);cleanUrl=true;}}
        if(cleanUrl)history.replaceState(history.state,'',pageUrl.href);
        if(showStatus){const status=document.getElementById('appUpdateStatus');if(status)status.textContent=`Приложение обновлено: ${BUILD_ID}`;}
        return;
      }
      // One cache-busting navigation per newly discovered build; never reload-loop.
      let previous='';
      try{previous=sessionStorage.getItem('almazov:last-build-refresh')||'';}catch{}
      if(previous===release.buildId){if(showStatus&&status)status.textContent=`Обнаружен релиз ${release.buildId}; обновите страницу ещё раз, если интерфейс не изменился.`;return;}
      try{sessionStorage.setItem('almazov:last-build-refresh',release.buildId);}catch{}
      pageUrl.searchParams.set('__app_build',release.buildId);
      if(showStatus&&status)status.textContent=`Новая версия ${release.buildId} найдена. Перезагружаем приложение…`;
      window.location.replace(pageUrl.href);
    }catch{if(showStatus&&status)status.textContent='Не удалось проверить обновление. Проверьте интернет и повторите попытку.';}
  }

  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'})
      .then(registration=>registration.update().catch(()=>{}))
      .catch(()=>{});
  }
  window.addEventListener('app:check-update',async()=>{
    try{const registration=await navigator.serviceWorker?.getRegistration();if(registration)await registration.update().catch(()=>{});}catch{}
    try{sessionStorage.removeItem('almazov:last-build-refresh');}catch{}
    await checkForNewBuild(true);
  });
  void checkForNewBuild();

  // Native install prompt (Chrome/Android) plus accurate Safari/iOS guidance.
  var deferredInstallPrompt = null;
  function installDialog(message) {
    var dialog = document.getElementById('installHelpDialog');
    var hint = document.getElementById('installPlatformHint');
    if (hint && message) hint.textContent = message;
    if (dialog && typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else if (message) {
      window.alert(message + '\n\nДля iPhone используйте Safari → Поделиться → На экран «Домой».');
    }
  }
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredInstallPrompt = event;
    document.querySelectorAll('[data-install-pwa]').forEach(function (button) {
      button.textContent = 'Установить приложение';
      button.setAttribute('aria-label', 'Установить Almazov Schedule Hub');
    });
  });
  window.addEventListener('appinstalled', function () {
    deferredInstallPrompt = null;
    document.querySelectorAll('[data-install-pwa]').forEach(function (button) { button.textContent = 'Приложение установлено'; });
    installDialog('Приложение установлено на это устройство.');
  });
  document.addEventListener('click', async function (event) {
    var target = event.target instanceof Element ? event.target.closest('[data-install-pwa], [data-install-close]') : null;
    if (!target) return;
    if (target.hasAttribute('data-install-close')) {
      var dialog = document.getElementById('installHelpDialog');
      if (dialog && typeof dialog.close === 'function') dialog.close();
      return;
    }
    if (deferredInstallPrompt) {
      try {
        var promptEvent = deferredInstallPrompt;
        deferredInstallPrompt = null;
        await promptEvent.prompt();
        var result = await promptEvent.userChoice;
        var status = document.getElementById('appUpdateStatus');
        if (status) status.textContent = result && result.outcome === 'accepted' ? 'Установка запущена.' : 'Установка отменена. Её можно повторить из меню браузера.';
        if (window.zalmaTrack) window.zalmaTrack(result && result.outcome === 'accepted' ? 'pwa_install_accepted' : 'pwa_install_dismissed');
      } catch (_) { installDialog('Браузер не смог открыть системное окно установки. Используйте меню браузера или инструкцию ниже.'); }
      return;
    }
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    installDialog(isIOS ? 'Для установки на iPhone или iPad откройте этот сайт в Safari.' : 'Системный запрос установки сейчас недоступен. Откройте меню браузера и выберите установку приложения либо используйте APK для Android.');
  });
  document.addEventListener('click', function (event) {
    var target = event.target instanceof Element ? event.target.closest('[data-download-apk]') : null;
    if (target && window.zalmaTrack) window.zalmaTrack('apk_download_clicked');
  });
})();
