// Native Pikabu Games adapter. No Yandex, VK or Android SDKs are loaded.
(function () {
  'use strict';
  const keys = ['sharoboy_me', 'sharoboy_ws', 'sharoboy_vol', 'sharoboy_arena', 'kruglyaki_guide_v1'];
  const cache = new Map();
  const handlers = new Map();
  let sdk = null, initialized = null, readySent = false, conflict = false;
  const localRead = key => { try { return localStorage.getItem(key); } catch (e) { return null; } };
  const localWrite = (key, value) => { try { localStorage.setItem(key, value); } catch (e) {} };
  const emit = name => (handlers.get(name) || []).forEach(fn => fn());
  function notice(message) {
    const node = document.getElementById('pkb-status');
    if (node) { node.textContent = message; node.style.display = message ? 'block' : 'none'; }
  }
  function storageError(reason) {
    if (reason === 'REVISION_CONFLICT') conflict = true;
    notice(conflict
      ? 'Сохранение изменилось на другом устройстве. Перед продолжением перезагрузите игру. Изменения этой сессии остаются на устройстве.'
      : 'Облако временно недоступно. Изменения остаются на этом устройстве.');
  }
  window.KRStorage = {
    getItem(key) { return cache.has(key) ? cache.get(key) : localRead(key); },
    setItem(key, value) {
      value = String(value); cache.set(key, value); localWrite(key, value);
      if (sdk && keys.includes(key) && !conflict) {
        try { sdk.storage.set(key, value); } catch (e) { storageError('UNKNOWN'); }
      }
    },
  };
  function connectStorage() {
    // Cloud values are authoritative. Missing cloud values may be imported from this device.
    for (const key of keys) {
      const remote = sdk.storage.get(key);
      if (typeof remote === 'string') { cache.set(key, remote); localWrite(key, remote); }
      else {
        const value = localRead(key);
        if (value !== null) { cache.set(key, value); sdk.storage.set(key, value); }
      }
    }
    sdk.on('storageSaveError', storageError);
  }
  function initialize() {
    if (initialized) return initialized;
    initialized = new Promise(resolve => {
      let finished = false;
      const finish = candidate => {
        if (finished) return;
        finished = true; clearTimeout(timer);
        if (candidate) {
          sdk = candidate;
          try { connectStorage(); notice(''); } catch (e) { storageError('UNKNOWN'); }
        } else notice('Облачное сохранение недоступно: игра работает на этом устройстве.');
        resolve();
      };
      const timer = setTimeout(() => finish(null), 8000);
      const script = document.createElement('script');
      script.src = 'https://games.pikabu.ru/sdk/sdk.js'; script.async = true;
      script.onload = () => {
        if (finished) return;
        Promise.resolve().then(() => window.PkbSDK.init()).then(finish, () => finish(null));
      };
      script.onerror = () => finish(null);
      document.head.appendChild(script);
    });
    return initialized;
  }
  async function ready() {
    if (!sdk || readySent) return;
    readySent = true;
    try { await sdk.gameStarted(); } catch (e) { console.warn('Pikabu gameStarted failed', e); }
  }
  function shim() {
    const adv = {
      async showFullscreenAdv({ callbacks = {} } = {}) {
        let shown = false, paused = false;
        try {
          const ad = sdk && sdk.ads.fullscreen;
          if (ad && ad.isSupported && await ad.canShow()) {
            paused = true; emit('game_api_pause'); callbacks.onOpen && callbacks.onOpen();
            const result = await ad.show(); shown = !!result.rendered;
          }
        } catch (e) { console.warn('Pikabu ad unavailable', e); }
        finally {
          if (paused) emit('game_api_resume');
          callbacks.onClose && callbacks.onClose(shown);
        }
      },
    };
    if (sdk && sdk.ads.rewarded && sdk.ads.rewarded.isSupported) {
      adv.showRewardedVideo = async ({ callbacks = {} } = {}) => {
        let paused = false;
        try {
          const ad = sdk.ads.rewarded;
          if (await ad.canShow()) {
            paused = true; emit('game_api_pause'); callbacks.onOpen && callbacks.onOpen();
            const result = await ad.show();
            if (result.reward) callbacks.onRewarded && callbacks.onRewarded();
          }
        } catch (e) { console.warn('Pikabu rewarded unavailable', e); }
        finally { if (paused) emit('game_api_resume'); callbacks.onClose && callbacks.onClose(); }
      };
    }
    return {
      on(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); },
      features: { LoadingAPI: { ready() {} }, GameplayAPI: { start() {}, stop() {} } },
      adv,
    };
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && sdk && !conflict) {
      Promise.resolve().then(() => sdk.storage.flush()).then(result => {
        if (!result.success) storageError(result.reason);
      }).catch(() => storageError('NETWORK_ERROR'));
    }
  });
  window.KRPikabu = { initialize, ready, shim };
})();
