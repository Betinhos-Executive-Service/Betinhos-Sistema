import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Versão de build (não é versão Git): cada build de publicação incrementa o PATCH.
// A data/hora do build é gravada pelo vite.config.ts do app (__BUILD_DATE__).
// Publicação local e CI publicam no mesmo DEV, e o CI não commita o package.json: a base é a maior
// entre a do repo e a publicada (PUBLISHED_VERSION, lida do DEV pelo push-dev.ps1 -Build), então a versão nunca retrocede.
export function nextVersion(repoVersion, publishedVersion) {
  const parse = (v) => {
    const m = String(v).match(/^v?(\d+)\.(\d+)\.(\d+)$/)
    return m ? m.slice(1).map(Number) : null
  }
  const repo = parse(repoVersion)
  if (!repo) throw new Error(`Versão inválida no package.json: ${repoVersion}`)
  const published = publishedVersion ? parse(publishedVersion) : null
  if (publishedVersion && !published) throw new Error(`PUBLISHED_VERSION inválida: ${publishedVersion}`)
  const isNewer = published && (published[0] - repo[0] || published[1] - repo[1] || published[2] - repo[2]) > 0
  const [major, minor, patch] = isNewer ? published : repo
  return `${major}.${minor}.${patch + 1}`
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const packagePath = resolve(process.argv[2] ?? '.', 'package.json')
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  packageJson.version = nextVersion(packageJson.version, process.env.PUBLISHED_VERSION)
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
  console.log(`Build v${packageJson.version}`)
}
