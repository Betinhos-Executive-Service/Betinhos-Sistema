#!/usr/bin/env node
// Corte dos acessos (plano 4). Quem aplica é só o workflow acessos-corte.yml, na conta de serviço; local vale só no DEV
// e sem --aplicar (dry-run). Etapas:
//   modo       imprime o modo do ambiente em corte.json; não chama o Dataverse;
//   automacao  garante os membros do perfil de coluna "Passageiros - automação" (conta que roda + ACESSOS_AUTOMACAO_MEMBROS);
//   avaliar    relatório (sai 1 se travar), foto do que sai e estado.txt = nada | aplicar | travado;
//   aplicar    reavalia, confere com a foto e aplica: Base na equipe, tira os papéis da equipe e os diretos; confere;
//   desfazer   devolve o que as fotos guardaram (equipe e pessoas ativas) e confere.
// Saída pública: contagens e ids curtos com hash. Ids reais só em <pasta>, que o workflow cifra.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { criarCliente, limpo, tokenDoAmbiente } from './dv.mjs'
import {
  PERFIL_AUTOMACAO, fotoDoCorte, lerCorte, lerFoto, lerIds, mesmoPlano, planoDesfazer, planoDoCorte, planoVazio, resumoPublico,
} from './corte-regras.mjs'
import { lerEstado } from './corte-estado.mjs'
import { avaliar, detalhe, foraDoRepo } from './relatorio-corte.mjs'

const { values: a } = parseArgs({
  options: {
    etapa: { type: 'string' }, ambiente: { type: 'string' }, pasta: { type: 'string' }, fotos: { type: 'string' },
    aplicar: { type: 'boolean', default: false },
  },
})
const escrever = (caminho, obj) => {
  mkdirSync(dirname(caminho), { recursive: true })
  writeFileSync(caminho, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2))
}

async function principal() {
  const modo = lerCorte(readFileSync(new URL('./corte.json', import.meta.url), 'utf8'), a.ambiente)
  if (a.etapa === 'modo') {
    console.log(modo)
    return 0
  }
  const sessao = await tokenDoAmbiente()
  if (sessao.ambiente !== a.ambiente) throw new Error(`--ambiente ${a.ambiente} não bate com o host (${sessao.ambiente}); nada feito`)
  if (a.aplicar && (sessao.local || process.env.GITHUB_ACTIONS !== 'true')) throw new Error('--aplicar só no workflow acessos-corte.yml; local é sempre dry-run')
  const dv = criarCliente(sessao)
  const sal = new URL(sessao.url).host
  const manter = new Set(lerIds(process.env.ACESSOS_ADMINS_MANTER))
  const ref = (conjunto, id) => ({ '@odata.id': `${dv.api}/${conjunto}(${id})` })

  async function automacao() {
    const filtro = encodeURIComponent(`name eq '${PERFIL_AUTOMACAO}'`)
    const perfis = await dv.todos(`fieldsecurityprofiles?$select=fieldsecurityprofileid&$filter=${filtro}`)
    if (!perfis.length) {
      console.log(`Perfil "${PERFIL_AUTOMACAO}" ainda não existe; nada a fazer.`)
      return 0
    }
    const perfil = perfis[0].fieldsecurityprofileid
    const { UserId } = await dv.um('WhoAmI')
    const membros = [...new Set([UserId.toLowerCase(), ...lerIds(process.env.ACESSOS_AUTOMACAO_MEMBROS)])]
    let faltam = 0
    for (const uid of membros) {
      const ja = await dv.todos(`fieldsecurityprofiles(${perfil})/systemuserprofiles_association?$select=systemuserid&$filter=systemuserid eq ${uid}`)
      if (ja.length) continue
      faltam++
      if (a.aplicar) await dv.chamar('POST', `fieldsecurityprofiles(${perfil})/systemuserprofiles_association/$ref`, ref('systemusers', uid))
    }
    console.log(`Perfil "${PERFIL_AUTOMACAO}": ${membros.length} membro(s) esperados; ${faltam} ${a.aplicar ? 'incluído(s)' : 'faltando (dry-run)'}.`)
    return 0
  }

  async function etapaAvaliar() {
    if (modo !== 'cortar') {
      console.log(`Modo ${modo}: nada a avaliar.`)
      return 0
    }
    const pasta = foraDoRepo(a.pasta)
    const { estado, relatorio } = await avaliar(dv, { manter })
    escrever(join(pasta, 'relatorio', 'relatorio.json'), detalhe(relatorio, estado))
    console.log(resumoPublico(relatorio, { ambiente: a.ambiente, sal }))
    if (!relatorio.zero) {
      escrever(join(pasta, 'estado.txt'), 'travado')
      return 1
    }
    if (planoVazio(relatorio.plano)) {
      escrever(join(pasta, 'estado.txt'), 'nada')
      console.log('Nada a cortar: o ambiente já está no estado do corte.')
      return 0
    }
    const meta = { ambiente: a.ambiente, host: sal, quando: new Date().toISOString(), commit: process.env.GITHUB_SHA ?? 'local' }
    escrever(join(pasta, 'foto', 'foto.json'), fotoDoCorte(estado, relatorio.plano, meta))
    escrever(join(pasta, 'estado.txt'), 'aplicar')
    return 0
  }

  async function etapaAplicar() {
    if (modo !== 'cortar') throw new Error(`modo ${modo}: aplicar recusado`)
    const pasta = foraDoRepo(a.pasta)
    const foto = lerFoto(readFileSync(join(pasta, 'foto', 'foto.json'), 'utf8'))
    if (foto.host !== sal) throw new Error('foto de outro ambiente; nada aplicado')
    const { estado, relatorio } = await avaliar(dv, { manter })
    if (!relatorio.zero) {
      console.log(resumoPublico(relatorio, { ambiente: a.ambiente, sal }))
      return 1
    }
    if (!mesmoPlano(foto, relatorio.plano)) {
      console.error('O ambiente mudou entre a foto e a aplicação; nada aplicado. Rode o workflow de novo.')
      return 1
    }
    if (!a.aplicar) {
      console.log('Dry-run: o plano bate com a foto; nada aplicado.')
      return 0
    }
    const { equipeAdicionar, equipeRemover, pessoasRemover } = relatorio.plano
    for (const r of equipeAdicionar) await dv.chamar('POST', `teams(${estado.equipe?.id})/teamroles_association/$ref`, ref('roles', r))
    for (const r of equipeRemover) await dv.chamar('DELETE', `teams(${estado.equipe?.id})/teamroles_association(${r})/$ref`)
    for (const { usuario, papel } of pessoasRemover) await dv.chamar('DELETE', `systemusers(${usuario})/systemuserroles_association(${papel})/$ref`)
    if (!planoVazio(planoDoCorte(await lerEstado(dv), { manter }))) {
      console.error('Conferência: ainda há papéis a tirar; veja o relatório cifrado e rode de novo.')
      return 1
    }
    console.log(`Corte aplicado: equipe -${equipeRemover.length} +${equipeAdicionar.length}; ${pessoasRemover.length} papel(is) direto(s) retirados.`)
    return 0
  }

  async function etapaDesfazer() {
    if (modo !== 'desfazer') throw new Error(`modo ${modo}: desfazer recusado`)
    const dir = foraDoRepo(a.fotos)
    const arquivos = readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('foto.json'))
    if (!arquivos.length) throw new Error('nenhuma foto encontrada; nada desfeito')
    const fotos = arquivos.map((f) => lerFoto(readFileSync(join(dir, f), 'utf8')))
    if (fotos.some((f) => f.host !== sal)) throw new Error('foto de outro ambiente; nada desfeito')
    const estado = await lerEstado(dv)
    const plano = planoDesfazer(fotos, estado)
    console.log(`Desfazer (${a.ambiente}): ${fotos.length} foto(s); equipe +${plano.equipeAdicionar.length}; ${plano.pessoasAdicionar.length} papel(is) direto(s) de volta; ${plano.ignorados.length} item(ns) ignorado(s) (pessoa inativa ou papel ausente).`)
    if (!a.aplicar) return 0
    for (const r of plano.equipeAdicionar) await dv.chamar('POST', `teams(${estado.equipe?.id})/teamroles_association/$ref`, ref('roles', r))
    for (const { usuario, papel } of plano.pessoasAdicionar) await dv.chamar('POST', `systemusers(${usuario})/systemuserroles_association/$ref`, ref('roles', papel))
    const resto = planoDesfazer(fotos, await lerEstado(dv))
    if (resto.equipeAdicionar.length || resto.pessoasAdicionar.length) {
      console.error('Conferência: ainda falta devolver papéis; rode de novo.')
      return 1
    }
    return 0
  }

  const etapas = { automacao, avaliar: etapaAvaliar, aplicar: etapaAplicar, desfazer: etapaDesfazer }
  if (!etapas[a.etapa]) throw new Error(`etapa desconhecida: ${a.etapa}`)
  return etapas[a.etapa]()
}

principal().then(
  (codigo) => process.exit(codigo),
  (e) => {
    console.error(limpo(e.message))
    process.exit(2)
  },
)
