# Resumo Operacional em React — design

**Data:** 05/10/2026
**Status:** aprovado em conversa; aguardando revisão desta spec
**Escopo:** primeiro módulo da migração dos WebResources em JS vanilla para rotas React do shell. Ele fixa o molde que os demais vão seguir.

## 1. Contexto e decisões

- Os módulos vanilla viram **rotas do shell** (`apps/shell`), usando `packages/ui` e `packages/dataverse`. Não ganham repo nem WebResource próprio.
- O primeiro módulo é o **Resumo Operacional** (`Tela Operacional/Operacional.html`, WebResource `new_TelaOperacional`).
- A tela é **repensada**, não copiada. O usuário principal é o **despacho no celular**. As dores atuais são três:
  - muita rolagem e densidade ruim;
  - não dá para agir sobre o serviço;
  - os dados ficam desatualizados.
- A abordagem escolhida é **fila de ação + agenda densa**: uma faixa "Precisa de você" com ação direta, a agenda do dia agrupada por hora e um sheet de ações, com atualização automática.
- A tela deixa de ser somente leitura e passa a ter quatro ações:
  - ligar e WhatsApp;
  - mudar status;
  - atribuir ou trocar motorista;
  - abrir a reserva completa.

### Fora do escopo

- Os outros módulos: cada um terá spec própria. A ordem prevista está na seção 8.
- Remover o WebResource `new_TelaOperacional`: ele continua publicado até a validação em uso.
- Qualquer escrita em PROD.

## 2. Comportamento herdado do legado (referência)

Inventário feito em `Tela Operacional/Operacional.html` (4030 linhas). A tela legada **não** grava nada no Dataverse e não se atualiza sozinha.

### Consultas

- **Reservas** (`cr40f_reservadeveculos`):
  - Filtro: `cr40f_dataehorriodesada` entre o início e o fim do dia local, com `statecode eq 0`. Quando há motorista selecionado, também `_cr40f_motorista_value eq {id}`.
  - Ordem: `cr40f_dataehorriodesada asc`.
  - Campos base: `cr40f_reservadeveculosid, cr40f_id, cr40f_idnovo, cr40f_status, cr40f_statusdefaturamento, cr40f_tipodoservico, cr40f_tipodeveiculo, cr40f_dataehorriodesada, cr40f_horrioprevistoderetorno, cr40f_destino, cr40f_endereodesada, cr40f_passageirosetelefonedecontato, cr40f_trajeto, cr40f_obsdeoperao, cr40f_observaointerna, _cr40f_solicitante_value`.
  - Lookups extras: `_cr40f_motorista_value, _cr40f_veiculo_value, _cr40f_cliente_value, _cr40f_passageiro1_value … _cr40f_passageiro4_value`.
  - **Modo seguro:** se o erro indicar coluna inexistente (`column metadata is not available`, `could not find a property named`, `does not contain a definition`), a consulta é refeita só com os campos base e sem o filtro de motorista. A tela então avisa o usuário.
- **Motoristas** (`cr40f_funcionarios`):
  - Campos: `cr40f_funcionariosid, cr40f_nomecompleto, new_apelido, cr40f_funcao, cr40f_status, cr40f_celular`.
  - Filtro `statecode eq 0`, ordem `cr40f_nomecompleto asc`.
  - No cliente, fica só quem tem o valor formatado de `cr40f_funcao` casando com `/motorista/i`.
  - Se a lista vier vazia ou der erro, os motoristas são derivados das próprias reservas.
- **Passageiros** (`cr40f_servicosporpassageiro`):
  - Consulta em lotes de 10 IDs de reserva (`_cr40f_geral_value eq X or …`).
  - Campos: `cr40f_servicosporpassageiroid, cr40f_ordemdeselecao, new_enderecodesaidacolunaservicosporpassageiro, _cr40f_geral_value, _cr40f_bancodedados_value`.
  - Ordem `cr40f_ordemdeselecao asc`. Em caso de erro, a lista fica vazia.
- **Ordem da lista de passageiros:**
  1. registros filhos;
  2. lookups `passageiro1..4`;
  3. texto livre `cr40f_passageirosetelefonedecontato`.

### Regras de domínio

- **Estado do serviço** (`getServiceState`, com status normalizado sem acento):
  - sem horário de saída → `unknown`;
  - concluído ou cancelado → `concluded`;
  - em andamento → `in_progress`;
  - saída no futuro → `upcoming` (tom atenção se faltam ≤30 min);
  - já passou da saída e o status ainda é agendado → `in_progress` ("saiu há X, sem conclusão");
  - demais casos → `delayed`.
- **Conflito:** duas saídas consecutivas do mesmo motorista com diferença `>= 0` e `< 30` min. A comparação é saída com saída.
- **Alertas:**
  - P1: sem motorista e saída em ≤30 min.
  - P2: status aberto e saída em ≤30 min, ou serviço atrasado.
  - P3: conflito.
- **Faixas de horário:** próxima hora (0 a 60 min), tarde (>60 min e hora <18) e noite (>60 min e hora ≥18).

## 3. Arquitetura

```
apps/shell/src/pages/operacional/
  OperacionalPage.tsx        composição da tela (layout responsivo)
  components/                PrecisaDeVoce, Agenda, ServiceRow, ServiceDetail, ServiceActions, FreshnessBar, LandscapeTable
  data/queries.ts            consultas (reservas, motoristas, passageiros) + modo seguro
  data/mutations.ts          setStatus, setMotorista
  data/mock.ts               dados de exemplo para pnpm dev
  domain/*.ts                funções puras + testes
  useOperacional.ts          carga, atualização, otimismo
packages/ui/src/components/Sheet.tsx      bottom sheet com arrasto (novo)
packages/dataverse/src/metadata.ts        + choices(entity, attribute)
```

- **Menu:** `new_TelaOperacional` vira `{ kind: 'page', id: 'operacional', label: 'Resumo Operacional', page: 'operacional' }`. O tipo `page` passa a aceitar `'componentes' | 'operacional'`. O `RouteLayout` despacha a rota.
- **`domain/`** contém só funções puras sem React. Arquivos:
  - `serviceState.ts`;
  - `alerts.ts`;
  - `conflicts.ts`;
  - `bands.ts` (faixas e agrupamento por hora);
  - `passengers.ts`;
  - `phone.ts` (normaliza para `tel:` e `https://wa.me/55…`);
  - `statusTone.ts` (status → tom do design system).
- **`queries.ts`** recebe um `DataverseClient` e uma data. Ele também:
  - monta o intervalo do dia em America/Sao_Paulo;
  - devolve `{ reservas, motoristas, passageiros, queryMode: 'full' | 'safe' }`;
  - lê os nomes dos lookups com `formatted()`.
- **`mutations.ts`** faz duas gravações:
  - `setStatus(client, id, value)` → PATCH `{entitySet}({id})` com `{ cr40f_status: value }`. O entity set vem de `metadata.entities()` e não é escrito fixo no código;
  - `setMotorista(client, id, motoristaId)` → PATCH com `{ "cr40f_Motorista@odata.bind": "/cr40f_funcionarioses({motoristaId})" }`. Antes de implementar, confirmo na metadata o nome de navegação e o entity set reais.
- **`metadata.choices(entity, attribute)`** consulta `EntityDefinitions(LogicalName=…)/Attributes(LogicalName=…)/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet`. Devolve `{ value, label }[]` e guarda o resultado em cache por sessão.
- **`useOperacional(date, motoristaId)`:**
  - estado `{ data, loading, error, lastUpdated, refreshing }`;
  - `refresh()`;
  - atualização automática a cada 60 s **só com `document.visibilityState === 'visible'`**, mais uma ao voltar para a aba;
  - mutações otimistas com rollback;
  - descarta respostas atrasadas quando a data muda (token de requisição).
- **Abrir reserva:** dentro do model-driven, `Xrm.Navigation.openForm({ entityName: 'cr40f_reservadeveculos', entityId })`. Por URL direta, `window.open(`${clientUrl}/main.aspx?pagetype=entityrecord&etn=cr40f_reservadeveculos&id=${id}`)`.
- **Mock:** com `host.mode === 'mock'`, a tela usa `mock.ts` (dados do dia atual, com casos de alerta, conflito e órfão) e mostra o selo "Dados de exemplo". As mutações alteram só a memória.

## 4. Layout

### Celular (retrato), alvo principal

1. **Header sticky:**
   - setas ◀ ▶ e o rótulo do dia ("Hoje · qua 05/10");
   - botão Atualizar com `aria-label`;
   - linha de frescor: "Atualizado há 1 min · 24 serviços".
   - Swipe horizontal no header e as teclas ← → trocam o dia.
2. **Filtros:** chips Motorista (Select com busca por nome ou apelido) e Mostrar concluídos.
3. **Precisa de você (N):** some quando vazia. Cada item mostra hora, código, motivo ("Sem motorista", "Atrasado 12 min", "Saídas com 20 min de intervalo") e uma ação primária inline:
   - Atribuir, para quem está sem motorista;
   - Ligar, para atrasado com motorista;
   - Ver, para conflito.
4. **Agenda:** cabeçalhos de hora sticky. As linhas têm cerca de 56 px:
   - hora, código, motorista e tipo;
   - trajeto curto e `StatusBadge`.
   - Uma barra lateral semântica marca atrasado ou ≤30 min, sempre acompanhada de rótulo.
   - Os concluídos ficam recolhidos ("Concluídos (8)").
5. **Sheet** ao tocar na linha, com dois níveis:
   - **meio (~55%):** resumo (status, horário, motorista, veículo, trajeto) e as ações;
   - **cheio:** passageiros (nome, telefone, endereço, com Ligar e WhatsApp em cada um), cliente, solicitante, destino, retorno previsto, observação de operação e observação interna.
   - As ações ficam fixas no rodapé: Ligar motorista, WhatsApp motorista, Status, Motorista e Abrir reserva.

### Desktop (≥860 px)

Lista à esquerda (Precisa de você + Agenda) e painel de detalhe fixo à direita (`Surface`), com as mesmas ações. Sem sheet. A sidebar própria do legado sai, porque a sidebar do shell já cumpre o papel.

### Paisagem compacta (altura ≤560 px, paisagem)

Tabela densa somente leitura: saída, motorista, veículo, trajeto, solicitante e passageiros, com a barra de status. Tocar numa linha abre o sheet.

### Cor e tipografia

- Somente os tokens do design system 1.3.0.
- As cores próprias por tipo de serviço do legado saem: roxo, laranja e teal são proibidos. O tipo aparece como texto.
- **Mapa status → tom:**

| Status | Tom |
| --- | --- |
| Confirmado | sucesso |
| Concluído | sucesso |
| Requer Análise | atenção |
| Cancelado | erro |
| Programado | info |
| Solicitado | neutro |
| Pré-reserva | neutro |
| Desconhecido | neutro |

- O estado derivado prevalece na barra lateral: atrasado = erro, ≤30 min = atenção.
- Título da página no `PageHeader` em Centabel; o resto em Manrope.

## 5. Ações, estados e erros

- **Mudar status:**
  - opções vindas de `choices('cr40f_reservadeveculos', 'cr40f_status')`;
  - mudança otimista, com o toast de sucesso "Status alterado para {rótulo}";
  - se falhar, rollback e toast de erro persistente com "Tentar de novo";
  - Cancelado pede confirmação no `Dialog`: "Cancelar o serviço #{código}?", com os botões "Manter serviço" e "Cancelar serviço".
- **Motorista:**
  - `Select` com busca. Cada opção tem como subtítulo o próximo serviço do motorista no dia ou "Livre";
  - motorista com saída a menos de 30 min do horário deste serviço mostra "Conflito: saída às HH:mm", sem bloquear a escolha;
  - mesma lógica de otimismo e rollback do status.
- **Ligar/WhatsApp:**
  - número normalizado (só dígitos; acrescenta 55 quando tiver 10 ou 11 dígitos);
  - sem número, o botão fica desabilitado com o texto "Sem telefone cadastrado".
- **Estados:**
  - primeira carga: `Skeleton` no formato das linhas;
  - dia vazio: `EmptyState` "Nenhum serviço para este dia" + "Ir para hoje";
  - filtro sem resultado: "Nenhum serviço deste motorista neste dia" + "Limpar filtro";
  - falha na atualização: mantém os dados e mostra na linha de frescor, em tom de atenção, "Não foi possível atualizar · última atualização HH:mm";
  - falha na primeira carga: `Alert` de erro com o motivo e "Tentar de novo";
  - modo seguro: `Alert` informativo "Alguns campos não estão disponíveis; mostrando a versão reduzida".
- A versão (`BuildBadge`) continua visível em todos os estados, porque vem do shell.

## 6. Motion

Só CSS, sem biblioteca. Anima apenas `transform` e `opacity`, com os tokens `--bt-ease-*` e `--bt-duration-*`.

| Elemento | Entrada | Saída | Observação |
| --- | --- | --- | --- |
| Sheet | `translateY(100%)` → 0, 220 ms `ease-drawer` | ~160 ms | arrasto com pointer capture; fecha por distância (>25% da altura) ou velocidade > 0,11 px/ms; amortecimento acima do topo; ignora segundo toque |
| Backdrop do sheet | opacidade 0 → 0,48, 200 ms | 150 ms | sem blur |
| Pressionar linha/botão | `scale(.97)` 150 ms `ease-out` | — | hover só em `(hover: hover) and (pointer: fine)` |
| Badge após mudança otimista | crossfade 150 ms | — | transição, não keyframe (interrompível) |
| Linha nova/alterada após atualização | realce de fundo `--bt-color-action-soft` → transparente, 600 ms | — | sem deslocamento |
| Troca de dia (setas/swipe/teclado) | nenhuma | — | ação repetitiva: resposta imediata |

- Com `prefers-reduced-motion`, o sheet e o backdrop usam só opacidade e o press scale é removido.

## 7. Acessibilidade

- Sheet:
  - `role="dialog"`, `aria-modal="true"` e título acessível;
  - foco contido e devolvido à linha de origem;
  - fecha por Esc, por toque no backdrop ou pelo botão Fechar.
- As linhas da agenda são `<button>` reais e a ordem do DOM segue a ordem visual.
- Status nunca é comunicado só por cor: tem texto ou rótulo junto.
- Alvos de 44 px no touch.
- Linha de frescor com `role="status"` e `aria-live="polite"`. Toasts de erro com `role="alert"`.

## 8. Testes, entrega e sequência

- **Isolamento:** worktree `.claude/worktrees/operacional-react`, branch `feat/operacional-react`, commits em português e PR para a `main`.
- **Vitest:**
  - `domain/*` com casos de borda: meia-noite, sem horário, status com acento ou soft hyphen, conflito exatamente em 30 min;
  - `queries` (montagem de URL, modo seguro, lotes);
  - `mutations` (payload);
  - `useOperacional` (otimismo, rollback, pausa com aba oculta);
  - `metadata.choices`;
  - `Sheet` (fechar por Esc e backdrop, retorno de foco).
- **Navegador** (navegador interno, `pnpm dev` com dados de exemplo):
  - 375 × 812 em retrato;
  - 1280 de largura (desktop);
  - 812 × 375 em paisagem;
  - teclado e foco, arrasto do sheet e redução de movimento.
- **Pré-requisito antes de liberar a escrita:** levantar em DEV os flows do Power Automate acionados por mudança em `cr40f_status` e no motorista da reserva, e registrar os efeitos na PR.
- **Publicação:** somente em DEV com `pnpm push`, depois do levantamento acima e do ok do Renan. Informar a versão publicada. PROD não é tocado.
- **Sequência dos próximos módulos** (cada um com spec própria):
  1. Currículos
  2. Preview Cotações
  3. Voucher
  4. Despesas
  5. Funções Operacionais
  6. Dashboard
  7. Formulário Geral como tela de Reserva (Fase 3)
  8. Scripts de formulário e Campo de Endereço, depois da Reserva em React

## 9. Critérios de aceite

- [ ] A rota `#/operacional` abre no shell e substitui o item `new_TelaOperacional` no menu.
- [ ] As regras de domínio têm paridade com o legado e estão cobertas por testes.
- [ ] A faixa Precisa de você mostra P1, P2 e P3 com uma ação direta em cada item.
- [ ] As quatro ações funcionam em DEV, com otimismo, rollback e toasts.
- [ ] A atualização automática roda a cada 60 s só com a aba visível, e a linha de frescor está sempre à vista.
- [ ] Os layouts de retrato, desktop e paisagem compacta foram verificados no navegador.
- [ ] Só tokens do design system: nenhuma cor nova, nenhum gradiente.
- [ ] `pnpm test` e o build passam, e a versão aparece na UI.
