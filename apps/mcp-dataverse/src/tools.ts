import { z } from 'zod'
import { buildQuery, idFromEntityHeader, odataLiteral, type DataverseSession } from './dataverse'
import { AMBIENTES, type Ambiente } from './env'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, errorResult, limitJson, ok, text, type ToolResult, clean } from './format'
import {
  applyFetchPaging,
  buildAttribute,
  buildLookupRelationship,
  buildTable,
  columnSchema,
  fetchXmlEntity,
  keyPath,
  label,
  labelText,
} from './metadata'

export interface ToolContext {
  session: DataverseSession
  identity: { email: string; name: string }
}

export interface ToolAnnotations {
  readOnlyHint: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export interface ToolDef {
  name: string
  description: string
  schema: z.ZodRawShape
  annotations: ToolAnnotations
  /** Valida a entrada (aplica padrões), executa e converte qualquer falha em `isError`. */
  handler: (raw: unknown) => Promise<ToolResult>
}

function defineTool<S extends z.ZodRawShape>(
  name: string,
  description: string,
  schema: S,
  annotations: ToolAnnotations,
  run: (args: z.infer<z.ZodObject<S>>) => Promise<ToolResult>,
): ToolDef {
  const parser = z.object(schema)
  return {
    name,
    description,
    schema,
    annotations,
    handler: async (raw) => {
      try {
        return await run(parser.parse(raw))
      } catch (error) {
        return errorResult(error)
      }
    },
  }
}

const ambiente = z
  .enum(AMBIENTES)
  .default('DEV')
  .describe('Ambiente do Dataverse: DEV (padrão), TEST ou PROD. Escritas no PROD exigem confirmar: true.')
const confirmar = z
  .boolean()
  .optional()
  .describe('Obrigatório (true) para escrever no PROD. Sem isso a ferramenta só devolve uma prévia do que faria.')
const tabela = z.string().describe('Nome lógico da tabela (ex.: cr40f_reservadeveculos) ou EntitySetName.')
const recordId = z.string().describe('GUID do registro.')

const WRITE_RW = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const
const WRITE_DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const
const READ = { readOnlyHint: true, openWorldHint: false } as const

/** Trava do PROD: sem `confirmar: true` devolve só a prévia (isError) e nada é executado. */
function prodGuard(a: { ambiente: Ambiente; confirmar?: boolean }, what: string, details: unknown): ToolResult | null {
  if (a.ambiente !== 'PROD' || a.confirmar) return null
  return text(
    `PRÉVIA, nada foi executado: ${what} no PROD.\n${limitJson({ detalhes: details } as Record<string, unknown>, 4000)}\n` +
      'Para executar de verdade, repita a chamada com "confirmar": true.',
    true,
  )
}

const clampPage = (n?: number) => Math.min(Math.max(n ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)

export function buildTools(ctx: ToolContext): ToolDef[] {
  const { session } = ctx
  const api = session.api.bind(session)

  const tools: ToolDef[] = []
  const add = (t: ToolDef) => tools.push(t)

  add(
    defineTool(
      'whoami',
      'Mostra quem está logado no Dataverse do ambiente (usuário, unidade de negócio, organização) e a conta Microsoft usada no conector.',
      { ambiente },
      READ,
      async (a) => {
        const who = (await api(a.ambiente, 'GET', 'WhoAmI')).data
        const user = (
          await api(a.ambiente, 'GET', `systemusers(${who.UserId})${buildQuery({ $select: 'fullname,internalemailaddress,domainname' })}`)
        ).data
        return ok({
          ambiente: a.ambiente,
          url: session.baseUrl(a.ambiente),
          conta: ctx.identity,
          userId: who.UserId,
          businessUnitId: who.BusinessUnitId,
          organizationId: who.OrganizationId,
          nome: user.fullname,
          email: user.internalemailaddress,
        })
      },
    ),
  )

  add(
    defineTool(
      'list_tables',
      'Lista tabelas do Dataverse (nome lógico, EntitySetName, rótulo, chave e coluna principal). Filtre por trecho do nome lógico ou do rótulo; use somentePersonalizadas para ver só as criadas por nós. Máx. 100 por chamada.',
      {
        ambiente,
        filtro: z.string().optional().describe('Trecho do nome lógico ou do rótulo (sem diferenciar maiúsculas).'),
        somentePersonalizadas: z.boolean().default(false).describe('true = só tabelas personalizadas (IsCustomEntity).'),
        limite: z.number().int().min(1).max(100).default(50),
      },
      READ,
      async (a) => {
        const filter = ['IsPrivate eq false', a.somentePersonalizadas ? 'IsCustomEntity eq true' : ''].filter(Boolean).join(' and ')
        const rows: any[] = (
          await api(a.ambiente, 'GET', `EntityDefinitions${buildQuery({
            $select: 'LogicalName,EntitySetName,DisplayName,IsCustomEntity,PrimaryIdAttribute,PrimaryNameAttribute',
            $filter: filter,
          })}`)
        ).data.value
        const term = a.filtro?.toLowerCase()
        const found = rows
          .map((r) => ({
            nome: r.LogicalName,
            entitySet: r.EntitySetName,
            rotulo: labelText(r.DisplayName),
            personalizada: r.IsCustomEntity,
            chave: r.PrimaryIdAttribute,
            colunaPrincipal: r.PrimaryNameAttribute,
          }))
          .filter((r) => !term || r.nome.includes(term) || r.rotulo?.toLowerCase().includes(term))
          .sort((x, y) => x.nome.localeCompare(y.nome))
        return ok({ total: found.length, itens: found.slice(0, a.limite), ...(found.length > a.limite ? { _aviso: `Mostrando ${a.limite} de ${found.length}; refine o filtro.` } : {}) })
      },
    ),
  )

  add(
    defineTool(
      'describe_table',
      'Descreve uma tabela: colunas (tipo, rótulo, obrigatoriedade, choices com valores, lookups com tabelas-alvo e navigation property para @odata.bind), chaves alternativas e relações 1:N, N:1 e N:N. Use filtroColuna para reduzir a saída.',
      {
        ambiente,
        tabela,
        filtroColuna: z.string().optional().describe('Só colunas cujo nome ou rótulo contenha este trecho.'),
      },
      READ,
      async (a) => {
        const e = await session.entity(a.ambiente, a.tabela)
        const base = `EntityDefinitions(LogicalName='${e.logicalName}')`
        const get = (path: string) => api(a.ambiente, 'GET', `${base}/${path}`).then((r) => r.data.value as any[])
        const opt = (path: string) => get(path).catch(() => [] as any[])
        const [header, attrs, picklists, multis, statuses, states, bools, lookups, m2o, o2m, m2m, keys] = await Promise.all([
          api(a.ambiente, 'GET', `${base}${buildQuery({ $select: 'SchemaName,DisplayName,Description,IsCustomEntity,OwnershipType' })}`).then((r) => r.data),
          get(`Attributes${buildQuery({ $select: 'LogicalName,AttributeType,DisplayName,RequiredLevel,IsValidForCreate,IsValidForUpdate,IsCustomAttribute', $filter: 'AttributeOf eq null' })}`),
          opt(`Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata${buildQuery({ $select: 'LogicalName', $expand: 'OptionSet($select=Options),GlobalOptionSet($select=Options)' })}`),
          opt(`Attributes/Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata${buildQuery({ $select: 'LogicalName', $expand: 'OptionSet($select=Options),GlobalOptionSet($select=Options)' })}`),
          opt(`Attributes/Microsoft.Dynamics.CRM.StatusAttributeMetadata${buildQuery({ $select: 'LogicalName', $expand: 'OptionSet($select=Options)' })}`),
          opt(`Attributes/Microsoft.Dynamics.CRM.StateAttributeMetadata${buildQuery({ $select: 'LogicalName', $expand: 'OptionSet($select=Options)' })}`),
          opt(`Attributes/Microsoft.Dynamics.CRM.BooleanAttributeMetadata${buildQuery({ $select: 'LogicalName', $expand: 'OptionSet($select=TrueOption,FalseOption)' })}`),
          opt(`Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata${buildQuery({ $select: 'LogicalName,Targets' })}`),
          opt(`ManyToOneRelationships${buildQuery({ $select: 'SchemaName,ReferencedEntity,ReferencingAttribute,ReferencingEntityNavigationPropertyName' })}`),
          opt(`OneToManyRelationships${buildQuery({ $select: 'SchemaName,ReferencingEntity,ReferencingAttribute,ReferencedEntityNavigationPropertyName' })}`),
          opt(`ManyToManyRelationships${buildQuery({ $select: 'SchemaName,Entity1LogicalName,Entity2LogicalName,Entity1NavigationPropertyName,Entity2NavigationPropertyName' })}`),
          opt(`Keys${buildQuery({ $select: 'SchemaName,KeyAttributes' })}`),
        ])

        const options = new Map<string, { valor: number; rotulo?: string }[]>()
        const collect = (rows: any[]) => {
          for (const r of rows) {
            const list = r.OptionSet?.Options ?? r.GlobalOptionSet?.Options
            if (list) options.set(r.LogicalName, list.map((o: any) => ({ valor: o.Value, rotulo: labelText(o.Label) })))
          }
        }
        ;[picklists, multis, statuses, states].forEach(collect)
        for (const r of bools) {
          const t = r.OptionSet
          if (t) options.set(r.LogicalName, [t.FalseOption, t.TrueOption].filter(Boolean).map((o: any) => ({ valor: o.Value, rotulo: labelText(o.Label) })))
        }
        const targets = new Map<string, string[]>(lookups.map((r) => [r.LogicalName, r.Targets]))
        const nav = new Map<string, string>(m2o.map((r) => [r.ReferencingAttribute, r.ReferencingEntityNavigationPropertyName]))

        const term = a.filtroColuna?.toLowerCase()
        const colunas = attrs
          .map((c) => ({
            nome: c.LogicalName,
            tipo: c.AttributeType,
            rotulo: labelText(c.DisplayName),
            obrigatoria: c.RequiredLevel?.Value,
            ...(c.IsValidForCreate === false ? { criar: false } : {}),
            ...(c.IsValidForUpdate === false ? { atualizar: false } : {}),
            ...(c.IsCustomAttribute ? { personalizada: true } : {}),
            ...(options.has(c.LogicalName) ? { escolhas: options.get(c.LogicalName) } : {}),
            ...(targets.has(c.LogicalName)
              ? { alvos: targets.get(c.LogicalName), navegacao: nav.get(c.LogicalName), colunaFiltro: `_${c.LogicalName}_value` }
              : {}),
          }))
          .filter((c) => !term || c.nome.includes(term) || c.rotulo?.toLowerCase().includes(term))

        return ok({
          nome: e.logicalName,
          entitySet: e.entitySet,
          esquema: header.SchemaName,
          rotulo: labelText(header.DisplayName),
          descricao: labelText(header.Description),
          personalizada: header.IsCustomEntity,
          propriedade: header.OwnershipType,
          chave: e.primaryId,
          colunaPrincipal: e.primaryName,
          chavesAlternativas: keys.map((k) => ({ nome: k.SchemaName, colunas: k.KeyAttributes })),
          colunas,
          relacoes: {
            muitosParaUm: m2o.map((r) => ({ nome: r.SchemaName, alvo: r.ReferencedEntity, coluna: r.ReferencingAttribute, navegacao: r.ReferencingEntityNavigationPropertyName })),
            umParaMuitos: o2m.map((r) => ({ nome: r.SchemaName, tabela: r.ReferencingEntity, coluna: r.ReferencingAttribute, navegacao: r.ReferencedEntityNavigationPropertyName })),
            muitosParaMuitos: m2m.map((r) => ({ nome: r.SchemaName, tabela1: r.Entity1LogicalName, tabela2: r.Entity2LogicalName, navegacao1: r.Entity1NavigationPropertyName, navegacao2: r.Entity2NavigationPropertyName })),
          },
        })
      },
    ),
  )

  add(
    defineTool(
      'read_query',
      'Consulta registros via Web API: OData (tabela + select/filter/orderby/expand/top/apply) OU FetchXML (fetchXml). SQL/TDS NÃO existe aqui: use OData ou FetchXML. A tabela aceita nome lógico (resolvido para o EntitySetName). Lookups: selecione/filtre por _coluna_value (ex.: _cr40f_cliente_value eq <guid>); datas e choices voltam com valor formatado (@OData...FormattedValue). Páginas de 50 linhas (máx. 200) e resposta de até ~60 KB; se houver mais, vem proximaPagina (OData: devolva em proximaPagina) ou pagingCookie/maisRegistros (FetchXML: repita o fetchXml com pagina e pagingCookie).',
      {
        ambiente,
        tabela: tabela.optional().describe('Obrigatório no OData; no FetchXML é lido de <entity name>.'),
        select: z.string().optional().describe('Colunas separadas por vírgula ($select). Sempre use: reduz o tamanho.'),
        filter: z.string().optional().describe('$filter OData.'),
        orderby: z.string().optional().describe('$orderby OData.'),
        expand: z.string().optional().describe('$expand OData, ex.: cr40f_Cliente($select=cr40f_name).'),
        apply: z.string().optional().describe('$apply OData (agregações), ex.: groupby((statuscode),aggregate($count as total)).'),
        top: z.number().int().min(1).optional().describe('$top: máximo de linhas no total.'),
        contar: z.boolean().default(false).describe('Inclui o total de registros ($count=true).'),
        tamanhoPagina: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE).describe('Linhas por página (padrão 50, máx. 200).'),
        proximaPagina: z.string().optional().describe('Valor de proximaPagina de uma resposta anterior (continua a consulta OData).'),
        fetchXml: z.string().optional().describe('Consulta FetchXML completa (alternativa ao OData).'),
        pagina: z.number().int().min(1).optional().describe('FetchXML: número da página (2 em diante).'),
        pagingCookie: z.string().optional().describe('FetchXML: pagingCookie devolvido pela página anterior.'),
      },
      READ,
      async (a) => {
        const size = clampPage(a.tamanhoPagina)
        if (a.proximaPagina) {
          const r = await api(a.ambiente, 'GET', a.proximaPagina, { headers: { Prefer: preferPage(size) } })
          return ok(pageResult(r.data))
        }
        if (a.fetchXml) {
          const entityName = a.tabela ?? fetchXmlEntity(a.fetchXml)
          if (!entityName) throw new Error('Informe "tabela" ou use <entity name="..."> no FetchXML.')
          const e = await session.entity(a.ambiente, entityName)
          const xml = applyFetchPaging(a.fetchXml, { page: a.pagina, count: /\scount\s*=/.test(a.fetchXml) ? undefined : size, pagingCookie: a.pagingCookie })
          const r = await api(a.ambiente, 'GET', `${e.entitySet}${buildQuery({ fetchXml: xml })}`)
          return ok({
            tabela: e.logicalName,
            value: r.data.value,
            maisRegistros: r.data['@Microsoft.Dynamics.CRM.morerecords'] ?? false,
            pagingCookie: r.data['@Microsoft.Dynamics.CRM.fetchxmlpagingcookie'],
          })
        }
        if (!a.tabela) throw new Error('Informe "tabela" (ou "fetchXml").')
        const e = await session.entity(a.ambiente, a.tabela)
        const path = `${e.entitySet}${buildQuery({
          $select: a.select,
          $filter: a.filter,
          $orderby: a.orderby,
          $expand: a.expand,
          $apply: a.apply,
          $top: a.top,
          $count: a.contar ? 'true' : undefined,
        })}`
        const r = await api(a.ambiente, 'GET', path, { headers: a.apply ? {} : { Prefer: preferPage(size) } })
        return ok({ tabela: e.logicalName, ...pageResult(r.data) })
      },
    ),
  )

  add(
    defineTool(
      'search',
      'Busca de texto no Dataverse Search (índice relevance search, /api/search/v2.0/query) em várias tabelas de uma vez. Exige o Dataverse Search habilitado no ambiente. Para filtros exatos use read_query.',
      {
        ambiente,
        consulta: z.string().describe('Texto a buscar.'),
        tabelas: z.array(z.string()).optional().describe('Nomes lógicos das tabelas onde buscar (padrão: todas indexadas).'),
        filtro: z.string().optional().describe('Filtro OData do Search, ex.: statecode eq 0.'),
        limite: z.number().int().min(1).max(50).default(10),
        pular: z.number().int().min(0).default(0),
      },
      READ,
      async (a) => {
        const body: Record<string, unknown> = { search: a.consulta, count: true, top: a.limite, skip: a.pular }
        if (a.tabelas?.length) body.entities = JSON.stringify(a.tabelas.map((name) => ({ name })))
        if (a.filtro) body.filter = a.filtro
        const r = await api(a.ambiente, 'POST', `${session.baseUrl(a.ambiente)}/api/search/v2.0/query`, { body })
        return ok({ total: r.data.totalrecordcount, itens: r.data.value })
      },
    ),
  )

  add(
    defineTool(
      'fetch',
      'Busca um registro pelo GUID, com as colunas pedidas (ou todas, se omitir colunas; prefira informar).',
      {
        ambiente,
        tabela,
        id: recordId,
        colunas: z.string().optional().describe('Colunas separadas por vírgula ($select). Lookups: _coluna_value.'),
        expand: z.string().optional().describe('$expand OData.'),
      },
      READ,
      async (a) => {
        const e = await session.entity(a.ambiente, a.tabela)
        const r = await api(a.ambiente, 'GET', `${e.entitySet}(${a.id})${buildQuery({ $select: a.colunas, $expand: a.expand })}`)
        return ok({ tabela: e.logicalName, registro: r.data })
      },
    ),
  )

  add(
    defineTool(
      'create_record',
      'Cria um registro. Lookups: use "<navigation property>@odata.bind": "/<entitySet>(<guid>)" (veja a navegação em describe_table). Choices recebem o valor numérico. No PROD exige confirmar: true.',
      { ambiente, tabela, dados: z.record(z.string(), z.unknown()).describe('Colunas e valores do registro.'), confirmar },
      WRITE_RW,
      async (a) => {
        const e = await session.entity(a.ambiente, a.tabela)
        const blocked = prodGuard(a, `criar registro em ${e.logicalName}`, a.dados)
        if (blocked) return blocked
        const r = await api(a.ambiente, 'POST', e.entitySet, { body: a.dados, headers: { Prefer: 'return=minimal' } })
        return ok({ criado: true, tabela: e.logicalName, id: idFromEntityHeader(r.headers) })
      },
    ),
  )

  add(
    defineTool(
      'update_record',
      'Atualiza colunas de um registro existente (PATCH com If-Match: *, não cria se não existir). Lookups: "<navigation property>@odata.bind". Para limpar um lookup use a associação por disassociate ou envie null na coluna quando permitido. No PROD exige confirmar: true.',
      { ambiente, tabela, id: recordId, dados: z.record(z.string(), z.unknown()).describe('Somente as colunas a alterar.'), confirmar },
      WRITE_RW,
      async (a) => {
        const e = await session.entity(a.ambiente, a.tabela)
        const blocked = prodGuard(a, `atualizar ${e.logicalName}(${a.id})`, a.dados)
        if (blocked) return blocked
        await api(a.ambiente, 'PATCH', `${e.entitySet}(${a.id})`, { body: a.dados, headers: { 'If-Match': '*', Prefer: 'return=minimal' } })
        return ok({ atualizado: true, tabela: e.logicalName, id: a.id })
      },
    ),
  )

  add(
    defineTool(
      'upsert_record',
      'Cria ou atualiza um registro identificado por chave alternativa (PATCH tabela(chave=valor)). modo: upsert (padrão), criar (falha se existir) ou atualizar (falha se não existir). No PROD exige confirmar: true.',
      {
        ambiente,
        tabela,
        chaves: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).describe('Colunas da chave alternativa e valores, ex.: {"cr40f_codigo":"ABC"}.'),
        dados: z.record(z.string(), z.unknown()),
        modo: z.enum(['upsert', 'criar', 'atualizar']).default('upsert'),
        confirmar,
      },
      WRITE_RW,
      async (a) => {
        const e = await session.entity(a.ambiente, a.tabela)
        const blocked = prodGuard(a, `${a.modo} em ${e.logicalName} por chave ${JSON.stringify(a.chaves)}`, a.dados)
        if (blocked) return blocked
        const headers: Record<string, string> = { Prefer: 'return=minimal' }
        if (a.modo === 'criar') headers['If-None-Match'] = '*'
        if (a.modo === 'atualizar') headers['If-Match'] = '*'
        const r = await api(a.ambiente, 'PATCH', `${e.entitySet}(${keyPath(a.chaves)})`, { body: a.dados, headers })
        return ok({ resultado: r.status === 201 ? 'criado' : 'atualizado', tabela: e.logicalName, id: idFromEntityHeader(r.headers) })
      },
    ),
  )

  add(
    defineTool(
      'delete_record',
      'Exclui um registro pelo GUID (irreversível). No PROD exige confirmar: true; confira o registro com fetch antes.',
      { ambiente, tabela, id: recordId, confirmar },
      WRITE_DESTRUCTIVE,
      async (a) => {
        const e = await session.entity(a.ambiente, a.tabela)
        const blocked = prodGuard(a, `EXCLUIR ${e.logicalName}(${a.id})`, { id: a.id })
        if (blocked) return blocked
        await api(a.ambiente, 'DELETE', `${e.entitySet}(${a.id})`)
        return ok({ excluido: true, tabela: e.logicalName, id: a.id })
      },
    ),
  )

  add(
    defineTool(
      'create_table',
      'Cria uma tabela personalizada com coluna principal de texto. ATENÇÃO: o schema do PROD normalmente vem pelas soluções (migrations feitas no DEV); crie no PROD só em exceção e com confirmar: true. Use nomeSchema com o prefixo do publisher (cr40f_). Rótulos em pt-BR (idioma 1046) por padrão.',
      {
        ambiente,
        nomeSchema: z.string().describe('Nome de esquema da tabela, ex.: cr40f_Equipamento.'),
        rotulo: z.string().describe('Rótulo no singular.'),
        rotuloPlural: z.string().describe('Rótulo no plural.'),
        descricao: z.string().optional(),
        colunaPrincipal: z
          .object({ nomeSchema: z.string(), rotulo: z.string(), tamanhoMaximo: z.number().int().optional() })
          .describe('Coluna principal de texto, ex.: {"nomeSchema":"cr40f_name","rotulo":"Nome"}.'),
        propriedade: z.enum(['UserOwned', 'OrganizationOwned']).default('UserOwned'),
        solucao: z.string().optional().describe('Nome único da solução onde incluir a tabela (MSCRM.SolutionUniqueName).'),
        idioma: z.number().int().default(1046).describe('LCID dos rótulos (1046 = pt-BR).'),
        confirmar,
      },
      WRITE_RW,
      async (a) => {
        const body = buildTable({ ...a, language: a.idioma })
        const blocked = prodGuard(a, `criar tabela ${a.nomeSchema}`, body)
        if (blocked) return blocked
        const r = await api(a.ambiente, 'POST', 'EntityDefinitions', { body, headers: a.solucao ? { 'MSCRM.SolutionUniqueName': a.solucao } : {} })
        return ok({ criada: true, tabela: a.nomeSchema.toLowerCase(), metadataId: idFromEntityHeader(r.headers) })
      },
    ),
  )

  add(
    defineTool(
      'update_table',
      'Altera uma tabela existente: renomeia rótulo/rótulo plural/descrição e/ou adiciona colunas (texto, memo, inteiro, decimal, moeda, data, booleano, choice local, lookup). ATENÇÃO: no PROD o schema normalmente vem pelas soluções; exige confirmar: true.',
      {
        ambiente,
        tabela,
        rotulo: z.string().optional(),
        rotuloPlural: z.string().optional(),
        descricao: z.string().optional(),
        adicionarColunas: z.array(columnSchema).optional(),
        solucao: z.string().optional().describe('Nome único da solução que recebe as colunas novas.'),
        idioma: z.number().int().default(1046),
        confirmar,
      },
      WRITE_RW,
      async (a) => {
        const e = await session.entity(a.ambiente, a.tabela)
        const plan = {
          renomear: { rotulo: a.rotulo, rotuloPlural: a.rotuloPlural, descricao: a.descricao },
          colunas: a.adicionarColunas?.map((c) => ({ tipo: c.tipo, nome: c.nomeSchema })),
        }
        const blocked = prodGuard(a, `alterar a tabela ${e.logicalName}`, plan)
        if (blocked) return blocked
        const headers: Record<string, string> = a.solucao ? { 'MSCRM.SolutionUniqueName': a.solucao } : {}
        const done: string[] = []
        if (a.rotulo || a.rotuloPlural || a.descricao) {
          const url = `EntityDefinitions(LogicalName='${e.logicalName}')`
          const current = (await api(a.ambiente, 'GET', url)).data
          const next = {
            ...current,
            ...(a.rotulo ? { DisplayName: label(a.rotulo, a.idioma) } : {}),
            ...(a.rotuloPlural ? { DisplayCollectionName: label(a.rotuloPlural, a.idioma) } : {}),
            ...(a.descricao ? { Description: label(a.descricao, a.idioma) } : {}),
          }
          await api(a.ambiente, 'PUT', url, { body: next, headers: { ...headers, 'MSCRM.MergeLabels': 'true' } })
          done.push('rótulos/descrição atualizados')
        }
        for (const c of a.adicionarColunas ?? []) {
          if (c.tipo === 'lookup') {
            await api(a.ambiente, 'POST', 'RelationshipDefinitions', { body: buildLookupRelationship(e.logicalName, c, a.idioma), headers })
          } else {
            await api(a.ambiente, 'POST', `EntityDefinitions(LogicalName='${e.logicalName}')/Attributes`, { body: buildAttribute(c, a.idioma), headers })
          }
          done.push(`coluna ${c.nomeSchema} (${c.tipo}) criada`)
        }
        return ok({ tabela: e.logicalName, feito: done })
      },
    ),
  )

  add(
    defineTool(
      'delete_table',
      'EXCLUI uma tabela e todos os seus dados (irreversível). No PROD exige confirmar: true e o schema do PROD normalmente vem pelas soluções; só use com decisão explícita.',
      { ambiente, tabela, confirmar },
      WRITE_DESTRUCTIVE,
      async (a) => {
        const e = await session.entity(a.ambiente, a.tabela)
        const blocked = prodGuard(a, `EXCLUIR a tabela ${e.logicalName} com todos os dados`, { tabela: e.logicalName })
        if (blocked) return blocked
        await api(a.ambiente, 'DELETE', `EntityDefinitions(LogicalName='${e.logicalName}')`)
        return ok({ excluida: true, tabela: e.logicalName })
      },
    ),
  )

  add(
    defineTool(
      'list_prompts',
      'Lista prompts do AI Builder (tabela msdyn_aimodels, modelos de template GPT) do ambiente. Melhor esforço: depende de o AI Builder estar instalado.',
      {
        ambiente,
        filtro: z.string().optional().describe('Trecho do nome do prompt.'),
        todosOsModelos: z.boolean().default(false).describe('true = não filtrar só os de template GPT/prompt.'),
      },
      READ,
      async (a) => {
        const r = await api(a.ambiente, 'GET', `msdyn_aimodels${buildQuery({ $select: 'msdyn_aimodelid,msdyn_name,statecode,_msdyn_templateid_value', $orderby: 'msdyn_name', $top: 200 })}`)
        const fv = '@OData.Community.Display.V1.FormattedValue'
        const term = a.filtro?.toLowerCase()
        const itens = (r.data.value as any[])
          .map((m) => ({ id: m.msdyn_aimodelid, nome: m.msdyn_name, ativo: m.statecode === 0, modelo: m[`_msdyn_templateid_value${fv}`] as string | undefined }))
          .filter((m) => a.todosOsModelos || !m.modelo || /gpt|prompt/i.test(m.modelo))
          .filter((m) => !term || m.nome?.toLowerCase().includes(term))
        return ok({ itens })
      },
    ),
  )

  add(
    defineTool(
      'execute_prompt',
      'Executa um prompt do AI Builder (ação Predict vinculada ao msdyn_aimodel). Melhor esforço: o formato das entradas depende do prompt; informe as variáveis em entradas. Consome créditos do AI Builder. No PROD exige confirmar: true.',
      {
        ambiente,
        promptId: z.string().describe('GUID do msdyn_aimodel (veja list_prompts).'),
        entradas: z.record(z.string(), z.unknown()).default({}).describe('Variáveis de entrada do prompt, ex.: {"texto":"..."}.'),
        confirmar,
      },
      WRITE_RW,
      async (a) => {
        const blocked = prodGuard(a, `executar o prompt ${a.promptId}`, a.entradas)
        if (blocked) return blocked
        const body = { version: '2.0', requestv2: { '@odata.type': '#Microsoft.Dynamics.CRM.expando', ...a.entradas } }
        const r = await api(a.ambiente, 'POST', `msdyn_aimodels(${a.promptId})/Microsoft.Dynamics.CRM.Predict`, { body })
        return ok({ resposta: r.data })
      },
    ),
  )

  add(
    defineTool(
      'execute_action',
      'Executa ação, função ou Custom API do Dataverse, vinculada a um registro (informe tabela e id) ou não. Função usa GET (somente leitura, sem confirmação); ação usa POST (no PROD exige confirmar: true). Parâmetros de função: texto vira literal entre aspas, GUID/número/booleano vão sem aspas.',
      {
        ambiente,
        nome: z.string().describe('Nome da ação/função/Custom API, ex.: WhoAmI ou cr40f_MinhaApi.'),
        tipo: z.enum(['action', 'function']).default('action').describe('action = POST; function = GET.'),
        tabela: tabela.optional().describe('Se informado junto com id, a chamada é vinculada ao registro.'),
        id: recordId.optional(),
        parametros: z.record(z.string(), z.unknown()).default({}),
        confirmar,
      },
      WRITE_DESTRUCTIVE,
      async (a) => {
        const bound = a.tabela && a.id ? `${(await session.entity(a.ambiente, a.tabela)).entitySet}(${a.id})/` : ''
        const name = bound && !a.nome.includes('.') ? `Microsoft.Dynamics.CRM.${a.nome}` : a.nome
        if (a.tipo === 'function') {
          const entries = Object.entries(a.parametros)
          const sig = entries.map(([k], i) => `${k}=@p${i}`).join(',')
          const query = entries.map(([, v], i) => `@p${i}=${encodeURIComponent(odataLiteral(v))}`).join('&')
          const r = await api(a.ambiente, 'GET', `${bound}${name}(${sig})${query ? `?${query}` : ''}`)
          return ok({ resultado: r.data })
        }
        const blocked = prodGuard(a, `executar a ação ${a.nome}`, a.parametros)
        if (blocked) return blocked
        const r = await api(a.ambiente, 'POST', `${bound}${name}`, { body: a.parametros })
        return ok({ resultado: r.data, status: r.status })
      },
    ),
  )

  const relationSchema = {
    ambiente,
    tabela,
    id: recordId,
    relacao: z.string().describe('Navigation property da relação a partir desta tabela (veja describe_table, relacoes).'),
    tabelaAlvo: tabela,
    idAlvo: recordId,
    confirmar,
  }

  add(
    defineTool(
      'associate',
      'Associa dois registros por uma relação N:N ou 1:N (POST .../$ref). No PROD exige confirmar: true.',
      relationSchema,
      WRITE_RW,
      async (a) => {
        const [e, target] = await Promise.all([session.entity(a.ambiente, a.tabela), session.entity(a.ambiente, a.tabelaAlvo)])
        const blocked = prodGuard(a, `associar ${e.logicalName}(${a.id}) a ${target.logicalName}(${a.idAlvo}) por ${a.relacao}`, {})
        if (blocked) return blocked
        await api(a.ambiente, 'POST', `${e.entitySet}(${a.id})/${a.relacao}/$ref`, {
          body: { '@odata.id': session.apiUrl(a.ambiente, `${target.entitySet}(${a.idAlvo})`) },
        })
        return ok({ associado: true })
      },
    ),
  )

  add(
    defineTool(
      'disassociate',
      'Remove a associação entre dois registros (DELETE .../$ref). Em relação de coleção informe idAlvo; em lookup (navegação de valor único) use um idAlvo qualquer só para validar e a ligação do registro é removida. No PROD exige confirmar: true.',
      {
        ...relationSchema,
        valorUnico: z.boolean().default(false).describe('true = relação de valor único (lookup): remove o vínculo sem $id.'),
      },
      WRITE_DESTRUCTIVE,
      async (a) => {
        const [e, target] = await Promise.all([session.entity(a.ambiente, a.tabela), session.entity(a.ambiente, a.tabelaAlvo)])
        const blocked = prodGuard(a, `desassociar ${e.logicalName}(${a.id}) de ${target.logicalName}(${a.idAlvo}) por ${a.relacao}`, {})
        if (blocked) return blocked
        const path = a.valorUnico
          ? `${e.entitySet}(${a.id})/${a.relacao}/$ref`
          : `${e.entitySet}(${a.id})/${a.relacao}/$ref?$id=${encodeURIComponent(session.apiUrl(a.ambiente, `${target.entitySet}(${a.idAlvo})`))}`
        await api(a.ambiente, 'DELETE', path)
        return ok({ desassociado: true })
      },
    ),
  )

  return tools
}

const preferPage = (size: number) =>
  `odata.include-annotations="OData.Community.Display.V1.FormattedValue,Microsoft.Dynamics.CRM.lookuplogicalname",odata.maxpagesize=${size}`

function pageResult(data: any): Record<string, unknown> {
  const value = Array.isArray(data.value) ? data.value : data.value === undefined ? [data] : data.value
  return clean({
    ...(data['@odata.count'] !== undefined ? { total: data['@odata.count'] } : {}),
    value,
    ...(data['@odata.nextLink'] ? { proximaPagina: data['@odata.nextLink'] } : {}),
  })
}
