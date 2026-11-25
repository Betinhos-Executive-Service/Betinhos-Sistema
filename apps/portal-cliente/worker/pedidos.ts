// Módulos Pedir e Meus serviços: o pedido vira uma Reserva de Veículos em Solicitado, ligada ao usuário do portal;
// a operação precifica e programa no shell e o solicitante acompanha o status aqui.
import { chaveDuplicado, chaveNome, JANELA_DUPLICADO_MS, MAX_ENDERECO, normalizarPedido, primeiroErroPedido, soDigitos, statusPedidoInfo, textoCortesia } from '../src/domain/pedidos'
import { motivoNaoCancela } from '../src/domain/prazos'
import type { NovoPedido, PassageiroPedido } from '../src/domain/types'
import type { Ctx } from './auth'
import { sha256Hex } from './cripto'
import { erro, json, lerJson, type Sessao } from './http'
import { mapearPedido, type PedidoPortal, type Registro } from './mapear'
import { criarPedido as caminhoCriar, criarPessoa, ehGuid, guid, pedidoDe, pedidosDe, pessoaDoCliente, pessoasComNome, pessoasDoCliente } from './odata'
import { alterarPendente, anexarNota, aprovadoresDoPedido, avisarAprovadores, dataHoraSp, ESTADO, quandoETrajeto } from './aprovacao'
import { enviarEmail, ErroDataverse } from './dataverse'
import { prazosDoCliente } from './prazos'
import { APROVACAO, NAV, PESSOA_ATIVA, PESSOA_CAMPOS, PESSOA_CAMPOS_ENDERECO, RESERVA_CANCELADO, RESERVA_SOLICITADO, SET } from './schema'

const textoOu = (v: unknown) => (typeof v === 'string' ? v : '')

/** Passageiros do corpo: só objetos com os campos conhecidos; qualquer outra coisa vira nome vazio (recusado pela validação). */
function passageirosDoCorpo(v: unknown): PassageiroPedido[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    return {
      ...(typeof o.id === 'string' && o.id ? { id: o.id } : {}), nome: textoOu(o.nome), telefone: textoOu(o.telefone), email: textoOu(o.email),
      // Só quando o cliente mandou: ausente = não mexe no padrão; "" = limpa.
      ...(typeof o.saidaPadrao === 'string' ? { saidaPadrao: o.saidaPadrao } : {}),
      ...(typeof o.destinoPadrao === 'string' ? { destinoPadrao: o.destinoPadrao } : {}),
    }
  })
}

const str = (r: Registro, campo: string) => (typeof r[campo] === 'string' ? (r[campo] as string) : '')
/** Endereço padrão em uma linha só (o memo da ficha pode ter quebras) e no tamanho do campo do pedido. */
const umaLinha = (t: string) => t.replace(/\s*[\r\n]+\s*/g, ', ').trim().slice(0, MAX_ENDERECO)
/** Chave do portal, coluna da pessoa (cr40f_bancodedados). */
const PADROES = [['saidaPadrao', 'cr40f_enderecodesaida'], ['destinoPadrao', 'cr40f_enderecodedestino']] as const
/** Padrões enviados pelo cliente, já em uma linha (o que vale depois da gravação). */
const padroesDe = (p: PassageiroPedido): Pick<PassageiroPedido, 'saidaPadrao' | 'destinoPadrao'> =>
  Object.fromEntries(PADROES.flatMap(([k]) => { const v = p[k]; return v === undefined ? [] : [[k, umaLinha(v)]] }))
/** Contato e endereços padrão; as chaves de endereço só vêm quando a leitura trouxe a coluna (antes da migration não trazem). */
const contatoDe = (r: Registro): PassageiroPedido => ({
  id: str(r, 'cr40f_bancodedadosid'), nome: str(r, 'cr40f_nomedopassageiro'), telefone: str(r, 'cr40f_telefone'), email: str(r, 'cr40f_email'),
  ...Object.fromEntries(PADROES.filter(([, coluna]) => coluna in r).map(([chave, coluna]) => [chave, umaLinha(str(r, coluna))])),
})
/**
 * Colunas a gravar na pessoa: só os padrões que o cliente mandou e que diferem do cadastro ("" limpa).
 * Coluna que a leitura não trouxe (antes da migration) não entra: o PATCH dela daria 400 e derrubaria o pedido.
 */
const mudancaPadroes = (atual: PassageiroPedido, p: PassageiroPedido): Registro => {
  const novos = padroesDe(p)
  return Object.fromEntries(PADROES.flatMap(([chave, coluna]) => {
    const novo = novos[chave]
    return novo !== undefined && chave in atual && novo !== atual[chave] ? [[coluna, novo || null]] : []
  }))
}
const mesmoContato = (a: PassageiroPedido, b: PassageiroPedido) =>
  (!!a.telefone && !!b.telefone && soDigitos(a.telefone) === soDigitos(b.telefone)) || (!!a.email && !!b.email && a.email.toLowerCase() === b.email.toLowerCase())

/** Passageiros do cliente da sessão para o Pedir escolher: nome, celular e e-mail, no máximo 20. */
export async function listarPassageiros(c: Ctx, sessao: Sessao, busca: string): Promise<Response> {
  const pessoas = await listaPessoas(c, (campos) => pessoasDoCliente(sessao.cid, busca.trim().slice(0, 100), campos))
  return json(pessoas.map(contatoDe))
}

/** Lê com os endereços padrão; se o Dataverse responder 400 (coluna de destino ainda sem a migration), repete só com o contato. */
async function listaPessoas(c: Ctx, caminho: (campos: string[]) => string): Promise<Registro[]> {
  try { return await c.dv.lista(caminho(PESSOA_CAMPOS_ENDERECO)) } catch (e) {
    if (!(e instanceof ErroDataverse) || e.status !== 400) throw e // só 400 = coluna ausente; 503 e afins propagam
    console.warn('pessoas sem endereço padrão', e.message)
    return c.dv.lista(caminho(PESSOA_CAMPOS))
  }
}

/** Pessoa do cliente da sessão (por id, ou criada/reaproveitada pelo nome e contato) já com o contato corrigido. */
type Resolvida = { pessoa: PassageiroPedido; atualizar?: Registro }

/** Só leitura: devolve o que gravar, ou a mensagem de erro (id de outra pessoa/cliente). */
async function resolver(c: Ctx, sessao: Sessao, p: PassageiroPedido): Promise<Resolvida | string> {
  if (p.id) {
    if (!ehGuid(p.id)) return 'Passageiro não encontrado.'
    const [reg] = await listaPessoas(c, (campos) => pessoaDoCliente(p.id!, sessao.cid, campos))
    if (!reg) return 'Passageiro não encontrado.'
    const atual = contatoDe(reg)
    const mudou: Registro = mudancaPadroes(atual, p)
    if ((p.telefone ?? '') !== atual.telefone) mudou.cr40f_telefone = p.telefone || null
    if ((p.email ?? '') !== atual.email) mudou.cr40f_email = p.email || null
    return { pessoa: { ...atual, telefone: p.telefone ?? '', email: p.email ?? '', ...padroesDe(p) }, ...(Object.keys(mudou).length ? { atualizar: mudou } : {}) }
  }
  const candidatas = (await listaPessoas(c, (campos) => pessoasComNome(sessao.cid, p.nome, campos))).map(contatoDe)
  const igual = candidatas.find((x) => chaveNome(x.nome) === chaveNome(p.nome) && mesmoContato(x, p))
  if (!igual) return { pessoa: { nome: p.nome, telefone: p.telefone, email: p.email, ...padroesDe(p) } }
  const atualizar = mudancaPadroes(igual, p)
  return { pessoa: { ...igual, telefone: igual.telefone || p.telefone, email: igual.email || p.email, ...padroesDe(p) }, ...(Object.keys(atualizar).length ? { atualizar } : {}) }
}

export async function criarPedido(req: Request, c: Ctx, sessao: Sessao): Promise<Response> {
  const corpo = await lerJson<Partial<Record<keyof NovoPedido, unknown>>>(req)
  const pedido = normalizarPedido({
    passageiros: passageirosDoCorpo(corpo?.passageiros), origem: textoOu(corpo?.origem), destino: textoOu(corpo?.destino), saida: textoOu(corpo?.saida), observacao: textoOu(corpo?.observacao),
    ...(typeof corpo?.tipoVeiculo === 'number' ? { tipoVeiculo: corpo.tipoVeiculo } : corpo?.tipoVeiculo != null ? { tipoVeiculo: Number.NaN } : {}),
  })
  const primeiroErro = primeiroErroPedido(pedido, c.agora, await prazosDoCliente(c.dv, sessao.cid))
  if (primeiroErro) return erro(400, 'nao_permitido', primeiroErro)

  // Clique duplo ou reenvio: mesmo pedido do mesmo usuário em 1 minuto não cria outra reserva.
  const chave = `pedido:${await sha256Hex(`${sessao.vid}|${chaveDuplicado(sessao.email, pedido)}`)}`
  if (await c.env.KV.get(chave)) return erro(409, 'duplicado', 'Este pedido acabou de ser enviado.')

  // 1) Só leitura: confere que cada passageiro com id é do cliente da sessão, antes de gravar qualquer coisa.
  const resolvidas: Resolvida[] = []
  for (const p of pedido.passageiros) {
    const r = await resolver(c, sessao, p)
    if (typeof r === 'string') return erro(400, 'nao_permitido', r)
    resolvidas.push(r)
  }
  const ids = resolvidas.map((r) => r.pessoa.id).filter(Boolean)
  if (new Set(ids).size < ids.length) return erro(400, 'nao_permitido', 'Este passageiro já está no pedido.')

  // 2) Corrige o contato de quem já existe e cadastra quem é novo.
  const pessoas: PassageiroPedido[] = []
  for (const r of resolvidas) {
    if (r.pessoa.id) {
      if (r.atualizar) await c.dv.patch(`${SET.pessoa}(${guid(r.pessoa.id)})`, r.atualizar)
      pessoas.push(r.pessoa)
      continue
    }
    const nova = await c.dv.criar(criarPessoa(), {
      cr40f_nomedopassageiro: r.pessoa.nome,
      ...(r.pessoa.telefone ? { cr40f_telefone: r.pessoa.telefone } : {}),
      ...(r.pessoa.email ? { cr40f_email: r.pessoa.email } : {}),
      ...Object.fromEntries(PADROES.filter(([k]) => r.pessoa[k]).map(([k, coluna]) => [coluna, r.pessoa[k]])),
      cr40f_status: PESSOA_ATIVA,
      [`${NAV.pessoaCliente}@odata.bind`]: `/${SET.cliente}(${sessao.cid})`,
    })
    pessoas.push({ ...r.pessoa, id: str(nova, 'cr40f_bancodedadosid') })
  }

  // 3) Reserva e, por último, o vínculo de cada pessoa (Serviços por Passageiro, ordem 1..N).
  // Cliente com aprovação ligada: o pedido nasce Pendente e só chega à operação depois da decisão (lido à parte, tolerante a coluna ausente).
  const aprovadores = await aprovadoresDoPedido(c.dv, sessao.cid, sessao.vid)
  const portal: PedidoPortal = { passageiros: pessoas.map((p) => p.nome), ...(pedido.observacao ? { observacao: pedido.observacao } : {}), ...(pedido.tipoVeiculo !== undefined ? { tipoVeiculo: pedido.tipoVeiculo } : {}) }
  const criado = await c.dv.criar(caminhoCriar(), {
    cr40f_status: RESERVA_SOLICITADO,
    cr40f_dataehorriodesada: new Date(Date.parse(pedido.saida)).toISOString(),
    cr40f_endereodesada: pedido.origem,
    cr40f_destino: pedido.destino,
    ...(pedido.tipoVeiculo !== undefined ? { cr40f_tipodeveiculo: pedido.tipoVeiculo } : {}),
    cr40f_portalpedido: JSON.stringify(portal),
    ...(aprovadores.length ? { cr40f_portalaprovacao: APROVACAO.pendente } : {}),
    // Cortesia para a operação (só escrita, "Nome – contato"): quem lê passageiros usa Serviços por Passageiro.
    cr40f_passageirosetelefonedecontato: textoCortesia(pessoas),
    cr40f_observaointerna: `Pedido pelo portal por ${sessao.nome} (${sessao.email})${pedido.observacao ? `: ${pedido.observacao}` : ''}`,
    [`${NAV.cliente}@odata.bind`]: `/${SET.cliente}(${sessao.cid})`,
    [`${NAV.portalUsuario}@odata.bind`]: `/${SET.validador}(${sessao.vid})`,
  })
  const reservaId = str(criado, 'cr40f_reservadeveculosid')
  try {
    for (const [i, p] of pessoas.entries()) {
      await c.dv.post(SET.vinculo, {
        [`${NAV.vinculoGeral}@odata.bind`]: `/${SET.reserva}(${guid(reservaId)})`,
        [`${NAV.vinculoPessoa}@odata.bind`]: `/${SET.pessoa}(${guid(p.id ?? '')})`,
        cr40f_ordemdeselecao: i + 1,
      })
    }
  } catch (e) {
    console.error('vínculo de passageiro falhou', e instanceof Error ? e.message : e)
    await desfazerReserva(c, reservaId, sessao)
    return erro(502, 'falha', 'Não foi possível registrar os passageiros do pedido. Tente de novo.')
  }
  if (aprovadores.length) {
    // Pendente sai das telas da operação (inativa) e avisa os aprovadores; falha ao inativar desfaz, para não vazar o pedido sem aprovar.
    try {
      await c.dv.patch(`${SET.reserva}(${guid(reservaId)})`, ESTADO.inativo)
    } catch (e) {
      console.error('inativar pedido pendente falhou', e instanceof Error ? e.message : e)
      await desfazerReserva(c, reservaId, sessao)
      return erro(502, 'falha', 'Não foi possível registrar o pedido. Tente de novo.')
    }
    c.waitUntil(avisarAprovadores(c.env, 'aprovacao_pendente', { ...criado, cr40f_PortalUsuario: { cr40f_name: sessao.nome, cr40f_email: sessao.email }, [NAV.passageiros]: [] }, aprovadores))
  }
  // Marca só depois de criar tudo: uma falha no Dataverse não bloqueia a nova tentativa por 1 minuto.
  c.waitUntil(c.env.KV.put(chave, '1', { expirationTtl: JANELA_DUPLICADO_MS / 1000 }))
  return json({ ...mapearPedido(criado, sessao.vid), passageiros: pessoas.map((p) => p.nome), pessoas, ...(pedido.tipoVeiculo !== undefined ? { tipoVeiculo: pedido.tipoVeiculo } : {}) }, 201)
}

/** Reserva sem passageiros não pode ficar na fila da operação: apaga; se o papel não deixar, cancela com nota. */
async function desfazerReserva(c: Ctx, reservaId: string, sessao: Sessao): Promise<void> {
  try {
    await c.dv.apagar(`${SET.reserva}(${guid(reservaId)})`)
  } catch {
    try {
      await c.dv.patch(`${SET.reserva}(${guid(reservaId)})`, { cr40f_status: RESERVA_CANCELADO, cr40f_observaointerna: `Pedido pelo portal por ${sessao.nome} (${sessao.email}) cancelado: falha ao registrar os passageiros.` })
    } catch (e) {
      console.error('não foi possível desfazer a reserva', reservaId, e instanceof Error ? e.message : e)
    }
  }
}

export async function listarPedidos(c: Ctx, sessao: Sessao): Promise<Response> {
  return json((await c.dv.lista(pedidosDe(sessao.vid, sessao.cid, sessao.email))).map((r) => mapearPedido(r, sessao.vid)))
}

/** Cancela um pedido ainda em Solicitado; depois disso é com a operação. A nota fica na observação interna da reserva. */
export async function cancelarPedido(c: Ctx, sessao: Sessao, id: string): Promise<Response> {
  const [[reg], prazos] = await Promise.all([c.dv.lista(pedidoDe(id, sessao.vid, sessao.cid)), prazosDoCliente(c.dv, sessao.cid)])
  if (!reg) return erro(404, 'nao_permitido', 'Pedido não encontrado.')
  const atual = mapearPedido(reg, sessao.vid)
  const motivo = motivoNaoCancela(atual, c.agora, prazos)
  if (motivo) return erro(409, 'nao_permitido', motivo)
  const nota = `Cancelado pelo cliente no portal por ${sessao.nome} (${sessao.email}) em ${dataHoraSp.format(c.agora)}`
  const antes = typeof reg.cr40f_observaointerna === 'string' ? reg.cr40f_observaointerna : ''
  const corpo = { cr40f_status: RESERVA_CANCELADO, cr40f_observaointerna: anexarNota(antes, nota) }
  // Pendente de aprovação está inativo: grava reativando e volta a inativar (nunca chegou à operação).
  if (reg.cr40f_portalaprovacao === APROVACAO.pendente) await alterarPendente(c.dv, `${SET.reserva}(${guid(id)})`, corpo, true)
  else await c.dv.patch(`${SET.reserva}(${guid(id)})`, corpo)
  // Já na fila da operação (Confirmado ou Programado): avisa a caixa da operação; `para` vazio = a caixa compartilhada.
  if (atual.status !== 'solicitado') {
    c.waitUntil(enviarEmail(c.env, 'cancelamento_operacao', [], { numero: atual.numero, solicitante: sessao.nome, cliente: sessao.cliente, situacao: statusPedidoInfo(atual.status).rotulo, ...quandoETrajeto(atual), passageiros: atual.passageiros.join(', ') }).catch((e) => console.error('cancelamento/aviso', id, String(e))))
  }
  return json(mapearPedido({ ...reg, cr40f_status: RESERVA_CANCELADO }, sessao.vid))
}
