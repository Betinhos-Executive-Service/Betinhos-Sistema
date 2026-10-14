import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync } from 'node:fs'
import { EFFORT, MAX_TOKENS, MODELO, constantesDoFlow } from '../src/constantes.ts'
import { analisarMensagem, montarTextoUsuario, type Agente } from '../src/index.ts'

type Caso = { id: string; agente: Agente; pergunta: string | null; esperado: string[]; contexto: object }
const pasta = new URL('../.local/', import.meta.url)
const casos: Caso[] = JSON.parse(readFileSync(new URL('casos.json', pasta), 'utf8'))
if (!casos.length) throw new Error('casos.json vazio.')
const semRotulo = casos.filter((c) => !Array.isArray(c.esperado))
if (semRotulo.length) throw new Error(`Casos sem "esperado": ${semRotulo.map((c) => c.id).join(', ')}`)
if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY ausente no ambiente local.')

const constantes = constantesDoFlow()
const client = new Anthropic()
const linhas = []
for (const caso of casos) {
  try {
    const msg = await client.messages.create({
      model: MODELO, max_tokens: MAX_TOKENS, system: constantes.agentes[caso.agente].systemPrompt,
      output_config: { effort: EFFORT, format: { type: 'json_schema', schema: constantes.schema } },
      messages: [{ role: 'user', content: montarTextoUsuario(caso.contexto, caso.pergunta) }],
    } as unknown as Anthropic.MessageCreateParamsNonStreaming)
    const r = analisarMensagem(msg as unknown as Parameters<typeof analisarMensagem>[0], caso.agente)
    const obtidos = r.ok ? [...new Set(r.resposta.propostas.map((p) => p.tipo))].sort() : null
    linhas.push({ id: caso.id, esperado: [...caso.esperado].sort(), obtido: obtidos, erro: r.ok ? null : r.erro, resposta: r.ok ? r.resposta : null, uso: msg.usage })
  } catch (e) {
    linhas.push({ id: caso.id, esperado: caso.esperado, obtido: null, erro: e instanceof Error ? e.message : String(e), resposta: null, uso: null })
  }
  console.log(`${caso.id}: esperado ${JSON.stringify(caso.esperado)}, obtido ${JSON.stringify(linhas.at(-1)!.obtido ?? 'ERRO')}`)
}
const acertos = linhas.filter((l) => JSON.stringify(l.obtido) === JSON.stringify(l.esperado)).length
const tokens = linhas.reduce((s, l) => s + (l.uso?.input_tokens ?? 0) + (l.uso?.output_tokens ?? 0), 0)
const resumo = { total: linhas.length, acertos, taxaAcerto: acertos / linhas.length, errosTecnicos: linhas.filter((l) => l.obtido === null).length, tokensTotais: tokens }
const carimbo = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
writeFileSync(new URL(`avaliacao-${carimbo}.json`, pasta), JSON.stringify({ resumo, linhas }, null, 2))
console.log(resumo)
if (resumo.taxaAcerto < 0.8) process.exit(1)
