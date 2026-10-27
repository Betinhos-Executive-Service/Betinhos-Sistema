// Porte de Tela Planner/tests/microsoftIdentity.test.mjs (mesmas asserções, lendo dataverse.ts).
import { describe, expect, test } from 'vitest'
import { normalizeMicrosoftEmail } from './dataverse'
import { readDataverseSource } from './dataverseSource'

describe('microsoftIdentity', () => {
  test('normaliza e-mail Microsoft antes de procurar usuário', () => {
    expect(normalizeMicrosoftEmail('  RENAN@Betinhos.OnMicrosoft.Com  ')).toBe('renan@betinhos.onmicrosoft.com')
    expect(normalizeMicrosoftEmail(null)).toBe('')
  })

  test('vínculo automático não sobrescreve lookup e exige correspondência única ativa', async () => {
    const source = await readDataverseSource()
    expect(source).toMatch(/if \(employee\._cr40f_usuariodataverse_value\) return;/)
    expect(source).toMatch(/internalemailaddress eq '\$\{escapedEmail\}' and isdisabled eq false&\$top=2/)
    expect(source).toMatch(/if \(exactUsers\.length !== 1\)/)
    expect(source).toMatch(/bindLookup\(xrm, payload, EMPLOYEE_TABLE, "cr40f_usuariodataverse", "systemuser", userId\)/)
  })
})
