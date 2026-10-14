// domain/nomes.ts
import { pastaFuncionario, sanitizeFileName } from '../../funcionarios/data/sharepoint'
import type { Categoria, Dono, TipoDoc } from './types'

/** Pasta-raiz de cada categoria na biblioteca do SharePoint (Funcionarios já existe; Veiculos já guarda as fotos). */
export const RAIZ: Record<Categoria, string> = { pessoas: 'Funcionarios', frota: 'Veiculos' }

export const subpastaDoc = (codigo: string) => `Documentos/${codigo}`
export const pastaDoc = (categoria: Categoria, donoId: string, codigo: string, envLabel: string) =>
  `${pastaFuncionario(donoId, envLabel, RAIZ[categoria])}/${subpastaDoc(codigo)}`

export const nomeDocumento = (tipo: Pick<TipoDoc, 'nome'>, dono: Pick<Dono, 'nome'>) => `${tipo.nome} · ${dono.nome}`.slice(0, 850)

/** Início do nome dos arquivos de um documento: separa a versão vigente das antigas na mesma pasta. */
export const prefixoArquivo = (codigo: string, data: string | null) => `${codigo}_${data ?? 'sem-data'}_`

/** `CNH_2031-05-10_frente.pdf`: a data é a validade (ou a emissão, sem validade). */
export const nomeArquivo = (codigo: string, data: string | null, original: string) => sanitizeFileName(`${prefixoArquivo(codigo, data)}${original}`)

/** Nome para mostrar: sem o prefixo `código_data_` que separa as versões na pasta (`CNH_2031-05-10_frente.pdf` → `frente.pdf`). */
export const nomeAmigavel = (nome: string) => /^.+?_(?:\d{4}-\d{2}-\d{2}|sem-data)_(.+)$/.exec(nome)?.[1] ?? nome

/** Corta no meio para caber em `max` caracteres, mantendo o começo e o fim (a extensão). */
export function elipseMeio(nome: string, max = 28) {
  if (nome.length <= max) return nome
  const fim = Math.ceil((max - 1) * 0.4)
  return `${nome.slice(0, max - 1 - fim)}…${nome.slice(nome.length - fim)}`
}
