import { describe, expect, it } from 'vitest'
import { criarLimite } from './limite'

const adiada = () => { let resolver!: (v: string) => void; let rejeitar!: (e: Error) => void; const p = new Promise<string>((r, j) => { resolver = r; rejeitar = j }); return { p, resolver, rejeitar } }
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('criarLimite', () => {
  it('roda no máximo N tarefas ao mesmo tempo, na ordem de chegada', async () => {
    const limite = criarLimite(3)
    const tarefas = Array.from({ length: 5 }, adiada)
    let ativas = 0
    let pico = 0
    const iniciadas: number[] = []
    const resultados = tarefas.map((t, i) => limite(async () => { iniciadas.push(i); ativas++; pico = Math.max(pico, ativas); try { return await t.p } finally { ativas-- } }))
    const primeira = resultados[0].catch((e: Error) => e)
    await tick()
    expect(iniciadas).toEqual([0, 1, 2])
    tarefas[1].resolver('b')
    await tick()
    expect(iniciadas).toEqual([0, 1, 2, 3])
    tarefas[0].rejeitar(new Error('falhou'))
    await tick()
    expect(iniciadas).toEqual([0, 1, 2, 3, 4])
    tarefas[2].resolver('c'); tarefas[3].resolver('d'); tarefas[4].resolver('e')
    expect((await primeira as Error).message).toBe('falhou')
    expect(await Promise.all(resultados.slice(1))).toEqual(['b', 'c', 'd', 'e'])
    expect(pico).toBe(3)
  })
})
