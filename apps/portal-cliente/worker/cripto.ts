// Criptografia do Worker (Web Crypto): senha (PBKDF2-SHA256), AES-GCM para os cookies, SHA-256 de códigos.

const enc = new TextEncoder()
const dec = new TextDecoder()

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const deB64 = (texto: string) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0))
const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const deB64url = (texto: string) => deB64(texto.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (texto.length % 4)) % 4))

export const aleatorio = (n: number) => crypto.getRandomValues(new Uint8Array(n))

/** Código numérico de 6 dígitos sem viés de módulo relevante (32 bits → 10^6). */
export function novoCodigo(): string {
  const [n] = crypto.getRandomValues(new Uint32Array(1))
  return String(n % 1_000_000).padStart(6, '0')
}

export async function sha256Hex(texto: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(texto)))
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Comparação em tempo constante para textos do mesmo tamanho (hashes). */
export function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

// ---------- Senha: PBKDF2-SHA256, guardada como `pbkdf2$iteracoes$sal$hash` (base64url) ----------

/** 100 mil é o máximo que o PBKDF2 do Workers aceita. */
const ITERACOES = 100_000
/** Hash de formato válido que nunca confere: gasta o mesmo tempo de uma senha real quando o e-mail não tem senha. */
export const HASH_FALSO = `pbkdf2$${ITERACOES}$${'A'.repeat(22)}$${'A'.repeat(43)}`

async function derivar(senha: string, sal: Uint8Array<ArrayBuffer>, iteracoes: number): Promise<string> {
  const chave = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits'])
  return b64url(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes }, chave, 256)))
}

export async function hashSenha(senha: string): Promise<string> {
  const sal = aleatorio(16)
  return `pbkdf2$${ITERACOES}$${b64url(sal)}$${await derivar(senha, sal, ITERACOES)}`
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const [tipo, iter, sal, hash] = guardado.split('$')
  const n = Number(iter)
  if (tipo !== 'pbkdf2' || !Number.isInteger(n) || n < 1 || n > ITERACOES || !sal || !hash) return false
  return iguais(await derivar(senha, deB64url(sal), n), hash)
}

// ---------- AES-GCM (chave de 32 bytes em base64, vinda de secret) ----------

const chaves = new Map<string, Promise<CryptoKey>>()
function chaveAes(chaveB64: string): Promise<CryptoKey> {
  let k = chaves.get(chaveB64)
  if (!k) {
    const bruta = deB64(chaveB64)
    if (bruta.length !== 32) throw new Error('chave AES precisa de 32 bytes em base64')
    k = crypto.subtle.importKey('raw', bruta, 'AES-GCM', false, ['encrypt', 'decrypt'])
    chaves.set(chaveB64, k)
  }
  return k
}

/** `iv.cifra` em base64url. `contexto` (AAD) amarra o texto ao uso: o cookie da etapa não decifra como sessão. */
export async function cifrar(texto: string, chaveB64: string, contexto: string): Promise<string> {
  const iv = aleatorio(12)
  const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(contexto) }, await chaveAes(chaveB64), enc.encode(texto))
  return `${b64url(iv)}.${b64url(new Uint8Array(c))}`
}

/** `null` se adulterado, de outro contexto ou com outra chave. */
export async function decifrar(cifrado: string, chaveB64: string, contexto: string): Promise<string | null> {
  const [iv, c] = cifrado.split('.')
  if (!iv || !c) return null
  try {
    const p = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64url(iv), additionalData: enc.encode(contexto) }, await chaveAes(chaveB64), deB64url(c))
    return dec.decode(p)
  } catch {
    return null
  }
}
