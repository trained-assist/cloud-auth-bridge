// Alesa Auth — background service worker
// Хранит pairingToken и relayUrl, обрабатывает сообщения от popup и content scripts.

const DEFAULT_RELAY = 'http://localhost:8081';

// ── State helpers ────────────────────────────────────────────────────────────

async function getState() {
  const data = await chrome.storage.local.get(['pairingToken', 'relayUrl', 'paired']);
  return {
    pairingToken: data.pairingToken || null,
    relayUrl: data.relayUrl || DEFAULT_RELAY,
    paired: data.paired || false,
  };
}

async function setState(patch) {
  await chrome.storage.local.set(patch);
}

// ── Message handlers ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch(err => sendResponse({ error: err.message }));
  return true; // keep channel open for async response
});

async function handleMessage(msg) {
  const state = await getState();

  // ── pair: принять 6-значный код из Telegram, получить pairingToken ────────
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
    return { ok: true };
  }

  // ── sendToken: отправить токен сервиса в relay ────────────────────────────
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
    return { ok: true };
  }

  // ── getState ──────────────────────────────────────────────────────────────
  if (msg.type === 'getState') return state;

  // ── disconnect ────────────────────────────────────────────────────────────
  if (msg.type === 'disconnect') {
    await setState({ pairingToken: null, paired: false });
    return { ok: true };
  }

  // ── setRelayUrl ───────────────────────────────────────────────────────────
  if (msg.type === 'setRelayUrl') {
    if (!msg.url) throw new Error('url обязателен');
    await setState({ relayUrl: msg.url });
    return { ok: true };
  }

  throw new Error(`Unknown message type: ${msg.type}`);
}
