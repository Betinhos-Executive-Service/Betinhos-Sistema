// Roda cada fonte da coleta isolada: a falha de uma (ex.: tabela de log sem permissão) não derruba as outras.
export async function executarFontes(fontes, mascarar) {
  const saida = {}
  const falhas = []
  for (const [campo, fn] of fontes) {
    saida[campo] = null
    try { saida[campo] = await fn() } catch (e) { falhas.push(`${campo}: ${mascarar(e.message)}`) }
  }
  return { saida, falhas }
}
