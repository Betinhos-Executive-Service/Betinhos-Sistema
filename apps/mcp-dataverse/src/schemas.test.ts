import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { DataverseSession } from './dataverse'
import { env } from './helpers.test-util'
import { buildTools } from './tools'

/** Tamanho do que o claude.ai reenvia ao modelo a cada mensagem (nome, descrição, schema e anotações de cada ferramenta). */
export function schemaChars() {
  const tools = buildTools({ session: new DataverseSession(env, 'rt'), identity: { email: '', name: '' } })
  const per = tools.map((t) => ({
    name: t.name,
    chars: JSON.stringify({ name: t.name, description: t.description, inputSchema: z.toJSONSchema(z.object(t.schema), { io: 'input' }), annotations: t.annotations }).length,
  }))
  return { total: per.reduce((s, t) => s + t.chars, 0), per }
}

describe('custo de contexto dos schemas', () => {
  it('fica dentro do orçamento', () => {
    const { total, per } = schemaChars()
    console.log(`schemas: ${total} caracteres`, per.map((t) => `${t.name}=${t.chars}`).join(' '))
    expect(total).toBeLessThan(BUDGET)
  })
})

// Teto 17000; subiu para 17600 só pelo update_table (alterarColunas, B1 da 4ª rodada).
const BUDGET = 18_000
