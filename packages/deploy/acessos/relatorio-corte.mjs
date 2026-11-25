#!/usr/bin/env node
// Somente leitura. Avalia o corte dos acessos no ambiente: plano, perdas, uso de 90 dias, flows e travas.
// stdout: resumo público (contagens e ids curtos com hash). <pasta>/relatorio.json: detalhe com ids reais;
// a pasta fica fora do repositório e, no CI, só sai cifrada.
// Uso local (só DEV): DV_URL=https://org23b93544.crm2.dynamics.com DV_ACCESS_TOKEN=<az> ACESSOS_ADMINS_MANTER=<ids>
//   node packages/deploy/acessos/relatorio-corte.mjs --pasta <pasta fora do repo>
// Local, a "conta de serviço" é quem fez o az login: ela não perde papel direto no plano local.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { criarCliente, limpo, tokenDoAmbiente } from './dv.mjs'
import { desde, lerIds, montarRelatorio, perdasPorPessoa, planoDoCorte, resumoPublico } from './corte-regras.mjs'
import { lerEstado, lerFlows, lerReferencias, lerUso } from './corte-estado.mjs'

const RAIZ = resolve(fileURLToPath(new URL('../../..', import.meta.url)))

export function foraDoRepo(pasta) {
  if (!pasta) throw new Error('--pasta é obrigatório (fora do repositório)')
  const p = resolve(pasta)
  if (p === RAIZ || p.startsWith(RAIZ + sep)) throw new Error('a pasta do relatório fica fora do repositório (dados de pessoas)')
  mkdirSync(p, { recursive: true })
  return p
}

export async function avaliar(dv, { manter, hoje = new Date() }) {
  const estado = await lerEstado(dv)
  const plano = planoDoCorte(estado, { manter })
  const medir = [...new Set(perdasPorPessoa(estado, plano).flatMap((p) => p.escrita))].sort()
  const { uso, incertas } = await lerUso(dv, medir, estado.conjuntoDe, desde(hoje))
  const flows = await lerFlows(dv, estado.catalogo)
  const referencias = await lerReferencias(dv)
  return { estado, relatorio: montarRelatorio({ estado, manter, uso, incertas, flows, referencias }) }
}

export function detalhe(relatorio, estado) {
  const nome = (id) => estado.papeis.get(id)?.nome ?? ''
  const papel = (id) => ({ id, nome: nome(id) })
  return {
    ...relatorio,
    plano: {
      equipeRemover: relatorio.plano.equipeRemover.map(papel),
      equipeAdicionar: relatorio.plano.equipeAdicionar.map(papel),
      pessoasRemover: relatorio.plano.pessoasRemover.map((p) => ({ ...p, nome: nome(p.papel) })),
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({ options: { pasta: { type: 'string' } } })
    const pasta = foraDoRepo(values.pasta)
    const sessao = await tokenDoAmbiente()
    const { estado, relatorio } = await avaliar(criarCliente(sessao), { manter: new Set(lerIds(process.env.ACESSOS_ADMINS_MANTER)) })
    writeFileSync(join(pasta, 'relatorio.json'), JSON.stringify(detalhe(relatorio, estado), null, 2))
    console.log(resumoPublico(relatorio, { ambiente: sessao.ambiente, sal: new URL(sessao.url).host }))
    process.exit(relatorio.zero ? 0 : 1)
  } catch (e) {
    console.error(limpo(e.message))
    process.exit(2)
  }
}
