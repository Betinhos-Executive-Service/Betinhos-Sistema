// Rotação das cópias do backup externo (Cloudflare R2), para caber nos 10 GB gratuitos.
// Cada execução grava em diario/; no domingo também em semanal/; no dia 1 também em mensal/ (datas em Brasília).
// A limpeza é por quantidade, não por idade: só apaga quando há cópias mais novas além do limite. Se o backup parar de
// rodar, nada antigo some.
//
//   node retencao.mjs nome                 # nome do arquivo desta execução (betinhos-prod-AAAAMMDD-HHMM.zip)
//   node retencao.mjs classes              # pastas desta execução, uma por linha
//   node retencao.mjs excluir < lista.json # recebe a saída de `aws s3api list-objects-v2`; imprime as chaves a apagar
import { pathToFileURL } from 'node:url'

export const LIMITES = { diario: 7, semanal: 8, mensal: 12 }
const FUSO = 'America/Sao_Paulo'
const PADRAO = /^(diario|semanal|mensal)\/betinhos-prod-(\d{8}-\d{4})\.zip$/

export function partesBrasilia(data) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(data).map((x) => [x.type, x.value]),
  )
  return p
}

export function nomeArquivo(data) {
  const p = partesBrasilia(data)
  return `betinhos-prod-${p.year}${p.month}${p.day}-${p.hour}${p.minute}.zip`
}

export function classes(data) {
  const p = partesBrasilia(data)
  const lista = ['diario']
  if (p.weekday === 'Sun') lista.push('semanal')
  if (p.day === '01') lista.push('mensal')
  return lista
}

// Chaves fora do padrão (arquivo posto à mão, outra pasta) nunca são apagadas.
export function aExcluir(chaves, limites = LIMITES) {
  const porClasse = {}
  for (const chave of chaves) {
    const m = PADRAO.exec(chave)
    if (!m) continue
    ;(porClasse[m[1]] ??= []).push({ chave, carimbo: m[2] })
  }
  const excluir = []
  for (const [classe, itens] of Object.entries(porClasse)) {
    const limite = limites[classe]
    if (!Number.isInteger(limite) || limite < 1) continue
    itens.sort((a, b) => b.carimbo.localeCompare(a.carimbo))
    excluir.push(...itens.slice(limite).map((i) => i.chave))
  }
  return excluir.sort()
}

async function lerStdin() {
  let texto = ''
  for await (const parte of process.stdin) texto += parte
  return texto
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const acao = process.argv[2]
  if (acao === 'nome') console.log(nomeArquivo(new Date()))
  else if (acao === 'classes') console.log(classes(new Date()).join('\n'))
  else if (acao === 'excluir') {
    const texto = (await lerStdin()).trim()
    const json = texto ? JSON.parse(texto) : {}
    const chaves = (json.Contents ?? []).map((o) => o.Key)
    for (const chave of aExcluir(chaves)) console.log(chave)
  } else {
    console.error('uso: node retencao.mjs nome | classes | excluir < lista.json')
    process.exit(2)
  }
}
