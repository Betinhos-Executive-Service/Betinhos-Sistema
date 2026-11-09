import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Faz os flows de recibo seguirem o destinatário gravado no pagante (cr40f_destinatariorecibo ou cr40f_emailrecibo).
// Sem destinatário, nada muda: Get_destinatario_recibo lê o próprio pagante.
// Destinatário cadastrado sem e-mail: só o financeiro recebe, com um aviso no início do e-mail.
// Transformação idempotente da definição que já está no Dataverse, usada por provision-flow-recibo-destinatario.ps1.

const PAG = "outputs('Get_a_row_by_ID_PAG')"
const BD = "outputs('Get_a_row_by_ID_BD')"
const DEST = "outputs('Get_destinatario_recibo')"
const OVERRIDE = "triggerBody()?['EMAIL_DESTINO']"

function escopoComAcao(acoes, nome) {
  if (acoes?.[nome]) return acoes
  for (const acao of Object.values(acoes ?? {})) {
    const ramos = [acao.actions, acao.else?.actions, acao.default?.actions, ...Object.values(acao.cases ?? {}).map((c) => c.actions)]
    for (const ramo of ramos) {
      const achado = escopoComAcao(ramo, nome)
      if (achado) return achado
    }
  }
  return null
}

function destinoRecibo(manual) {
  const digitado = manual ? `coalesce(${OVERRIDE}, ${PAG}?['body/cr40f_emailrecibo'], '')` : `coalesce(${PAG}?['body/cr40f_emailrecibo'], '')`
  const emailPessoa = `coalesce(${DEST}?['body/cr40f_email'], '')`
  const semEmail = `and(empty(${digitado}), not(empty(${PAG}?['body/_cr40f_destinatariorecibo_value'])), empty(${emailPessoa}))`
  return {
    para: `@if(empty(${digitado}), ${emailPessoa}, ${digitado})`,
    nome: `@${DEST}?['body/cr40f_nomedopassageiro']`,
    idioma: `@${DEST}?['body/_cr40f_idioma_label']`,
    aviso: `@if(${semEmail}, concat('<p><strong>Atenção, financeiro:</strong> este recibo deveria ir para ', ${DEST}?['body/cr40f_nomedopassageiro'], ', mas o cadastro dessa pessoa está sem e-mail. Encaminhe o recibo ou corrija o cadastro e reenvie.</p>'), '')`,
  }
}

export function aplicarDestinatario(definition, { manual }) {
  const definicao = structuredClone(definition)
  const escopo = escopoComAcao(definicao.actions, 'Get_a_row_by_ID_BD')
  if (!escopo?.Get_a_row_by_ID_OP) throw new Error('Get_a_row_by_ID_BD ou Get_a_row_by_ID_OP não encontrado.')

  const pessoa = structuredClone(escopo.Get_a_row_by_ID_BD)
  pessoa.runAfter = { Get_a_row_by_ID_BD: ['Succeeded'] }
  const pagante = `${PAG}?['body/_cr40f_bancodedados_value']`
  const pessoaGravada = `coalesce(${PAG}?['body/_cr40f_destinatariorecibo_value'], ${pagante})`
  // Troca avulsa no modal saúda o pagante, como o e-mail digitado.
  pessoa.inputs.parameters.recordId = manual ? `@if(empty(${OVERRIDE}), ${pessoaGravada}, ${pagante})` : `@${pessoaGravada}`
  escopo.Get_destinatario_recibo = pessoa
  escopo.Destino_recibo = { type: 'Compose', runAfter: { Get_destinatario_recibo: ['Succeeded'] }, inputs: destinoRecibo(manual) }
  escopo.Get_a_row_by_ID_OP.runAfter = { Destino_recibo: ['Succeeded'] }

  const seletor = escopoComAcao(definicao.actions, 'Switch_Idioma')?.Switch_Idioma
  if (!seletor) throw new Error('Switch_Idioma não encontrado.')
  seletor.expression = "@coalesce(outputs('Destino_recibo')?['idioma'], 'Português')"
  for (const caso of Object.values(seletor.cases)) {
    for (const acao of Object.values(caso.actions)) {
      const p = acao.inputs.parameters
      p['emailMessage/To'] = p['emailMessage/To'].replace(`@{${BD}?['body/cr40f_email']}`, "@{outputs('Destino_recibo')?['para']}")
      p['emailMessage/Body'] = p['emailMessage/Body'].replace(`@{${BD}?['body/cr40f_nomedopassageiro']}`, "@{outputs('Destino_recibo')?['nome']}")
      const aviso = "@{outputs('Destino_recibo')?['aviso']}"
      if (!p['emailMessage/Body'].startsWith(aviso)) p['emailMessage/Body'] = aviso + p['emailMessage/Body']
    }
  }

  if (manual) Object.values(definicao.triggers)[0].inputs.schema.properties.EMAIL_DESTINO = { type: 'string' }
  return definicao
}

// Uso: node recibo-destinatario.mjs --manual entrada.json saida.json. Imprime "igual" quando a definição já está aplicada.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const manual = args[0] === '--manual'
  const [entrada, saida] = args.filter((a) => a !== '--manual')
  const clientdata = JSON.parse(readFileSync(entrada, 'utf8'))
  const antes = JSON.stringify(clientdata)
  clientdata.properties.definition = aplicarDestinatario(clientdata.properties.definition, { manual })
  const depois = JSON.stringify(clientdata)
  writeFileSync(saida, depois)
  console.log(antes === depois ? 'igual' : 'mudou')
}
