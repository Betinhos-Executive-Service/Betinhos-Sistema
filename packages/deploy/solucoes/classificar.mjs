import { lerJson, rodandoComoCli } from './arquivo.mjs'

// Decide a solução de cada componente da caixa de entrada (AppBetinhos no DEV).
// Tipos < 10000 são fixos no Dataverse; os >= 10000 mudam por ambiente e chegam pelo nome da entidade.
export function chaveTipo(c) {
  return c.tipo < 10000 ? String(c.tipo) : c.entidade
}

export function validarRegras(regras) {
  const conhecidas = new Set(regras.solucoes)
  const usadas = [...Object.values(regras.porTipo), ...regras.excecoes.map((e) => e.solucao), ...Object.keys(regras.permitidas), ...Object.values(regras.permitidas).flat()]
  const desconhecidas = usadas.filter((s) => !conhecidas.has(s))
  if (desconhecidas.length) throw new Error(`Solucao desconhecida em regras.json: ${[...new Set(desconhecidas)].join(', ')}`)
  for (const e of regras.excecoes) {
    // classificar compara e.tipo === chaveTipo(c), que é texto: tipo numérico nunca casaria. bpf só tem sentido como true.
    if (typeof e.tipo !== 'string') throw new Error(`Excecao do tipo ${e.tipo} precisa do tipo em texto (ex.: "61")`)
    if (e.bpf !== undefined && e.bpf !== true) throw new Error(`Excecao do tipo ${e.tipo} so aceita bpf: true`)
    const condicoes = ['nomes', 'app', 'bpf', 'categoria'].filter((k) => e[k] !== undefined)
    if (condicoes.length !== 1) throw new Error(`Excecao do tipo ${e.tipo} precisa de exatamente uma condicao entre nomes, app, bpf e categoria`)
    if (!Object.hasOwn(regras.porTipo, e.tipo)) throw new Error(`Excecao aponta para o tipo ${e.tipo}, que nao existe em porTipo`)
  }
}

function casa(excecao, c) {
  if (excecao.nomes) return excecao.nomes.includes(c.nome)
  if (excecao.app) return excecao.app === c.app
  if (excecao.bpf) return c.bpf === true
  if (excecao.categoria !== undefined) return c.categoria === excecao.categoria
  return false
}

export function classificar(componentes, regras) {
  const atribuicoes = []
  const semRegra = []
  const proibidos = []
  for (const c of componentes) {
    const chave = chaveTipo(c)
    if (regras.proibidos[chave]) {
      proibidos.push({ ...c, motivo: regras.proibidos[chave] })
      continue
    }
    const excecao = regras.excecoes.find((e) => e.tipo === chave && casa(e, c))
    const solucao = excecao ? excecao.solucao : regras.porTipo[chave]
    if (solucao) atribuicoes.push({ ...c, solucao })
    else semRegra.push(c)
  }
  return { atribuicoes, semRegra, proibidos }
}

if (rodandoComoCli(import.meta.url)) {
  const [componentesPath, regrasPath] = process.argv.slice(2)
  const regras = await lerJson(regrasPath)
  validarRegras(regras)
  process.stdout.write(JSON.stringify(classificar(await lerJson(componentesPath), regras)))
}
