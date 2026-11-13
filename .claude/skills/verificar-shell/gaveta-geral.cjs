const { chromium } = require(process.env.PLAYWRIGHT || 'playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_EXE });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.goto(process.argv[2] || 'http://localhost:36472/#/geral');
  await p.waitForSelector('.gr-lookup');
  await p.evaluate(() => { window.__marca = document.querySelector('.gr-cell'); });
  for (const [rotulo, fechar] of [['Motorista', 'x'], ['Cliente', 'esc'], ['Veículo', 'x']]) {
    await p.locator(`.gr-lookup[aria-label^="Abrir ${rotulo}"]`).first().click();
    await p.waitForTimeout(2000);
    const h1 = await p.evaluate(() => location.hash);
    if (fechar === 'esc') await p.keyboard.press('Escape');
    else await p.locator('.rota-gaveta [aria-label^="Fechar"]').filter({ visible: true }).first().click();
    await p.waitForTimeout(1200);
    console.log(rotulo, '|', h1, '→', await p.evaluate(() => location.hash), '| camada:', await p.locator('.rota-gaveta').count(), '| Geral sem remontar:', await p.evaluate(() => document.contains(window.__marca)));
  }
  await b.close();
})();
