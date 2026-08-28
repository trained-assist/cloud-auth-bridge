'use strict';

// Content script: отвечает на запросы popup о куках текущей страницы.
// Работает в контексте страницы, поэтому имеет доступ к document.cookie.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'getCookies') return;

  try {
    const cookies = document.cookie;
    // Return raw cookie string; relay/bot side decides what to store
    sendResponse({ cookies: cookies || '' });
  } catch (e) {
    sendResponse({ error: e.message });
  }

  return false; // synchronous response
});
