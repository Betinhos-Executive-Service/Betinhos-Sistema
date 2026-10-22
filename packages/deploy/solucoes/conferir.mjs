import { lerJson, rodandoComoCli } from './arquivo.mjs'

function donosPorId(porSolucao) {
  const donos = new Map()
  for (const [solucao, ids] of Object.entries(porSolucao)) {
    for (const id of ids) donos.set(id, [...(donos.get(id) ?? []), solucao])
  }
  return donos
}

// Todo componente da caixa de entrada precisa estar em exatamente uma das 4, a que a regra indica.
export function conferirCobertura({ caixa, porSolucao, atribuicoes }) {
  const donos = donosPorId(porSolucao)
  const esperado = new Map(atribuicoes.map((a) => [a.id, a.solucao]))
  return {
    semDono: caixa.filter((id) => !donos.has(id)),
    emDuas: [...donos].filter(([, s]) => s.length > 1).map(([id, solucoes]) => ({ id, solucoes })),
    foraDoLugar: [...donos]
      .filter(([id, s]) => s.length === 1 && esperado.has(id) && s[0] !== esperado.get(id))
      .map(([id, s]) => ({ id, esta: s[0], deveria: esperado.get(id) })),
  }
}

// Solução Active do Dataverse: base de todo componente próprio (não gerenciado) do ambiente.
export const SOLUCAO_ACTIVE = 'fd140aae-4df4-11dd-bd17-0019b9312238'

// Dependência ausente de uma das 4. O dono é o do próprio requerido ou, para subcomponente (atributo, formulário, visão...),
// o da tabela pai (`pai`).
// - Dono em outra das 4: só é aceita se a camada permitir (nunca para cima).
// - Sem dono nas 4 e componente próprio (base Active, ou base desconhecida): falta incluir numa das 4 ("fora das 4"); o import
//   em outro ambiente falharia ou levaria o componente só pela caixa de entrada.
// - Sem dono nas 4 e base em outra solução (sistema ou gerenciada): vem do ambiente e é ignorada.
export function conferirDependencias({ ausentes, porSolucao, permitidas }) {
  const donos = donosPorId(porSolucao)
  const violacoes = []
  for (const [solucao, deps] of Object.entries(ausentes)) {
    for (const d of deps) {
      const dono = donos.get(d.requerido)?.[0] ?? (d.pai ? donos.get(d.pai)?.[0] : undefined)
      const proprio = !d.base || String(d.base).toLowerCase() === SOLUCAO_ACTIVE
      const item = { solucao, requerido: d.requerido, tipo: d.tipo, pai: d.pai ?? null, dependente: d.dependente ?? null, tipoDependente: d.tipoDependente ?? null }
      if (dono) {
        if (dono !== solucao && !permitidas[solucao].includes(dono)) violacoes.push({ ...item, motivo: 'para cima', donoDoRequerido: dono })
      } else if (proprio) {
        violacoes.push({ ...item, motivo: 'fora das 4', donoDoRequerido: null })
      }
    }
  }
  return violacoes
}

export function conferenciaOk(cobertura, violacoes) {
  return !cobertura.semDono.length && !cobertura.emDuas.length && !cobertura.foraDoLugar.length && !violacoes.length
}

if (rodandoComoCli(import.meta.url)) {
  const entrada = await lerJson(process.argv[2])
  const cobertura = conferirCobertura(entrada)
  const violacoes = conferirDependencias(entrada)
  const ok = conferenciaOk(cobertura, violacoes)
  process.stdout.write(JSON.stringify({ cobertura, violacoes, ok }))
  process.exitCode = ok ? 0 : 1
}
