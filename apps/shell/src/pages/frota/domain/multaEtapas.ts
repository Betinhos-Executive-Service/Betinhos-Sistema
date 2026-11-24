import { addMonths } from '../data/dates'
import { brl } from '../data/format'
import { CANAL, MOTIVO_EMPRESA, MULTA, RESPONSAVEL } from '../data/schema'

/**
 * Espelho de packages/plugins/Cr40f.Frota.Plugin/MultaEtapas.cs (spec §3 e §5.1). A paridade é conferida por
 * packages/plugins/Cr40f.Frota.Plugin.Tests/Fixtures/multa-etapas.json (multaEtapas.test.ts e ParidadeMultaTests.cs).
 * O servidor é quem decide: a tela usa isto para mostrar o passo e travar o botão; a gravação passa pela cr40f_PassoMulta.
 */
export type Etapa = 'identificar' | 'indicar' | 'pagar' | 'acertar' | 'encerrada' | 'recurso' | 'cancelada'
export const PASSOS = ['DefinirResponsavel', 'AvisarMotorista', 'RegistrarIndicacao', 'RegistrarAceite', 'RegistrarPagamento', 'RegistrarAcerto', 'PrazoVencido', 'Cancelar', 'Recorrer', 'ResultadoRecurso', 'ConcluirDesconto', 'ReabrirDesconto', 'TermoAssinado', 'TermoContestado'] as const
export type Passo = (typeof PASSOS)[number]

export type MultaEstado = {
  status?: number | null; responsavel?: number | null; motoristaId?: string | null; motivoEmpresa?: number | null
  dataParaIndicar?: string | null; dataAviso?: string | null; /** Só escrita: dispara o aviso por push. */ avisoAutomaticoEm?: string | null; canal?: number | null; dataIndicacao?: string | null; indicado?: boolean | null
  aceiteEm?: string | null; vencimento?: string | null; pagaEm?: string | null; valorPago?: number | null; valorCheio?: number | null; competencia?: string | null
  acertoEm?: string | null; encerradaEm?: string | null; canceladaEm?: string | null; motivoCancelamento?: string | null; recursoPendente?: boolean | null
  /** Contagem de parcelas da multa, carregada pelo passo. Ausente = 0. */
  parcelasPrevistas?: number | null; parcelasDescontadas?: number | null
  contestadaEm?: string | null; aceiteDeclaradoEm?: string | null
  /** Termo vigente, carregado pelo passo (não são colunas da multa). */
  termoPendente?: boolean | null; termoParcelas?: number | null; termoPrimeiroMes?: string | null; termoValor?: number | null
}

export type DadosPasso = {
  responsavel?: 'motorista' | 'empresa'; motoristaId?: string; motivo?: 'prazo-perdido' | 'culpa-empresa'
  canal?: 'senatran' | 'dsv' | 'prefeitura'; data?: string; valorPago?: number; competencia?: string
  acerto?: 'folha' | 'empresa'; indicou?: boolean; resultado?: 'deferido' | 'indeferido'; motivoTexto?: string
  parcelas?: number
}

export type Situacao = { etapa: Etapa; pendentes: Passo[]; proximoPasso: string; proximoPrazo: string | null; prazoVencido: boolean; aguardandoPenalidade: boolean; descontando: boolean; aguardandoTermo: boolean }

export const ROTULO_PASSO: Record<Passo, string> = {
  DefinirResponsavel: 'Definir o responsável',
  AvisarMotorista: 'Avisar o motorista',
  RegistrarIndicacao: 'Indicar no órgão',
  RegistrarAceite: 'Conferir o aceite na CNH Digital',
  RegistrarPagamento: 'Pagar a guia',
  RegistrarAcerto: 'Acertar',
  PrazoVencido: 'Prazo vencido: responder',
  Cancelar: 'Cancelar',
  Recorrer: 'Entrar com recurso',
  ResultadoRecurso: 'Registrar o resultado do recurso',
  ConcluirDesconto: 'Concluir desconto',
  ReabrirDesconto: 'Reabrir desconto',
  TermoAssinado: 'Termo assinado',
  TermoContestado: 'Termo contestado',
}

export const ROTULO_ETAPA: Record<Etapa, string> = {
  identificar: '1. Identificar o responsável', indicar: '2. Indicar no órgão', pagar: '3. Pagar', acertar: '4. Acertar',
  encerrada: 'Encerrada', recurso: 'Em recurso', cancelada: 'Cancelada',
}

const ANTES: Partial<Record<Passo, string>> = {
  AvisarMotorista: 'Avise o motorista antes de registrar a indicação.',
  RegistrarIndicacao: 'Registre a indicação antes do aceite.',
}

export function etapaDe(status: number | null | undefined): Etapa {
  switch (status) {
    case MULTA.NOTIFICADO: return 'indicar'
    case MULTA.INDICADA: return 'pagar'
    case MULTA.PAGO: return 'acertar'
    case MULTA.FINALIZADO: case MULTA.DESCONTADO: return 'encerrada'
    case MULTA.RECURSO: return 'recurso'
    case MULTA.CANCELADA: return 'cancelada'
    default: return 'identificar'
  }
}

export const aberta = (etapa: Etapa) => etapa !== 'encerrada' && etapa !== 'cancelada'

/** Responsável vazio (multas antigas) vale o motorista do lookup. */
export const responsavelEfetivo = (m: MultaEstado): number | null => m.responsavel ?? (m.motoristaId ? RESPONSAVEL.MOTORISTA : null)

export function prazoVencido(m: MultaEstado, hoje: string) {
  const etapa = etapaDe(m.status)
  // Com a indicação já registrada o prazo cumpriu o papel: sobra o aceite, que segue como passo normal.
  return (etapa === 'identificar' || etapa === 'indicar') && m.dataIndicacao == null && m.dataParaIndicar != null && m.dataParaIndicar < hoje
}

/** Acertar -> folha já gravado: a multa espera as parcelas serem lançadas (spec RH §3). */
export const descontando = (m: MultaEstado) => etapaDe(m.status) === 'acertar' && !!m.competencia && !!m.acertoEm

export function avaliar(m: MultaEstado, hoje: string): Situacao {
  const etapa = etapaDe(m.status)
  const vencido = prazoVencido(m, hoje)
  const pendentes: Passo[] = []
  let aguardandoPenalidade = false
  const emDesconto = descontando(m)
  if (vencido) pendentes.push('PrazoVencido')
  else if (etapa === 'identificar') pendentes.push('DefinirResponsavel')
  else if (etapa === 'indicar') {
    if (m.dataAviso == null) pendentes.push('AvisarMotorista')
    if (m.dataIndicacao == null || m.canal == null) pendentes.push('RegistrarIndicacao')
    else if (m.canal === CANAL.SENATRAN && m.aceiteEm == null) pendentes.push('RegistrarAceite')
  } else if (etapa === 'pagar') {
    if (m.vencimento == null) aguardandoPenalidade = true
    else pendentes.push('RegistrarPagamento')
  } else if (etapa === 'acertar') { if (!emDesconto) pendentes.push('RegistrarAcerto') }
  else if (etapa === 'recurso') pendentes.push('ResultadoRecurso')
  const proximoPrazo = (etapa === 'identificar' || etapa === 'indicar' ? m.dataParaIndicar : etapa === 'pagar' ? m.vencimento : null) ?? null
  const aguardandoTermo = etapa === 'indicar' && !vencido && m.termoPendente === true && m.dataAviso == null
  const proximoPasso = aguardandoTermo ? 'Aguardando o motorista assinar o termo' : pendentes.length ? rotuloPendente(m, pendentes[0]) : aguardandoPenalidade ? 'Aguardando penalidade' : emDesconto ? 'Descontando em folha' : etapa === 'cancelada' ? 'Cancelada' : etapa === 'encerrada' ? 'Encerrada' : ''
  return { etapa, pendentes, proximoPasso, proximoPrazo, prazoVencido: vencido, aguardandoPenalidade, descontando: emDesconto, aguardandoTermo }
}

/** Data inicial do campo do aceite: a que o motorista declarou (o gestor pode trocar). */
export const dataAceiteInicial = (m: MultaEstado): string | undefined => m.aceiteDeclaradoEm?.slice(0, 10)

function rotuloPendente(m: MultaEstado, passo: Passo): string {
  if (passo === 'DefinirResponsavel' && m.contestadaEm != null) return 'Decidir a contestação do motorista'
  if (passo === 'RegistrarAceite' && m.aceiteDeclaradoEm != null) return `Conferir o aceite na CNH Digital (motorista declarou em ${m.aceiteDeclaradoEm.slice(8, 10)}/${m.aceiteDeclaradoEm.slice(5, 7)})`
  return ROTULO_PASSO[passo]
}

/** Parcelas de entrada nova (termo e acerto na folha). Registros antigos com 4 a 12 continuam legíveis. */
export const MAXIMO_PARCELAS = 3
const JANELA_MESES = 12
const PASSO_FORA = 'Este passo não vale para a etapa atual da multa. Recarregue a tela.'
export const competenciaDe = (mes: string) => `${mes.slice(0, 7)}-01`
export const mesBr = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`
export function janelaCompetencia(hoje: string) {
  const mes = competenciaDe(hoje)
  return { de: addMonths(mes, -1), ate: addMonths(mes, JANELA_MESES) }
}
/** Primeiro mês do Acertar -> folha com termo assinado: o do termo, ou o mês de hoje se ele saiu da janela do RH. */
export function mesDoTermo(m: MultaEstado, hoje: string): string | null {
  if (m.termoParcelas == null || m.termoPrimeiroMes == null) return null
  const { de, ate } = janelaCompetencia(hoje)
  const mes = competenciaDe(m.termoPrimeiroMes)
  return mes < de || mes > ate ? competenciaDe(hoje) : mes
}
export type ParcelaPlano = { numero: number; total: number; competencia: string; valor: number }
export function dividirParcelas(valor: number, n: number, primeira: string): ParcelaPlano[] {
  const centavos = Math.round(valor * 100)
  const parcela = Math.floor(centavos / n)
  const inicio = competenciaDe(primeira)
  return Array.from({ length: n }, (_, i) => ({
    numero: i + 1, total: n, competencia: addMonths(inicio, i),
    valor: (i === n - 1 ? centavos - parcela * (n - 1) : parcela) / 100,
  }))
}
const brlTexto = (v: number) => brl(v).replace(/\u00a0/g, ' ')
export function previaParcelas(valor: number, n: number) {
  const plano = dividirParcelas(valor, n, '2000-01')
  const primeira = plano[0].valor
  const ultima = plano[n - 1].valor
  return ultima === primeira ? `${n}× ${brlTexto(primeira)}` : `${n}× ${brlTexto(primeira)} · última ${brlTexto(ultima)}`
}

const CANAL_DE: Record<string, number> = { senatran: CANAL.SENATRAN, dsv: CANAL.DSV, prefeitura: CANAL.PREFEITURA }
const MOTIVO_DE: Record<string, number> = { 'prazo-perdido': MOTIVO_EMPRESA.PRAZO_PERDIDO, 'culpa-empresa': MOTIVO_EMPRESA.CULPA_EMPRESA }
const canalDe = (c: string | undefined) => (c ? CANAL_DE[c] ?? null : null)
const motivoDe = (c: string | undefined) => (c ? MOTIVO_DE[c] ?? null : null)

function dataRuim(data: string | undefined, hoje: string, vazio: string): string | null {
  if (!data || !data.trim()) return vazio
  const d = new Date(`${data}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== data) return 'Data inválida.'
  return data > hoje ? 'A data não pode ser no futuro.' : null
}

function validarFolha(m: MultaEstado, d: DadosPasso, hoje: string): string | null {
  if (!d.competencia || !/^\d{4}-(0[1-9]|1[0-2])(-01)?$/.test(d.competencia)) return 'Informe o mês do desconto.'
  if (!((m.valorPago ?? 0) > 0)) return 'Registre o pagamento antes de lançar na folha.'
  if (!((m.valorCheio ?? 0) > 0)) return 'A multa não tem o valor cheio; informe o valor da guia ou vincule a infração do catálogo.'
  if (!m.motoristaId?.trim()) return 'A multa não tem motorista; defina o responsável antes.'
  if (m.termoParcelas != null) {
    if (m.termoValor != null && (m.valorPago ?? 0) > m.termoValor) return 'O valor pago passou do valor do termo; envie um termo novo ou registre como empresa assume.'
    if ((d.parcelas ?? 1) !== m.termoParcelas) return `O motorista assinou ${m.termoParcelas} parcela(s); o número de parcelas não muda.`
    const mes = mesDoTermo(m, hoje)!
    return competenciaDe(d.competencia) === mes ? null : `O primeiro mês segue o termo assinado (${mesBr(mes)}).`
  }
  const { de, ate } = janelaCompetencia(hoje)
  const c = competenciaDe(d.competencia)
  if (c < de || c > ate) return `Escolha um mês entre ${mesBr(de)} e ${mesBr(ate)}.`
  const n = d.parcelas ?? 1
  return n < 1 || n > MAXIMO_PARCELAS ? 'Escolha de 1 a 3 parcelas.' : null
}

export function validarPasso(m: MultaEstado, passo: string, d: DadosPasso, hoje: string): string | null {
  if (!(PASSOS as readonly string[]).includes(passo)) return `Passo desconhecido: ${passo}.`
  const s = avaliar(m, hoje)
  if (s.prazoVencido && passo !== 'PrazoVencido') return 'O prazo de indicação venceu. Responda se a multa foi indicada antes de seguir.'
  if (passo === 'TermoAssinado') {
    if (s.etapa !== 'indicar' || m.dataAviso != null) return PASSO_FORA
    return dataRuim(d.data, hoje, 'Informe a data da assinatura.')
  }
  if (passo === 'TermoContestado') return s.etapa === 'indicar' && m.dataAviso == null ? null : PASSO_FORA
  if (passo === 'PrazoVencido') {
    if (!s.prazoVencido) return 'O prazo de indicação ainda não venceu.'
    if (typeof d.indicou !== 'boolean') return 'Responda se a multa foi indicada.'
    if (!d.indicou) return null
    const ruim = canalDe(d.canal) === null ? 'Escolha o canal da indicação.' : dataRuim(d.data, hoje, 'Informe a data da indicação.')
    if (ruim) return ruim
    // Sem responsável efetivo, ou com a contestação do motorista pendente, a indicação precisa dizer quem foi indicado.
    return (responsavelEfetivo(m) === null || m.contestadaEm != null) && !d.motoristaId?.trim() ? 'Escolha o motorista que foi indicado.' : null
  }
  if (passo === 'Cancelar') {
    if (!aberta(s.etapa)) return 'Esta multa já está encerrada.'
    if ((m.parcelasPrevistas ?? 0) > 0) return 'Esta multa tem parcelas previstas na folha e não pode ser cancelada.'
    const motivo = d.motivoTexto?.trim() ?? ''
    if (motivo.length < 5) return 'Escreva o motivo do cancelamento.'
    return motivo.length > 2000 ? 'O motivo do cancelamento passa de 2.000 caracteres.' : null
  }
  if (passo === 'ConcluirDesconto') {
    if (!descontando(m)) return 'Esta multa não está descontando em folha.'
    return (m.parcelasPrevistas ?? 0) > 0 || !((m.parcelasDescontadas ?? 0) > 0) ? 'Ainda há parcelas previstas desta multa.' : null
  }
  if (passo === 'ReabrirDesconto') {
    if (s.etapa !== 'encerrada' || !m.competencia || !m.acertoEm) return 'Só reabre multa encerrada pelo desconto em folha.'
    return (m.parcelasPrevistas ?? 0) > 0 ? null : 'Não há parcela prevista para reabrir a multa.'
  }
  if (passo === 'Recorrer') return s.etapa === 'identificar' || s.etapa === 'indicar' || s.etapa === 'pagar' ? null : 'Só dá para entrar com recurso antes do pagamento.'
  if (!s.pendentes.length) {
    return s.aguardandoPenalidade && passo === 'RegistrarPagamento'
      ? 'A penalidade ainda não chegou: grave o vencimento antes de registrar o pagamento.'
      : 'Este passo não vale para a etapa atual da multa. Recarregue a tela.'
  }
  if (!s.pendentes.includes(passo as Passo)) return 'Este passo não vale para a etapa atual da multa. Recarregue a tela.'
  if (m.termoPendente === true && passo === 'RegistrarIndicacao') return 'Aguarde a assinatura do termo ou cancele o termo.'
  if (m.termoPendente === true && passo === 'AvisarMotorista') return 'Cancele o termo antes de avisar pelo WhatsApp.'
  if (s.pendentes[0] !== passo) return ANTES[s.pendentes[0]] ?? 'Siga a ordem dos passos.'
  switch (passo as Passo) {
    case 'DefinirResponsavel':
      if (d.responsavel === 'empresa') return null
      if (d.responsavel !== 'motorista') return 'Escolha o responsável: motorista ou empresa.'
      return d.motoristaId?.trim() ? null : 'Escolha o motorista.'
    case 'AvisarMotorista':
      return d.data?.trim() ? dataRuim(d.data, hoje, '') : null
    case 'RegistrarIndicacao':
      return canalDe(d.canal) === null ? 'Escolha o canal da indicação.' : dataRuim(d.data, hoje, 'Informe a data da indicação.')
    case 'RegistrarAceite':
      return dataRuim(d.data, hoje, 'Informe a data do aceite.')
    case 'RegistrarPagamento':
      return dataRuim(d.data, hoje, 'Informe a data do pagamento.') ?? (typeof d.valorPago === 'number' && d.valorPago > 0 ? null : 'Informe o valor pago.')
    case 'RegistrarAcerto':
      if (d.acerto === 'folha') return validarFolha(m, d, hoje)
      if (d.acerto === 'empresa') return motivoDe(d.motivo) === null ? 'Escolha o motivo de a empresa assumir.' : null
      return 'Escolha: lancei na folha ou empresa assume.'
    case 'ResultadoRecurso':
      return d.resultado === 'deferido' || d.resultado === 'indeferido' ? null : 'Escolha o resultado do recurso: deferido ou indeferido.'
    default:
      return null
  }
}

export function aplicarPasso(m: MultaEstado, passo: Passo, d: DadosPasso, hoje: string): MultaEstado {
  const n: MultaEstado = { ...m }
  switch (passo) {
    case 'DefinirResponsavel':
      n.contestadaEm = null
      if (d.responsavel === 'empresa') Object.assign(n, { responsavel: RESPONSAVEL.EMPRESA, motivoEmpresa: MOTIVO_EMPRESA.CULPA_EMPRESA, status: MULTA.INDICADA })
      else Object.assign(n, { responsavel: RESPONSAVEL.MOTORISTA, motoristaId: d.motoristaId, status: MULTA.NOTIFICADO, avisoAutomaticoEm: hoje })
      break
    case 'AvisarMotorista':
      n.dataAviso = d.data?.trim() ? d.data : hoje
      break
    case 'RegistrarIndicacao':
      Object.assign(n, { canal: canalDe(d.canal), dataIndicacao: d.data, indicado: true })
      if (n.canal !== CANAL.SENATRAN || n.aceiteEm != null) n.status = MULTA.INDICADA
      break
    case 'RegistrarAceite':
      Object.assign(n, { aceiteEm: d.data, status: MULTA.INDICADA })
      break
    case 'RegistrarPagamento':
      Object.assign(n, { pagaEm: d.data, valorPago: d.valorPago })
      // Multa da Empresa: o acerto "empresa assume" (com o motivo já gravado) sai junto e a multa encerra.
      if (responsavelEfetivo(m) === RESPONSAVEL.EMPRESA) Object.assign(n, { acertoEm: d.data, encerradaEm: d.data, status: MULTA.FINALIZADO })
      else n.status = MULTA.PAGO
      break
    case 'RegistrarAcerto':
      if (d.acerto === 'folha') Object.assign(n, { competencia: competenciaDe(d.competencia!), acertoEm: hoje }) // segue em Acertar até a última parcela
      else Object.assign(n, { motivoEmpresa: motivoDe(d.motivo), acertoEm: hoje, encerradaEm: hoje, status: MULTA.FINALIZADO })
      break
    case 'ConcluirDesconto':
      Object.assign(n, { encerradaEm: d.data?.trim() ? d.data : hoje, status: MULTA.FINALIZADO })
      break
    case 'ReabrirDesconto':
      Object.assign(n, { encerradaEm: null, status: MULTA.PAGO })
      break
    case 'PrazoVencido':
      if (d.indicou === true) {
        Object.assign(n, { canal: canalDe(d.canal), dataIndicacao: d.data, indicado: true })
        if (d.motoristaId?.trim()) Object.assign(n, { motoristaId: d.motoristaId, responsavel: RESPONSAVEL.MOTORISTA })
      } else Object.assign(n, { responsavel: RESPONSAVEL.EMPRESA, motivoEmpresa: MOTIVO_EMPRESA.PRAZO_PERDIDO })
      n.contestadaEm = null
      n.status = MULTA.INDICADA
      break
    case 'TermoAssinado':
      n.dataAviso = d.data
      break
    case 'TermoContestado':
      Object.assign(n, { contestadaEm: hoje, status: MULTA.NOTIFICAR })
      break
    case 'Cancelar':
      Object.assign(n, { motivoCancelamento: d.motivoTexto!.trim(), canceladaEm: hoje, status: MULTA.CANCELADA })
      break
    case 'Recorrer':
      Object.assign(n, { recursoPendente: true, status: MULTA.RECURSO })
      break
    case 'ResultadoRecurso':
      n.recursoPendente = false
      if (d.resultado === 'deferido') Object.assign(n, { encerradaEm: hoje, status: MULTA.FINALIZADO })
      else n.status = MULTA.INDICADA
      break
  }
  return n
}

const CAMPOS = ['status', 'responsavel', 'motoristaId', 'motivoEmpresa', 'dataAviso', 'avisoAutomaticoEm', 'canal', 'dataIndicacao', 'indicado', 'aceiteEm', 'pagaEm', 'valorPago', 'competencia', 'acertoEm', 'encerradaEm', 'canceladaEm', 'motivoCancelamento', 'recursoPendente', 'contestadaEm'] as const

/** Campos que mudaram, no formato `campo=valor` (o mesmo de MultaEtapas.Formatar). */
export function mudancas(antes: MultaEstado, depois: MultaEstado): string[] {
  return CAMPOS.flatMap((campo) => {
    const a = antes[campo] ?? null
    const b = depois[campo] ?? null
    return a === b ? [] : [`${campo}=${b === null ? 'null' : String(b)}`]
  })
}
