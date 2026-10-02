import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

// Varre a solução desempacotada antes de ela entrar no git. Bloqueia segredos reais;
// URLs de flow assinadas e chaves Google em telas legadas só geram aviso (já são visíveis a quem usa a tela).
// Nunca imprime o valor encontrado, só arquivo e tipo.
const root = resolve(process.argv[2] ?? 'solution')

const blocking = [
  ['client_secret com valor', /client_secret"?\s*[:=]\s*"?[A-Za-z0-9~._\-+/]{12,}/i],
  ['token Bearer', /Bearer [A-Za-z0-9\-_.]{20,}/],
  ['chave sk-', /\bsk-[A-Za-z0-9]{20,}/],
]
const warning = [
  ['URL assinada (sig=)', /sig=[A-Za-z0-9%_\-]{20,}/],
  ['chave Google', /AIza[0-9A-Za-z\-_]{30,}/],
]
const secretVariable = /secret|password|senha|apikey|token/i

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else yield path
  }
}

const errors = []
const warnings = []
let files
try { files = walk(root); await readdir(root) } catch { console.log(`Sem pasta ${root}; nada a varrer.`); process.exit(0) }

for await (const path of files) {
  if (/\.(png|jpe?g|gif|ico|dll|zip|msapp|woff2?)$/i.test(path)) continue
  const text = await readFile(path, 'utf8')
  const name = relative(root, path)
  if (path.endsWith('environmentvariablevalues.json')) errors.push(`${name}: valor atual de variável de ambiente (pertence ao ambiente, não ao repo)`)
  if (path.endsWith('environmentvariabledefinition.xml') && secretVariable.test(name) && /<defaultvalue>[^<]+</.test(text)) {
    errors.push(`${name}: variável secreta com valor padrão`)
  }
  for (const [label, pattern] of blocking) if (pattern.test(text)) errors.push(`${name}: ${label}`)
  for (const [label, pattern] of warning) if (pattern.test(text)) warnings.push(`${name}: ${label}`)
}

for (const line of warnings) console.log(`AVISO  ${line}`)
for (const line of errors) console.error(`ERRO   ${line}`)
if (errors.length) { console.error(`${errors.length} segredo(s) na solução. Corrija no DEV e sincronize de novo.`); process.exit(1) }
console.log(`Varredura concluída: 0 bloqueios, ${warnings.length} aviso(s).`)
