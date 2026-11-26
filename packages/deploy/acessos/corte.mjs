#!/usr/bin/env node
// Corte dos acessos (plano 4). Quem aplica é só o workflow acessos-corte.yml, na conta de serviço; local vale só no DEV
// e sem --aplicar (dry-run). Etapas:
//   modo       imprime o modo do ambiente em corte.json; não chama o Dataverse;
//   automacao  garante os membros do perfil de coluna "Passageiros - automação" (conta que roda + ACESSOS_AUTOMACAO_MEMBROS);
//   avaliar    relatório (sai 1 se travar), foto do que muda e estado.txt = nada | aplicar | travado;
//   aplicar    reavalia, confere com a foto e aplica. Modo preparar: só adiciona às administrativas os 4 Gestores, Projetos,
//              Base e os perfis de coluna dos Gestores. Modo cortar: unidade Frota (recurso, BU, documentos de veículo,
//              cópias dos papéis Frota), depois Base na equipe, tira os papéis da equipe e os diretos. Confere no fim;
//   desfazer   devolve o que as fotos do corte guardaram (equipe e pessoas ativas) e a unidade Frota (olha o estado, não a
//              foto), depois tira o que as fotos do preparo puseram, e confere.
// Saída pública: contagens e ids curtos com hash. Ids reais só em <pasta>, que o workflow cifra.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { criarCliente, limpo, tokenDoAmbiente } from './dv.mjs'
import {
  PERFIL_AUTOMACAO, administrativos, fotoDoCorte, fotoDoPreparo, lerCorte, lerFoto, lerIds, mesmoPlano, planoDesfazer,
  planoDesfazerPreparo, planoDoCorte, planoDoPreparo, planoVazio, preparoVazio, resumoDoPreparo, resumoPublico,
} from './corte-regras.mjs'
import { lerEstado } from './corte-estado.mjs'
import {
  aplicarDesfazerUnidade, aplicarUnidade, fotoDaUnidade, lerUnidade, mesmaUnidade, planoDaUnidade, planoDesfazerUnidade, resumoUnidade, unidadeVazia,
} from './corte-unidade.mjs'
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

  const meta = () => ({ ambiente: a.ambiente, host: sal, quando: new Date().toISOString(), commit: process.env.GITHUB_SHA ?? 'local' })
  const chave = (plano) => JSON.stringify([...plano.papeis.map((x) => `${x.usuario}|${x.papel}`), ...plano.colunas.map((x) => `${x.usuario}|${x.perfil}`)].sort())

  async function preparo() {
    const estado = await lerEstado(dv)
    const plano = planoDoPreparo(estado)
    console.log(resumoDoPreparo(plano, { ambiente: a.ambiente, sal, total: administrativos(estado).length }))
    return plano
  }

  async function avaliarPreparo(pasta) {
    const plano = await preparo()
    const estado = plano.erros.length ? 'travado' : preparoVazio(plano) ? 'nada' : 'aplicar'
    if (estado === 'aplicar') escrever(join(pasta, 'foto', 'foto.json'), fotoDoPreparo(plano, meta()))
    escrever(join(pasta, 'estado.txt'), estado)
    return estado === 'travado' ? 1 : 0
  }

  async function aplicarPreparo(foto) {
    if (foto.versao !== 3) throw new Error('foto não é de preparo; nada aplicado')
    const plano = await preparo()
    if (plano.erros.length) return 1
    if (chave(plano) !== chave(foto)) {
      console.error('O ambiente mudou entre a foto e a aplicação; nada aplicado. Rode o workflow de novo.')
      return 1
    }
    if (!a.aplicar) {
      console.log('Dry-run: o plano bate com a foto; nada aplicado.')
      return 0
    }
    for (const { usuario, papel } of plano.papeis) await dv.chamar('POST', `systemusers(${usuario})/systemuserroles_association/$ref`, ref('roles', papel))
    for (const { usuario, perfil } of plano.colunas) await dv.chamar('POST', `fieldsecurityprofiles(${perfil})/systemuserprofiles_association/$ref`, ref('systemusers', usuario))
    if (!preparoVazio(planoDoPreparo(await lerEstado(dv)))) {
      console.error('Conferência: ainda falta dar papel ou perfil de coluna; rode de novo.')
      return 1
    }
    console.log(`Preparo aplicado: ${plano.papeis.length} papel(is) e ${plano.colunas.length} perfil(is) de coluna adicionados; nada saiu.`)
    return 0
  }

  async function etapaAvaliar() {
    if (modo !== 'cortar' && modo !== 'preparar') {
      console.log(`Modo ${modo}: nada a avaliar.`)
      return 0
    }
    const pasta = foraDoRepo(a.pasta)
    if (modo === 'preparar') return avaliarPreparo(pasta)
    const { estado, relatorio } = await avaliar(dv, { manter })
    escrever(join(pasta, 'relatorio', 'relatorio.json'), detalhe(relatorio, estado))
    console.log(resumoPublico(relatorio, { ambiente: a.ambiente, sal }))
    const u = await lerUnidade(dv)
    const pu = planoDaUnidade(u)
    console.log(resumoUnidade(pu))
    if (pu.travas.length) console.log(`Trava: colunas DateTime sem DateTimeBehavior (${pu.travas.length}): ${pu.travas.join(', ')}`)
    if (!relatorio.zero || pu.travas.length) {
      escrever(join(pasta, 'estado.txt'), 'travado')
      return 1
    }
    if (planoVazio(relatorio.plano) && unidadeVazia(pu)) {
      escrever(join(pasta, 'estado.txt'), 'nada')
      console.log('Nada a cortar: o ambiente já está no estado do corte.')
      return 0
    }
    escrever(join(pasta, 'foto', 'foto.json'), fotoDoCorte(estado, relatorio.plano, meta(), fotoDaUnidade(u, pu)))
    escrever(join(pasta, 'estado.txt'), 'aplicar')
    return 0
  }

  async function etapaAplicar() {
    if (modo !== 'cortar' && modo !== 'preparar') throw new Error(`modo ${modo}: aplicar recusado`)
    const pasta = foraDoRepo(a.pasta)
    const foto = lerFoto(readFileSync(join(pasta, 'foto', 'foto.json'), 'utf8'))
    if (foto.host !== sal) throw new Error('foto de outro ambiente; nada aplicado')
    if (modo === 'preparar') return aplicarPreparo(foto)
    if (foto.versao === 3) throw new Error('foto de preparo no modo cortar; nada aplicado')
    const { estado, relatorio } = await avaliar(dv, { manter })
    if (!relatorio.zero) {
      console.log(resumoPublico(relatorio, { ambiente: a.ambiente, sal }))
      return 1
    }
    const u = await lerUnidade(dv)
    const pu = planoDaUnidade(u)
    if (!mesmoPlano(foto, relatorio.plano) || !mesmaUnidade(foto, pu)) {
      console.error('O ambiente mudou entre a foto e a aplicação; nada aplicado. Rode o workflow de novo.')
      return 1
    }
    if (!a.aplicar) {
      console.log('Dry-run: o plano bate com a foto; nada aplicado.')
      return 0
    }
    await aplicarUnidade(dv, pu, u)
    const { equipeAdicionar, equipeRemover, pessoasRemover } = relatorio.plano
    for (const r of equipeAdicionar) await dv.chamar('POST', `teams(${estado.equipe?.id})/teamroles_association/$ref`, ref('roles', r))
    for (const r of equipeRemover) await dv.chamar('DELETE', `teams(${estado.equipe?.id})/teamroles_association(${r})/$ref`)
    for (const { usuario, papel } of pessoasRemover) await dv.chamar('DELETE', `systemusers(${usuario})/systemuserroles_association(${papel})/$ref`)
    if (!planoVazio(planoDoCorte(await lerEstado(dv), { manter })) || !unidadeVazia(planoDaUnidade(await lerUnidade(dv)))) {
      console.error('Conferência: ainda há papéis a tirar ou a unidade Frota está incompleta; veja o relatório cifrado e rode de novo.')
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
    // Estimativa antes da unidade voltar: papel Frota trocado pela cópia só aparece depois de aplicarDesfazerUnidade.
    const tirar = planoDesfazerPreparo(fotos, estado)
    console.log(`Desfazer do preparo: ${tirar.papeis.length} papel(is) e ${tirar.colunas.length} perfil(is) de coluna saem (estimativa antes da unidade voltar).`)
    const comUnidade = fotos.some((f) => f.unidade)
    const uAntes = comUnidade ? await lerUnidade(dv) : null
    const pdu = uAntes ? planoDesfazerUnidade(fotos, uAntes) : null
    if (pdu) console.log(`Desfazer da unidade: ${pdu.trocas.length} troca(s) de volta; ${pdu.documentos.length} documento(s) à raiz; unidade ${pdu.apagarUnidade ? 'apagada' : 'mantida'}; recurso ${pdu.desligarRecurso ? 'desligado' : 'mantido'}.`)
    if (!a.aplicar) return 0
    for (const r of plano.equipeAdicionar) await dv.chamar('POST', `teams(${estado.equipe?.id})/teamroles_association/$ref`, ref('roles', r))
    for (const { usuario, papel } of plano.pessoasAdicionar) await dv.chamar('POST', `systemusers(${usuario})/systemuserroles_association/$ref`, ref('roles', papel))
    if (pdu) await aplicarDesfazerUnidade(dv, pdu, uAntes)
    // Depois da unidade: o papel Frota do preparo já voltou a ser o da raiz, que é o id guardado na foto.
    const sair = planoDesfazerPreparo(fotos, await lerEstado(dv))
    for (const { usuario, papel } of sair.papeis) await dv.chamar('DELETE', `systemusers(${usuario})/systemuserroles_association(${papel})/$ref`)
    for (const { usuario, perfil } of sair.colunas) await dv.chamar('DELETE', `fieldsecurityprofiles(${perfil})/systemuserprofiles_association(${usuario})/$ref`)
    const depois = await lerEstado(dv)
    const resto = planoDesfazer(fotos, depois)
    const restoPreparo = planoDesfazerPreparo(fotos, depois)
    const restoUnidade = pdu ? planoDesfazerUnidade(fotos, await lerUnidade(dv)) : null
    if (resto.equipeAdicionar.length || resto.pessoasAdicionar.length || restoUnidade?.trocas.length || restoUnidade?.documentos.length ||
      restoPreparo.papeis.length || restoPreparo.colunas.length) {
      console.error('Conferência: ainda falta devolver papéis ou tirar o que o preparo pôs; rode de novo.')
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
