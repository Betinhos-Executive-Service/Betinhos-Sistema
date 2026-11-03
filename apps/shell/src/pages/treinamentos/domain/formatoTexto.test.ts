// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { htmlParaTexto, textoParaHtml } from './formatoTexto'

const volta = (texto: string) => { const el = document.createElement('div'); el.innerHTML = textoParaHtml(texto); return htmlParaTexto(el) }

describe('formato do texto', () => {
  it('título, lista, negrito e linhas em branco fazem a ida e volta sem perda', () => {
    const t = '# Regras\nAntes de sair\n\n- Camisa **branca**\n- Terno escuro\nFim'
    expect(volta(t)).toBe(t)
  })
  it('normaliza # sem nível extra e escapa HTML', () => {
    expect(volta('## Dois')).toBe('# Dois')
    expect(textoParaHtml('a <b> & c')).toBe('<p>a &lt;b&gt; &amp; c</p>')
  })
  it('lê o HTML que o navegador gera (div, b, nbsp)', () => {
    const el = document.createElement('div')
    el.innerHTML = '<h3>Como dirigir</h3><div>Use <b>calma</b>&nbsp;sempre</div><ul><li>um</li><li>dois</li></ul>'
    expect(htmlParaTexto(el)).toBe('# Como dirigir\nUse **calma** sempre\n- um\n- dois')
  })
})
