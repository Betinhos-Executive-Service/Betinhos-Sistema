import type { Matriz } from '@betinhos/app-config'

export type EstadoVersao = 'rascunho' | 'publicada' | 'substituida'

/** Linha de `cr40f_appconfigversao`. */
export type Versao = {
  id: string
  numero: number
  estado: EstadoVersao
  matriz: Matriz
  nota: string
  /** ISO UTC; só quando publicada ou substituída. */
  publicadoEm: string | null
  publicadoPor: string
  alteradoPor: string
  /** `modifiedon` do rascunho (ISO UTC). */
  alteradoEm: string
  /** Marca de concorrência do rascunho no formato do servidor (`o`, 7 casas); vazia quando não é rascunho. */
  marca: string
}

/** Linha de `cr40f_appconfigpessoa`: exceção por chave ou entrada no grupo piloto. */
export type Registro = {
  id: string
  funcionarioId: string
  tipo: 'excecao' | 'piloto'
  chave: string
  ligado: boolean
  motivo: string
  /** aaaa-mm-dd; vazia = sem validade. */
  validade: string | null
  /** ISO UTC; preenchido = encerrado (exceção) ou saiu do piloto. */
  encerradoEm: string | null
  criadoPor: string
  encerradoPor: string
  criadoEm: string
}

export type Motorista = {
  id: string
  nome: string
  /** `cr40f_tipodevinculo`: 1 = Terceiro; 0 = Próprio; vazio = sem vínculo (vale como Próprio). */
  vinculo: number | null
  piloto: boolean
  /** Tem inscrição de Web Push ativa. */
  push: boolean
  /** Exceções (vigentes, vencidas e encerradas) e passagens pelo piloto, da mais antiga à mais recente. */
  registros: Registro[]
}

export type Carga = {
  /** Mais recente primeiro. Pode ter no máximo um rascunho. */
  versoes: Versao[]
  motoristas: Motorista[]
}

export type StatusExcecao = 'vigente' | 'vencida' | 'encerrada'
