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
  // Clipboard liberado para o Ctrl+V real (imagem e texto) nos passos de fotos.
  const context = await browser.newContext({ viewport: VIEWPORTS[nome], permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await context.newPage()
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
    // Todas as colunas à vista em 1366 px: a tabela não pode rolar por dentro (a miniatura da capa divide a coluna Equipamento).
    const tabela = mobile ? 0 : await page.evaluate(() => { const el = document.querySelector('.eq-table .bt-table__scroll'); return el ? el.scrollWidth - el.clientWidth : -1 })
    if (tabela > 1) throw new Error(`tabela rola ${tabela}px na horizontal`)
    const f = await shot('lista')
    return `versão "${versao}"; Impressora antiga (baixado) fora da Visão padrão; rolagem horizontal da página: ${largura}px${mobile ? '' : `, da tabela: ${tabela}px`}; ${f}`
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

  // ---- Fotos (seção Fotos do drawer; mock em memória enquanto a página não recarrega) ----
  // Imagens reais (PNG/JPEG) tiradas da própria tela; PDF e PNG de 6 MB só para a validação.
  const img = {}
  const fotos = (dlg) => dlg.locator('.eq-foto')
  const nomesFotos = (dlg) => dlg.locator('.eq-foto__nome').allTextContents()
  const capaAtual = (dlg) => dlg.locator('.eq-foto--capa .eq-foto__nome').allTextContents()
  const thumbLinha = (descricao) => linha(descricao).locator('.eq-thumb img')
  /** DataTransfer com arquivos montados na página: { nome, tipo, b64 } ou { nome, tipo, tamanho } (bytes zerados). */
  const transferencia = (lista) => page.evaluateHandle((lista) => {
    const dt = new DataTransfer()
    for (const a of lista) {
      const bytes = a.b64 ? Uint8Array.from(atob(a.b64), (c) => c.charCodeAt(0)) : new Uint8Array(a.tamanho)
      dt.items.add(new File([bytes], a.nome, { type: a.tipo }))
    }
    return dt
  }, lista)
  const soltar = async (dlg, lista) => dlg.locator('.eq-fotos').dispatchEvent('drop', { dataTransfer: await transferencia(lista) })
  /** Ctrl+V de verdade com a imagem no clipboard; sem permissão de clipboard, cai num ClipboardEvent sintético. */
  async function colarImagem(b64) {
    const real = await page.evaluate(async (b64) => {
      try {
        const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' })
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        return true
      } catch { return false }
    }, b64)
    if (real) { await page.keyboard.press('Control+V'); return 'Ctrl+V real' }
    await page.evaluate((b64) => {
      const dt = new DataTransfer()
      dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'image.png', { type: 'image/png' }))
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, b64)
    return 'ClipboardEvent sintético'
  }
  const fecharDrawer = async (dlg) => { await page.keyboard.press('Escape'); await dlg.waitFor({ state: 'hidden' }) }
  const verSecao = (dlg) => dlg.locator('.eq-fotos').scrollIntoViewIfNeeded()

  await passo('Fotos: capa da lista baixada do SharePoint (mock) só na linha visível, como blob URL', async () => {
    await thumbLinha('Notebook do Financeiro').waitFor({ timeout: 10000 })
    const src = await thumbLinha('Notebook do Financeiro').getAttribute('src')
    if (!/^blob:/.test(src)) throw new Error(`capa não veio como blob: ${src.slice(0, 30)}`)
    const quebradas = await page.locator('.eq-thumb img').evaluateAll((imgs) => imgs.filter((i) => i.complete && i.naturalWidth === 0).length)
    if (quebradas) throw new Error(`${quebradas} miniatura(s) quebrada(s)`)
    return `Notebook do Financeiro com ${src.slice(0, 20)}…; nenhuma imagem quebrada`
  })

  await passo('Fotos: Ctrl+V de imagem → miniatura na seção, vira capa e aparece na lista', async () => {
    img.png = (await page.screenshot({ clip: { x: 0, y: 0, width: 320, height: 240 } })).toString('base64')
    img.png2 = (await page.screenshot({ clip: { x: 0, y: 200, width: 300, height: 300 } })).toString('base64')
    img.jpg = (await page.screenshot({ type: 'jpeg', clip: { x: 20, y: 100, width: 360, height: 240 } })).toString('base64')
    if (await thumbLinha('Notebook reserva').count()) throw new Error('Notebook reserva já tinha miniatura')
    const icone = await linha('Notebook reserva').locator('.eq-thumb svg').count()
    const dlg = await abrirItem('Notebook reserva')
    await dlg.getByText('Nenhuma foto ainda', { exact: false }).waitFor()
    const como = await colarImagem(img.png)
    await fotos(dlg).first().waitFor({ timeout: 10000 })
    const capa = await capaAtual(dlg)
    if (capa.length !== 1) throw new Error(`capas: ${capa.join(', ')}`)
    await verSecao(dlg)
    const f = await shot('fotos-colada')
    await fecharDrawer(dlg)
    await thumbLinha('Notebook reserva').waitFor()
    const f2 = await shot('lista-com-capa')
    return `${como}; foto "${capa[0]}" é capa; lista trocou ícone do tipo (${icone ? 'svg' : 'sem svg'}) pela miniatura; ${f}; ${f2}`
  })

  await passo('Fotos: colar texto num campo vai para o campo e não cria foto', async () => {
    const dlg = await abrirItem('Notebook reserva')
    await fotos(dlg).first().waitFor()
    const antes = await fotos(dlg).count()
    const okClip = await page.evaluate(async () => { try { await navigator.clipboard.writeText('Notebook da recepção'); return true } catch { return false } })
    if (!okClip) throw new Error('clipboard indisponível para o texto')
    const campo = dlg.locator('[name="marcaModelo"]')
    await campo.click()
    await campo.fill('')
    await page.keyboard.press('Control+V')
    await page.waitForTimeout(800)
    const valor = await campo.inputValue()
    const depois = await fotos(dlg).count()
    if (valor !== 'Notebook da recepção') throw new Error(`campo ficou "${valor}"`)
    if (depois !== antes) throw new Error(`fotos ${antes} → ${depois}`)
    await dlg.getByRole('button', { name: 'Fechar painel' }).click()
    const conf = page.getByRole('dialog', { name: 'Descartar alterações?' })
    await conf.waitFor()
    await conf.getByRole('button', { name: 'Descartar' }).click()
    await dlg.waitFor({ state: 'hidden' })
    return `campo Marca/modelo = "${valor}"; fotos continuam ${depois}`
  })

  await passo('Fotos: arrastar 3 imagens → enviadas uma a uma, na ordem, com progresso', async () => {
    const dlg = await abrirItem('Monitor 24" recepção')
    await dlg.getByText('Nenhuma foto ainda', { exact: false }).waitFor()
    await soltar(dlg, [{ nome: '1-frente.png', tipo: 'image/png', b64: img.png }, { nome: '2-lado.jpg', tipo: 'image/jpeg', b64: img.jpg }, { nome: '3-etiqueta.png', tipo: 'image/png', b64: img.png2 }])
    const barra = dlg.getByRole('progressbar')
    await barra.waitFor({ timeout: 5000 })
    const rotulo = await barra.getAttribute('aria-label')
    await verSecao(dlg)
    const f = await shot('fotos-progresso')
    await dlg.locator('.eq-foto').nth(2).waitFor({ timeout: 15000 })
    await barra.waitFor({ state: 'hidden', timeout: 10000 })
    const nomes = await nomesFotos(dlg)
    if (nomes.join('|') !== '1-frente.png|2-lado.jpg|3-etiqueta.png') throw new Error(`ordem: ${nomes.join(', ')}`)
    const capa = await capaAtual(dlg)
    if (capa.join('|') !== '1-frente.png') throw new Error(`capa: ${capa.join(', ')}`)
    await verSecao(dlg)
    const f2 = await shot('fotos-3')
    return `progresso "${rotulo}"; ordem ${nomes.join(', ')}; capa ${capa[0]}; ${f}; ${f2}`
  })

  await passo('Fotos: PDF e imagem acima de 5 MB → mensagem e nada enviado', async () => {
    const dlg = drawer('Monitor 24" recepção')
    await soltar(dlg, [{ nome: 'nota-fiscal.pdf', tipo: 'application/pdf', tamanho: 2048 }, { nome: 'grande.png', tipo: 'image/png', tamanho: 6 * 1024 * 1024 }])
    const alerta = dlg.locator('.bt-alert', { hasText: 'não foram enviadas' })
    await alerta.waitFor({ timeout: 5000 })
    const txt = (await alerta.textContent()).replace(/\s+/g, ' ')
    if (!/nota-fiscal\.pdf: Use PNG, JPG, GIF ou BMP\./.test(txt) || !/grande\.png: A imagem deve ter até 5 MB\./.test(txt)) throw new Error(`alerta: ${txt}`)
    await page.waitForTimeout(700)
    const n = await fotos(dlg).count()
    if (n !== 3) throw new Error(`fotos: ${n}`)
    if (await dlg.getByRole('progressbar').count()) throw new Error('começou envio')
    await alerta.scrollIntoViewIfNeeded()
    const f = await shot('fotos-invalidas')
    return `alerta: "${txt.trim()}"; continuam 3 fotos; ${f}`
  })

  await passo('Fotos: "Definir como capa" na 2ª → só ela é capa e a lista troca a miniatura', async () => {
    const dlg = drawer('Monitor 24" recepção')
    const antes = await thumbLinha('Monitor 24" recepção').getAttribute('src').catch(() => '')
    await dlg.getByRole('button', { name: 'Definir 2-lado.jpg como capa' }).click()
    await dlg.locator('.eq-foto--capa', { hasText: '2-lado.jpg' }).waitFor()
    const capa = await capaAtual(dlg)
    if (capa.join('|') !== '2-lado.jpg') throw new Error(`capas: ${capa.join(', ')}`)
    await verSecao(dlg)
    const f = await shot('fotos-capa-2')
    await fecharDrawer(dlg)
    const src = await thumbLinha('Monitor 24" recepção').getAttribute('src')
    if (!/^blob:/.test(src) || src === antes) throw new Error(`miniatura da lista não trocou: ${antes} → ${src}`)
    return `só 2-lado.jpg marcada; lista trocou a miniatura (${antes} → ${src}); ${f}`
  })

  await passo('Fotos: excluir a capa → a mais antiga restante vira capa; excluir todas → ícone do tipo', async () => {
    const dlg = await abrirItem('Monitor 24" recepção')
    await fotos(dlg).nth(2).waitFor()
    await dlg.getByRole('button', { name: 'Excluir 2-lado.jpg' }).click()
    const conf = page.getByRole('dialog', { name: 'Excluir foto?' })
    await conf.waitFor()
    const aviso = (await conf.textContent()).replace(/\s+/g, ' ')
    const f = await shot('fotos-excluir')
    await conf.getByRole('button', { name: 'Excluir' }).click()
    await dlg.locator('.eq-foto--capa', { hasText: '1-frente.png' }).waitFor()
    const restantes = await nomesFotos(dlg)
    for (const nomeFoto of restantes) {
      await dlg.getByRole('button', { name: `Excluir ${nomeFoto}` }).click()
      await page.getByRole('dialog', { name: 'Excluir foto?' }).getByRole('button', { name: 'Excluir' }).click()
      await dlg.locator('.eq-foto', { hasText: nomeFoto }).waitFor({ state: 'hidden' })
    }
    await dlg.getByText('Nenhuma foto ainda', { exact: false }).waitFor()
    await fecharDrawer(dlg)
    await page.waitForTimeout(200)
    if (await thumbLinha('Monitor 24" recepção').count()) throw new Error('lista ainda com miniatura')
    if (!(await linha('Monitor 24" recepção').locator('.eq-thumb svg').count())) throw new Error('sem ícone do tipo')
    const f2 = await shot('lista-sem-capa')
    return `confirmação "${aviso.trim()}"; 1-frente.png promovida; sem fotos a lista volta ao ícone; ${f}; ${f2}`
  })

  await passo('Fotos: clicar na miniatura abre a foto grande; Esc fecha só a foto', async () => {
    const dlg = await abrirItem('Notebook do Financeiro')
    await fotos(dlg).nth(1).waitFor()
    await dlg.getByRole('button', { name: 'Ver notebook-etiqueta.jpg' }).click()
    const viewer = page.getByRole('dialog', { name: 'notebook-etiqueta.jpg' })
    await viewer.waitFor()
    const caixa = await viewer.locator('img').boundingBox()
    const f = await shot('foto-grande')
    await page.keyboard.press('Escape')
    await viewer.waitFor({ state: 'hidden' })
    if (!(await dlg.isVisible())) throw new Error('Esc fechou o drawer junto')
    await verSecao(dlg)
    const f2 = await shot('fotos-secao')
    await fecharDrawer(dlg)
    return `foto ${Math.round(caixa.width)}×${Math.round(caixa.height)}px; drawer continua aberto depois do Esc; ${f}; ${f2}`
  })

  await passo('Fotos: item novo → seção desabilitada com o aviso', async () => {
    await page.getByRole('button', { name: 'Novo equipamento' }).click()
    const dlg = drawer('Novo equipamento')
    await dlg.waitFor()
    const secao = dlg.locator('.eq-fotos')
    await secao.scrollIntoViewIfNeeded()
    const aviso = await secao.getByText('Salve o item para adicionar fotos.').count()
    const desabilitado = await secao.getByRole('button', { name: 'Adicionar fotos' }).isDisabled()
    if (!aviso || !desabilitado) throw new Error(`aviso=${aviso} desabilitado=${desabilitado}`)
    const larguras = await page.evaluate(() => ({ pagina: document.documentElement.scrollWidth - window.innerWidth, corpo: [...document.querySelectorAll('.bt-drawer__body')].map((b) => b.scrollWidth - b.clientWidth) }))
    const f = await shot('fotos-item-novo')
    await fecharDrawer(dlg)
    return `aviso visível; Adicionar fotos desabilitado; rolagem horizontal página ${larguras.pagina}px, corpo do drawer ${larguras.corpo.join('/')}px; ${f}`
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
