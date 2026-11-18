// Uso: [TEMA=escuro] [PRINTS_CARD=<pasta dos prints do card ampliado>] PLAYWRIGHT=<pasta playwright-core> CHROME_EXE=<chrome headless> node medir.cjs <url base> <pasta de prints>
// Percorre as 8 abas do dashboard (#/dashboard?tab=<aba>) em 1440, 840 e 390 px (390 com toque), tira o print de página inteira e mede
// rolagem lateral, valores cortados, maior altura de card de KPI e de alerta, e erros/avisos de console. Funciona com os cards do DS
// (.bt-stat, .bt-alert-card) e com os antigos (.dash-kpi, .dash-alerta), para comparar antes e depois.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright-core')
const fs = require('node:fs')
const path = require('node:path')

const [base = 'http://localhost:36472/', saida = '.'] = process.argv.slice(2)
const ABAS = ['resumo', 'servicos', 'financeiro', 'despesas', 'frota', 'motoristas', 'manutencoes', 'multas']
const LARGURAS = [1440, 840, 390]
const ALVOS = ABAS.flatMap((aba) => ['.bt-stat--open', '.dash-card__ampliavel'].map((alvoSel) => ({ aba, alvoSel })))
const KPI = '.bt-stat, .dash-kpi'
const VALOR = '.bt-stat__value, .dash-kpi__valor'
const ALERTA = '.bt-alert-card, .dash-alerta'
// 167 px vale para o card sem extras (valor de 26 px, DS 3.1.1); com apoio em 2 linhas ou extras o card cresce
// (decisão do Renan, 17/11/2026). O teto pega fileira estourada por quebra inesperada.
// O herói do bento (Faturamento, 2 linhas) fica fora da medida: tem altura própria.
const TETO_KPI = 190

;(async () => {
  fs.mkdirSync(saida, { recursive: true })
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE, headless: true })
  const linhas = []
  let falhou = false
  for (const w of LARGURAS) {
    const movel = w === 390
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, isMobile: movel, hasTouch: movel, deviceScaleFactor: 1, colorScheme: process.env.TEMA === 'escuro' ? 'dark' : 'light' })
    const page = await ctx.newPage()
    const console_ = []
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console_.push(`${m.type()}: ${m.text().slice(0, 160)}`) })
    page.on('pageerror', (e) => console_.push(`pageerror: ${String(e).slice(0, 160)}`))
    for (const aba of ABAS) {
      await page.goto(`${base}#/dashboard${aba === 'resumo' ? '' : `?tab=${aba}`}`)
      await page.waitForSelector(KPI, { timeout: 20000 }).catch(() => {})
      await page.waitForTimeout(1500)
      await page.screenshot({ path: path.join(saida, `${aba}-${w}.png`), fullPage: true })
      const m = await page.evaluate(({ KPI, VALOR, ALERTA }) => {
        const altura = (sel) => Math.max(0, ...[...document.querySelectorAll(sel)].map((e) => Math.round(e.getBoundingClientRect().height)))
        const cortados = [...document.querySelectorAll(VALOR)].filter((e) => e.scrollWidth > e.clientWidth + 1).length
        return {
          rolagem: document.documentElement.scrollWidth - innerWidth,
          kpis: document.querySelectorAll(KPI).length, alertas: document.querySelectorAll(ALERTA).length,
          cortados, altKpi: altura('.bt-stat:not(.dash-bento__faturamento), .dash-kpi'), altAlerta: altura(ALERTA),
        }
      }, { KPI, VALOR, ALERTA })
      linhas.push({ aba, w, ...m, console: console_.splice(0).length })
    }
    // Card ampliado (1440, 840 e 390): clique (toque no 390) no corpo de um KPI e no gráfico do Total produzido; confere `detalhe=`, o card visível, o Esc e o foco de volta.
    {
      const clicar = async (x, y) => (movel ? page.touchscreen.tap(x, y) : page.mouse.click(x, y))
      const abrir = () => page.waitForFunction(() => location.hash.includes('detalhe=') && document.querySelector('.dash-ampliado'), null, { timeout: 6000 }).then(() => true).catch(() => false)
      const fechado = () => page.waitForFunction(() => !location.hash.includes('detalhe=') && !document.querySelector('.dash-ampliado'), null, { timeout: 6000 }).then(() => true).catch(() => false)
      for (const { aba, alvoSel } of ALVOS) {
        await page.goto(`${base}#/dashboard${aba === 'resumo' ? '' : `?tab=${aba}`}`)
        await page.waitForSelector(KPI, { timeout: 20000 }).catch(() => {})
        await page.waitForTimeout(1500)
        const alvo = await page.evaluate((sel) => {
          const el = document.querySelector(sel)
          if (!el) return null
          el.scrollIntoView({ block: 'center' })
          const r2 = (el.querySelector('.bt-stat__value') || el).getBoundingClientRect()
          return { x: r2.x + Math.min(r2.width / 2, 40), y: r2.y + r2.height / 2, nome: sel }
        }, alvoSel)
        if (!alvo) { console.log(`card ampliado ${w}: ${aba} ${alvoSel} nao encontrado`); if (aba === 'resumo' || alvoSel === '.bt-stat--open') falhou = true; continue }
        await clicar(alvo.x, alvo.y)
        const abriu = await abrir()
        await page.waitForTimeout(700)
        const tipo = alvoSel === '.bt-stat--open' ? 'kpi' : 'grafico'
        const nome = aba === 'resumo' ? tipo : `${aba}${tipo === 'grafico' ? '-grafico' : ''}`
        const tema = process.env.TEMA || 'claro'
        const comTabela = await page.evaluate(() => !!document.querySelector('.dash-ampliado table, .dash-ampliado [role="table"], .dash-ampliado [role="grid"]'))
        const comTops = await page.evaluate(() => !!document.querySelector('.dash-ampliado__tops'))
        if (abriu && process.env.PRINTS_CARD && (aba === 'resumo' || w === 1440)) await page.screenshot({ path: path.join(process.env.PRINTS_CARD, `card-expande-${nome}-${w}-${tema}.png`) })
        if (abriu && process.env.PRINTS_CARD && aba === 'resumo' && tipo === 'grafico' && w === 1440) {
          await page.evaluate(() => document.querySelector('.dash-ampliado__corpo')?.scrollTo(0, 99999))
          await page.waitForTimeout(300)
          await page.screenshot({ path: path.join(process.env.PRINTS_CARD, `card-expande-tabela-${w}-${tema}.png`) })
        }
        const titulo = abriu ? await page.evaluate(() => document.querySelector('.dash-ampliado__titulo')?.textContent) : null
        await page.keyboard.press('Escape')
        const fechou = abriu && (await fechado())
        const foco = fechou ? await page.evaluate(() => !!document.activeElement?.closest('[data-origem]')) : false
        console.log(`card ampliado ${w}: ${aba} ${alvoSel} -> ${abriu ? `tabela ${comTabela ? 'sim' : 'NAO'}, top5 ${comTops ? 'sim' : 'nao'}; ` : ''}${abriu ? `abriu (${titulo})` : 'NAO abriu'}; Esc ${fechou ? 'fechou' : 'NAO fechou'}; foco ${foco ? 'voltou' : 'NAO voltou'}`)
        if (!abriu || !fechou || !foco) falhou = true
      }
    }
    await ctx.close()
  }
  await browser.close()
  console.log('aba | larg | rolagem | cortados | kpis | alertas | altKPI | altAlerta | console')
  for (const l of linhas) console.log(`${l.aba} | ${l.w} | ${l.rolagem} | ${l.cortados} | ${l.kpis} | ${l.alertas} | ${l.altKpi} | ${l.altAlerta} | ${l.console}`)
  const ruim = linhas.filter((l) => l.rolagem !== 0 || l.cortados !== 0 || l.console !== 0 || l.altKpi > TETO_KPI)
  console.log(`maior KPI: ${Math.max(...linhas.map((l) => l.altKpi))} px; maior alerta: ${Math.max(...linhas.map((l) => l.altAlerta))} px`)
  console.log(ruim.length || falhou ? `FALHOU: ${ruim.length} linha(s) fora do esperado${falhou ? ' e drill-down' : ''}` : 'OK em todas')
  process.exit(ruim.length || falhou ? 1 : 0)
})()
