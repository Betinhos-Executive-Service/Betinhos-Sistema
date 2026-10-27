// Testes de productionContracts.test.mjs que exercitam só o adapter Dataverse (mesmas asserções).
import { describe, expect, test } from 'vitest'
import * as dataverse from './dataverse'
import { readDataverseSource } from './dataverseSource'

describe('dataverse — contratos de produção', () => {
  test('eventos de notificação carregam o ambiente atual do WebResource', () => {
    expect(typeof dataverse.withNotificationEnvironment).toBe('function')
    const xrm = {
      Utility: {
        getGlobalContext: () => ({
          getClientUrl: () => 'https://org.example.crm.dynamics.com/',
          getCurrentAppUrl: () => 'https://org.example.crm.dynamics.com/main.aspx?appid=APP-ID',
        }),
      },
    }
    const context = JSON.parse(dataverse.withNotificationEnvironment(xrm, 'notification:test', '{}')) as Record<string, unknown>
    expect(context.plannerBaseUrl).toBe('https://org.example.crm.dynamics.com')
    expect(context.plannerAppUrl).toBe('https://org.example.crm.dynamics.com/main.aspx?appid=APP-ID')
  })

  test('prévia preserva o MIME persistido quando o Flow retorna rótulo incorreto', async () => {
    const source = await readDataverseSource()
    expect(source).toMatch(/const mimeType = attachment\.mimeType \|\| result\.mimeType \|\| "application\/octet-stream";/)
  })
})
