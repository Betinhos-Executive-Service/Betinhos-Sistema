// Publica o front do portal (../dist) num projeto Pages, com o service binding API → Worker, sem tocar em arquivo versionado.
// O wrangler lê o binding do wrangler.jsonc do diretório de trabalho, e o projeto muda entre DEV e PROD: o arquivo nasce aqui,
// numa pasta temporária ao lado de uma cópia de functions/.
// Uso: node scripts/publicar-pages.mjs --projeto <projeto Pages> --servico <Worker do binding API> [--branch main] [--simular]
//   DEV:  --projeto portal-cliente-dev --servico portal-cliente-dev
//   PROD: --projeto portal-cliente --servico "${PORTAL_API_SERVICE:-portal-cliente-dev}"
//     Piloto (decisão do Renan, 24/11/2026): o Pages de produção (cliente.betinhos.com.br) fala com o portal-cliente-dev (Dataverse DEV).
//     Ao ligar o PROD, a variável do repositório PORTAL_API_SERVICE passa a valer `portal-cliente`; nenhuma mudança de código.
// Só `wrangler pages deploy` (nunca kv, secret nem delete). Preview (outras branches) também usa o Worker informado.
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

function configPages({ projeto, servico, dist }) {
  const services = [{ binding: 'API', service: servico }]
  return { name: projeto, pages_build_output_dir: dist, compatibility_date: '2026-09-01', services, env: { preview: { services } } }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (nome, padrao) => {
    const i = process.argv.indexOf(`--${nome}`)
    return i > 0 ? process.argv[i + 1] : padrao
  }
  const projeto = arg('projeto')
  const servico = arg('servico')
  if (!projeto || !servico) throw new Error('Uso: publicar-pages.mjs --projeto <Pages> --servico <Worker> [--branch main] [--simular]')
  const app = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const tmp = mkdtempSync(join(tmpdir(), 'portal-pages-'))
  try {
    cpSync(join(app, 'pages', 'functions'), join(tmp, 'functions'), { recursive: true })
    const config = configPages({ projeto, servico, dist: join(app, 'dist') })
    writeFileSync(join(tmp, 'wrangler.jsonc'), JSON.stringify(config, null, 2))
    console.log(`Pages ${projeto}: API → ${servico}`)
    if (process.argv.includes('--simular')) {
      console.log(JSON.stringify(config))
    } else {
      const r = spawnSync(join(app, 'node_modules', '.bin', 'wrangler'), ['pages', 'deploy', '--project-name', projeto, '--branch', arg('branch', 'main'), '--commit-dirty=true'], { cwd: tmp, stdio: 'inherit' })
      if (r.status !== 0) process.exitCode = r.status ?? 1
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
