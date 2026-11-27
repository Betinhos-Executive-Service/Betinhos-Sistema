import { AUTOR, STATUS } from '../domain/choices'
import type { Atualizacao, Etapa, Projeto } from '../domain/types'

const pid = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n: number) => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`
const aid = (n: number) => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`
const xid = (n: number) => `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`

/** Projetos de exemplo, genéricos e fictícios. */
export function createMockProjetos(): Projeto[] {
  return [
    { id: pid(1), codigo: 'PRJ-1', nome: 'Painel de indicadores', briefing: 'Quero ver num lugar só os números do mês: serviços feitos, cancelados e o faturamento por cliente.', checklist: [{ texto: 'Serviços feitos e cancelados', feito: true }, { texto: 'Faturamento por cliente', feito: true }, { texto: 'Filtro por período', feito: false }], prazo: { tipo: 'semana', fim: '2026-12-06' } },
    { id: pid(2), codigo: 'PRJ-2', nome: 'Cadastro de documentos', briefing: 'Guardar os documentos de cada veículo com a data de vencimento.', checklist: [{ texto: 'Tela de cadastro', feito: true }, { texto: 'Alerta de vencimento', feito: false }], prazo: { tipo: 'dia', fim: '2026-11-27' } },
    { id: pid(3), codigo: 'PRJ-3', nome: 'Aviso de vencimento', briefing: 'O aviso chega por e-mail 30 dias antes do vencimento.', checklist: [], prazo: { tipo: 'mes', fim: '2026-11-30' } },
    { id: pid(4), codigo: 'PRJ-4', nome: 'Relatório mensal automático', briefing: 'Gravei um áudio explicando o relatório que preciso.', checklist: [], prazo: { tipo: 'mes', fim: '2026-12-31' } },
    { id: pid(5), codigo: 'PRJ-5', nome: 'Revisão do fluxo de aprovação', briefing: '', checklist: [{ texto: 'Definir quem aprova cada valor', feito: false }], prazo: { tipo: 'dia', fim: '2026-11-20' } },
  ]
}

const etapa = (projeto: number, nome: string, status: number, over: Partial<Etapa> = {}): Etapa => ({
  id: eid(projeto), projetoId: pid(projeto), numero: 1, codigo: `PRJ-${projeto}.1`, nome, status, prazo: null, andamento: 0, linkPr: '', publicadoProd: null, motivoPausa: '', ...over,
})

/** Etapa única (`PRJ-n.1`) de cada projeto de exemplo; o PRJ-4 fica sem etapa (só o briefing). */
export function createMockEtapas(): Etapa[] {
  return [
    etapa(1, 'Conferir os valores com o relatório de outubro', STATUS.validacao, { prazo: '2026-12-10', andamento: 90, linkPr: 'https://github.com/exemplo/sistema/pull/101' }),
    etapa(2, 'Tela de cadastro e alerta de vencimento', STATUS.andamento, { prazo: '2026-12-20', andamento: 55, linkPr: 'https://github.com/exemplo/sistema/pull/102' }),
    etapa(3, '', STATUS.concluida, { prazo: '2026-11-15', andamento: 100, linkPr: 'https://github.com/exemplo/sistema/pull/99', publicadoProd: '2026-11-16T09:10:00' }),
    etapa(5, 'Definir quem aprova cada valor', STATUS.pausada, { prazo: '2026-10-30', andamento: 30, motivoPausa: 'Esperando o financeiro definir os limites de aprovação.' }),
  ]
}

/** Imagem de exemplo (SVG) usada como anexo no modo mock. */
export const mockSvg = (rotulo: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><rect width="320" height="200" fill="#e8eef5"/><rect x="16" y="16" width="288" height="28" rx="6" fill="#b8c7da"/><rect x="16" y="60" width="130" height="124" rx="6" fill="#cfd9e6"/><rect x="160" y="60" width="144" height="56" rx="6" fill="#cfd9e6"/><rect x="160" y="128" width="144" height="56" rx="6" fill="#cfd9e6"/><text x="24" y="36" font-family="sans-serif" font-size="14" fill="#2b3a4d">${rotulo}</text></svg>`

/** Áudio de exemplo: WAV de silêncio (8 kHz, 8 bits, mono). */
export function mockWav(segundos: number): Blob {
  const n = 8000 * segundos
  const buf = new DataView(new ArrayBuffer(44 + n))
  const ascii = (o: number, s: string) => { for (let i = 0; i < s.length; i += 1) buf.setUint8(o + i, s.charCodeAt(i)) }
  ascii(0, 'RIFF'); buf.setUint32(4, 36 + n, true); ascii(8, 'WAVEfmt '); buf.setUint32(16, 16, true); buf.setUint16(20, 1, true); buf.setUint16(22, 1, true)
  buf.setUint32(24, 8000, true); buf.setUint32(28, 8000, true); buf.setUint16(32, 1, true); buf.setUint16(34, 8, true); ascii(36, 'data'); buf.setUint32(40, n, true)
  for (let i = 0; i < n; i += 1) buf.setUint8(44 + i, 128)
  return new Blob([buf.buffer], { type: 'audio/wav' })
}

const mk = (n: number, projeto: number, etapaN: number | null, data: string, autor: number, texto: string, over: Partial<Atualizacao> = {}): Atualizacao => ({
  id: aid(n), projetoId: pid(projeto), etapaId: etapaN == null ? null : eid(etapaN), data, autor, texto, prova: false, transcricao: '', anexos: [], ...over,
})

/** Atualizações de exemplo; os anexos apontam para arquivos fabricados em `createMockArquivos`. */
export function createMockAtualizacoes(): Atualizacao[] {
  return [
    mk(1, 1, null, '2026-11-01T09:00:00', AUTOR.gestor, 'Print do relatório que uso hoje.', { anexos: [{ id: xid(3), nome: 'relatorio-atual.svg', tipo: 'image/svg+xml', tamanho: 900 }] }),
    mk(2, 1, 1, '2026-11-11T10:05:00', AUTOR.agente, 'Publicado no DEV. Print dos cartões carregados.', { prova: true, anexos: [{ id: xid(1), nome: 'dashboard-dev.svg', tipo: 'image/svg+xml', tamanho: 900 }] }),
    mk(3, 1, 1, '2026-11-20T14:30:00', AUTOR.agente, 'PR aberto com o seletor de período.'),
    mk(4, 1, 1, '2026-11-22T09:00:00', AUTOR.gestor, 'Conferi os valores com o relatório de outubro.', { anexos: [{ id: xid(4), nome: 'audio-conferencia.wav', tipo: 'audio/wav', tamanho: 8044 }], transcricao: 'Conferi outubro e bateu com o relatório. Só falta o filtro por cliente.' }),
    mk(5, 3, 3, '2026-11-14T16:20:00', AUTOR.renan, 'Aviso recebido por e-mail no teste real. Prova anexada.', { prova: true, anexos: [{ id: xid(2), nome: 'email-aviso.svg', tipo: 'image/svg+xml', tamanho: 900 }, { id: xid(6), nome: 'video-aviso.webm', tipo: 'video/webm', tamanho: 4 }] }),
    mk(6, 2, 2, '2026-11-12T11:40:00', AUTOR.agente, 'Migration aplicada no DEV; tela de cadastro em ajuste.'),
    mk(7, 4, null, '2026-11-22T17:15:00', AUTOR.gestor, '', { anexos: [{ id: xid(5), nome: 'audio-briefing.wav', tipo: 'audio/wav', tamanho: 8044 }] }),
    mk(8, 3, 3, '2026-11-20T18:05:00', AUTOR.agente, 'Publicado no PROD pelo workflow Produção.'),
  ]
}

/** Conteúdo dos anexos de exemplo, por id. */
export function createMockArquivos(): Map<string, Blob> {
  return new Map([
    [xid(1), new Blob([mockSvg('Dashboard (DEV)')], { type: 'image/svg+xml' })],
    [xid(2), new Blob([mockSvg('E-mail de aviso')], { type: 'image/svg+xml' })],
    [xid(3), new Blob([mockSvg('Relatório atual')], { type: 'image/svg+xml' })],
    [xid(4), mockWav(1)],
    [xid(5), mockWav(1)],
    [xid(6), new Blob(['mock'], { type: 'video/webm' })],
  ])
}
