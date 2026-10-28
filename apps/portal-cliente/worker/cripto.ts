// Criptografia do Worker (Web Crypto): TOTP (RFC 6238), AES-GCM para segredos e cookies, SHA-256 de códigos e tokens.

const enc = new TextEncoder()
const dec = new TextDecoder()

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32(bytes: Uint8Array): string {
  let bits = 0, valor = 0, saida = ''
  for (const b of bytes) {
    valor = (valor << 8) | b
    bits += 8
    while (bits >= 5) {
      saida += B32[(valor >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) saida += B32[(valor << (5 - bits)) & 31]
  return saida
}

export function deBase32(texto: string): Uint8Array<ArrayBuffer> {
  const limpo = texto.toUpperCase().replace(/[\s=]/g, '')
  const saida: number[] = []
  let bits = 0, valor = 0
  for (const c of limpo) {
    const i = B32.indexOf(c)
    if (i < 0) throw new Error('base32 inválido')
    valor = (valor << 5) | i
    bits += 5
    if (bits >= 8) {
      saida.push((valor >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(saida)
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const deB64 = (texto: string) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0))
const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const deB64url = (texto: string) => deB64(texto.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (texto.length % 4)) % 4))

export const aleatorio = (n: number) => crypto.getRandomValues(new Uint8Array(n))

/** Token opaco para cookie (dispositivo confiável). */
export const novoToken = () => b64url(aleatorio(32))

/** Código numérico de 6 dígitos sem viés de módulo relevante (32 bits → 10^6). */
export function novoCodigo(): string {
  const [n] = crypto.getRandomValues(new Uint32Array(1))
  return String(n % 1_000_000).padStart(6, '0')
}

export async function sha256Hex(texto: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(texto)))
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Comparação em tempo constante para hashes hex do mesmo tamanho. */
export function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

// ---------- TOTP (HMAC-SHA1, 6 dígitos, passo de 30 s, como Microsoft/Google Authenticator) ----------

const PASSO_S = 30

export async function totp(segredoBase32: string, contador: number): Promise<string> {
  const chave = await crypto.subtle.importKey('raw', deBase32(segredoBase32), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const msg = new DataView(new ArrayBuffer(8))
  msg.setUint32(0, Math.floor(contador / 2 ** 32))
  msg.setUint32(4, contador >>> 0)
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', chave, msg.buffer))
  const off = h[h.length - 1] & 15
  const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]
  return String(bin % 1_000_000).padStart(6, '0')
}

/** Aceita o passo atual e um antes/depois (relógio do celular adiantado ou atrasado até 30 s). */
export async function verificarTotp(segredoBase32: string, codigo: string, agoraMs: number, janela = 1): Promise<boolean> {
  if (!/^\d{6}$/.test(codigo)) return false
  const atual = Math.floor(agoraMs / 1000 / PASSO_S)
  let ok = false
  for (let d = -janela; d <= janela; d++) ok = iguais(await totp(segredoBase32, atual + d), codigo) || ok
  return ok
}

export const novoSegredoTotp = () => base32(aleatorio(20))

export function otpauthUrl(segredo: string, email: string, emissor = 'Betinhos'): string {
  const rotulo = encodeURIComponent(`${emissor}:${email}`)
  return `otpauth://totp/${rotulo}?secret=${segredo}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=6&period=${PASSO_S}`
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

/** `iv.cifra` em base64url. `contexto` (AAD) amarra o texto ao uso: um cookie não decifra como segredo TOTP. */
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
