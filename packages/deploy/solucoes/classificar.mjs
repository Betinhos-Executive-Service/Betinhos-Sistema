import { pathToFileURL } from 'node:url'
import { lerJson } from './arquivo.mjs'

// Decide a solução de cada componente da caixa de entrada (AppBetinhos no DEV).
// Tipos < 10000 são fixos no Dataverse; os >= 10000 mudam por ambiente e chegam pelo nome da entidade.
export function chaveTipo(c) {
  return c.tipo < 10000 ? String(c.tipo) : c.entidade
}

export function validarRegras(regras) {
  const conhecidas = new Set(regras.solucoes)
  const usadas = [...Object.values(regras.porTipo), ...regras.excecoes.map((e) => e.solucao), ...Object.keys(regras.permitidas)]
  const desconhecidas = usadas.filter((s) => !conhecidas.has(s))
  if (desconhecidas.length) throw new Error(`Solucao desconhecida em regras.json: ${[...new Set(desconhecidas)].join(', ')}`)
}

function casa(excecao, c) {
  if (excecao.nomes) return excecao.nomes.includes(c.nome)
  if (excecao.app) return excecao.app === c.app
  if (excecao.bpf) return c.bpf === true
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [componentesPath, regrasPath] = process.argv.slice(2)
  const regras = await lerJson(regrasPath)
  validarRegras(regras)
  process.stdout.write(JSON.stringify(classificar(await lerJson(componentesPath), regras)))
}
