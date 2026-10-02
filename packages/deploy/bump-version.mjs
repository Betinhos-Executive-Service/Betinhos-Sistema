import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Versão de build (não é versão Git): cada build de publicação incrementa o PATCH.
// A data/hora do build é gravada pelo vite.config.ts do app (__BUILD_DATE__).
const packagePath = resolve(process.argv[2] ?? '.', 'package.json')
const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
const match = String(packageJson.version).match(/^(\d+)\.(\d+)\.(\d+)$/)
if (!match) throw new Error(`Versão inválida em ${packagePath}: ${packageJson.version}`)

// No CI (GitHub Actions) o PATCH vem do número da execução: o runner não commita o package.json,
// então sem isso todo deploy mostraria a mesma versão.
const buildNumber = process.env.BUILD_NUMBER
if (buildNumber && !/^\d+$/.test(buildNumber)) throw new Error(`BUILD_NUMBER inválido: ${buildNumber}`)
packageJson.version = `${match[1]}.${match[2]}.${buildNumber ?? Number(match[3]) + 1}`
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
console.log(`Build v${packageJson.version}`)
