// domain/nomes.ts
import { pastaFuncionario, sanitizeFileName } from '../../funcionarios/data/sharepoint'
import type { Categoria, Dono, TipoDoc } from './types'

/** Pasta-raiz de cada categoria na biblioteca do SharePoint (Funcionarios já existe; Veiculos já guarda as fotos). */
export const RAIZ: Record<Categoria, string> = { pessoas: 'Funcionarios', frota: 'Veiculos' }

export const subpastaDoc = (codigo: string) => `Documentos/${codigo}`
export const pastaDoc = (categoria: Categoria, donoId: string, codigo: string, envLabel: string) =>
  `${pastaFuncionario(donoId, envLabel, RAIZ[categoria])}/${subpastaDoc(codigo)}`

export const nomeDocumento = (tipo: Pick<TipoDoc, 'nome'>, dono: Pick<Dono, 'nome'>) => `${tipo.nome} · ${dono.nome}`.slice(0, 850)

/** `CNH_2031-05-10_frente.pdf`: a data é a validade (ou a emissão, sem validade). */
export const nomeArquivo = (codigo: string, data: string | null, original: string) => sanitizeFileName(`${codigo}_${data ?? 'sem-data'}_${original}`)
