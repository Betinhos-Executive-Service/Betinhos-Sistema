import { copyFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Copia o design-tokens.css gerado pelo Design System Betinhos (diretório pai dos repos).
// O arquivo de destino é derivado: nunca edite manualmente.
const source = fileURLToPath(new URL('../../../design-tokens.css', import.meta.url))
const target = fileURLToPath(new URL('../ui/src/design-tokens.css', import.meta.url))
const css = await readFile(source, 'utf8')
if (/gradient\(/i.test(css)) throw new Error('design-tokens.css contém gradiente, proibido pelo Design System.')
await copyFile(source, target)
console.log(`Tokens sincronizados de ${source}`)
