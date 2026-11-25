// Identidade do cliente no portal (logo, cor e nome), cadastrada pelo Renan na tela "Portal do cliente" do shell.
// Usado pelo Worker (o que sai da API) e pelas telas (contraste da cor).

/** O que a API devolve de um cliente: nome de exibição, cor (#RRGGBB) e endereço do logo (quando há). */
export type Marca = { nome: string; cor?: string; logoUrl?: string }

/** Domínios de e-mail abertos ao público: nunca revelam a marca de um cliente (espelho de `DOMINIOS_PUBLICOS` do shell). */
export const DOMINIOS_PUBLICOS_MARCA = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br', 'icloud.com', 'live.com', 'uol.com.br', 'bol.com.br', 'terra.com.br']

const HEX = /^#[0-9a-f]{6}$/i

export const ehCor = (v: unknown): v is string => typeof v === 'string' && HEX.test(v)

/** Chave do link `?c=`: nome do cliente sem acento, em minúsculas, com `-` entre as palavras (Latasa → `latasa`). */
export const chaveDaMarca = (nomeCliente: string) =>
  nomeCliente.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const canal = (v: number) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** Contraste WCAG da cor com branco (1 a 21). */
export function contrasteComBranco(cor: string): number {
  const n = parseInt(cor.slice(1), 16)
  const luz = 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255)
  return 1.05 / (luz + 0.05)
}

const CONTRASTE_MINIMO = 4.5

/** Cor da marca para faixa e botão, só se o texto branco por cima for legível; senão `undefined` e vale a cor padrão da Betinhos. */
export const corLegivel = (cor: string | undefined): string | undefined =>
  ehCor(cor) && contrasteComBranco(cor) >= CONTRASTE_MINIMO ? cor.toLowerCase() : undefined

/** Variáveis CSS da cor da marca (botão principal e faixa do topo); sem cor legível, `undefined` e valem as da Betinhos. */
export function estiloDaMarca(cor: string | undefined): Record<string, string> | undefined {
  const legivel = corLegivel(cor)
  return legivel ? { '--bt-color-brand': legivel, '--bt-color-brand-hover': `color-mix(in srgb, ${legivel} 85%, black)`, '--pc-marca': legivel } : undefined
}
