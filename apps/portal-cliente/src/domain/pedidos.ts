import type { StatusTone } from '@betinhos/ui'
import { erroAntecedencia, type Prazos } from './prazos'
import type { EnderecoSugerido, Modulo, NovoPedido, Pedido, PassageiroPedido, StatusPedido } from './types'

export const MODULO_LABEL: Record<Modulo, string> = { validar: 'Validar', pedir: 'Pedir serviço', meus_servicos: 'Meus serviços' }

/** Abas do cabeçalho: os módulos do cliente mais "Para aprovar", que só o aprovador vê. */
export type AbaPortal = Modulo | 'aprovar'
export const ABA_LABEL: Record<AbaPortal, string> = { ...MODULO_LABEL, aprovar: 'Para aprovar' }

/** Motivo mínimo de uma recusa (o Worker confere o mesmo limite). */
export const MOTIVO_RECUSA_MIN = 5
export const MOTIVO_RECUSA_MAX = 500

export const MAX_PASSAGEIROS = 4
/** Nome de passageiro e endereço: cabem em `cr40f_portalpedido` (memo de 4000) junto com a observação. */
export const MAX_NOME = 100
export const MAX_ENDERECO = 300
/** Limite dos textos livres do portal (observação do pedido, mensagens da validação). */
export const MAX_TEXTO = 2000
/** Pedidos iguais (mesmo solicitante, saída e trajeto) neste intervalo são o mesmo clique duplo. */
export const JANELA_DUPLICADO_MS = 60 * 1000
const UM_ANO_MS = 366 * 24 * 60 * 60 * 1000

export type ErrosPedido = Partial<Record<'passageiros' | 'origem' | 'destino' | 'saida' | 'tipoVeiculo' | 'observacao', string>>

/** Tipos de veículo que o portal aceita (choice `cr40f_tipodeveiculo`); qualquer outro valor o Dataverse recusa. */
export const TIPOS_VEICULO: { valor: number; rotulo: string }[] = [
  { valor: 202410001, rotulo: 'Executivo' },
  { valor: 202410002, rotulo: 'Blindado' },
  { valor: 100000002, rotulo: 'Minivan' },
  { valor: 202410003, rotulo: 'Van' },
  { valor: 202410004, rotulo: 'Van Blindado' },
]
/** Assumi estas capacidades (passageiros); só orientam o aviso na tela, nada é bloqueado nem gravado. Confirmar com a operação. */
export const CAPACIDADE_VEICULO: Record<number, number> = { 202410001: 3, 202410002: 3, 100000002: 6, 202410003: 14, 202410004: 10 }
export const capacidadeVeiculo = (valor?: number) => (valor === undefined ? undefined : CAPACIDADE_VEICULO[valor])
export const rotuloVeiculo = (valor?: number) => TIPOS_VEICULO.find((t) => t.valor === valor)?.rotulo

export const MAX_EMAIL = 120
export const MAX_TELEFONE = 30
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const soDigitos = (t: string) => t.replace(/\D/g, '')
/** Celular com DDD (10 ou 11 dígitos), aceitando +55 na frente. */
export function celularValido(t: string): boolean {
  let d = soDigitos(t)
  if (d.startsWith('55') && d.length > 11) d = d.slice(2)
  return d.length === 10 || d.length === 11
}
export const emailValido = (t: string) => EMAIL_OK.test(t)
/** Nome sem acento, caixa ou espaço repetido: "João  Silva" = "joao silva". */
export const chaveNome = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

/** Erro de um passageiro (nome e contato), ou `undefined`. */
export function erroPassageiro(p: PassageiroPedido): string | undefined {
  if (!p.nome) return 'Informe o nome do passageiro.'
  if (p.nome.length > MAX_NOME) return `O nome tem no máximo ${MAX_NOME} caracteres.`
  if (!p.telefone && !p.email) return 'Informe celular ou e-mail.'
  if (p.telefone && (p.telefone.length > MAX_TELEFONE || !celularValido(p.telefone))) return 'Celular inválido. Use DDD e número.'
  if (p.email && (p.email.length > MAX_EMAIL || !emailValido(p.email))) return 'E-mail inválido.'
  return undefined
}

/** Um erro (ou `undefined`) por passageiro, na ordem; repetido (mesmo id ou mesmo nome) também é erro. */
export function errosPassageiros(lista: PassageiroPedido[]): (string | undefined)[] {
  const vistos = new Set<string>()
  return lista.map((p) => {
    const proprio = erroPassageiro(p)
    const chaves = [chaveNome(p.nome), ...(p.id ? [`id:${p.id}`] : [])]
    const repetido = chaves.some((c) => vistos.has(c))
    chaves.forEach((c) => vistos.add(c))
    return proprio ?? (repetido ? 'Este passageiro já está no pedido.' : undefined)
  })
}

/** Pedido com espaços aparados, passageiros vazios removidos e contato só quando preenchido. */
export function normalizarPedido(p: NovoPedido): NovoPedido {
  const observacao = (p.observacao ?? '').trim()
  const passageiros = p.passageiros
    .map((x): PassageiroPedido => {
      const telefone = (x.telefone ?? '').trim()
      const email = (x.email ?? '').trim()
      return { ...(x.id ? { id: x.id } : {}), nome: x.nome.trim(), ...(telefone ? { telefone } : {}), ...(email ? { email } : {}) }
    })
    .filter((x) => x.nome || x.id)
    .slice(0, MAX_PASSAGEIROS)
  return {
    passageiros,
    origem: p.origem.trim(),
    destino: p.destino.trim(),
    saida: p.saida,
    ...(p.tipoVeiculo !== undefined && p.tipoVeiculo !== null ? { tipoVeiculo: p.tipoVeiculo } : {}),
    ...(observacao ? { observacao } : {}),
  }
}

/** Erros por campo de um pedido já normalizado; objeto vazio = pode enviar. */
export function validarPedido(p: NovoPedido, agoraMs: number, prazos?: Prazos): ErrosPedido {
  const e: ErrosPedido = {}
  if (!p.passageiros.length) e.passageiros = 'Informe pelo menos um passageiro.'
  else if (p.passageiros.length > MAX_PASSAGEIROS) e.passageiros = `Até ${MAX_PASSAGEIROS} passageiros por pedido.`
  else {
    const primeiro = errosPassageiros(p.passageiros).find(Boolean)
    if (primeiro) e.passageiros = primeiro
  }
  if (!p.origem) e.origem = 'Informe o endereço de saída.'
  else if (p.origem.length > MAX_ENDERECO) e.origem = `O endereço de saída tem no máximo ${MAX_ENDERECO} caracteres.`
  if (!p.destino) e.destino = 'Informe o destino.'
  else if (p.destino.length > MAX_ENDERECO) e.destino = `O destino tem no máximo ${MAX_ENDERECO} caracteres.`
  const saida = Date.parse(p.saida)
  if (Number.isNaN(saida)) e.saida = 'Informe a data e a hora da saída.'
  else if (saida < agoraMs) e.saida = 'A saída precisa ser daqui para a frente.'
  else if (saida > agoraMs + UM_ANO_MS) e.saida = 'A saída não pode passar de um ano.'
  else if (prazos) {
    const antecedencia = erroAntecedencia(saida, agoraMs, prazos)
    if (antecedencia) e.saida = antecedencia
  }
  if (p.tipoVeiculo !== undefined && !TIPOS_VEICULO.some((t) => t.valor === p.tipoVeiculo)) e.tipoVeiculo = 'Tipo de veículo inválido.'
  if ((p.observacao ?? '').length > MAX_TEXTO) e.observacao = `A observação tem no máximo ${MAX_TEXTO} caracteres.`
  return e
}

export const primeiroErroPedido = (p: NovoPedido, agoraMs: number, prazos?: Prazos) => Object.values(validarPedido(p, agoraMs, prazos))[0]

/** "Nome – contato; Nome – contato": cortesia gravada em `cr40f_passageirosetelefonedecontato` (só escrita; a leitura é por Serviços por Passageiro). */
export const textoCortesia = (ps: PassageiroPedido[]) =>
  ps.map((p) => [p.nome, p.telefone || p.email].filter(Boolean).join(' – ')).join('; ')

/** O que identifica um pedido repetido dentro da janela. */
export const chaveDuplicado = (email: string, p: Pick<NovoPedido, 'saida' | 'origem' | 'destino'>) => [email, p.saida, p.origem, p.destino].join('|').toLowerCase()

const STATUS: Record<StatusPedido, { rotulo: string; tom: StatusTone }> = {
  solicitado: { rotulo: 'Solicitado', tom: 'warning' },
  em_analise: { rotulo: 'Em análise', tom: 'warning' },
  confirmado: { rotulo: 'Confirmado', tom: 'success' },
  programado: { rotulo: 'Programado', tom: 'success' },
  em_execucao: { rotulo: 'Em execução', tom: 'info' },
  concluido: { rotulo: 'Concluído', tom: 'success' },
  cancelado: { rotulo: 'Cancelado', tom: 'danger' },
}
export const statusPedidoInfo = (s: StatusPedido) => STATUS[s]

/** Pedido esperando o aprovador do cliente: ainda não chegou à operação. */
export const aguardandoAprovacao = (p: Pick<Pedido, 'status' | 'aprovacao'>) => p.status === 'solicitado' && p.aprovacao === 'pendente'
/** Situação mostrada ao solicitante: "Aguardando aprovação" no lugar de Solicitado enquanto o aprovador não decide. */
export const situacaoDoPedido = (p: Pick<Pedido, 'status' | 'aprovacao'>): { rotulo: string; tom: StatusTone } =>
  aguardandoAprovacao(p) ? { rotulo: 'Aguardando aprovação', tom: 'warning' } : STATUS[p.status]

/** `paula.ribeiro@latasa.com.br` → `Paula Ribeiro`: nome de quem entra pelo domínio, sem cadastro prévio. */
export function nomeDoEmail(email: string): string {
  return email.split('@')[0].split(/[._-]+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

export const dominioDe = (email: string) => email.split('@')[1] ?? ''

/** Texto que vai para o campo ao escolher uma sugestão: "rótulo, endereço", sem repetir o rótulo quando o endereço já o traz. */
export function textoDoEndereco({ rotulo, endereco }: EnderecoSugerido): string {
  const texto = endereco.toLowerCase().includes(rotulo.toLowerCase()) ? endereco : `${rotulo}, ${endereco}`
  return texto.slice(0, MAX_ENDERECO)
}
