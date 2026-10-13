// data/salvar.ts
import { nomeArquivo, nomeDocumento, pastaDoc } from '../domain/nomes'
import type { Arquivo, DocEmitido, Dono, TipoDoc } from '../domain/types'
import type { NovoDoc } from './queries'

export type SalvarDocInput = {
  tipo: TipoDoc; dono: Dono; anterior: DocEmitido | null
  numero: string; emissao: string | null; validade: string | null; observacao: string; arquivos: File[]
}
export type SalvarDocResult = { doc: DocEmitido; enviados: Arquivo[]; falhas: { nome: string; erro: string }[]; avisos: string[] }
export type SalvarDeps = {
  envLabel: string
  criar(input: NovoDoc): Promise<string>
  enviar(doc: DocEmitido, file: File, nome: string): Promise<Arquivo>
  substituir(id: string): Promise<void>
  dualWrite(funcionarioId: string, payload: Record<string, string | null>): Promise<void>
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Campos legados da ficha que Dashboard, App Motoristas e flows antigos ainda leem. */
function legado(tipo: TipoDoc, input: SalvarDocInput): Record<string, string | null> | null {
  if (input.dono.categoria !== 'pessoas') return null
  if (tipo.codigo === 'CNH') return { cr40f_validadedacnh: input.validade }
  if (tipo.codigo === 'ASO') return { cr40f_datadoaso: input.emissao }
  return null
}

/**
 * Cria o documento Vigente, envia os arquivos, marca o anterior como Substituído e atualiza os campos legados.
 * Só a criação é bloqueante: falhas depois dela viram `falhas`/`avisos` para a tela mostrar sem perder o que foi salvo.
 */
export async function salvarDocumento(deps: SalvarDeps, input: SalvarDocInput): Promise<SalvarDocResult> {
  const { tipo, dono } = input
  const novo: NovoDoc = {
    nome: nomeDocumento(tipo, dono), tipoId: tipo.id, categoria: dono.categoria, donoId: dono.id,
    numero: input.numero, emissao: input.emissao, validade: tipo.temValidade ? input.validade : null,
    pasta: pastaDoc(dono.categoria, dono.id, tipo.codigo, deps.envLabel), observacao: input.observacao,
  }
  const id = await deps.criar(novo)
  const doc: DocEmitido = {
    id, tipoId: tipo.id, donoId: dono.id, categoria: dono.categoria, numero: novo.numero.trim(), emissao: novo.emissao, validade: novo.validade,
    situacao: 'vigente', pasta: novo.pasta, observacao: novo.observacao.trim(), ultimoMarco: null, modificadoEm: new Date().toISOString(),
  }

  const enviados: Arquivo[] = []
  const falhas: SalvarDocResult['falhas'] = []
  for (const file of input.arquivos) {
    try { enviados.push(await deps.enviar(doc, file, nomeArquivo(tipo.codigo, doc.validade ?? doc.emissao, file.name))) }
    catch (e) { falhas.push({ nome: file.name, erro: mensagem(e) }) }
  }

  const avisos: string[] = []
  if (input.anterior) {
    try { await deps.substituir(input.anterior.id) }
    catch (e) { avisos.push(`O documento anterior não foi marcado como substituído: ${mensagem(e)}`) }
  }
  const payload = legado(tipo, input)
  if (payload) {
    try { await deps.dualWrite(dono.id, payload) }
    catch (e) { avisos.push(`A ficha do funcionário não foi atualizada: ${mensagem(e)}`) }
  }
  return { doc, enviados, falhas, avisos }
}
