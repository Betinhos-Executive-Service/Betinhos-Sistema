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
    const texto = mensagemWhatsApp({ nome: 'João da Silva', emailMicrosoft: 'joao.silva@betinhos.onmicrosoft.com', senhaTemporaria: 'Abc#12345678xy', linkApp: 'https://app' })
    expect(texto.startsWith('*Acesso ao App Motoristas*')).toBe(true)
    expect(texto).toContain('https://app')
    expect(texto).toContain('joao.silva@betinhos.onmicrosoft.com')
    expect(texto).toContain('Abc#12345678xy')
    expect(texto).toContain('entre com o e-mail e a senha')
    expect(texto).toContain('5 minutos')
  })

  it('whatsappComMensagem codifica o texto', () => {
    expect(whatsappComMensagem('(12) 99123-4567', 'oi & tchau')).toBe('https://wa.me/5512991234567?text=oi%20%26%20tchau')
    expect(whatsappComMensagem('123', 'x')).toBeNull()
  })

  it('mock cadastra, aplica sufixo quando repete e simula erro pelo nome', async () => {
    const src = createAcessoSource({ mode: 'mock' })
    const a = await src.cadastrar({ nomeCompleto: 'Ana Lima', celular: '11988887777', tipoVinculo: 1 })
    expect(a.emailMicrosoft).toBe('ana.lima@betinhos.onmicrosoft.com')
    expect(a.senhaTemporaria).toHaveLength(14)
    expect(a.etapas.map((e) => e.estado)).toContain('feita')
    const b = await src.cadastrar({ nomeCompleto: 'Ana Lima', celular: '11988887777', tipoVinculo: 1 })
    expect(b.emailMicrosoft).toBe('ana.lima2@betinhos.onmicrosoft.com')
    await expect(src.cadastrar({ nomeCompleto: 'Erro Graph', celular: '11988887777', tipoVinculo: 1 })).rejects.toMatchObject({ codigo: 'GRAPH_INDISPONIVEL' })
    await expect(src.cadastrar({ nomeCompleto: 'Sem Licenca', celular: '11988887777', tipoVinculo: 1 })).rejects.toMatchObject({ codigo: 'SEM_LICENCA_DISPONIVEL' })
  })

  it('mock para em HOMONIMO_ENCONTRADO sem ficha nem criarNovo e lista os parecidos', async () => {
    const src = createAcessoSource({ mode: 'mock' })
    await expect(src.cadastrar({ nomeCompleto: 'Maria Souza', celular: '(12) 99123-4567', tipoVinculo: 1 })).rejects.toMatchObject({ codigo: 'HOMONIMO_ENCONTRADO' })
    expect((await src.parecidos({ nome: 'carlos alberto  teste', celular: '' })).map((p) => [p.id, p.temAcesso])).toEqual([['m1', true]])
    expect((await src.cadastrar({ nomeCompleto: 'Maria Souza', celular: '12991234567', tipoVinculo: 1, criarNovo: true })).emailMicrosoft).toBe('maria.souza@betinhos.onmicrosoft.com')
  })

  it('mock encerra só com o primeiro nome certo', async () => {
    const src = createAcessoSource({ mode: 'mock' })
    await expect(src.encerrar('m1', 'Errado')).rejects.toMatchObject({ codigo: 'CONFIRMACAO_INVALIDA' })
    const etapas = await src.encerrar('m1', 'Carlos')
    expect(etapas.find((e) => e.etapa === 'conta')?.estado).toBe('feita')
    // Encerrar mexe só no acesso: não há etapa de funcionário (status/demissão).
    expect(etapas.some((e) => e.etapa === 'funcionario')).toBe(false)
  })

  it('mock reativa a funcionária com acesso encerrado e devolve senha nova', async () => {
    const src = createAcessoSource({ mode: 'mock' })
    const r = await src.reativar('m9')
    expect(r.emailMicrosoft).toBe('joana.teste@betinhos.onmicrosoft.com')
    expect(r.senhaTemporaria).toHaveLength(14)
    expect(r.etapas.find((e) => e.etapa === 'senha')?.estado).toBe('feita')
    await expect(src.reativar('m7')).rejects.toMatchObject({ codigo: 'FUNCIONARIO_SEM_EMAIL' })
  })

  it('dataverse chama as Custom APIs com os nomes de parâmetro do plugin', async () => {
    const calls: { path: string; body: unknown }[] = []
    const client = { request: async (path: string, init: { body: string }) => { calls.push({ path, body: JSON.parse(init.body) }); return path.includes('Cadastrar') || path.includes('Reativar') ? { EmailMicrosoft: 'a@b', SenhaTemporaria: 's', FuncionarioId: 'f', LinkApp: 'l', Etapas: '[]' } : { Etapas: '[{"etapa":"conta","estado":"feita","detalhe":""}]' } } }
    const src = createAcessoSource({ mode: 'dataverse', client } as never)
    const r = await src.cadastrar({ nomeCompleto: 'A B', celular: '12991234567', tipoVinculo: 1, funcionarioId: 'F1' })
    expect(calls[0]).toEqual({ path: 'cr40f_CadastrarAcessoMotorista', body: { NomeCompleto: 'A B', Celular: '12991234567', TipoVinculo: 1, FuncionarioId: 'F1' } })
    expect(r).toEqual({ emailMicrosoft: 'a@b', senhaTemporaria: 's', funcionarioId: 'f', linkApp: 'l', etapas: [] })
    await src.encerrar('F1', 'Ana')
    expect(calls[1]).toEqual({ path: 'cr40f_EncerrarAcessoMotorista', body: { FuncionarioId: 'F1', Confirmacao: 'Ana' } })
    expect(await src.reativar('F1')).toEqual({ emailMicrosoft: 'a@b', senhaTemporaria: 's', linkApp: 'l', etapas: [] })
    expect(calls[2]).toEqual({ path: 'cr40f_ReativarAcessoMotorista', body: { FuncionarioId: 'F1' } })
  })

  it('dataverse envia Cpf e CriarNovo e confere parecidos em todos os funcionários', async () => {
    const calls: { path: string; body?: unknown }[] = []
    const client = {
      request: async (path: string, init: { body: string }) => { calls.push({ path, body: JSON.parse(init.body) }); return { EmailMicrosoft: 'a@b', SenhaTemporaria: 's', FuncionarioId: 'f', LinkApp: 'l', Etapas: '[]' } },
      getAll: async (path: string) => { calls.push({ path }); return path.startsWith('systemusers') ? [{ internalemailaddress: 'Ana@B' }] : [{ cr40f_funcionariosid: 'x', cr40f_nomecompleto: 'Ána  Lima', cr40f_telefonepessoal: null, cr40f_funcao: 202410001, cr40f_status: 1, cr40f_emailmicrosoft: 'ana@b' }] },
    }
    const src = createAcessoSource({ mode: 'dataverse', client } as never)
    await src.cadastrar({ nomeCompleto: 'A B', celular: '12991234567', tipoVinculo: 1, cpf: '52998224725', criarNovo: true })
    expect(calls[0].body).toEqual({ NomeCompleto: 'A B', Celular: '12991234567', TipoVinculo: 1, Cpf: '52998224725', CriarNovo: true })
    expect(await src.parecidos({ nome: 'ana lima', celular: '' })).toEqual([expect.objectContaining({ id: 'x', funcao: 'Administrativo', status: 'Desligado', temAcesso: true })])
    expect(calls[1].path).not.toContain('$filter')   // qualquer função e status
  })

  it('parseAcessoError lê só o primeiro array de etapas mesmo com texto e colchetes do Dataverse depois', () => {
    const msg = 'GRAPH_INDISPONIVEL: falha | etapas=[{"etapa":"usuario","estado":"feita","detalhe":"criado [ok]"},{"etapa":"licenca","estado":"erro","detalhe":"503"}]\r\n[Cr40f.Acesso.Plugin: Cr40f.Acesso.Plugin.CadastrarAcessoMotoristaPlugin]\r\n[abc: Cr40f.Acesso: cadastrar acesso]'
    const erro = parseAcessoError(new Error(msg))
    expect(erro.codigo).toBe('GRAPH_INDISPONIVEL')
    expect(erro.etapas).toEqual([{ etapa: 'usuario', estado: 'feita', detalhe: 'criado [ok]' }, { etapa: 'licenca', estado: 'erro', detalhe: '503' }])
  })

  it('ACESSO_ENCERRADO aponta para Reativar; CONTA_NAO_EXISTE e SEM_PERMISSAO_SENHA têm mensagem própria', () => {
    expect(parseAcessoError(new Error('ACESSO_ENCERRADO: x | etapas=[]')).message).toBe('Acesso encerrado antes. Use "Reativar acesso" na ficha do funcionário.')
    expect(parseAcessoError(new Error('CONTA_NAO_EXISTE: x')).message).toBe('A conta Microsoft não existe mais; cadastre o acesso de novo.')
    expect(parseAcessoError(new Error('SEM_PERMISSAO_SENHA: x')).message).toBe('Falta a permissão User-PasswordProfile.ReadWrite.All no app do Graph.')
  })
})
