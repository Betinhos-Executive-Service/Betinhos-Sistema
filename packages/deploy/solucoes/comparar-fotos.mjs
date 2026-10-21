import { pathToFileURL } from 'node:url'
import { lerJson } from './arquivo.mjs'

const ordenado = (lista) => [...lista].sort()

// Diferenças entre duas fotos do mesmo ambiente. Perda = algo que existia e sumiu, caiu ou mudou de valor.
export function compararFotos(antes, depois) {
  const d = {
    registrosCairam: [], registrosMudaram: [], tabelasSumiram: [],
    fluxosSumiram: [], fluxosMudaramEstado: [],
    stepsSumiram: [], stepsMudaramEstado: [], stepsPerderamSeguro: [],
    variaveisSumiram: [], variaveisMudaram: [],
    componentesSumiram: [], donosMudaram: [], versoes: [],
  }
  const aproximados = new Set([...(antes.aproximados ?? []), ...(depois.aproximados ?? [])])
  for (const [tabela, n] of Object.entries(antes.registros)) {
    if (!(tabela in depois.registros)) d.tabelasSumiram.push(tabela)
    else if (depois.registros[tabela] !== n) {
      const item = { tabela, antes: n, depois: depois.registros[tabela] }
      if (item.depois < n && !aproximados.has(tabela)) d.registrosCairam.push(item)
      else d.registrosMudaram.push(item)
    }
  }
  for (const [id, f] of Object.entries(antes.fluxos)) {
    const g = depois.fluxos[id]
    if (!g) d.fluxosSumiram.push({ id, nome: f.nome })
    else if (g.estado !== f.estado) d.fluxosMudaramEstado.push({ id, nome: f.nome, antes: f.estado, depois: g.estado })
  }
  for (const [id, s] of Object.entries(antes.steps)) {
    const t = depois.steps[id]
    if (!t) { d.stepsSumiram.push({ id, nome: s.nome }); continue }
    if (t.estado !== s.estado) d.stepsMudaramEstado.push({ id, nome: s.nome, antes: s.estado, depois: t.estado })
    if (s.seguro && !t.seguro) d.stepsPerderamSeguro.push({ id, nome: s.nome })
  }
  for (const [nome, hash] of Object.entries(antes.variaveis)) {
    if (!(nome in depois.variaveis)) d.variaveisSumiram.push(nome)
    else if (depois.variaveis[nome] !== hash) d.variaveisMudaram.push(nome)
  }
  for (const [id, donos] of Object.entries(antes.componentes)) {
    const novos = depois.componentes[id]
    if (!novos || !novos.length) d.componentesSumiram.push(id)
    else if (ordenado(novos).join() !== ordenado(donos).join()) d.donosMudaram.push({ id, antes: donos, depois: novos })
  }
  for (const item of Object.keys(antes.versoes)) {
    if (antes.versoes[item] !== depois.versoes[item]) d.versoes.push({ item, antes: antes.versoes[item], depois: depois.versoes[item] })
  }
  return d
}

export function temPerda(d) {
  return [d.registrosCairam, d.tabelasSumiram, d.fluxosSumiram, d.fluxosMudaramEstado, d.stepsSumiram, d.stepsMudaramEstado,
    d.stepsPerderamSeguro, d.variaveisSumiram, d.variaveisMudaram, d.componentesSumiram].some((lista) => lista.length > 0)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const d = compararFotos(await lerJson(process.argv[2]), await lerJson(process.argv[3]))
  process.stdout.write(JSON.stringify(d, null, 2))
  process.exitCode = temPerda(d) ? 1 : 0
}
