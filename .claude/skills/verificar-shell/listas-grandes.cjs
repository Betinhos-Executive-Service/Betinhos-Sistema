// Listas grandes no modo mock (Chromium headless): primeira página, rolagem infinita sem botão, busca sem travar,
// cache ao voltar, edição refletida, erro no meio da carga. Uso (com `pnpm dev` rodando):
//   node .claude/skills/verificar-shell/listas-grandes.cjs <pasta-dos-prints> [http://localhost:36472/]
// Na VM cloud o Playwright e o Chromium já vêm instalados; fora dela ajuste PLAYWRIGHT_MODULE e CHROMIUM.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright')
const OUT = process.argv[2] || '.'
const BASE = process.argv[3] || 'http://localhost:36472/'
const log = (...a) => console.log(...a)

async function rows(page) { return page.locator('.bt-table__row').count() }
const footer = (page) => page.locator('.bt-table__footer').first().textContent()
async function scrollDown(page, times = 4) { await page.mouse.move(900, 500); for (let i = 0; i < times; i++) { await page.mouse.wheel(0, 20000); await page.waitForTimeout(300) } }
async function waitText(page, re, timeout = 15000) { await page.getByText(re).first().waitFor({ timeout }) }

;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  // 1. Pessoas com 5.000 registros: primeira página, resto em segundo plano.
  let t0 = Date.now()
  await page.goto(`${BASE}?volume=5000#/pessoas`)
  await page.locator('.bt-table__row').first().waitFor({ timeout: 20000 })
  const firstRow = Date.now() - t0
  const pendingSeen = await footer(page)
  await page.screenshot({ path: `${OUT}/01-pessoas-primeira-pagina.png` })
  await waitText(page, /^5010 de 5010 ·/)
  const complete = Date.now() - t0
  log(`[pessoas] primeira linha em ${firstRow} ms; rodapé na primeira página: "${pendingSeen}"; lista completa (5010) em ${complete} ms; linhas no DOM: ${await rows(page)}`)
  log(`[pessoas] botões "Carregar mais": ${await page.getByRole('button', { name: /Carregar mais/ }).count()}`)

  // Rolagem infinita: rolar até o fim aumenta as linhas sem botão.
  const before = await rows(page)
  await scrollDown(page)
  const after = await rows(page)
  log(`[pessoas] linhas antes da rolagem: ${before}; depois de rolar: ${after}`)
  await page.screenshot({ path: `${OUT}/02-pessoas-rolagem.png` })
  await page.mouse.wheel(0, -100000)

  // 2. Digitação rápida: tarefas longas durante a digitação.
  await page.evaluate(() => { window.__long = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration) }).observe({ entryTypes: ['longtask'] }) })
  const box = page.getByRole('searchbox', { name: 'Buscar pessoas' }).or(page.getByLabel('Buscar pessoas')).first()
  await box.click()
  t0 = Date.now()
  await page.keyboard.type('pessoa4321@', { delay: 25 })
  const typing = Date.now() - t0
  await page.waitForTimeout(500)
  const longs = await page.evaluate(() => window.__long)
  const value = await box.inputValue()
  log(`[busca] digitou "${value}" em ${typing} ms (25 ms por tecla); tarefas longas: ${longs.length}, maior ${Math.round(Math.max(0, ...longs))} ms; resultado: ${await footer(page)}`)
  await page.screenshot({ path: `${OUT}/03-pessoas-busca.png` })

  // 3. Filtro + busca sem resultado (vazio).
  await box.fill('zzzz-nao-existe')
  await waitText(page, 'Nenhum registro com estes filtros')
  log(`[vazio] busca sem resultado mostra "Nenhum registro com estes filtros"`)
  await page.screenshot({ path: `${OUT}/04-pessoas-vazio.png` })
  await box.fill('')

  // 4. Voltar à lista usa o cache.
  await page.goto(`${BASE}?volume=5000#/ops`)
  await page.locator('.bt-table__row').first().waitFor({ timeout: 20000 })
  t0 = Date.now()
  await page.evaluate(() => { location.hash = '#/pessoas' })
  await page.locator('.bt-table__row').first().waitFor({ timeout: 20000 })
  const back = Date.now() - t0
  log(`[cache] voltar para Pessoas: linhas em ${back} ms; rodapé: ${await footer(page)}; aviso de carga: ${await page.getByText(/carregando o restante/).count()}`)

  // 5. Edição refletida depois de sair e voltar (cache atualizado e revalidado).
  await page.goto(`${BASE}#/pessoas`)
  await page.getByRole('button', { name: /^John Carter/ }).first().click()
  const ficha = page.getByRole('dialog', { name: 'John Carter' })
  await ficha.getByRole('button', { name: 'Editar cadastro' }).click()
  await page.locator('input[name="departamento"]').fill('Compras VM')
  await page.getByRole('button', { name: 'Salvar alterações' }).click()
  await waitText(page, 'Cadastro de John Carter salvo.')
  await page.evaluate(() => { location.hash = '#/ops' })
  await page.locator('.bt-table__row').first().waitFor({ timeout: 20000 })
  await page.evaluate(() => { location.hash = '#/pessoas' })
  await page.locator('.bt-table__row').first().waitFor({ timeout: 20000 })
  log(`[edição] depois de voltar, "Compras VM" na lista: ${await page.getByText(/Compras VM/).count() > 0}`)
  await page.screenshot({ path: `${OUT}/05-pessoas-edicao-voltar.png` })

  // 6. Erro no meio da carga.
  await page.goto(`${BASE}?volume=5000&falha=carga#/pessoas`)
  await waitText(page, 'A carga parou no meio')
  log(`[erro] alerta "A carga parou no meio" com ${await rows(page)} linhas da primeira página; rodapé: ${await footer(page)}`)
  await page.screenshot({ path: `${OUT}/06-pessoas-erro-no-meio.png` })

  // 7. Outras listas com volume.
  for (const [rota, nome, fim] of [['ops?periodo=all', 'ops', /OPs · R\$/], ['pagantes?periodo=all', 'pagantes', /pagantes · R\$/], ['despesas-operacionais?periodo=all', 'despesas', /de \d+ no período$/]]) {
    t0 = Date.now()
    await page.goto(`${BASE}?volume=5000#/${rota}`)
    await page.locator('.bt-table__row').first().waitFor({ timeout: 20000 })
    const first = Date.now() - t0
    const partial = await footer(page)
    await page.screenshot({ path: `${OUT}/07-${nome}-primeira-pagina.png` })
    await page.locator('.bt-table__footer').getByText(fim).waitFor({ timeout: 20000 })
    log(`[${nome}] primeira linha em ${first} ms (rodapé: "${partial}"); completa em ${Date.now() - t0} ms (rodapé: "${await footer(page)}"); botões "Carregar mais": ${await page.getByRole('button', { name: /Carregar mais/ }).count()}`)
  }

  // 8. Ops: período + busca combinados (filtro do servidor por período + busca no cliente).
  await page.goto(`${BASE}?volume=5000#/ops?periodo=30`)
  await page.locator('.bt-table__footer').getByText(/OPs · R\$/).waitFor({ timeout: 20000 })
  const total30 = await footer(page)
  await page.getByLabel('Buscar ordens de pagamento').first().fill('Lumen')
  await page.waitForTimeout(600)
  log(`[ops] 30 dias: "${total30}"; + busca "Lumen": "${await footer(page)}"`)
  await page.screenshot({ path: `${OUT}/08-ops-periodo-busca.png` })

  // 9. Funcionários e Frota com volume.
  t0 = Date.now()
  await page.goto(`${BASE}?volume=3000#/funcionarios`)
  await page.locator('.bt-table__row').first().waitFor({ timeout: 20000 })
  const fFirst = Date.now() - t0
  await waitText(page, /de 3008 ·/, 20000)
  log(`[funcionários] primeira linha em ${fFirst} ms; completa em ${Date.now() - t0} ms; linhas no DOM: ${await rows(page)}; rodapé: "${await footer(page)}"`)
  await page.screenshot({ path: `${OUT}/09-funcionarios.png` })

  t0 = Date.now()
  await page.goto(`${BASE}?volume=5000#/frota-manutencoes`)
  await page.locator('.bt-table__row').first().waitFor({ timeout: 30000 })
  log(`[frota] manutenções: primeira linha em ${Date.now() - t0} ms; linhas no DOM: ${await rows(page)}; rodapé: "${await footer(page)}"`)
  await scrollDown(page, 3)
  log(`[frota] depois de rolar: ${await rows(page)} linhas`)
  await page.screenshot({ path: `${OUT}/10-frota-manutencoes.png` })
  await page.evaluate(() => { location.hash = '#/pessoas' })
  await page.locator('.bt-table__row').first().waitFor({ timeout: 20000 })
  t0 = Date.now()
  await page.evaluate(() => { location.hash = '#/frota-manutencoes' })
  await page.locator('.bt-table__row').first().waitFor({ timeout: 30000 })
  log(`[frota] voltar à Frota (cache): linhas em ${Date.now() - t0} ms`)

  // Celular: cartões com rolagem infinita.
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await mobile.goto(`${BASE}?volume=5000#/pessoas`)
  await mobile.locator('.ps-card').first().waitFor({ timeout: 20000 })
  await mobile.waitForTimeout(3000)
  const c1 = await mobile.locator('.ps-card').count()
  await mobile.mouse.move(200, 400); for (let i = 0; i < 4; i++) { await mobile.mouse.wheel(0, 20000); await mobile.waitForTimeout(300) }
  log(`[celular] cartões: ${c1} → ${await mobile.locator('.ps-card').count()} depois de rolar; botões "Carregar mais": ${await mobile.getByRole('button', { name: /Carregar mais/ }).count()}`)
  await mobile.screenshot({ path: `${OUT}/11-pessoas-celular.png` })

  log(`[console] erros: ${errors.length ? errors.join(' | ') : 'nenhum'}`)
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
