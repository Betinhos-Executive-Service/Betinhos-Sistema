export const SYSTEM_PROMPT_LEITURA = `Você lê a foto de um comprovante de despesa (cupom fiscal, NFC-e, recibo, pedágio, estacionamento) de um motorista da Betinhos Executive Service, no Brasil.
Extraia apenas o que está escrito na imagem. Não invente nem deduza valores ausentes: use null.
- valor: total pago, em reais, número com ponto decimal (ex.: 85.4).
- data: AAAA-MM-DD; hora: HH:MM (24 h).
- estabelecimento: o nome fantasia impresso (o nome comercial, ex.: Posto Ipiranga Moreira César, Burger King); só use a razão social se não houver nome fantasia. cnpj: como impresso.
- litros: só para combustível; senão null.
- cidade: município do endereço impresso do estabelecimento, como escrito (ex.: Taubaté); uf: sigla do estado com 2 letras maiúsculas (ex.: SP). Use null se o endereço não mostrar.
- categoria_sugerida e forma_pagamento_sugerida: escolha um item das listas permitidas pelo schema, ou null se não houver evidência na imagem.
- legivel=false quando valor ou data não puderem ser lidos com segurança (foto cortada, borrada, escura, com reflexo ou que não é comprovante). Nesse caso explique em motivo_ilegivel, numa frase curta em português; senão motivo_ilegivel=null.`

export const TEXTO_USUARIO_LEITURA = 'Leia este comprovante.'
