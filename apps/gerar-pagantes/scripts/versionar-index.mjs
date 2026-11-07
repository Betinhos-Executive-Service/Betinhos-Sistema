import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// O WebResource mantém nomes fixos (assets/gerar-pagantes.js e .css): a versão na URL evita o cache do navegador.
const { version } = JSON.parse(await readFile(resolve('package.json'), 'utf8'))
const index = resolve('dist/index.html')
const sufixo = `?v=${encodeURIComponent(version)}`
const html = await readFile(index, 'utf8')
await writeFile(index, html
  .replace('./assets/gerar-pagantes.js', `./assets/gerar-pagantes.js${sufixo}`)
  .replace('./assets/gerar-pagantes.css', `./assets/gerar-pagantes.css${sufixo}`))
