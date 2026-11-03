import { describe, expect, it, vi } from 'vitest'
import { cleanId, createClient, dataverseErrorMessage, DataverseError } from './client'
import { chunk, odataString } from './format'

describe('cleanId', () => {
  it('tira chaves e usa minúsculas', () => {
    expect(cleanId('{0F8FAD5B-D9CB-469F-A165-70867728950E}')).toBe('0f8fad5b-d9cb-469f-a165-70867728950e')
  })
})

describe('odataString', () => {
  it('duplica aspas simples e preserva o resto', () => {
    expect(odataString("O'Brien & d'Ávila")).toBe("O''Brien & d''Ávila")
    expect(odataString('')).toBe('')
  })
})

describe('chunk', () => {
  it('rejeita tamanho menor que 1', () => {
    expect(() => chunk([1], 0)).toThrow('size deve ser >= 1')
    expect(() => chunk([1], -3)).toThrow()
  })
  it('tamanho maior que a lista devolve um bloco só, sem alterar a entrada', () => {
    const items = [1, 2]
    expect(chunk(items, 10)).toEqual([[1, 2]])
    expect(items).toEqual([1, 2])
  })
})

describe('dataverseErrorMessage', () => {
  it('lê o JSON padrão', () => {
    expect(dataverseErrorMessage(JSON.stringify({ error: { message: 'Falhou' } }))).toBe('Falhou')
  })
  it('JSON sem mensagem devolve undefined', () => {
    expect(dataverseErrorMessage('{}')).toBeUndefined()
    expect(dataverseErrorMessage('')).toBeUndefined()
  })
  it('extrai e decodifica a mensagem de uma resposta multipart de $batch', () => {
    const body = '--batch\r\nContent-Type: application/http\r\n\r\nHTTP/1.1 400 Bad Request\r\n\r\n{"error":{"code":"0x1","message":"Campo \\"x\\" inv\\u00e1lido"}}\r\n--batch--'
    expect(dataverseErrorMessage(body)).toBe('Campo "x" inválido')
  })
  it('texto puro sem "message" devolve undefined', () => {
    expect(dataverseErrorMessage('Internal Server Error')).toBeUndefined()
  })
})

describe('createClient: bordas', () => {
  const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init })

  it('remove barras finais da URL base', () => {
    expect(createClient('https://org.example///').apiUrl).toBe('https://org.example/api/data/v9.2')
  })

  it('envia cabeçalhos OData e só inclui Content-Type quando há corpo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ value: [] }))
    const client = createClient('https://org.example', fetchMock)
    await client.request('contas')
    const get = fetchMock.mock.calls[0][1] as { headers: Record<string, string>; credentials: string }
    expect(get.credentials).toBe('same-origin')
    expect(get.headers['OData-Version']).toBe('4.0')
    expect(get.headers['Content-Type']).toBeUndefined()

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await client.request('contas', { method: 'POST', body: '{}' })
    expect((fetchMock.mock.calls[1][1] as { headers: Record<string, string> }).headers['Content-Type']).toBe('application/json; charset=utf-8')
  })

  it('cabeçalhos do chamador têm prioridade e path absoluto não leva o prefixo da API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({}))
    await createClient('https://org.example', fetchMock).request('HTTPS://outro.example/x', { headers: { Accept: 'text/plain' } })
    expect(fetchMock.mock.calls[0][0]).toBe('HTTPS://outro.example/x')
    expect((fetchMock.mock.calls[0][1] as { headers: Record<string, string> }).headers.Accept).toBe('text/plain')
  })

  it('204 devolve undefined e multipart devolve o texto cru', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('--batch--', { status: 200, headers: { 'Content-Type': 'multipart/mixed; boundary=batch' } }))
    const client = createClient('https://org.example', fetchMock)
    expect(await client.request('a')).toBeUndefined()
    expect(await client.request('b')).toBe('--batch--')
  })

  it('erro sem corpo vira "HTTP <status>" e carrega o status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 503 }))
    const error = await createClient('https://org.example', fetchMock).request('x').catch((e) => e)
    expect(error).toBeInstanceOf(DataverseError)
    expect(error).toMatchObject({ message: 'HTTP 503', status: 503, name: 'DataverseError' })
  })

  it('create falha com mensagem clara quando o id não volta no cabeçalho', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    await expect(createClient('https://org.example', fetchMock).create('contas', {})).rejects.toThrow('o id não foi retornado')
  })

  it('create posta o JSON no entity set', async () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204, headers: { 'OData-EntityId': `https://org.example/api/data/v9.2/contas(${id})` } }))
    await createClient('https://org.example', fetchMock).create('contas', { nome: 'Ação' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://org.example/api/data/v9.2/contas')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ nome: 'Ação' })
  })

  it('remove usa DELETE no registro sem chaves', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    await createClient('https://org.example', fetchMock).remove('contas', '{ABC}')
    expect(fetchMock.mock.calls[0][0]).toBe('https://org.example/api/data/v9.2/contas(abc)')
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
  })

  it('getAll interrompe e propaga o erro se uma página falhar', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ value: [{ id: 1 }], '@odata.nextLink': 'https://org.example/next' }))
      .mockResolvedValueOnce(json({ error: { message: 'queda' } }, { status: 500 }))
    await expect(createClient('https://org.example', fetchMock).getAll('x')).rejects.toMatchObject({ message: 'queda', status: 500 })
  })
})
