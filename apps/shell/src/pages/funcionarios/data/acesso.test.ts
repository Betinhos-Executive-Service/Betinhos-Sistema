import { describe, expect, it } from 'vitest'
import { createAcessoSource, mensagemWhatsApp, parseAcessoError, whatsappComMensagem, MENSAGENS } from './acesso'

describe('acesso', () => {
  it('parseAcessoError extrai código, texto e etapas da mensagem do Dataverse', () => {
    const erro = parseAcessoError(new Error('GRAPH_INDISPONIVEL: 503 em POST /users | etapas=[{"etapa":"usuario","estado":"erro","detalhe":"503"}]'))
    expect(erro.codigo).toBe('GRAPH_INDISPONIVEL')
    expect(erro.message).toBe(MENSAGENS.GRAPH_INDISPONIVEL)
    expect(erro.etapas).toEqual([{ etapa: 'usuario', estado: 'erro', detalhe: '503' }])
  })

  it('parseAcessoError sem código vira DESCONHECIDO com a mensagem original', () => {
    const erro = parseAcessoError(new Error('Timeout'))
    expect(erro.codigo).toBe('DESCONHECIDO')
    expect(erro.message).toContain('Timeout')
    expect(erro.etapas).toEqual([])
  })

  it('parseAcessoError acha o código em mensagem embrulhada pelo Dataverse', () => {
    const erro = parseAcessoError(new Error('Microsoft.Xrm.Sdk.InvalidPluginExecutionException: SEM_PERMISSAO: sem acesso | etapas=[]'))
    expect(erro.codigo).toBe('SEM_PERMISSAO')
    expect(erro.message).toBe(MENSAGENS.SEM_PERMISSAO)
    expect(parseAcessoError('FUNCIONARIO_NAO_ENCONTRADO: x').codigo).toBe('FUNCIONARIO_NAO_ENCONTRADO')
  })

  it('mensagemWhatsApp tem link, e-mail, senha e instrução de troca, sem introdução', () => {
    const texto = mensagemWhatsApp({ nome: 'João da Silva', emailMicrosoft: 'joao.silva@betinhos.com.br', senhaTemporaria: 'Abc#12345678xy', linkApp: 'https://app' })
    expect(texto.startsWith('*Acesso ao App Motoristas*')).toBe(true)
    expect(texto).toContain('https://app')
    expect(texto).toContain('joao.silva@betinhos.com.br')
    expect(texto).toContain('Abc#12345678xy')
    expect(texto).toContain('troque a senha')
    expect(texto).toContain('5 minutos')
  })

  it('whatsappComMensagem codifica o texto', () => {
    expect(whatsappComMensagem('(12) 99123-4567', 'oi & tchau')).toBe('https://wa.me/5512991234567?text=oi%20%26%20tchau')
    expect(whatsappComMensagem('123', 'x')).toBeNull()
  })

  it('mock cadastra, aplica sufixo quando repete e simula erro pelo nome', async () => {
    const src = createAcessoSource({ mode: 'mock' })
    const a = await src.cadastrar({ nomeCompleto: 'Ana Lima', celular: '12991234567', tipoVinculo: 1 })
    expect(a.emailMicrosoft).toBe('ana.lima@betinhos.com.br')
    expect(a.senhaTemporaria).toHaveLength(14)
    expect(a.etapas.map((e) => e.estado)).toContain('feita')
    const b = await src.cadastrar({ nomeCompleto: 'Ana Lima', celular: '12991234567', tipoVinculo: 1 })
    expect(b.emailMicrosoft).toBe('ana.lima2@betinhos.com.br')
    await expect(src.cadastrar({ nomeCompleto: 'Erro Graph', celular: '12991234567', tipoVinculo: 1 })).rejects.toMatchObject({ codigo: 'GRAPH_INDISPONIVEL' })
    await expect(src.cadastrar({ nomeCompleto: 'Sem Licenca', celular: '12991234567', tipoVinculo: 1 })).rejects.toMatchObject({ codigo: 'SEM_LICENCA_DISPONIVEL' })
  })

  it('mock encerra só com o primeiro nome certo', async () => {
    const src = createAcessoSource({ mode: 'mock' })
    await expect(src.encerrar('m1', 'Errado')).rejects.toMatchObject({ codigo: 'CONFIRMACAO_INVALIDA' })
    const etapas = await src.encerrar('m1', 'Carlos')
    expect(etapas.find((e) => e.etapa === 'funcionario')?.estado).toBe('feita')
  })

  it('dataverse chama as Custom APIs com os nomes de parâmetro do plugin', async () => {
    const calls: { path: string; body: unknown }[] = []
    const client = { request: async (path: string, init: { body: string }) => { calls.push({ path, body: JSON.parse(init.body) }); return path.includes('Cadastrar') ? { EmailMicrosoft: 'a@b', SenhaTemporaria: 's', FuncionarioId: 'f', LinkApp: 'l', Etapas: '[]' } : { Etapas: '[{"etapa":"conta","estado":"feita","detalhe":""}]' } } }
    const src = createAcessoSource({ mode: 'dataverse', client } as never)
    const r = await src.cadastrar({ nomeCompleto: 'A B', celular: '12991234567', tipoVinculo: 1, funcionarioId: 'F1' })
    expect(calls[0]).toEqual({ path: 'cr40f_CadastrarAcessoMotorista', body: { NomeCompleto: 'A B', Celular: '12991234567', TipoVinculo: 1, FuncionarioId: 'F1' } })
    expect(r).toEqual({ emailMicrosoft: 'a@b', senhaTemporaria: 's', funcionarioId: 'f', linkApp: 'l', etapas: [] })
    await src.encerrar('F1', 'Ana')
    expect(calls[1]).toEqual({ path: 'cr40f_EncerrarAcessoMotorista', body: { FuncionarioId: 'F1', Confirmacao: 'Ana' } })
  })

  it('parseAcessoError lê só o primeiro array de etapas mesmo com texto e colchetes do Dataverse depois', () => {
    const msg = 'GRAPH_INDISPONIVEL: falha | etapas=[{"etapa":"usuario","estado":"feita","detalhe":"criado [ok]"},{"etapa":"licenca","estado":"erro","detalhe":"503"}]\r\n[Cr40f.Acesso.Plugin: Cr40f.Acesso.Plugin.CadastrarAcessoMotoristaPlugin]\r\n[abc: Cr40f.Acesso: cadastrar acesso]'
    const erro = parseAcessoError(new Error(msg))
    expect(erro.codigo).toBe('GRAPH_INDISPONIVEL')
    expect(erro.etapas).toEqual([{ etapa: 'usuario', estado: 'feita', detalhe: 'criado [ok]' }, { etapa: 'licenca', estado: 'erro', detalhe: '503' }])
  })

  it('ACESSO_ENCERRADO tem mensagem própria', () => {
    expect(parseAcessoError(new Error('ACESSO_ENCERRADO: x | etapas=[]')).message).toBe('Acesso encerrado antes. Peça à TI para reativar a conta no Entra.')
  })
})
