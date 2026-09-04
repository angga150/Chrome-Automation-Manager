const CDP = require('chrome-remote-interface');

(async () => {
  const client = await CDP({ port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();
  await Page.navigate({ url: 'https://www.tiktok.com/@example/video/1234567890123456789' });
  await new Promise((r) => setTimeout(r, 6000));

  const res = await Runtime.evaluate({
    expression: `(() => {
      const selectors = [
        'button[aria-label*="Like"]',
        'button[aria-label*="like"]',
        '[data-e2e="like-button"]',
        'button[title*="Like"]',
        'div[role="button"][aria-label*="Like"]'
      ];
      const found = [];
      for (const s of selectors) {
        const el = document.querySelector(s);
        if (el) {
          found.push({
            selector: s,
            aria: (el.getAttribute('aria-label') || '').slice(0, 120),
            title: (el.getAttribute('title') || '').slice(0, 120),
            text: (el.textContent || '').slice(0, 80),
            outer: (el.outerHTML || '').slice(0, 220)
          });
        }
      }
      return { count: found.length, matches: found.slice(0, 5) };
    })()`,
    returnByValue: true,
  });

  console.log(JSON.stringify(res.result.value, null, 2));
  await client.close();
})().catch((err) => {
  console.error('ERR', err);
  process.exit(1);
});
