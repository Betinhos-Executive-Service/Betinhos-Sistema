// Porte de Tela Planner/tests/dataverseEntitySets.test.mjs (mesmas asserções).
import { describe, expect, test } from 'vitest'
import { entitySetName } from './dataverse'

describe('dataverseEntitySets', () => {
  test('resolve os Entity Sets reais validados no metadata Dataverse', () => {
    expect(entitySetName('cr40f_pedidodecotacao')).toBe('cr40f_pedidodecotacaos')
    expect(entitySetName('cr40f_plannertarefa')).toBe('cr40f_plannertarefas')
    expect(entitySetName('cr40f_plannertarefaevento')).toBe('cr40f_plannertarefaeventos')
    expect(entitySetName('cr40f_plannertarearelacao')).toBe('cr40f_plannertarearelacaos')
    expect(entitySetName('cr40f_plannertarearesponsavel')).toBe('cr40f_plannertarearesponsavels')
    expect(entitySetName('cr40f_plannertarefaequipe')).toBe('cr40f_plannertarefaequipes')
    expect(entitySetName('cr40f_plannernotificacao')).toBe('cr40f_plannernotificacaos')
    expect(entitySetName('cr40f_plannerequipe')).toBe('cr40f_plannerequipes')
    expect(entitySetName('cr40f_plannerequipemembro')).toBe('cr40f_plannerequipemembros')
    expect(entitySetName('cr40f_plannertagpessoal')).toBe('cr40f_plannertagpessoals')
    expect(entitySetName('cr40f_plannertagpessoaltarefa')).toBe('cr40f_plannertagpessoaltarefas')
    expect(entitySetName('systemuser')).toBe('systemusers')
    expect(entitySetName('team')).toBe('teams')
  })

  test('falha fechado para tabela sem metadata validado', () => {
    expect(() => entitySetName('tabela_inventada')).toThrow(/Entity Set não mapeado/)
  })
})
