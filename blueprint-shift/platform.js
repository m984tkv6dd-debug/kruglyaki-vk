'use strict';

window.BlueprintPlatform = {
    async init() {
        const bridge = window.vkBridge;
        await bridge.send('VKWebAppInit');
        if (!bridge.supports('VKWebAppShowNativeAds')) return;
        return async () => {
            const params = { ad_format: 'reward' };
            const availability = await bridge.send('VKWebAppCheckNativeAds', params);
            if (!availability.result) return 'unavailable';
            const result = await bridge.send('VKWebAppShowNativeAds', params);
            return result.result ? 'rewarded' : 'cancelled';
        };
    }
};
