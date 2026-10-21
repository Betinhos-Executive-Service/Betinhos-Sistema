// Fluxo de #/equipamentos no modo mock (Chromium headless), desktop 1366×800 e celular 375×800.
// Uso (com `pnpm dev` rodando em apps/shell):
//   node .claude/skills/verificar-equipamentos/fluxo-mock.cjs <pasta-dos-prints> [desktop|mobile|ambos] [http://localhost:36472/]
// Gera <pasta>/<viewport>-NN-<passo>.png e imprime uma linha por passo (✅/❌) e os erros de console.
// Na VM cloud o Playwright e o Chromium já vêm instalados; fora dela ajuste PLAYWRIGHT_MODULE e CHROMIUM.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright')
const OUT = process.argv[2] || '.'
const QUAL = process.argv[3] || 'ambos'
const BASE = process.argv[4] || 'http://localhost:36472/'
const VIEWPORTS = { desktop: { width: 1366, height: 800 }, mobile: { width: 375, height: 800 } }
const ITEM = 'Webcam sala de reunião'

async function run(nome) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
  const page = await browser.newPage({ viewport: VIEWPORTS[nome] })
  const mobile = nome === 'mobile'
  const erros = []
  page.on('pageerror', (e) => erros.push(`pageerror: ${e}`))
  page.on('console', (m) => { if (m.type() === 'error') erros.push(`console: ${m.text()}`) })
  const passos = []
  let n = 0
  const shot = async (rotulo) => { n += 1; const f = `${OUT}/${nome}-${String(n).padStart(2, '0')}-${rotulo}.png`; await page.screenshot({ path: f }); return f }
  const passo = async (rotulo, fn) => {
    try { const obs = await fn(); passos.push({ rotulo, ok: true, obs: obs || '' }) }
    catch (e) { passos.push({ rotulo, ok: false, obs: String(e.message || e).split('\n')[0] }); await page.keyboard.press('Escape').catch(() => {}) }
  }
  const drawer = (titulo) => page.getByRole('dialog', { name: titulo })
  const toast = (re) => page.getByText(re).first().waitFor({ timeout: 5000 })
  // Select do DS: abre pelo combobox; com busca, digita no campo do painel; clica na opção.
  async function escolher(dlg, rotulo, opcao, buscar = true) {
    await dlg.getByRole('combobox', { name: rotulo }).click()
    if (buscar) await page.getByRole('textbox', { name: 'Pesquisar opção' }).fill(opcao.slice(0, 5))
    await page.getByRole('option', { name: opcao, exact: true }).click()
  }
  const comboTexto = (dlg, rotulo) => dlg.getByRole('combobox', { name: rotulo }).textContent()
  const abrirItem = async (descricao) => {
    await page.locator(mobile ? '.eq-card__open' : '.eq-open', { hasText: descricao }).first().click()
    await drawer(descricao).waitFor()
    return drawer(descricao)
  }
  const linha = (descricao) => page.locator(mobile ? '.eq-card' : '.bt-table__row', { hasText: descricao }).first()
  async function salvar(dlg, descricao) {
    await dlg.getByRole('button', { name: 'Salvar alterações' }).click()
    await toast(`Equipamento ${descricao} salvo.`)
    await dlg.waitFor({ state: 'hidden' })
  }
  async function visao(nomeVisao) {
    await page.locator('.bt-viewbar__trigger').click()
    await page.locator('.bt-menu__item', { hasText: nomeVisao }).first().click()
    await page.locator('.bt-viewbar__name', { hasText: nomeVisao }).waitFor()
  }

  await passo('Lista carrega em mock + versão do build', async () => {
    await page.goto(`${BASE}#/equipamentos`)
    await page.getByText('Notebook do Financeiro').first().waitFor({ timeout: 30000 })
    const versao = (await page.locator('.bt-build-badge').first().textContent({ timeout: 5000 })).trim()
    if (!/v?\d+\.\d+\.\d+/.test(versao)) throw new Error(`versão não encontrada: "${versao}"`)
    const baixadoVisivel = await page.getByText('Impressora antiga').count()
    if (baixadoVisivel) throw new Error('Visão padrão mostra o item Baixado')
    const largura = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    const f = await shot('lista')
    return `versão "${versao}"; Impressora antiga (baixado) fora da Visão padrão; rolagem horizontal da página: ${largura}px; ${f}`
  })

  await passo('Cadastrar item (tipo Outro)', async () => {
    await page.getByRole('button', { name: 'Novo equipamento' }).click()
    const dlg = drawer('Novo equipamento')
    await dlg.waitFor()
    await dlg.locator('[name="descricao"]').fill(ITEM)
    await escolher(dlg, /^Tipo/, 'Outro')
    const status = await comboTexto(dlg, /^Status/)
    await shot('novo')
    await dlg.getByRole('button', { name: 'Cadastrar equipamento' }).click()
    await toast(`Equipamento ${ITEM} cadastrado.`)
    await dlg.waitFor({ state: 'hidden' })
    await linha(ITEM).waitFor()
    const f = await shot('cadastrado')
    return `status inicial "${status}"; toast de cadastro; item na lista; ${f}`
  })

  await passo('Atribuir responsável → status Em uso', async () => {
    const dlg = await abrirItem(ITEM)
    await escolher(dlg, 'Responsável', 'Bruna Ficticia Lima')
    const status = await comboTexto(dlg, /^Status/)
    if (status !== 'Em uso') throw new Error(`status ficou "${status}"`)
    const f = await shot('responsavel')
    await salvar(dlg, ITEM)
    const txt = await linha(ITEM).textContent()
    if (!/Bruna Ficticia Lima/.test(txt) || !/Em uso/.test(txt)) throw new Error(`linha: ${txt}`)
    return `sugestão Disponível→Em uso aplicada; linha com Bruna e Em uso; ${f}`
  })

  await passo('Trocar responsável', async () => {
    const dlg = await abrirItem(ITEM)
    await escolher(dlg, 'Responsável', 'Diego Exemplo Rocha')
    await salvar(dlg, ITEM)
    const txt = await linha(ITEM).textContent()
    if (!/Diego Exemplo Rocha/.test(txt) || /Bruna/.test(txt)) throw new Error(`linha: ${txt}`)
    return 'linha com Diego Exemplo Rocha'
  })

  await passo('Marcar Baixado → responsável some', async () => {
    const dlg = await abrirItem(ITEM)
    await escolher(dlg, /^Status/, 'Baixado', false)
    const resp = dlg.getByRole('combobox', { name: 'Responsável' })
    const texto = (await resp.textContent()).trim()
    const desabilitado = await resp.isDisabled()
    if (texto !== 'Sem responsável' || !desabilitado) throw new Error(`responsável "${texto}", desabilitado=${desabilitado}`)
    const f = await shot('baixado')
    await salvar(dlg, ITEM)
    await page.waitForTimeout(300)
    const naPadrao = await linha(ITEM).count()
    if (naPadrao) throw new Error('item baixado continua na Visão padrão')
    await visao('Baixados')
    const txt = await linha(ITEM).textContent()
    if (!/Sem responsável/.test(txt) || !/Baixado/.test(txt)) throw new Error(`na visão Baixados: ${txt}`)
    return `responsável limpo e desabilitado; some da Visão padrão; na visão Baixados com "Sem responsável"; ${f}`
  })

  await passo('Visão "Sem responsável"', async () => {
    await visao('Sem responsável')
    await linha('Notebook reserva').waitFor()
    const nomes = await page.locator(mobile ? '.eq-card__name' : '.eq-open strong').allTextContents()
    const proibidos = nomes.filter((x) => ['Notebook do Financeiro', 'Impressora antiga', ITEM, 'Maquininha Carlos'].includes(x))
    if (proibidos.length) throw new Error(`não devia listar: ${proibidos.join(', ')}`)
    const f = await shot('sem-responsavel')
    return `itens: ${nomes.join(', ')}; ${f}`
  })

  await passo('Tipos: adicionar, renomear, inativar', async () => {
    await page.getByRole('button', { name: 'Tipos', exact: true }).click()
    const dlg = drawer('Tipos de equipamento')
    await dlg.waitFor()
    await dlg.locator('[name="novoTipo"]').fill('Webcam')
    await dlg.getByRole('button', { name: 'Adicionar' }).click()
    await toast('Tipo Webcam adicionado.')
    await dlg.getByRole('button', { name: 'Renomear tipo Webcam' }).click()
    await dlg.locator('[name="renomearTipo"]').fill('Câmera')
    await dlg.getByRole('button', { name: 'Salvar nome' }).click()
    await toast('Tipo Câmera salvo.')
    await dlg.getByRole('button', { name: 'Inativar tipo Câmera' }).click()
    await toast('Tipo Câmera inativado.')
    const item = dlg.locator('.eq-tipos__item', { hasText: 'Câmera' })
    if (!/Inativo/.test(await item.textContent())) throw new Error('Câmera sem selo Inativo')
    await item.scrollIntoViewIfNeeded()
    const f = await shot('tipos')
    await dlg.getByRole('button', { name: 'Fechar painel' }).click()
    await dlg.waitFor({ state: 'hidden' })
    return `Webcam → Câmera → inativo (selo); ${f}`
  })

  await passo('"Descartar alterações?" com alteração', async () => {
    await page.getByRole('button', { name: 'Novo equipamento' }).click()
    const dlg = drawer('Novo equipamento')
    await dlg.waitFor()
    await dlg.locator('[name="descricao"]').fill('Rascunho')
    await dlg.getByRole('button', { name: 'Fechar painel' }).click()
    const conf = page.getByRole('dialog', { name: 'Descartar alterações?' })
    await conf.waitFor()
    const f = await shot('descartar')
    await conf.getByRole('button', { name: 'Descartar' }).click()
    await dlg.waitFor({ state: 'hidden' })
    return `diálogo aparece; Descartar fecha; ${f}`
  })

  await passo(mobile ? 'Esc fecha o drawer sem alteração (overlay não aparece em 375 px)' : 'Overlay fecha o drawer sem alteração', async () => {
    await visao('Todos, inclusive baixados')
    const dlg = await abrirItem('Notebook reserva')
    if (mobile) {
      const w = await dlg.evaluate((el) => el.getBoundingClientRect().width)
      await page.keyboard.press('Escape')
      await dlg.waitFor({ state: 'hidden' })
      return `drawer ocupa ${Math.round(w)}px (100vw, sem fundo clicável); Esc fecha sem perguntar`
    }
    await page.mouse.click(40, 400)
    await dlg.waitFor({ state: 'hidden', timeout: 3000 })
    const conf = await page.getByRole('dialog', { name: 'Descartar alterações?' }).count()
    if (conf) throw new Error('pediu confirmação sem alteração')
    return 'clique no fundo fecha sem confirmação'
  })

  await passo('Ficha de Carlos Alberto Teste → aba Equipamentos', async () => {
    await page.goto(`${BASE}#/funcionarios`)
    await page.getByText('Carlos Alberto Teste').first().waitFor({ timeout: 20000 })
    await page.getByText('Carlos Alberto Teste').first().click()
    const aba = page.getByRole('tab', { name: 'Equipamentos' })
    await aba.waitFor({ timeout: 10000 })
    await aba.click()
    await page.getByRole('link', { name: 'Abrir equipamento Maquininha Carlos' }).waitFor({ timeout: 10000 })
    const f = await shot('ficha-aba')
    return `aba lista Maquininha Carlos; ${f}`
  })

  await passo('Clicar no item abre #/equipamentos?ver=… com o drawer', async () => {
    await page.getByRole('link', { name: 'Abrir equipamento Maquininha Carlos' }).click()
    await drawer('Maquininha Carlos').waitFor({ timeout: 15000 })
    const url = page.url()
    if (!/#\/equipamentos\?ver=eeeeeeee-0000-4000-8000-000000000005/i.test(url)) throw new Error(`URL: ${url}`)
    const f = await shot('ver')
    return `${url.replace(BASE, '')}; ${f}`
  })

  await passo('Console sem erros', async () => {
    if (erros.length) throw new Error(erros.join(' | '))
    return 'nenhum console.error nem pageerror'
  })

  await browser.close()
  return { nome, passos, erros }
}

;(async () => {
  const quais = QUAL === 'ambos' ? ['desktop', 'mobile'] : [QUAL]
  const resultados = []
  for (const q of quais) resultados.push(await run(q))
  for (const r of resultados) {
    console.log(`\n## ${r.nome} (${VIEWPORTS[r.nome].width}×${VIEWPORTS[r.nome].height})`)
    for (const p of r.passos) console.log(`${p.ok ? '✅' : '❌'} ${p.rotulo} — ${p.obs}`)
  }
  console.log(`\nJSON:${JSON.stringify(resultados)}`)
  process.exit(resultados.some((r) => r.passos.some((p) => !p.ok)) ? 1 : 0)
})()
