import { CAMPO, lerMulti } from '../domain/manutencaoCatalogo'
import { addMonths, todaySP, type DateBehavior } from './dates'
import { cleanId, mapBaseline, mapColisao, mapDespesaCombustivel, mapInfracao, mapItemPlano, mapManutencao, mapMulta, mapPosse, mapTelemetriaKm, mapTermoMulta, mapVeiculo, SELECT, SELECT_TERMO, SELECT_VEICULOS_SEM_HODOMETRO } from './mappers'
import { BASELINE, CATEGORIA_DESPESA_TABLE, ENTITY_SET, FORMA_PAGAMENTO, ITEM_PLANO, KIND_TABLE, STATUS_FIELD, TABLE, TERMO_TABLE } from './schema'
import type { Acordo } from '../domain/termoMulta'
import { base64ToBlob, callSpFlow, escolherPrincipal, FOTO_MAX_BYTES, fileToBase64, nomeFoto, pastaFotoVeiculo, SP_VARS, toArquivo, type SpKey } from './sharepoint'
import { EMPTY_DATA, FlowIncertoError, type DataSource, type FlowId, type FlowResult, type ItemPlanoInput, type LoadResult } from './source'
import type { DespesaCombustivel, FrotaData, Kind, TableKey, TelemetriaKm } from './types'
import { errorMessage, type XrmHost, type XrmWebApi } from './xrm'

type Row = Record<string, unknown>
type Behaviors = Record<string, DateBehavior>

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

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const FLOWS: Record<FlowId, { envVar: string; body: (id: string) => Record<string, string>; timeoutMs: number; nome: string }> = {
  aprovarManutencao: { envVar: 'new_FlowUrlManutencao', body: (id) => ({ guids: id }), timeoutMs: 60_000, nome: 'Agendar manutenção' },
  notificarCondutor: { envVar: 'new_FlowUrlNotificarMotoristaMultas', body: (id) => ({ guids: id }), timeoutMs: 30_000, nome: 'Notificar condutor' },
  gerarContrato: { envVar: 'new_FlowUrlGerarContratoMultas', body: (id) => ({ GUID_MULTA: id }), timeoutMs: 40_000, nome: 'Gerar contrato' },
}

const FLOW_CLASSIFICAR_VAR = 'new_FlowUrlClassificarManutencao'

export function createXrmSource(xrm: XrmHost): DataSource {
  let classificarUrl: string | null = null
  const api = xrm.WebApi as XrmWebApi
  const clientUrl = xrm.Utility?.getGlobalContext().getClientUrl().replace(/\/+$/, '') ?? location.origin
  const apiUrl = `${clientUrl}/api/data/v9.2`
  const behaviorCache = new Map<string, Promise<Behaviors>>()
  // A URL do Flow tem assinatura: fica só aqui, em memória, e nunca sai em mensagem, log ou retorno.
  const flowUrls = new Map<FlowId, string>()

  /** Guid sem chaves e minúsculo; rejeita o que não for Guid. */
  function guid(value: string) {
    const id = cleanId(value)
    if (!GUID.test(id)) throw new Error('Identificador inválido')
    return id
  }

  /** Chama uma Custom API não vinculada; erro do servidor sai com a mensagem do Dataverse. */
  async function customApi(nome: string, body: Record<string, unknown>, falha: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${apiUrl}/${nome}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
      body: JSON.stringify(body),
    })
    let payload: Record<string, unknown> = {}
    try {
      const parsed: unknown = await response.json()
      if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>
    } catch { /* 204 ou corpo vazio */ }
    if (!response.ok) {
      const erro = payload.error as { message?: unknown } | undefined
      throw new Error(typeof erro?.message === 'string' && erro.message ? erro.message : `${falha} (${response.status})`)
    }
    return payload
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

  async function flowUrl(flow: FlowId) {
    const cached = flowUrls.get(flow)
    if (cached) return cached
    const { envVar, nome } = FLOWS[flow]
    const url = await readEnvVar(envVar)
    if (!url) throw new Error(`URL do Flow "${nome}" não configurada (variável ${envVar})`)
    flowUrls.set(flow, url)
    return url
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
      const [rows, behaviors] = await Promise.all([retrieveAll('multas'), loadBehaviors(TABLE.multas)])
      return rows.map((row) => mapMulta(row, behaviors))
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

  return {
    mode: 'xrm',
    envLabel,

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

    async classificacao(id: string) {
      const row = await api.retrieveRecord(KIND_TABLE.manutencao, cleanId(id), `?$select=${CAMPO.servicos},${CAMPO.categorias},${CAMPO.origem},${CAMPO.confianca}`)
      const num = (value: unknown) => (typeof value === 'number' ? value : null)
      return { servicos: lerMulti(row[CAMPO.servicos]), categorias: lerMulti(row[CAMPO.categorias]), origem: num(row[CAMPO.origem]), confianca: num(row[CAMPO.confianca]) }
    },

    async classificarAgora(id: string) {
      if (!GUID.test(id)) throw new Error('Identificador inválido')
      const url = classificarUrl ?? (classificarUrl = await readEnvVar(FLOW_CLASSIFICAR_VAR))
      if (!url) throw new Error(`URL da classificação não configurada (variável ${FLOW_CLASSIFICAR_VAR})`)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 20_000)
      try {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: cleanId(id) }), signal: controller.signal })
        if (!response.ok) throw new Error(`A classificação respondeu ${response.status}`)
        const body = (await response.json()) as Record<string, unknown>
        const lista = (value: unknown) => (Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [])
        const num = (value: unknown) => (typeof value === 'number' ? value : null)
        return { servicos: lista(body.servicos), categorias: lista(body.categorias), origem: num(body.origem), confianca: num(body.confianca) }
      } catch (reason) {
        // O erro original pode citar a URL assinada; só a mensagem própria sai daqui.
        throw new Error(reason instanceof Error && reason.message.startsWith('A classificação') ? reason.message : 'Não foi possível chamar a classificação agora')
      } finally {
        clearTimeout(timer)
      }
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

    async prepareFlow(flow: FlowId) {
      await flowUrl(flow)
    },

    async runFlow(flow: FlowId, id: string): Promise<FlowResult> {
      if (!GUID.test(id)) throw new Error('Identificador inválido')
      const { body, timeoutMs, nome } = FLOWS[flow]
      const url = await flowUrl(flow)

      const controller = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
      let response: Response
      try {
        response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(id)), signal: controller.signal })
      } catch {
        // O erro original pode citar a URL; só a mensagem própria sai daqui.
        clearTimeout(timer)
        if (timedOut) throw new FlowIncertoError(`O Flow "${nome}" não respondeu em ${timeoutMs / 1000} s. Confira o registro antes de tentar de novo`)
        throw new FlowIncertoError(`Não foi possível chamar o Flow "${nome}" (rede ou bloqueio do navegador)`)
      }

      let payload: Record<string, unknown> = {}
      try {
        const parsed: unknown = await response.json()
        if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>
      } catch { /* Corpo vazio ou não JSON. */ } finally { clearTimeout(timer) }

      const status = response.status
      if (flow === 'notificarCondutor' && (status === 207 || status === 400) && Number(payload.noDriver) > 0) throw new Error('A multa não tem motorista. Nada foi enviado')
      if (status < 200 || status > 299 || status === 207) throw new Error(`O Flow "${nome}" respondeu ${status}. Confira o registro antes de tentar de novo`)
      return { message: typeof payload.message === 'string' ? payload.message : null, shareUrl: typeof payload.shareUrl === 'string' ? payload.shareUrl : null }
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
      const row = await api.retrieveRecord('cr40f_funcionarios', id, '?$select=new_aditivoassinaturaem')
      return typeof row.new_aditivoassinaturaem === 'string' && row.new_aditivoassinaturaem !== ''
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

    async baixarPdfTermo(termoId: string) {
      window.open(`${apiUrl}/new_termomultas(${guid(termoId)})/new_pdf/$value`, '_blank', 'noopener')
    },
  }
}
