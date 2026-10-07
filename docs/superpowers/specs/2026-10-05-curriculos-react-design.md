# Currículos em React — design

**Data:** 05/10/2026
**Status:** decisões aprovadas em conversa com o Renan; aguardando revisão desta spec
**Escopo:** segundo módulo da migração dos WebResources vanilla para rotas React do shell, seguindo o molde do Resumo Operacional (`2026-10-05-operacional-react-design.md`).

## 1. Contexto e decisões

- O legado é `Tela Currículos/index.html` (WebResource `new_TelaCurriculo`, 2837 linhas; `app.js` e `styles.css` são antigos e não contam). Hoje ele é **só o formulário de cadastro** em 3 abas, que substitui o "Novo" de `new_curriculo`. A lista continua sendo a lista nativa do model-driven.
- O módulo novo é **completo**: funil de candidatos, detalhe, edição e cadastro, na rota **`#/curriculos`**.
- No menu (`apps/shell/src/nav/menu.ts`), a rota substitui o item nativo `table('new_curriculo')` do grupo Cadastros.
- O botão "Novo" do model-driven continua abrindo o legado até a virada. O redirect do formulário **não** é alterado.
- Usuário principal: **RH e operação no desktop**. No celular, o funil vira abas por etapa e o cadastro continua usável.
- O funil tem **5 colunas por status**, com contador: Novo, Em análise, Aprovado p/ banco, Contratado e Reprovado (esta recolhida por padrão).
- A tela grava três coisas: criação, edição e mudança de status. O rascunho automático e a idempotência do legado são mantidos.

### Fora do escopo

- Remover o WebResource `new_TelaCurriculo` ou mexer no redirect do "Novo" do model-driven.
- Log de erro em `new_appmotoristaslog` (o legado grava; o módulo novo não porta).
- Inativar ou excluir currículos, e qualquer ação em lote.
- Alterar o Power Automate de upload.
- Qualquer escrita em PROD.

## 2. Comportamento herdado do legado (referência)

Inventário feito em `Tela Currículos/index.html`.

### Tabela e campos (`new_curriculo`)

Confirmado na metadata de DEV em 05/10/2026: entity set **`new_curriculos`**, chave `new_curriculoid`. Em DEV há 45 linhas ativas (6 Novo, 23 Em análise, 10 Aprovado para banco, 6 Reprovado, 0 Contratado).

| Campo | Tipo real | Regra |
| --- | --- | --- |
| `new_nomecompleto` | texto 200 | obrigatório |
| `new_cpf` | texto 14 | máscara `000.000.000-00`; gravado com máscara, como no legado |
| `new_email` | e-mail 150 | formato de e-mail |
| `new_telefone`, `new_whatsapp` | telefone 30 | máscara `(00) 00000-0000` |
| `new_cidade` | texto 100 | — |
| `new_estado` | texto 2 | só letras, maiúsculas |
| `new_cargointeresse` | texto 120 | obrigatório |
| `new_experiencia`, `new_observacoes` | texto multilinha | — |
| `new_ultimocargo` | texto 120 | — |
| `new_ultimaempresa` | texto 150 | — |
| `new_pretensaosalarial` | **moeda** | número ≥ 0, aceita vírgula decimal |
| `new_nota` | inteiro | 0 a 10 |
| `new_indicadopor` | texto 200 | — |
| `new_linkcurriculo` | URL 500 | `http(s)://` |
| `new_disponibilidade` | choice | Imediata, Até 7/15/30 dias, A combinar |
| `new_categoriacnh` | choice | A, B, C, D, E, AB, ACC, Não informado |
| `new_origemcurriculo` | choice | Indicação, WhatsApp, Site, LinkedIn, Instagram, Presencial, Outro |
| `new_statuscurriculo` | choice | Novo 100000000, Em análise 100000001, Aprovado para banco 100000002, Reprovado 100000003, Contratado 100000004 |

Os valores das choices conferem com `index.html:1371-1409` e com a metadata de DEV. Mesmo assim, **o código lê as opções de `metadata.choices()`**; valores fixos só existem no mock.

### Gravação

- **Criação:** `createRecord` com os campos preenchidos (vazios são omitidos). Sem status escolhido, grava Novo.
- **Anexo:** até 10 MB, extensões `.pdf, .doc, .docx, .png, .jpg, .jpeg`. O arquivo vai em base64 por `POST` a um Power Automate HTTP (`index.html:2325-2350`) com o corpo:
  `curriculoId, expenseId, externalId ('new_curriculo'), fileName, mimeType, fileSize, base64, candidateName, candidateEmail, cargoInteresse, indicadoPor, uploadedBy, uploadedAt`.
  A resposta é JSON com `webUrl` (e `driveItemId`). Com `webUrl`, o app faz `updateRecord` de `new_linkcurriculo`.
- **Idempotência** (`index.html:2215-2300`): a assinatura é o JSON do payload com chaves ordenadas. Com arquivo, depois de criar o registro, a submissão fica pendente em localStorage na fase `record-created`; depois do upload, na fase `upload-completed` com o `webUrl`. Ao reenviar o mesmo payload:
  - `upload-completed` → só grava o link;
  - `record-created` com arquivo → refaz só o upload;
  - `record-created` sem arquivo → erro pedindo o arquivo, sem criar outro registro.
- **Rascunho:** o formulário é salvo em localStorage a cada alteração e restaurado ao abrir.
- **URL do Flow:** o legado escolhe uma URL assinada por ambiente, escrita no código. **Essas URLs não entram neste repositório** (ele é público).

## 3. Arquitetura

```
apps/shell/src/pages/curriculos/
  CurriculosPage.tsx         composição: cabeçalho, filtros, funil, drawer, confirmação
  components/                Filters, FunnelBoard, FunnelTabs, CurriculoCard, CurriculoDrawer, CurriculoView, CurriculoForm
  data/queries.ts            leitura (todas as linhas ativas) + mapeamento
  data/mutations.ts          payloads de PATCH
  data/upload.ts             validação do arquivo, base64, corpo e chamada do Flow
  data/submit.ts             criação idempotente e salvamento de registro existente
  data/mock.ts               dados de exemplo para pnpm dev
  data/source.ts             Source (dataverse | mock)
  domain/*.ts                funções puras + testes
  useCurriculos.ts           carga, otimismo, upsert
  useBoardDrag.ts            arrasto com pointer events
  curriculos.css             classes `cv-`
```

- **Menu:** `table('new_curriculo')` vira `{ kind: 'page', id: 'curriculos', label: 'Currículos', page: 'curriculos' }`. O tipo `page` passa a aceitar `'componentes' | 'operacional' | 'curriculos'`, o `RouteLayout` despacha a rota e o `AppShell` ganha o ícone `curriculos: <ScrollText />`.
- **`domain/`** só tem funções puras, sem React e sem `@betinhos/ui` em runtime:
  - `types.ts` (Curriculo, ChoiceSet);
  - `text.ts` (normalização sem acento, dígitos, máscaras, "há N dias");
  - `form.ts` (mapa campo → coluna, formulário vazio, validação, payload de criação e de alteração, sujeira);
  - `funnel.ts` (etapas a partir das choices, agrupamento, filtros, opções de cargo, confirmação);
  - `duplicates.ts` (CPF e telefone);
  - `drag.ts` (limiar, alvo do soltar, deslocamento do assentamento);
  - `submission.ts` (rascunho e submissão pendente sobre um `KV` injetável).
- **`queries.ts`:** `GET new_curriculos?$select=…&$filter=statecode eq 0&$orderby=createdon desc` com `client.getAll` (segue o `@odata.nextLink`). O entity set vem de `metadata.entities()`.
- **`source.ts`:** expõe `load`, `choices` (as quatro colunas choice via `metadata.choices`), `create`, `update`, `upload` e `kv`. No mock, os dados vivem em memória e o upload é simulado.
- **URL do Flow:** só do build, `import.meta.env.VITE_CURRICULO_UPLOAD_URL`, definida no `.env` (não versionado). A variável entra no `.env.example` sem valor. O `vite.config.ts` do shell passa a ler o `.env` da raiz (`envDir: '../..'`); o Vite só expõe variáveis com prefixo `VITE_`. Sem a URL, o upload fica desabilitado com o aviso "Envio de arquivo indisponível neste ambiente".
  - Observação: a URL é embutida no HTML publicado, como no legado. Quem acessa o WebResource autenticado consegue lê-la; o risco é o mesmo de hoje.
- **Drawer:** o `Drawer` de `packages/ui` é controlado (`open` + `onClose`). X, Esc e fundo só chamam `onClose`; quem decide fechar é a página. Isso basta para interceptar o fechamento com alteração não salva. **Não há mudança no Drawer.**

## 4. Layout

### Desktop (alvo principal)

1. **`PageHeader`:** eyebrow "Cadastros", título "Currículos", meta com o total ("45 candidatos") e a ação primária **"Novo currículo"**.
2. **`PageToolbar variant="filters"`:**
   - `SearchBox` "Buscar por nome, telefone ou cidade" (sem acento; o telefone compara só dígitos);
   - `Select` Cargo (opções tiradas dos dados, com busca), `Select` CNH, `Select` Origem e `Select` Nota mínima (0 a 10), todos com limpar;
   - botão "Limpar filtros" quando houver algum filtro ativo.
3. **Funil:** 5 colunas lado a lado em grade, sem rolagem horizontal e sem rolagem própria por coluna: as colunas crescem com o conteúdo e a página rola. Assim o card arrastado nunca é cortado por um contêiner com `overflow`. Cada coluna tem fundo `#FCFCFB` e cabeçalho fixo (sticky) com a etapa e o contador.
   - **Reprovado** começa recolhida como uma faixa estreita com rótulo e contador. Clicar expande; o estado fica só na sessão.
   - **Card:** nome (forte), cargo, "Cidade/UF", "CNH B", nota ("Nota 8"), "Indicado por Fulano" quando houver e "há N dias" (de `createdon`, no fuso de São Paulo). Botão "⋯" com o menu **"Mover para…"**.
4. **Drawer largo (720 px)** ao clicar no card.

### Celular (≤ 820 px)

- O funil vira `Tabs` com uma aba por etapa e o contador em badge; a aba mostra a lista da etapa. Reprovado é a última aba.
- O arrasto não existe no celular (e não existe com toque em nenhum tamanho): mover é pelo menu "Mover para…".
- O cadastro e a edição usam o mesmo Drawer, que ocupa a largura toda abaixo de 560 px.

### Drawer do candidato

- **Visão:** eyebrow com a etapa, título com o nome. Blocos brancos com borda sobre o fundo `#FCFCFB` do drawer:
  - Contato: telefone e WhatsApp (com Ligar e WhatsApp), e-mail (`mailto:`), cidade/UF, CPF;
  - Perfil: cargo de interesse, último cargo, última empresa, pretensão (`R$ 1.234,56`), nota, disponibilidade, CNH;
  - Origem: origem, indicado por, data de cadastro;
  - Experiência e observações em texto corrido;
  - Currículo: link "Abrir currículo" quando houver, senão "Sem arquivo anexado".
  - Rodapé: "Mover para…" (menu) e **"Editar"** (primário).
- **Edição / cadastro:** o mesmo formulário, em **seções** (não abas), na ordem do padrão "formulário em drawer" do design system:
  1. Dados pessoais: nome*, CPF, telefone, WhatsApp, e-mail, cidade, UF;
  2. Perfil profissional: cargo de interesse*, último cargo, última empresa, pretensão, nota, disponibilidade, CNH, experiência;
  3. Origem e etapa: origem, indicado por, status;
  4. Currículo: link e `Upload` (1 arquivo, 10 MB, tipos aceitos);
  5. Observações internas.
  - Aviso de duplicidade (não bloqueia): `Alert` de atenção "Já existe um currículo com este CPF: {nome}" ou "…com este telefone: {nome}", com o link "Ver" que abre a visão daquele registro.
  - Rodapé: "Cancelar" (secundário) e "Salvar currículo" / "Salvar alterações" (primário, com loading).
- **Fechar com alteração não salva** (X, Esc, fundo ou Cancelar): abre o `Dialog` "Descartar alterações?" com "Continuar editando" e "Descartar". **Durante o salvamento, nada fecha** o drawer.
- **Rascunho:** só no cadastro novo. Ao abrir "Novo currículo" com rascunho salvo, o formulário vem preenchido e aparece o `Alert` informativo "Rascunho restaurado" com "Limpar formulário". O rascunho é apagado ao salvar com sucesso ou ao descartar.

### Cor e tipografia

- Somente tokens do Design System 1.4.0; nenhuma cor nova, nenhum gradiente, sem dark mode.
- Listas das colunas, campos, busca e cabeçalhos de coluna em `--bt-color-surface-neutral` (`#FCFCFB`); cards em `--bt-color-surface`.
- Azul só em foco, seleção (coluna-alvo do arrasto), ícones e ações.
- **Etapa → tom** (sempre com rótulo):

| Etapa | Tom |
| --- | --- |
| Novo | info |
| Em análise | atenção |
| Aprovado p/ banco | sucesso |
| Contratado | sucesso |
| Reprovado | neutro |

- Título da página em Centabel (pelo `PageHeader`); o resto em Manrope.

## 5. Ações, estados e erros

- **Mudar de etapa** (arrasto ou menu):
  - otimista: o card muda de coluna na hora e o toast diz "{nome} movido para {etapa}.";
  - se o PATCH falhar, volta para a coluna anterior e o toast de erro persiste com "Não foi possível mover {nome}. {motivo} Tente de novo.";
  - **Contratado e Reprovado pedem confirmação** num `Dialog`: "Mover {nome} para {etapa}?", com "Manter etapa" e "Mover para {etapa}" (tom danger só em Reprovado). Ao soltar o card numa dessas colunas, ele volta ao lugar até a confirmação.
- **Salvar cadastro novo:** valida; cria (com idempotência); com arquivo, envia ao Flow e grava o link. Sucesso: toast "Currículo registrado." (ou a mensagem de retomada), o card aparece no topo da coluna e o drawer passa para a visão do registro.
  - Falha na criação: nada é criado; toast de erro com o motivo; o formulário fica como está.
  - Falha no upload depois de criar: o registro existe, a pendência fica em `record-created` e o toast diz "Currículo registrado, mas o envio do arquivo falhou. Salve de novo com o mesmo arquivo para concluir sem duplicar."
- **Salvar edição:** PATCH só com os campos alterados (campo esvaziado vira `null`); com arquivo novo, upload e gravação do link. Toast "Alterações salvas.".
- **Validação** (mensagem abaixo do campo, foco no primeiro inválido):
  - nome e cargo obrigatórios;
  - CPF com 11 dígitos;
  - e-mail no formato `nome@dominio`;
  - UF com 2 letras;
  - pretensão numérica ≥ 0;
  - nota inteira de 0 a 10;
  - link começando com `http://` ou `https://`;
  - arquivo dentro de 10 MB e de um tipo aceito.
- **Estados:**
  - primeira carga: `Skeleton` no formato das colunas e cards;
  - sem currículos: `EmptyState` "Nenhum currículo cadastrado" + "Novo currículo";
  - filtro sem resultado: "Nenhum currículo encontrado para estes filtros" + "Limpar filtros";
  - coluna vazia: texto discreto "Nenhum candidato nesta etapa";
  - falha na carga: `Alert` de erro com o motivo e "Tentar de novo";
  - sem URL do Flow: o `Upload` fica desabilitado com o hint "Envio de arquivo indisponível neste ambiente"; o link manual continua editável;
  - mock: selo "Dados de exemplo" no meta do cabeçalho.
- A versão (`BuildBadge`) continua visível em todos os estados, porque vem do shell.

## 6. Motion

Só CSS e estilo inline direto no elemento, sem biblioteca. Anima apenas `transform` e `opacity`.

| Elemento | Comportamento | Observação |
| --- | --- | --- |
| Card arrastado | segue o ponteiro com `translate3d` aplicado direto no elemento (sem re-render por movimento), sombra `--bt-shadow-popover` | começa após 6 px; pointer capture; só mouse e caneta |
| Coluna-alvo | contorno azul de foco por atributo `data-over` (sem re-render) | só enquanto arrasta |
| Soltar em outra coluna | o card assenta da posição do soltar até a nova posição em 200 ms `--bt-ease-out` (FLIP) | — |
| Soltar fora ou com confirmação | volta à origem em 200 ms `--bt-ease-out` | — |
| Pressionar card/botão | `scale(.97)` em 150 ms | hover só em `(hover: hover) and (pointer: fine)` |
| Drawer | 220 ms `ease-drawer` (já no componente) | — |
| Expandir Reprovado | sem animação | ação de layout |

- Com `prefers-reduced-motion`, a regra global dos tokens zera as transições: o arrasto segue o ponteiro (é manipulação direta), o assentamento é imediato e o drawer entra só com opacidade (já tratado no `drawer.css`).

## 7. Acessibilidade

- O card tem um `<button>` real que abre o detalhe, e o menu "Mover para…" é a alternativa por teclado ao arrasto.
- Colunas são `<section>` com `aria-labelledby` no título; o contador faz parte do título ("Novo, 6").
- Etapa nunca só por cor: badge com texto.
- Drawer e Dialog: foco contido e devolvido (componentes nativos `<dialog>`).
- Erros de campo com `role="alert"` (vem do `Field`). Toasts de erro com `role="alert"`.
- Alvos de 44 px no touch.

## 8. Testes, entrega e sequência

- **Isolamento:** worktree `.claude/worktrees/curriculos-react`, branch `feat/curriculos-react`, commits em português e PR para a `main`.
- **Vitest** (ambiente node, sem jsdom; a lógica fica em funções puras):
  - `domain/*`: máscaras, validação, payloads de criação e de alteração, etapas a partir das choices, filtros sem acento, duplicidade, drag e máquina de submissão pendente;
  - `data/*`: montagem da URL, mapeamento, corpo do Flow, resposta do Flow, `submitNew` e `saveExisting` com fontes falsas (criação única ao repetir, retomada de upload e de link).
- **Navegador** (navegador interno, `pnpm dev` com dados de exemplo):
  - 1280 × 800: funil, arrasto, menu, confirmação, drawer, edição, descarte, rascunho, duplicidade, upload simulado;
  - 375 × 812: abas, menu, cadastro;
  - redução de movimento.
- **Publicação:** somente em DEV com `pnpm push`, depois do ok do Renan. Para o upload funcionar em DEV, o `.env` local precisa da `VITE_CURRICULO_UPLOAD_URL` do Flow de DEV (fornecida pelo Renan, nunca versionada). Informar a versão publicada. PROD não é tocado.
- **Próximo módulo:** Preview Cotações (spec própria).

## 9. Critérios de aceite

- [ ] A rota `#/curriculos` abre no shell e substitui `table('new_curriculo')` no menu.
- [ ] O funil mostra as 5 etapas com contadores; Reprovado começa recolhida.
- [ ] Mover por arrasto e por menu funciona, com confirmação em Contratado e Reprovado, otimismo, rollback e toasts.
- [ ] Busca e os 4 filtros funcionam e podem ser limpos.
- [ ] Cadastro, edição, rascunho, idempotência e upload (ou aviso de indisponível) funcionam.
- [ ] Fechar com alteração não salva pede confirmação; salvando, não fecha.
- [ ] O aviso de duplicidade aparece por CPF e por telefone, com "Ver".
- [ ] Nenhuma URL do Flow no repositório; choices só da metadata fora do mock.
- [ ] Só tokens do design system: nenhuma cor nova, nenhum gradiente.
- [ ] `pnpm test`, `pnpm typecheck` e o build passam, e a versão aparece na UI.
