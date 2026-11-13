// Linha de comando da Geral (ViewBar com espaços nomeados, @betinhos/ui >= 1.26): uma linha, sem sobreposição, fixos parados com
// 0/1/3 serviços marcados, sem vão nem fio solto na superfície (>= 1.27.1), rodapé do celular sem rótulo cortado, nenhum texto cortado (nem o nome da visão, que em falta de espaço vira só ícone + chevron, >= 1.26.1), Atualizar visível, sem erro de console. Adaptado do medir.cjs da skill
// verificar-viewbar-linha do repo do DS. Uso: node viewbar-geral.cjs http://localhost:36472/#/geral <pasta-de-saida>
// Grava viewbar-<w>-<n>.png, rodape-<w>-<n>.png (quando há rodapé) e, com TELA=1, geral-<w>-<n>.png da tela inteira.
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
  // Posição x dos fixos (o que nunca depende da seleção): borda esquerda; da busca, a direita.
  const fixedSel = { visao: '.bt-viewbar__trigger', colunas: '[data-vb="colunas"]', filtros: '[data-vb="filtros"]', densidade: '[data-vb="density"]', auditoria: '[data-vb="audit"]', busca: '.bt-viewbar__search', lupa: 'button[aria-label="Buscar"]', mais: '.bt-viewbar__more', principal: '[data-vb="primary"]' }
  const fixed = {}
  for (const [key, sel] of Object.entries(fixedSel)) {
    const el = bar.querySelector(`.bt-viewbar__start ${sel}, .bt-viewbar__end ${sel}`)
    // A busca (>= 1.27.1) começa logo depois do fio e ocupa a reserva sem seleção: parada é a borda direita, não a esquerda.
    const r = el && visible(el) ? el.getBoundingClientRect() : null
    fixed[key] = r ? Math.round((key === 'busca' ? r.right : r.left) * 10) / 10 : null
  }
  const state = {
    visao: triggerCompact ? 'visão só ícone' : 'visão c/ nome',
    texto: !bar.querySelector('[data-vb="colunas"].is-compact'),
    principalTexto: !bar.querySelector('[data-vb="primary"].is-compact'),
    selInline: [...bar.querySelectorAll('.bt-viewbar__end [data-vb^="sel:"]')].filter(visible).length,
    selTexto: !bar.querySelector('.bt-viewbar__end [data-vb^="sel:"].is-compact'),
    noMenu: ['colunas', 'densidade', 'auditoria'].filter((k) => fixed[k] === null),
    lupa: fixed.lupa !== null,
    // >= 1.27: o ⋮ não tem selo (a seleção aparece como "N selecionados" na superfície); selo aqui é regressão.
    selo: bar.querySelector('.bt-viewbar__more .bt-viewbar__badge')?.textContent ?? '',
    rodape: Boolean(document.querySelector('.bt-selectionbar')),
  }
  const search = bar.querySelector('.bt-viewbar__search')
  const zone = bar.querySelector('.bt-viewbar__zone')
  const zoneKids = [...zone.children].filter(visible)
  const zoneUsed = zoneKids.reduce((a, el) => a + el.getBoundingClientRect().width, 0) + Math.max(0, zoneKids.length - 1) * parseFloat(getComputedStyle(zone).columnGap || '0')
  // >= 1.27: o secondary/ghost/só ícone de `primary` entra na superfície como `tools`; o principal fica fora.
  const atualizar = bar.querySelector('[data-vb="tools"] button[aria-label="Atualizar"], [data-vb="primary"] button[aria-label="Atualizar"]')
  state.atualizar = Boolean(atualizar && visible(atualizar))
  state.buscaW = search && visible(search) ? Math.round(search.getBoundingClientRect().width) : 0
  state.zonaW = Math.round(zone.getBoundingClientRect().width)
  state.sobra = Math.round(zone.getBoundingClientRect().width - zoneUsed)
  state.selLabels = [...bar.querySelectorAll('.bt-viewbar__end [data-vb^="sel:"]')].filter(visible).map((el) => el.textContent.trim() + (el.classList.contains('is-compact') ? '(ícone)' : ''))
  // >= 1.27.1: nada de vão dentro da superfície nem fio solto. Itens em ordem (a zona aberta nos filhos visíveis); entre
  // vizinhos, e entre as bordas internas da superfície e as pontas, só o gap do DS (2 px). Fio na ponta, fio ao lado de
  // outro fio ou de um vão conta como fio solto.
  const surface = bar.querySelector('.bt-viewbar__surface')
  const gaps = []
  if (surface) {
    const items = [...surface.children].flatMap((el) => (el.classList.contains('bt-viewbar__zone') ? [...el.children] : [el])).filter(visible)
    const sr = surface.getBoundingClientRect(), cs = getComputedStyle(surface)
    const innerL = sr.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), innerR = sr.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight)
    const isSep = (el) => el.classList.contains('bt-viewbar__sep')
    const label = (el) => (isSep(el) ? 'fio' : name(el))
    const edges = [innerL, ...items.flatMap((el) => { const r = el.getBoundingClientRect(); return [r.left, r.right] }), innerR]
    for (let i = 0; i <= items.length; i += 1) {
      const gap = edges[2 * i + 1] - edges[2 * i]
      const prev = items[i - 1], next = items[i]
      if (gap > 4) gaps.push(`vão ${Math.round(gap)}px ${prev ? label(prev) : 'início'}→${next ? label(next) : 'fim'}`)
    }
    items.forEach((el, i) => { if (isSep(el) && (i === 0 || i === items.length - 1 || isSep(items[i - 1]) || isSep(items[i + 1]))) gaps.push(`fio solto (posição ${i})`) })
  }
  // Rodapé do celular (>= 1.27.1): rótulo visível inteiro dentro do botão; o que não cabe vira só ícone (is-compact).
  const footerCut = []
  const footer = document.querySelector('.bt-selectionbar')
  if (footer) {
    const vw = document.documentElement.clientWidth
    for (const el of footer.querySelectorAll('.bt-button__label, .bt-selection__label')) {
      if (!visible(el) || el.closest('.bt-selectionbar__measure')) continue
      const r = el.getBoundingClientRect(), box = (el.closest('.bt-button') || el.parentElement).getBoundingClientRect()
      if (el.scrollWidth > el.clientWidth + 0.5 || r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.right > vw + 0.5) footerCut.push(el.textContent.trim())
    }
    for (const b of footer.querySelectorAll('.bt-selectionbar__actions .bt-button')) {
      if (b.closest('.bt-selectionbar__measure')) continue
      const r = b.getBoundingClientRect()
      if (r.left < -0.5 || r.right > vw + 0.5) footerCut.push(`botão fora da tela: ${name(b)}`)
      if (b.classList.contains('is-compact') && !(b.getAttribute('aria-label') || b.querySelector('.bt-button__label')?.textContent.trim())) footerCut.push('rodapé só ícone sem nome')
    }
    state.rodapeBotoes = [...footer.querySelectorAll('.bt-selectionbar__actions .bt-button')].filter((b) => !b.closest('.bt-selectionbar__measure')).map((b) => (b.textContent.trim() || name(b)) + (b.classList.contains('is-compact') ? '(ícone)' : ''))
  }
  return { barW: Math.round(br.width), barH: Math.round(br.height), oneLine, overlaps, outside, cut, gaps, footerCut, fixed, state, pageScroll: document.documentElement.scrollWidth > window.innerWidth }
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
      if (m.state.rodape) await page.locator('.bt-selectionbar').screenshot({ path: path.join(out, `rodape-${width}-${count}.png`) })
      if (process.env.TELA) await page.screenshot({ path: path.join(out, `geral-${width}-${count}.png`) })
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
  console.log('| Viewport | Sel. | Barra (px) | Altura | 1 linha | Sobreposição | Fora da barra | Texto cortado | Vão/fio solto | Rodapé cortado | Fixos parados | Estado |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const r of rows) {
    const s = r.state
    const estado = [s.visao, s.texto ? 'fixos c/ texto' : 'fixos só ícone', s.principalTexto ? 'principal c/ texto' : 'principal só ícone', r.count ? (s.rodape ? 'seleção no rodapé' : `seleção ${s.selInline} inline${s.selTexto ? ' c/ texto' : ' só ícone'}`) : null, s.noMenu.length ? `no ⋮: ${s.noMenu.join(', ')}` : null, s.lupa ? 'lupa' : 'busca', s.selo ? `SELO NO ⋮ (${s.selo})` : null, r.count ? `"${s.contador}"` : null, s.atualizar ? 'Atualizar visível' : 'SEM ATUALIZAR', `busca ${s.buscaW}px`, `sobra ${s.sobra}px`, s.selLabels.length ? `[${s.selLabels.join(', ')}]` : null, s.rodapeBotoes ? `rodapé [${s.rodapeBotoes.join(', ')}]` : null].filter(Boolean).join('; ')
    console.log(`| ${r.width} | ${r.count} | ${r.barW} | ${r.barH} | ${r.oneLine ? 'sim' : 'NÃO'} | ${r.overlaps.length ? r.overlaps.join(' ') : 'nenhuma'} | ${r.outside.length ? r.outside.join(' ') : '—'} | ${r.cut.length ? r.cut.join(', ') : 'nenhum'} | ${r.gaps.length ? r.gaps.join(', ') : 'nenhum'} | ${(r.footerCut.length ? r.footerCut.join(', ') : (r.state.rodape ? 'nenhum' : '—'))} | ${r.fixosParados ? 'sim' : 'NÃO'} | ${estado}${r.pageScroll ? ' (ROLAGEM HORIZONTAL)' : ''} |`)
  }
  console.log(`Erros de console: ${errors.length ? errors.join(' | ') : 'nenhum'}`)
})().catch((e) => { console.error(e); process.exit(1) })
