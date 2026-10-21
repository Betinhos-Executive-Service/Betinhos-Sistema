import { lerJson, rodandoComoCli } from './arquivo.mjs'

const ordenado = (lista) => [...lista].sort()

// Diferenças entre duas fotos do mesmo ambiente. Perda = algo que existia e sumiu, caiu, perdeu a configuração
// segura ou foi desligado. Ligar um fluxo ou habilitar um step aparece nas listas informativas, mas não é perda
// (a spec diz que fluxos ligados continuam ligados).
export function compararFotos(antes, depois) {
  const d = {
    registrosCairam: [], registrosMudaram: [], tabelasSumiram: [],
    fluxosSumiram: [], fluxosMudaramEstado: [], fluxosDesligados: [],
    stepsSumiram: [], stepsMudaramEstado: [], stepsDesativados: [], stepsPerderamSeguro: [],
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
    else if (g.estado !== f.estado) {
      d.fluxosMudaramEstado.push({ id, nome: f.nome, antes: f.estado, depois: g.estado })
      if (f.estado === 1 && g.estado !== 1) d.fluxosDesligados.push({ id, nome: f.nome, antes: f.estado, depois: g.estado })
    }
  }
  for (const [id, s] of Object.entries(antes.steps)) {
    const t = depois.steps[id]
    if (!t) { d.stepsSumiram.push({ id, nome: s.nome }); continue }
    if (t.estado !== s.estado) {
      d.stepsMudaramEstado.push({ id, nome: s.nome, antes: s.estado, depois: t.estado })
      if (s.estado === 0 && t.estado !== 0) d.stepsDesativados.push({ id, nome: s.nome, antes: s.estado, depois: t.estado })
    }
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
  return [d.registrosCairam, d.tabelasSumiram, d.fluxosSumiram, d.fluxosDesligados, d.stepsSumiram, d.stepsDesativados,
    d.stepsPerderamSeguro, d.variaveisSumiram, d.variaveisMudaram, d.componentesSumiram].some((lista) => lista.length > 0)
}

if (rodandoComoCli(import.meta.url)) {
  const d = compararFotos(await lerJson(process.argv[2]), await lerJson(process.argv[3]))
  process.stdout.write(JSON.stringify(d, null, 2))
  process.exitCode = temPerda(d) ? 1 : 0
}
