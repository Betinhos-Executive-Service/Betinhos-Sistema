import { AUTOR, STATUS } from '../domain/choices'
import type { Atualizacao, Projeto } from '../domain/types'

const pid = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`
const aid = (n: number) => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`
const xid = (n: number) => `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`

/** Projetos de exemplo, genéricos e fictícios. */
export function createMockProjetos(): Projeto[] {
  return [
    { id: pid(1), nome: 'Painel de indicadores', area: 'Dashboard', status: STATUS.validacao, responsavel: 'Equipe de TI', prazo: '2026-12-10', andamento: 90, linkPr: 'https://github.com/exemplo/sistema/pull/101', instrucoes: 'Abra o menu Dashboard.\nEscolha o período no topo da tela.\nOs cartões atualizam sozinhos a cada 5 minutos.' },
    { id: pid(2), nome: 'Cadastro de documentos', area: 'Cadastros', status: STATUS.andamento, responsavel: 'Equipe de TI', prazo: '2026-12-20', andamento: 55, linkPr: 'https://github.com/exemplo/sistema/pull/102', instrucoes: '' },
    { id: pid(3), nome: 'Aviso de vencimento', area: 'Frota', status: STATUS.concluido, responsavel: 'Equipe de TI', prazo: '2026-11-15', andamento: 100, linkPr: 'https://github.com/exemplo/sistema/pull/99', instrucoes: 'O aviso chega por e-mail 30 dias antes do vencimento.' },
    { id: pid(4), nome: 'Relatório mensal automático', area: 'Financeiro', status: STATUS.ideia, responsavel: '', prazo: null, andamento: 0, linkPr: '', instrucoes: '' },
    { id: pid(5), nome: 'Revisão do fluxo de aprovação', area: 'Operacional', status: STATUS.pausado, responsavel: 'Equipe de TI', prazo: '2026-10-30', andamento: 30, linkPr: '', instrucoes: '' },
  ]
}

/** Imagem de exemplo (SVG) usada como anexo de prova no modo mock. */
export const mockSvg = (rotulo: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><rect width="320" height="200" fill="#e8eef5"/><rect x="16" y="16" width="288" height="28" rx="6" fill="#b8c7da"/><rect x="16" y="60" width="130" height="124" rx="6" fill="#cfd9e6"/><rect x="160" y="60" width="144" height="56" rx="6" fill="#cfd9e6"/><rect x="160" y="128" width="144" height="56" rx="6" fill="#cfd9e6"/><text x="24" y="36" font-family="sans-serif" font-size="14" fill="#2b3a4d">${rotulo}</text></svg>`

/** Atualizações de exemplo; os anexos apontam para arquivos fabricados em `createMockArquivos`. */
export function createMockAtualizacoes(): Atualizacao[] {
  return [
    { id: aid(1), projetoId: pid(1), data: '2026-11-20T14:30:00', autor: AUTOR.agente, texto: 'PR aberto com os cartões e o seletor de período.', prova: false, anexos: [] },
    { id: aid(2), projetoId: pid(1), data: '2026-11-21T10:05:00', autor: AUTOR.agente, texto: 'Publicado no DEV. Print da tela com os cartões carregados.', prova: true, anexos: [{ id: xid(1), nome: 'dashboard-dev.svg', tipo: 'image/svg+xml', tamanho: 900 }] },
    { id: aid(3), projetoId: pid(1), data: '2026-11-22T09:00:00', autor: AUTOR.gestor, texto: 'Conferi os valores com o relatório de outubro. Falta só o filtro por cliente.', prova: false, anexos: [] },
    { id: aid(4), projetoId: pid(3), data: '2026-11-14T16:20:00', autor: AUTOR.renan, texto: 'Aviso recebido por e-mail no teste real. Prova anexada.', prova: true, anexos: [{ id: xid(2), nome: 'email-aviso.svg', tipo: 'image/svg+xml', tamanho: 900 }] },
    { id: aid(5), projetoId: pid(2), data: '2026-11-19T11:40:00', autor: AUTOR.agente, texto: 'Migration aplicada no DEV; tela de cadastro em ajuste.', prova: false, anexos: [] },
  ]
}

/** Conteúdo dos anexos de exemplo, por id. */
export function createMockArquivos(): Map<string, Blob> {
  return new Map([
    [xid(1), new Blob([mockSvg('Dashboard (DEV)')], { type: 'image/svg+xml' })],
    [xid(2), new Blob([mockSvg('E-mail de aviso')], { type: 'image/svg+xml' })],
  ])
}

