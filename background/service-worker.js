// Alesa Auth — background service worker
// MV3. Adaptive polling + waitForTabLoad pattern (like Behalf ext).
// Весь open_url flow внутри alarm handler — SW не спит во время capture.

const DEFAULT_RELAY = 'https://136-65-7-197.sslip.io';
const IDLE_ALARM    = 'alesa-idle-poll';
const ACTIVE_ALARM  = 'alesa-active-poll';
const IDLE_PERIOD   = 3;   // минуты
const ACTIVE_PERIOD = 1;   // минуты (MV3 minimum)
const ACTIVE_TIMEOUT_MS = 10 * 60 * 1000;

// ── State ────────────────────────────────────────────────────────────────────

async function getState() {
  const data = await chrome.storage.local.get(['pairingToken', 'relayUrl', 'paired']);
  return {
    pairingToken: data.pairingToken || null,
    relayUrl:     data.relayUrl || DEFAULT_RELAY,
    paired:       data.paired || false,
  };
}

async function setState(patch) {
  await chrome.storage.local.set(patch);
}

// ── Debug logging via relay ──────────────────────────────────────────────────
// Logs to relay /debug endpoint — видно в journalctl без открытого SW console

async function debugToRelay(step, detail, state) {
  const s = state || await getState().catch(() => null);
  if (!s?.pairingToken) return;
  console.log(`[alesa] ${step}: ${detail}`);
  try {
    await fetch(`${s.relayUrl}/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingToken: s.pairingToken, step, detail: String(detail) }),
    });
  } catch {}
}

// ── Tab loading helper (Behalf pattern) ──────────────────────────────────────
// Ждёт пока вкладка загрузится на urlPattern.
// Регистрирует onUpdated listener — Chrome хранит SW живым пока handler не вернулся.
// Также проверяет сразу (кэшированные страницы могут загрузиться мгновенно).

function waitForTabLoad(tabId, urlPattern, timeoutMs = 5 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    let resolved = false;

    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Tab load timeout (${Math.round(timeoutMs / 1000)}s)`));
    }, timeoutMs);

    function listener(id, changeInfo, tab) {
      if (id !== tabId || changeInfo.status !== 'complete') return;
      if (urlPattern && !tab.url?.includes(urlPattern)) return;
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(tab.url);
    }

    chrome.tabs.onUpdated.addListener(listener);

    // Immediate check: tab might already be at the right URL (cached load)
    chrome.tabs.get(tabId).then(tab => {
      if (resolved) return;
      if (tab.status === 'complete' && (!urlPattern || tab.url?.includes(urlPattern))) {
        resolved = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab.url);
      }
    }).catch(() => {});
  });
}

// ── Adaptive polling ─────────────────────────────────────────────────────────

function startIdlePolling() {
  chrome.alarms.clear(ACTIVE_ALARM);
  chrome.storage.local.remove('activePollingStartedAt');
  chrome.alarms.create(IDLE_ALARM, { periodInMinutes: IDLE_PERIOD });
}

async function switchToActivePolling() {
  const existing = await chrome.storage.local.get('activePollingStartedAt');
  if (existing.activePollingStartedAt) return;

  chrome.alarms.clear(IDLE_ALARM);
  await chrome.storage.local.set({ activePollingStartedAt: Date.now() });
  chrome.alarms.create(ACTIVE_ALARM, { periodInMinutes: ACTIVE_PERIOD });
  console.log('[alesa] switched to active polling (1 min)');
}

async function pollOnce(getCommand = false) {
  const state = await getState();
  if (!state.paired || !state.pairingToken) return;

  const method = getCommand ? 'GET' : 'HEAD';
  try {
    const res = await fetch(`${state.relayUrl}/poll`, {
      method,
      headers: { 'Authorization': `Bearer ${state.pairingToken}` },
    });

    if (method === 'HEAD') {
      if (res.status === 200) {
        // Command waiting — switch to active and GET immediately (don't wait for alarm)
        await switchToActivePolling();
        await pollOnce(true);
      }
      return;
    }

    if (res.status === 204) {
      startIdlePolling();
      return;
    }

    if (res.ok) {
      const { command, payload } = await res.json();
      await executeCommand(command, payload, state);
    }
  } catch (e) {
    console.warn('[alesa] poll error:', e.message);
  }
}

// ── Command execution ────────────────────────────────────────────────────────

async function executeCommand(command, payload, state) {
  console.log(`[alesa] executing command="${command}"`, payload);

  if (command === 'fetch_token') {
    const site = payload?.site || '';
    await chrome.storage.local.set({ pendingTokenRequest: { site, description: payload?.description || '' } });
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#2aabee' });
    return;
  }

  if (command === 'open_url') {
    const { url, captureAfterUrl, captureType = 'cookies', label } = payload || {};
    if (!url) return;

    const captureLabel = label || new URL(url).hostname;
    await debugToRelay('open_url_start', `url=${url} after=${captureAfterUrl || 'any'} type=${captureType}`, state);

    let tab;
    try {
      tab = await chrome.tabs.create({ url, active: true });
      await debugToRelay('tab_created', `tabId=${tab.id}`, state);

      // Wait for tab to reach captureAfterUrl — entire flow stays in alarm handler chain
      // Chrome keeps SW alive while this async function is awaited in the alarm handler
      const finalUrl = await waitForTabLoad(tab.id, captureAfterUrl, 5 * 60 * 1000);
      await debugToRelay('tab_loaded', `finalUrl=${finalUrl}`, state);

      // Small delay so auth cookies are fully set
      await new Promise(r => setTimeout(r, 1000));

      await captureAndSend({ tabId: tab.id, tabUrl: finalUrl, captureType, label: captureLabel, state });
    } catch (e) {
      await debugToRelay('open_url_error', e.message, state);
      const s = await getState();
      if (s.pairingToken) {
        await fetch(`${s.relayUrl}/save-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pairingToken: s.pairingToken,
            label: `error:${captureLabel}`,
            tokenValue: `ERROR: ${e.message}`,
          }),
        }).catch(() => {});
      }
    }
    return;
  }

  if (command === 'clear_badge') {
    chrome.action.setBadgeText({ text: '' });
    await chrome.storage.local.remove('pendingTokenRequest');
    return;
  }

  console.warn('[alesa] unknown command:', command);
}

// ── Capture and send ─────────────────────────────────────────────────────────

async function captureAndSend({ tabId, tabUrl, captureType, label, state }) {
  await debugToRelay('capture_start', `type=${captureType} url=${tabUrl} label=${label}`, state);
  try {
    let tokenValue;

    if (captureType === 'url_params') {
      const u = new URL(tabUrl);
      const params = {};
      for (const [k, v] of u.searchParams) params[k] = v;
      if (!Object.keys(params).length) throw new Error('URL-параметры не найдены');
      tokenValue = JSON.stringify(params);
    } else {
      const cookies = await chrome.cookies.getAll({ url: tabUrl });
      await debugToRelay('cookies_got', `count=${cookies.length}`, state);
      if (!cookies.length) throw new Error('Не залогинен — куки не найдены');
      tokenValue = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    }

    const res = await fetch(`${state.relayUrl}/save-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingToken: state.pairingToken, label, tokenValue }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `relay ${res.status}`);
    }

    await debugToRelay('capture_ok', `label=${label}`, state);
    console.log(`[alesa] captured and sent token for "${label}"`);
    chrome.action.setBadgeText({ text: '✓' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);

  } catch (e) {
    console.error('[alesa] captureAndSend error:', e.message);
    await debugToRelay('capture_error', e.message, state);
    const s = await getState();
    if (s.pairingToken) {
      await fetch(`${s.relayUrl}/save-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pairingToken: s.pairingToken,
          label: `error:${label}`,
          tokenValue: `ERROR: ${e.message}`,
        }),
      }).catch(() => {});
    }
  }
}

// ── Alarm listener ────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === IDLE_ALARM) {
    await pollOnce(false);
    return;
  }

  if (alarm.name === ACTIVE_ALARM) {
    const { activePollingStartedAt } = await chrome.storage.local.get('activePollingStartedAt');
    if (!activePollingStartedAt || Date.now() - activePollingStartedAt > ACTIVE_TIMEOUT_MS) {
      console.log('[alesa] active poll timeout — back to idle');
      startIdlePolling();
      return;
    }
    await pollOnce(true);
  }
});

// ── Install / startup ────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  startIdlePolling();
});

chrome.runtime.onStartup.addListener(() => {
  startIdlePolling();
});

// ── Message handlers ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch(err => sendResponse({ error: err.message }));
  return true;
});

async function handleMessage(msg) {
  const state = await getState();

  if (msg.type === 'pair') {
    const code = String(msg.code || '').replace(/\s/g, '');
    if (!code || code.length !== 6) throw new Error('Код должен быть 6 цифр');

    const res = await fetch(`${state.relayUrl}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `relay error ${res.status}`);

    await setState({ pairingToken: json.pairingToken, paired: true });
    startIdlePolling();
    return { ok: true };
  }

  if (msg.type === 'getCookies') {
    const { url } = msg;
    if (!url) throw new Error('url обязателен');
    const cookies = await chrome.cookies.getAll({ url });
    if (!cookies.length) throw new Error('Куки не найдены — возможно, вы не залогинены на этом сайте.');
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const httpOnlyCount = cookies.filter(c => c.httpOnly).length;
    return { cookies: cookieStr, total: cookies.length, httpOnly: httpOnlyCount };
  }

  if (msg.type === 'sendToken') {
    if (!state.paired || !state.pairingToken) throw new Error('Расширение не подключено. Введи код из Telegram.');
    const { label, tokenValue } = msg;
    if (!label || !tokenValue) throw new Error('label и tokenValue обязательны');

    const res = await fetch(`${state.relayUrl}/save-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingToken: state.pairingToken, label, tokenValue }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `relay error ${res.status}`);

    chrome.action.setBadgeText({ text: '' });
    await chrome.storage.local.remove('pendingTokenRequest');
    startIdlePolling();
    return { ok: true };
  }

  // Capture from popup: opens tab, waits for load, captures cookies
  // Used by popup quick-capture buttons
  if (msg.type === 'captureUrl') {
    if (!state.paired || !state.pairingToken) throw new Error('Расширение не подключено.');
    const { url, captureAfterUrl, captureType = 'cookies', label } = msg;
    if (!url) throw new Error('url обязателен');

    const captureLabel = label || new URL(url).hostname;
    const tab = await chrome.tabs.create({ url, active: true });

    // Kick off capture in background — popup shows status via badge
    (async () => {
      try {
        const finalUrl = await waitForTabLoad(tab.id, captureAfterUrl, 5 * 60 * 1000);
        await new Promise(r => setTimeout(r, 1000));
        await captureAndSend({ tabId: tab.id, tabUrl: finalUrl, captureType, label: captureLabel, state });
      } catch (e) {
        console.error('[alesa] captureUrl error:', e.message);
      }
    })();

    return { ok: true, tabId: tab.id };
  }

  if (msg.type === 'getState') {
    const pending = (await chrome.storage.local.get('pendingTokenRequest')).pendingTokenRequest || null;
    return { ...state, pendingTokenRequest: pending };
  }

  if (msg.type === 'disconnect') {
    await setState({ pairingToken: null, paired: false });
    chrome.alarms.clear(IDLE_ALARM);
    chrome.alarms.clear(ACTIVE_ALARM);
    await chrome.storage.local.remove(['pendingTokenRequest', 'activePollingStartedAt']);
    chrome.action.setBadgeText({ text: '' });
    return { ok: true };
  }

  if (msg.type === 'setRelayUrl') {
    if (!msg.url) throw new Error('url обязателен');
    await setState({ relayUrl: msg.url });
    return { ok: true };
  }

  if (msg.type === 'forcePoll') {
    await pollOnce(false);
    return { ok: true };
  }

  throw new Error(`Unknown message type: ${msg.type}`);
}
