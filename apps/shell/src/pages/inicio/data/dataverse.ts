import type { createMetadata, DataverseClient, Row } from '@betinhos/dataverse'
import { logAppError } from '@betinhos/ui/error-logger'
import { comunicadoDeLinha, dadosFinanceiro, indicadoresGestao, indicadoresOperacao, indicadoresTi, montarTarefas, noticiaDeLinha, primeiroNome } from '../domain/inicio'
import type { DadosVisao, Visao } from '../domain/types'
import type { Source } from './source'

// Mesmas consultas do WebResource `cr40f_HomeBetinhos` (Xrm.WebApi), agora pela Web API do shell.

const PUBLICO_TODOS = 100000000
/** Funcionários com função "Escritório": os únicos que aparecem como responsáveis no Planner. */
const FUNCAO_ESCRITORIO = 202410001

const odata = (value: string) => value.replace(/'/g, "''")

export function createDataverseSource(client: DataverseClient, metadata: ReturnType<typeof createMetadata>): Source {
  const setDe = (tabela: string) => metadata.entity(tabela).then((info) => info.entitySetName)
  const consultar = async (tabela: string, query: string) => (await client.request<{ value: Row[] }>(`${await setDe(tabela)}?${query}`)).value
  const consultarTudo = async (tabela: string, query: string) => client.getAll(`${await setDe(tabela)}?${query}`)

  let me: Promise<string> | null = null
  const usuarioId = () => (me ??= client.request<{ UserId: string }>('WhoAmI').then((r) => r.UserId.toLowerCase()).catch((e: unknown) => { me = null; throw e }))

  /** Roda as consultas em paralelo; as que falham entram como vazias e somam no erro parcial. */
  async function emParalelo<K extends string>(consultas: Record<K, Promise<Row[]>>, acao: string) {
    const chaves = Object.keys(consultas) as K[]
    const resultados = await Promise.allSettled(chaves.map((k) => consultas[k]))
    const linhas = {} as Record<K, Row[]>
    const falhas: K[] = []
    resultados.forEach((r, i) => {
      const k = chaves[i]!
      linhas[k] = r.status === 'fulfilled' ? r.value : []
      if (r.status === 'rejected') { falhas.push(k); void logAppError(r.reason, { action: acao, phase: 'load', component: k }) }
    })
    return { linhas, falhas }
  }

  return {
    mock: false,
    usuarioId,
    async primeiroNome() {
      try {
        const id = await usuarioId()
        const user = await client.request<Row>(`systemusers(${id})?$select=internalemailaddress`)
        const email = String(user.internalemailaddress ?? '').trim()
        if (!email) return ''
        const rows = await consultar('cr40f_funcionarios', `$select=new_apelido&$filter=cr40f_emailmicrosoft eq '${odata(email)}' and statecode eq 0&$top=1`)
        return primeiroNome(rows[0]?.new_apelido)
      } catch (error) {
        void logAppError(error, { action: 'carregar-nome-funcionario', phase: 'load', component: 'Saudacao' })
        return ''
      }
    },
    async compartilhados(now) {
      const agora = now.toISOString()
      const { linhas, falhas } = await emParalelo({
        comunicados: consultar('cr40f_comunicadohome', `$select=cr40f_comunicadohomeid,cr40f_titulo,cr40f_conteudo,cr40f_prioridade&$filter=cr40f_ativo eq true and cr40f_inicio le ${agora} and cr40f_fim ge ${agora} and cr40f_publico eq ${PUBLICO_TODOS}&$orderby=cr40f_prioridade desc`),
        tarefas: consultar('cr40f_plannertarefa', '$select=cr40f_plannertarefaid,cr40f_titulo,cr40f_prazo,cr40f_status,cr40f_prioridade,_cr40f_cr40f_funcionarioresponsavel_value&$filter=statecode eq 0 and cr40f_status ne 100000003 and cr40f_status ne 100000004&$orderby=cr40f_prazo asc&$top=100'),
        responsaveis: consultar('cr40f_plannertarearesponsavel', '$select=_cr40f_tarefa_value,_cr40f_funcionario_value&$filter=statecode eq 0'),
        funcionarios: consultar('cr40f_funcionarios', `$select=cr40f_funcionariosid,_cr40f_usuariodataverse_value&$filter=statecode eq 0 and cr40f_status eq 0 and cr40f_funcao eq ${FUNCAO_ESCRITORIO}`),
      }, 'carregar-dados-compartilhados')
      const erros: string[] = []
      if (falhas.includes('comunicados')) erros.push('Comunicados indisponíveis')
      if (falhas.includes('tarefas')) erros.push('Tarefas do Planner indisponíveis')
      if (falhas.includes('responsaveis') || falhas.includes('funcionarios')) erros.push('Responsáveis das tarefas indisponíveis')
      return {
        comunicados: linhas.comunicados.map(comunicadoDeLinha),
        tarefas: montarTarefas(linhas.tarefas, linhas.responsaveis, linhas.funcionarios, now),
        erro: erros.length ? erros.join(' · ') : null,
      }
    },
    async visao(visao, now) {
      const inicio = new Date(now); inicio.setHours(0, 0, 0, 0)
      const amanha = new Date(inicio); amanha.setDate(amanha.getDate() + 1)
      const depois = new Date(inicio); depois.setDate(depois.getDate() + 2)
      const mesIni = new Date(now.getFullYear(), now.getMonth(), 1)
      const mesFim = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const iso = (d: Date) => d.toISOString()
      const campos = 'cr40f_reservadeveculosid,cr40f_id,cr40f_idnovo,cr40f_status,cr40f_statusdefaturamento,cr40f_dataehorriodesada,cr40f_trajeto,cr40f_destino,_cr40f_motorista_value,_cr40f_veiculo_value'
      const reservasEntre = (ate: Date, expand = '') => consultar('cr40f_reservadeveculos', `$select=${campos}${expand}&$filter=statecode eq 0 and cr40f_dataehorriodesada ge ${iso(inicio)} and cr40f_dataehorriodesada lt ${iso(ate)}&$orderby=cr40f_dataehorriodesada asc&$top=200`)
      const acao = `carregar-perfil-${visao}`
      const erroDe = (falhas: string[]) => (falhas.length ? falhas.map((f) => `${f} indisponível`).join(' · ') : null)
      const base = (parcial: Pick<DadosVisao, 'indicadores'> & Partial<DadosVisao>, falhas: string[]): DadosVisao => ({ visao, aReceber: [], ...parcial, erro: erroDe(falhas) })
      if (visao === 'operacao') {
        const { linhas, falhas } = await emParalelo({ reservas: reservasEntre(amanha, '&$expand=cr40f_Motorista($select=cr40f_tipodevinculo)') }, acao)
        return base({ indicadores: indicadoresOperacao(linhas.reservas) }, falhas)
      }
      if (visao === 'financeiro') {
        const { linhas, falhas } = await emParalelo({
          reservas: reservasEntre(amanha),
          aReceber: reservasEntre(depois),
          passageiros: consultar('cr40f_servicosporpassageiro', '$select=cr40f_servicosporpassageiroid,_cr40f_bancodedados_value,_cr40f_geral_value&$filter=statecode eq 0&$top=500'),
          caixa: consultar('cr40f_fluxocaixalancamento', "$select=cr40f_fluxocaixalancamentoid,cr40f_name,cr40f_data,cr40f_valor,cr40f_natureza,cr40f_status&$filter=cr40f_status ne 'reversed'&$orderby=cr40f_data asc&$top=500"),
        }, acao)
        return base(dadosFinanceiro(linhas, now, inicio), falhas)
      }
      if (visao === 'ti_marketing') {
        const { linhas, falhas } = await emParalelo({
          async: consultar('asyncoperation', '$select=asyncoperationid,name,statuscode,createdon&$filter=statecode eq 0&$orderby=createdon desc&$top=100'),
          leads: consultar('lead', '$select=leadid,subject,fullname,createdon,statecode&$filter=statecode eq 0&$orderby=createdon desc&$top=100'),
          campanhas: consultar('campaign', '$select=campaignid,name,statecode&$filter=statecode eq 0&$top=100'),
        }, acao)
        return base({ indicadores: indicadoresTi(linhas) }, falhas)
      }
      const { linhas, falhas } = await emParalelo({
        reservasDoMes: consultarTudo('cr40f_reservadeveculos', `$select=cr40f_reservadeveculosid,cr40f_status,cr40f_statusdefaturamento,cr40f_dataehorriodesada,new_categoriadoitem,_new_composicaodepreco_value&$filter=cr40f_dataehorriodesada ge ${iso(mesIni)} and cr40f_dataehorriodesada lt ${iso(mesFim)} and new_categoriadoitem eq 100000000&$orderby=cr40f_dataehorriodesada asc`),
        precos: consultarTudo('cr40f_composicaodeprecos', '$select=cr40f_composicaodeprecosid,new_valortotal,new_status'),
        tarefasAtrasadas: consultarTudo('cr40f_plannertarefa', `$select=cr40f_plannertarefaid&$filter=statecode eq 0 and cr40f_status ne 100000003 and cr40f_status ne 100000004 and cr40f_prazo lt ${iso(inicio)}`),
      }, acao)
      return base({ indicadores: indicadoresGestao({ reservasDoMes: linhas.reservasDoMes, precos: linhas.precos, tarefasAtrasadas: linhas.tarefasAtrasadas.length }, now) }, falhas)
    },
    async noticias(now) {
      const rows = await consultar('cr40f_noticiaexterna', `$select=cr40f_noticiaexternaid,cr40f_titulo,cr40f_resumo,cr40f_url,cr40f_urlcompleta,cr40f_tema,cr40f_relevancia,cr40f_publicado_em,_cr40f_fonte_value&$filter=cr40f_oculta ne true and cr40f_expira_em ge ${now.toISOString()}&$orderby=cr40f_publicado_em desc&$top=24`)
      return rows.map(noticiaDeLinha)
    },
  }
}
