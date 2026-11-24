import { mockVolume } from '../../../app/mockVolume'
import { categoriasDe, CAMPO, lerMulti, ORIGEM } from '../domain/manutencaoCatalogo'
import { janelaValida, segundaDe, somarDias } from '../domain/janela'
import { addMonths, todaySP } from './dates'
import { estadoDaMulta } from '../domain/multaEstado'
import { aplicarPasso, avaliar, dividirParcelas, validarPasso, type MultaEstado } from '../domain/multaEtapas'
import { ANEXO_DESPESA, CANAL, COLISAO, MANUT, MOTIVO_EMPRESA, MULTA, PAGAMENTO, RESPONSAVEL, STATUS_FIELD, VEICULO } from './schema'
import type { Acordo } from '../domain/termoMulta'
import type { DataSource, OpcaoBusca } from './source'
import { ApiError } from './xrm'
import type { Colisao, DespesaCombustivel, DetalheManutencao, FrotaData, ItemPlano, Kind, Manutencao, Multa, ParcelaFolha, ProgramacaoManutencao, Ref, ResultadoLancamento, TelemetriaKm, TermoMulta } from './types'
import { latenciaMock } from '../../../app/latenciaMock'

// Dados fictícios só para `pnpm dev` em localhost. Nunca usados dentro do Dataverse.
function offset(days: number) {
  const date = new Date(`${todaySP()}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
const iso = (days: number) => `${offset(days)}T15:00:00Z`

const ana: Ref = { id: 'f1', label: 'Ana Souza (fictício)' }
const bruno: Ref = { id: 'f2', label: 'Bruno Lima (fictício)' }
const motTeste: Ref = { id: 'f3', label: 'Motorista Teste (fictício)' }
const v1: Ref = { id: 'v1', label: 'TST1A11' }
const v2: Ref = { id: 'v2', label: 'TST2B22' }
const fase3Tst: Ref = { id: 'v5', label: 'TST1A23' }
const fase3Abc: Ref = { id: 'f2f2f2f2-0000-4000-8000-000000000001', label: 'ABC1D23' }

function manut(id: string, veiculo: Ref, extra: Partial<Manutencao>): Manutencao {
  return { id, codigo: id.toUpperCase(), descricao: `Manutenção fictícia ${id}`, status: MANUT.SOLICITADO, grau: 2, tipo: 1, agendarPara: null, janelaInicio: null, janelaFim: null, dataAprovacao: null, kmRealizado: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: 50000, veiculo, solicitante: ana, criadoEm: iso(-3), servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null, ...extra }
}
function multa(id: string, extra: Partial<Multa>): Multa {
  return { id, codigo: `NT-${id}`, titulo: `AIT fictício ${id}`, status: MULTA.NOTIFICAR, dataHora: iso(-20), local: 'Av. de Teste, 100', dataParaIndicar: offset(5), indicado: false, dataAviso: null, dataIndicacao: null, veiculo: v1, motorista: bruno, infracaoId: 'i1', criadoEm: iso(-10), valorGuia: null, recursoPendente: false, termoVigente: null, responsavel: null, motivoEmpresa: null, canal: null, aceiteEm: null, vencimento: null, valorComDesconto: null, valorPago: null, pagaEm: null, competencia: null, acertoEm: null, encerradaEm: null, canceladaEm: null, motivoCancelamento: null, arquivos: { autuacao: `auto-${id}.pdf`, penalidade: null, comprovante: null }, ...extra }
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
      // ID no formato GUID e inativo (vendido): o lookup de veículo do mock da Geral abre a ficha dele por cima da lista.
      { id: 'f2f2f2f2-0000-4000-8000-000000000001', placa: 'ABC1D23', marca: 'Toyota', modelo: 'Corolla', cor: 'Cinza', anoModelo: 2019, status: VEICULO.VENDIDO, categoria: 100000000, motorista: null, hodometro: null, hodometroEm: null },
      { id: 'v4', placa: 'TST4D44', marca: 'Kia', modelo: 'Carnival', cor: 'Preto', anoModelo: 2025, status: null, categoria: 100000002, motorista: null, hodometro: null, hodometroEm: null },
      { id: 'v5', placa: 'TST1A23', marca: 'Toyota', modelo: 'Etios', cor: 'Branco', anoModelo: 2022, status: VEICULO.ATIVO, categoria: 100000000, motorista: motTeste, hodometro: null, hodometroEm: null },
    ],
    manutencoes: [
      manut('m1', v1, { grau: 4, descricao: 'Freio com ruído (fictício)', servicos: [100000007], categorias: [100000001], origemClassificacao: ORIGEM.IA, confiancaIa: 0.93 }),
      manut('m2', v2, { status: MANUT.AGENDADO, comentarioAprovador: 'Ok', janelaInicio: segundaDe(offset(7)), janelaFim: somarDias(segundaDe(offset(7)), 6), dataAprovacao: offset(-1) }),
      manut('m3', v1, { status: MANUT.PROGRAMADO, janelaInicio: offset(-3), janelaFim: offset(-3), dataAprovacao: offset(-6) }),
      manut('m4', v1, { status: MANUT.REALIZADO, dataManutencao: iso(-40), valor: 480.9, estabelecimento: 'Oficina Teste', servicoRealizado: 'Troca de óleo', criadoEm: iso(-45), km: 160000, servicos: [100000000, 100000001], categorias: [100000000], origemClassificacao: ORIGEM.MANUAL }),
      // Reincidência fictícia: com m1, 3ª vez do mesmo serviço de freio no v1 em 120 dias.
      manut('m4b', v1, { status: MANUT.REALIZADO, dataManutencao: iso(-70), valor: 650, estabelecimento: 'Oficina Teste', descricao: 'Freio rangendo (fictício)', criadoEm: iso(-72), servicos: [100000007], categorias: [100000001], origemClassificacao: ORIGEM.MANUAL }),
      manut('m4c', v1, { status: MANUT.REALIZADO, dataManutencao: iso(-25), valor: 720, estabelecimento: 'Freios Exemplo', descricao: 'Freio voltou a fazer ruído (fictício)', criadoEm: iso(-27), servicos: [100000007], categorias: [100000001], origemClassificacao: ORIGEM.MANUAL }),
      manut('m5', v2, { status: MANUT.REALIZADO, dataManutencao: iso(-100), valor: 1250, tipo: 100000001, criadoEm: iso(-110) }),
      manut('m6', v2, { status: MANUT.REALIZADO, dataManutencao: iso(-70), tipo: 2, criadoEm: iso(-72) }),
      // Fila "A encaixar" de exemplo: Urgente (m1), Alta parada há 5 dias (m7) e Baixa de ontem (m8).
      manut('m7', v2, { grau: 3, descricao: 'Ar-condicionado sem gelar (fictício)', criadoEm: iso(-5) }),
      manut('m8', v1, { grau: 1, descricao: 'Lâmpada da placa queimada (fictício)', criadoEm: iso(-1) }),
      ...volumeManutencoes(mockVolume(), v1, v2),
    ],
    // Uma multa em cada etapa, uma com prazo vencido e uma aguardando penalidade (spec §7, Mock).
    multas: [
      multa('u1', {}),
      multa('u2', { status: MULTA.NOTIFICADO, responsavel: RESPONSAVEL.MOTORISTA, dataAviso: offset(-2), dataParaIndicar: offset(2), motorista: ana }),
      multa('u3', { status: MULTA.FINALIZADO, responsavel: RESPONSAVEL.MOTORISTA, indicado: true, canal: CANAL.DSV, dataAviso: offset(-80), dataIndicacao: offset(-78), pagaEm: offset(-40), valorPago: 130.16, competencia: `${addMonths(todaySP(), -1).slice(0, 7)}-01`, acertoEm: offset(-30), encerradaEm: offset(-30), dataHora: iso(-90) }),
      multa('u4', { status: MULTA.PAGO, responsavel: RESPONSAVEL.MOTORISTA, motorista: ana, infracaoId: null, veiculo: v2, dataHora: iso(-150), pagaEm: offset(-3), valorPago: 130.16, arquivos: { autuacao: 'auto-u4.pdf', penalidade: 'penalidade-u4.pdf', comprovante: 'comprovante-u4.pdf' } }),
      multa('u5', { dataParaIndicar: offset(-1), dataHora: iso(-35) }),
      multa('u6', { status: MULTA.INDICADA, responsavel: RESPONSAVEL.EMPRESA, motivoEmpresa: MOTIVO_EMPRESA.PRAZO_PERDIDO, dataParaIndicar: offset(-10), dataHora: iso(-50) }),
      multa('u7', { status: MULTA.INDICADA, responsavel: RESPONSAVEL.MOTORISTA, motorista: ana, canal: CANAL.DSV, dataAviso: offset(-20), dataIndicacao: offset(-18), indicado: true, vencimento: offset(4), valorComDesconto: 78.1, dataHora: iso(-45) }),
      multa('u8', { status: MULTA.NOTIFICADO, responsavel: RESPONSAVEL.MOTORISTA, canal: CANAL.SENATRAN, dataAviso: offset(-5), dataIndicacao: offset(-3), indicado: true, dataParaIndicar: offset(6) }),
      multa('u9', { status: MULTA.CANCELADA, canceladaEm: offset(-7), motivoCancelamento: 'Multa duplicada no portal (fictício).' }),
      multa('u11', { status: MULTA.PAGO, responsavel: RESPONSAVEL.MOTORISTA, motorista: bruno, indicado: true, canal: CANAL.DSV, dataAviso: offset(-50), dataIndicacao: offset(-48), pagaEm: offset(-35), valorPago: 100, competencia: `${addMonths(todaySP(), -1).slice(0, 7)}-01`, acertoEm: offset(-20), dataHora: iso(-70), titulo: 'TST0002' }),
      multa('u12', { status: MULTA.PAGO, responsavel: RESPONSAVEL.MOTORISTA, motorista: ana, indicado: true, canal: CANAL.DSV, dataAviso: offset(-30), dataIndicacao: offset(-28), pagaEm: offset(-5), valorPago: 100, dataHora: iso(-40), titulo: 'TST0005' }),
      multa('u10', { status: MULTA.RECURSO, responsavel: RESPONSAVEL.MOTORISTA, recursoPendente: true, veiculo: v2 }),
      // Fase 3 (o motorista resolve no app): autos A000000101 a A000000106, cada um com o passo corrente de um caso.
      // (a) etapa 2, aditivo e sem termo; (b) etapa 2, termo pendente de ontem; (c) etapa 1, contestada; (d) Senatran com aceite declarado; (e) e (f) Acertar com termo assinado.
      multa('f3a', { titulo: 'A000000101', codigo: 'A000000101', status: MULTA.NOTIFICADO, responsavel: RESPONSAVEL.MOTORISTA, motorista: motTeste, veiculo: fase3Tst, dataParaIndicar: offset(8), valorGuia: 293.47 }),
      multa('f3b', { titulo: 'A000000102', codigo: 'A000000102', status: MULTA.NOTIFICADO, responsavel: RESPONSAVEL.MOTORISTA, motorista: motTeste, veiculo: fase3Abc, dataParaIndicar: offset(8), valorGuia: 293.47, termoVigente: { id: 'tf3b-1', label: 'tf3b-1' } }),
      multa('f3c', { titulo: 'A000000103', codigo: 'A000000103', status: MULTA.NOTIFICAR, motorista: motTeste, veiculo: fase3Tst, dataParaIndicar: offset(8), contestadaEm: offset(-1) }),
      multa('f3d', { titulo: 'A000000104', codigo: 'A000000104', status: MULTA.NOTIFICADO, responsavel: RESPONSAVEL.MOTORISTA, motorista: motTeste, veiculo: fase3Abc, canal: CANAL.SENATRAN, dataAviso: offset(-3), dataIndicacao: offset(-2), indicado: true, dataParaIndicar: offset(8), aceiteDeclaradoEm: offset(-1) }),
      multa('f3e', { titulo: 'A000000105', codigo: 'A000000105', status: MULTA.PAGO, responsavel: RESPONSAVEL.MOTORISTA, motorista: motTeste, veiculo: fase3Tst, indicado: true, canal: CANAL.DSV, dataAviso: offset(-40), dataIndicacao: offset(-38), pagaEm: offset(-3), valorPago: 293.47, dataHora: iso(-60) }),
      multa('f3f', { titulo: 'A000000106', codigo: 'A000000106', status: MULTA.PAGO, responsavel: RESPONSAVEL.MOTORISTA, motorista: motTeste, veiculo: fase3Abc, indicado: true, canal: CANAL.DSV, dataAviso: offset(-70), dataIndicacao: offset(-68), pagaEm: offset(-3), valorPago: 293.47, dataHora: iso(-90) }),
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

/** Id de um `@odata.bind` do mock (`/conjunto(id)`). */
const idDoBind = (value: unknown) => /\(([^)]+)\)$/.exec(String(value))?.[1]
const COLLECTION: Record<Kind, 'manutencoes' | 'multas' | 'colisoes'> = { manutencao: 'manutencoes', multa: 'multas', colisao: 'colisoes' }
const FIELD_TO_PROP: Record<string, string> = {
  cr40f_agendarpara: 'agendarPara', cr40f_datamanutencao: 'dataManutencao', cr40f_valor: 'valor', cr40f_estabelecimento: 'estabelecimento', cr40f_servicorealizado: 'servicoRealizado', cr40f_comentariosdoaprovador: 'comentarioAprovador',
  cr40f_datadeavisoaocondutor: 'dataAviso', cr40f_datadeindicacao: 'dataIndicacao', cr40f_indicado: 'indicado', new_valorguia: 'valorGuia', new_recursopendente: 'recursoPendente', cr40f_vencimento: 'vencimento', cr40f_valorcomdesconto: 'valorComDesconto',
  cr40f_kmatual: 'km', cr40f_graudamanutencao: 'grau', cr40f_tipodoreparo: 'tipo', cr40f_janelainicio: 'janelaInicio', cr40f_janelafim: 'janelaFim', cr40f_kmrealizado: 'kmRealizado',
  [CAMPO.origem]: 'origemClassificacao', [CAMPO.confianca]: 'confiancaIa', [CAMPO.descricao]: 'descricao',
}

const MULTI_TO_PROP: Record<string, string> = { [CAMPO.servicos]: 'servicos', [CAMPO.categorias]: 'categorias' }

/** Leva o estado novo do passo para a multa do mock; o motorista escolhido vira Ref pelas pessoas fictícias. */
function aplicarNaMulta(m: Multa, e: MultaEstado, pessoas: Ref[]) {
  Object.assign(m, {
    status: e.status ?? null, responsavel: e.responsavel ?? null, motivoEmpresa: e.motivoEmpresa ?? null, dataAviso: e.dataAviso || null, avisoAutomaticoEm: e.avisoAutomaticoEm || m.avisoAutomaticoEm || null,
    canal: e.canal ?? null, dataIndicacao: e.dataIndicacao || null, indicado: e.indicado ?? false, aceiteEm: e.aceiteEm || null,
    pagaEm: e.pagaEm || null, valorPago: e.valorPago ?? null, competencia: e.competencia || null, acertoEm: e.acertoEm || null,
    encerradaEm: e.encerradaEm || null, canceladaEm: e.canceladaEm || null, motivoCancelamento: e.motivoCancelamento || null, recursoPendente: e.recursoPendente ?? false,
  })
  if (e.motoristaId && e.motoristaId !== m.motorista?.id) m.motorista = pessoas.find((p) => p.id === e.motoristaId) ?? m.motorista
}

export function createMockSource(): DataSource {
  const data = seed()
  const fotos = new Map<string, Blob>()
  // Aditivo exige data e PDF, como no Dataverse. Só a Ana (fictícia) tem os dois; o Bruno tem a data sem o PDF.
  const aditivos = new Map<string, { data: string | null; arquivo: string | null }>([[ana.id, { data: '2026-10-15', arquivo: 'aditivo.pdf' }], [motTeste.id, { data: '2026-10-15', arquivo: 'aditivo.pdf' }], [bruno.id, { data: '2026-10-15', arquivo: null }]])
  const temAditivo = (id: string) => { const a = aditivos.get(id); return !!a?.data && !!a.arquivo }
  const termo = (id: string, extra: Partial<TermoMulta>): TermoMulta => ({ id, status: 'pendente', forma: 'folha', parcelas: 3, valorTotal: 293.47, primeiraCompetencia: addMonths(`${todaySP().slice(0, 7)}-01`, 1), enviadoEm: iso(-4), assinadoEm: null, hashPdf: null, motivoContestacao: null, ultimoLembreteEm: null, criadoEm: iso(-4), ...extra })
  // Termos fictícios: u2 pendente (Ana), u3 assinado com parcelas, u4 contestado.
  const termos = new Map<string, TermoMulta[]>([
    ['u2', [termo('tu2-1', { forma: 'guia', parcelas: 1, valorTotal: 195.23, enviadoEm: iso(-4), ultimoLembreteEm: iso(-2) })]],
    ['u3', [termo('tu3-1', { status: 'assinado', enviadoEm: iso(-30), assinadoEm: iso(-28), hashPdf: '9f2c1a7be04d3f6a8c1e5b2d7f9a0c3e4b6d8f1a2c3e5b7d9f0a1c2e3b4d5f6a' })]],
    ['u4', [termo('tu4-1', { status: 'contestado', forma: 'guia', parcelas: 1, valorTotal: 130.16, enviadoEm: iso(-6), motivoContestacao: 'Eu estava de folga nesse dia (fictício).' })]],
    ['f3b', [termo('tf3b-1', { forma: 'folha', enviadoEm: iso(-1) })]],
    ['f3c', [termo('tf3c-1', { status: 'contestado', enviadoEm: iso(-3), motivoContestacao: 'Eu não estava com o carro nesse dia (fictício).' })]],
    ['f3e', [termo('tf3e-1', { status: 'assinado', enviadoEm: iso(-6), assinadoEm: iso(-4), hashPdf: '5d41402abc4b2a76b9719d911017c592e3b0c44298fc1c149afbf4c8996fb924' })]],
    ['f3f', [termo('tf3f-1', { status: 'assinado', enviadoEm: iso(-6), assinadoEm: iso(-4), primeiraCompetencia: addMonths(`${todaySP().slice(0, 7)}-01`, -3), hashPdf: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae' })]],
  ])
  const parcelas = new Map([['tu3-1', [0, 1, 2].map((i) => ({ numero: i + 1, competencia: addMonths(`${todaySP().slice(0, 7)}-01`, i - 1), valor: i === 0 ? 97.83 : 97.82, status: i === 0 ? 'Descontada' : 'Prevista' }))]])
  // Parcelas de folha fictícias (RH): quatro colaboradores, meses relativos a hoje.
  const mes = (n: number) => `${addMonths(`${todaySP().slice(0, 7)}-01`, n)}`
  const colab = (id: string, nome: string, cpf: string) => ({ id, nome, cpf })
  const colabAna = colab('fc1', 'Ana Teste (fictício)', '000.000.000-00')
  const colabBruno = colab('fc2', 'Bruno Teste (fictício)', '111.111.111-11')
  const colabCarla = colab('fc3', 'Carla Teste (fictício)', '222.222.222-22')
  const colabDiego = colab('fc4', 'Diego Teste (fictício)', '333.333.333-33')
  const parcelasFolha: ParcelaFolha[] = []
  const plano = (multaId: string, auto: string, placa: string, colaborador: ParcelaFolha['colaborador'], valor: number, n: number, primeira: string, lancadas: number[], infracao: string) => {
    for (const p of dividirParcelas(valor, n, primeira))
      parcelasFolha.push({ id: `pf-${multaId}-${p.numero}`, numero: p.numero, total: n, competencia: p.competencia, valor: p.valor, status: lancadas.includes(p.numero) ? 'descontada' : 'prevista', lancadoEm: lancadas.includes(p.numero) ? offset(-10) : null, origem: 'multa', colaborador, multa: { id: multaId, auto, placa, dataInfracao: offset(-60), infracao } })
  }
  plano('u12', 'TST0001', 'TST1A23', colabAna, 195.23, 1, mes(0), [], 'Transitar em velocidade superior (fictício)')
  plano('u11', 'TST0002', 'TST4B56', colabBruno, 100, 3, mes(-1), [1], 'Estacionar em local proibido (fictício)')
  plano('mx3', 'TST0003', 'TST7C89', colabCarla, 88.38, 1, mes(0), [1], 'Avançar sinal (fictício)')
  plano('mx4', 'TST0004', 'TST2D34', colabDiego, 150.01, 2, mes(0), [], 'Parar sobre a faixa (fictício)')
  plano('mx5', 'TST0006', 'TST5E67', colabBruno, 60, 1, mes(-2), [], 'Não usar cinto (fictício)')
  const comTermo = (multas: Multa[]) => multas.map((m) => { const t = termos.get(m.id)?.[0]; return { ...m, termo: t?.status ? { status: t.status, enviadoEm: t.enviadoEm } : null } })
  const find = (kind: Kind, id: string) => (data[COLLECTION[kind]] as { id: string; status: number | null }[]).find((item) => item.id === id)
  const delay = () => new Promise((resolve) => setTimeout(resolve, latenciaMock(250)))

  // O que só a gaveta mostra (fotos, nota, pagamento, comentários), por manutenção.
  const extras = new Map<string, Partial<DetalheManutencao>>([
    ['m1', { fotosPedido: ['https://example.invalid/fotos/m1-1.jpg', 'https://example.invalid/fotos/m1-2.jpg'] }],
    ['m4', { pagamento: 202410000, realizadoPor: bruno, linkNotaFiscal: 'https://example.invalid/fotos/m4-nf.jpg', fotosFinais: ['https://example.invalid/fotos/m4-final-1.jpg'], comentarioColaborador: 'Troca feita sem intercorrências (fictício).' }],
  ])
  const extra = (id: string) => {
    let e = extras.get(id)
    if (!e) { e = {}; extras.set(id, e) }
    return e
  }
  const manutencaoDoMock = (id: string) => {
    const m = data.manutencoes.find((item) => item.id === id)
    if (!m) throw new Error('Registro não encontrado no mock.')
    return m
  }
  const encerrada = (status: number | null) => status === MANUT.REALIZADO || status === MANUT.REPROVADO || status === MANUT.CANCELADO
  const pessoas: Ref[] = [ana, bruno, motTeste]
  // Linha da Geral de cada manutenção encaixada (o que o Agendar cria no Dataverse). As já encaixadas no seed ganham a delas.
  const linhas = new Map<string, ProgramacaoManutencao>(
    data.manutencoes
      .filter((m) => m.status === MANUT.AGENDADO || m.status === MANUT.PROGRAMADO)
      .map((m) => [m.id, { geralId: `g-${m.id}`, motorista: m.status === MANUT.PROGRAMADO ? bruno : null, saida: m.status === MANUT.PROGRAMADO && m.janelaInicio ? `${m.janelaInicio}T12:00:00.000Z` : null }]),
  )
  const CIDADES: OpcaoBusca[] = [{ id: 'c1', nome: 'São José dos Campos - SP' }, { id: 'c2', nome: 'São Paulo - SP' }, { id: 'c3', nome: 'Taubaté - SP' }]
  const contem = (nome: string, texto: string) => nome.toLowerCase().includes(texto.trim().toLowerCase())

  return {
    mode: 'mock',
    envLabel: 'MOCK',
    async load() {
      await delay()
      const copia = structuredClone(data)
      return { data: { ...copia, multas: comTermo(copia.multas) }, errors: {} }
    },
    async veiculo(id) {
      await delay()
      const v = data.veiculos.find((item) => item.id === id)
      return v ? structuredClone(v) : null
    },
    async currentStatus(kind, id) {
      return find(kind, id)?.status ?? null
    },
    async dateBehaviors() {
      return { cr40f_agendarpara: 'DateOnly', cr40f_datadeavisoaocondutor: 'DateOnly', cr40f_avisoautomaticoem: 'DateOnly', cr40f_datadeindicacao: 'DateOnly', cr40f_dataparaindicar: 'DateOnly' }
    },
    async update(kind, id, patch) {
      await delay()
      const record = find(kind, id) as Record<string, unknown> | undefined
      if (!record) throw new Error('Registro não encontrado no mock.')
      for (const [key, value] of Object.entries(patch)) {
        if (key === STATUS_FIELD[kind]) record.status = value
        else if (FIELD_TO_PROP[key]) record[FIELD_TO_PROP[key]] = value
        else if (MULTI_TO_PROP[key]) record[MULTI_TO_PROP[key]] = lerMulti(value)
        else if (key === 'cr40f_Placa_Carro@odata.bind') {
          const veiculo = data.veiculos.find((v) => v.id === idDoBind(value))
          if (veiculo) record.veiculo = { id: veiculo.id, label: veiculo.placa }
        } else if (key === 'cr40f_Solicitado_por@odata.bind') record.solicitante = pessoas.find((p) => p.id === idDoBind(value)) ?? record.solicitante
        else if (kind === 'manutencao' && key === 'cr40f_comentariosaomotorista') extra(id).comentarioAoMotorista = value as string | null
      }
    },
    async openForm(kind, id) {
      window.alert(`Mock: abriria o formulário nativo de ${kind}${id ? ` (${id})` : ' (novo)'}.`)
    },
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
    async detalheManutencao(id) {
      await delay()
      const m = data.manutencoes.find((item) => item.id === id)
      if (!m) return null
      const despesa = m.status === MANUT.REALIZADO ? { id: `d-${id}`, statusOperacional: 100000000, statusAnexo: 100000002 } : null
      return structuredClone({ ...m, comentarioAoMotorista: null, comentarioColaborador: null, pagamento: null, realizadoPor: null, fotosPedido: [], linkNotaFiscal: null, fotosFinais: [], ...extras.get(id), programacao: linhas.get(id) ?? null, despesa })
    },
    async criarManutencao(input) {
      await delay()
      const veiculo = data.veiculos.find((v) => v.id === input.veiculoId)
      if (!veiculo) throw new Error('Veículo não encontrado no mock.')
      const id = `mn${data.manutencoes.length + 1}`
      data.manutencoes.unshift(manut(id, { id: veiculo.id, label: veiculo.placa }, { descricao: input.descricao, grau: input.grau, tipo: input.tipo, km: input.km, solicitante: pessoas.find((p) => p.id === input.solicitanteId) ?? null, criadoEm: new Date().toISOString() }))
      return id
    },
    async agendarManutencao({ manutencaoId, inicio, fim, comentario, grau }) {
      await delay()
      const m = manutencaoDoMock(manutencaoId)
      if (!janelaValida({ inicio, fim })) throw new Error('A janela precisa ser um dia ou uma semana de segunda a domingo.')
      if (m.status !== MANUT.SOLICITADO && m.status !== MANUT.AGENDADO && m.status !== MANUT.PROGRAMADO) throw new Error('Só dá para encaixar uma manutenção em aberto.')
      if (!m.veiculo) throw new Error('A manutenção não tem veículo. Informe o veículo antes de encaixar.')
      Object.assign(m, { status: MANUT.AGENDADO, janelaInicio: inicio, janelaFim: fim, dataAprovacao: m.dataAprovacao ?? todaySP() })
      if (grau) m.grau = grau
      if (comentario) extra(manutencaoId).comentarioAoMotorista = comentario
      // Como o Agendar no Dataverse: cria a linha da Geral, ou a zera (sem motorista nem saída) num reagendamento.
      linhas.set(manutencaoId, { geralId: linhas.get(manutencaoId)?.geralId ?? `g-${manutencaoId}`, motorista: null, saida: null })
    },
    async programarManutencao({ manutencaoId, geralId, motoristaId, saida }) {
      await delay()
      const m = manutencaoDoMock(manutencaoId)
      if (m.status !== MANUT.AGENDADO) throw new Error('Só dá para programar uma manutenção agendada.')
      const motorista = pessoas.find((p) => p.id === motoristaId) ?? { id: motoristaId, label: '' }
      linhas.set(manutencaoId, { geralId, motorista, saida })
      m.status = MANUT.PROGRAMADO
    },
    async reprovarManutencao(id, comentario) {
      await delay()
      const m = manutencaoDoMock(id)
      if (!comentario.trim()) throw new Error('Escreva o motivo da reprovação.')
      if (m.status !== MANUT.SOLICITADO) throw new Error('Só dá para reprovar uma manutenção que ainda não foi encaixada.')
      Object.assign(m, { status: MANUT.REPROVADO, comentarioAprovador: comentario.trim() })
    },
    async cancelarManutencao(id, comentario) {
      await delay()
      const m = manutencaoDoMock(id)
      if (encerrada(m.status)) throw new Error('Esta manutenção já foi encerrada.')
      m.status = MANUT.CANCELADO
      if (comentario?.trim()) m.comentarioAprovador = comentario.trim()
      linhas.delete(id) // a linha da Geral é cancelada junto e deixa de ser a programação
    },
    async concluirManutencao(p) {
      await delay()
      const m = manutencaoDoMock(p.manutencaoId)
      if (m.status === MANUT.REPROVADO || m.status === MANUT.CANCELADO) throw new Error('Esta manutenção já foi encerrada.')
      // Mesmas validações e mensagens do Ciclo.cs (servidor).
      if (p.servicos.length === 0) throw new Error('Escolha pelo menos um serviço realizado.')
      if (!(p.km > 0)) throw new Error('Informe o km do veículo.')
      if (!(p.valor > 0)) throw new Error('Informe o valor pago.')
      if (!Object.values(PAGAMENTO).some((forma) => forma === p.pagamento)) throw new Error('Escolha a forma de pagamento.')
      if (!p.estabelecimento.trim()) throw new Error('Informe o estabelecimento.')
      if (!p.cidadeId) throw new Error('Informe a cidade.')
      if (!p.realizadoPorId) throw new Error('Informe quem realizou a manutenção.')
      if (m.status !== MANUT.REALIZADO) {
        const e = extra(p.manutencaoId)
        if (!p.linkNotaFiscal && !e.linkNotaFiscal) throw new Error('Falta a foto da nota fiscal.')
        const servicos = [...new Set(p.servicos)]
        Object.assign(m, { status: MANUT.REALIZADO, servicos, categorias: categoriasDe(servicos), origemClassificacao: ORIGEM.MANUAL, confiancaIa: null, kmRealizado: p.km, valor: p.valor, estabelecimento: p.estabelecimento, dataManutencao: p.data, servicoRealizado: p.servicoRealizado ?? m.servicoRealizado })
        Object.assign(e, {
          pagamento: p.pagamento, realizadoPor: pessoas.find((f) => f.id === p.realizadoPorId) ?? { id: p.realizadoPorId, label: '' }, comentarioColaborador: p.comentario,
          linkNotaFiscal: p.linkNotaFiscal ?? e.linkNotaFiscal ?? null, fotosFinais: [p.linkFotoFinal1, p.linkFotoFinal2, p.linkFotoFinal3].filter((l): l is string => Boolean(l)),
        })
      }
      return { despesaId: `d-${p.manutencaoId}`, statusAnexo: ANEXO_DESPESA.PENDENTE, geralId: null }
    },
    async enviarArquivoManutencao(alvo, arquivo, origem, ordem) {
      await delay()
      const caminho = `Manutenções/MOCK/${alvo.codigo || alvo.id}`
      return { link: `https://example.invalid/manutencoes/${encodeURIComponent(alvo.codigo || alvo.id)}/${origem.toLowerCase()}-${ordem}-${encodeURIComponent(arquivo.name)}`, nomeArquivo: arquivo.name, caminho }
    },
    async anexarNotaFiscalDespesa() {
      await delay()
    },
    async buscarFuncionarios(texto) {
      await delay()
      return pessoas.filter((p) => contem(p.label, texto)).map((p) => ({ id: p.id, nome: p.label }))
    },
    async buscarVeiculos(texto) {
      await delay()
      return data.veiculos
        .filter((v) => v.status !== VEICULO.VENDIDO && (contem(v.placa, texto) || contem(v.modelo ?? '', texto)))
        .map((v) => ({ id: v.id, nome: [v.placa, v.modelo].filter(Boolean).join(' · ') }))
    },
    async buscarCidades(texto) {
      await delay()
      return CIDADES.filter((c) => contem(c.nome, texto))
    },
    async listarDescontosPeriodo(inicio, fim) {
      await delay()
      return structuredClone(parcelasFolha.filter((p) => p.status !== 'cancelada' && p.competencia.slice(0, 7) >= inicio && p.competencia.slice(0, 7) <= fim))
    },
    async previstasAntes(mesRef) {
      await delay()
      const antigas = parcelasFolha.filter((p) => p.status === 'prevista' && p.competencia.slice(0, 7) < mesRef).map((p) => p.competencia.slice(0, 7)).sort()
      return { quantidade: antigas.length, maisAntigo: antigas[0] ?? null }
    },
    async listarParcelasMulta(multaId) {
      await delay()
      return structuredClone(parcelasFolha.filter((p) => p.multa?.id === multaId).sort((a, b) => a.numero - b.numero))
    },
    async lancarDescontoFolha(ids, acao): Promise<ResultadoLancamento> {
      await delay()
      if (ids.length < 1 || ids.length > 200) throw new ApiError('Escolha de 1 a 200 parcelas.', 400)
      const resultado: ResultadoLancamento = { parcelas: [], encerradas: [], reabertas: [] }
      const afetadas = new Set<string>()
      for (const id of ids) {
        const p = parcelasFolha.find((x) => x.id === id)
        const erro = !p ? 'Parcela não encontrada.' : p.status === 'cancelada' ? 'Esta parcela foi cancelada.'
          : acao === 'lancar' && p.status === 'descontada' ? 'Esta parcela já foi lançada.'
            : acao === 'desfazer' && p.status === 'prevista' ? 'Esta parcela ainda não foi lançada.' : null
        if (!p || erro) { resultado.parcelas.push({ id, ok: false, erro }); continue }
        p.status = acao === 'lancar' ? 'descontada' : 'prevista'
        p.lancadoEm = acao === 'lancar' ? todaySP() : null
        if (p.multa) afetadas.add(p.multa.id)
        resultado.parcelas.push({ id, ok: true, erro: null })
      }
      for (const multaId of afetadas) {
        const m = data.multas.find((row) => row.id === multaId)
        const todas = parcelasFolha.filter((p) => p.multa?.id === multaId)
        if (!m) continue
        if (acao === 'lancar' && m.status !== MULTA.FINALIZADO && todas.every((p) => p.status === 'descontada')) { m.status = MULTA.FINALIZADO; m.encerradaEm = todaySP(); resultado.encerradas.push(multaId) }
        if (acao === 'desfazer' && m.status === MULTA.FINALIZADO) { m.status = MULTA.PAGO; m.encerradaEm = null; resultado.reabertas.push(multaId) }
      }
      return resultado
    },
    async passoMulta(multaId, passo, dados) {
      await delay()
      const item = data.multas.find((row) => row.id === multaId)
      if (!item) throw new Error('Registro não encontrado no mock.')
      const hoje = todaySP()
      const antes = estadoDaMulta(item, null, data.infracoes.find((row) => row.id === item.infracaoId)?.valor ?? null)
      const erro = validarPasso(antes, passo, dados, hoje)
      if (erro) throw new ApiError(erro, 400)
      const depois = aplicarPasso(antes, passo, dados, hoje)
      aplicarNaMulta(item, depois, [ana, bruno, motTeste])
      return avaliar(depois, hoje)
    },
    async dossieMulta(multaId) {
      await delay()
      const item = data.multas.find((row) => row.id === multaId)
      if (!item) throw new Error('Registro não encontrado no mock.')
      const infracao = data.infracoes.find((row) => row.id === item.infracaoId)
      const quando = Date.parse(item.dataHora ?? iso(-20))
      const em = (minutos: number) => new Date(quando + minutos * 60_000).toISOString()
      return {
        multa: { id: item.id, auto: item.titulo, placa: item.veiculo?.label ?? null, dataHora: item.dataHora, local: item.local, orgao: 'DSV (fictício)', dataParaIndicar: item.dataParaIndicar, infracao: infracao ? { codigo: infracao.codigo, descricao: infracao.descricao, valor: infracao.valor } : null },
        servicos: [{ id: 's1', codigo: 'S-1001', cliente: 'Cliente Alfa (fictício)', saida: em(-60), retorno: em(120), motorista: item.motorista?.label ?? null, status: 'Concluído', noHorario: true }],
        infleet: { viagens: [{ inicio: em(-20), fim: em(20), motoristaInfleet: 'drv-ficticio', motorista: item.motorista?.label ?? null }] },
      }
    },
    urlArquivoMulta(_multaId, coluna) {
      return `data:text/plain;charset=utf-8,${encodeURIComponent(`Arquivo fictício (${coluna}): no mock não há arquivo para baixar.`)}`
    },
    async enviarArquivoMulta(multaId, coluna, file) {
      await delay()
      const item = data.multas.find((row) => row.id === multaId)
      if (!item) throw new Error('Registro não encontrado no mock.')
      const atuais = item.arquivos ?? { autuacao: null, penalidade: null, comprovante: null }
      item.arquivos = { ...atuais, [coluna === 'cr40f_comprovantepagamento' ? 'comprovante' : 'penalidade']: file.name }
    },
  }
}
