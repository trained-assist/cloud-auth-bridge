'use strict';

// ── Helpers ──────────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function msg(el, bg) { return (text, type = 'error') => { el.textContent = text; show(el); }; }

function sendBg(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (res?.error) return reject(new Error(res.error));
      resolve(res);
    });
  });
}

// ── State refresh ─────────────────────────────────────────────────────────────

async function refresh() {
  const state = await sendBg({ type: 'getState' });
  showView(state);
}

function showView(state) {
  hide($('view-loading'));

  if (state.paired) {
    hide($('view-unpaired'));
    show($('view-paired'));
    renderSiteCard();
    const badge = $('profile-badge');
    if (state.profileName) {
      badge.textContent = state.profileName;
      show(badge);
    } else {
      hide(badge);
    }
  } else {
    show($('view-unpaired'));
    hide($('view-paired'));
  }
}

// ── Site card (active tab info) ────────────────────────────────────────────

async function renderSiteCard() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;

  let hostname;
  try { hostname = new URL(tab.url).hostname; } catch { return; }

  // Show site card for all https sites (user can manually send token from any site)
  if (!tab.url.startsWith('https://')) {
    hide($('current-site'));
    show($('no-site'));
    return;
  }

  $('site-label-text').textContent = hostname;
  show($('current-site'));
  hide($('no-site'));

  // Store current tab for token send
  $('btn-send-token').dataset.tabId = tab.id;
  $('btn-send-token').dataset.host = hostname;
  $('btn-send-token').dataset.url = tab.url;
}

// ── Pair ──────────────────────────────────────────────────────────────────────

$('btn-pair').addEventListener('click', async () => {
  const codeRaw = $('code-input').value.replace(/\s/g, '');
  const errEl = $('pair-error');
  hide(errEl);

  const btn = $('btn-pair');
  btn.disabled = true;
  btn.textContent = 'Подключаю…';

  try {
    await sendBg({ type: 'pair', code: codeRaw });
    await refresh();
  } catch (e) {
    errEl.textContent = e.message;
    show(errEl);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Подключить';
  }
});

// Format code input as user types: "482931" → "482 931"
$('code-input').addEventListener('input', (e) => {
  let v = e.target.value.replace(/\D/g, '').slice(0, 6);
  if (v.length > 3) v = v.slice(0, 3) + ' ' + v.slice(3);
  e.target.value = v;
});

$('code-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-pair').click();
});

// ── Send token ────────────────────────────────────────────────────────────────

$('btn-send-token').addEventListener('click', async () => {
  const btn = $('btn-send-token');
  const errEl = $('send-error');
  const okEl  = $('send-ok');
  hide(errEl); hide(okEl);

  const tabId = Number(btn.dataset.tabId);
  const host  = btn.dataset.host;
  if (!tabId || !host) return;

  btn.disabled = true;
  btn.textContent = 'Передаю…';

  try {
    const url = btn.dataset.url;
    let tokenValue, label;

    if (hostname.includes('nalog.ru')) {
      // nalog.ru stores auth in sessionStorage, not cookies
      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({
          auth_token:    sessionStorage.getItem('auth.token'),
          refresh_token: sessionStorage.getItem('refresh.token'),
          expires:       sessionStorage.getItem('auth.token.expires'),
        }),
      });
      const data = res.result;
      if (!data.auth_token && !data.refresh_token)
        throw new Error('Токен не найден — убедись что ты залогинен на nalog.ru');
      tokenValue = JSON.stringify(data);
      label = 'nalog';
    } else {
      const got = await sendBg({ type: 'getCookies', url });
      tokenValue = got.cookies;
      label = host;
      if (!tokenValue) throw new Error('Куки не найдены — попробуй обновить страницу и авторизоваться заново');
    }

    await sendBg({ type: 'sendToken', label, tokenValue });
    show(okEl);
    setTimeout(() => hide(okEl), 3000);
  } catch (e) {
    errEl.textContent = e.message;
    show(errEl);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Передать токен';
  }
});

// ── Quick capture buttons ─────────────────────────────────────────────────────

document.querySelectorAll('.btn-quick').forEach(btn => {
  btn.addEventListener('click', async () => {
    const url    = btn.dataset.url;
    const after  = btn.dataset.after;
    const label  = btn.dataset.label;
    const status = $('quick-status');

    btn.disabled = true;
    status.textContent = `Открываю ${label}…`;
    show(status);

    try {
      await sendBg({ type: 'captureUrl', url, captureAfterUrl: after, captureType: 'cookies', label });
      status.textContent = `✓ Вкладка открыта — залогинься, токен придёт автоматически`;
    } catch (e) {
      status.textContent = `Ошибка: ${e.message}`;
    } finally {
      btn.disabled = false;
      setTimeout(() => hide(status), 8000);
    }
  });
});

// ── Disconnect ────────────────────────────────────────────────────────────────

$('btn-disconnect').addEventListener('click', async () => {
  if (!confirm('Отключить расширение? Придётся заново вводить код.')) return;
  await sendBg({ type: 'disconnect' });
  await refresh();
});

// ── Options ───────────────────────────────────────────────────────────────────

$('btn-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ── Telegram link ─────────────────────────────────────────────────────────────

document.getElementById('tg-link').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'tg://resolve?domain=super_personal_assistant_bot&start=chromeext_connect' });
});

// ── Init ──────────────────────────────────────────────────────────────────────

refresh().catch(console.error);
