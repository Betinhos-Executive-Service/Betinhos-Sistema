import { lerJson, rodandoComoCli } from './arquivo.mjs'

const ordenado = (lista) => [...lista].sort()

// Listas que reprovam (temPerda) e listas só informativas. Toda lista de compararFotos está em exatamente uma das duas.
export const PERDA = [
  'registrosCairam', 'tabelasSumiram', 'fluxosSumiram', 'fluxosDesligados', 'stepsSumiram', 'stepsDesativados',
  'stepsPerderamSeguro', 'variaveisSumiram', 'variaveisMudaram', 'componentesSumiram', 'fluxosLigadosNoTravado', 'stepsHabilitadosNoTravado',
]
export const INFORMATIVO = ['registrosMudaram', 'fluxosMudaramEstado', 'stepsMudaramEstado', 'donosMudaram', 'versoes']

// Categorias de workflow que ficam ligadas no ambiente travado sem mandar nada para fora: regra de negócio (2) e BPF (4).
export const CATEGORIAS_LIGADAS_NO_TRAVADO = [2, 4]

// Diferenças entre duas fotos do mesmo ambiente. Perda = algo que existia e sumiu, caiu, perdeu a configuração
// segura ou foi desligado. Ligar um fluxo ou habilitar um step aparece nas listas informativas, mas não é perda
// (a spec diz que fluxos ligados continuam ligados).
// Ambiente travado ({ travado: true }, o TEST copiado do PROD com os fluxos desligados): fluxo novo ou alterado que fica ligado
// (exceto regra de negócio e BPF) e step novo ou alterado que fica habilitado também são perda, porque podem mandar e-mail,
// WhatsApp ou link de pagamento a clientes reais. Fluxo sem categoria na foto conta como fluxo que manda para fora.
export function compararFotos(antes, depois, { travado = false } = {}) {
  const d = Object.fromEntries([...PERDA, ...INFORMATIVO].map((lista) => [lista, []]))
  for (const [tabela, n] of Object.entries(antes.registros)) {
    if (!(tabela in depois.registros)) d.tabelasSumiram.push(tabela)
    else if (depois.registros[tabela] !== n) {
      const item = { tabela, antes: n, depois: depois.registros[tabela] }
      if (item.depois < n) d.registrosCairam.push(item)
      else d.registrosMudaram.push(item)
    }
  }
  for (const [id, f] of Object.entries(antes.fluxos)) {
    const g = depois.fluxos[id]
    if (!g) d.fluxosSumiram.push({ id, nome: f.nome })
    else if (g.estado !== f.estado) {
      const item = { id, nome: f.nome, antes: f.estado, depois: g.estado }
      d.fluxosMudaramEstado.push(item)
      if (f.estado === 1) d.fluxosDesligados.push(item)
    }
  }
  for (const [id, s] of Object.entries(antes.steps)) {
    const t = depois.steps[id]
    if (!t) { d.stepsSumiram.push({ id, nome: s.nome }); continue }
    if (t.estado !== s.estado) {
      const item = { id, nome: s.nome, antes: s.estado, depois: t.estado }
      d.stepsMudaramEstado.push(item)
      if (s.estado === 0) d.stepsDesativados.push(item)
    }
    if (s.seguro && !t.seguro) d.stepsPerderamSeguro.push({ id, nome: s.nome })
  }
  if (travado) {
    for (const [id, g] of Object.entries(depois.fluxos)) {
      const f = antes.fluxos[id]
      if (g.estado === 1 && f?.estado !== 1 && !CATEGORIAS_LIGADAS_NO_TRAVADO.includes(g.categoria)) {
        d.fluxosLigadosNoTravado.push({ id, nome: g.nome, categoria: g.categoria ?? null, antes: f?.estado ?? null })
      }
    }
    for (const [id, t] of Object.entries(depois.steps)) {
      const s = antes.steps[id]
      if (t.estado === 0 && s?.estado !== 0) d.stepsHabilitadosNoTravado.push({ id, nome: t.nome, antes: s?.estado ?? null })
    }
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
  return PERDA.some((lista) => d[lista].length > 0)
}

// CLI: node comparar-fotos.mjs [--travado] <antes.json> <depois.json>
if (rodandoComoCli(import.meta.url)) {
  const args = process.argv.slice(2)
  const travado = args.includes('--travado')
  const arquivos = args.filter((a) => a !== '--travado')
  if (arquivos.length !== 2) throw new Error('Uso: node comparar-fotos.mjs [--travado] <antes.json> <depois.json>')
  const d = compararFotos(await lerJson(arquivos[0]), await lerJson(arquivos[1]), { travado })
  process.stdout.write(JSON.stringify(d, null, 2))
  process.exitCode = temPerda(d) ? 1 : 0
}
