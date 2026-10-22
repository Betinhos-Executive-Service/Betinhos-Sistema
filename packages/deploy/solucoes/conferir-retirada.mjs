import { lerJson, rodandoComoCli } from './arquivo.mjs'

// Soluções que saem na retirada (desinstalação no TEST e no PROD).
export const CAIXAS = ['AppBetinhos', 'gerarpagantes']
const ASSEMBLY = 91

// Barreira antes do ponto sem volta. Numa foto tirada depois dos 4 imports:
// - soNaCaixa: componente cujos donos rastreados são só AppBetinhos e/ou gerarpagantes (ou nenhum). A desinstalação apagaria esse
//   componente (o comparador de fotos não vê, porque nada mudou ainda). Única liberação: assembly (91) dentro de pacote
//   de plug-in cujo pacote está na solução dos pacotes (regras.porTipo.pluginpackage): quem carrega o assembly é o pacote.
// - emDuasNovas: componente em mais de uma das 4.
// - peloPacote: assemblies liberados (só informativo).
// Foto sem componentes, sem tipos ou sem pacotes (foto antiga) não prova nada e falha.
export function conferirRetirada(foto, regras) {
  const componentes = foto.componentes ?? {}
  if (!Object.keys(componentes).length) throw new Error('A foto nao tem componentes: nenhuma solucao rastreada existe no ambiente.')
  if (!foto.tipos || !foto.pacotes) throw new Error('A foto nao tem tipos ou pacotes (foto antiga): tire a foto de novo com o foto-ambiente.ps1 atual.')
  const novas = new Set(regras.solucoes)
  const solucaoDosPacotes = regras.porTipo.pluginpackage
  const soNaCaixa = []
  const emDuasNovas = []
  const peloPacote = []
  for (const [id, donos] of Object.entries(componentes)) {
    const tipo = foto.tipos[id] ?? null
    const nasNovas = donos.filter((s) => novas.has(s))
    if (nasNovas.length > 1) emDuasNovas.push({ id, tipo, solucoes: nasNovas })
    if (!donos.every((s) => CAIXAS.includes(s))) continue
    const pacote = tipo === ASSEMBLY ? foto.pacotes[id] : undefined
    if (pacote && (componentes[pacote] ?? []).includes(solucaoDosPacotes)) peloPacote.push({ id, pacote })
    else soNaCaixa.push({ id, tipo, solucoes: donos })
  }
  return { soNaCaixa, emDuasNovas, peloPacote }
}

export function retiradaOk(r) {
  return !r.soNaCaixa.length && !r.emDuasNovas.length
}

// CLI: node conferir-retirada.mjs <foto.json> -> código 1 se a retirada apagaria algo ou se há componente em duas das 4.
if (rodandoComoCli(import.meta.url)) {
  const regras = await lerJson(new URL('./regras.json', import.meta.url))
  const r = conferirRetirada(await lerJson(process.argv[2]), regras)
  process.stdout.write(JSON.stringify(r, null, 2))
  process.exitCode = retiradaOk(r) ? 0 : 1
}
