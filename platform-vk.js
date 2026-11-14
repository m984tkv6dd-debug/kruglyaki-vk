// Мост «Кругляков» к VK Игры / Одноклассники (VK Mini Apps, VK Bridge 3).
// Притворяется Yandex Games SDK (window.YaGames), поэтому код игры не меняется.
(function () {
  const B = window.vkBridge;
  const handlers = {};
  const emit = (n) => (handlers[n] || []).forEach(f => { try { f(); } catch (e) {} });
  // Реклама редко: не чаще раза в 3 минуты и не раньше чем через 3 минуты после запуска.
  const AD_MIN_GAP_MS = 180000;
  let lastAd = Date.now(), ready = false;

  const sdk = {
    on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); },
    features: { LoadingAPI: { ready() {} }, GameplayAPI: { start() {}, stop() {} } },
    adv: {
      showFullscreenAdv({ callbacks = {} } = {}) {
        const c = callbacks;
        if (!B || !ready || Date.now() - lastAd < AD_MIN_GAP_MS) { c.onClose && c.onClose(false); return; }
        B.send('VKWebAppCheckNativeAds', { ad_format: 'interstitial' })
          .then(r => {
            if (!r || !r.result) throw 0;
            lastAd = Date.now();
            emit('game_api_pause'); c.onOpen && c.onOpen();
            return B.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' });
          })
          .then(() => { emit('game_api_resume'); c.onClose && c.onClose(true); })
          .catch(() => { emit('game_api_resume'); c.onClose && c.onClose(false); });
      },
      // реклама за награду (кнопка «Другие карты за рекламу»)
      showRewardedVideo({ callbacks = {} } = {}) {
        const c = callbacks;
        if (!B || !ready) { c.onError && c.onError(); return; }
        B.send('VKWebAppCheckNativeAds', { ad_format: 'reward' })
          .then(r => { if (!r || !r.result) throw 0; emit('game_api_pause'); c.onOpen && c.onOpen(); return B.send('VKWebAppShowNativeAds', { ad_format: 'reward' }); })
          .then(r => { emit('game_api_resume'); if (r && r.result) c.onRewarded && c.onRewarded(); c.onClose && c.onClose(); })
          .catch(() => { emit('game_api_resume'); c.onClose && c.onClose(); });
      },
    },
  };

  // Вне ВК/ОК мост не отвечает — ждём не дольше 3 с, дальше игра идёт без рекламы.
  const init = B ? Promise.race([B.send('VKWebAppInit').then(() => { ready = true; }).catch(() => {}), new Promise(r => setTimeout(r, 3000))]) : Promise.resolve();
  window.YaGames = { init: () => init.then(() => sdk) };
})();
