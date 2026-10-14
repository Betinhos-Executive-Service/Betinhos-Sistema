import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync } from 'node:fs'
import { analisarMensagem, montarRequisicao, type ContextoDespesa, type Decisao } from '../src/index.ts'

type Caso = { id: string; esperado: Decisao | null; arquivos: string[]; contexto: ContextoDespesa }
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }
const pasta = new URL('../.local/casos/', import.meta.url)
const casos: Caso[] = JSON.parse(readFileSync(new URL('casos.json', pasta), 'utf8'))
const semRotulo = casos.filter((c) => !c.esperado)
if (semRotulo.length) throw new Error(`Casos sem "esperado": ${semRotulo.map((c) => c.id).join(', ')}`)

const client = new Anthropic()
const linhas = []
for (const caso of casos) {
  const comprovantes = caso.arquivos.map((nome) => ({ mime: MIME[nome.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream', base64: readFileSync(new URL(nome, pasta)).toString('base64') }))
  try {
    const msg = await client.messages.create(montarRequisicao(caso.contexto, comprovantes) as unknown as Anthropic.MessageCreateParamsNonStreaming)
    const r = analisarMensagem(msg as unknown as Parameters<typeof analisarMensagem>[0], caso.contexto)
    linhas.push({ id: caso.id, esperado: caso.esperado, obtido: r.ok ? r.resposta.decisao : null, erro: r.ok ? null : r.erro, resposta: r.ok ? r.resposta : null, uso: msg.usage })
  } catch (e) {
    linhas.push({ id: caso.id, esperado: caso.esperado, obtido: null, erro: e instanceof Error ? e.message : String(e), resposta: null, uso: null })
  }
  console.log(`${caso.id}: esperado ${caso.esperado}, obtido ${linhas.at(-1)!.obtido ?? 'ERRO'}`)
}
const acertos = linhas.filter((l) => l.obtido === l.esperado).length
const resumo = {
  total: linhas.length,
  acertos,
  taxaAcerto: acertos / linhas.length,
  validacoesIndevidas: linhas.filter((l) => l.esperado === 'precisa_corrigir' && l.obtido === 'validar').length,
  errosTecnicos: linhas.filter((l) => l.obtido === null).length,
}
const carimbo = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
writeFileSync(new URL(`../.local/avaliacao-${carimbo}.json`, import.meta.url), JSON.stringify({ resumo, linhas }, null, 2))
console.log(resumo)
if (resumo.validacoesIndevidas > 0 || resumo.taxaAcerto < 0.8) process.exit(1)
