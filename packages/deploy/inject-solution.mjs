import { copyFile, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

// Coloca o build do app dentro da solução desempacotada, para TEST e PROD receberem a tela
// pela importação managed (não se edita WebResource direto em ambiente gerenciado).
// Uso: node inject-solution.mjs <appDir> <solutionDir> <ResourceName> <LoaderName> <DisplayName>
const [appDir, solutionDir, resourceName, loaderName, displayName] = process.argv.slice(2)
if (!displayName) throw new Error('Uso: inject-solution.mjs <appDir> <solutionDir> <ResourceName> <LoaderName> <DisplayName>')

const dist = resolve(appDir, 'dist')
const webResources = resolve(solutionDir, 'WebResources')

async function replace(name, write) {
  const target = join(webResources, name)
  // O componente precisa existir na solução (com seu .data.xml); senão falta sincronizar do DEV.
  try { await stat(`${target}.data.xml`) } catch { throw new Error(`${name} não está na solução versionada. Rode a sincronização do DEV antes do deploy.`) }
  await write(target)
  console.log(`solução <- ${name}`)
}

await replace(resourceName, (target) => copyFile(join(dist, 'webresource.html'), target))

const template = await readFile(new URL('./loader.template.html', import.meta.url), 'utf8')
const loader = template.replaceAll('{{RESOURCE}}', resourceName).replaceAll('{{TITLE}}', displayName)
await replace(loaderName, (target) => writeFile(target, loader, 'utf8'))

const assetsDir = join(dist, 'WebResources')
for (const asset of await readdir(assetsDir).catch(() => [])) {
  await replace(asset, (target) => copyFile(join(assetsDir, asset), target))
}
