'use strict';

// Auto-clicks "Authorize" on Claude OAuth pages so the full auth flow
// requires zero user interaction when triggered by the extension.

function tryClick() {
  // Find the Authorize button (white primary button, not Decline)
  const buttons = [...document.querySelectorAll('button')];
  const authBtn = buttons.find(b => /^authorize$/i.test(b.textContent.trim()));
  if (authBtn) {
    console.log('[cab] auto-clicking Authorize');
    authBtn.click();
    return true;
  }
  return false;
}

// Try immediately (page might be ready)
if (!tryClick()) {
  // Wait for button to appear (React hydration delay)
  const observer = new MutationObserver(() => {
    if (tryClick()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Safety: disconnect after 10s
  setTimeout(() => observer.disconnect(), 10000);
}
