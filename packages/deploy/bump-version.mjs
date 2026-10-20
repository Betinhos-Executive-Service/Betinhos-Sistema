import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Versão de build (não é versão Git): cada build de publicação incrementa o PATCH.
// A data/hora do build é gravada pelo vite.config.ts do app (__BUILD_DATE__).
const packagePath = resolve(process.argv[2] ?? '.', 'package.json')
const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
const match = String(packageJson.version).match(/^(\d+)\.(\d+)\.(\d+)$/)
if (!match) throw new Error(`Versão inválida em ${packagePath}: ${packageJson.version}`)

// No CI (GitHub Actions) o runner não commita o package.json: o PATCH soma o número da execução ao do repo,
// para cada deploy do CI subir a versão e nunca ficar abaixo da última publicada localmente.
const buildNumber = process.env.BUILD_NUMBER
if (buildNumber && !/^\d+$/.test(buildNumber)) throw new Error(`BUILD_NUMBER inválido: ${buildNumber}`)
packageJson.version = `${match[1]}.${match[2]}.${Number(match[3]) + (buildNumber ? Number(buildNumber) : 1)}`
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
console.log(`Build v${packageJson.version}`)
