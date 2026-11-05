---
name: verificar-tour
description: "Verifica o tour guiado por capítulos do App Motoristas: abertura automática na primeira visita de cada tela, botão '?' nos cabeçalhos, 'Ver tour de novo' no Início, spotlight no elemento real, 360 px e teclado, e textos fiéis ao app. Use após mudar src/app/tour*.ts, src/components/common/TourOverlay.tsx, TourHelp.tsx, src/tour.css, os cabeçalhos (FormMenu, ServicesMenu, DetailsMenu), o link do rodapé do Início ou a integração do tour em src/App.tsx."
---
# Verificar tour guiado

## Cobre
- Código: `src/app/tour.ts` (tipos, preferência, posicionamento), `src/app/tourChapters.ts` (conteúdo: 1 capítulo por tela, 30 capítulos e ~220 passos), `src/app/tourDom.ts` (busca do elemento), `src/components/common/TourOverlay.tsx`, `TourHelp.tsx` (contexto e botão "?"), `src/tour.css`, botão "?" em `FormMenu`/`ServicesMenu`/`DetailsMenu`, link "Ver tour de novo" em `InitialScreen.tsx`, estado do tour em `src/App.tsx`, `tests/tour.test.ts`.
- Persistência: `localStorage["app-motoristas-tour-v2:<id do motorista>:<capítulo>"] = "visto"`; o capítulo coringa `*` marca todos como vistos. Só local: trocar de aparelho ou limpar o navegador faz o tour voltar (não há coluna de preferências do motorista no Dataverse).

## Como o tour escolhe o capítulo
`CHAPTER_IDS_BY_SCREEN` (em `tourChapters.ts`) mapeia a tela do app para capítulos candidatos, do mais específico (com `probe`) ao mais geral: por exemplo `comunicados` -> [`comunicado-detalhe`, `comunicados`] e `treinamentos` -> [`treinamento-detalhe`, `treinamentos`]. O primeiro cujo `probe` existe na tela vale. Abre sozinho na primeira visita (700 ms depois da carga), exceto capítulos `auto: false` (câmera, prévia da foto), que só abrem pelo "?".

## Preparar ambiente
- `node --test --experimental-strip-types tests/tour.test.ts` (não depende de `node_modules`): confere ids únicos, tamanho dos textos, que toda tela do app tem capítulo e que não há capítulo órfão.
- Dev server na porta reservada em `~/.codex/dev-ports.json`: `PORT=<porta> node scripts/dev-server.cjs --strictPort`. Conferir que `dist/` é do código atual (o watcher pode perder edições): `node scripts/build-react-singlefile.cjs --no-version`. Modo mock: motorista `localhost-driver`.
- Simular primeiro acesso: `localStorage.clear()` e recarregar. Dispensar o guia: `localStorage.setItem("app-motoristas-tour-v2:localhost-driver:*", "visto")`.

## Roteiro automatizado (preferido)
`APP_MOTORISTAS_URL=http://localhost:<porta> CHROME_PATH=<binário Chromium/Brave> node scripts/qa/verify-tour.cjs .verificacao/<data>-<branch> [capitulo1,capitulo2] [--largura=360]`
(sem `CHROME_PATH` usa o Google Chrome; sem `playwright-core` no projeto use `NODE_PATH` do cache do npx ou `npx -y -p playwright-core@1.56.1`).
Para cada capítulo: abre a tela no mock, confere a abertura automática (ou pelo "?"), que nenhum passo obrigatório foi pulado, percorre todos os passos conferindo cartão dentro da tela e sem cobrir o destaque, tira um print por passo, confere Concluir e que não volta para quem já viu. Depois, no Início: "Ver tour de novo", Tab preso no cartão, setas, Esc e foco devolvido. Rode em 375 e em `--largura=360`. Todas as linhas `OK`.
- Capítulos não exercitados no mock (`SKIP`): `comprovante` (leitura de comprovante em andamento) e `foto-previa` (foto já capturada). Verifique à mão no DEV.
- `cobranca-qr` depende do serviço mock 10240 (valor a receber).

## Conferir fatos (obrigatório ao mudar texto)
Cada afirmação em `tourChapters.ts` tem que ter evidência no código das telas (rótulos entre aspas, quando o botão aparece, obrigatoriedade, destino). Não escreva comportamento por dedução. Dois pontos que já enganaram: o termo de multa pede aceitar desconto em folha (o "nada é descontado" vale só durante a contestação) e o botão do termo é "Assinar" (não "Continuar"). Peça uma checagem independente dos capítulos alterados contra o código.

## Roteiro manual (viewport 360×740 e 375×812)
1. Primeiro acesso: o capítulo do Início abre sozinho, com 19 passos, do "Bem-vindo" ao "Pronto para começar".
2. Pular/Esc fecha e não volta; "Ver tour de novo" reabre o Início e faz os capítulos das telas voltarem a abrir.
3. Entre em Serviços: o capítulo abre sozinho; o botão "?" no cabeçalho reabre a qualquer momento (em Detalhe, Formulários e listas).
4. Em cada passo o elemento real fica destacado e o cartão não o cobre; destaque mais alto que o espaço livre é recortado acima do cartão.
5. Teclado: foco inicial em "Próximo", Tab só dentro do cartão, setas navegam, Esc fecha, foco volta a quem abriu.

## Casos de borda
- Passo sem elemento na tela (`optional`) é pulado; passo obrigatório pulado aparece em `data-tour-skipped` do `.tour-root` e reprova o roteiro.
- Nenhum passo disponível: fecha como `indisponivel`, sem marcar como visto, e não reabre em loop.
- Tour não abre sobre diálogo de escolha de veículo, andamento de envio ou envio de gasto; nem durante carga ou erro crítico.
- `localStorage` bloqueado: não lança; `hasSeenChapter` devolve `true`.

## Evidência obrigatória
- Prints `375-<capitulo>-NN-<passo>.png` e `360-...`, `resultado-375.txt` e `resultado-360.txt`; console sem erros.

## Limites
- Dataverse real e comportamento dentro do Power Apps/model-driven não são verificáveis em localhost.
