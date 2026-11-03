# Auditoria de UX (modo Fluxo): RH no módulo Treinamentos do shell

Data: 03/11/2026 · Branch `t3/revisar-melhorar-treinamentos` · Shell v0.0.129 em mock local (`vite --port 36495`; a 36490 e a 36491 já estavam ocupadas por outros projetos) · Playwright + axe-core 4.x (headless Chromium) · Viewports 1366×800 e 375×812.

**Persona:** RH da Betinhos, conforto técnico médio, publica o treinamento entre outras tarefas; no celular só confere andamento. Lente de primeiro uso aplicada nas duas telas (editor e painel).

**Tarefa (uma linha do tempo real):** criar "Embarque no GRU v2" com texto, 1 anexo PDF, quiz de 2 perguntas e assinatura, público Por função = Motorista, validade em 10 dias (13/11/2026); publicar; abrir o painel; filtrar Pendentes; abrir o detalhe de quem reprovou.

## Veredito: Fail

A tarefa se completa nos dois viewports sem erro de console nem de rede, mas os gates de acessibilidade estão vermelhos (1 axe Critical e vários Serious, parte no módulo e parte no shell/DS) e há um achado de severidade alta no celular (UX-S1). Nenhum bloqueio funcional: publicar, painel, filtros e detalhe funcionam.

## Achados

### UX-S1 · alta · Filtro do painel estoura o card e cobre o título no celular
- **Reprodução:** 375 px → abrir "Embarque no GRU: novo procedimento" → rolar até "Participação · Por funcionário".
- **Observado:** o `SegmentedControl` "Filtrar participação" mede 347 px dentro de um card de 343 px (borda direita em 392 px, viewport de 375). "Reprovados · 1" aparece cortado, o controle cobre a linha "PARTICIPAÇÃO / Por funcionário" e, ao rolar até ele, o conteúdo do card desliza para o lado. Os quatro botões têm 26 px de altura.
- **Evidência:** `img/ux-s1-filtro-375.png`.
- **Suspeito:** `apps/shell/src/pages/treinamentos/components/TreinamentoPainel.tsx:103-104` (filtro no slot `action` da `Surface`); `apps/shell/src/pages/treinamentos/treinamentos.css` não tem regra estreita para o cabeçalho de `.tr-results` (só `:107`, que troca as colunas).
- **Correção proposta:** abaixo de 480 px, tirar o filtro do `action` e colocá-lo como primeira linha de `.tr-list__toolbar` com largura 100% (rótulos curtos "Todos", "Pendentes", "Concluídos", "Reprovados" e a contagem num `StatusBadge` ou só em `aria-label`), altura mínima de 40 px.

### UX-S2 · média · No celular, tocar numa pessoa não mostra o detalhe
- **Reprodução:** 375 px → painel → tocar em "Márcio Lima".
- **Observado:** a linha fica destacada, mas a linha do tempo, a assinatura e o motivo da reprovação aparecem cerca de 550 px abaixo da lista, sem rolagem nem aviso. O RH acha que o toque não fez nada.
- **Evidência:** `img/ux-s2-toque-sem-detalhe-375.png` (depois do toque a tela continua na lista).
- **Suspeito:** `TreinamentoPainel.tsx:115` (`setSelectedId`) e `:132-146` (`aside.tr-detail`, empilhado por `treinamentos.css:107`).
- **Correção proposta:** em viewport estreito, ao selecionar, rolar até `.tr-detail` (`scrollIntoView({ block: 'start' })` num `useEffect` sobre `selectedId`, só quando `matchMedia('(max-width: 900px)')`), ou abrir o detalhe num `Dialog` de tela cheia com "Voltar à lista".

### UX-S3 · média · Anexar sem título falha em silêncio no celular
- **Reprodução:** 375 px → "Novo treinamento" → sem preencher nada, "Adicionar foto ou arquivo" → escolher o PDF.
- **Observado:** o arquivo não é enviado e nada aparece perto do botão. A mensagem "Informe um título de até 200 caracteres." só existe no fim da página, abaixo de "Quem recebe" e da Prévia. A dica do botão diz "O rascunho é salvo ao anexar", sem dizer que o título é obrigatório. No 1366 o erro cabe na tela, então só aparece no celular.
- **Evidência:** `img/ux-s3-anexo-sem-titulo-375.png`.
- **Suspeito:** `TreinamentoEditor.tsx:128` (`garantirId` chama `setErro` e retorna) e `:245` (`<p className="tr-error">` no rodapé); dica em `components/AnexosSecao.tsx:111`.
- **Correção proposta:** em `garantirId`, além de `setErro`, disparar `toast({ tone: 'danger', message: problema })`; na dica de `AnexosSecao`, trocar por "Preencha o título antes: o rascunho é salvo ao anexar."

### UX-S4 · média · O público aparece como "1 função", sem dizer qual
- **Reprodução:** publicar com Por função = Motorista → painel (1366 ou 375) e lista.
- **Observado:** descrição do cabeçalho, hint do card "Participantes" e coluna "Público-alvo" da lista mostram "1 função". O RH não confirma que foi Motorista sem reabrir nada (e o publicado não é editável). A tela de edição mostra "Motorista" marcado, então a informação existe.
- **Evidência:** `img/ux-s4-painel-1366.png` (cabeçalho "· 1 função · validade 13/11/2026" e card "1 função").
- **Suspeito:** `apps/shell/src/pages/treinamentos/domain/treinamentos.ts:246` (`publicoLabel`), usado em `TreinamentoPainel.tsx:61,83,95` e `components/TreinamentosLista.tsx:26,45`.
- **Correção proposta:** para `PUBLICO.funcao`, mapear os valores com `FUNCAO` (`funcionarios/data/schema.ts`) e mostrar "Motorista" ou "Motorista, Administrativo"; acima de 2 nomes, "Motorista +2". Os selecionados (`N selecionados`) podem ficar como estão.

### UX-S5 · média · Contraste abaixo de 4,5:1 em textos do módulo (axe Serious)
- **Reprodução:** painel → qualquer linha selecionada (1366 e 375); editor → Prévia (375).
- **Observado:** `.tr-recipient.is-selected` com `--bt-color-text-secondary` (#64748b) sobre `--bt-color-action-soft` (#edf3ff): 4,27:1 em `.tr-recipient__text small` e `.tr-recipient__nota`. A Prévia no celular também falha (`.tr-device__desc`, `.tr-device h3`, `.is-empty`). O mesmo cinza sobre o fundo da página (#f0f0f0) dá 4,17:1 em `.bt-page-header__description` (DS, afeta todas as telas).
- **Evidência:** saída do axe na seção "Gates" (seletores e razões).
- **Suspeito:** `treinamentos.css:83` (fundo selecionado), `:89-90` (texto da linha), `:67-68` (Prévia).
- **Correção proposta:** `.tr-recipient.is-selected .tr-recipient__text small, .tr-recipient.is-selected .tr-recipient__nota { color: var(--bt-color-text-primary); }` e usar um token de texto mais escuro nos itens da Prévia; o cabeçalho de página é do DS (`@betinhos/ui`).

### UX-S6 · baixa · Títulos do conteúdo publicado pulam de nível (axe moderate)
- **Observado:** `Conteudo` renderiza `#` como `<h4>` direto sob `h2`/`h3` do painel ("Heading order invalid"), em painel e Prévia.
- **Suspeito:** `components/Conteudo.tsx:13`.
- **Correção proposta:** renderizar como `<h3>` e ajustar o CSS de `.tr-conteudo h3`.

### UX-S7 · baixa · Toast de publicação cobre o breadcrumb e parte do título do painel
- **Observado:** logo depois de "Publicar agora", o toast de sucesso fica sobre "Treinamentos › Participação" e a primeira letra do título do painel por alguns segundos.
- **Evidência:** `img/ux-s4-painel-1366.png`.
- **Suspeito:** posição do `ToastProvider` no DS (usado em `TreinamentosPage.tsx` via `useToast`); não é do módulo.
- **Correção proposta:** no DS, deslocar o toast para o canto inferior direito em telas largas, ou abaixo do `PageHeader`.

### UX-S8 · baixa · "Descrição curta" aceita 1000 caracteres
- **Observado:** o campo mostra "37/1000" e a dica "Aparece na lista do app"; mil caracteres numa linha de lista não são "curta" e o contador induz a escrever demais.
- **Suspeito:** `domain/treinamentos.ts:62` (`DESCRICAO_MAX = 1000`) e `TreinamentoEditor.tsx:163`.
- **Correção proposta:** reduzir para 200 (o app trunca na lista); confirmar antes o limite da coluna no Dataverse.

### UX-S9 · alta (gate) · Achados de DS/shell fora do módulo
Não são do código de `treinamentos`, mas reprovam o gate do axe na rota `#/treinamentos`:
- **Critical** `aria-required-children`: a `Table` da lista (`.bt-table`, 1366) tem `span[aria-live]` como filho direto. Código no pacote `@betinhos/ui` (fora deste repo).
- **Serious** `color-contrast`: `.bt-build-badge` (#94a3b8 sobre #f0f0f0, 2,24:1; todas as rotas e viewports), `.bt-shell__section-label` e `.bt-shell__group-count` na sidebar.
- **Serious** `label-content-name-mismatch`: `.bt-shell__brand-link`.
- **Moderate** `page-has-heading-one`: a lista não tem `h1` (o editor e o painel têm).
- **Correção proposta:** abrir issues no repo do DS (`design-system-betinhos`): mover o `aria-live` da `Table` para fora do elemento com role de tabela; escurecer o badge de versão (o mínimo para 4,5:1 sobre #f0f0f0 é #6b7280; mantém "sutil" com opacidade só no ícone/borda); `aria-label` da marca começando pelo texto visível ("Betinhos"); `h1` na lista (`PageHeader`).

## Fluxo: leitura como RH (sem defeito, só observações)
- Passos até publicar com a tarefa pedida: 1 clique em Novo, 4 campos de texto, 2 interruptores, 2 perguntas (6 digitações + 2 marcações), 2 cliques no público, 1 data, 1 anexo, 2 cliques de publicação. O anexo salvou o rascunho sozinho, manteve título, quiz e público e continuou no editor; a confirmação mostra "Publicar para 3 funcionários?".
- Os filtros se sobrepõem por desenho: "Pendentes · 2" inclui quem reprovou e ainda não concluiu (`matchParticipacao`, `domain/treinamentos.ts:257-259`). Quem reprovou aparece em Pendentes e em Reprovados, o que atende ao fluxo pedido.
- No v2 recém-publicado ninguém reprovou (o mock cria participações todas "Não aberto"), então "abrir o detalhe de quem reprovou" foi feito no treinamento semeado "Embarque no GRU: novo procedimento" (Márcio Lima, 33%, 1 tentativa, assinatura visível).
- O painel de reprovado informa "Podem tentar de novo no app" mas não oferece ação ao RH; é o escopo das fases seguintes do plano, não um defeito desta auditoria.

## Gates

| Gate | 1366×800 | 375×812 |
|---|---|---|
| Console errors | 0 | 0 |
| Console warnings | 0 | 0 |
| Network 5xx / 403 / 404 | 0 | 0 |
| Overflow horizontal da página | 0 px em todas as telas | 0 px (mas o filtro do painel estoura o card, UX-S1) |
| axe Critical | 1 (`aria-required-children`, Table da lista, DS) | 0 |
| axe Serious | lista: 2 (contraste da sidebar/badge, brand-link); editor: 2; painel: 2 + contraste da linha selecionada | contraste do badge; linha selecionada (painel); Prévia (editor) |
| axe Moderate (informativo) | `page-has-heading-one` (lista), `heading-order` (painel) | idem |
| Resultado | **Vermelho** | **Vermelho** |

Detalhe do axe por tela (1366): lista, editor vazio, editor preenchido, diálogo de publicação (0 violações), painel, painel com detalhe. No 375 as mesmas telas. Páginas auditadas: 3 de 3 do módulo (lista, editor, painel).

## Cobertura e manifesto
- 29 passos registrados com `[✓]` em cada viewport (nenhum `[✗]`), console lido e axe rodado a cada tela, 14 screenshots por viewport guardados fora do repo (só os que sustentam achados foram versionados).
- Cenários da lista Fluxo: 2 (Interrompido: Voltar com dados abre "Descartar alterações?"), 3 (Voltar da tela do painel à lista), 7 (diálogo de confirmação antes de publicar, com contagem de destinatários), 10 (v2 aparece na lista com status Publicado ao voltar do painel, sem recarregar).

## Não testado
- Dados reais (Dataverse DEV), envio real de anexo ao SharePoint e permissões: o mock não cobre.
- Desempenho (LCP/CLS/INP): não medido; build de desenvolvimento não representa produção.
- Teclado apenas, 768/1024 px, alto volume de participantes, rede lenta, e o ramo "Selecionar" do público.
- Autocrítica por subagente independente (passo obrigatório do modo completo) não foi executada; os achados foram revistos pela própria sessão e todos têm reprodução e evidência.
