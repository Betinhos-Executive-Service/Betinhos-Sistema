import { mockVolume } from '../../../app/mockVolume'
import { CAMPO, lerMulti, ORIGEM } from '../domain/manutencaoCatalogo'
import { addMonths, todaySP } from './dates'
import { COLISAO, MANUT, MULTA, STATUS_FIELD, VEICULO } from './schema'
import type { Acordo } from '../domain/termoMulta'
import type { DataSource, FlowId } from './source'
import type { Colisao, DespesaCombustivel, FrotaData, ItemPlano, Kind, Manutencao, Multa, Ref, TelemetriaKm, TermoMulta } from './types'

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
  return { id, titulo: `AIT fictício ${id}`, status: MULTA.NOTIFICAR, dataHora: iso(-20), local: 'Av. de Teste, 100', dataParaIndicar: offset(5), indicado: false, dataAviso: null, dataIndicacao: null, veiculo: v1, motorista: bruno, infracaoId: 'i1', criadoEm: iso(-10), valorGuia: null, recursoPendente: false, termoVigente: null, ...extra }
}
function colisao(id: string, status: number): Colisao {
  return { id, titulo: `Colisão fictícia ${id}`, status, tipo: 100000001, dataHora: iso(-6), local: 'Rua de Teste, 50', descricao: 'Batida leve na traseira.', houveTerceiro: true, veiculo: v2, motorista: ana, criadoEm: iso(-6) }
}

function item(id: string, nome: string, extra: Partial<ItemPlano>): ItemPlano {
  return { id, nome, servico: null, intervaloKm: null, intervaloMeses: null, avisoKm: 1000, avisoDias: 30, ativo: true, ...extra }
}
function despesa(id: string, veiculo: Ref, mesesAtras: number, valor: number, categoria: DespesaCombustivel['categoria'] = 'combustivel'): DespesaCombustivel {
  return { id, dia: addMonths(offset(-3), -mesesAtras), valor, veiculo, manutencao: null, categoria }
}
function telemetria(veiculoId: string, dias: number, km: number): TelemetriaKm[] {
  return Array.from({ length: dias }, (_, index) => ({ dia: offset(-(index + 1)), veiculoId, km }))
}

/** `?volume=N` do pnpm dev: N manutenções realizadas a mais (lista grande sem criar pendências). */
const volumeManutencoes = (total: number, v1: Ref, v2: Ref) => Array.from({ length: total }, (_, i) => manut(`mv${i + 1}`, i % 2 ? v2 : v1, {
  status: MANUT.REALIZADO, descricao: `Manutenção de exemplo ${i + 1}`, dataManutencao: iso(-(30 + (i % 700))), criadoEm: iso(-(32 + (i % 700))), valor: 150 + (i % 40) * 22.5, estabelecimento: 'Oficina Volume',
}))

function seed(): FrotaData {
  return {
    veiculos: [
      { id: 'v1', placa: 'TST1A11', marca: 'Toyota', modelo: 'Corolla', cor: 'Preto', anoModelo: 2024, status: VEICULO.ATIVO, categoria: 100000000, motorista: bruno, hodometro: 171000, hodometroEm: iso(0) },
      { id: 'v2', placa: 'TST2B22', marca: 'VW', modelo: 'Virtus', cor: 'Prata', anoModelo: 2023, status: VEICULO.ATIVO, categoria: 100000000, motorista: ana, hodometro: null, hodometroEm: null },
      { id: 'v3', placa: 'TST3C33', marca: 'Nissan', modelo: 'Versa', cor: 'Branco', anoModelo: 2020, status: VEICULO.VENDIDO, categoria: 100000000, motorista: null, hodometro: null, hodometroEm: null },
      { id: 'v4', placa: 'TST4D44', marca: 'Kia', modelo: 'Carnival', cor: 'Preto', anoModelo: 2025, status: null, categoria: 100000002, motorista: null, hodometro: null, hodometroEm: null },
    ],
    manutencoes: [
      manut('m1', v1, { grau: 4, descricao: 'Freio com ruído (fictício)', servicos: [100000007], categorias: [100000001], origemClassificacao: ORIGEM.IA, confiancaIa: 0.93 }),
      manut('m2', v2, { status: MANUT.APROVADO, comentarioAprovador: 'Ok' }),
      manut('m3', v1, { status: MANUT.PROGRAMADO, agendarPara: offset(-1) }),
      manut('m4', v1, { status: MANUT.REALIZADO, dataManutencao: iso(-40), valor: 480.9, estabelecimento: 'Oficina Teste', servicoRealizado: 'Troca de óleo', criadoEm: iso(-45), km: 160000, servicos: [100000000, 100000001], categorias: [100000000], origemClassificacao: ORIGEM.MANUAL }),
      // Reincidência fictícia: com m1, 3ª vez do mesmo serviço de freio no v1 em 120 dias.
      manut('m4b', v1, { status: MANUT.REALIZADO, dataManutencao: iso(-70), valor: 650, estabelecimento: 'Oficina Teste', descricao: 'Freio rangendo (fictício)', criadoEm: iso(-72), servicos: [100000007], categorias: [100000001], origemClassificacao: ORIGEM.MANUAL }),
      manut('m4c', v1, { status: MANUT.REALIZADO, dataManutencao: iso(-25), valor: 720, estabelecimento: 'Freios Exemplo', descricao: 'Freio voltou a fazer ruído (fictício)', criadoEm: iso(-27), servicos: [100000007], categorias: [100000001], origemClassificacao: ORIGEM.MANUAL }),
      manut('m5', v2, { status: MANUT.REALIZADO, dataManutencao: iso(-100), valor: 1250, tipo: 100000001, criadoEm: iso(-110) }),
      manut('m6', v2, { status: MANUT.REALIZADO, dataManutencao: iso(-70), tipo: 2, criadoEm: iso(-72) }),
      ...volumeManutencoes(mockVolume(), v1, v2),
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
      { id: 'p1', inicio: `${addMonths(todaySP(), -6)}T12:00:00Z`, fim: null, veiculo: v1, motorista: bruno, localBase: null },
      { id: 'p2', inicio: `${addMonths(todaySP(), -12)}T12:00:00Z`, fim: `${addMonths(todaySP(), -6)}T12:00:00Z`, veiculo: v1, motorista: ana, localBase: null },
      { id: 'p3', inicio: `${addMonths(todaySP(), -1)}T12:00:00Z`, fim: null, veiculo: { id: 'v4', label: 'TST4D44' }, motorista: null, localBase: { id: 'b1', label: 'Base Centro (fictício)' } },
    ],
    // v1/i1 vencido por km (171000 > 160000 + 10000); v1/i2 em andamento (m1 solicitada); v2/i3 sem base.
    planoPreventivo: [
      item('i1', 'Troca de óleo e filtro', { servico: 100000000, intervaloKm: 10000, intervaloMeses: 6 }),
      item('i2', 'Pastilhas de freio', { servico: 100000007, intervaloKm: 30000 }),
      item('i3', 'Revisão anual', { servico: 100000035, intervaloMeses: 12 }),
      item('i4', 'Troca de correia (inativo)', { servico: 100000004, intervaloKm: 60000, ativo: false }),
    ],
    baselines: [{ id: 'b1', veiculo: v2, item: { id: 'i1', label: 'Troca de óleo e filtro' }, km: 40000, data: addMonths(todaySP(), -5) }],
    despesasCombustivel: [
      despesa('d1', v1, 0, 412.5), despesa('d2', v1, 1, 380), despesa('d3', v1, 2, 345.9),
      despesa('d4', v1, 3, 450), despesa('d5', v1, 4, 300), despesa('d6', v1, 5, 398.4),
      despesa('d7', v2, 0, 280), despesa('d8', v2, 2, 310),
      despesa('d9', v1, 1, 480.9, 'manutencao'),
    ],
    telemetriaKm: [...telemetria('v1', 30, 120), ...telemetria('v2', 10, 85)],
  }
}

const COLLECTION: Record<Kind, 'manutencoes' | 'multas' | 'colisoes'> = { manutencao: 'manutencoes', multa: 'multas', colisao: 'colisoes' }
const FIELD_TO_PROP: Record<string, string> = {
  cr40f_agendarpara: 'agendarPara', cr40f_datamanutencao: 'dataManutencao', cr40f_valor: 'valor', cr40f_estabelecimento: 'estabelecimento', cr40f_servicorealizado: 'servicoRealizado', cr40f_comentariosdoaprovador: 'comentarioAprovador',
  cr40f_datadeavisoaocondutor: 'dataAviso', cr40f_datadeindicacao: 'dataIndicacao', cr40f_indicado: 'indicado', new_valorguia: 'valorGuia', new_recursopendente: 'recursoPendente',
  [CAMPO.origem]: 'origemClassificacao', [CAMPO.confianca]: 'confiancaIa', [CAMPO.descricao]: 'descricao',
}

const MULTI_TO_PROP: Record<string, string> = { [CAMPO.servicos]: 'servicos', [CAMPO.categorias]: 'categorias' }

export function createMockSource(): DataSource {
  const data = seed()
  const fotos = new Map<string, Blob>()
  // Aditivo exige data e PDF, como no Dataverse. Só a Ana (fictícia) tem os dois; o Bruno tem a data sem o PDF.
  const aditivos = new Map<string, { data: string | null; arquivo: string | null }>([[ana.id, { data: '2026-10-15', arquivo: 'aditivo.pdf' }], [bruno.id, { data: '2026-10-15', arquivo: null }]])
  const temAditivo = (id: string) => { const a = aditivos.get(id); return !!a?.data && !!a.arquivo }
  const termo = (id: string, extra: Partial<TermoMulta>): TermoMulta => ({ id, status: 'pendente', forma: 'folha', parcelas: 3, valorTotal: 293.47, primeiraCompetencia: addMonths(`${todaySP().slice(0, 7)}-01`, 1), enviadoEm: iso(-4), assinadoEm: null, hashPdf: null, motivoContestacao: null, ultimoLembreteEm: null, criadoEm: iso(-4), ...extra })
  // Termos fictícios: u2 pendente (Ana), u3 assinado com parcelas, u4 contestado.
  const termos = new Map<string, TermoMulta[]>([
    ['u2', [termo('tu2-1', { forma: 'guia', parcelas: 1, valorTotal: 195.23, enviadoEm: iso(-4), ultimoLembreteEm: iso(-2) })]],
    ['u3', [termo('tu3-1', { status: 'assinado', enviadoEm: iso(-30), assinadoEm: iso(-28), hashPdf: '9f2c1a7be04d3f6a8c1e5b2d7f9a0c3e4b6d8f1a2c3e5b7d9f0a1c2e3b4d5f6a' })]],
    ['u4', [termo('tu4-1', { status: 'contestado', forma: 'guia', parcelas: 1, valorTotal: 130.16, enviadoEm: iso(-6), motivoContestacao: 'Eu estava de folga nesse dia (fictício).' })]],
  ])
  const parcelas = new Map([['tu3-1', [0, 1, 2].map((i) => ({ numero: i + 1, competencia: addMonths(`${todaySP().slice(0, 7)}-01`, i - 1), valor: i === 0 ? 97.83 : 97.82, status: i === 0 ? 'Descontada' : 'Prevista' }))]])
  const comTermo = (multas: Multa[]) => multas.map((m) => { const t = termos.get(m.id)?.[0]; return { ...m, termo: t?.status ? { status: t.status, enviadoEm: t.enviadoEm } : null } })
  const find = (kind: Kind, id: string) => (data[COLLECTION[kind]] as { id: string; status: number | null }[]).find((item) => item.id === id)
  const delay = () => new Promise((resolve) => setTimeout(resolve, 250))

  return {
    mode: 'mock',
    envLabel: 'MOCK',
    async load() {
      await delay()
      const copia = structuredClone(data)
      return { data: { ...copia, multas: comTermo(copia.multas) }, errors: {} }
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
    async salvarItemPlano(input, id) {
      await delay()
      if (id) {
        const atual = data.planoPreventivo.find((row) => row.id === id)
        if (!atual) throw new Error('Registro não encontrado no mock.')
        Object.assign(atual, input)
        return
      }
      data.planoPreventivo.push({ ...input, id: `i${data.planoPreventivo.length + 1}`, ativo: true })
    },
    async inativarItemPlano(id, ativo) {
      await delay()
      const atual = data.planoPreventivo.find((row) => row.id === id)
      if (!atual) throw new Error('Registro não encontrado no mock.')
      atual.ativo = ativo
    },
    async salvarBaseline(veiculoId, itemId, km, dia) {
      await delay()
      const atual = data.baselines.find((row) => row.veiculo?.id === veiculoId && row.item?.id === itemId)
      if (atual) {
        Object.assign(atual, { km, data: dia })
        return
      }
      const veiculo = data.veiculos.find((row) => row.id === veiculoId)
      const plano = data.planoPreventivo.find((row) => row.id === itemId)
      if (!veiculo || !plano) throw new Error('Registro não encontrado no mock.')
      data.baselines.push({ id: `b${data.baselines.length + 1}`, veiculo: { id: veiculo.id, label: veiculo.placa }, item: { id: plano.id, label: plano.nome }, km, data: dia })
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
    async temAditivo(funcionarioId) {
      return temAditivo(funcionarioId)
    },
    async listarTermos(multaId) {
      await delay()
      return structuredClone(termos.get(multaId) ?? [])
    },
    async enviarTermoMulta(multaId: string, acordo: Acordo) {
      await delay()
      const item = data.multas.find((row) => row.id === multaId)
      if (!item) throw new Error('Registro não encontrado no mock.')
      const lista = termos.get(multaId) ?? []
      if (lista.some((termo) => termo.status === 'pendente')) throw new Error('Já existe um termo pendente para esta multa.')
      if (!item.motorista || !temAditivo(item.motorista.id)) throw new Error('O motorista ainda não tem o aditivo de assinatura eletrônica registrado.')
      if (acordo.forma === 'folha' && item.recursoPendente) throw new Error('Há recurso pendente: o desconto só pode ser acordado depois do resultado.')
      const agora = new Date().toISOString()
      const termo: TermoMulta = { id: `t${multaId}-${lista.length + 1}`, status: 'pendente', forma: acordo.forma, parcelas: acordo.parcelas, valorTotal: acordo.valorTotal, primeiraCompetencia: acordo.primeiraCompetencia, enviadoEm: agora, assinadoEm: null, hashPdf: null, motivoContestacao: null, ultimoLembreteEm: null, criadoEm: agora }
      termos.set(multaId, [termo, ...lista])
      item.termoVigente = { id: termo.id, label: termo.id }
      return termo.id
    },
    async cancelarTermoMulta(termoId) {
      await delay()
      for (const [multaId, lista] of termos) for (const termo of lista) {
        if (termo.id !== termoId) continue
        if (termo.status !== 'pendente') throw new Error('Só termo pendente pode ser cancelado.')
        termo.status = 'cancelado'
        const item = data.multas.find((row) => row.id === multaId)
        if (item?.termoVigente?.id === termoId) item.termoVigente = null
        return
      }
      throw new Error('Termo não encontrado no mock.')
    },
    async lembrarTermoMulta(termoId) {
      await delay()
      const alvo = [...termos.values()].flat().find((t) => t.id === termoId)
      if (!alvo || alvo.status !== 'pendente') throw new Error('Só termo pendente pode receber lembrete.')
      if (alvo.ultimoLembreteEm && Date.now() - Date.parse(alvo.ultimoLembreteEm) < 24 * 3600 * 1000) throw new Error('Já foi enviado um lembrete nas últimas 24 horas.')
      alvo.ultimoLembreteEm = new Date().toISOString()
    },
    async baixarPdfTermo(termoId) {
      await delay()
      return { nome: `Termo-${termoId}.pdf`, blob: new Blob(['%PDF-1.4 fictício'], { type: 'application/pdf' }) }
    },
    async listarParcelasTermo(termoId) {
      await delay()
      return structuredClone(parcelas.get(termoId) ?? [])
    },
  }
}
