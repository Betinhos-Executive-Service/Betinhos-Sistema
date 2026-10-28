# Portal de validação pelo cliente — protótipo React — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o app `apps/portal-cliente` em React, no Design System Betinhos e com dados fictícios, para mostrar à Tenaris. Ele é a base do portal real.

**Architecture:** É um app Vite + React + TypeScript independente do shell, com o mesmo `@betinhos/ui`. As telas falam com uma interface `PortalApi`; o protótipo usa `createMockApi()` (em memória, com 30 serviços fictícios). O portal real troca só o adaptador, que vai chamar o Worker (`/api/*`). As regras de status e de dias úteis ficam em funções puras testadas.

**Tech Stack:** React 19, Vite 7, TypeScript 5.9, `@betinhos/ui` 1.15.x (`npm:@betinhos-executive-service/ui`), `lucide-react`, Vitest + Testing Library + jsdom e `exceljs` (carregado só ao exportar).

**Spec:** `docs/superpowers/specs/2026-10-28-portal-validacao-cliente-design.md`

## Global Constraints

- Design System Betinhos 1.14 (`C:\Users\mendo\Desktop\vscode\DESIGN_SYSTEM.md`):
  - só tokens `--bt-*` semânticos; sem gradiente; tema só claro;
  - Manrope, com Centabel só no título de página; ícones Lucide;
  - `#FCFCFB` em listas, campos e buscas;
  - `scale(.97)` no press; entradas `ease-out` de 180–220 ms; `prefers-reduced-motion` respeitado.
- Versão de build sempre visível com `BuildBadge` (`v0.0.1 · dd/mm/aaaa HH:mm`). `pnpm dev` e o build incrementam o PATCH com `packages/deploy/bump-version.mjs`. A versão inicial é `0.0.0`.
- Porta exclusiva do dev server: **52463**, via `packages/deploy/dev-restart.mjs`, registrada em `C:\Users\mendo\.codex\dev-ports.json`.
- Textos em pt-BR, datas `dd/mm/aaaa HH:mm` em America/Sao_Paulo e moeda `R$ 1.234,56`.
- Passageiro aparece só pelo nome, sem telefone nem e-mail.
- Funciona a partir de 320 px sem rolagem horizontal. Drawer no desktop e Sheet abaixo de 820 px.
- Nada deste protótipo grava no Dataverse.
- **Exceção ao §10.9.1 (visões salvas)**: o portal externo tem poucos validadores e uma única lista. Ele usa uma linha de comando com segmentos de status, filtros e busca, sem visões salvas. Precisa de aprovação do Renan.

---

### Task 1: Scaffold do app

**Files:**
- Create: `apps/portal-cliente/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/test-setup.ts`, `src/vite-env.d.ts`
- Test: `apps/portal-cliente/src/App.test.tsx`

**Interfaces:**
- Produces: `App` (componente raiz). Os globais `__APP_VERSION__` e `__BUILD_DATE__` vêm do `vite.config.ts`.

- [ ] Criar o `package.json`:
  - nome `@betinhos/portal-cliente`, versão `0.0.0`;
  - scripts `dev` (`node ../../packages/deploy/bump-version.mjs . && node ../../packages/deploy/dev-restart.mjs 52463 .`), `typecheck`, `test` e `build` (bump + tsc + vite build);
  - dependências espelhando o shell (react, react-dom, `@betinhos/ui`, lucide-react, exceljs; dev: vite, vitest, testing-library, jsdom, typescript).
- [ ] Criar o `vite.config.ts` com `define` de versão e data, e o `test.server.deps.inline` para `@betinhos/ui`, como no shell.
- [ ] Teste: `App` renderiza o texto da versão (`v0.0.` …) e o título "Validação de serviços".
- [ ] Rodar `pnpm install` e depois `pnpm --filter @betinhos/portal-cliente test`. Deve passar.
- [ ] Registrar a porta 52463 no `dev-ports.json`.
- [ ] Commit.

### Task 2: Domínio (status, prazos, formatação)

**Files:**
- Create: `apps/portal-cliente/src/domain/types.ts`, `src/domain/regras.ts`, `src/domain/formato.ts`
- Test: `src/domain/regras.test.ts`, `src/domain/formato.test.ts`

**Interfaces:**
- Produces:
  - `type Status = 'liberado' | 'em_duvida' | 'respondido' | 'aprovado' | 'aprovado_tacito'`
  - `type Motivo = 'espera' | 'km_rota' | 'valor' | 'passageiro' | 'outro'`
  - `type LinhaPreco = { rotulo: string; valor: number }`
  - `type Mensagem = { id: string; lado: 'cliente' | 'betinhos'; autor: string; texto: string; motivo?: Motivo; criadaEm: string }`
  - `type Servico = { id: string; numero: string; pedidoCliente: string; cr: string; saida: string; origem: string; destino: string; passageiros: string[]; solicitante: string; veiculo: string; status: Status; liberadoEm: string; prazoTacito: string; valorTotal: number; valorAnterior?: number; composicao: LinhaPreco[]; observacao?: string; voucherUrl?: string; mensagens: Mensagem[]; aprovadoPor?: string; aprovadoEm?: string }`
  - `somarDiasUteis(inicioIso: string, dias: number, feriados: string[]): string` (resultado no fim do dia útil, America/Sao_Paulo)
  - `diasUteisRestantes(prazoIso: string, agoraIso: string, feriados: string[]): number`
  - `podeAprovar(s: Servico): boolean` (status em liberado, em_duvida ou respondido)
  - `statusInfo(s: Status): { rotulo: string; tom: StatusTone }`
  - `MOTIVOS: { value: Motivo; label: string }[]`
  - `brl(n: number): string`, `dataHora(iso: string): string`, `data(iso: string): string`

- [ ] Testes de `somarDiasUteis`:
  - liberado na sexta 23/10/2026 + 5 → sexta 30/10;
  - liberado na sexta 30/10 com feriado 02/11 (Finados) + 5 → segunda 09/11;
  - liberado no sábado → conta a partir de segunda.
- [ ] Testes de `podeAprovar`: verdadeiro para liberado, em dúvida e respondido; falso para aprovado e aprovado tácito.
- [ ] Testes de `brl(1234.5)` → `R$ 1.234,50` e de `dataHora`, no fuso de São Paulo.
- [ ] Implementar e rodar até passar. Commit.

### Task 3: API do portal e adaptador mock

**Files:**
- Create: `src/api/PortalApi.ts`, `src/api/mockApi.ts`, `src/api/mockDados.ts`, `src/api/ApiContext.tsx`
- Test: `src/api/mockApi.test.ts`

**Interfaces:**
- Produces:
  - `interface PortalApi { solicitarCodigo(email: string): Promise<void>; entrar(email: string, codigo: string): Promise<Sessao>; sair(): Promise<void>; listar(): Promise<Servico[]>; aprovar(ids: string[]): Promise<Servico[]>; abrirDuvida(id: string, motivo: Motivo, texto: string): Promise<Servico>; responder(id: string, texto: string): Promise<Servico> }`
  - `type Sessao = { nome: string; email: string; cliente: string }`
  - `class ErroPortal extends Error { codigo: 'codigo_invalido' | 'codigo_expirado' | 'bloqueado' | 'nao_permitido' | 'falha' }`
  - `createMockApi(opts?: { atrasoMs?: number; agora?: () => Date }): PortalApi`. Os validadores do mock são `fiscal@tenaris.com` e `financeiro@tenaris.com`, e o código é `123456`. Qualquer outro e-mail não gera erro em `solicitarCodigo`, mas `entrar` responde `codigo_invalido`. Cinco códigos errados levam a `bloqueado`.
  - `ApiProvider` e `useApi()`.
- [ ] Testes do mock:
  - `aprovar` muda o status e grava `aprovadoPor`;
  - `aprovar` de um item já aprovado é ignorado;
  - `abrirDuvida` sem texto rejeita com `nao_permitido`;
  - `abrirDuvida` cria uma mensagem com motivo e muda para `em_duvida`;
  - `responder` acrescenta a mensagem do cliente e muda para `em_duvida`;
  - o quinto código errado bloqueia.
- [ ] `mockDados.ts` traz 30 serviços de out/2026:
  - distribuição: 14 liberados, 4 em dúvida, 3 respondidos, 6 aprovados e 3 aprovados tácitos;
  - 3 CRs, com composição em 3 a 6 linhas;
  - 2 serviços com `valorAnterior`, observações curtas e conversas realistas e curtas.
- [ ] Implementar e rodar até passar. Commit.

### Task 4: Tela Entrar

**Files:**
- Create: `src/telas/Entrar.tsx`, `src/telas/Entrar.css`
- Modify: `src/App.tsx` (estado de sessão: sem sessão → Entrar)
- Test: `src/telas/Entrar.test.tsx`

- [ ] Etapa 1: campo e-mail (`Field` + `Input type=email`, `autoComplete="email"`) e botão "Enviar código".
- [ ] Etapa 2: texto "Enviamos um código de 6 dígitos para <e-mail>", campo do código (`inputMode="numeric"`, `autoComplete="one-time-code"`, máximo 6), botões "Entrar" e "Trocar e-mail".
- [ ] Erros sempre em `Alert` danger, com o que fazer: código inválido, código expirado e bloqueio de 15 minutos. O e-mail não cadastrado não revela nada.
- [ ] No mock aparece a dica "Protótipo: use o código 123456".
- [ ] Layout: cartão central de no máximo 400 px sobre o canvas, com a marca "Betinhos Executive Service" em Manrope 800, sem logo inventado. Entrada da etapa 2 com `translateY(8px)` → 0 e opacidade em 200 ms `--bt-ease-out`.
- [ ] Testes: fluxo completo com 123456 chama `onEntrar` com a sessão; um código errado mostra o alerta; "Trocar e-mail" volta para a etapa 1.
- [ ] Commit.

### Task 5: Lista de serviços

**Files:**
- Create: `src/telas/Servicos.tsx`, `src/telas/Servicos.css`, `src/telas/filtros.ts`
- Test: `src/telas/filtros.test.ts`, `src/telas/Servicos.test.tsx`

**Interfaces:**
- Produces:
  - `type Filtro = { aba: 'pendentes' | 'em_duvida' | 'aprovados' | 'todos'; cr: string | null; busca: string }`
  - `filtrar(servicos: Servico[], f: Filtro): Servico[]`
  - `contar(servicos: Servico[]): Record<Filtro['aba'], number>`
- [ ] Estrutura da tela:
  - topo fixo com a marca, o nome do validador e o botão "Sair";
  - título "Serviços de outubro" (`heading.2`);
  - `SegmentedControl` com Pendentes, Em dúvida, Aprovados e Todos, cada um com contagem;
  - `Select` de CR, `SearchBox` (número, pedido, passageiro e trajeto) e "Exportar Excel" (secundário);
  - "Aprovar selecionados (N)" como única ação primária.
- [ ] `Table` sem `onRowClick`. A primeira coluna tem o `Checkbox` de seleção e o botão-texto do serviço (número + data/hora), que abre o detalhe. Demais colunas:
  - Trajeto;
  - Passageiros;
  - CR;
  - Valor (alinhado à direita, com "valor alterado" quando há `valorAnterior`);
  - Status (`StatusBadge` com ícone);
  - Prazo, com "Aprova em N dias úteis" quando o serviço pode ser aprovado.
- [ ] A barra de severidade marca em atenção o serviço com 1 dia útil ou menos para a tácita.
- [ ] O cabeçalho tem a opção "Selecionar todos os pendentes visíveis". Só serviços que podem ser aprovados são selecionáveis.
- [ ] Ao aprovar, aparece o toast "N serviços aprovados.", a seleção é limpa e a lista é atualizada.
- [ ] Estados:
  - carregando: `loading` da `Table`;
  - lista vazia por aba: `EmptyState` "Nada pendente por aqui." com o resumo do mês;
  - falha: `Alert` com "Tentar de novo".
- [ ] Em telas estreitas a `Table` vira card; a barra de ação em lote fica fixa no rodapé e respeita `safe-area-inset-bottom`.
- [ ] Testes de `filtrar` e `contar` (abas, CR e busca sem acento); teste de render com seleção de 2 e aprovação.
- [ ] Commit.

### Task 6: Detalhe do serviço e conversa

**Files:**
- Create: `src/telas/Detalhe.tsx`, `src/telas/Detalhe.css`, `src/telas/Conversa.tsx`
- Test: `src/telas/Detalhe.test.tsx`

- [ ] Abre em `Drawer` wide no desktop e em `Sheet` abaixo de 820 px (`useMediaQuery`). Seções:
  - cabeçalho: número, status e data;
  - dados: trajeto, passageiros, solicitante, veículo, pedido Tenaris e CR;
  - composição: tabela de linhas com o total em destaque e "Valor anterior: R$ X" quando houver;
  - observação da Betinhos em `Alert` info;
  - "Ver voucher (PDF)" como link externo, só se houver `voucherUrl`;
  - conversa.
- [ ] A conversa mostra as mensagens com o lado (Tenaris ou Betinhos), o autor, a data/hora e o motivo na primeira. A mensagem nova entra com `translateY(10px)` + opacidade em 180 ms `--bt-ease-out`.
- [ ] Rodapé com o status do serviço:
  - pode aprovar: "Aprovar serviço" (primário) e "Tenho uma dúvida" (secundário), que abre o formulário com `Select` de motivo e `Textarea`, mais o botão "Enviar dúvida";
  - respondido: "Responder" e "Aprovar serviço";
  - aprovado: texto "Aprovado por X em dd/mm/aaaa HH:mm".
- [ ] Fechar com o texto da dúvida preenchido abre o `Dialog` "Descartar alterações?" com "Continuar editando" e "Descartar".
- [ ] Testes: aprovar fecha e mostra o toast; enviar dúvida sem motivo mostra erro no campo; enviar com motivo adiciona a mensagem e muda o status; fechar com texto pede confirmação.
- [ ] Commit.

### Task 7: Exportar Excel

**Files:**
- Create: `src/excel/exportar.ts`
- Test: `src/excel/exportar.test.ts`

**Interfaces:**
- Produces: `linhasExcel(servicos: Servico[]): (string | number)[][]` (pura, testável) e `exportarExcel(servicos: Servico[], nomeArquivo: string): Promise<void>`, que importa `exceljs` dinamicamente e baixa o `.xlsx`.
- [ ] Colunas provisórias, até chegar o modelo da Juliana: Nº serviço, Pedido Tenaris, CR, Data, Origem, Destino, Passageiros, Status, Valor, Aprovado por, Aprovado em.
- [ ] Teste: `linhasExcel` gera o cabeçalho e uma linha por serviço, com o valor numérico e a data em `dd/mm/aaaa HH:mm`.
- [ ] Commit.

### Task 8: Verificação

- [ ] Rodar `pnpm --filter @betinhos/portal-cliente typecheck`, `test` e `build`.
- [ ] Rodar `pnpm dev` (porta 52463) e testar no navegador interno: entrar com 123456, filtrar por CR, selecionar 2, aprovar, abrir dúvida, responder e exportar Excel.
- [ ] Repetir em 375 px. Conferir console sem erros e `BuildBadge` visível em todas as telas.
- [ ] Rodar a `ux-audit` no modo Rápido.
- [ ] Rodar `qualidade-antes-do-pr` e `verificacao-manter`, criando a skill `verificar-portal-cliente`.
- [ ] Commit final.
