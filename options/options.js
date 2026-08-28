'use strict';

const DEFAULT_RELAY = 'http://localhost:8081';

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
}

document.getElementById('btn-save').addEventListener('click', async () => {
  const url = document.getElementById('relay-url').value.trim();
  const msgEl = document.getElementById('msg');

  try {
    new URL(url); // validate
    await sendBg({ type: 'setRelayUrl', url });
    msgEl.className = 'ok';
    msgEl.textContent = '✓ Сохранено';
    setTimeout(() => { msgEl.textContent = ''; }, 2500);
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
