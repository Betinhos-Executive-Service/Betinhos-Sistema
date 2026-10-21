import { pathToFileURL } from 'node:url'
import { lerJson } from './arquivo.mjs'

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

// Dependência ausente que pertence a outra das 4 só é aceita se a camada permitir (nunca para cima).
export function conferirDependencias({ ausentes, porSolucao, permitidas }) {
  const donos = donosPorId(porSolucao)
  const violacoes = []
  for (const [solucao, deps] of Object.entries(ausentes)) {
    for (const d of deps) {
      const dono = donos.get(d.requerido)?.[0]
      if (dono && dono !== solucao && !permitidas[solucao].includes(dono)) {
        violacoes.push({ solucao, requerido: d.requerido, tipo: d.tipo, donoDoRequerido: dono })
      }
    }
  }
  return violacoes
}

export function conferenciaOk(cobertura, violacoes) {
  return !cobertura.semDono.length && !cobertura.emDuas.length && !cobertura.foraDoLugar.length && !violacoes.length
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const entrada = await lerJson(process.argv[2])
  const cobertura = conferirCobertura(entrada)
  const violacoes = conferirDependencias(entrada)
  const ok = conferenciaOk(cobertura, violacoes)
  process.stdout.write(JSON.stringify({ cobertura, violacoes, ok }))
  process.exitCode = ok ? 0 : 1
}
