import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { Tabs, tabId } from './Tabs'

const tabs = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]
const base = { tabs, value: 'a', onChange: () => {}, 'aria-label': 'Teste' }

it('sem children e sem panelId não emite aria-controls nem painel', () => {
  const html = renderToStaticMarkup(createElement(Tabs, base))
  expect(html).not.toContain('aria-controls')
  expect(html).not.toContain('role="tabpanel"')
})

it('com children liga cada aba ao painel interno', () => {
  const html = renderToStaticMarkup(createElement(Tabs, base, 'conteudo'))
  const painel = /role="tabpanel" id="([^"]+)"/.exec(html)?.[1]
  expect(painel).toBeTruthy()
  expect(html.match(new RegExp(`aria-controls="${painel}"`, 'g'))).toHaveLength(2)
})

it('com panelId aponta para o painel externo e expõe os ids das abas', () => {
  const html = renderToStaticMarkup(createElement(Tabs, { ...base, panelId: 'ext' }))
  expect(html.match(/aria-controls="ext"/g)).toHaveLength(2)
  expect(html).toContain(`id="${tabId('ext', 'a')}"`)
  expect(html).not.toContain('role="tabpanel"')
})
