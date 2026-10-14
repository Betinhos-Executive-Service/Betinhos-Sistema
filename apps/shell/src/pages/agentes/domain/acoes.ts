import type { Gravacao, Proposta } from './types'

const texto = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const exige = (p: Proposta, campo: string) => {
  const v = texto(p.acao?.campos[campo])
  if (!v) throw new Error(`Ação ${p.acao?.tipo} sem ${campo}.`)
  return v
}

/** Frase mostrada na confirmação antes de gravar. */
export function descreverAcao(p: Proposta): string {
  if (!p.acao) return 'Só registrar a decisão; nada será gravado no registro.'
  const c = p.acao.campos
  switch (p.acao.tipo) {
    case 'AtribuirMotorista': return `Atribuir o motorista ${texto(c.motoristaNome) || texto(c.motoristaId)} ao serviço ${p.titulo}.`
    case 'AtribuirVeiculo': return `Atribuir o veículo ${texto(c.veiculoPlaca) || texto(c.veiculoId)} ao serviço ${p.titulo}.`
    case 'CriarPendencia': return `Criar a pendência "${texto(c.titulo)}" no Planner.`
    case 'CriarComunicadoRascunho': return `Criar o comunicado "${texto(c.titulo)}" como rascunho (inativo).`
  }
}

/** O que Aprovar grava, com a sessão do usuário. `null` quando a proposta não tem ação. */
export function gravacaoDaAcao(p: Proposta): Gravacao | null {
  if (!p.acao) return null
  switch (p.acao.tipo) {
    case 'AtribuirMotorista': return { kind: 'update', entity: 'cr40f_reservadeveculos', id: p.idAlvo, data: { 'cr40f_Motorista@odata.bind': `/cr40f_funcionarioses(${exige(p, 'motoristaId')})` } }
    case 'AtribuirVeiculo': return { kind: 'update', entity: 'cr40f_reservadeveculos', id: p.idAlvo, data: { 'cr40f_Veiculo@odata.bind': `/cr40f_veiculoses(${exige(p, 'veiculoId')})` } }
    case 'CriarPendencia': {
      const titulo = exige(p, 'titulo').slice(0, 200)
      return { kind: 'create', entity: 'cr40f_plannertarefa', data: { cr40f_name: titulo.slice(0, 100), cr40f_titulo: titulo, cr40f_descricao: texto(p.acao.campos.descricao), cr40f_status: 100000000, cr40f_origem: 100000000, cr40f_prioridade: p.prioridade === 'alta' ? 100000002 : p.prioridade === 'media' ? 100000001 : 100000000, cr40f_codigoorigem: `agente:${p.id}` } }
    }
    case 'CriarComunicadoRascunho': {
      const titulo = exige(p, 'titulo').slice(0, 300)
      return { kind: 'create', entity: 'cr40f_comunicadohome', data: { cr40f_name: titulo.slice(0, 100), cr40f_titulo: titulo, cr40f_conteudo: texto(p.acao.campos.conteudo), cr40f_ativo: false, cr40f_prioridade: 100000000, cr40f_publico: 100000000 } }
    }
  }
}
