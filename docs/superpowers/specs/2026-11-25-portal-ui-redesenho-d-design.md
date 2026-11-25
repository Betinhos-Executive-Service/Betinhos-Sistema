# Portal de acompanhamento: redesenho "D" (25/11/2026)

Nota: `docs/specs` não existe no repositório; a spec segue o padrão de `docs/superpowers/specs`.

## Objetivo
Trocar o layout da página pública `/r/<id>` (`apps/acompanhar-motorista/web`) por uma faixa marinho com a fase da viagem e um corpo de cards espaçados, com linha do tempo de etapas. Só interface: Worker, plugins e schema não mudam.

## Decisões
- Faixa no topo: marca, seletor PT/EN/ES segmentado, "Reserva OS-x · data · Saída HH:MM", título por fase, selo dourado com minutos (só com ETA), barra de 5 segmentos e uma frase de previsão.
- Corpo em coluna única (592 px), cards sobrepondo a faixa, gap de 16 px e padding de 20 px (ajuste do Renan: mais espaço e menos ruído, como a V1). Sem emojis, pílulas só para estado, botões secundários em contorno leve; Compartilhar e Central como linhas leves.
- Ordem: passageiros sem cadastro, mapa, Seu motorista, Sua viagem, Passageiros, Compartilhar, Central 24h, rodapé.
- Linha do tempo: confirmada, motorista definido, aguardando a saída (agendado), a caminho, no local, em viagem (com paradas), chegada; cada etapa com endereço e horário; atual em dourado, feitas em verde, futuras em cinza. O sino fica na etapa atual (em definição, no card do motorista).
- Aeroporto (embarque casa com aeroporto, siglas ou terminal): saudação em destaque no topo da faixa (dourado, 22 px, peso 800; "Seja bem-vindo", "Welcome" ou "Bienvenido" conforme o idioma, sem linha secundária e sem citar o país), em todas as fases antes do concluído; em no local, "<nome> espera você no desembarque". Sem prometer placa com nome.
- i18n em PT/EN/ES para todo texto novo (`src/idiomas.mjs`).

## Estados
Em definição, agendado, a caminho (chegando), no local, em viagem (com paradas), sem rastreio (linha curta e nota), concluído (avaliação no topo, sem mapa).

## Fora do escopo
Código de embarque, "já te atendeu N vezes", itens a bordo, Estou descendo/Vou atrasar, voo, frases prontas, agenda de próximas reservas. O layout de 2 colunas do desktop deixa de existir.

## Verificação
`npx tsc --noEmit`, `pnpm test` (node:test e vitest), prints a 390x844 @2x de cada estado comparados com a V1, console sem erros.
