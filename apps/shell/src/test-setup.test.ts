// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

// O test-setup troca `label.control` e `labels` do jsdom por versões rápidas: estas são as regras do HTML que elas mantêm.
afterEach(() => { document.body.innerHTML = '' })
const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector(selector) as T

describe('label.control e labels (test-setup)', () => {
  it('label envolvendo o campo aponta para o primeiro labelable de dentro', () => {
    document.body.innerHTML = '<label id="l"><span>Nome</span><input id="a"><input id="b"></label>'
    expect($<HTMLLabelElement>('#l').control).toBe($('#a'))
    expect([...$<HTMLInputElement>('#a').labels!]).toEqual([$('#l')])
    expect([...$<HTMLInputElement>('#b').labels!]).toEqual([])
  })

  it('for vale mais que o ancestral e só aponta para elemento labelable', () => {
    document.body.innerHTML = '<label id="l1" for="x"><input id="dentro"></label><button id="x">Ok</button><label id="l2" for="d">D</label><div id="d"></div><label id="l3" for="">V</label>'
    expect($<HTMLLabelElement>('#l1').control).toBe($('#x'))
    expect([...$<HTMLInputElement>('#dentro').labels!]).toEqual([])
    expect($<HTMLLabelElement>('#l2').control).toBeNull()
    expect($<HTMLLabelElement>('#l3').control).toBeNull()
  })

  it('junta os labels por for e por ancestral, na ordem do documento', () => {
    document.body.innerHTML = '<label id="depois-for" for="c">B</label><label id="pai">A <input id="c"></label><label id="outro" for="c">C</label>'
    expect([...$<HTMLInputElement>('#c').labels!].map((l) => l.id)).toEqual(['depois-for', 'pai', 'outro'])
  })

  it('com id repetido o for usa o primeiro elemento do documento', () => {
    document.body.innerHTML = '<label id="l" for="r">R</label><span id="r"></span><input id="r">'
    expect($<HTMLLabelElement>('#l').control).toBeNull()
  })

  it('input hidden não é labelable', () => {
    document.body.innerHTML = '<label id="l"><input type="hidden" id="h"><input id="t"></label>'
    expect($<HTMLLabelElement>('#l').control).toBe($('#t'))
    expect($<HTMLInputElement>('#h').labels).toBeNull()
  })
})
