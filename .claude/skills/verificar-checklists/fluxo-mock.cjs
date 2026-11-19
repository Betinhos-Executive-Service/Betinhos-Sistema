// Roteiro em mock da tela #/frota-checklists (Playwright headless).
// Uso: node fluxo-mock.cjs <pasta-dos-prints>   (BASE=http://localhost:36472 por padrão)
// Fora da VM cloud ajuste PLAYWRIGHT_MODULE e CHROMIUM.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright')
const path = require('path')
const dir = process.argv[2] || '.'
const base = (process.env.BASE || 'http://localhost:36472') + '/#/frota-checklists'
const shot = (p, nome) => p.screenshot({ path: path.join(dir, nome + '.png') })
let falhas = 0
const passo = (ok, txt) => { if (!ok) falhas++; console.log(`${ok ? '✅' : '❌'} ${txt}`) }

;(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
  const p = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const erros = []
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) erros.push(m.text().slice(0, 200)) })
  p.on('pageerror', e => erros.push('pageerror: ' + e.message))
  await p.goto(base); await p.waitForTimeout(2500)
  passo(await p.getByRole('heading', { name: 'Checklists de Veículos' }).count() > 0, 'h1 "Checklists de Veículos"')
  passo(await p.getByRole('heading', { name: 'Situação por veículo' }).count() > 0, 'aba Veículos com a tabela "Situação por veículo"')
  await shot(p, 'desktop-01-veiculos')

  await p.getByRole('tab', { name: /^Checklists/ }).click(); await p.waitForTimeout(600)
  await p.getByRole('radio', { name: /^Todos/ }).first().click().catch(() => {})
  await shot(p, 'desktop-02-checklists')
  await p.getByRole('table', { name: 'Checklists' }).getByRole('row').nth(1).click(); await p.waitForTimeout(600)
  passo(await p.locator('dialog[open]').count() > 0, 'clicar na linha abre o drawer do checklist')
  await shot(p, 'desktop-03-drawer')
  await p.keyboard.press('Escape'); await p.waitForTimeout(400)
  passo(await p.locator('dialog[open]').count() === 0, 'Esc fecha o drawer')

  for (const [n, re] of [['04-modelos', /^Modelos/], ['05-padroes', /^Padrões/]]) {
    await p.getByRole('tab', { name: re }).click(); await p.waitForTimeout(600); await shot(p, 'desktop-' + n)
  }

  await p.getByRole('tab', { name: /^Modelos/ }).click(); await p.waitForTimeout(400)
  const modelo = p.locator('[data-foco^="modelo-"]').first()
  const foco = await modelo.getAttribute('data-foco')
  await modelo.click(); await p.waitForTimeout(600)
  await shot(p, 'desktop-06-editor')
  await p.getByRole('button', { name: 'Modelos' }).first().click(); await p.waitForTimeout(500)
  passo(await p.evaluate(() => document.activeElement?.getAttribute('data-foco')) === foco, 'voltar do editor devolve o foco ao modelo')
  await modelo.click(); await p.waitForTimeout(500)
  await p.getByLabel(/^Nome/).first().fill('Nome alterado no teste')
  await p.getByRole('button', { name: 'Modelos' }).first().click(); await p.waitForTimeout(400)
  passo(await p.getByText('Descartar alterações?').count() > 0, 'voltar com alteração pergunta "Descartar alterações?"')
  await shot(p, 'desktop-06b-descartar')
  await p.getByRole('button', { name: 'Descartar' }).click(); await p.waitForTimeout(400)
  passo(await p.getByRole('tab', { name: /^Modelos/ }).getAttribute('aria-selected') === 'true', '"Descartar" volta para a lista de modelos')

  await p.getByRole('tab', { name: /^Veículos/ }).click(); await p.waitForTimeout(400)
  await p.getByRole('button', { name: /Solicitar checklist do/ }).first().click(); await p.waitForTimeout(500)
  await shot(p, 'desktop-07-dialog')
  await p.getByRole('button', { name: 'Solicitar checklist', exact: true }).click(); await p.waitForTimeout(1500)
  const toast = (await p.locator('.bt-toast, [role=status]').allInnerTexts()).join(' | ')
  passo(/Checklist solicitado para/.test(toast), `toast de sucesso (${toast.slice(0, 80)})`)
  await shot(p, 'desktop-08-toast')
  passo(erros.length === 0, 'console sem erros nem avisos' + (erros.length ? ': ' + erros.join(' / ') : ''))

  const m = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await m.goto(base); await m.waitForTimeout(2500)
  const larg = await m.evaluate(() => document.documentElement.scrollWidth)
  passo(larg <= 390, `390 px sem rolagem horizontal (${larg})`)
  await m.getByRole('table', { name: 'Situação por veículo' }).scrollIntoViewIfNeeded()
  await shot(m, 'mobile-01-tabela')
  await browser.close()
  console.log(falhas ? `${falhas} falha(s)` : 'tudo ok'); process.exit(falhas ? 1 : 0)
})()
