async page => {
  const dir = process.env.SHOTS_DIR || '.superpowers/ux-termo-multa-v2/'
  const base = process.env.BASE_URL || 'http://localhost:36472/'
  const log = []
  const errs = []
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 160)) })
  const shot = async (n) => { await page.waitForTimeout(700); await page.screenshot({ path: dir + n + '.png' }); log.push(n) }
  for (const [w, h, tag] of [[1280, 800, '1280'], [375, 812, '375']]) {
    await page.setViewportSize({ width: w, height: h })
    await page.goto(base + '#/frota-multas'); await page.waitForSelector('text=AIT fictício u1', { timeout: 60000 })
    await shot(tag + '-01-lista')
    log.push('scrollW ' + tag + ' ' + await page.evaluate(() => document.documentElement.scrollWidth))
    // u1: Bruno sem aditivo
    await page.goto(base + '#/frota-multas?registro=multa:u1'); await page.waitForSelector('text=Motorista: Bruno', { timeout: 30000 })
    await shot(tag + '-02-sem-aditivo')
    // u2: pendente
    await page.goto(base + '#/frota-multas?registro=multa:u2'); await page.waitForSelector('text=/Enviado em/', { timeout: 30000 })
    await shot(tag + '-03-pendente')
    { const b = page.getByRole('button', { name: 'Lembrar motorista' }); if (await b.isEnabled()) await b.click() }
    await page.waitForTimeout(800); await shot(tag + '-04-lembrete-enviado')
    // u3: assinado
    await page.goto(base + '#/frota-multas?registro=multa:u3'); await page.waitForSelector('text=Hash do PDF', { timeout: 30000 })
    await page.waitForSelector('[aria-label="Parcelas do termo"]', { timeout: 30000 })
    await shot(tag + '-05-assinado-parcelas')
    // u4 contestado → preparar novo termo para Ana? u4 é Bruno. Abrir a lista de pendentes
    await page.goto(base + '#/frota-multas?registro=multa:u4'); await page.waitForSelector('text=/Motivo da contestação/', { timeout: 30000 })
    await shot(tag + '-06-contestado')
  }
  // Fluxo de envio em 1280: multa u2 tem pendente; usar Ana em nova multa? cancelar pendente da u2 e reenviar
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(base + '#/frota-multas?registro=multa:u2'); await page.waitForSelector('text=/Enviado em/', { timeout: 30000 })
  await page.getByRole('button', { name: 'Cancelar envio' }).click()
  await page.getByRole('button', { name: 'Cancelar termo' }).click()
  await page.getByRole('button', { name: 'Preparar termo' }).click()
  await page.getByRole('radio', { name: 'Desconto em folha' }).check()
  await page.getByRole('radio', { name: '3x' }).check()
  await page.getByRole('button', { name: 'Enviar termo' }).click()
  await shot('1280-07-confirmar-envio')
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar', exact: true }).click()
  await page.waitForSelector('text=/Enviado em/', { timeout: 30000 })
  await shot('1280-08-enviado')
  await page.goto(base + '#/frota-multas'); await page.waitForSelector('text=AIT fictício u1')
  await page.evaluate(() => document.querySelector('.bt-table, table')?.parentElement?.scrollBy?.(2000, 0))
  await shot('1280-09-lista-termo')
  // Registrar aditivo → ficha
  await page.goto(base + '#/frota-multas?registro=multa:u1'); await page.waitForSelector('text=Motorista: Bruno')
  await page.getByRole('button', { name: /Registrar aditivo de/ }).click()
  await page.waitForTimeout(3000)
  log.push('hash apos registrar: ' + await page.evaluate(() => location.hash))
  await shot('1280-10-ficha-funcionario')
  return { log, errs: errs.slice(0, 15) }
}
