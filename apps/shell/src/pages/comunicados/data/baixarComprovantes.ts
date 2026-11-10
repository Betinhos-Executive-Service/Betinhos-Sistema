import type { ModoPdf, Par } from '../domain/comprovante'
import { nomeArquivo } from '../domain/comprovante'
import type { Source } from './source'

/** Gera o PDF de evidência e baixa. O pdf-lib só entra no bundle quando alguém gera o PDF. */
export async function baixarComprovantes(source: Pick<Source, 'quemSou'>, modo: ModoPdf, alvo: string, pares: Par[]) {
  const [{ gerarComprovantesPdf }, { baixarPdf }, geradoPor] = await Promise.all([import('./comprovantesPdf'), import('../../../lib/pdf/baixar'), source.quemSou()])
  const bytes = await gerarComprovantesPdf({ modo, alvo, pares, geradoPor: geradoPor || 'usuário não identificado', geradoEm: new Date(), versao: __APP_VERSION__ })
  baixarPdf(bytes, nomeArquivo(modo, alvo, pares))
}

export const textoErroPdf = (reason: unknown) => (reason instanceof Error && reason.message ? `Não foi possível gerar o PDF: ${reason.message}` : 'Não foi possível gerar o PDF.')
