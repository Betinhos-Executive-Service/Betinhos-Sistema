// Fluxo de #/abastecimento no modo mock (Chromium headless), desktop 1366×800 e celular 375×800.
// Uso (com `pnpm dev` rodando em apps/shell):
//   node .claude/skills/verificar-abastecimento/fluxo-mock.cjs <pasta-dos-prints> [desktop|mobile|ambos] [http://localhost:36472/]
// Gera <pasta>/<viewport>-NN-<passo>.png e imprime uma linha por passo (✅/❌) e os erros de console.
// Na VM cloud o Playwright e o Chromium já vêm instalados; fora dela ajuste PLAYWRIGHT_MODULE e CHROMIUM.
const path = require('node:path')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright')
const OUT = process.argv[2] || '.'
const QUAL = process.argv[3] || 'ambos'
const BASE = process.argv[4] || 'http://localhost:36472/'
const VIEWPORTS = { desktop: { width: 1366, height: 800 }, mobile: { width: 375, height: 800 } }
const CSV_CTF = path.join(__dirname, 'exemplo-ctf.csv')
const CSV_TICKET = path.join(__dirname, 'exemplo-ticket.csv')

async function run(nome) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
  const context = await browser.newContext({ viewport: VIEWPORTS[nome] })
  const page = await context.newPage()
  const mobile = nome === 'mobile'
  const erros = []
  page.on('pageerror', (e) => erros.push(`pageerror: ${e}`))
  page.on('console', (m) => { if (m.type() === 'error') erros.push(`console: ${m.text()}`) })
  const passos = []
  let n = 0
  // 400 ms: o drawer do DS entra por translateX em 220 ms; sem a espera o print sai cortado.
  const shot = async (rotulo, fullPage = false) => { await page.waitForTimeout(400); n += 1; const f = `${OUT}/${nome}-${String(n).padStart(2, '0')}-${rotulo}.png`; await page.screenshot({ path: f, fullPage }); return f }
  const passo = async (rotulo, fn) => {
    try { const obs = await fn(); passos.push({ rotulo, ok: true, obs: obs || '' }) }
    catch (e) { passos.push({ rotulo, ok: false, obs: String(e.message || e).split('\n')[0] }); await page.keyboard.press('Escape').catch(() => {}) }
  }
  const drawer = () => page.getByRole('dialog', { name: 'Importar extrato' })
  const aba = (rotulo) => page.getByRole('tab', { name: new RegExp(`^${rotulo}`) })
  async function escolher(scope, rotulo, opcao) {
    await scope.getByRole('combobox', { name: rotulo }).click()
    await page.getByRole('option', { name: opcao }).first().click()
  }
  async function importar(arquivo) {
    await page.getByRole('button', { name: 'Importar extrato' }).click()
    await drawer().waitFor()
    await drawer().locator('input[type="file"]').setInputFiles(arquivo)
    await drawer().getByText(/para importar|Nada novo para importar/).waitFor()
  }
  const semRolagemHorizontal = async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)

  await page.goto(`${BASE}#/abastecimento`)
  await passo('1 painel por veículo com dados de exemplo', async () => {
    await page.locator('.ab-toolbar').getByText('Dados de exemplo').waitFor()
    await page.getByRole('region', { name: 'Por veículo' }).getByText('TST1A11').waitFor()
    if (!(await page.getByText(/^v\d+\.\d+\.\d+ · /).count())) throw new Error('versão do build não apareceu')
    if (!mobile && !(await semRolagemHorizontal())) throw new Error('rolagem horizontal na página')
    const kml = await page.getByRole('region', { name: 'Por veículo' }).getByText('7,0 km/l').count()
    await shot('painel', true)
    return `km/l do TST4D44 ${kml ? 'ok' : 'ausente'}`
  })
  await passo('2 filtro por motorista e por mês', async () => {
    await escolher(page, 'Motorista', /Bruna Ficticia Lima/)
    await page.getByRole('region', { name: 'Por veículo' }).getByText('TST4D44').waitFor({ state: 'detached' })
    if (!page.url().includes('motorista=m2')) throw new Error('motorista não foi para a URL')
    await page.getByRole('combobox', { name: 'Mês' }).click()
    const meses = await page.getByRole('option').allTextContents()
    await page.getByRole('option').nth(1).click()
    await shot('filtros')
    await page.getByRole('combobox', { name: 'Motorista' }).locator('..').getByRole('button', { name: /Limpar/ }).click().catch(() => {})
    await page.goto(`${BASE}#/abastecimento`)
    await page.getByRole('region', { name: 'Por veículo' }).getByText('TST1A11').waitFor()
    return `meses: ${meses.slice(0, 3).join(', ')}`
  })
  await passo('3 lista de abastecimentos com km/l e origem', async () => {
    await aba('Abastecimentos').click()
    await page.getByRole('searchbox', { name: 'Buscar abastecimentos' }).fill('Graal')
    await page.waitForTimeout(400)
    const linhas = await page.locator(mobile ? '.ab-card' : '.ab-table .bt-table__row').count()
    if (!linhas) throw new Error('busca por posto não achou linhas')
    await shot('lista')
    await page.getByRole('searchbox', { name: 'Buscar abastecimentos' }).fill('')
    return `${linhas} linhas do Graal`
  })
  await passo('4 anomalias com motivo', async () => {
    await aba('Anomalias').click()
    await page.getByText('54,0 L em um tanque de 50 L').waitFor()
    await page.getByText(/min depois do anterior/).first().waitFor()
    await page.getByText('Consumo fora da curva').first().waitFor()
    await shot('anomalias', true)
  })
  await passo('5 dicas e alertas', async () => {
    await aba('Dicas e alertas').click()
    await page.getByRole('article', { name: /^TST1A11: \d+ anomalias/ }).waitFor()
    await page.getByRole('article', { name: /^Diego Exemplo Rocha: paga/ }).waitFor()
    await page.getByRole('article', { name: /^Bruna Ficticia Lima: odômetro em branco/ }).waitFor()
    await shot('dicas', true)
  })
  await passo('6 importar CSV do CTF: mapeamento sugerido, duplicados e inválidas', async () => {
    await importar(CSV_CTF)
    await drawer().getByText('3 abastecimentos novos para importar').waitFor()
    await drawer().getByText('1 linha já importada (ignoradas)').waitFor()
    await drawer().getByText(/1 linha inválida/).waitFor()
    await shot('importar-mapeamento')
    await drawer().getByRole('button', { name: 'Importar 3 abastecimentos' }).click()
    await drawer().getByText('3 abastecimentos importados').first().waitFor()
    await shot('importar-resumo')
    await drawer().getByRole('button', { name: 'Ver pendências' }).click()
    await page.getByText('ZZZ0Z00').waitFor()
  })
  await passo('7 reimportar o mesmo arquivo: 0 novos', async () => {
    await importar(CSV_CTF)
    await drawer().getByText('Nada novo para importar').waitFor()
    await drawer().getByText('4 linhas já importadas (ignoradas)').waitFor()
    if (!(await drawer().getByRole('button', { name: 'Importar' }).isDisabled())) throw new Error('botão Importar deveria estar desabilitado')
    await shot('reimportar')
    await drawer().getByRole('button', { name: 'Fechar painel' }).click()
    await page.getByRole('dialog', { name: 'Descartar importação?' }).getByRole('button', { name: 'Descartar' }).click()
  })
  await passo('8 importar CSV do Ticket Log (vírgula, ponto decimal, ISO) e lembrar mapeamento', async () => {
    await page.getByRole('button', { name: 'Importar extrato' }).click()
    await escolher(drawer(), 'Operadora', 'Ticket Log')
    await drawer().locator('input[type="file"]').setInputFiles(CSV_TICKET)
    await drawer().getByText('2 abastecimentos novos para importar').waitFor()
    await drawer().getByRole('button', { name: 'Importar 2 abastecimentos' }).click()
    await drawer().getByText('2 abastecimentos importados').first().waitFor()
    await drawer().getByRole('button', { name: 'Fechar', exact: true }).click()
    const salvo = await page.evaluate(() => localStorage.getItem('betinhos.abastecimento.mapeamento.ticket'))
    if (!salvo || !salvo.includes('"odometro":"KM"')) throw new Error('mapeamento do Ticket Log não ficou salvo')
    return 'mapeamento salvo'
  })
  await passo('9 pendência: vincular placa ao veículo', async () => {
    await aba('Pendências').click()
    await page.getByText('XYZ9Z99').waitFor()
    await escolher(page, 'Veículo para XYZ9Z99', /TST2B22/)
    await page.locator('.ab-pendencia', { hasText: 'XYZ9Z99' }).getByRole('button', { name: 'Vincular' }).click()
    await page.getByText('XYZ9Z99 vinculada ao veículo.').waitFor()
    await shot('pendencias')
  })
  await passo('10 console sem erros', async () => { if (erros.length) throw new Error(erros.join(' | ')) })

  await browser.close()
  for (const p of passos) console.log(`${p.ok ? '✅' : '❌'} [${nome}] ${p.rotulo}${p.obs ? ` — ${p.obs}` : ''}`)
  return passos.every((p) => p.ok)
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const nomes = QUAL === 'ambos' ? ['desktop', 'mobile'] : [QUAL]
  let ok = true
  for (const nome of nomes) ok = (await run(nome)) && ok
  process.exit(ok ? 0 : 1)
})()
