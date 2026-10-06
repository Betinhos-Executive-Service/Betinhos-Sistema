import { appendAnexos, extractSpAnexos, type SpAnexo } from './notes'
import { nomeComData } from './sharepoint'
import { ANEXOS_SUBPASTA, type DataSource } from './source'
import type { Anotacao } from './types'
import { errorMessage } from './xrm'

export type FalhaMigracao = { notaId: string; arquivo: string; erro: string }
export type ResultadoMigracao = { movidas: number; falhas: FalhaMigracao[] }

/** Imagens anexadas no Dataverse que ainda não têm cópia no SharePoint. */
export function imagensNoDataverse(notas: Anotacao[]) {
  return notas.filter((nota) => nota.arquivo && /^image\//i.test(nota.arquivo.tipo ?? '') && !extractSpAnexos(nota.texto).anexos.length)
}

/**
 * Para cada nota: baixa a imagem do Dataverse, envia uma cópia ao SharePoint e acrescenta o link
 * na nota. O anexo original continua na timeline como cópia de segurança. Se a nota não puder ser
 * atualizada, apaga a cópia enviada para não duplicar numa nova tentativa. Uma falha não interrompe as demais.
 */
export async function migrarImagens(source: DataSource, funcionarioId: string, notas: Anotacao[], onProgresso?: (feitas: number, total: number) => void): Promise<ResultadoMigracao> {
  const alvo = imagensNoDataverse(notas)
  const resultado: ResultadoMigracao = { movidas: 0, falhas: [] }
  for (const [index, nota] of alvo.entries()) {
    onProgresso?.(index, alvo.length)
    const nomeOriginal = nota.arquivo!.nome
    try {
      const { nome, blob } = await source.anexo(nota.id)
      const file = new File([blob], nome || nomeOriginal, { type: blob.type || nota.arquivo!.tipo || 'application/octet-stream' })
      const doc = await source.documentos.enviar(funcionarioId, file, nomeComData(file.name, new Date(nota.criadoEm)), ANEXOS_SUBPASTA)
      const anexo: SpAnexo = { nome: doc.nome, caminho: doc.caminho, id: doc.id, mime: doc.mimeType ?? file.type, tamanho: doc.tamanho ?? file.size }
      try {
        await source.updateAnotacao(nota.id, { titulo: nota.titulo, notetext: appendAnexos(nota.texto, [anexo]) })
      } catch (error) {
        await source.documentos.excluir(funcionarioId, doc).catch(() => {})
        throw error
      }
      resultado.movidas++
    } catch (error) {
      resultado.falhas.push({ notaId: nota.id, arquivo: nomeOriginal, erro: errorMessage(error) })
    }
  }
  onProgresso?.(alvo.length, alvo.length)
  return resultado
}
