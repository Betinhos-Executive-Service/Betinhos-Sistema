// Identidade do cliente no portal (o logo), cadastrada pelo Renan na tela "Portal do cliente" do shell.
// Usado pelo Worker (o que sai da API) e pelas telas.

/** O que a API devolve de um cliente com logo: nome do cadastro e endereço do logo. */
export type Marca = { nome: string; logoUrl: string }

/** Domínios de e-mail abertos ao público: nunca revelam a marca de um cliente (espelho de `DOMINIOS_PUBLICOS` do shell). */
export const DOMINIOS_PUBLICOS_MARCA = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br', 'icloud.com', 'live.com', 'uol.com.br', 'bol.com.br', 'terra.com.br']

/** Chave do link `?c=`: nome do cliente sem acento, em minúsculas, com `-` entre as palavras (Latasa → `latasa`). */
export const chaveDaMarca = (nomeCliente: string) =>
  nomeCliente.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
