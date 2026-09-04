// content script: perform simple actions requested by background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.action === 'click' && msg.payload && msg.payload.selector) {
        const el = document.querySelector(msg.payload.selector);
        if (!el) throw new Error('selector not found');
        el.click();
        sendResponse({ ok: true });
        return;
      }

      if (msg.action === 'type' && msg.payload && msg.payload.selector) {
        const el = document.querySelector(msg.payload.selector);
        if (!el) throw new Error('selector not found');
        el.focus();
        el.value = msg.payload.text || '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, reason: 'unknown action' });
    } catch (e) {
      sendResponse({ ok: false, reason: String(e) });
    }
  })();
  return true;
});
