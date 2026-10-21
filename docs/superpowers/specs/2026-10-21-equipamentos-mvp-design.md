# Equipamentos — MVP (`#/equipamentos`)

Data: 21/10/2026 · Aprovado por Renan (brainstorm desta data).

## 1. Objetivo

Registrar os equipamentos da empresa (notebook, mouse, monitor, máquina de cartão etc.) e saber **com quem cada item está agora**.

- Cadastro do item com identificação, status e dados de compra.
- Responsável atual: um funcionário ou ninguém (vazio = escritório/estoque).
- Troca de responsável é só editar o campo. Não há histórico de posse.

Fora do escopo: histórico de entregas e devoluções, termo de responsabilidade, anexos e fotos, etiqueta ou QR code, alertas e e-mails, depreciação, vínculo com veículo, publicação no PROD.

## 2. Estado atual (conferido no código em 21/10/2026)

- Não existe tabela, tela ou flow de equipamentos/patrimônio no repo nem em `CONTEXTO/contexto.md`. O MCP do Dataverse DEV não conectou no brainstorm; a ausência das tabelas é confirmada no DEV pelo dry run do script de provisão (seção 6) antes de criar qualquer coisa.
- Molde de tela: `apps/shell/src/pages/infracoes/` (`domain/` puro → `data/` com Source Dataverse/mock → página com `useListView` → drawer com formulário).
- Molde de provisão: `packages/deploy/provision-documentos.ps1` (idempotente, dry run sem `-Apply`, PROD bloqueado no código e por `DV_BLOCKED_HOSTS`, inclui componentes na solução `DV_SOLUTION`, semeia registros).
- A ficha do funcionário (`pages/funcionarios/components/Ficha.tsx`) tem abas Dados, Documentos, Multas, Veículos e Anotações; as relacionadas ficam em `RelatedTabs.tsx` (`MultasTab`, `VeiculosTab`).
- Menu em `apps/shell/src/nav/menu.ts`; rotas lazy em `apps/shell/src/app/routes.tsx`.

## 3. Decisões

1. Página React própria `#/equipamentos` no shell (abordagem 1), item "Equipamentos" no grupo **Cadastros** do menu.
2. Responsável é lookup opcional para `cr40f_funcionarios` (inclui motoristas). Sem responsável = escritório/estoque.
3. Sem histórico de posse: o responsável é sobrescrito na edição.
4. Tipos em tabela própria (`cr40f_tipoequipamento`), editáveis pela tela; inativar em vez de excluir.
5. Sem exclusão de equipamento pela tela: item que sai de uso fica com status "Baixado".
6. Regras de coerência entre status e responsável são sugestões do shell, editáveis pelo usuário (seção 4.3).
7. Número de série repetido gera aviso, não bloqueia (item pode ter sido recadastrado).
8. Edição simultânea: vale a última gravação.
9. Privilégios: as tabelas novas recebem os mesmos privilégios das funções de segurança que hoje acessam `cr40f_funcionarios` (script próprio, seção 6).
10. Entrega no DEV. PROD fica para depois do congelamento do checklist, junto com o restante pela AppBetinhos.

## 4. Dados (Dataverse DEV)

Criado por `packages/deploy/provision-equipamentos.ps1`, no molde de `provision-documentos.ps1`. Prefixo `cr40f_`, rótulos em pt-BR (1046). Tabelas **UserOwned** (o `Ensure-Table` do molde só cria assim; Documentos também é UserOwned): quem vê o quê depende da profundidade dos privilégios, copiada de `cr40f_funcionarios` (seção 6).

### 4.1 `cr40f_tipoequipamento` (nova)

| Coluna | Tipo | Regra |
| --- | --- | --- |
| `cr40f_name` | Texto (primária, 100) | obrigatório; nome exibido |
| `statecode`/`statuscode` | padrão | inativar em vez de excluir |

Semente (idempotente, por nome): Notebook, Desktop, Monitor, Mouse, Teclado, Headset, Celular, Tablet, Máquina de cartão, Impressora, Outro.

### 4.2 `cr40f_equipamento` (nova)

| Coluna | Tipo | Regra |
| --- | --- | --- |
| `cr40f_name` | Texto (primária, 200) | obrigatório; descrição curta |
| `cr40f_tipo` | Lookup → `cr40f_tipoequipamento` | obrigatório |
| `cr40f_marcamodelo` | Texto (200) | opcional |
| `cr40f_numeroserie` | Texto (100) | opcional |
| `cr40f_status` | Choice | Em uso, Disponível, Em manutenção, Baixado; obrigatório, padrão Disponível |
| `cr40f_responsavel` | Lookup → `cr40f_funcionarios` | opcional |
| `cr40f_datacompra` | Data (somente data) | opcional |
| `cr40f_valorcompra` | Moeda (BRL) | opcional, ≥ 0 |
| `cr40f_observacoes` | Texto multilinha (2000) | opcional |

Relacionamentos N:1 com comportamento "Remover vínculo" na exclusão do pai (excluir funcionário ou tipo não apaga o equipamento).

### 4.3 Regras de coerência (shell)

- Escolher responsável com status Disponível → sugere "Em uso".
- Limpar responsável com status Em uso → sugere "Disponível".
- Marcar "Baixado" → limpa o responsável.
- Todas aplicadas no formulário antes de salvar; o usuário pode mudar o status depois da sugestão (exceto Baixado com responsável, que o formulário não permite).

## 5. Telas

Primitivas de `@betinhos/ui` e tokens do Design System (`DESIGN_SYSTEM.md`, `design-tokens.json`). Tema claro, sem gradiente, status sempre com texto.

### 5.1 Página `#/equipamentos`

- Cabeçalho: título, botões **Novo equipamento** e **Tipos**.
- Lista via `useListView`: tabela no desktop, cards no celular.
- Busca: descrição, tipo, marca/modelo, número de série, nome do responsável.
- Filtros rápidos por coluna (padrão do DS): Equipamento, Tipo, Responsável (só quem tem algum item), Status, Nº de série, Compra (pela data). Só no filtro avançado: Valor de compra e "Com responsável".
- Visão padrão ("Equipamentos em uso e disponíveis") esconde Baixados pelo filtro rápido de Status (Em uso, Disponível, Em manutenção); escolher Baixado nesse filtro os traz de volta.
- Visões prontas: "Todos, inclusive baixados", **"Sem responsável"** (Com responsável = Não, fora os baixados) e "Baixados".
- Colunas, nesta ordem: Equipamento (descrição, com a marca/modelo embaixo), Tipo, Responsável (selo "Inativo" se o funcionário estiver inativo), Status (selo com texto), Nº de série, Compra (`dd/mm/aaaa · R$ 0,00`). Marca/modelo é coluna oculta por padrão (assim a tabela cabe em 1366 px sem rolar); o seletor de colunas a exibe.
- Funcionário inativo = desligado (`cr40f_status` 1) ou registro inativo (`statecode` 1); Afastado conta como ativo (a confirmar com o Renan).
- Estados: carregando, vazio ("Nenhum equipamento cadastrado." com ação Novo equipamento), sem resultado de filtro, erro (seção 7).

### 5.2 Drawer de cadastro/edição

- Campos da seção 4.2; responsável por seletor com busca entre funcionários ativos (o atual continua exibido se estiver inativo).
- Tipo por seletor entre tipos ativos (o atual continua exibido se estiver inativo).
- Salvar e Cancelar; sem Excluir.
- Fecha por X, Esc ou clique no overlay. Com alteração não salva: confirmação "Descartar alterações?" com "Continuar editando" e "Descartar". Durante o salvamento não fecha.
- Abertura direta por `#/equipamentos?ver=<guid>` (convenção `useQueryAlvo` do shell); id inexistente mostra aviso e "Voltar à lista".

### 5.3 Drawer de Tipos

- Lista de tipos (ativos primeiro, inativos marcados).
- Adicionar, renomear e inativar/reativar. Nome obrigatório e único (sem diferenciar maiúsculas e acentos).

### 5.4 Aba Equipamentos na ficha do funcionário

- Nova aba entre Veículos e Anotações, só leitura, desabilitada em funcionário novo (como as demais relacionadas).
- Lista os equipamentos com `cr40f_responsavel` = funcionário, exceto Baixados: descrição, tipo, nº de série, status.
- Cada linha abre `#/equipamentos?ver=<guid>`.
- Vazio: "Nenhum equipamento com este funcionário."

## 6. Código e publicação

```
apps/shell/src/pages/equipamentos/
  domain/   types.ts, status.ts (regras 4.3), lista.ts (busca/filtros), form.ts (validação, série repetida)
  data/     queries.ts (nomes lógicos, mappers), source.ts (Dataverse | mock), mock.ts
  components/ EquipamentosList.tsx, EquipamentoDrawer.tsx, TiposDrawer.tsx
  EquipamentosPage.tsx, useEquipamentos.ts, equipamentos.css
```

Alterados: `nav/menu.ts` (item e tipo `page`), `app/routes.tsx` (rota lazy), `pages/funcionarios/components/RelatedTabs.tsx` + `Ficha.tsx` (aba) e a fonte de dados da ficha (consulta de equipamentos por funcionário).

Schema: `packages/deploy/provision-equipamentos.ps1` cria tabelas, colunas, relacionamentos e semente de tipos; inclui tudo na solução do `.env` e falha explicitamente se faltar permissão ou dependência. Só DEV.

Privilégios: script separado, `packages/deploy/conceder-privilegios-equipamentos.ps1` (rodar depois do provision), copia para as duas tabelas os privilégios e a profundidade que cada papel tem em `cr40f_funcionarios`. Papéis padrão (`-Roles`, convenção do repo, a mesma de Documentos): Acesso-Betinhos-Canvas, Acesso-Betinhos-MDA e DEV - Usuário. Os demais papéis que acessam `cr40f_funcionarios` e ficaram fora geram AVISO, sem concessão; entram com `-Roles` se for o caso.

Publicação: PR → merge na `main` → `pnpm push` no checkout principal (regra do `CLAUDE.md`).

## 7. Erros

| Situação | Comportamento |
| --- | --- |
| Falha ao carregar lista ou tipos | Alerta com a mensagem e botão "Tentar de novo"; versão do build visível |
| Tabela ausente na metadata | Mensagem padrão do shell "Tabela cr40f_equipamento não encontrada na metadata." (ou a de tipo); na ficha, só dentro da aba Equipamentos; sem cair em mock |
| Falha ao salvar | Drawer continua aberto com os valores digitados e mostra a mensagem do Dataverse |
| Validação | Descrição, tipo e status obrigatórios; valor ≥ 0; mensagens junto ao campo |
| Série repetida | Aviso não bloqueante com a descrição do outro item |
| Funcionário ou tipo inativo | Continua exibido no item, com selo; não aparece nos seletores para nova escolha |

## 8. Verificação

1. Vitest: `domain/` (regras 4.3, busca e filtros, validação, série repetida) e componentes (salvar, descartar alterações, overlay durante salvamento, aba na ficha). `pnpm typecheck` e `pnpm test` verdes.
2. Navegador, `pnpm dev` em mock: `ux-audit` Rápido e Fluxo — cadastrar item, atribuir responsável, trocar responsável, baixar, filtrar "Sem responsável", gerenciar tipos, abrir item pela ficha. Desktop e 375 px.
3. DEV: `provision-equipamentos.ps1` em dry run (confirma que as tabelas não existem), depois `-Apply`; conferir metadata (nomes lógicos, tipos, lookups) e pertencimento à solução. Em seguida `conceder-privilegios-equipamentos.ps1` em dry run (`prvRead*` Global) e `-Apply`. Após `pnpm push` da `main`, teste autenticado no DEV com um item real.
4. Skill `.claude/skills/verificar-equipamentos/` (roteiro em mock `fluxo-mock.cjs` e verificação no DEV).

Casos de borda a cobrir: funcionário desligado com item atribuído; tipo inativado com itens; item sem número de série; valor de compra vazio; `?ver=` inexistente; lista vazia; Baixado com responsável (formulário impede).
