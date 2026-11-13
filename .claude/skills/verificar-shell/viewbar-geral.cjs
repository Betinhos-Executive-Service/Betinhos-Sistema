// Linha de comando da Geral (ViewBar com espaços nomeados, @betinhos/ui >= 1.26): uma linha, sem sobreposição, fixos parados com
// 0/1/3 serviços marcados, nenhum texto cortado (nem o nome da visão, que em falta de espaço vira só ícone + chevron, >= 1.26.1), Atualizar visível, sem erro de console. Adaptado do medir.cjs da skill
// verificar-viewbar-linha do repo do DS. Uso: node viewbar-geral.cjs http://localhost:36472/#/geral <pasta-de-saida>
// PLAYWRIGHT: caminho do pacote playwright; CHROME_EXE: Chromium já instalado (opcional); SEM_SELO=1 esconde o selo do mock.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
const fs = require('fs')
const path = require('path')
const url = process.argv[2] || 'http://localhost:36472/#/geral'
const out = process.argv[3] || '.'
const WIDTHS = [390, 600, 820, 821, 1000, 1280, 1440, 1920]
const COUNTS = [0, 1, 3]

const measure = () => {
  const bar = document.querySelector('.gr-commandline .bt-viewbar--slots')
  const br = bar.getBoundingClientRect()
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]') && !el.closest('.bt-viewbar__measure') }
  // Controles folha da linha (botões e a caixa de busca), fora da barra do rodapé e da camada de medida.
  const leaves = [...bar.querySelectorAll('.bt-viewbar__trigger, .bt-viewbar__end .bt-button, .bt-viewbar__end .bt-control--search, .bt-selection__label')]
    .filter((el) => visible(el) && !el.closest('.bt-selectionbar'))
  const rects = leaves.map((el) => ({ el, r: el.getBoundingClientRect() }))
  const name = (el) => el.getAttribute('aria-label') || el.getAttribute('data-vb') || el.closest('[data-vb]')?.getAttribute('data-vb') || el.textContent.trim().slice(0, 24) || el.className
  // Sobreposição: só entre controles que não estão um dentro do outro (o contador contém o ✕).
  const overlaps = []
  for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) {
    const a = rects[i], b = rects[j]
    if (a.el.contains(b.el) || b.el.contains(a.el) || a.el.closest('.bt-selection__count') && b.el.closest('.bt-selection__count')) continue
    const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
    const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
    if (x > 0.5 && y > 0.5) overlaps.push(`${name(a.el)}×${name(b.el)}`)
  }
  const centers = rects.map(({ r }) => r.top + r.height / 2)
  const oneLine = Math.max(...centers) - Math.min(...centers) <= 2
  const outside = rects.filter(({ r }) => r.left < br.left - 0.5 || r.right > br.right + 0.5).map(({ el }) => name(el))
  // Texto cortado: rótulos visíveis (os só ícone ficam com 1 px e não contam) e o nome da visão.
  const texts = [...bar.querySelectorAll('.bt-button__label, .bt-viewbar__name, .bt-selection__label')].filter((el) => visible(el) && !el.closest('.bt-selectionbar'))
  const cut = texts.filter((el) => el.scrollWidth > el.clientWidth + 0.5).map((el) => el.textContent.trim())
  // Seletor de visão (>= 1.26.1): nome inteiro ou só ícone + chevron (is-compact), nunca nome com reticências; só ícone exige title e aria-label.
  const trigger = bar.querySelector('.bt-viewbar__trigger')
  const triggerCompact = trigger.classList.contains('is-compact')
  if (triggerCompact && !(trigger.title && trigger.getAttribute('aria-label'))) cut.push('visão só ícone sem title/aria-label')
  // Posição x dos fixos (o que nunca depende da seleção).
  const fixedSel = { visao: '.bt-viewbar__trigger', colunas: '[data-vb="colunas"]', filtros: '[data-vb="filtros"]', densidade: '[data-vb="density"]', auditoria: '[data-vb="audit"]', busca: '.bt-viewbar__search', lupa: 'button[aria-label="Buscar"]', mais: '.bt-viewbar__more', principal: '[data-vb="primary"]' }
  const fixed = {}
  for (const [key, sel] of Object.entries(fixedSel)) {
    const el = bar.querySelector(`.bt-viewbar__start ${sel}, .bt-viewbar__end ${sel}`)
    fixed[key] = el && visible(el) ? Math.round(el.getBoundingClientRect().left * 10) / 10 : null
  }
  const state = {
    visao: triggerCompact ? 'visão só ícone' : 'visão c/ nome',
    texto: !bar.querySelector('[data-vb="colunas"].is-compact'),
    principalTexto: !bar.querySelector('[data-vb="primary"].is-compact'),
    selInline: [...bar.querySelectorAll('.bt-viewbar__end [data-vb^="sel:"]')].filter(visible).length,
    selTexto: !bar.querySelector('.bt-viewbar__end [data-vb^="sel:"].is-compact'),
    noMenu: ['colunas', 'densidade', 'auditoria'].filter((k) => fixed[k] === null),
    lupa: fixed.lupa !== null,
    selo: bar.querySelector('.bt-viewbar__more .bt-viewbar__badge')?.textContent ?? '',
    rodape: Boolean(document.querySelector('.bt-selectionbar')),
  }
  const search = bar.querySelector('.bt-viewbar__search')
  const zone = bar.querySelector('.bt-viewbar__zone')
  const zoneKids = [...zone.children].filter(visible)
  const zoneUsed = zoneKids.reduce((a, el) => a + el.getBoundingClientRect().width, 0) + Math.max(0, zoneKids.length - 1) * parseFloat(getComputedStyle(zone).columnGap || '0')
  const atualizar = bar.querySelector('[data-vb="primary"] button[aria-label="Atualizar"]')
  state.atualizar = Boolean(atualizar && visible(atualizar))
  state.buscaW = search && visible(search) ? Math.round(search.getBoundingClientRect().width) : 0
  state.zonaW = Math.round(zone.getBoundingClientRect().width)
  state.sobra = Math.round(zone.getBoundingClientRect().width - zoneUsed)
  state.selLabels = [...bar.querySelectorAll('.bt-viewbar__end [data-vb^="sel:"]')].filter(visible).map((el) => el.textContent.trim() + (el.classList.contains('is-compact') ? '(ícone)' : ''))
  return { barW: Math.round(br.width), barH: Math.round(br.height), oneLine, overlaps, outside, cut, fixed, state, pageScroll: document.documentElement.scrollWidth > window.innerWidth }
}

;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE || undefined })
  const rows = []
  const errors = []
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width <= 820 })
    const page = await ctx.newPage()
    if (process.env.SEM_SELO) await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.gr-commandline [data-vb="extra"]{display:none!important}'; document.head.appendChild(s) }) })
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${width}px: ${m.text()}`) })
    page.on('pageerror', (e) => errors.push(`${width}px: ${e.message}`))
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForSelector('.gr-commandline .bt-viewbar--slots', { timeout: 60000 })
    await page.waitForFunction(() => document.querySelectorAll('.gr-page input[type=checkbox]').length > 4, null, { timeout: 60000 })
    await page.waitForTimeout(500)
    await page.evaluate(() => document.fonts.ready)
    const section = page.locator('.gr-page')
    const boxes = section.getByRole('checkbox', { name: /^Selecionar serviço/ })
    let selected = 0
    for (const count of COUNTS) {
      while (selected < count) { await boxes.nth(selected).evaluate((el) => el.click()); selected += 1 }
      await page.waitForTimeout(150)
      const m = await page.evaluate(measure)
      m.state.contador = await page.evaluate(() => document.querySelector('.bt-selection__label, .bt-selectionbar .bt-selection__label')?.textContent ?? '')
      rows.push({ width, count, ...m })
      await page.locator('.gr-commandline').screenshot({ path: path.join(out, `viewbar-${width}-${count}.png`) })
    }
    await ctx.close()
  }
  await browser.close()
  // Fixos parados: mesma posição x com 0, 1 e 3 selecionados.
  for (const width of WIDTHS) {
    const set = rows.filter((r) => r.width === width)
    const base = JSON.stringify(set[0].fixed)
    for (const r of set) r.fixosParados = JSON.stringify(r.fixed) === base
  }
  fs.writeFileSync(path.join(out, 'viewbar-medidas.json'), JSON.stringify({ rows, errors }, null, 2))
  console.log('| Viewport | Sel. | Barra (px) | Altura | 1 linha | Sobreposição | Fora da barra | Texto cortado | Fixos parados | Estado |')
  console.log('|---|---|---|---|---|---|---|---|---|---|')
  for (const r of rows) {
    const s = r.state
    const estado = [s.visao, s.texto ? 'fixos c/ texto' : 'fixos só ícone', s.principalTexto ? 'principal c/ texto' : 'principal só ícone', r.count ? (s.rodape ? 'seleção no rodapé' : `seleção ${s.selInline} inline${s.selTexto ? ' c/ texto' : ' só ícone'}`) : null, s.noMenu.length ? `no ⋮: ${s.noMenu.join(', ')}` : null, s.lupa ? 'lupa' : 'busca', s.selo ? `selo ${s.selo}` : null, r.count ? `"${s.contador}"` : null, s.atualizar ? 'Atualizar visível' : 'SEM ATUALIZAR', `busca ${s.buscaW}px`, `sobra ${s.sobra}px`, s.selLabels.length ? `[${s.selLabels.join(', ')}]` : null].filter(Boolean).join('; ')
    console.log(`| ${r.width} | ${r.count} | ${r.barW} | ${r.barH} | ${r.oneLine ? 'sim' : 'NÃO'} | ${r.overlaps.length ? r.overlaps.join(' ') : 'nenhuma'} | ${r.outside.length ? r.outside.join(' ') : '—'} | ${r.cut.length ? r.cut.join(', ') : 'nenhum'} | ${r.fixosParados ? 'sim' : 'NÃO'} | ${estado}${r.pageScroll ? ' (ROLAGEM HORIZONTAL)' : ''} |`)
  }
  console.log(`Erros de console: ${errors.length ? errors.join(' | ') : 'nenhum'}`)
})().catch((e) => { console.error(e); process.exit(1) })
