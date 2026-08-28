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
}

// ── Pair ──────────────────────────────────────────────────────────────────────

$('btn-pair').addEventListener('click', async () => {
  const codeRaw = $('code-input').value.trim();
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
    // Ask content script to collect cookies for this tab's host
    const tokenValue = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: 'getCookies' }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (res?.error) return reject(new Error(res.error));
        resolve(res?.cookies || '');
      });
    });

    if (!tokenValue) throw new Error('Не удалось получить данные со страницы');

    await sendBg({ type: 'sendToken', label: host, tokenValue });
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

// ── Init ──────────────────────────────────────────────────────────────────────

refresh().catch(console.error);
