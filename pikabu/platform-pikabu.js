// Мост «Кругляков» к Пикабу Играм (PkbSDK, https://games.pikabu.ru/sdk/docs).
// Притворяется Yandex Games SDK (window.YaGames), поэтому код игры не меняется.
// Облачные сохранения: ключи игры из localStorage дублируются в sdk.storage.
(function () {
  const SDK_URL = 'https://games.pikabu.ru/sdk/sdk.js';
  const KEYS = ['sharoboy_me', 'sharoboy_ws', 'sharoboy_arena', 'sharoboy_vol'];
  const TS = 'kruglyaki_save_ts';
  const handlers = {};
  const emit = (n) => (handlers[n] || []).forEach(f => { try { f(); } catch (e) {} });
  const ls = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const lsGet = (k) => { try { return ls ? ls.getItem(k) : null; } catch (e) { return null; } };
  let pk = null;

  // ---------- облачные сохранения ----------
  let flushTimer = 0, lastFlush = 0;
  const flush = () => {
    clearTimeout(flushTimer); flushTimer = 0;
    if (!pk || !pk.storage) return;
    lastFlush = Date.now();
    try { Promise.resolve(pk.storage.flush()).catch(() => {}); } catch (e) {}
  };
  // не чаще раза в 10 с (лимит Пикабу: 100 сохранений за 5 минут)
  const queueFlush = () => { if (!flushTimer) flushTimer = setTimeout(flush, Math.max(1000, 10000 - (Date.now() - lastFlush))); };
  const cloudSet = (k, v) => { try { pk.storage.set(k, v); } catch (e) {} };

  // перехватываем запись через прототип: присваивание localStorage.setItem создало бы ключ, а не метод
  const origSet = Storage.prototype.setItem;
  const rawSet = (k, v) => { try { origSet.call(ls, k, v); } catch (e) {} };
  if (ls) {
    Storage.prototype.setItem = function (k, v) {
      origSet.call(this, k, v);
      if (this === ls && KEYS.includes(k)) {
        const ts = String(Date.now()); origSet.call(ls, TS, ts);
        if (pk && pk.storage) { cloudSet(k, String(v)); cloudSet(TS, ts); queueFlush(); }
      }
    };
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden && flushTimer) flush(); });

  async function syncSaves() {
    if (!pk || !pk.storage) return false;
    let cloud = {};
    try { cloud = (await pk.storage.getAll()) || {}; } catch (e) { return false; }
    const cTs = +cloud[TS] || 0;
    let lTs = +lsGet(TS) || 0;
    // старые сохранения без метки времени тоже отправляем в облако
    if (!lTs && KEYS.some(k => lsGet(k) !== null)) { lTs = cTs ? 0 : Date.now(); if (lTs) rawSet(TS, String(lTs)); }
    if (cTs > lTs) {
      // в облаке свежее (например, с другого устройства) — забираем и один раз перезапускаем игру
      let changed = false;
      for (const k of KEYS) if (typeof cloud[k] === 'string' && cloud[k] !== lsGet(k)) {
        rawSet(k, cloud[k]); changed = true;
      }
      rawSet(TS, String(cTs));
      let reloaded = false;
      try { reloaded = sessionStorage.getItem('kruglyaki_cloud_reload') === '1'; origSet.call(sessionStorage, 'kruglyaki_cloud_reload', '1'); } catch (e) { reloaded = true; }
      if (changed && !reloaded) { location.reload(); return true; }
    } else if (lTs > cTs) {
      for (const k of KEYS) { const v = lsGet(k); if (v !== null) cloudSet(k, v); }
      cloudSet(TS, String(lTs)); flush();
    }
    return false;
  }

  // ---------- реклама ----------
  const AD_MIN_GAP_MS = 180000; // у Пикабу минимум 120 с, держим 3 минуты как на других площадках
  let lastAd = Date.now();
  const ads = (t) => pk && pk.ads && pk.ads[t] && pk.ads[t].isSupported !== false ? pk.ads[t] : null;

  const sdk = {
    on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); },
    features: {
      LoadingAPI: { ready() { try { pk && pk.gameStarted(); } catch (e) {} } },
      GameplayAPI: { start() {}, stop() {} },
    },
    adv: {
      showFullscreenAdv({ callbacks = {} } = {}) {
        const c = callbacks, a = ads('fullscreen');
        if (!a || Date.now() - lastAd < AD_MIN_GAP_MS) { c.onClose && c.onClose(false); return; }
        Promise.resolve(a.canShow())
          .then(ok => {
            if (!ok) throw 0;
            lastAd = Date.now();
            emit('game_api_pause'); c.onOpen && c.onOpen();
            return a.show();
          })
          .then(r => { emit('game_api_resume'); c.onClose && c.onClose(!!(r && r.rendered)); })
          .catch(() => { emit('game_api_resume'); c.onClose && c.onClose(false); });
      },
      // реклама за награду (кнопка «Другие карты за рекламу»); награда только если досмотрел
      showRewardedVideo({ callbacks = {} } = {}) {
        const c = callbacks, a = ads('rewarded');
        if (!a) { c.onError && c.onError(); return; }
        Promise.resolve(a.canShow())
          .then(ok => { if (!ok) throw 0; emit('game_api_pause'); c.onOpen && c.onOpen(); return a.show(); })
          .then(r => { emit('game_api_resume'); if (r && r.reward) c.onRewarded && c.onRewarded(); c.onClose && c.onClose(); })
          .catch(() => { emit('game_api_resume'); c.onClose && c.onClose(); });
      },
    },
  };

  // Загружаем SDK сами: с блокировщиком рекламы или вне Пикабу ждём не дольше 6 с и играем без него.
  const loadSdk = new Promise(res => {
    const s = document.createElement('script');
    s.src = SDK_URL; s.async = true;
    s.onload = () => res(true); s.onerror = () => res(false);
    document.head.appendChild(s);
    setTimeout(() => res(false), 6000);
  });
  const init = loadSdk.then(async ok => {
    if (!ok || !window.PkbSDK) return;
    try {
      pk = await Promise.race([window.PkbSDK.init(), new Promise((_, rej) => setTimeout(rej, 6000))]);
    } catch (e) { pk = null; return; }
    if (await syncSaves()) await new Promise(() => {}); // страница перезагружается
  }).catch(() => {});
  window.YaGames = { init: () => init.then(() => sdk) };
})();
