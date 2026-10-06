import { CAMPO, lerMulti, ORIGEM } from '../domain/manutencaoCatalogo'
import { addMonths, todaySP } from './dates'
import { COLISAO, MANUT, MULTA, STATUS_FIELD, VEICULO } from './schema'
import type { DataSource, FlowId } from './source'
import type { Colisao, FrotaData, Kind, Manutencao, Multa, Ref } from './types'

// Dados fictícios só para `pnpm dev` em localhost. Nunca usados dentro do Dataverse.
function offset(days: number) {
  const date = new Date(`${todaySP()}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
const iso = (days: number) => `${offset(days)}T15:00:00Z`

const ana: Ref = { id: 'f1', label: 'Ana Souza (fictício)' }
const bruno: Ref = { id: 'f2', label: 'Bruno Lima (fictício)' }
const v1: Ref = { id: 'v1', label: 'TST1A11' }
const v2: Ref = { id: 'v2', label: 'TST2B22' }

function manut(id: string, veiculo: Ref, extra: Partial<Manutencao>): Manutencao {
  return { id, codigo: id.toUpperCase(), descricao: `Manutenção fictícia ${id}`, status: MANUT.SOLICITADO, grau: 2, tipo: 1, agendarPara: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: 50000, veiculo, solicitante: ana, criadoEm: iso(-3), servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null, ...extra }
}
function multa(id: string, extra: Partial<Multa>): Multa {
  return { id, titulo: `AIT fictício ${id}`, status: MULTA.NOTIFICAR, dataHora: iso(-20), local: 'Av. de Teste, 100', dataParaIndicar: offset(5), indicado: false, dataAviso: null, dataIndicacao: null, veiculo: v1, motorista: bruno, infracaoId: 'i1', criadoEm: iso(-10), ...extra }
}
function colisao(id: string, status: number): Colisao {
  return { id, titulo: `Colisão fictícia ${id}`, status, tipo: 100000001, dataHora: iso(-6), local: 'Rua de Teste, 50', descricao: 'Batida leve na traseira.', houveTerceiro: true, veiculo: v2, motorista: ana, criadoEm: iso(-6) }
}

function seed(): FrotaData {
  return {
    veiculos: [
      { id: 'v1', placa: 'TST1A11', marca: 'Toyota', modelo: 'Corolla', cor: 'Preto', anoModelo: 2024, status: VEICULO.ATIVO, categoria: 100000000, motorista: bruno },
      { id: 'v2', placa: 'TST2B22', marca: 'VW', modelo: 'Virtus', cor: 'Prata', anoModelo: 2023, status: VEICULO.ATIVO, categoria: 100000002, motorista: ana },
      { id: 'v3', placa: 'TST3C33', marca: 'Nissan', modelo: 'Versa', cor: 'Branco', anoModelo: 2020, status: VEICULO.VENDIDO, categoria: 100000000, motorista: null },
      { id: 'v4', placa: 'TST4D44', marca: 'Kia', modelo: 'Carnival', cor: 'Preto', anoModelo: 2025, status: null, categoria: 100000001, motorista: null },
    ],
    manutencoes: [
      manut('m1', v1, { grau: 4, descricao: 'Freio com ruído (fictício)', servicos: [100000007], categorias: [100000001], origemClassificacao: ORIGEM.IA, confiancaIa: 0.93 }),
      manut('m2', v2, { status: MANUT.APROVADO, comentarioAprovador: 'Ok' }),
      manut('m3', v1, { status: MANUT.PROGRAMADO, agendarPara: offset(-1) }),
      manut('m4', v1, { status: MANUT.REALIZADO, dataManutencao: iso(-40), valor: 480.9, estabelecimento: 'Oficina Teste', servicoRealizado: 'Troca de óleo', criadoEm: iso(-45), servicos: [100000000, 100000001], categorias: [100000000], origemClassificacao: ORIGEM.MANUAL }),
      manut('m5', v2, { status: MANUT.REALIZADO, dataManutencao: iso(-100), valor: 1250, tipo: 100000001, criadoEm: iso(-110) }),
      manut('m6', v2, { status: MANUT.REALIZADO, dataManutencao: iso(-70), tipo: 2, criadoEm: iso(-72) }),
    ],
    multas: [
      multa('u1', {}),
      multa('u2', { status: MULTA.NOTIFICADO, dataAviso: offset(-2), dataParaIndicar: offset(2), motorista: ana }),
      multa('u3', { status: MULTA.DESCONTADO, indicado: true, dataHora: iso(-90) }),
      multa('u4', { status: MULTA.PAGO, infracaoId: null, veiculo: v2, dataHora: iso(-150) }),
    ],
    infracoes: [{ id: 'i1', codigo: '7455-0', descricao: 'Velocidade superior à máxima em até 20%', gravidade: 1, pontos: 4, valor: 130.16 }],
    colisoes: [colisao('c1', COLISAO.ENVIADO), colisao('c2', COLISAO.RESOLVIDO)],
    posses: [
      { id: 'p1', inicio: `${addMonths(todaySP(), -6)}T12:00:00Z`, fim: null, veiculo: v1, motorista: bruno },
      { id: 'p2', inicio: `${addMonths(todaySP(), -12)}T12:00:00Z`, fim: `${addMonths(todaySP(), -6)}T12:00:00Z`, veiculo: v1, motorista: ana },
    ],
  }
}

const COLLECTION: Record<Kind, 'manutencoes' | 'multas' | 'colisoes'> = { manutencao: 'manutencoes', multa: 'multas', colisao: 'colisoes' }
const FIELD_TO_PROP: Record<string, string> = {
  cr40f_agendarpara: 'agendarPara', cr40f_datamanutencao: 'dataManutencao', cr40f_valor: 'valor', cr40f_estabelecimento: 'estabelecimento', cr40f_servicorealizado: 'servicoRealizado', cr40f_comentariosdoaprovador: 'comentarioAprovador',
  cr40f_datadeavisoaocondutor: 'dataAviso', cr40f_datadeindicacao: 'dataIndicacao', cr40f_indicado: 'indicado',
  [CAMPO.origem]: 'origemClassificacao', [CAMPO.confianca]: 'confiancaIa', [CAMPO.descricao]: 'descricao',
}

const MULTI_TO_PROP: Record<string, string> = { [CAMPO.servicos]: 'servicos', [CAMPO.categorias]: 'categorias' }

export function createMockSource(): DataSource {
  const data = seed()
  const fotos = new Map<string, Blob>()
  const find = (kind: Kind, id: string) => (data[COLLECTION[kind]] as { id: string; status: number | null }[]).find((item) => item.id === id)
  const delay = () => new Promise((resolve) => setTimeout(resolve, 250))

  return {
    mode: 'mock',
    envLabel: 'MOCK',
    async load() {
      await delay()
      return { data: structuredClone(data), errors: {} }
    },
    async currentStatus(kind, id) {
      return find(kind, id)?.status ?? null
    },
    async dateBehaviors() {
      return { cr40f_agendarpara: 'DateOnly', cr40f_datadeavisoaocondutor: 'DateOnly', cr40f_datadeindicacao: 'DateOnly', cr40f_dataparaindicar: 'DateOnly' }
    },
    async update(kind, id, patch) {
      await delay()
      const record = find(kind, id) as Record<string, unknown> | undefined
      if (!record) throw new Error('Registro não encontrado no mock.')
      for (const [key, value] of Object.entries(patch)) {
        if (key === STATUS_FIELD[kind]) record.status = value
        else if (FIELD_TO_PROP[key]) record[FIELD_TO_PROP[key]] = value
        else if (MULTI_TO_PROP[key]) record[MULTI_TO_PROP[key]] = lerMulti(value)
      }
      // Simula o flow do JEV: devolver o registro à IA classifica alguns segundos depois.
      if (kind === 'manutencao' && CAMPO.origem in patch && patch[CAMPO.origem] === null) {
        setTimeout(() => Object.assign(record, { servicos: [100000006], categorias: [100000000], origemClassificacao: ORIGEM.IA, confiancaIa: 0.82 }), 4000)
      }
    },
    async classificarAgora(id) {
      await delay()
      const item = data.manutencoes.find((row) => row.id === id)
      if (!item) throw new Error('Registro não encontrado no mock.')
      Object.assign(item, { servicos: [100000006], categorias: [100000000], origemClassificacao: ORIGEM.IA, confiancaIa: 0.82 })
      return { servicos: item.servicos, categorias: item.categorias, origem: item.origemClassificacao, confianca: item.confiancaIa }
    },
    async classificacao(id) {
      const item = data.manutencoes.find((row) => row.id === id)
      if (!item) throw new Error('Registro não encontrado no mock.')
      return { servicos: item.servicos, categorias: item.categorias, origem: item.origemClassificacao, confianca: item.confiancaIa }
    },
    async openForm(kind, id) {
      window.alert(`Mock: abriria o formulário nativo de ${kind}${id ? ` (${id})` : ' (novo)'}.`)
    },
    async prepareFlow() {},
    async fotoVeiculo(id) {
      return fotos.get(id) ?? null
    },
    async enviarFotoVeiculo(id, file) {
      await delay()
      fotos.set(id, file)
    },
    async runFlow(flow: FlowId, id: string) {
      await delay()
      const kind: Kind = flow === 'aprovarManutencao' ? 'manutencao' : 'multa'
      const record = find(kind, id) as Record<string, unknown> | undefined
      if (!record) throw new Error('Registro não encontrado no mock.')
      if (flow === 'aprovarManutencao') record.status = MANUT.APROVADO
      else if (flow === 'notificarCondutor') { record.status = MULTA.NOTIFICADO; record.dataAviso = todaySP() }
      else record.status = MULTA.INDICADA
      return { message: 'Mock: Flow simulado.', shareUrl: flow === 'gerarContrato' ? 'https://example.invalid/contrato-ficticio.pdf' : null }
    },
  }
}
