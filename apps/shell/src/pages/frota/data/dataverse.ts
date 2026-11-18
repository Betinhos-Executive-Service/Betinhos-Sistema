import { CAMPO, lerMulti } from '../domain/manutencaoCatalogo'
import { addMonths, todaySP, type DateBehavior } from './dates'
import { chamarCustomApi } from './customApi'
import { criarArquivosXrm, criarComandosXrm, type DepsXrm } from './manutencaoDataverse'
import { cleanId, GUID, guid, mapBaseline, mapColisao, mapDespesaCombustivel, mapInfracao, mapItemPlano, mapManutencao, mapMulta, mapPosse, mapParcelaFolha, mapParcelaTermo, mapTelemetriaKm, mapTermoMulta, mapVeiculo, resumirTermos, EXPAND_PARCELA_FOLHA, SELECT, SELECT_PARCELA, SELECT_PARCELA_FOLHA, SELECT_RESUMO_TERMO, SELECT_TERMO, SELECT_VEICULOS_SEM_HODOMETRO } from './mappers'
import { BASELINE, CATEGORIA_DESPESA_TABLE, ENTITY_SET, FORMA_PAGAMENTO, ITEM_PLANO, KIND_TABLE, STATUS_FIELD, TABLE, TERMO_TABLE } from './schema'
import type { Acordo } from '../domain/termoMulta'
import { base64ToBlob, callSpFlow, escolherPrincipal, FOTO_MAX_BYTES, fileToBase64, nomeFoto, pastaFotoVeiculo, SP_VARS, toArquivo, type SpKey } from './sharepoint'
import type { DadosPasso, Passo, Situacao } from '../domain/multaEtapas'
import { EMPTY_DATA, type ArquivoMulta, type ColunaArquivoMulta, type DataSource, type ItemPlanoInput, type LoadResult } from './source'
import type { DespesaCombustivel, Dossie, FrotaData, Kind, ResultadoLancamento, TableKey, TelemetriaKm } from './types'
import { ApiError, errorMessage, type XrmHost, type XrmWebApi } from './xrm'

type Row = Record<string, unknown>
type Behaviors = Record<string, DateBehavior>

const MES = /^\d{4}-(0[1-9]|1[0-2])$/

export function getDataverseEnvironmentLabel(clientUrl: string) {
  const hostname = new URL(clientUrl).hostname.toLowerCase()
  if (hostname === 'org23b93544.crm2.dynamics.com') return 'DEV'
  if (hostname === 'orgf261ae8e.crm2.dynamics.com') return 'PROD'
  return 'Dataverse'
}

const ORDER: Record<TableKey, string> = {
  veiculos: 'cr40f_placa asc',
  manutencoes: 'createdon desc',
  multas: 'createdon desc',
  infracoes: 'cr40f_codigodainfracao asc',
  colisoes: 'createdon desc',
  posses: 'new_iniciodaposse desc',
  planoPreventivo: 'cr40f_name asc',
  baselines: 'createdon desc',
  despesasCombustivel: 'cr40f_datagasto desc',
  telemetriaKm: 'new_data desc',
}

const PAGE_SIZE = 5000

export function createXrmSource(xrm: XrmHost): DataSource {
  const api = xrm.WebApi as XrmWebApi
  const clientUrl = xrm.Utility?.getGlobalContext().getClientUrl().replace(/\/+$/, '') ?? location.origin
  const apiUrl = `${clientUrl}/api/data/v9.2`
  const behaviorCache = new Map<string, Promise<Behaviors>>()
  /** Chama uma Custom API não vinculada; erro do servidor sai com a mensagem do Dataverse. */
  const customApi = (nome: string, body: Record<string, unknown>, falha: string) => chamarCustomApi(apiUrl, nome, body, falha)

  /** Quantas parcelas cada multa (ou termo) tem no total, para o "x/y". Uma consulta por lote de 50 origens, em paralelo. */
  async function totaisPorOrigem(rows: Row[]) {
    const totais = new Map<string, number>()
    const multas = [...new Set(rows.map((r) => r._new_multa_value).filter(Boolean).map(String))]
    const termos = [...new Set(rows.filter((r) => !r._new_multa_value).map((r) => r._new_termo_value).filter(Boolean).map(String))]
    const consultas = ([['_new_multa_value', multas], ['_new_termo_value', termos]] as const).flatMap(([campo, ids]) =>
      Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => {
        const lote = ids.slice(i * 50, i * 50 + 50).map((id) => `${campo} eq ${guid(id)}`).join(' or ')
        return api.retrieveMultipleRecords('new_parcelamultafolha', `?$select=${campo}&$filter=${lote}`).then((res) => ({ campo, linhas: res.entities }))
      }))
    for (const { campo, linhas } of await Promise.all(consultas))
      for (const r of linhas) { const k = cleanId(r[campo]); totais.set(k, (totais.get(k) ?? 0) + 1) }
    return totais
  }

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${apiUrl}/${path}`, { credentials: 'same-origin', headers: { Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' } })
    if (!response.ok) throw new Error(`Metadata indisponível (${response.status}) em ${path.split('?')[0]}`)
    return response.json() as Promise<T>
  }

  /** Comportamento das colunas de data lido da metadata real, nunca chutado. */
  function loadBehaviors(table: string) {
    let cached = behaviorCache.get(table)
    if (!cached) {
      cached = getJson<{ value: { LogicalName: string; DateTimeBehavior?: { Value: DateBehavior } }[] }>(`EntityDefinitions(LogicalName='${table}')/Attributes/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata?$select=LogicalName,DateTimeBehavior`)
        .then((result) => Object.fromEntries(result.value.map((item) => [item.LogicalName, item.DateTimeBehavior?.Value ?? 'UserLocal'])))
      cached.catch(() => behaviorCache.delete(table))
      behaviorCache.set(table, cached)
    }
    return cached
  }

  async function retrieveAll(key: TableKey, filter = 'statecode eq 0', select: readonly string[] = SELECT[key]) {
    const options = `?$select=${select.join(',')}&$filter=${filter}&$orderby=${ORDER[key]}`
    const rows: Row[] = []
    // Páginas de 5.000 (o máximo): tabelas grandes (manutenções) chegam em poucas idas ao servidor, não dezenas.
    let page = await api.retrieveMultipleRecords(TABLE[key], options, PAGE_SIZE)
    rows.push(...page.entities)
    while (page.nextLink) {
      page = await api.retrieveMultipleRecords(TABLE[key], page.nextLink.slice(page.nextLink.indexOf('?')), PAGE_SIZE)
      rows.push(...page.entities)
    }
    return rows
  }

  /** Valor sobrescrito (environmentvariablevalue) primeiro; sem ele, o padrão da definição. */
  async function readEnvVar(schemaName: string): Promise<string | null> {
    const overrides = await api.retrieveMultipleRecords('environmentvariablevalue', `?$select=value&$expand=EnvironmentVariableDefinitionId($select=schemaname)&$filter=EnvironmentVariableDefinitionId/schemaname eq '${schemaName}'`)
    const override = overrides.entities.length > 0 ? (overrides.entities[0].value as string | null) : null
    if (override) return override
    const definitions = await api.retrieveMultipleRecords('environmentvariabledefinition', `?$select=defaultvalue&$filter=schemaname eq '${schemaName}'`)
    return definitions.entities.length > 0 ? ((definitions.entities[0].defaultvalue as string | null) ?? null) : null
  }

  const envLabel = getDataverseEnvironmentLabel(clientUrl)
  const spUrls = new Map<SpKey, string>()
  async function spUrl(key: SpKey) {
    const cached = spUrls.get(key)
    if (cached) return cached
    const url = await readEnvVar(SP_VARS[key])
    if (!url || !/^https:\/\//i.test(url)) throw new Error(`Fotos não configuradas neste ambiente (variável ${SP_VARS[key]})`)
    spUrls.set(key, url)
    return url
  }

  /** Último termo de cada multa para a coluna Termo. Falha aqui não derruba a lista de multas: devolve null e a lista avisa. */
  async function resumoTermos() {
    try {
      const rows: Row[] = []
      let page = await api.retrieveMultipleRecords(TERMO_TABLE, `?$select=${SELECT_RESUMO_TERMO.join(',')}&$filter=_new_multa_value ne null&$orderby=createdon desc`, PAGE_SIZE)
      rows.push(...page.entities)
      while (page.nextLink) {
        page = await api.retrieveMultipleRecords(TERMO_TABLE, page.nextLink.slice(page.nextLink.indexOf('?')), PAGE_SIZE)
        rows.push(...page.entities)
      }
      return resumirTermos(rows)
    } catch {
      return null
    }
  }

  const loaders:{ [K in TableKey]: () => Promise<FrotaData[K]> } = {
    veiculos: async () => {
      try {
        return (await retrieveAll('veiculos')).map(mapVeiculo)
      } catch (reason) {
        // Ambiente sem as colunas de hodômetro (schema novo não publicado): os veículos carregam, sem km.
        if (!/hodometro/i.test(errorMessage(reason))) throw reason
        return (await retrieveAll('veiculos', undefined, SELECT_VEICULOS_SEM_HODOMETRO)).map((row) => ({ ...mapVeiculo(row), hodometro: null, hodometroEm: null }))
      }
    },
    manutencoes: async () => {
      const [rows, behaviors] = await Promise.all([retrieveAll('manutencoes'), loadBehaviors(TABLE.manutencoes)])
      return rows.map((row) => mapManutencao(row, behaviors))
    },
    multas: async () => {
      const [rows, behaviors, termos] = await Promise.all([retrieveAll('multas'), loadBehaviors(TABLE.multas), resumoTermos()])
      return rows.map((row) => { const multa = mapMulta(row, behaviors); return { ...multa, termo: termos ? termos.get(multa.id) ?? null : undefined } })
    },
    infracoes: async () => (await retrieveAll('infracoes')).map(mapInfracao),
    colisoes: async () => (await retrieveAll('colisoes')).map(mapColisao),
    posses: async () => (await retrieveAll('posses')).map(mapPosse),
    // Inativos também: a aba do plano mostra e permite reativar.
    planoPreventivo: async () => (await retrieveAll('planoPreventivo', 'statecode eq 0 or statecode eq 1')).map(mapItemPlano),
    baselines: async () => (await retrieveAll('baselines')).map(mapBaseline),
    despesasCombustivel: async () => {
      const categorias = await api.retrieveMultipleRecords(CATEGORIA_DESPESA_TABLE, "?$select=cr40f_categoriadespesaoperacionalid,cr40f_nome&$filter=cr40f_nome eq 'Abastecimento' or cr40f_nome eq 'Manutenção'")
      const tipoDe = new Map<string, 'combustivel' | 'manutencao'>()
      for (const row of categorias.entities) {
        if (row.cr40f_nome === 'Abastecimento') tipoDe.set(cleanId(row.cr40f_categoriadespesaoperacionalid), 'combustivel')
        else if (row.cr40f_nome === 'Manutenção') tipoDe.set(cleanId(row.cr40f_categoriadespesaoperacionalid), 'manutencao')
      }
      if (![...tipoDe.values()].includes('combustivel')) throw new Error('Categoria "Abastecimento" não encontrada nas despesas')
      const desde = addMonths(todaySP(), -12)
      const porCategoria = [...tipoDe.keys()].map((id) => `_cr40f_categoria_value eq ${id}`).join(' or ')
      const rows = await retrieveAll('despesasCombustivel', `statecode eq 0 and cr40f_datagasto ge ${desde}T00:00:00Z and (${porCategoria})`)
      return rows.map((row) => mapDespesaCombustivel(row, (id) => tipoDe.get(id) ?? null)).filter((item): item is DespesaCombustivel => item !== null)
    },
    // DateOnly e sem statecode: a tabela de telemetria não é desativada por linha.
    telemetriaKm: async () => (await retrieveAll('telemetriaKm', `new_data ge ${addMonths(todaySP(), -12)}`)).map(mapTelemetriaKm).filter((item): item is TelemetriaKm => item !== null),
  }

  const deps: DepsXrm = { api, apiUrl, envLabel, lerVariavel: readEnvVar, metadata: getJson, comportamentos: () => loadBehaviors(TABLE.manutencoes) }

  return {
    mode: 'xrm',
    envLabel,
    ...criarComandosXrm(deps),
    ...criarArquivosXrm(deps),

    async load(): Promise<LoadResult> {
      const keys = Object.keys(loaders) as TableKey[]
      const settled = await Promise.allSettled(keys.map((key) => loaders[key]()))
      const data: FrotaData = { ...EMPTY_DATA }
      const errors: LoadResult['errors'] = {}
      settled.forEach((result, index) => {
        const key = keys[index]
        if (result.status === 'fulfilled') (data[key] as unknown) = result.value
        else errors[key] = errorMessage(result.reason)
      })
      return { data, errors }
    },

    async veiculo(id: string) {
      if (!GUID.test(cleanId(id))) return null
      const filtro = `cr40f_veiculosid eq ${cleanId(id)}`
      try {
        const [row] = await retrieveAll('veiculos', filtro)
        return row ? mapVeiculo(row) : null
      } catch (reason) {
        if (!/hodometro/i.test(errorMessage(reason))) throw reason
        const [row] = await retrieveAll('veiculos', filtro, SELECT_VEICULOS_SEM_HODOMETRO)
        return row ? { ...mapVeiculo(row), hodometro: null, hodometroEm: null } : null
      }
    },

    async currentStatus(kind: Kind, id: string) {
      const row = await api.retrieveRecord(KIND_TABLE[kind], id, `?$select=${STATUS_FIELD[kind]}`)
      const value = row[STATUS_FIELD[kind]]
      return typeof value === 'number' ? value : null
    },

    dateBehaviors(kind: Kind) {
      return loadBehaviors(KIND_TABLE[kind])
    },

    async update(kind: Kind, id: string, patch: Record<string, unknown>) {
      await api.updateRecord(KIND_TABLE[kind], cleanId(id), patch)
    },

    async openForm(kind, id) {
      const entityName = kind === 'veiculo' ? TABLE.veiculos : KIND_TABLE[kind]
      const navigation = xrm.Navigation
      if (navigation?.navigateTo) await navigation.navigateTo({ pageType: 'entityrecord', entityName, entityId: id }, { target: 2, position: 1, width: { value: 70, unit: '%' } })
      else if (navigation?.openForm) await navigation.openForm({ entityName, entityId: id })
      else {
        // Shell aberto por URL direta, fora do model-driven: o formulário abre em outra aba.
        const params = new URLSearchParams({ pagetype: 'entityrecord', etn: entityName })
        if (id) params.set('id', cleanId(id))
        window.open(`${clientUrl}/main.aspx?${params}`, '_blank', 'noopener')
      }
    },

    async fotoVeiculo(id: string) {
      const listado = await callSpFlow(await spUrl('listar'), { caminhoCompleto: pastaFotoVeiculo(cleanId(id), envLabel) })
      const principal = escolherPrincipal((Array.isArray(listado.arquivos) ? listado.arquivos as Record<string, unknown>[] : []).map(toArquivo))
      if (!principal) return null
      const result = await callSpFlow(await spUrl('consultar'), { id: principal.id || principal.caminho, fileLocator: principal.id, caminhoSharePoint: principal.caminho, nomeArquivo: principal.nome })
      return base64ToBlob(String(result.conteudoBase64 ?? ''), String(result.mimeType || principal.mimeType || 'image/png'))
    },

    async enviarFotoVeiculo(id: string, file: File) {
      if (!file.type.startsWith('image/')) throw new Error('Envie uma imagem (PNG, JPG ou WEBP)')
      if (file.size > FOTO_MAX_BYTES) throw new Error('A imagem passa de 10 MB')
      await callSpFlow(await spUrl('salvar'), {
        caminhoCompleto: pastaFotoVeiculo(cleanId(id), envLabel),
        nomeArquivo: nomeFoto(file),
        conteudoBase64: await fileToBase64(file),
        mimeType: file.type,
        metadados: { tarefaId: cleanId(id), origem: 'TELA_FROTA' },
      })
    },

    async salvarItemPlano(input: ItemPlanoInput, id?: string) {
      const patch = {
        [ITEM_PLANO.nome]: input.nome,
        [ITEM_PLANO.servico]: input.servico,
        [ITEM_PLANO.intervaloKm]: input.intervaloKm,
        [ITEM_PLANO.intervaloMeses]: input.intervaloMeses,
        [ITEM_PLANO.avisoKm]: input.avisoKm,
        [ITEM_PLANO.avisoDias]: input.avisoDias,
      }
      if (id) await api.updateRecord(TABLE.planoPreventivo, cleanId(id), patch)
      else await api.createRecord(TABLE.planoPreventivo, patch)
    },

    async inativarItemPlano(id: string, ativo: boolean) {
      await api.updateRecord(TABLE.planoPreventivo, cleanId(id), { statecode: ativo ? 0 : 1, statuscode: ativo ? 1 : 2 })
    },

    async salvarBaseline(veiculoId: string, itemId: string, km: number | null, data: string | null) {
      const v = cleanId(veiculoId)
      const i = cleanId(itemId)
      const existentes = await api.retrieveMultipleRecords(TABLE.baselines, `?$select=cr40f_baselinepreventivaid&$filter=_cr40f_veiculo_value eq ${v} and _cr40f_item_value eq ${i}`)
      const valores = { [BASELINE.km]: km, [BASELINE.data]: data }
      if (existentes.entities.length > 0) {
        await api.updateRecord(TABLE.baselines, cleanId(existentes.entities[0].cr40f_baselinepreventivaid), valores)
        return
      }
      const [veiculo, item] = await Promise.all([
        api.retrieveRecord(TABLE.veiculos, v, '?$select=cr40f_placa'),
        api.retrieveRecord(TABLE.planoPreventivo, i, '?$select=cr40f_name'),
      ])
      await api.createRecord(TABLE.baselines, {
        [BASELINE.nome]: `${String(veiculo.cr40f_placa ?? '')} · ${String(item.cr40f_name ?? '')}`,
        [BASELINE.veiculo]: `/${ENTITY_SET.veiculos}(${v})`,
        [BASELINE.item]: `/${ENTITY_SET.planoPreventivo}(${i})`,
        ...valores,
      })
    },

    async temAditivo(funcionarioId: string) {
      const id = guid(funcionarioId)
      const row = await api.retrieveRecord('cr40f_funcionarios', id, '?$select=new_aditivoassinaturaem,new_aditivoassinatura_name')
      // Exige a data e o PDF: data sem arquivo não prova o aditivo assinado.
      const preenchido = (v: unknown) => typeof v === 'string' && v !== ''
      return preenchido(row.new_aditivoassinaturaem) && preenchido(row.new_aditivoassinatura_name)
    },

    async listarTermos(multaId: string) {
      const result = await api.retrieveMultipleRecords(TERMO_TABLE, `?$select=${SELECT_TERMO.join(',')}&$filter=_new_multa_value eq ${guid(multaId)}&$orderby=createdon desc`)
      return result.entities.map(mapTermoMulta)
    },

    async enviarTermoMulta(multaId: string, acordo: Acordo) {
      const payload = await customApi('new_EnviarTermoMulta', {
        new_MultaId: guid(multaId),
        new_FormaPagamento: FORMA_PAGAMENTO[acordo.forma],
        new_Parcelas: acordo.parcelas,
        new_ValorTotal: acordo.valorTotal,
        new_PrimeiraCompetencia: `${acordo.primeiraCompetencia}T00:00:00Z`,
      }, 'Não foi possível enviar o termo')
      const termoId = payload.new_TermoId
      if (typeof termoId !== 'string' || !termoId) throw new Error('O envio não devolveu o termo criado. Recarregue antes de tentar de novo')
      return cleanId(termoId)
    },

    async cancelarTermoMulta(termoId: string) {
      await customApi('new_CancelarTermoMulta', { new_TermoId: guid(termoId) }, 'Não foi possível cancelar o termo')
    },

    async lembrarTermoMulta(termoId: string) {
      await customApi('new_LembrarTermoMulta', { new_TermoId: guid(termoId) }, 'Não foi possível lembrar o motorista')
    },

    async baixarPdfTermo(termoId: string) {
      const payload = await customApi('new_BaixarPdfTermoMulta', { new_TermoId: guid(termoId) }, 'Não foi possível baixar o PDF')
      const base64 = typeof payload.new_PdfBase64 === 'string' ? payload.new_PdfBase64 : ''
      if (!base64) throw new Error('O servidor não devolveu o PDF do termo')
      const nome = typeof payload.new_NomeArquivo === 'string' && payload.new_NomeArquivo ? payload.new_NomeArquivo : 'termo-de-multa.pdf'
      return { nome, blob: base64ToBlob(base64, 'application/pdf') }
    },

    async listarParcelasTermo(termoId: string) {
      const result = await api.retrieveMultipleRecords('new_parcelamultafolha', `?$select=${SELECT_PARCELA.join(',')}&$filter=_new_termo_value eq ${guid(termoId)}&$orderby=new_numero asc`)
      return result.entities.map(mapParcelaTermo)
    },

    async listarDescontosPeriodo(inicio: string, fim: string) {
      if (!MES.test(inicio) || !MES.test(fim)) throw new Error('Mês inválido')
      const filtro = `new_competencia ge ${inicio}-01 and new_competencia lt ${addMonths(`${fim}-01`, 1)} and new_status ne 100000002`
      const rows = (await api.retrieveMultipleRecords('new_parcelamultafolha', `?$select=${SELECT_PARCELA_FOLHA.join(',')}&$expand=${EXPAND_PARCELA_FOLHA}&$filter=${filtro}&$orderby=new_competencia asc`)).entities
      const totais = await totaisPorOrigem(rows)
      return rows.map((r) => mapParcelaFolha(r, totais.get(cleanId(r._new_multa_value ?? r._new_termo_value)) ?? 1))
    },

    async previstasAntes(mes: string) {
      if (!MES.test(mes)) throw new Error('Mês inválido')
      const rows = (await api.retrieveMultipleRecords('new_parcelamultafolha', `?$select=new_competencia&$filter=new_status eq 100000000 and new_competencia lt ${mes}-01&$orderby=new_competencia asc`)).entities
      return { quantidade: rows.length, maisAntigo: rows.length ? String(rows[0].new_competencia).slice(0, 7) : null }
    },

    async listarParcelasMulta(multaId: string) {
      const rows = (await api.retrieveMultipleRecords('new_parcelamultafolha', `?$select=${SELECT_PARCELA_FOLHA.join(',')}&$expand=${EXPAND_PARCELA_FOLHA}&$filter=_new_multa_value eq ${guid(multaId)}&$orderby=new_numero asc`)).entities
      return rows.map((r) => mapParcelaFolha(r, rows.length))
    },

    async lancarDescontoFolha(ids: string[], acao: 'lancar' | 'desfazer'): Promise<ResultadoLancamento> {
      const payload = await customApi('cr40f_LancarDescontoFolha', { ParcelaIdsJson: JSON.stringify(ids.map(guid)), Acao: acao }, 'Não foi possível lançar as parcelas')
      const json = typeof payload.ResultadoJson === 'string' ? payload.ResultadoJson : ''
      if (!json) throw new Error('O servidor não devolveu o resultado do lançamento. Recarregue a tela')
      return JSON.parse(json) as ResultadoLancamento
    },

    async passoMulta(multaId: string, passo: Passo, dados: DadosPasso): Promise<Situacao> {
      const payload = await customApi('cr40f_PassoMulta', { MultaId: guid(multaId), Passo: passo, DadosJson: JSON.stringify(dados) }, 'Não foi possível gravar o passo')
      const json = typeof payload.MultaJson === 'string' ? payload.MultaJson : ''
      if (!json) throw new Error('O servidor não devolveu a situação da multa. Recarregue a tela')
      return JSON.parse(json) as Situacao
    },

    async dossieMulta(multaId: string): Promise<Dossie> {
      const payload = await customApi('new_DossieMulta', { new_MultaId: guid(multaId) }, 'Não foi possível montar o dossiê da multa')
      const json = typeof payload.new_DossieJson === 'string' ? payload.new_DossieJson : ''
      if (!json) throw new Error('O servidor não devolveu o dossiê da multa')
      return JSON.parse(json) as Dossie
    },

    urlArquivoMulta(multaId: string, coluna: ColunaArquivoMulta) {
      return `${apiUrl}/cr40f_multases(${guid(multaId)})/${coluna}/$value`
    },

    async enviarArquivoMulta(multaId: string, coluna: ArquivoMulta, file: File) {
      // x-ms-file-name só aceita ASCII: tira acentos e o que sobrar fora da faixa imprimível.
      const nome = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '') || 'arquivo.pdf'
      const response = await fetch(`${apiUrl}/cr40f_multases(${guid(multaId)})/${coluna}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/octet-stream', 'x-ms-file-name': nome, 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
        body: file,
      })
      if (!response.ok) throw new ApiError(`Não foi possível enviar o arquivo (${response.status})`, response.status)
    },
  }
}
