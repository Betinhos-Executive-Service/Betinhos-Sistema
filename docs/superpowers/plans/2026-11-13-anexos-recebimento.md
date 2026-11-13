# Comprovantes de recebimento nas fichas (Geral, OP, Pagante)

Decidido com o Renan em 13/11/2026 (sessão de perguntas). Branch `feat/anexos-recebimento` a partir da `develop` (1913412f).

## Objetivo
O Financeiro confere os comprovantes que o motorista tirou ao receber (foto, vídeo ou PDF) sem sair da ficha do serviço, da OP ou do pagante: vê as miniaturas, abre em tela cheia, navega entre os arquivos e baixa. Na lista do Geral, sabe de relance quais serviços têm comprovante.

## Contexto
- **Código:**
  - Visualizador existente: `apps/shell/src/pages/despesas/components/Comprovantes.tsx` (`ComprovantesGaleria`, `Visualizador` em `<dialog>` empilhado no Drawer, estado na URL `?comprovante=<id>`), leitura `apps/shell/src/pages/despesas/data/arquivo.ts` (`createArquivos`: flow `new_URLFlowConsultarArquivoOneDrive`, por `driveItemId` ou pelo link, devolve blob URL, cache por sessão), tipos de prévia `apps/shell/src/pages/despesas/domain/arquivo.ts` (`mimeDoArquivo`, `tipoPrevia`: só imagem e PDF).
  - Fichas: `apps/shell/src/pages/geral/components/GeralSheet.tsx` (Sheet da linha), `apps/shell/src/pages/ops/components/OpDrawer.tsx` (`Section` em `<details>`), `apps/shell/src/pages/pagantes/components/PaganteDrawer.tsx` (`Section` com `pg-ficha__block-head`).
  - Lista do Geral: `apps/shell/src/pages/geral/components/GeralTable.tsx` (`renderCell`).
- **Reaproveitar:** a galeria e o visualizador das Despesas, extraídos para `apps/shell/src/lib/comprovantes/` e usados pelas Despesas e pelos Recebimentos. O flow de leitura das Despesas já aceita `{ link, nomeArquivo }`.
- **Dados** (confirmar na metadata do DEV antes do código, sem depender só do doc do App):
  - `cr40f_anexorecebimento_v2` (set `cr40f_anexorecebimento_v2s`): `cr40f_nome`, `cr40f_nomearquivo`, `cr40f_sharelink`, `cr40f_urlsharepoint`, `cr40f_dataenvio`, `cr40f_ordem`, `cr40f_status`, `cr40f_tipo`, `cr40f_tipomidia` (foto 100000000, vídeo 100000001), lookups `cr40f_reserva` → `cr40f_reservadeveculos` e enviado-por → `cr40f_funcionarios` (nome lógico do segundo a confirmar). **Não tem** `cr40f_driveitemid`: a leitura vai sempre pelo link.
  - OP e Pagante chegam às reservas pela OP (`_cr40f_financeiro_value` da reserva e do pagante). O anexo não tem pagante.
- **Decisões e limites:**
  - Só ver e baixar. Sem status de conferência, sem migration, sem mudar o App Motoristas.
  - No Pagante e na OP: todos os comprovantes da OP, agrupados por serviço (ID, data, destino). No Pagante, aviso "Comprovantes de todos os serviços da OP".
  - Metadados: data e hora do envio, motorista, posição ("2 de 4").
  - Miniatura de foto real, buscada quando entra na tela (`IntersectionObserver`), no máximo 4 buscas simultâneas, cache por sessão (o de `createArquivos`). PDF e vídeo com ícone.
  - Vídeo buscado só ao abrir, com progresso; falha ou arquivo acima do limite → "Abrir no SharePoint".
  - Movimento: abre crescendo da miniatura (transform/opacity, ~200 ms, ease-out), fecha em ~150 ms, troca de arquivo em crossfade curto; `prefers-reduced-motion` → só fade. Clique fora, X e Esc fecham.
  - Fora: ZIP "Baixar todos", vínculo com pagante, remover `cr40f_anexorecebimento_v2` do menu Back-End.
  - Repo público: nenhum link real (`sig=`) nem dado de passageiro em mock ou teste.
  - Despesas não pode regredir (mesma galeria, mesmos status e choices).
- **Premissas:**
  - Assumi: a ordem é `cr40f_ordem` crescente dentro do serviço, e os serviços seguem a ordem que a ficha já usa.
  - Assumi: o limite de vídeo é o que o flow aguenta devolver em base64. O valor é definido no teste no DEV (estimativa inicial de 25 MB). O tamanho só é conhecido na resposta; se o flow estourar ou demorar além do tempo, cai no "Abrir no SharePoint".
  - Assumi: a contagem da lista vem de uma consulta por página visível (ids em blocos), não de coluna calculada.

## Verificação (pronto quando todos passarem)
1. Abrir no Geral um serviço com 3 fotos e 1 vídeo → a seção "Comprovantes de recebimento" mostra 4 cartões em ordem, as fotos com miniatura real, o vídeo com ícone, e cada um com data/hora e motorista.
2. Clicar na 2ª foto → o visualizador abre a partir da miniatura, mostra "2 de 4", → e ← trocam, Esc e clique fora fecham só o visualizador (a ficha continua aberta), e a URL guarda `comprovante=<id>`.
3. Abrir o vídeo → aparece o progresso e depois o player toca dentro do sistema. Com o flow falhando, aparece "Abrir no SharePoint", que abre o `cr40f_sharelink`.
4. Abrir um PDF → aparece embutido, e baixar salva com o nome do arquivo.
5. Abrir a OP desse serviço → comprovantes de todos os serviços da OP, agrupados por serviço. No Pagante da mesma OP, os mesmos, com o aviso de que são da OP inteira.
6. Lista do Geral → o serviço com 4 comprovantes mostra o clipe com "4", e o sem comprovante não mostra nada.
7. Despesas → a galeria e o visualizador continuam iguais (testes existentes verdes, mais o print).
- **Casos de borda:**
  - Serviço sem comprovante: a seção diz "Nenhum comprovante enviado pelo motorista".
  - Anexo sem link: o cartão avisa "Arquivo ainda não está no SharePoint".
  - Falha na leitura: "Tentar de novo".
  - Falta a variável do flow no ambiente: erro claro, sem quebrar a ficha.
  - OP com 30+ serviços: só as miniaturas visíveis buscam arquivo.
  - `prefers-reduced-motion`: sem escala.
- **Como provar:**
  - `pnpm typecheck` e `pnpm test` (testes novos de domínio: agrupar por serviço, ordenar, tipo de mídia; testes de componente: lazy, visualizador, teclado).
  - Skill `verificar-shell` no mock, com prints de Geral, OP, Pagante, visualizador e Despesas.
  - `ux-audit` Rápido.
  - No Dataverse DEV com serviço real: leitura pelo flow, vídeo, PDF e contagem.
- **Fora do alcance:** o limite exato de vídeo e o tempo do flow só aparecem no DEV autenticado. A sessão cloud declara essa parte como "não verificada na nuvem".

## Plano de implementação

Cada tarefa termina com typecheck e testes da área verdes. Os commits são pequenos e em português.

### T1. Extrair a galeria compartilhada (sem mudar comportamento)
- Mover `Comprovantes.tsx`, `domain/arquivo.ts` e `data/arquivo.ts` das Despesas para `apps/shell/src/lib/comprovantes/` (`Galeria.tsx`, `Visualizador.tsx`, `arquivo.ts`, `leitura.ts`, CSS próprio com prefixo `cmp-`).
- Tipo neutro `Comprovante = { id, nome, url, driveItemId?, enviadoEm, enviadoPor, meta?, badge?, midia: 'foto' | 'video' | 'pdf' | null }`. Despesas monta o `meta` e o `badge` de status pelas choices dela, e a galeria não conhece as choices.
- Despesas passa a importar da lib. Os testes atuais das Despesas e o `arquivo.test.ts` (movido) continuam verdes, e o print das Despesas sai igual ao de antes.

### T2. Lazy, fila e vídeo na lib
- `useArquivo` ganha `ativo` (só busca quando a miniatura entra na tela, via `IntersectionObserver`) e uma fila de concorrência 4 em `leitura.ts`.
- `tipoPrevia` passa a reconhecer `video/*` (mp4, mov/quicktime, webm por extensão). Miniatura de vídeo e de PDF fica com ícone e não busca nada.
- No visualizador, o vídeo é buscado ao abrir, com progresso indeterminado e `<video controls playsInline>`. Em erro, ou se a leitura passar do tempo (estimativa de 60 s), mostra a ação "Abrir no SharePoint" com o `url`.
- Testes: miniatura fora da tela não chama `ler`, a 5ª chamada espera a fila, e vídeo com erro mostra o link.

### T3. Movimento
- Abrir: a origem é o retângulo da miniatura clicada (`transform-origin` e escala de ~0.96 para 1 com opacity), 200 ms `cubic-bezier(0.23, 1, 0.32, 1)`. Fechar: 150 ms ease-out. Troca de arquivo: crossfade de 120 ms.
- `@media (prefers-reduced-motion: reduce)`: só opacity. Só `transform` e `opacity`, sem `transition: all`. Hover da miniatura sem deslocar o layout.

### T4. Dados dos recebimentos
- `apps/shell/src/pages/recebimentos/` (só domínio e dados, sem rota): `queries.ts` com `ENTITY = 'cr40f_anexorecebimento_v2'`, `$select` confirmado na metadata, filtro por `_cr40f_reserva_value` em blocos de 15 ids (padrão de `ops/data/queries.ts`), `$orderby=cr40f_ordem`. Mais `contarPorReserva(ids)`, `domain.ts` (mapear linha → `Comprovante`, `midia` por `cr40f_tipomidia` e extensão, agrupar por serviço) e `mock.ts` com fotos e PDF fictícios gerados localmente (sem link real).
- Nome do motorista pela anotação formatada do lookup (`@OData.Community.Display.V1.FormattedValue`).
- Testes de domínio.

### T5. Seção na ficha do Geral
- Em `GeralSheet.tsx`, a seção "Comprovantes de recebimento" com a galeria. Carrega ao abrir a linha e mostra o estado vazio quando não há comprovante.

### T6. Seções na OP e no Pagante
- `OpDrawer.tsx`: `Section` "Comprovantes de recebimento" com o resumo "N comprovantes · M serviços" e um grupo por serviço (cabeçalho com ID, data e destino), usando as reservas que a ficha já carrega.
- `PaganteDrawer.tsx`: a mesma seção, pelas reservas da OP do pagante (`loadServicos`), com o aviso de OP inteira.
- Uma única galeria por ficha (o visualizador navega por todos), para "N de M" valer para a OP.

### T7. Contagem na lista do Geral
- Ao carregar cada página, `contarPorReserva` dos ids visíveis (em blocos, sem bloquear a lista). `renderCell` da coluna de ID mostra o `Paperclip` com o número e `aria-label="4 comprovantes de recebimento"`. Falha na contagem só esconde o indicador.

### T8. Qualidade e verificação
- `qualidade-antes-do-pr`: `/simplify` (2–3 passadas), `karpathy-coder`, `/code-review high --fix`.
- `verificacao-manter`: atualizar `verificar-shell` (ou criar `verificar-comprovantes` via `verificacao-criar`) com os cenários 1–7 no mesmo commit.
- Prints no chat (Geral, OP, Pagante, visualizador foto/vídeo/PDF, Despesas) e `ux-audit` Rápido.
- PR para a `develop`. O Deploy publica a tela no DEV. Depois, teste no DEV com serviço real: limite de vídeo, tempo do flow e contagem.
