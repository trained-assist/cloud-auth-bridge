'use strict';

const DEFAULT_RELAY = 'https://136-65-7-197.sslip.io';

function sendBg(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (res?.error) return reject(new Error(res.error));
      resolve(res);
    });
  });
}

async function load() {
  const state = await sendBg({ type: 'getState' });
  document.getElementById('relay-url').value = state.relayUrl || DEFAULT_RELAY;
  document.getElementById('profile-name').value = state.profileName || '';

  const hint = document.getElementById('profile-hint');
  if (state.profileName) {
    hint.textContent = `Текущий профиль: "${state.profileName}" — токены идут с префиксом "${state.profileName}.*"`;
  } else {
    hint.textContent = 'Профиль не определён — имя будет определено автоматически по Google-аккаунту Chrome.';
  }
}

document.getElementById('btn-save').addEventListener('click', async () => {
  const url         = document.getElementById('relay-url').value.trim();
  const profileName = document.getElementById('profile-name').value.trim().replace(/[^a-z0-9_-]/gi, '');
  const msgEl       = document.getElementById('msg');

  try {
    new URL(url);
    await sendBg({ type: 'setRelayUrl', url });
    await sendBg({ type: 'setProfileName', profileName });
    msgEl.className = 'ok';
    msgEl.textContent = profileName
      ? `✓ Сохранено. Токены будут с префиксом "${profileName}."`
      : '✓ Сохранено. Профиль без префикса.';
    setTimeout(() => { msgEl.textContent = ''; }, 3000);
  } catch (e) {
    msgEl.className = 'err';
    msgEl.textContent = e.message.includes('Invalid URL') ? 'Некорректный URL' : e.message;
  }
});

document.getElementById('btn-reset').addEventListener('click', async () => {
  if (!confirm('Сбросить подключение? Придётся заново вводить код.')) return;
  await sendBg({ type: 'disconnect' });
  const msgEl = document.getElementById('msg');
  msgEl.className = 'ok';
  msgEl.textContent = '✓ Подключение сброшено';
});

load().catch(console.error);
