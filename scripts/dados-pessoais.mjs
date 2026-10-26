// Trava do CI contra dado pessoal real no repositório: CPF válido, e-mail de pessoa no domínio da empresa
// ou em provedor pessoal, e backup de flow versionado. Dado de teste usa os valores fictícios listados abaixo.
// Uso: node scripts/dados-pessoais.mjs (lê os arquivos do git ls-files; sai 1 com achados mascarados).
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** CPFs de teste conhecidos (válidos pelo dígito, de ninguém). */
const CPFS_DE_TESTE = new Set(['11144477735', '52998224725', '12345678909'])
/** Caixas funcionais da empresa e nomes genéricos usados nos testes. Pessoa real fica fora (vem de parâmetro ou variável). */
const EMAILS_PERMITIDOS = new Set(['financeiro', 'noreply', 'ana', 'bia', 'joao', 'maria', 'pessoa', 'joao.silva', 'joao.motorista', 'x', 'ao'])
const DOMINIOS = /@(betinhos\.com\.br|gmail\.com|hotmail\.com|outlook\.com|yahoo\.com(?:\.br)?)\b/i
const IGNORAR = /(^|\/)(pnpm-lock\.yaml|package-lock\.json)$|\.(png|jpe?g|gif|ico|webp|woff2?|ttf|pdf|zip|xlsx)$/i
const BACKUP = /^packages\/deploy\/flows\/backup\//

export function cpfValido(digits) {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false
  const dv = (n) => {
    let soma = 0
    for (let i = 0; i < n; i += 1) soma += Number(digits[i]) * (n + 1 - i)
    return ((soma * 10) % 11) % 10
  }
  return dv(9) === Number(digits[9]) && dv(10) === Number(digits[10])
}

const mascarar = (s) => (s.length <= 4 ? '***' : `${s.slice(0, 2)}***${s.slice(-2)}`)

/** Achados de um arquivo: `{ linha, tipo, valor }` com o valor já mascarado. */
export function achadosNoTexto(texto) {
  const achados = []
  texto.split('\n').forEach((conteudo, i) => {
    // Só 000.000.000-00: sem pontuação, 11 dígitos colidem com celular com DDD.
    for (const m of conteudo.matchAll(/\b(\d{3})\.(\d{3})\.(\d{3})-(\d{2})\b/g)) {
      const digits = m.slice(1).join('')
      if (cpfValido(digits) && !CPFS_DE_TESTE.has(digits)) achados.push({ linha: i + 1, tipo: 'CPF válido', valor: mascarar(digits) })
    }
    for (const m of conteudo.matchAll(/([A-Za-z0-9._%+-]+)(@[A-Za-z0-9.-]+)/g)) {
      if (DOMINIOS.test(m[2]) && !EMAILS_PERMITIDOS.has(m[1].toLowerCase())) achados.push({ linha: i + 1, tipo: 'e-mail de pessoa', valor: `${mascarar(m[1])}${m[2].toLowerCase()}` })
    }
  })
  return achados
}

export function verificar(arquivos, ler) {
  const saida = []
  for (const arquivo of arquivos) {
    if (BACKUP.test(arquivo)) { saida.push(`${arquivo}: backup de flow versionado (fica só na máquina; está no .gitignore)`); continue }
    if (IGNORAR.test(arquivo)) continue
    let texto
    try { texto = ler(arquivo) } catch { continue }
    for (const a of achadosNoTexto(texto)) saida.push(`${arquivo}:${a.linha}: ${a.tipo} ${a.valor}`)
  }
  return saida
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arquivos = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean)
  const saida = verificar(arquivos, (f) => readFileSync(f, 'utf8'))
  if (saida.length) {
    console.error(`Dados pessoais no repositório (${saida.length}). Troque por valores fictícios ou leia de parâmetro/variável:\n${saida.join('\n')}`)
    process.exit(1)
  }
  console.log(`Sem dados pessoais em ${arquivos.length} arquivos.`)
}
