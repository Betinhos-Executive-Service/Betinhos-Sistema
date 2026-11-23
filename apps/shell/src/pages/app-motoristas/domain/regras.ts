import {
  CATALOGO, PERFIS, compararMatrizes, configuracaoEfetiva, entradaDoCatalogo, perfilDoVinculo, resolverChave, valorNaMatriz,
  type ConfigEfetiva, type EntradaCatalogo, type Excecao, type Matriz, type Mudanca, type Origem, type Pessoa, type Perfil,
} from '@betinhos/app-config'
import type { Motorista, Registro, StatusExcecao, Versao } from './types'

export const ROTULO_PERFIL: Record<Perfil | 'admin', string> = { proprio: 'Próprio', terceiro: 'Terceiro', admin: 'Admin' }

/** Regra fixa de cada vínculo (informação; vem do App, não da matriz). */
export const REGRA_VINCULO: Record<Perfil | 'admin', string> = {
  proprio: 'histórico de 5 dias',
  terceiro: '45 dias · carro pela posse',
  admin: 'sempre tudo ligado',
}

export const rotuloChave = (chave: string) => entradaDoCatalogo(chave)?.rotulo ?? chave

/** Marca do rascunho como o servidor compara: `DateTime.ToString("o")` em UTC (7 casas). A Web API devolve sem as casas. */
export function normalizarMarca(modifiedon: string | null | undefined): string {
  if (!modifiedon) return ''
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/.exec(modifiedon.trim())
  if (!m) return modifiedon
  return `${m[1]}.${(m[2] ?? '').padEnd(7, '0').slice(0, 7)}Z`
}

// ───────────────────────── matriz ─────────────────────────

/** Matriz com todas as chaves que mudam escritas (vazia/ausente vira o padrão do catálogo): o rascunho nunca depende de "ausente = ligada". */
export function materializar(matriz: Matriz | null | undefined): Matriz {
  const saida: Record<Perfil, Record<string, boolean>> = { proprio: {}, terceiro: {} }
  for (const entrada of CATALOGO) {
    if (entrada.fixa) continue
    for (const perfil of PERFIS) saida[perfil][entrada.chave] = valorNaMatriz(matriz, perfil, entrada).ligado
  }
  return saida
}

export function definirCelula(matriz: Matriz | null | undefined, perfil: Perfil, chave: string, ligado: boolean): Matriz {
  const base = materializar(matriz)
  return { ...base, [perfil]: { ...base[perfil], [chave]: ligado } }
}

/** Mudanças do rascunho em relação ao publicado (nada publicado = padrão do catálogo). */
export const contarMudancas = (publicada: Matriz | null | undefined, rascunho: Matriz | null | undefined) => compararMatrizes(publicada, rascunho).length

export type Celula = { ligado: boolean; travada: boolean; mudou: 'era-ligado' | 'era-desligado' | null }

/** Célula de um perfil para a matriz da tela: valor do rascunho (ou do publicado), trava e marca de mudança. */
export function celula(entrada: EntradaCatalogo, perfil: Perfil | 'admin', publicada: Matriz | null | undefined, rascunho: Matriz | null | undefined): Celula {
  if (perfil === 'admin' || entrada.fixa) return { ligado: true, travada: true, mudou: null }
  const agora = valorNaMatriz(rascunho, perfil, entrada).ligado
  const antes = valorNaMatriz(publicada, perfil, entrada).ligado
  return { ligado: agora, travada: false, mudou: agora === antes ? null : antes ? 'era-ligado' : 'era-desligado' }
}

// ───────────────────────── pessoas ─────────────────────────

export function statusExcecao(r: Registro, hoje: string): StatusExcecao {
  if (r.encerradoEm) return 'encerrada'
  if (r.validade && r.validade < hoje) return 'vencida'
  return 'vigente'
}

export const excecoesDe = (m: Motorista) => m.registros.filter((r) => r.tipo === 'excecao')
export const excecoesVigentes = (m: Motorista, hoje: string) => excecoesDe(m).filter((r) => statusExcecao(r, hoje) === 'vigente')

/** A pessoa como o resolvedor a entende (exceções da mais antiga à mais recente: vale a última). */
export function pessoaDe(m: Motorista): Pessoa {
  const excecoes: Excecao[] = excecoesDe(m).map((r) => ({ chave: r.chave, ligado: r.ligado, validade: r.validade, encerrada: Boolean(r.encerradoEm) }))
  return { vinculo: m.vinculo, piloto: m.piloto, excecoes }
}

export const perfilDe = (m: Motorista): Perfil => perfilDoVinculo(m.vinculo)

/** Vínculo vazio ou fora de 0/1: vale como Próprio, mas o cadastro precisa de correção. */
export const semVinculo = (m: Motorista) => m.vinculo !== 0 && m.vinculo !== 1

/** Motoristas cujo valor efetivo da chave muda entre o publicado e o rascunho (descontadas exceções vigentes e piloto). */
export function afetadosPorMudanca(mudanca: Mudanca, publicada: Matriz | null | undefined, rascunho: Matriz | null | undefined, motoristas: readonly Motorista[], hoje: string): Motorista[] {
  return motoristas.filter((m) => {
    if (perfilDe(m) !== mudanca.perfil) return false
    const pessoa = pessoaDe(m)
    return resolverChave(mudanca.chave, { matriz: publicada, pessoa, hoje }).ligado !== resolverChave(mudanca.chave, { matriz: rascunho, pessoa, hoje }).ligado
  })
}

export type LinhaOrigem = { chave: string; rotulo: string; tipo: EntradaCatalogo['tipo']; ligado: boolean; origem: Origem; texto: string }

export function textoOrigem(origem: Origem, perfil: Perfil): string {
  switch (origem) {
    case 'fixa': return 'Sempre ligado'
    case 'excecao': return 'Exceção'
    case 'piloto': return 'Grupo piloto'
    case 'perfil': return `Perfil ${ROTULO_PERFIL[perfil]}`
    case 'padrao': return 'Padrão (sem versão publicada)'
    case 'modulo-pai': return 'Módulo desligado'
  }
}

/** Valor e origem de cada chave para um motorista, na matriz dada. */
export function origemPorChave(m: Motorista, matriz: Matriz | null | undefined, hoje: string, versao: number | null = null): { config: ConfigEfetiva; linhas: LinhaOrigem[] } {
  const config = configuracaoEfetiva({ matriz, pessoa: pessoaDe(m), hoje, versao })
  const linhas = CATALOGO.map((e) => ({ chave: e.chave, rotulo: e.rotulo, tipo: e.tipo, ligado: config.chaves[e.chave], origem: config.origens[e.chave], texto: textoOrigem(config.origens[e.chave], config.perfil) }))
  return { config, linhas }
}

/** Configuração efetiva de quem o preview imita: um perfil (pessoa sem exceção) ou um motorista. */
export function configDoPreview(alvo: { tipo: 'perfil'; perfil: Perfil | 'admin' } | { tipo: 'motorista'; motorista: Motorista }, matriz: Matriz | null | undefined, hoje: string, versao: number | null): ConfigEfetiva {
  if (alvo.tipo === 'motorista') return configuracaoEfetiva({ matriz, pessoa: pessoaDe(alvo.motorista), hoje, versao })
  if (alvo.perfil === 'admin') return configuracaoEfetiva({ matriz, pessoa: { piloto: true }, hoje, versao })
  return configuracaoEfetiva({ matriz, pessoa: { vinculo: alvo.perfil === 'terceiro' ? 1 : 0 }, hoje, versao })
}

export type Oculto = { chave: string; rotulo: string; soRascunho: boolean }

/** Chaves desligadas na configuração, com a marca de quais são do rascunho (desligadas no rascunho e ligadas no publicado). */
export function ocultos(rascunho: ConfigEfetiva, publicada: ConfigEfetiva | null): Oculto[] {
  return CATALOGO.filter((e) => !rascunho.chaves[e.chave]).map((e) => ({ chave: e.chave, rotulo: e.rotulo, soRascunho: publicada ? publicada.chaves[e.chave] : false }))
}

// ───────────────────────── lista de motoristas ─────────────────────────

export function readMotorista(m: Motorista, key: string, hoje: string): unknown {
  switch (key) {
    case 'nome': return m.nome
    case 'perfil': return semVinculo(m) ? 'sem-vinculo' : perfilDe(m)
    case 'piloto': return m.piloto
    case 'excecao': return excecoesVigentes(m, hoje).length > 0
    case 'semVinculo': return semVinculo(m)
    case 'semPush': return !m.push
    default: return null
  }
}

// ───────────────────────── histórico ─────────────────────────

export type EventoLinha =
  | { id: string; quando: string; tipo: 'versao'; versao: Versao; mudancas: Mudanca[] }
  | { id: string; quando: string; tipo: 'excecao-criada' | 'excecao-encerrada' | 'excecao-vencida' | 'piloto-entrou' | 'piloto-saiu'; pessoa: string; registro: Registro }

/** Último instante da validade (aaaa-mm-dd) em São Paulo, em ISO UTC, para ordenar junto dos demais eventos. */
const fimDoDia = (validade: string) => new Date(`${validade}T23:59:59-03:00`).toISOString()

/** Versões publicadas (com o que mudou em relação à anterior) e eventos por pessoa, do mais recente ao mais antigo. */
export function linhaDoTempo(versoes: readonly Versao[], motoristas: readonly Motorista[], hoje: string): EventoLinha[] {
  const publicadas = versoes.filter((v): v is Versao & { publicadoEm: string } => v.estado !== 'rascunho' && Boolean(v.publicadoEm)).sort((a, b) => a.numero - b.numero)
  const eventos: EventoLinha[] = publicadas.map((v, i) => ({
    id: `versao:${v.id}`, quando: v.publicadoEm, tipo: 'versao', versao: v, mudancas: compararMatrizes(i === 0 ? null : publicadas[i - 1].matriz, v.matriz),
  }))
  for (const m of motoristas) {
    for (const r of m.registros) {
      const pessoa = m.nome
      if (r.tipo === 'piloto') {
        eventos.push({ id: `piloto-entrou:${r.id}`, quando: r.criadoEm, tipo: 'piloto-entrou', pessoa, registro: r })
        if (r.encerradoEm) eventos.push({ id: `piloto-saiu:${r.id}`, quando: r.encerradoEm, tipo: 'piloto-saiu', pessoa, registro: r })
        continue
      }
      eventos.push({ id: `excecao-criada:${r.id}`, quando: r.criadoEm, tipo: 'excecao-criada', pessoa, registro: r })
      if (r.encerradoEm) eventos.push({ id: `excecao-encerrada:${r.id}`, quando: r.encerradoEm, tipo: 'excecao-encerrada', pessoa, registro: r })
      else if (statusExcecao(r, hoje) === 'vencida' && r.validade) eventos.push({ id: `excecao-vencida:${r.id}`, quando: fimDoDia(r.validade), tipo: 'excecao-vencida', pessoa, registro: r })
    }
  }
  return eventos.sort((a, b) => (a.quando < b.quando ? 1 : a.quando > b.quando ? -1 : a.id < b.id ? 1 : -1))
}

// ───────────────────────── exceção nova ─────────────────────────

export type ErrosExcecao = Partial<Record<'chave' | 'motivo' | 'validade', string>>

/** Motivo obrigatório; validade opcional, mas nunca no passado. `hoje` = aaaa-mm-dd (São Paulo). */
export function validarExcecao(f: { chave: string; motivo: string; validade: string }, hoje: string): ErrosExcecao {
  const erros: ErrosExcecao = {}
  const entrada = entradaDoCatalogo(f.chave)
  if (!entrada) erros.chave = 'Escolha o módulo ou a função.'
  else if (entrada.fixa) erros.chave = 'Esta chave é sempre ligada.'
  if (!f.motivo.trim()) erros.motivo = 'Explique o motivo da exceção.'
  if (f.validade) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.validade) || Number.isNaN(Date.parse(`${f.validade}T00:00:00Z`))) erros.validade = 'Data inválida.'
    else if (f.validade < hoje) erros.validade = 'A validade não pode ser no passado.'
  }
  return erros
}

// ───────────────────────── erros do servidor ─────────────────────────

/** Texto de um erro capturado (`catch` entrega `unknown`). */
export const textoDoErro = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

const CODIGOS = ['SEM_PERMISSAO', 'CHAVE_INVALIDA', 'CHAVE_FIXA', 'RASCUNHO_ALTERADO', 'NADA_A_PUBLICAR', 'MOTIVO_OBRIGATORIO', 'VALIDADE_INVALIDA', 'MOTORISTA_INVALIDO'] as const
export type CodigoErro = (typeof CODIGOS)[number]

/** O servidor põe o código no texto do erro (`SEM_PERMISSAO: ...`). */
export function codigoDoErro(reason: unknown): CodigoErro | null {
  const texto = textoDoErro(reason)
  return CODIGOS.find((c) => texto.includes(c)) ?? null
}

export function mensagemDoErro(reason: unknown, ctx: { quemAlterou?: string; quando?: string } = {}): string {
  switch (codigoDoErro(reason)) {
    case 'SEM_PERMISSAO': return 'Você não tem permissão para alterar a configuração do App.'
    case 'RASCUNHO_ALTERADO': return `${ctx.quemAlterou || 'Outra pessoa'} alterou o rascunho${ctx.quando ? ` às ${ctx.quando}` : ''}. Revise antes de publicar.`
    case 'NADA_A_PUBLICAR': return 'Não há mudanças no rascunho para publicar.'
    case 'MOTIVO_OBRIGATORIO': return 'Explique o motivo da exceção.'
    case 'VALIDADE_INVALIDA': return 'A validade precisa ser uma data de hoje em diante.'
    case 'MOTORISTA_INVALIDO': return 'Este motorista não tem acesso ao App.'
    case 'CHAVE_FIXA': return 'Esta chave é sempre ligada e não pode ser desligada.'
    case 'CHAVE_INVALIDA': return 'Chave fora do catálogo do App.'
    default: return textoDoErro(reason)
  }
}
