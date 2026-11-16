import type { Host } from '../../host'

/**
 * As colunas existem na tabela deste ambiente? Lê a metadata uma vez (o host guarda em cache) e não lança: sem
 * metadata, responde false e a tela usa só as colunas antigas. Serve para colunas novas que chegam por migration
 * antes (DEV) ou depois (PROD, pelas soluções) da tela.
 */
export async function colunasExistem(host: Extract<Host, { mode: 'dataverse' }>, entidade: string, colunas: string[]) {
  try {
    const nomes = new Set((await host.metadata.attributes(entidade)).map((a) => a.logicalName))
    return colunas.every((c) => nomes.has(c))
  } catch {
    return false
  }
}
