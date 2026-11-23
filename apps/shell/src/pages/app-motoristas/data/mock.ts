import { compararMatrizes, entradaDoCatalogo, hojeSaoPaulo, type Matriz } from '@betinhos/app-config'
import { definirCelula, materializar } from '../domain/regras'
import type { Carga, Motorista, Registro, Versao } from '../domain/types'
import type { DefinirPessoa } from './source'

/** Dados inventados do `pnpm dev`: nenhum nome ou dado real. */
const DIA = 86_400_000
const iso = (deslocamentoDias: number, hora = 12) => { const d = new Date(Date.now() + deslocamentoDias * DIA); d.setUTCHours(hora, 0, 0, 0); return d.toISOString() }
const dia = (deslocamentoDias: number) => hojeSaoPaulo(new Date(Date.now() + deslocamentoDias * DIA))

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function matrizV1(): Matriz { return materializar(null) }
function matrizV2(): Matriz { return definirCelula(matrizV1(), 'terceiro', 'treinamentos', false) }
function matrizV3(): Matriz { return definirCelula(definirCelula(matrizV2(), 'proprio', 'ideas', false), 'terceiro', 'postosProximos', false) }
/** Rascunho com 3 mudanças sobre a v3 (uma sensível ligada, uma desligada, uma que reativa). */
function matrizRascunho(): Matriz { return definirCelula(definirCelula(definirCelula(matrizV3(), 'proprio', 'services.qrCharge', true), 'terceiro', 'history', false), 'terceiro', 'treinamentos', true) }

const NOMES: [string, number | null][] = [
  ['Aurora Brandão', 0], ['Benício Teixeira', 0], ['Clarice Moura', 1], ['Davi Nogueira', 1], ['Eloá Ventura', 0], ['Fabrício Lemos', 1],
  ['Gabriela Cunha', 0], ['Heitor Almeida', 1], ['Isadora Pacheco', 0], ['Joaquim Barros', null], ['Kelly Monteiro', 1], ['Leandro Ferraz', 0],
]

function motoristas(): Motorista[] {
  const reg = (n: number, dono: number, p: Partial<Registro>): Registro => ({
    id: uuid(900 + n), funcionarioId: uuid(dono), tipo: 'excecao', chave: 'multas', ligado: true, motivo: 'Teste do módulo com o gestor', validade: null,
    encerradoEm: null, criadoPor: 'Gestor Exemplo', encerradoPor: '', criadoEm: iso(-6), ...p,
  })
  const registros: Registro[] = [
    reg(1, 3, { chave: 'services.qrCharge', motivo: 'Piloto de cobrança por QR na Dutra', validade: dia(12), criadoEm: iso(-3) }),
    reg(2, 5, { chave: 'treinamentos', ligado: false, motivo: 'Em afastamento', validade: dia(-2), criadoEm: iso(-20) }),
    reg(3, 7, { chave: 'multas', motivo: 'Acompanhamento de multas', criadoEm: iso(-9), encerradoEm: iso(-5), encerradoPor: 'Gestor Exemplo' }),
    reg(4, 8, { chave: 'history', ligado: false, motivo: 'Histórico em revisão', criadoEm: iso(-1) }),
    reg(5, 1, { tipo: 'piloto', chave: '', ligado: true, motivo: '', criadoEm: iso(-14) }),
    reg(6, 11, { tipo: 'piloto', chave: '', ligado: true, motivo: '', criadoEm: iso(-30), encerradoEm: iso(-21), encerradoPor: 'Administrador Exemplo' }),
  ]
  return NOMES.map(([nome, vinculo], i) => {
    const id = uuid(i + 1)
    const regs = registros.filter((r) => r.funcionarioId === id)
    return { id, nome, vinculo, piloto: regs.some((r) => r.tipo === 'piloto' && !r.encerradoEm), push: i !== 4 && i !== 9, registros: regs }
  })
}

function versoes(): Versao[] {
  const v = (n: number, matriz: Matriz, publicadoEm: string, nota: string, estado: Versao['estado']): Versao => ({
    id: uuid(500 + n), numero: n, estado, matriz, nota, publicadoEm, publicadoPor: 'Gestor Exemplo', alteradoPor: 'Gestor Exemplo', alteradoEm: publicadoEm, marca: '',
  })
  const marca = '2026-11-23T14:32:11.0000000Z'
  return [
    { id: uuid(504), numero: 4, estado: 'rascunho', matriz: matrizRascunho(), nota: '', publicadoEm: null, publicadoPor: '', alteradoPor: 'Gestor Exemplo', alteradoEm: marca, marca },
    v(3, matrizV3(), iso(-4, 15), 'Postos próximos e Boas ideias saem por enquanto', 'publicada'),
    v(2, matrizV2(), iso(-11, 13), 'Treinamentos só para o perfil Próprio até o RH validar', 'substituida'),
    v(1, matrizV1(), iso(-19, 17), '', 'substituida'),
  ]
}

const erro = (codigo: string, texto: string) => new Error(`${codigo}: ${texto}`)

export function createMockStore() {
  let lista = versoes()
  let pessoas = motoristas()
  let ultimo = Date.now()
  let seq = 1000
  const novaMarca = () => { ultimo = Math.max(Date.now(), ultimo + 1); return `${new Date(ultimo).toISOString().slice(0, -1)}0000Z` }
  const rascunho = () => lista.find((x) => x.estado === 'rascunho')
  const publicada = () => lista.find((x) => x.estado === 'publicada')

  return {
    carga(): Carga { return structuredClone({ versoes: lista, motoristas: pessoas }) },
    salvarRascunho(matriz: Matriz | null, base: string, descartar: boolean): string {
      const atual = rascunho()
      if (!atual && base) throw erro('RASCUNHO_ALTERADO', 'O rascunho que você abriu não existe mais. Recarregue a configuração.')
      if (atual && base !== atual.marca) throw erro('RASCUNHO_ALTERADO', 'Outra pessoa alterou o rascunho depois que você o abriu. Recarregue a configuração.')
      if (descartar) { lista = lista.filter((x) => x.estado !== 'rascunho'); return '' }
      const marca = novaMarca()
      if (atual) { atual.matriz = matriz ?? {}; atual.marca = marca; atual.alteradoEm = new Date(ultimo).toISOString(); atual.alteradoPor = 'Gestor Exemplo' }
      else {
        const numero = Math.max(0, ...lista.map((x) => x.numero)) + 1
        lista = [{ id: uuid(numero + 500), numero, estado: 'rascunho', matriz: matriz ?? {}, nota: '', publicadoEm: null, publicadoPor: '', alteradoPor: 'Gestor Exemplo', alteradoEm: new Date(ultimo).toISOString(), marca }, ...lista]
      }
      return marca
    },
    publicar(nota: string): number {
      const atual = rascunho()
      if (!atual || compararMatrizes(publicada()?.matriz ?? null, atual.matriz).length === 0) throw erro('NADA_A_PUBLICAR', 'Não há mudanças no rascunho para publicar.')
      for (const x of lista) if (x.estado === 'publicada') x.estado = 'substituida'
      Object.assign(atual, { estado: 'publicada', publicadoEm: new Date().toISOString(), publicadoPor: 'Gestor Exemplo', nota, marca: '' } satisfies Partial<Versao>)
      return atual.numero
    },
    definirPessoa(d: DefinirPessoa): void {
      const m = pessoas.find((x) => x.id === d.funcionarioId)
      if (!m) throw erro('MOTORISTA_INVALIDO', 'Motorista sem acesso ao App.')
      const agora = new Date().toISOString()
      if (d.tipo === 'piloto') {
        if (d.encerrar) { for (const r of m.registros) if (r.tipo === 'piloto' && !r.encerradoEm) Object.assign(r, { encerradoEm: agora, encerradoPor: 'Administrador Exemplo' }) }
        else if (!m.registros.some((r) => r.tipo === 'piloto' && !r.encerradoEm)) m.registros.push({ id: uuid((seq += 1)), funcionarioId: m.id, tipo: 'piloto', chave: '', ligado: true, motivo: '', validade: null, encerradoEm: null, criadoPor: 'Administrador Exemplo', encerradoPor: '', criadoEm: agora })
        m.piloto = m.registros.some((r) => r.tipo === 'piloto' && !r.encerradoEm)
        return
      }
      const chave = d.chave ?? ''
      const entrada = entradaDoCatalogo(chave)
      if (!entrada) throw erro('CHAVE_INVALIDA', 'Chave fora do catálogo.')
      if (entrada.fixa) throw erro('CHAVE_FIXA', 'Chave sempre ligada.')
      if (d.encerrar) { for (const r of m.registros) if (r.tipo === 'excecao' && r.chave === chave && !r.encerradoEm) Object.assign(r, { encerradoEm: agora, encerradoPor: 'Gestor Exemplo' }); return }
      if (!(d.motivo ?? '').trim()) throw erro('MOTIVO_OBRIGATORIO', 'Informe o motivo.')
      if (d.validade && d.validade < dia(0)) throw erro('VALIDADE_INVALIDA', 'A validade não pode ser no passado.')
      // Exceção nova da mesma chave substitui a anterior vigente.
      for (const r of m.registros) if (r.tipo === 'excecao' && r.chave === chave && !r.encerradoEm) Object.assign(r, { encerradoEm: agora, encerradoPor: 'Gestor Exemplo' })
      m.registros.push({ id: uuid((seq += 1)), funcionarioId: m.id, tipo: 'excecao', chave, ligado: d.ligado === true, motivo: (d.motivo ?? '').trim(), validade: d.validade || null, encerradoEm: null, criadoPor: 'Gestor Exemplo', encerradoPor: '', criadoEm: agora })
    },
  }
}
