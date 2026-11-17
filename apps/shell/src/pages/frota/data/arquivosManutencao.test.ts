// apps/shell/src/pages/frota/data/arquivosManutencao.test.ts
import { describe, expect, it } from 'vitest'
import { ACCEPT_FOTO, ACCEPT_NOTA, carimboDeEnvio, exigirFormato, exigirSucessoDoFlow, extensaoDe, linkDoFlow, nomeArquivoEnvio, pastaDespesa, pastaManutencao, segmentoPasta, tipoFoto } from './arquivosManutencao'

describe('arquivos da manutenção', () => {
  it('mesmas pastas do App: Manutenções/[DEV/]<modelo - placa>/<código> e Despesas/[DEV/]<nome>', () => {
    expect(pastaManutencao('DEV', 'Corolla', 'ABC1D23', 'MAN-0042')).toBe('Manutenções/DEV/Corolla - ABC1D23/MAN-0042')
    expect(pastaManutencao('PROD', null, ' ', '')).toBe('Manutenções/Sem modelo - Sem placa/Sem ID')
    expect(pastaDespesa('DEV', 'Manutenção ABC1D23')).toBe('Despesas/DEV/Manutenção ABC1D23')
    expect(pastaDespesa('PROD', '')).toBe('Despesas/Sem nome')
  })

  it('tira do caminho o que o OneDrive recusa', () => {
    expect(segmentoPasta(' a/b:c*d?. ', 'x')).toBe('a-b-c-d-')
    expect(segmentoPasta('', 'padrão')).toBe('padrão')
  })

  it('extensão pelo tipo; sem tipo conhecido, pelo nome', () => {
    expect(extensaoDe({ type: 'image/jpeg', name: 'x' })).toBe('jpg')
    expect(extensaoDe({ type: 'application/pdf', name: 'nota' })).toBe('pdf')
    expect(extensaoDe({ type: '', name: 'Nota.PNG' })).toBe('png')
    expect(extensaoDe({ type: '', name: 'sem-extensao' })).toBe('bin')
  })

  it('tipo da foto igual ao do App', () => {
    expect(tipoFoto('NOTA_FISCAL', 1)).toBe('NOTAFISCAL')
    expect(tipoFoto('NOTA_FISCAL', 2)).toBe('NOTAFISCAL_2')
    expect(tipoFoto('POS_MANUTENCAO', 3)).toBe('FOTO3')
  })

  it('lê o link nas chaves que o App aceita, inclusive aninhado e no body em texto', () => {
    expect(linkDoFlow({ shareLink: 'https://1drv.ms/a' })).toBe('https://1drv.ms/a')
    expect(linkDoFlow({ link: { webUrl: 'https://1drv.ms/b' } })).toBe('https://1drv.ms/b')
    expect(linkDoFlow({ body: JSON.stringify({ url: 'https://1drv.ms/c' }) })).toBe('https://1drv.ms/c')
    expect(linkDoFlow({ link: 'não é link' })).toBe('')
    expect(linkDoFlow(null)).toBe('')
  })

  it('status de falha do Flow vira erro com a mensagem dele; sem status ou com sucesso passa', () => {
    expect(() => exigirSucessoDoFlow({ status: 'Erro', mensagem: 'Pasta sem permissão' })).toThrow('Pasta sem permissão')
    expect(() => exigirSucessoDoFlow({ status: 'Sucesso' })).not.toThrow()
    expect(() => exigirSucessoDoFlow({ shareLink: 'https://1drv.ms/a' })).not.toThrow()
    expect(() => exigirSucessoDoFlow({ status: 'Sucésso' })).not.toThrow() // acento é ignorado
  })

  it('erro do flow como objeto vira a mensagem dele, nunca [object Object]', () => {
    expect(() => exigirSucessoDoFlow({ status: 'Erro', error: { message: 'Pasta sem permissão' } })).toThrow('Pasta sem permissão')
    expect(() => exigirSucessoDoFlow({ status: 'Erro', erro: { mensagem: 'x', message: 'Sem espaço' } })).toThrow('Sem espaço')
    expect(() => exigirSucessoDoFlow({ status: 'Erro', error: { code: 500 } })).toThrow('O Flow de arquivos respondeu Erro')
  })

  it('formatos aceitos: foto é PNG, JPEG ou WEBP; nota também aceita PDF; sem tipo, vale a extensão', () => {
    const f = (name: string, type: string) => ({ name, type })
    expect(() => exigirFormato(f('a.jpg', 'image/jpeg'), 'foto')).not.toThrow()
    expect(() => exigirFormato(f('a.PNG', ''), 'foto')).not.toThrow()
    expect(() => exigirFormato(f('a.webp', 'image/webp'), 'nota')).not.toThrow()
    expect(() => exigirFormato(f('nf.pdf', 'application/pdf'), 'nota')).not.toThrow()
    expect(() => exigirFormato(f('nf.pdf', ''), 'nota')).not.toThrow()
    expect(() => exigirFormato(f('nf.pdf', 'application/pdf'), 'foto')).toThrow('nf.pdf: formato não aceito (use JPG, PNG ou WEBP)')
    expect(() => exigirFormato(f('a.heic', 'image/heic'), 'nota')).toThrow('a.heic: formato não aceito (use JPG, PNG, WEBP ou PDF)')
    expect(() => exigirFormato(f('a.exe', 'application/octet-stream'), 'nota')).toThrow('formato não aceito')
    expect(() => exigirFormato(f('sem-extensao', ''), 'foto')).toThrow('formato não aceito')
    expect(() => exigirFormato(f('a.jpg', 'application/pdf'), 'foto')).toThrow('formato não aceito') // o tipo declarado manda
  })

  it('as constantes de accept do Upload saem da mesma lista', () => {
    expect(ACCEPT_FOTO).toBe('image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp')
    expect(ACCEPT_NOTA).toBe('image/png,image/jpeg,image/webp,application/pdf,.png,.jpg,.jpeg,.webp,.pdf')
  })

  it('nome do arquivo no OneDrive leva data e hora de São Paulo, para o reenvio não colidir com o anterior', () => {
    expect(carimboDeEnvio(new Date('2026-11-17T13:00:00Z'))).toBe('20261117-100000')
    expect(carimboDeEnvio(new Date('2026-11-17T02:30:05Z'))).toBe('20261116-233005') // ainda é o dia anterior em São Paulo
    expect(nomeArquivoEnvio('nota-fiscal-1', 'jpg', new Date('2026-11-17T13:00:00Z'))).toBe('nota-fiscal-1-20261117-100000.jpg')
  })
})
