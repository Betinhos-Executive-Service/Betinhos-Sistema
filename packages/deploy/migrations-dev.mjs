import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Migrations de schema que o workflow Deploy aplica no DEV (packages/deploy/migrations/AAAAMMDD-HHMM-*.ps1).
// Pendente = migration adicionada ou alterada desde a tag schema-dev-publicado, em ordem de nome. `_*.ps1` (helper) e README não rodam.

const PASTA = 'packages/deploy/migrations/'
export const MIGRATION = /^\d{8}-\d{4}-[a-z0-9-]+\.ps1$/

const nomeDe = (arquivo) => (arquivo.startsWith(PASTA) && !arquivo.slice(PASTA.length).includes('/') ? arquivo.slice(PASTA.length) : null)

// arquivos: lista do git diff --name-only --diff-filter=AM desde a tag. null = sem base: todas (são idempotentes; a tag nasce no HEAD ao fim).
export function migrationsPendentes(arquivos, existentes) {
  if (arquivos == null) return [...existentes].sort()
  const nomes = arquivos.map((a) => nomeDe(a.trim())).filter((n) => n && MIGRATION.test(n) && existentes.includes(n))
  return [...new Set(nomes)].sort()
}

// forcar: "todas" ou nomes (com ou sem .ps1) separados por vírgula (input forcar_migrations do workflow_dispatch).
export function migrationsForcadas(forcar, existentes) {
  const pedidos = String(forcar ?? '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => (s.endsWith('.ps1') || s === 'todas' ? s : `${s}.ps1`))
  if (pedidos.includes('todas')) return [...existentes].sort()
  const desconhecidas = pedidos.filter((p) => !existentes.includes(p))
  if (desconhecidas.length) throw new Error(`Migration desconhecida em forcar_migrations: ${desconhecidas.join(', ')}`)
  return [...new Set(pedidos)].sort()
}

export const listarMigrations = (dir) => readdirSync(dir).filter((f) => MIGRATION.test(f)).sort()

// Uso: git diff --name-only --diff-filter=AM A B | node migrations-dev.mjs [--github]   → pendentes
//      node migrations-dev.mjs --sem-base [--github]                                      → todas
//      node migrations-dev.mjs --forcar nome1,nome2|todas [--github]                      → as pedidas à mão
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const existentes = listarMigrations(fileURLToPath(new URL('./migrations/', import.meta.url)))
  const pendentes = args.includes('--forcar')
    ? migrationsForcadas(args[args.indexOf('--forcar') + 1], existentes)
    : migrationsPendentes(args.includes('--sem-base') ? null : readFileSync(0, 'utf8').split('\n'), existentes)
  console.log(args.includes('--github') ? `migrations=${pendentes.join(',')}` : JSON.stringify({ migrations: pendentes }))
}
