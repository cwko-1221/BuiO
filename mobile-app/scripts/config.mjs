import { readFile } from 'node:fs/promises';

export function validateBackend(input, { development = false } = {}) {
  const url = new URL(input);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(development && loopback && url.protocol === 'http:')) {
    throw new Error('Use HTTPS. HTTP is allowed only for an explicit loopback development build.');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('The backend must be an origin, without credentials, a path, query or fragment.');
  }
  return url.origin;
}

export async function configuration({ backendUrl, development = false } = {}) {
  const settings = JSON.parse(await readFile(new URL('../mobile.config.json', import.meta.url), 'utf8'));
  const origin = validateBackend(backendUrl || settings.backendUrl, { development });
  const url = new URL(origin);
  return {
    settings: { ...settings, backendUrl: origin },
    capacitor: {
      appId: settings.appId,
      appName: settings.appName,
      webDir: 'www',
      appendUserAgent: `BuiOApp/${settings.version}`,
      // Compatibility pilot: keep the website's first-party cookies, CSP,
      // media URLs, relative navigation and Socket.IO sessions intact.
      // server.url is deliberately a pilot option, not an offline app build.
      server: {
        url: origin,
        cleartext: url.protocol === 'http:',
        allowNavigation: [url.host],
        errorPath: 'offline.html'
      },
      ios: {
        // Paint edge to edge; native insets are applied to module controls,
        // rather than introducing separate white scroll-view margins.
        contentInset: 'never',
        zoomEnabled: true,
        preferredContentMode: 'mobile',
        scrollEnabled: true,
        limitsNavigationsToAppBoundDomains: false,
        webContentsDebuggingEnabled: development
      },
      android: {
        allowMixedContent: false,
        webContentsDebuggingEnabled: development,
        captureInput: true
      },
      loggingBehavior: development ? 'debug' : 'none',
      includePlugins: ['@capacitor/app']
    }
  };
}

