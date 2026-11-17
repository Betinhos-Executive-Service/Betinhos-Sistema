// apps/shell/src/pages/frota/data/manutencaoDataverse.ts
import { carimboDeEnvio, exigirFormato, exigirSucessoDoFlow, extensaoDe, linkDoFlow, nomeArquivoEnvio, pastaDespesa, pastaManutencao, tipoFoto, VAR_FLOW_ARQUIVOS } from './arquivosManutencao'
import { chamarCustomApi } from './customApi'
import type { DateBehavior } from './dates'
import { programarPatch } from '../../geral/domain/commands'
import { cleanId, guid, mapDetalheManutencao, ref, SELECT_DETALHE_MANUTENCAO } from './mappers'
import { ANEXO_DESPESA, ENTITY_SET, MANUT, TABLE } from './schema'
import { FOTO_MAX_BYTES, fileToBase64 } from './sharepoint'
import type { ArquivosManutencao, ComandosManutencao } from './source'
import type { DespesaDaManutencao, ProgramacaoManutencao } from './types'
import { errorMessage, type XrmWebApi } from './xrm'

const TABELA_DESPESA = 'cr40f_despesaoperacional'
/** Linha da Geral (cr40f_reservadeveculos) e a navegação do motorista para o bind (descoberta, seção 8). */
const GERAL = 'cr40f_reservadeveculos'
const NAV_MOTORISTA = 'cr40f_Motorista'

/** O que as fábricas da manutenção precisam do `createXrmSource`: Web API, URL, ambiente, variáveis e metadata. */
export type DepsXrm = {
  api: XrmWebApi
  apiUrl: string
  envLabel: string
  lerVariavel: (schemaName: string) => Promise<string | null>
  metadata: <T>(path: string) => Promise<T>
  comportamentos: () => Promise<Record<string, DateBehavior>>
  /** Relógio dos nomes de arquivo (só os testes trocam). */
  agora?: () => Date
}

export function criarComandosXrm(deps: DepsXrm): ComandosManutencao {
  const { api } = deps

  /** Custom API das manutenções: RequestJson entra, ResponseJson sai (Contratos.cs). */
  async function comando(nome: string, pedido: Record<string, unknown>, falha: string): Promise<Record<string, unknown>> {
    const payload = await chamarCustomApi(deps.apiUrl, nome, { RequestJson: JSON.stringify(pedido) }, falha)
    const texto = typeof payload.ResponseJson === 'string' ? payload.ResponseJson : ''
    if (!texto) return {}
    try {
      return JSON.parse(texto) as Record<string, unknown>
    } catch {
      throw new Error(`${falha}: o servidor devolveu uma resposta inválida`)
    }
  }

  /** Linha ativa da Geral da manutenção; null = não há; undefined = a leitura falhou (a gaveta não cai por isso). */
  async function programacaoDe(id: string): Promise<ProgramacaoManutencao | null | undefined> {
    try {
      const r = await api.retrieveMultipleRecords(GERAL, `?$select=cr40f_reservadeveculosid,_cr40f_motorista_value,cr40f_dataehorriodesada&$filter=_cr40f_om_value eq ${guid(id)} and statecode eq 0&$top=1`)
      const row = r.entities[0]
      if (!row) return null
      return {
        geralId: cleanId(String(row.cr40f_reservadeveculosid)),
        // O nome vem na anotação de valor formatado, como nas outras listas da Frota (`ref` em mappers.ts).
        motorista: ref(row, '_cr40f_motorista_value'),
        saida: typeof row.cr40f_dataehorriodesada === 'string' ? row.cr40f_dataehorriodesada : null,
      }
    } catch {
      return undefined
    }
  }

  /** Despesa ligada à manutenção; null = não há; undefined = a leitura falhou. */
  async function despesaDe(id: string): Promise<DespesaDaManutencao | null | undefined> {
    try {
      const r = await api.retrieveMultipleRecords(TABELA_DESPESA, `?$select=cr40f_despesaoperacionalid,cr40f_statusoperacional,cr40f_statusanexo&$filter=_cr40f_manutencao_value eq ${guid(id)} and statecode eq 0&$orderby=createdon desc&$top=1`)
      const row = r.entities[0]
      if (!row) return null
      const num = (v: unknown) => (typeof v === 'number' ? v : null)
      return { id: cleanId(String(row.cr40f_despesaoperacionalid)), statusOperacional: num(row.cr40f_statusoperacional), statusAnexo: num(row.cr40f_statusanexo) }
    } catch {
      return undefined
    }
  }

  return {
    async detalheManutencao(id) {
      let row: Record<string, unknown>
      try {
        row = await api.retrieveRecord(TABLE.manutencoes, guid(id), `?$select=${SELECT_DETALHE_MANUTENCAO.join(',')}`)
      } catch (reason) {
        if (/does not exist|não existe/i.test(errorMessage(reason))) return null
        throw reason
      }
      const detalhe = mapDetalheManutencao(row, await deps.comportamentos())
      const [programacao, despesa] = await Promise.all([programacaoDe(id), despesaDe(id)])
      return { ...detalhe, programacao, despesa }
    },

    async criarManutencao(input) {
      const registro: Record<string, unknown> = {
        cr40f_descricao: input.descricao,
        cr40f_graudamanutencao: input.grau,
        cr40f_kmatual: input.km,
        cr40f_status: MANUT.SOLICITADO,
        'cr40f_Placa_Carro@odata.bind': `/${ENTITY_SET.veiculos}(${guid(input.veiculoId)})`,
      }
      if (input.tipo !== null) registro.cr40f_tipodoreparo = input.tipo
      if (input.solicitanteId) registro['cr40f_Solicitado_por@odata.bind'] = `/${ENTITY_SET.funcionarios}(${guid(input.solicitanteId)})`
      const { id } = await api.createRecord(TABLE.manutencoes, registro)
      return cleanId(id)
    },

    async agendarManutencao(p) {
      await comando('cr40f_ManutencaoAgendar', { manutencaoId: guid(p.manutencaoId), inicio: p.inicio, fim: p.fim, comentario: p.comentario, ...(p.grau ? { grau: p.grau } : {}) }, 'Não foi possível agendar a manutenção')
    },

    async programarManutencao(p) {
      await api.updateRecord(GERAL, guid(p.geralId), {
        [`${NAV_MOTORISTA}@odata.bind`]: `/${ENTITY_SET.funcionarios}(${guid(p.motoristaId)})`,
        cr40f_dataehorriodesada: p.saida,
        ...programarPatch(),
      })
    },

    async reprovarManutencao(id, comentario) {
      await comando('cr40f_ManutencaoReprovar', { manutencaoId: guid(id), comentario }, 'Não foi possível reprovar a manutenção')
    },

    async cancelarManutencao(id, comentario) {
      await comando('cr40f_ManutencaoCancelar', { manutencaoId: guid(id), comentario }, 'Não foi possível cancelar a manutenção')
    },

    async concluirManutencao(p) {
      const r = await comando('cr40f_ManutencaoConcluir', { ...p, origem: 'shell', manutencaoId: guid(p.manutencaoId), cidadeId: guid(p.cidadeId), realizadoPorId: guid(p.realizadoPorId) }, 'Não foi possível concluir a manutenção')
      const despesaId = typeof r.despesaId === 'string' && r.despesaId ? cleanId(r.despesaId) : ''
      if (!despesaId) throw new Error('A conclusão não devolveu a despesa. Recarregue antes de tentar de novo')
      return { despesaId, statusAnexo: Number(r.statusAnexo), geralId: typeof r.geralId === 'string' && r.geralId ? cleanId(r.geralId) : null }
    },
  }
}

const TABELA_FOTO = 'new_fotomanutencao'
const TABELA_ANEXO = 'cr40f_anexodespesaoperacional'
/** Mesmos valores que o App grava no anexo do comprovante (uploadExpenseInvoiceRemote). */
const ANEXO_STATUS_ENVIADO = 100000001
const ANEXO_TIPO_COMPROVANTE = 100000000

/** Texto da busca dentro do OData: aspas simples dobradas e codificado para a URL. */
const termo = (texto: string) => encodeURIComponent(texto.trim().replace(/'/g, "''"))

export function criarArquivosXrm(deps: DepsXrm): ArquivosManutencao {
  const { api } = deps
  const agora = deps.agora ?? (() => new Date())
  // A URL do flow tem assinatura: fica só em memória, nunca em mensagem ou log.
  let urlFlow: string | null = null

  async function enviarPeloFlow(corpo: Record<string, unknown>) {
    if (!urlFlow) {
      const url = await deps.lerVariavel(VAR_FLOW_ARQUIVOS)
      if (!url || !/^https:\/\//i.test(url)) throw new Error(`Envio de arquivos não configurado neste ambiente (variável ${VAR_FLOW_ARQUIVOS})`)
      urlFlow = url
    }
    let resposta: Response
    try {
      resposta = await fetch(urlFlow, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
    } catch {
      throw new Error('Não foi possível enviar o arquivo (rede ou bloqueio do navegador)')
    }
    let resultado: unknown = {}
    try { resultado = await resposta.json() } catch { /* corpo vazio */ }
    if (!resposta.ok) throw new Error(`O envio do arquivo falhou (HTTP ${resposta.status})`)
    exigirSucessoDoFlow(resultado)
    const link = linkDoFlow(resultado)
    if (!link) throw new Error('O arquivo foi salvo, mas o Flow não devolveu o link. Nada foi gravado')
    return link
  }

  let navegacao: Promise<{ despesa: string; enviadoPor: string }> | null = null
  /** Nome dos vínculos do anexo para o @odata.bind, lido da metadata (como o App faz). */
  function navegacaoAnexo() {
    if (!navegacao) {
      const lido = deps.metadata<{ value: { ReferencingAttribute: string; ReferencingEntityNavigationPropertyName: string }[] }>(`EntityDefinitions(LogicalName='${TABELA_ANEXO}')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName`)
        .then((r) => {
          const nome = (atributo: string) => r.value.find((rel) => rel.ReferencingAttribute === atributo)?.ReferencingEntityNavigationPropertyName
          const despesa = nome('cr40f_despesa')
          const enviadoPor = nome('cr40f_enviadopor')
          if (!despesa || !enviadoPor) throw new Error('Os anexos de despesa estão sem os vínculos de despesa e de quem enviou')
          return { despesa, enviadoPor }
        })
      lido.catch(() => { navegacao = null })
      navegacao = lido
    }
    return navegacao
  }

  return {
    async enviarArquivoManutencao(alvo, arquivo, origem, ordem) {
      if (arquivo.size > FOTO_MAX_BYTES) throw new Error(`${arquivo.name} passa de 10 MB`)
      exigirFormato(arquivo, origem === 'NOTA_FISCAL' ? 'nota' : 'foto')
      const id = guid(alvo.id)
      let modelo: string | null = null
      let placa: string | null = null
      if (alvo.veiculo) {
        const v = await api.retrieveRecord(TABLE.veiculos, guid(alvo.veiculo.id), '?$select=cr40f_modelo,cr40f_placa')
        modelo = typeof v.cr40f_modelo === 'string' ? v.cr40f_modelo : null
        placa = typeof v.cr40f_placa === 'string' ? v.cr40f_placa : null
      }
      const caminho = pastaManutencao(deps.envLabel, modelo, placa, alvo.codigo)
      const nomeArquivo = nomeArquivoEnvio(`${origem === 'NOTA_FISCAL' ? 'nota-fiscal' : 'foto'}-${ordem}`, extensaoDe(arquivo), agora())
      const tipo = tipoFoto(origem, ordem)
      const link = await enviarPeloFlow({
        caminhoCompleto: caminho, nomeArquivo, conteudoBase64: await fileToBase64(arquivo), mimeType: arquivo.type || 'application/octet-stream',
        metadados: { manutencaoId: alvo.codigo, manutencaoGuid: id, tipoFoto: tipo, origem: 'TELA_FROTA' },
      })
      await api.createRecord(TABELA_FOTO, {
        new_name: `${alvo.codigo || id} - ${origem} - ${ordem}`, new_tipofoto: tipo, new_origem: origem, new_link: link,
        new_caminho: caminho, new_nomearquivo: nomeArquivo, new_ordem: ordem,
        'new_Manutencao@odata.bind': `/${ENTITY_SET.manutencoes}(${id})`,
      })
      return { link, nomeArquivo, caminho }
    },

    async anexarNotaFiscalDespesa(despesaId, arquivos, enviadoPorId) {
      const id = guid(despesaId)
      const pessoa = guid(enviadoPorId)
      // Tudo é conferido antes de gravar qualquer coisa: arquivo inválido não deixa a despesa marcada como "falhou".
      for (const arquivo of arquivos) {
        if (arquivo.size > FOTO_MAX_BYTES) throw new Error(`${arquivo.name} passa de 10 MB`)
        exigirFormato(arquivo, 'nota')
      }
      const despesa = await api.retrieveRecord(TABELA_DESPESA, id, '?$select=cr40f_nome')
      const nome = typeof despesa.cr40f_nome === 'string' && despesa.cr40f_nome ? despesa.cr40f_nome : 'Manutenção'
      const caminho = pastaDespesa(deps.envLabel, nome)
      try {
        const nav = await navegacaoAnexo()
        for (const [indice, arquivo] of arquivos.entries()) {
          const ordem = indice + 1
          const base = `nota-fiscal-manutencao-${ordem}-${carimboDeEnvio(agora())}`
          const link = await enviarPeloFlow({
            caminhoCompleto: caminho, nomeArquivo: `${base}.${extensaoDe(arquivo)}`, conteudoBase64: await fileToBase64(arquivo), mimeType: arquivo.type || 'application/octet-stream',
            metadados: { despesaGuid: id, despesaNome: nome, tipo: 'COMPROVANTE', indice: ordem },
          })
          await api.createRecord(TABELA_ANEXO, {
            cr40f_nome: `Comprovante ${ordem} - ${nome}`, cr40f_nomearquivo: base, cr40f_urlsharepoint: link, cr40f_sharelink: link,
            cr40f_dataenvio: agora().toISOString(), cr40f_ordem: ordem, cr40f_status: ANEXO_STATUS_ENVIADO, cr40f_tipo: ANEXO_TIPO_COMPROVANTE,
            [`${nav.despesa}@odata.bind`]: `/${ENTITY_SET.despesas}(${id})`,
            [`${nav.enviadoPor}@odata.bind`]: `/${ENTITY_SET.funcionarios}(${pessoa})`,
          })
        }
        await api.updateRecord(TABELA_DESPESA, id, { cr40f_statusanexo: ANEXO_DESPESA.ENVIADO })
      } catch (reason) {
        await api.updateRecord(TABELA_DESPESA, id, { cr40f_statusanexo: ANEXO_DESPESA.FALHOU }).catch(() => undefined)
        throw reason
      }
    },

    async buscarFuncionarios(texto) {
      const filtro = `statecode eq 0 and cr40f_status eq 0${texto.trim() ? ` and contains(cr40f_nomecompleto,'${termo(texto)}')` : ''}`
      const r = await api.retrieveMultipleRecords('cr40f_funcionarios', `?$select=cr40f_funcionariosid,cr40f_nomecompleto&$filter=${filtro}&$orderby=cr40f_nomecompleto asc&$top=50`)
      return r.entities.map((row) => ({ id: cleanId(row.cr40f_funcionariosid), nome: String(row.cr40f_nomecompleto ?? '') })).filter((o) => o.nome)
    },

    async buscarCidades(texto) {
      const filtro = `cr40f_ativa eq true${texto.trim() ? ` and contains(cr40f_nome,'${termo(texto)}')` : ''}`
      const r = await api.retrieveMultipleRecords('cr40f_cidade', `?$select=cr40f_cidadeid,cr40f_nome,cr40f_uf&$filter=${filtro}&$orderby=cr40f_nome asc&$top=50`)
      return r.entities
        .map((row) => ({ id: cleanId(row.cr40f_cidadeid), nome: [row.cr40f_nome, row.cr40f_uf].filter((v): v is string => typeof v === 'string' && v !== '').join(' - ') }))
        .filter((o) => o.nome)
    },
  }
}
