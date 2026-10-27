// Porte de Tela Planner/src/msalConfig.js (login Microsoft para Graph: Planner e Outlook).
// Variáveis de ambiente (iguais às do Planner): VITE_MSAL_CLIENT_ID, VITE_MSAL_TENANT_ID,
// VITE_MSAL_REDIRECT_URI, VITE_MSAL_WEBRESOURCE_REDIRECT_NAME.
import { InteractionRequiredAuthError, PublicClientApplication, type AccountInfo, type Configuration } from '@azure/msal-browser'
import { resolvePlannerRedirectUri } from './msalRedirect'

const env = import.meta.env as Record<string, string | undefined> | undefined
const clientId = String(env?.VITE_MSAL_CLIENT_ID || '').trim()
const tenantId = String(env?.VITE_MSAL_TENANT_ID || 'organizations').trim()
const appRedirect = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : 'http://localhost:5192/'
const fallbackRedirect = typeof window !== 'undefined' ? `${window.location.origin}/redirect.html` : 'http://localhost:5192/redirect.html'
const redirectResourceName = String(env?.VITE_MSAL_WEBRESOURCE_REDIRECT_NAME || 'new_TelaPlanner_redirect.html').trim()
const configuredRedirectUri = resolvePlannerRedirectUri({
  origin: typeof window !== 'undefined' ? window.location.origin : '',
  pathname: typeof window !== 'undefined' ? window.location.pathname : '',
  search: typeof window !== 'undefined' ? window.location.search : '',
  configuredRedirectUri: env?.VITE_MSAL_REDIRECT_URI,
  fallbackRedirect,
  redirectResourceName,
})

export const msalConfigured = Boolean(clientId)
export const plannerScopes = ['User.Read', 'Tasks.Read', 'User.ReadBasic.All']
export const mailScopes = ['User.Read', 'Mail.ReadWrite']

export const msalConfig = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: configuredRedirectUri,
    postLogoutRedirectUri: appRedirect,
  },
  system: {
    // Falha rápido quando o popup não consegue devolver a resposta ao app.
    popupBridgeTimeout: 15000,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
}

export const msalInstance: PublicClientApplication | null = msalConfigured ? new PublicClientApplication(msalConfig as Configuration) : null

let initialized = false
let interactionPromise: Promise<unknown> | null = null

function runInteraction<T>(action: () => Promise<T>): Promise<T> {
  if (interactionPromise) return interactionPromise as Promise<T>
  const promise = Promise.resolve().then(action).finally(() => {
    interactionPromise = null
  })
  interactionPromise = promise
  return promise
}

export async function ensureMsalInitialized(): Promise<PublicClientApplication> {
  if (!msalInstance) throw new Error('Autenticação Microsoft não configurada neste ambiente.')
  if (!initialized) {
    await msalInstance.initialize()
    initialized = true
  }
  return msalInstance
}

function activeAccount(instance: PublicClientApplication): AccountInfo | null {
  return instance.getActiveAccount() || instance.getAllAccounts()[0] || null
}

export function getRedirectBridgeStatus(): { valid: boolean; expectedOrigin: string } {
  if (typeof window === 'undefined') return { valid: true, expectedOrigin: '' }

  try {
    const expectedOrigin = new URL(msalConfig.auth.redirectUri, window.location.origin).origin
    return { valid: expectedOrigin === window.location.origin, expectedOrigin }
  } catch {
    return { valid: false, expectedOrigin: '' }
  }
}

function assertRedirectBridgeOrigin(): void {
  const redirectStatus = getRedirectBridgeStatus()
  if (redirectStatus.valid) return

  const error = new Error(
    `O app está aberto em ${window.location.origin}, mas o retorno Microsoft está configurado para ${redirectStatus.expectedOrigin}. Abra o app no endereço cadastrado no Microsoft Entra ID.`,
  ) as Error & { errorCode?: string }
  error.errorCode = 'redirect_bridge_origin_mismatch'
  throw error
}

export async function loginMicrosoft(): Promise<AccountInfo | null> {
  assertRedirectBridgeOrigin()
  const instance = await ensureMsalInitialized()
  return runInteraction(async () => {
    const response = await instance.loginPopup({
      scopes: plannerScopes,
      redirectUri: msalConfig.auth.redirectUri,
      prompt: 'select_account',
      // O app controla uma única interação; isso limpa um flag órfão deixado por popup fechado.
      overrideInteractionInProgress: true,
    })
    if (response.account) instance.setActiveAccount(response.account)
    return response.account || activeAccount(instance)
  })
}

async function acquireToken(scopes: string[]): Promise<string> {
  assertRedirectBridgeOrigin()
  const instance = await ensureMsalInitialized()
  let account = activeAccount(instance)
  if (!account) account = await loginMicrosoft()
  try {
    const response = await instance.acquireTokenSilent({ account: account ?? undefined, scopes })
    return response.accessToken
  } catch (error) {
    if (!(error instanceof InteractionRequiredAuthError)) throw error
    return runInteraction(async () => {
      const response = await instance.acquireTokenPopup({ account: account ?? undefined, scopes, overrideInteractionInProgress: true })
      return response.accessToken
    })
  }
}

export function acquirePlannerToken(): Promise<string> {
  return acquireToken(plannerScopes)
}

export function acquireMailToken(): Promise<string> {
  return acquireToken(mailScopes)
}

export async function logoutMicrosoft(): Promise<void> {
  const instance = await ensureMsalInitialized()
  await runInteraction(() => instance.logoutPopup({ account: activeAccount(instance) || undefined }))
}

export async function getMicrosoftAccount(): Promise<AccountInfo | null> {
  if (!msalInstance) return null
  const instance = await ensureMsalInitialized()
  return activeAccount(instance)
}
