import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Junta o build do Vite em um único HTML (dist/webresource.html) para publicar como WebResource.
const dist = resolve(process.argv[2] ?? 'dist')
let html = await readFile(resolve(dist, 'index.html'), 'utf8')
const assetPattern = /(?:src|href)="(\/assets\/[^"]+)"/g
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

for (const [, assetPath] of [...html.matchAll(assetPattern)]) {
  const content = await readFile(resolve(dist, assetPath.slice(1)), 'utf8')
  const escapedPath = escapeRegExp(assetPath)

  if (assetPath.endsWith('.css')) {
    html = html.replace(new RegExp(`<link[^>]+href="${escapedPath}"[^>]*>`), () => `<style>${content}</style>`)
  } else {
    // "</script" dentro do bundle encerraria a tag inline antes da hora.
    const safe = content.replaceAll('</script', '<\\/script')
    html = html.replace(new RegExp(`<script[^>]+src="${escapedPath}"[^>]*><\\/script>`), () => `<script type="module">${safe}</script>`)
  }
}

if (html.includes('="/assets/')) throw new Error('Ainda há referências a /assets no WebResource.')
await writeFile(resolve(dist, 'webresource.html'), html, 'utf8')
console.log('dist/webresource.html gerado com CSS e JavaScript inline')
