import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { MIGRATION } from './migrations-dev.mjs'

// Regras do CI para o schema por migration (packages/deploy/migrations/README.md).
//  1. Migration que já está na base é imutável: editar, renomear ou apagar reprova.
//  2. provision-*.ps1 novo reprova (schema novo só por migration); provision-flow-* continua valendo.
//  3. Migration nova segue o nome AAAAMMDD-HHMM-descricao.ps1.
//  4. Cabeçalho "# destrutiva: <alvo> - <motivo>" e remocoes.json andam juntos.

const PASTA = 'packages/deploy/migrations/'
const PROVISION = /^packages\/deploy\/provision-(?!flow-)[^/]+\.ps1$/
const ehMigration = (a) => a.startsWith(PASTA) && !a.slice(PASTA.length).includes('/') && a.endsWith('.ps1') && !a.slice(PASTA.length).startsWith('_')

// linhas: saída de `git diff --name-status -M base...HEAD` ("M\tcaminho", "R087\tantigo\tnovo"). Devolve a lista de erros.
export function checarMudancas(linhas) {
  const erros = []
  for (const linha of linhas.map((l) => l.trim()).filter(Boolean)) {
    const [status, a, b] = linha.split('\t')
    const tipo = status[0]
    const antigo = tipo === 'R' || tipo === 'C' ? a : null
    const novo = tipo === 'R' || tipo === 'C' ? b : a
    if (tipo === 'M' && ehMigration(novo)) erros.push(`${novo}: migration publicada não se edita; crie outra.`)
    if (tipo === 'D' && ehMigration(novo)) erros.push(`${novo}: migration publicada não se apaga; crie outra.`)
    if (tipo === 'R' && ehMigration(antigo)) erros.push(`${antigo}: migration publicada não se renomeia nem move.`)
    if ((tipo === 'A' || tipo === 'R' || tipo === 'C') && PROVISION.test(novo) && !(antigo && PROVISION.test(antigo))) {
      erros.push(`${novo}: provision-*.ps1 novo não vale para schema; crie uma migration em ${PASTA} (flow novo: provision-flow-*).`)
    }
    if ((tipo === 'A' || tipo === 'C') && ehMigration(novo) && !MIGRATION.test(novo.slice(PASTA.length))) {
      erros.push(`${novo}: nome fora do padrão AAAAMMDD-HHMM-descricao.ps1 (minúsculas, números e hífen).`)
    }
  }
  return erros
}

// dir: pasta migrations/. Confere o cabeçalho "# destrutiva: alvo - motivo" contra remocoes.json.
export function checarRemocoes(dir) {
  const erros = []
  const remocoes = JSON.parse(readFileSync(`${dir}/remocoes.json`, 'utf8').replace(/^﻿/, ''))
  const arquivos = readdirSync(dir).filter((f) => f.endsWith('.ps1') && !f.startsWith('_'))
  const declaradas = new Set()
  for (const f of arquivos) {
    for (const m of readFileSync(`${dir}/${f}`, 'utf8').matchAll(/^# destrutiva: (\S+) - (\S.*)$/gm)) {
      declaradas.add(`${f}|${m[1]}`)
      if (!remocoes.some((r) => r.migration === f && r.alvo === m[1])) erros.push(`${f}: cabeçalho destrutiva de ${m[1]} sem entrada em remocoes.json.`)
    }
  }
  for (const r of remocoes) {
    if (!r.alvo || !r.migration || !r.decisao) erros.push(`remocoes.json: entrada incompleta (${JSON.stringify(r)}); precisa de alvo, migration e decisao.`)
    else if (!existsSync(`${dir}/${r.migration}`)) erros.push(`remocoes.json: migration ${r.migration} não existe.`)
    else if (!declaradas.has(`${r.migration}|${r.alvo}`)) erros.push(`remocoes.json: ${r.migration} não declara "# destrutiva: ${r.alvo} - <motivo>".`)
  }
  return erros
}

// dir: pasta migrations/. substituidas.json: cada entrada aponta para migrations que existem, a substituta vem depois na
// ordem de nome (roda no lugar) e tem motivo; nenhuma substituta pode estar ela mesma substituída.
export function checarSubstituidas(dir) {
  if (!existsSync(`${dir}/substituidas.json`)) return []
  const erros = []
  const lista = JSON.parse(readFileSync(`${dir}/substituidas.json`, 'utf8').replace(/^\uFEFF/, ''))
  const substituidas = new Set(lista.map((s) => s.migration))
  for (const s of lista) {
    if (!s.migration || !s.por || !s.motivo) erros.push(`substituidas.json: entrada incompleta (${JSON.stringify(s)}); precisa de migration, por e motivo.`)
    else if (!existsSync(`${dir}/${s.migration}`)) erros.push(`substituidas.json: migration ${s.migration} não existe.`)
    else if (!existsSync(`${dir}/${s.por}`)) erros.push(`substituidas.json: substituta ${s.por} não existe.`)
    else if (s.por <= s.migration) erros.push(`substituidas.json: ${s.por} precisa vir depois de ${s.migration} na ordem de nome.`)
    else if (substituidas.has(s.por)) erros.push(`substituidas.json: a substituta ${s.por} também está substituída.`)
  }
  return erros
}

// Uso: git diff --name-status -M origin/<base>...HEAD | node migrations-ci.mjs   → sai com 1 e lista os erros
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = fileURLToPath(new URL('./migrations', import.meta.url))
  const erros = [...checarMudancas(readFileSync(0, 'utf8').split('\n')), ...checarRemocoes(dir), ...checarSubstituidas(dir)]
  for (const e of erros) console.log(`::error title=Schema por migration::${e}`)
  console.log(erros.length ? `${erros.length} problema(s) nas migrations.` : 'Migrations ok.')
  process.exitCode = erros.length ? 1 : 0
}
