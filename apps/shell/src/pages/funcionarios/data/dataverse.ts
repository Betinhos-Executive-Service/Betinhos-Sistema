import { toDateOnly } from './dates'
import { buildPatch, type DateBehavior, type PatchContext } from './patch'
import { ENTITY_SET, FIELDS, TABLE, VEICULO_TABLE } from './schema'
import { createSharePointDocs, nomeComData } from './sharepoint'
import { buildNoteHtml, type SpAnexo } from './notes'
import { ANEXOS_SUBPASTA, base64ToBlob, fileToBase64, LIMITES_PADRAO, type DataSource, type LimitesAnexo } from './source'
import type { Anotacao, Draft, FieldValue, Funcionario, ImageField, Lookup, Multa, Posse } from './types'
import type { XrmHost, XrmWebApi } from './xrm'

const FORMATTED = '@OData.Community.Display.V1.FormattedValue'
const LIST_SELECT = [...FIELDS.map((field) => field.key), '_cr40f_veiculoatual_value', 'cr40f_foto', 'cr40f_fotoid', 'cr40f_assinaturaid', 'modifiedon']
const DETAIL_SELECT = [...LIST_SELECT, 'cr40f_loginsesenhas']

type Row = Record<string, unknown>

function cleanId(value: string) {
  return value.replace(/[{}]/g, '').toLowerCase()
}

function odataString(value: string) {
  return value.replace(/'/g, "''")
}

export function getDataverseEnvironmentLabel(clientUrl: string) {
  const hostname = new URL(clientUrl).hostname.toLowerCase()
  if (hostname === 'org23b93544.crm2.dynamics.com') return 'DEV'
  if (hostname === 'orgf261ae8e.crm2.dynamics.com') return 'PROD'
  return 'Dataverse'
}

export function createXrmSource(xrm: XrmHost): DataSource {
  const api = xrm.WebApi as XrmWebApi
  const clientUrl = xrm.Utility?.getGlobalContext().getClientUrl().replace(/\/+$/, '') ?? location.origin
  const apiUrl = `${clientUrl}/api/data/v9.2`
  let patchContext: Promise<PatchContext> | null = null
  let annotationNav: Promise<string> | null = null
  let limites: Promise<LimitesAnexo> | null = null

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${apiUrl}/${path}`, { credentials: 'same-origin', headers: { Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' } })
    if (!response.ok) throw new Error(`Metadata indisponível (${response.status}) em ${path.split('?')[0]}`)
    return response.json() as Promise<T>
  }

  /** Nomes de navigation property e comportamento das datas lidos da metadata real, nunca chutados. */
  function loadPatchContext() {
    patchContext ??= (async () => {
      const [relations, veiculoEntity, dates] = await Promise.all([
        getJson<{ value: { ReferencingEntityNavigationPropertyName: string }[] }>(`EntityDefinitions(LogicalName='${TABLE}')/ManyToOneRelationships?$select=ReferencingEntityNavigationPropertyName&$filter=ReferencingAttribute eq 'cr40f_veiculoatual'`),
        getJson<{ EntitySetName: string }>(`EntityDefinitions(LogicalName='${VEICULO_TABLE}')?$select=EntitySetName`),
        getJson<{ value: { LogicalName: string; DateTimeBehavior?: { Value: DateBehavior } }[] }>(`EntityDefinitions(LogicalName='${TABLE}')/Attributes/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata?$select=LogicalName,DateTimeBehavior`),
      ])
      if (relations.value.length !== 1) throw new Error('Relacionamento de Veículo Atual não encontrado na metadata.')
      return {
        veiculoNav: relations.value[0].ReferencingEntityNavigationPropertyName,
        veiculoSet: veiculoEntity.EntitySetName,
        dateBehaviors: Object.fromEntries(dates.value.map((item) => [item.LogicalName, item.DateTimeBehavior?.Value ?? 'UserLocal'])),
      }
    })()
    patchContext.catch(() => { patchContext = null })
    return patchContext
  }

  function loadAnnotationNav() {
    annotationNav ??= getJson<{ value: { ReferencingEntityNavigationPropertyName: string }[] }>(`EntityDefinitions(LogicalName='annotation')/ManyToOneRelationships?$select=ReferencingEntityNavigationPropertyName&$filter=ReferencedEntity eq '${TABLE}'`).then((result) => {
      if (result.value.length !== 1) throw new Error('Relacionamento de anotações não encontrado na metadata.')
      return result.value[0].ReferencingEntityNavigationPropertyName
    })
    annotationNav.catch(() => { annotationNav = null })
    return annotationNav
  }

  function imageUrl(id: string, field: ImageField, imageId: unknown) {
    if (typeof imageId !== 'string' || !imageId) return null
    return `${apiUrl}/${ENTITY_SET}(${id})/${field}/$value?size=full&v=${cleanId(imageId)}`
  }

  function mapRow(row: Row, dateBehaviors: Record<string, DateBehavior> = {}): Funcionario {
    const id = cleanId(String(row.cr40f_funcionariosid))
    const values: Record<string, FieldValue> = {}
    for (const field of FIELDS) {
      const raw = row[field.key]
      values[field.key] = field.kind === 'date' ? toDateOnly(raw, dateBehaviors[field.key]) : (raw as FieldValue) ?? null
      if (field.key === 'cr40f_identificadordocolaborador' && raw != null) values[field.key] = String(raw)
    }
    const veiculoId = row._cr40f_veiculoatual_value
    return {
      id,
      values,
      veiculo: typeof veiculoId === 'string' ? { id: cleanId(veiculoId), label: String(row[`_cr40f_veiculoatual_value${FORMATTED}`] ?? 'Veículo') } : null,
      fotoThumb: typeof row.cr40f_foto === 'string' && row.cr40f_foto ? `data:image/jpeg;base64,${row.cr40f_foto}` : null,
      fotoUrl: imageUrl(id, 'cr40f_foto', row.cr40f_fotoid),
      assinaturaUrl: imageUrl(id, 'cr40f_assinatura', row.cr40f_assinaturaid),
      loginsesenhas: typeof row.cr40f_loginsesenhas === 'string' ? row.cr40f_loginsesenhas : null,
      modifiedon: typeof row.modifiedon === 'string' ? row.modifiedon : null,
    }
  }

  async function retrieveAll(entity: string, options: string) {
    const rows: Row[] = []
    let page = await api.retrieveMultipleRecords(entity, options, 500)
    rows.push(...page.entities)
    while (page.nextLink) {
      const query = page.nextLink.slice(page.nextLink.indexOf('?'))
      page = await api.retrieveMultipleRecords(entity, query, 500)
      rows.push(...page.entities)
    }
    return rows
  }

  const documentos = createSharePointDocs(api, getDataverseEnvironmentLabel(clientUrl))

  return {
    mode: 'xrm',
    envLabel: getDataverseEnvironmentLabel(clientUrl),

    async list() {
      const rows = await retrieveAll(TABLE, `?$select=${LIST_SELECT.join(',')}&$filter=statecode eq 0&$orderby=cr40f_nomecompleto asc`)
      const { dateBehaviors } = await loadPatchContext().catch(() => ({ dateBehaviors: {} as Record<string, DateBehavior> }))
      return rows.map((row) => mapRow(row, dateBehaviors))
    },

    async get(id) {
      const [row, context] = await Promise.all([api.retrieveRecord(TABLE, id, `?$select=${DETAIL_SELECT.join(',')}`), loadPatchContext().catch(() => ({ dateBehaviors: {} as Record<string, DateBehavior> }))])
      return mapRow(row, context.dateBehaviors)
    },

    async save(original: Funcionario | null, draft: Draft) {
      const payload = buildPatch(original, draft, await loadPatchContext())
      if (original) {
        if (Object.keys(payload).length) await api.updateRecord(TABLE, original.id, payload)
        return original.id
      }
      const created = await api.createRecord(TABLE, payload)
      return cleanId(created.id)
    },

    async uploadImage(id: string, field: ImageField, file: File) {
      await api.updateRecord(TABLE, id, { [field]: await fileToBase64(file) })
    },

    async saveLogins(id, html) {
      await api.updateRecord(TABLE, id, { cr40f_loginsesenhas: html })
    },

    async multas(id): Promise<Multa[]> {
      const rows = await retrieveAll('cr40f_multas', `?$select=cr40f_novacoluna,cr40f_status,cr40f_dataehorario,_cr40f_placa_value,cr40f_localdainfracao&$filter=_cr40f_motorista_value eq ${id}&$orderby=cr40f_dataehorario desc`)
      return rows.map((row) => ({
        id: cleanId(String(row.cr40f_multasid)),
        titulo: String(row.cr40f_novacoluna ?? 'Multa'),
        status: String(row[`cr40f_status${FORMATTED}`] ?? ''),
        dataHora: typeof row.cr40f_dataehorario === 'string' ? row.cr40f_dataehorario : null,
        placa: String(row[`_cr40f_placa_value${FORMATTED}`] ?? ''),
        local: String(row.cr40f_localdainfracao ?? ''),
      }))
    },

    async posses(id): Promise<Posse[]> {
      const rows = await retrieveAll('new_possedeveiculo', `?$select=new_iniciodaposse,new_fimdaposse,_new_veiculo_value&$filter=_new_motorista_value eq ${id}&$orderby=new_iniciodaposse desc`)
      return rows.map((row) => ({
        id: cleanId(String(row.new_possedeveiculoid)),
        veiculo: String(row[`_new_veiculo_value${FORMATTED}`] ?? 'Veículo'),
        inicio: typeof row.new_iniciodaposse === 'string' ? row.new_iniciodaposse : null,
        fim: typeof row.new_fimdaposse === 'string' ? row.new_fimdaposse : null,
      }))
    },

    async anotacoes(id): Promise<Anotacao[]> {
      const rows = await retrieveAll('annotation', `?$select=subject,notetext,filename,filesize,mimetype,isdocument,createdon,modifiedon,_createdby_value&$filter=_objectid_value eq ${id}&$orderby=createdon desc`)
      return rows.map((row) => ({
        id: cleanId(String(row.annotationid)),
        titulo: String(row.subject ?? ''),
        texto: String(row.notetext ?? ''),
        criadoEm: String(row.createdon ?? ''),
        modificadoEm: typeof row.modifiedon === 'string' && row.modifiedon !== row.createdon ? row.modifiedon : null,
        autor: String(row[`_createdby_value${FORMATTED}`] ?? ''),
        arquivo: row.isdocument && row.filename ? { nome: String(row.filename), tamanho: typeof row.filesize === 'number' ? row.filesize : null, tipo: typeof row.mimetype === 'string' ? row.mimetype : null } : null,
      }))
    },

    async addAnotacao(id, nota) {
      const nav = await loadAnnotationNav()
      // O arquivo vai para o SharePoint; a nota guarda só o link.
      const anexos: SpAnexo[] = []
      if (nota.arquivo) {
        const doc = await documentos.enviar(id, nota.arquivo, nomeComData(nota.arquivo.name), ANEXOS_SUBPASTA)
        anexos.push({ nome: doc.nome, caminho: doc.caminho, id: doc.id, mime: doc.mimeType, tamanho: doc.tamanho })
      }
      try {
        await api.createRecord('annotation', {
          subject: nota.titulo.trim() || null,
          notetext: buildNoteHtml(nota.texto, anexos) || null,
          [`${nav}@odata.bind`]: `/${ENTITY_SET}(${id})`,
        })
      } catch (error) {
        for (const anexo of anexos) await documentos.excluir(id, { id: anexo.id, caminho: anexo.caminho, nome: anexo.nome, tamanho: null, modificadoEm: null, mimeType: null }).catch(() => {})
        throw error
      }
    },

    async updateAnotacao(annotationId, nota) {
      await api.updateRecord('annotation', annotationId, { subject: nota.titulo.trim() || null, notetext: nota.notetext || null })
    },


    async deleteAnotacao(annotationId) {
      await api.deleteRecord('annotation', annotationId)
    },

    limitesAnexo() {
      limites ??= api.retrieveMultipleRecords('organization', '?$select=maxuploadfilesize,blockedattachments').then((result) => {
        const org = result.entities[0] ?? {}
        const max = Number(org.maxuploadfilesize)
        return {
          maxBytes: Number.isFinite(max) && max > 0 ? max : LIMITES_PADRAO.maxBytes,
          bloqueadas: typeof org.blockedattachments === 'string' ? org.blockedattachments.split(';').map((ext) => ext.trim().toLowerCase()).filter(Boolean) : LIMITES_PADRAO.bloqueadas,
        }
      }, () => LIMITES_PADRAO)
      return limites
    },

    async anexo(annotationId) {
      const row = await api.retrieveRecord('annotation', annotationId, '?$select=documentbody,filename,mimetype')
      if (typeof row.documentbody !== 'string') throw new Error('Esta anotação não tem anexo.')
      return { nome: String(row.filename ?? 'anexo'), blob: base64ToBlob(row.documentbody, String(row.mimetype ?? '')) }
    },

    documentos,

    async searchVeiculos(query): Promise<Lookup[]> {
      const term = odataString(query.trim())
      const filter = term ? `&$filter=statecode eq 0 and (contains(cr40f_placa,'${term}') or contains(cr40f_modelo,'${term}'))` : '&$filter=statecode eq 0'
      const page = await api.retrieveMultipleRecords(VEICULO_TABLE, `?$select=cr40f_veiculosid,cr40f_placa,cr40f_modelo&$orderby=cr40f_placa asc&$top=25${filter}`)
      return page.entities.map((row) => ({
        id: cleanId(String(row.cr40f_veiculosid)),
        label: [row.cr40f_placa, row.cr40f_modelo].filter(Boolean).join(' · '),
      }))
    },

    openForm(entityName, id) {
      const navigation = xrm.Navigation
      if (navigation?.openForm) { void navigation.openForm({ entityName, entityId: id }); return }
      // Shell aberto por URL direta, fora do model-driven: o formulário abre em outra aba.
      const params = new URLSearchParams({ pagetype: 'entityrecord', etn: entityName })
      if (id) params.set('id', cleanId(id))
      window.open(`${clientUrl}/main.aspx?${params}`, '_blank', 'noopener')
    },
  }
}
