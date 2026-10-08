import { CAT_ITEM_SERVICO, SEM_CLIENTE, SEM_MOTORISTA } from '../domain/codes'
import { dayKey } from '../domain/periodo'
import type { Dados, EventoConducao, Reserva, TelemetriaDia, Veiculo, Viagem } from '../domain/types'

/** Gerador determinístico (mulberry32): o mock mostra sempre os mesmos números. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CLIENTES = ['Tenaris', 'Embraer', 'Particular', 'Vale', 'Natura', 'Itaú BBA', SEM_CLIENTE]
const MOTORISTAS = [
  { id: 'mock-m1', apelido: 'Oliveira' }, { id: 'mock-m2', apelido: 'Fábio' }, { id: 'mock-m3', apelido: 'Renata' },
  { id: 'mock-m4', apelido: 'Marcos' }, { id: 'mock-m5', apelido: 'Juliana' }, { id: 'mock-m6', apelido: 'Paulo' },
]
const VEICULOS: Veiculo[] = [
  { id: 'mock-v1', statusLabel: 'Disponível', categoria: 'Propria' }, { id: 'mock-v2', statusLabel: 'Disponível', categoria: 'Propria' },
  { id: 'mock-v3', statusLabel: 'Em manutenção', categoria: 'Propria' }, { id: 'mock-v4', statusLabel: 'Disponível', categoria: 'Terceirizada' },
  { id: 'mock-v5', statusLabel: 'Disponível', categoria: 'Terceirizada' },
]
const TIPOS = ['Executivo', 'Blindado', 'Van']
const FAT = [
  { code: 202410010, label: 'Pago' }, { code: 202410000, label: 'Pendente' }, { code: 202410008, label: 'Mensal' }, { code: 202410006, label: 'Pagante em viagem' },
]

/** Perfil de condução por motorista (mesma ordem de MOTORISTAS): eventos e minutos de motor ocioso por 100 km. Dá notas altas, médias e baixas. */
const PERFIS_CONDUCAO = [
  { acel: 0.3, freio: 0.4, ocioso: 3 }, { acel: 1.5, freio: 1.2, ocioso: 9 }, { acel: 0.9, freio: 0.7, ocioso: 6 },
  { acel: 3.4, freio: 3.0, ocioso: 19 }, { acel: 2.0, freio: 1.6, ocioso: 12 }, { acel: 1.2, freio: 1.0, ocioso: 8 },
]

/**
 * Viagens, eventos e telemetria do Infleet dos últimos ~13 meses. Cada motorista (exceto o último) usa o seu veículo, então tem nota
 * quando passa de 100 km no mês; nos meses 3, 6, 9 e 12 o último motorista divide o veículo do primeiro e nenhum dos dois recebe nota.
 * Gerador próprio: não mexe na sequência aleatória das reservas.
 */
function criarInfleetMock(now: Date) {
  const rand = rng(20261009)
  const viagens: Viagem[] = []
  const eventos: EventoConducao[] = []
  const ociosoPorVeiculoDia = new Map<string, TelemetriaDia>()
  const ultimo = MOTORISTAS.length - 1
  for (let atras = 400; atras >= 0; atras--) {
    const dia = dayKey(new Date(now.getTime() - atras * 86_400_000).toISOString())
    const mes = dia.slice(0, 7)
    const compartilhado = Number(dia.slice(5, 7)) % 3 === 0
    MOTORISTAS.forEach((m, i) => {
      if (i === ultimo && !compartilhado) return
      if (rand() < 0.2) return
      const perfil = PERFIS_CONDUCAO[i]
      const veiculoId = VEICULOS[i === ultimo ? 0 : i].id
      const km = Math.round((25 + rand() * 50) * 10) / 10
      viagens.push({ dia, mes, veiculoId, motoristaId: m.id, distancia: km })
      for (const [tipo, taxa] of [['hardAcceleration', perfil.acel], ['hardBraking', perfil.freio]] as const) {
        const qtd = Math.floor((km / 100) * taxa + rand())
        for (let k = 0; k < qtd; k++) eventos.push({ dia, mes, motoristaId: m.id, tipo })
      }
      if (rand() < 0.3) eventos.push({ dia, mes, motoristaId: m.id, tipo: 'hardCornering' })
      const chave = `${veiculoId}|${dia}`
      const telemetria = ociosoPorVeiculoDia.get(chave) ?? { dia, mes, veiculoId, ociosoMin: 0 }
      telemetria.ociosoMin += Math.round((km / 100) * perfil.ocioso * (0.7 + rand() * 0.6))
      ociosoPorVeiculoDia.set(chave, telemetria)
    })
  }
  return { viagens, eventos, telemetria: [...ociosoPorVeiculoDia.values()] }
}

/** Reservas de jan/2025 até 20 dias à frente, mais conjuntos secundários coerentes. */
export function criarDadosMock(now: Date): Dados {
  const rand = rng(20261008)
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]
  const reservas: Reserva[] = []
  const inicio = Date.parse('2025-01-01T12:00:00Z')
  const fim = now.getTime() + 20 * 86_400_000
  let n = 0
  for (let t = inicio; t < fim; t += 86_400_000) {
    const porDia = 2 + Math.floor(rand() * 3)
    for (let i = 0; i < porDia; i++) {
      const saidaMs = t + Math.floor(rand() * 10) * 3_600_000
      const saidaRaw = new Date(saidaMs).toISOString()
      const dia = dayKey(saidaRaw)
      const futuro = saidaMs > now.getTime()
      const cancelado = !futuro && rand() < 0.06
      const status = futuro ? (rand() < 0.5 ? { code: 202410005, label: 'Programado' } : { code: 202410001, label: 'Confirmado' }) : cancelado ? { code: null, label: 'Cancelado' } : { code: 202410008, label: 'Concluído' }
      const mot = rand() < 0.9 ? pick(MOTORISTAS) : null
      const vei = rand() < 0.9 ? pick(VEICULOS) : null
      const temCp = !cancelado && rand() < 0.85
      const concluida = temCp && rand() < 0.8
      const fat = pick(FAT)
      const emergencial = rand() < 0.12
      const criadoRaw = new Date(emergencial ? saidaMs - 2 * 3_600_000 : saidaMs - (2 + Math.floor(rand() * 10)) * 86_400_000).toISOString()
      const motorista = mot?.apelido ?? SEM_MOTORISTA
      n++
      reservas.push({
        id: `mock-${n}`, saidaRaw, saidaMs, dia, mes: dia.slice(0, 7), criadoRaw,
        status: status.code, statusLabel: status.label, fatStatus: fat.code, fatStatusLabel: fat.label,
        categoriaItem: CAT_ITEM_SERVICO, categoriaItemLabel: 'Serviço',
        tipoVeiculoRaw: rand() < 0.95 ? '1' : '', tipoVeiculo: pick(TIPOS),
        veiculoId: vei?.id ?? '', motoristaId: mot?.id ?? '', motoristaKey: mot?.id ?? `nome:${motorista.toLowerCase()}`, motorista,
        cliente: pick(CLIENTES), cpId: temCp ? `mock-cp-${n}` : '', valor: temCp ? Math.round(300 + rand() * 2200) : 0,
        cpPendente: temCp && !concluida, cpConcluida: concluida, opId: concluida && rand() < 0.7 ? `mock-op-${n}` : '',
      })
    }
  }
  const dias = (qtd: number) => Array.from({ length: qtd }, (_, i) => dayKey(new Date(now.getTime() - i * 9 * 86_400_000).toISOString()))
  return {
    reservas,
    manutencoes: dias(40).map((dia) => ({ dia, valor: Math.round(200 + rand() * 3800) })),
    multas: dias(25).map((dia) => ({ dia, status: rand() < 0.3 ? 202410000 : 202410001 })),
    ocorrencias: dias(30).map((dia) => ({ dia })),
    funcionarios: MOTORISTAS.map((_, i) => ({ statusLabel: 'Ativo', cnhMs: now.getTime() + (i * 45 - 20) * 86_400_000 })),
    veiculos: VEICULOS,
    ...criarInfleetMock(now),
    indisponiveis: [],
  }
}
