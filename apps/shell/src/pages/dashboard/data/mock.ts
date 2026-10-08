import { CAT_ITEM_SERVICO, CSV_2026_FIM, CSV_2026_INICIO, MULTA_NOTIFICAR, SEM_CLIENTE, SEM_MOTORISTA } from '../domain/codes'
import { dayKey } from '../domain/periodo'
import type { CategoriaDespesa, Dados, Despesa, EventoConducao, FormaPagamento, Funcionario, Manutencao, Multa, Pagante, Reserva, TelemetriaDia, Veiculo, Viagem } from '../domain/types'

/** Gerador determinístico (mulberry32): o mock mostra sempre os mesmos números. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DIA = 86_400_000
const HORA = 3_600_000
const CLIENTES = ['Tenaris', 'Embraer', 'Particular', 'Vale', 'Natura', 'Itaú BBA', SEM_CLIENTE]
const BETINHOS = 'BETINHOS L AUTO LTDA EPP'
const DEPAULA = 'DEPAULA L AUTO LTDA EPP'
const MOTORISTAS = [
  { id: 'mock-m1', apelido: 'Oliveira', nome: 'Carlos Oliveira', empresa: BETINHOS }, { id: 'mock-m2', apelido: 'Fábio', nome: 'Fábio Andrade', empresa: BETINHOS },
  { id: 'mock-m3', apelido: 'Renata', nome: 'Renata Lima', empresa: BETINHOS }, { id: 'mock-m4', apelido: 'Marcos', nome: 'Marcos Pereira', empresa: BETINHOS },
  { id: 'mock-m5', apelido: 'Juliana', nome: 'Juliana Costa', empresa: DEPAULA }, { id: 'mock-m6', apelido: 'Paulo', nome: 'Paulo Henrique Souza', empresa: DEPAULA },
]
const VEICULOS: Veiculo[] = [
  { id: 'mock-v1', statusLabel: 'Ativo', categoria: 'Propria', placa: 'BTN1A23', marca: 'Toyota', modelo: 'Corolla Altis', blindado: true, ano: 2023 },
  { id: 'mock-v2', statusLabel: 'Ativo', categoria: 'Propria', placa: 'BTN2B34', marca: 'Toyota', modelo: 'SW4', blindado: true, ano: 2022 },
  { id: 'mock-v3', statusLabel: 'Em manutenção', categoria: 'Propria', placa: 'BTN3C45', marca: 'Chevrolet', modelo: 'Spin', blindado: false, ano: 2021 },
  { id: 'mock-v4', statusLabel: 'Disponível', categoria: 'Terceirizada', placa: 'TRC4D56', marca: 'Mercedes-Benz', modelo: 'Sprinter', blindado: false, ano: 2020 },
  { id: 'mock-v5', statusLabel: 'Disponível', categoria: 'Terceirizada', placa: 'TRC5E67', marca: 'Volkswagen', modelo: 'Virtus', blindado: false, ano: 2024 },
]
/** Fora de VEICULOS para não mudar o sorteio de veículos das reservas: entra em ~5% delas por um gerador à parte. */
const VEICULO_ALUGUEL: Veiculo = { id: 'mock-v6', statusLabel: 'Disponível', categoria: 'Aluguel', placa: 'ALG6F78', marca: 'Fiat', modelo: 'Cronos', blindado: false, ano: 2025 }
const TIPOS = ['Executivo', 'Blindado', 'Van']
const TIPOS_SERVICO = ['São Paulo', 'Guarulhos', 'Congonhas', 'Campinas', 'Vale do Paraíba', 'Rio de Janeiro', 'Dentro de São Paulo']
const FAT = [
  { code: 202410010, label: 'Pago' }, { code: 202410000, label: 'Pendente' }, { code: 202410008, label: 'Mensal' }, { code: 202410006, label: 'Pagante em viagem' },
]

/** Perfil de condução por motorista (mesma ordem de MOTORISTAS): eventos e minutos de motor ocioso por 100 km. Dá notas altas, médias e baixas. */
const PERFIS_CONDUCAO = [
  { acel: 0.3, freio: 0.4, ocioso: 3 }, { acel: 1.5, freio: 1.2, ocioso: 9 }, { acel: 0.9, freio: 0.7, ocioso: 6 },
  { acel: 3.4, freio: 3.0, ocioso: 19 }, { acel: 2.0, freio: 1.6, ocioso: 12 }, { acel: 1.2, freio: 1.0, ocioso: 8 },
]
const DESCRICAO_EVENTO: Record<string, string> = {
  hardAcceleration: 'Aceleração brusca', hardBraking: 'Frenagem brusca', hardCornering: 'Curva brusca', routeOverspeed: 'Excesso de velocidade na rota',
}

/**
 * Viagens, eventos e telemetria do Infleet dos últimos ~13 meses. Cada motorista (exceto o último) usa o seu veículo, então tem nota
 * quando passa de 100 km no mês; nos meses 3, 6, 9 e 12 o último motorista divide o veículo do primeiro e nenhum dos dois recebe nota.
 * Gerador próprio: não mexe na sequência aleatória das reservas. Velocidades, consumo e excessos usam um segundo gerador, para não
 * mudar a sequência que define km, eventos de score e ociosidade.
 */
function criarInfleetMock(now: Date) {
  const rand = rng(20261009)
  const extra = rng(20261014)
  const viagens: Viagem[] = []
  const eventos: EventoConducao[] = []
  const porVeiculoDia = new Map<string, TelemetriaDia & { somaVel: number }>()
  const ultimo = MOTORISTAS.length - 1
  for (let atras = 400; atras >= 0; atras--) {
    const dia = dayKey(new Date(now.getTime() - atras * DIA).toISOString())
    const mes = dia.slice(0, 7)
    const compartilhado = Number(dia.slice(5, 7)) % 3 === 0
    MOTORISTAS.forEach((m, i) => {
      if (i === ultimo && !compartilhado) return
      if (rand() < 0.2) return
      const perfil = PERFIS_CONDUCAO[i]
      const veiculoId = VEICULOS[i === ultimo ? 0 : i].id
      const km = Math.round((25 + rand() * 50) * 10) / 10
      const velocidadeMedia = Math.round(35 + extra() * 30)
      const velocidadeMaxima = Math.round(velocidadeMedia + 20 + extra() * 45)
      const combustivelL = Math.round((km / (8 + extra() * 5)) * 100) / 100
      viagens.push({ dia, mes, veiculoId, motoristaId: m.id, distancia: km, velocidadeMedia, velocidadeMaxima, combustivelL, custoCombustivel: Math.round(combustivelL * 610) / 100 })
      const evento = (tipo: string, velocidade = 0, limite = 0): EventoConducao => ({ dia, mes, motoristaId: m.id, tipo, veiculoId, descricao: DESCRICAO_EVENTO[tipo], velocidade, limite })
      for (const [tipo, taxa] of [['hardAcceleration', perfil.acel], ['hardBraking', perfil.freio]] as const) {
        const qtd = Math.floor((km / 100) * taxa + rand())
        for (let k = 0; k < qtd; k++) eventos.push(evento(tipo))
      }
      if (rand() < 0.3) eventos.push(evento('hardCornering'))
      const excesso = extra() < 0.1
      if (excesso) eventos.push(evento('routeOverspeed', Math.round(92 + extra() * 30), 80))
      const chave = `${veiculoId}|${dia}`
      const t = porVeiculoDia.get(chave) ?? {
        dia, mes, veiculoId, ociosoMin: 0, distanciaKm: 0, velocidadeMedia: 0, velocidadeMaxima: 0, excessos: 0, autonomia: 0, tempoAcimaMin: 0, somaVel: 0,
      }
      t.ociosoMin += Math.round((km / 100) * perfil.ocioso * (0.7 + rand() * 0.6))
      t.distanciaKm = Math.round((t.distanciaKm + km) * 10) / 10
      t.somaVel += velocidadeMedia * km
      t.velocidadeMedia = Math.round((t.somaVel / t.distanciaKm) * 10) / 10
      t.velocidadeMaxima = Math.max(t.velocidadeMaxima, velocidadeMaxima)
      t.autonomia = Math.round((km / combustivelL) * 10) / 10
      if (excesso) { t.excessos += 1; t.tempoAcimaMin += 1 + Math.floor(extra() * 4) }
      porVeiculoDia.set(chave, t)
    })
  }
  const telemetria: TelemetriaDia[] = [...porVeiculoDia.values()].map(({ somaVel: _, ...t }) => t)
  return { viagens, eventos, telemetria }
}

const FORMAS_PAGANTE = [
  { code: 202410000, label: 'Cartão de crédito', peso: 0.45 }, { code: 202410002, label: 'Pix', peso: 0.4 }, { code: 202410001, label: 'Pedido de compra', peso: 0.15 },
]
const STATUS_PAGANTE_NAO_PAGO = [
  { code: 202410001, label: 'Pendente' }, { code: 202410001, label: 'Pendente' }, { code: 202410003, label: 'Negado' }, { code: 202410004, label: 'Expirado' },
  { code: 202410005, label: 'Cancelado' },
]
const PESSOAS = ['Ana Souza', 'Bruno Martins', 'Cecília Prado', 'Diego Ramos', 'Elisa Nogueira', 'Felipe Araújo', 'Gabriela Rocha', 'Henrique Lopes']

/**
 * Um pagante por OP (às vezes dois, dividindo o valor), criado depois da finalização (ou antes da saída, em serviço futuro); nunca no futuro.
 * Reservas de jan–mar/2026 ficam de fora: a carga as troca pelo CSV (sem OP), e o pagante ficaria sem reserva.
 */
function criarPagantesMock(reservas: Reserva[], now: Date): Pagante[] {
  const rand = rng(20261012)
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]
  const pagantes: Pagante[] = []
  for (const r of reservas) {
    if (!r.opId || (r.dia >= CSV_2026_INICIO && r.dia <= CSV_2026_FIM)) continue
    const base = r.finalizadoRaw ? Date.parse(r.finalizadoRaw) : r.saidaMs - DIA
    const partes = rand() < 0.2 ? [0.6, 0.4] : [1]
    partes.forEach((parte, i) => {
      const criadoMs = base + Math.floor(rand() * 5) * DIA + Math.floor(rand() * 10) * HORA
      const sorteioForma = rand()
      const sorteioStatus = rand()
      const prazoPagamento = (0.1 + rand() * 8) * DIA
      const pessoaIdx = Math.floor(rand() * PESSOAS.length)
      if (criadoMs > now.getTime()) return
      let acumulado = 0
      const forma = FORMAS_PAGANTE.find((f) => (acumulado += f.peso) > sorteioForma) ?? FORMAS_PAGANTE[0]
      // Pagamento que cairia no futuro ainda não aconteceu: fica pendente (sem depender dos milissegundos de `now`).
      const pago = sorteioStatus < 0.78 && criadoMs + prazoPagamento <= now.getTime()
      const status = pago ? { code: 202410002, label: 'Pago' } : pick(STATUS_PAGANTE_NAO_PAGO)
      const criadoRaw = new Date(criadoMs).toISOString()
      pagantes.push({
        id: `mock-pag-${r.id}-${i + 1}`, opId: r.opId, pessoaId: `mock-pe-${pessoaIdx + 1}`, pessoa: PESSOAS[pessoaIdx],
        valor: Math.round(r.valor * parte * 100) / 100, forma: forma.code, formaLabel: forma.label, status: status.code, statusLabel: status.label,
        criadoRaw, criadoDia: dayKey(criadoRaw), primeiroPagamentoRaw: pago ? new Date(criadoMs + prazoPagamento).toISOString() : '',
      })
    })
  }
  return pagantes
}

const CATEGORIAS_DESPESA: CategoriaDespesa[] = [
  { id: 'mock-cat-1', nome: 'Alimentação', grupoDre: 'Custos operacionais' }, { id: 'mock-cat-2', nome: 'Hospedagem', grupoDre: 'Viagens' },
  { id: 'mock-cat-3', nome: 'Combustível', grupoDre: 'Custos operacionais' }, { id: 'mock-cat-4', nome: 'Pedágio', grupoDre: 'Custos operacionais' },
  { id: 'mock-cat-5', nome: 'Estacionamento', grupoDre: 'Custos operacionais' }, { id: 'mock-cat-6', nome: 'Lavagem', grupoDre: 'Manutenção da frota' },
]
/** Peso e faixa de valor por categoria (mesma ordem de CATEGORIAS_DESPESA); hospedagem cruza a meta (R$ 150) e o teto (R$ 200). */
const PERFIL_DESPESA = [
  { peso: 0.35, min: 25, max: 90 }, { peso: 0.12, min: 110, max: 240 }, { peso: 0.2, min: 120, max: 380 },
  { peso: 0.15, min: 8, max: 45 }, { peso: 0.1, min: 15, max: 60 }, { peso: 0.08, min: 40, max: 90 },
]
const FORMAS_DESPESA: FormaPagamento[] = [{ id: 'mock-fp-1', nome: 'Cartão corporativo' }, { id: 'mock-fp-2', nome: 'Pix' }, { id: 'mock-fp-3', nome: 'Reembolso' }]
const STATUS_FINANCEIRO = [
  { code: 100000002, ate: 0.75 }, { code: 100000001, ate: 0.9 }, { code: 100000000, ate: 0.97 }, { code: 100000003, ate: 1 },
]

/** Despesas de jan/2025 até hoje: 0 a 2 por dia, do motorista e (quando houver) de uma reserva dele no mesmo dia. */
function criarDespesasMock(reservas: Reserva[], funcionarios: Funcionario[], now: Date): Despesa[] {
  const rand = rng(20261015)
  const reservaDoDia = new Map<string, string>()
  for (const r of reservas) if (r.motoristaId && !reservaDoDia.has(`${r.dia}|${r.motoristaId}`)) reservaDoDia.set(`${r.dia}|${r.motoristaId}`, r.id)
  const despesas: Despesa[] = []
  let n = 0
  for (let t = Date.parse('2025-01-01T15:00:00Z'); t <= now.getTime(); t += DIA) {
    const qtd = Math.floor(rand() * 3)
    for (let k = 0; k < qtd; k++) {
      const func = funcionarios[Math.floor(rand() * funcionarios.length)]
      const sorteio = rand()
      let acumulado = 0
      const ci = Math.max(0, PERFIL_DESPESA.findIndex((p) => (acumulado += p.peso) > sorteio))
      const cat = CATEGORIAS_DESPESA[ci]
      const perfil = PERFIL_DESPESA[ci]
      const forma = FORMAS_DESPESA[Math.floor(rand() * FORMAS_DESPESA.length)]
      const valor = Math.round((perfil.min + rand() * (perfil.max - perfil.min)) * 100) / 100
      const fin = rand()
      const anexo = rand()
      const vinculo = rand()
      const dia = new Date(t + Math.floor(rand() * 6) * HORA).toISOString().slice(0, 10)
      const statusAnexo = anexo < 0.85 ? 100000002 : anexo < 0.95 ? 100000000 : 100000004
      n++
      despesas.push({
        id: `mock-desp-${n}`, dia, mes: dia.slice(0, 7), valor, categoriaId: cat.id, categoria: cat.nome, formaId: forma.id, forma: forma.nome,
        empresa: func.empresa.includes('BETINHOS') ? 'BETINHOS' : 'DEPAULA', motoristaId: func.id, motorista: func.nome,
        reservaId: vinculo < 0.7 ? reservaDoDia.get(`${dia}|${func.id}`) ?? '' : '',
        statusFinanceiro: STATUS_FINANCEIRO.find((s) => fin < s.ate)?.code ?? null, statusAnexo, anexos: statusAnexo === 100000002 ? 1 : 0,
        descricao: `${cat.nome} · ${func.apelido}`,
      })
    }
  }
  return despesas
}

const TIPOS_REPARO = ['Preventiva sistemática', 'Corretiva não crítica', 'Corretiva crítica', 'Conservação, conforto e imagem', 'Avaria']
const STATUS_MANUTENCAO = ['Realizado', 'Realizado', 'Realizado', 'Aprovado', 'Programado', 'Solicitado']
const INFRACOES = [
  { codigo: '745-50', descricao: 'Transitar em velocidade superior à máxima permitida em até 20%' },
  { codigo: '746-30', descricao: 'Transitar em velocidade superior à máxima permitida em mais de 20% até 50%' },
  { codigo: '554-12', descricao: 'Estacionar em local e horário proibidos' },
  { codigo: '605-03', descricao: 'Avançar o sinal vermelho do semáforo' },
  { codigo: '763-31', descricao: 'Dirigir segurando ou manuseando telefone celular' },
]
const STATUS_MULTA_RESOLVIDA = [
  { code: 202410001, label: 'Indicada' }, { code: 202410006, label: 'Pago' }, { code: 202410005, label: 'Finalizado' }, { code: 202410003, label: 'Descontado' },
]

/** Reservas de jan/2025 até 20 dias à frente, mais conjuntos secundários coerentes. */
export function criarDadosMock(now: Date): Dados {
  const rand = rng(20261008)
  // Campos acrescentados depois (tipo do serviço, finalização, detalhes de manutenções e multas) usam outro gerador: a sequência de `rand` não muda.
  const extra = rng(20261011)
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]
  const pickExtra = <T,>(list: readonly T[]) => list[Math.floor(extra() * list.length)]
  const reservas: Reserva[] = []
  const inicio = Date.parse('2025-01-01T12:00:00Z')
  const fim = now.getTime() + 20 * DIA
  let n = 0
  for (let t = inicio; t < fim; t += DIA) {
    const porDia = 2 + Math.floor(rand() * 3)
    for (let i = 0; i < porDia; i++) {
      const saidaMs = t + Math.floor(rand() * 10) * HORA
      const saidaRaw = new Date(saidaMs).toISOString()
      const dia = dayKey(saidaRaw)
      const futuro = saidaMs > now.getTime()
      const cancelado = !futuro && rand() < 0.06
      const status = futuro ? (rand() < 0.5 ? { code: 202410005, label: 'Programado' } : { code: 202410001, label: 'Confirmado' }) : cancelado ? { code: null, label: 'Cancelado' } : { code: 202410008, label: 'Concluído' }
      const mot = rand() < 0.9 ? pick(MOTORISTAS) : null
      const sorteado = rand() < 0.9 ? pick(VEICULOS) : null
      const vei = sorteado && extra() < 0.05 ? VEICULO_ALUGUEL : sorteado
      const temCp = !cancelado && rand() < 0.85
      const concluida = temCp && rand() < 0.8
      const fat = pick(FAT)
      const emergencial = rand() < 0.12
      const criadoRaw = new Date(emergencial ? saidaMs - 2 * HORA : saidaMs - (2 + Math.floor(rand() * 10)) * DIA).toISOString()
      const motorista = mot?.apelido ?? SEM_MOTORISTA
      n++
      const tipoServico = pickExtra(TIPOS_SERVICO)
      const finalizadoMs = saidaMs + (2 + Math.floor(extra() * 6)) * HORA
      reservas.push({
        id: `mock-${n}`, saidaRaw, saidaMs, dia, mes: dia.slice(0, 7), criadoRaw,
        status: status.code, statusLabel: status.label, fatStatus: fat.code, fatStatusLabel: fat.label,
        categoriaItem: CAT_ITEM_SERVICO, categoriaItemLabel: 'Serviço',
        tipoVeiculoRaw: rand() < 0.95 ? '1' : '', tipoVeiculo: pick(TIPOS),
        veiculoId: vei?.id ?? '', motoristaId: mot?.id ?? '', motoristaKey: mot?.id ?? `nome:${motorista.toLowerCase()}`, motorista,
        cliente: pick(CLIENTES), cpId: temCp ? `mock-cp-${n}` : '', valor: temCp ? Math.round(300 + rand() * 2200) : 0,
        cpPendente: temCp && !concluida, cpConcluida: concluida, opId: concluida && rand() < 0.7 ? `mock-op-${n}` : '',
        tipoServico, finalizadoRaw: status.label === 'Concluído' && finalizadoMs <= now.getTime() ? new Date(finalizadoMs).toISOString() : '',
      })
    }
  }
  const dias = (qtd: number) => Array.from({ length: qtd }, (_, i) => dayKey(new Date(now.getTime() - i * 9 * DIA).toISOString()))
  const manutencoes: Manutencao[] = dias(40).map((dia, i) => {
    const aprovacaoMs = Date.parse(`${dia}T15:00:00Z`) - (1 + Math.floor(extra() * 12)) * DIA
    return {
      dia, valor: Math.round(200 + rand() * 3800), aprovacaoDia: dayKey(new Date(aprovacaoMs).toISOString()),
      statusLabel: pickExtra(STATUS_MANUTENCAO), tipoReparo: pickExtra(TIPOS_REPARO), veiculoId: VEICULOS[i % VEICULOS.length].id,
      criadoDia: dayKey(new Date(aprovacaoMs - Math.floor(extra() * 4) * DIA).toISOString()),
    }
  })
  const multas: Multa[] = dias(25).map((dia) => {
    const pendente = rand() < 0.3
    const status = pendente ? { code: MULTA_NOTIFICAR, label: 'Notificar o Condutor' } : pickExtra(STATUS_MULTA_RESOLVIDA)
    const m = pickExtra(MOTORISTAS)
    const infracao = pickExtra(INFRACOES)
    return {
      dia, status: status.code, statusLabel: status.label, motoristaId: m.id, motorista: m.apelido, veiculoId: pickExtra(VEICULOS).id,
      infracaoCodigo: infracao.codigo, infracaoDescricao: infracao.descricao,
    }
  })
  const funcionarios: Funcionario[] = MOTORISTAS.map((m, i) => ({
    id: m.id, nome: m.nome, apelido: m.apelido, statusLabel: 'Ativo', cnhMs: now.getTime() + (i * 45 - 20) * DIA, funcao: 'Motorista', empresa: m.empresa,
  }))
  return {
    reservas,
    manutencoes,
    multas,
    ocorrencias: dias(30).map((dia) => ({ dia })),
    funcionarios,
    veiculos: [...VEICULOS, VEICULO_ALUGUEL],
    ...criarInfleetMock(now),
    pagantes: criarPagantesMock(reservas, now),
    despesas: criarDespesasMock(reservas, funcionarios, now),
    categoriasDespesa: CATEGORIAS_DESPESA,
    formasPagamento: FORMAS_DESPESA,
    indisponiveis: [],
  }
}
