// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { ResolvedLinkColumn } from '../../../app/extraColumns'
import { addExtraLinks, extraColumn, fromConfigKey, toConfigKey } from './extraLinks'
import { linkEntities } from './fetch'

const motorista = { nav: 'cr40f_motorista', attribute: 'cr40f_motorista', target: 'cr40f_funcionarios', targetId: 'cr40f_funcionariosid' }
const veiculo = { nav: 'cr40f_veiculo', attribute: 'cr40f_veiculo', target: 'cr40f_veiculos', targetId: 'cr40f_veiculosid' }
const tel: ResolvedLinkColumn = { key: 'x:cr40f_motorista/cr40f_telefone', label: 'Motorista › Telefone', links: [motorista], attr: { name: 'cr40f_telefone', label: 'Telefone', kind: 'text' } }
const placa: ResolvedLinkColumn = { key: 'x:cr40f_motorista/cr40f_veiculo/cr40f_placa', label: 'Motorista › Veículo › Placa', links: [motorista, veiculo], attr: { name: 'cr40f_placa', label: 'Placa', kind: 'text' } }
const FETCH = '<fetch><entity name="cr40f_reservadeveculos"><attribute name="cr40f_name" /></entity></fetch>'

describe('extraLinks', () => {
  it('cria link-entity outer aninhado, reaproveita o do mesmo alias e não duplica atributo', () => {
    const once = addExtraLinks(FETCH, [tel, placa])
    const twice = addExtraLinks(once, [tel, placa])
    expect(twice).toBe(once)
    expect(linkEntities(once)).toEqual([{ alias: 'x__cr40f_motorista', name: 'cr40f_funcionarios' }, { alias: 'x__cr40f_motorista__cr40f_veiculo', name: 'cr40f_veiculos' }])
    expect(once).toContain('<link-entity name="cr40f_funcionarios" from="cr40f_funcionariosid" to="cr40f_motorista" alias="x__cr40f_motorista" link-type="outer"><attribute name="cr40f_telefone"/><link-entity name="cr40f_veiculos" from="cr40f_veiculosid" to="cr40f_veiculo" alias="x__cr40f_motorista__cr40f_veiculo" link-type="outer"><attribute name="cr40f_placa"/></link-entity></link-entity>')
  })

  it('coluna e chaves vão e voltam entre x: e alias.atributo', () => {
    expect(extraColumn(placa)).toEqual({ key: 'x__cr40f_motorista__cr40f_veiculo.cr40f_placa', attribute: 'cr40f_placa', alias: 'x__cr40f_motorista__cr40f_veiculo', entity: null, width: 160, label: 'Motorista › Veículo › Placa' })
    expect(toConfigKey('x__cr40f_motorista__cr40f_veiculo.cr40f_placa')).toBe(placa.key)
    expect(fromConfigKey(placa.key)).toBe('x__cr40f_motorista__cr40f_veiculo.cr40f_placa')
    expect(toConfigKey('cliente.cr40f_name')).toBe('cliente.cr40f_name')
    expect(fromConfigKey('cr40f_name')).toBe('cr40f_name')
  })
})
