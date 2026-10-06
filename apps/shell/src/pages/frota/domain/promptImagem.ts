import type { Veiculo } from '../data/types'

export function normalizarPlaca(placa: string) {
  return placa.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Campos que faltam para montar o prompt; vazio = pronto. */
export function faltasPrompt(veiculo: Veiculo) {
  const faltas: string[] = []
  if (normalizarPlaca(veiculo.placa).length !== 7) faltas.push('placa')
  if (!veiculo.marca) faltas.push('marca')
  if (!veiculo.modelo) faltas.push('modelo')
  if (!veiculo.anoModelo) faltas.push('ano do modelo')
  if (!veiculo.cor) faltas.push('cor')
  return faltas
}

/** Adaptado do prompt de foto de veículo do Auto Prime. */
export function buildPromptImagem(veiculo: Veiculo) {
  const brand = veiculo.marca ?? ''
  const model = veiculo.modelo ?? ''
  const year = String(veiculo.anoModelo ?? '')
  const color = veiculo.cor ?? ''
  const plate = normalizarPlaca(veiculo.placa)
  return `INSTRUÇÃO TÉCNICA OBRIGATÓRIA
Use a ferramenta de geração ou edição de imagem com background="transparent" e output_format="png".
O arquivo final deve possuir canal alpha real, com transparência técnica verdadeira.
Não represente transparência visualmente.
Não desenhe padrão quadriculado, checkerboard, grade, textura ou fundo simulado.
Se a ferramenta não conseguir produzir canal alpha real, não substitua a transparência por quadriculado: gere o veículo sobre fundo branco sólido (#FFFFFF), sem textura, gradiente ou objetos, e informe que a remoção de fundo deverá ser feita em uma etapa própria.

A imagem anexada pelo usuário é uma foto real do veículo que deve ser transformado. Ela é a única imagem de referência fornecida e deve ser usada exclusivamente para identificar o veículo real, seu modelo, sua cor e seus detalhes visuais. Não existe uma imagem-base anexada.

Gere uma única imagem final, fotorrealista e profissional do mesmo veículo, reorganizado na composição descrita neste prompt.

IDENTIFICAÇÃO DO VEÍCULO
- Marca: ${brand}
- Modelo: ${model}
- Ano: ${year}
- Cor: ${color}
- Placa real: ${plate}

PLACA MERCOSUL — REPRODUÇÃO OBRIGATÓRIA
A placa dianteira deve aparecer instalada no suporte original do para-choque, totalmente visível e legível. Reproduza exatamente os sete caracteres "${plate}", na mesma ordem, sem trocar, omitir, duplicar, espelhar ou inventar letras e números.
Use uma placa brasileira no padrão Mercosul extremamente realista: formato retangular branco, faixa superior azul, proporções oficiais, caracteres pretos com tipografia compatível, material refletivo e acabamento fotográfico. A perspectiva, os reflexos, a nitidez, a iluminação e a fixação devem acompanhar naturalmente o para-choque. A placa deve parecer parte física do carro fotografado, nunca texto sobreposto, adesivo, render gráfico ou marca d'água. Não oculte, desfoque ou deixe nenhum caractere ilegível.

TÍTULO DESTA CONVERSA
Defina o nome deste chat exatamente como: Foto ${model} ${year} ${color}.
Use o nome completo do modelo informado, incluindo versão, motorização ou acabamento quando essas informações já fizerem parte do campo Modelo. Não acrescente a marca ao título e não invente informações ausentes.

Apresente o veículo da foto real em uma composição padronizada de catálogo: o carro deve estar obrigatoriamente de frente, com a dianteira claramente visível e predominante, em vista dianteira de três quartos, levemente de lado e voltado para a esquerda, com a roda dianteira esterçada suavemente para criar sensação de movimento. Nunca mostre o veículo de costas nem use a traseira como face principal. Essa posição, iluminação, sombra e enquadramento devem ser criados a partir das instruções textuais abaixo, e não copiados de uma segunda imagem.

PRESERVAÇÃO DA IDENTIDADE
Preserve rigorosamente a identidade e as características reconhecíveis do veículo informado e da foto real anexada: marca, modelo, ano aparente, desenho da carroceria, proporções, formato do capô, teto, portas, janelas, retrovisores, grade, para-choques, faróis, lanternas, maçanetas, rodas, pneus, distância entre eixos e detalhes externos visíveis. As rodas devem ser exatamente as rodas presentes na foto real: mesmo desenho, acabamento, número de raios, formato, tamanho aparente, pneus e proporções. Preserve a cor ${color} com aparência realista, brilho automotivo natural e variações sutis de reflexo.

Use o modelo e o ano informados para evitar gerar um veículo genérico, de outra geração ou de outra marca. Não misture elementos de outros modelos. Não transforme o veículo em outra versão, SUV, sedan, hatch, perua ou carroceria diferente da foto real anexada. Não invente acessórios, aerofólio, frisos, rack, teto solar, rodas esportivas ou qualquer outro item que não esteja presente na foto real.

COMPOSIÇÃO E POSIÇÃO
- veículo inteiro visível, sem cortar rodas, teto, retrovisores ou para-choques;
- vista dianteira de três quartos, com a frente claramente visível e predominante, levemente voltada para a esquerda;
- câmera na altura aproximada dos retrovisores;
- perspectiva natural, sem lente grande-angular exagerada;
- roda dianteira levemente esterçada apenas na orientação, mantendo exatamente o desenho, acabamento, número de raios, tamanho aparente, pneu e proporções das rodas presentes na foto real;
- veículo centralizado e ocupando aproximadamente 82% da área útil;
- margem segura e uniforme ao redor do carro;
- orientação horizontal adequada para ser usada como foto principal na lista da frota.

ILUMINAÇÃO E ACABAMENTO
Use iluminação de estúdio automotivo suave, ampla e controlada, com luz principal difusa, preenchimento equilibrado, reflexos limpos na pintura e contraste moderado. Crie uma sombra de contato discreta e realista diretamente sob os pneus, sem chão visível. Preserve a sensação de carro apoiado no espaço, sem parecer flutuando. Não use brilho artificial excessivo, contornos luminosos, neon ou estética de ilustração.

FUNDO E SAÍDA
Remova completamente o fundo e todos os objetos ao redor. Entregue somente o veículo e sua sombra de contato suave, em PNG com transparência real. Não use fundo preto, cinza, quadriculado ou cenário simulado.

RESTRIÇÕES ABSOLUTAS
- gerar apenas uma imagem final;
- não apresentar variações, mosaico ou comparação antes/depois;
- não inserir pessoas, texto, logotipo, marca d'água ou elementos gráficos;
- não alterar a cor informada;
- não trocar, redesenhar ou atualizar rodas, pneus ou acessórios visíveis;
- não criar peças inexistentes;
- não deformar portas, vidros, rodas, faróis ou carroceria;
- manter a placa dianteira presente, visível e reproduzir exatamente "${plate}" no padrão Mercosul brasileiro;
- não espelhar, desfocar, ocultar, trocar ou inventar nenhum caractere da placa;
- não cortar nenhuma parte do veículo;
- não substituir a imagem por um carro genérico de catálogo.

Resultado esperado: uma única imagem automotiva premium do mesmo veículo da foto anexada, apresentado na posição padronizada descrita no prompt, com a placa dianteira Mercosul "${plate}" perfeitamente legível e fotográfica, aparência realista, fundo transparente ou fallback branco, iluminação consistente, sombra de contato delicada e características do carro preservadas.`
}
