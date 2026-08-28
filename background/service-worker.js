// Alesa Auth — background service worker
// Хранит pairingToken и relayUrl, обрабатывает сообщения от popup и content scripts.
// Реализует адаптивный polling:
//   - Idle: HEAD /poll каждые 3 минуты (chrome.alarms)
//   - Active: GET /poll каждые 3 секунды (setInterval), макс 2 минуты, затем назад в idle

const DEFAULT_RELAY = 'http://localhost:8081';
const IDLE_ALARM    = 'alesa-idle-poll';
const IDLE_PERIOD   = 3;      // минуты (chrome.alarms минимум 1)
const ACTIVE_MS     = 3000;   // мс между poll в active режиме
const ACTIVE_TIMEOUT_MS = 2 * 60 * 1000; // 2 мин — максимальное время active режима

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

// ── Adaptive polling ─────────────────────────────────────────────────────────

let activeTimer = null;
let activeStartedAt = null;

// Запустить idle polling (chrome.alarms, 3 мин)
function startIdlePolling() {
  stopActivePolling();
  chrome.alarms.create(IDLE_ALARM, { periodInMinutes: IDLE_PERIOD });
}

function stopActivePolling() {
  if (activeTimer) {
    clearInterval(activeTimer);
    activeTimer = null;
    activeStartedAt = null;
  }
}

// Переключиться в active режим: poll каждые 3 сек, макс 2 мин
function switchToActivePolling() {
  if (activeTimer) return; // уже в active

  chrome.alarms.clear(IDLE_ALARM); // пауза idle alarm пока активны
  activeStartedAt = Date.now();

  activeTimer = setInterval(async () => {
    // Таймаут active режима
    if (Date.now() - activeStartedAt > ACTIVE_TIMEOUT_MS) {
      console.log('[alesa] active poll timeout — back to idle');
      startIdlePolling();
      return;
    }
    await pollOnce(true);
  }, ACTIVE_MS);
}

// Одна итерация poll.
// headOnly=true: HEAD (только проверка), headOnly=false: GET (забрать команду)
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
        // Есть команда — переключаемся в active и сразу забираем
        switchToActivePolling();
        await pollOnce(true);
      }
      // 204 — тишина, остаёмся в idle
      return;
    }

    // GET response
    if (res.status === 204) {
      // Очередь пуста — возвращаемся в idle
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
    // Пользователь уже на нужном сайте — показываем кнопку в popup через badge
    const site = payload?.site || '';
    await chrome.storage.local.set({ pendingTokenRequest: { site, description: payload?.description || '' } });
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#2aabee' });
    // Popup сам проверит pendingTokenRequest и покажет кнопку "Передать токен"
    return;
  }

  if (command === 'clear_badge') {
    chrome.action.setBadgeText({ text: '' });
    await chrome.storage.local.remove('pendingTokenRequest');
    return;
  }

  console.warn('[alesa] unknown command:', command);
}

// ── Alarm listener (idle polling) ────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== IDLE_ALARM) return;
  await pollOnce(false); // HEAD — лёгкая проверка
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

  // ── pair ──────────────────────────────────────────────────────────────────
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
    startIdlePolling(); // начинаем polling после привязки
    return { ok: true };
  }

  // ── sendToken ─────────────────────────────────────────────────────────────
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

    // Очистить badge и pending запрос после успешной передачи
    chrome.action.setBadgeText({ text: '' });
    await chrome.storage.local.remove('pendingTokenRequest');
    startIdlePolling(); // возвращаемся в idle
    return { ok: true };
  }

  // ── getState ──────────────────────────────────────────────────────────────
  if (msg.type === 'getState') {
    const pending = (await chrome.storage.local.get('pendingTokenRequest')).pendingTokenRequest || null;
    return { ...state, pendingTokenRequest: pending };
  }

  // ── disconnect ────────────────────────────────────────────────────────────
  if (msg.type === 'disconnect') {
    await setState({ pairingToken: null, paired: false });
    chrome.alarms.clear(IDLE_ALARM);
    stopActivePolling();
    chrome.action.setBadgeText({ text: '' });
    await chrome.storage.local.remove('pendingTokenRequest');
    return { ok: true };
  }

  // ── setRelayUrl ───────────────────────────────────────────────────────────
  if (msg.type === 'setRelayUrl') {
    if (!msg.url) throw new Error('url обязателен');
    await setState({ relayUrl: msg.url });
    return { ok: true };
  }

  // ── forcePoll (для отладки из popup) ─────────────────────────────────────
  if (msg.type === 'forcePoll') {
    await pollOnce(false);
    return { ok: true };
  }

  throw new Error(`Unknown message type: ${msg.type}`);
}
