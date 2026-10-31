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
// Com fotoDev (foto do DEV tirada na mesma janela): componente só na caixa que NÃO existe em nenhuma solução rastreada do DEV
// saiu da AppBetinhos de propósito (limpeza de 21/10/2026; o DEV é a origem e a conferência do export garante que o que está
// na AppBetinhos do DEV está nas 4). Esse vai para retiradosNoDev (informativo) e some com a desinstalação. Só continua em
// soNaCaixa o que o DEV ainda tem (falha de distribuição). Tabela retirada no DEV com registros no alvo só passa se estiver em
// aceitarTabelas (registros exportados antes); tabela sem nome na foto não prova que está vazia e também bloqueia
// (tabelasComDadosNaCaixa).
// Foto sem componentes, sem tipos ou sem pacotes (foto antiga) não prova nada e falha.
export function conferirRetirada(foto, regras, { fotoDev = null, aceitarTabelas = [] } = {}) {
  const componentes = foto.componentes ?? {}
  if (!Object.keys(componentes).length) throw new Error('A foto nao tem componentes: nenhuma solucao rastreada existe no ambiente.')
  if (!foto.tipos || !foto.pacotes) throw new Error('A foto nao tem tipos ou pacotes (foto antiga): tire a foto de novo com o foto-ambiente.ps1 atual.')
  const novas = new Set(regras.solucoes)
  const solucaoDosPacotes = regras.porTipo.pluginpackage
  if (fotoDev && !Object.keys(fotoDev.componentes ?? {}).length) throw new Error('A foto do DEV nao tem componentes.')
  const soNaCaixa = []
  const emDuasNovas = []
  const peloPacote = []
  const retiradosNoDev = []
  const tabelasComDadosNaCaixa = []
  for (const [id, donos] of Object.entries(componentes)) {
    const tipo = foto.tipos[id] ?? null
    const nasNovas = donos.filter((s) => novas.has(s))
    if (nasNovas.length > 1) emDuasNovas.push({ id, tipo, solucoes: nasNovas })
    if (!donos.every((s) => CAIXAS.includes(s))) continue
    const pacote = tipo === ASSEMBLY ? foto.pacotes[id] : undefined
    if (pacote && (componentes[pacote] ?? []).includes(solucaoDosPacotes)) { peloPacote.push({ id, pacote }); continue }
    if (!fotoDev || id in fotoDev.componentes) { soNaCaixa.push({ id, tipo, solucoes: donos }); continue }
    const nome = foto.nomes?.[id] ?? null
    retiradosNoDev.push({ id, tipo, nome })
    if (tipo === 1) {
      const registros = nome ? (foto.registros?.[nome] ?? null) : null
      if (registros === null || (registros > 0 && !aceitarTabelas.includes(nome))) tabelasComDadosNaCaixa.push({ id, nome, registros })
    }
  }
  return { soNaCaixa, emDuasNovas, peloPacote, retiradosNoDev, tabelasComDadosNaCaixa }
}

export function retiradaOk(r) {
  return !r.soNaCaixa.length && !r.emDuasNovas.length && !r.tabelasComDadosNaCaixa.length
}

// CLI: node conferir-retirada.mjs <foto.json> -> código 1 se a retirada apagaria algo ou se há componente em duas das 4.
// CLI: node conferir-retirada.mjs <foto.json> [--dev <fotoDev.json>] [--aceitar-tabelas a,b]
if (rodandoComoCli(import.meta.url)) {
  const regras = await lerJson(new URL('./regras.json', import.meta.url))
  const args = process.argv.slice(2)
  let fotoDev = null
  const aceitarTabelas = []
  const arquivos = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dev') { fotoDev = await lerJson(args[++i]); continue }
    if (args[i] === '--aceitar-tabelas') { aceitarTabelas.push(...(args[++i] ?? '').split(',').map((t) => t.trim()).filter(Boolean)); continue }
    arquivos.push(args[i])
  }
  if (arquivos.length !== 1) throw new Error('Uso: node conferir-retirada.mjs <foto.json> [--dev <fotoDev.json>] [--aceitar-tabelas a,b]')
  const r = conferirRetirada(await lerJson(arquivos[0]), regras, { fotoDev, aceitarTabelas })
  process.stdout.write(JSON.stringify(r, null, 2))
  process.exitCode = retiradaOk(r) ? 0 : 1
}
