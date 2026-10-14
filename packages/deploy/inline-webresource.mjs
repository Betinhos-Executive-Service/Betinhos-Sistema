import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Junta o build do Vite em dist/webresource.html para publicar como WebResource.
// Build com um chunk só: CSS e JS vão inline (um arquivo, como sempre foi).
// Build com code splitting (`--assets-url /WebResources/<prefixo>/assets/`): o CSS vai inline e os
// chunks JS ficam como WebResources próprios nessa URL; dist/webresource-assets.json lista o que o
// push-dev precisa publicar. O chunk de entrada não pode ir inline: os chunks das telas o importam
// pela URL, e uma cópia inline seria um segundo React na mesma página.
const args = process.argv.slice(2)
const flag = args.indexOf('--assets-url')
const assetsUrl = flag >= 0 ? args[flag + 1] : null
const dist = resolve(args.find((value, index) => !value.startsWith('--') && index !== flag + 1) ?? 'dist')
const manifestPath = resolve(dist, 'webresource-assets.json')
await rm(manifestPath, { force: true })

let html = await readFile(resolve(dist, 'index.html'), 'utf8')
const assetPattern = /(?:src|href)="(\/assets\/[^"]+)"/g
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const assetFiles = await readdir(resolve(dist, 'assets'))
const jsFiles = assetFiles.filter((name) => name.endsWith('.js'))
const split = jsFiles.length > 1

// Git Bash (MSYS) converte argumentos que começam com "/" em caminho do Windows
// ("/WebResources/..." vira "C:/Program Files/Git/WebResources/..."). O `pnpm build` roda pelo cmd e não
// sofre isso; chamando este script direto no Git Bash, use `MSYS_NO_PATHCONV=1 node inline-webresource.mjs ...`.
if (assetsUrl && /^[A-Za-z]:[\\/]/.test(assetsUrl)) {
  throw new Error(`--assets-url virou caminho do Windows (${assetsUrl}): o Git Bash converteu o argumento. Rode com MSYS_NO_PATHCONV=1 ou pelo pnpm build.`)
}

if (split) {
  if (!assetsUrl || !/^\/WebResources\/[A-Za-z0-9_]+(\/[A-Za-z0-9_.]+)*\/$/.test(assetsUrl)) {
    throw new Error('Build com vários chunks: informe --assets-url /WebResources/<prefixo>/assets/ (com barra no fim).')
  }
  const others = assetFiles.filter((name) => !name.endsWith('.js') && !name.endsWith('.css'))
  if (others.length) throw new Error(`Arquivos em dist/assets sem publicação definida: ${others.join(', ')}`)
  const invalid = jsFiles.filter((name) => !/^[A-Za-z0-9.]+\.js$/.test(name))
  if (invalid.length) throw new Error(`Nome de chunk inválido para WebResource (só letras, números e pontos): ${invalid.join(', ')}`)
}

for (const [, assetPath] of [...html.matchAll(assetPattern)]) {
  const escapedPath = escapeRegExp(assetPath)

  if (assetPath.endsWith('.css')) {
    const content = await readFile(resolve(dist, assetPath.slice(1)), 'utf8')
    html = html.replace(new RegExp(`<link[^>]+href="${escapedPath}"[^>]*>`), () => `<style>${content}</style>`)
  } else if (split) {
    // Entrada e modulepreload apontam para o WebResource do chunk.
    html = html.replaceAll(`"${assetPath}"`, `"${assetsUrl}${assetPath.slice('/assets/'.length)}"`)
  } else {
    const content = await readFile(resolve(dist, assetPath.slice(1)), 'utf8')
    // "</script" dentro do bundle encerraria a tag inline antes da hora.
    const safe = content.replaceAll('</script', '<\\/script')
    html = html.replace(new RegExp(`<script[^>]+src="${escapedPath}"[^>]*><\\/script>`), () => `<script type="module">${safe}</script>`)
  }
}

if (html.includes('="/assets/')) throw new Error('Ainda há referências a /assets no WebResource.')
await writeFile(resolve(dist, 'webresource.html'), html, 'utf8')

if (split) {
  const prefix = assetsUrl.slice('/WebResources/'.length)
  const chunks = jsFiles.map((file) => ({ name: `${prefix}${file}`, file: `assets/${file}` }))
  await writeFile(manifestPath, `${JSON.stringify(chunks, null, 2)}\n`, 'utf8')
  console.log(`dist/webresource.html gerado com CSS inline e ${chunks.length} chunks JS em ${assetsUrl} (dist/webresource-assets.json)`)
} else {
  console.log('dist/webresource.html gerado com CSS e JavaScript inline')
}
