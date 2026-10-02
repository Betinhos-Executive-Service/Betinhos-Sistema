# Betinhos-Sistema

Monorepo do sistema da Betinhos Executive Service em WebResources do Dataverse / Power Platform.
O objetivo é substituir por completo o app model-driven por um shell React único.

## Estrutura

```
apps/shell/          Shell React (menu, rotas por hash, moldura das telas) -> cr40f_SistemaBetinhos.html
packages/dataverse/  Cliente da Web API, metadata, valores formatados e Xrm mínimo para telas legadas
packages/ui/         Tokens do Design System Betinhos, primitives de layout e selo de versão
packages/deploy/     Bump de versão, HTML único e publicação no Dataverse DEV
legacy/              Módulos atuais copiados como estão, até virarem rotas do shell
```

## Comandos

| Comando | O que faz |
| --- | --- |
| `pnpm dev` | Shell em `http://localhost:36472` (fora do Dataverse: só navegação, sem dados) |
| `pnpm test` | Testes de todos os pacotes |
| `pnpm wr` | Incrementa a versão e gera `apps/shell/dist/webresource.html` |
| `pnpm push` | `wr` + publica o shell e o carregador no Dataverse DEV, inclui na solução e valida |
| `pnpm tokens` | Copia o `design-tokens.css` gerado pelo Design System Betinhos |

## Configuração

Copie `.env.example` para `.env` e preencha a URL do ambiente DEV, os hosts bloqueados (PROD),
o Client ID do login MSAL e a solução. O `.env` não é versionado. O `pnpm push` exige o módulo
PowerShell `MSAL.PS` e se recusa a publicar em host bloqueado.

## Como o shell abre cada item do menu

O menu em `apps/shell/src/nav/menu.ts` espelha o sitemap do app model-driven:

- `webresource`: tela já existente, aberta em iframe pelo nome do WebResource.
- `entity`: tabela ainda atendida pela lista e pelo formulário nativos (temporário).
- `external`: link que abre em nova aba.
- `unavailable`: item que o shell ainda não consegue abrir.

À medida que cada tela é migrada, o item passa a apontar para uma rota React do próprio shell.

## Fases

0. Fundação: workspace, shell, pacotes compartilhados e publicação em DEV. **Concluída.**
1. Importar os módulos atuais para `legacy/` e unificar o deploy.
2. Motor genérico de lista e formulário por metadata para as tabelas simples.
3. Telas dedicadas: Reserva, Composição de Preços e Financeiro.
4. Converter os módulos legados em rotas React.
5. Virada: shell por URL direta e retirada do model-driven.

## Versão de build

Cada `pnpm wr`/`pnpm push` incrementa o PATCH em `apps/shell/package.json`. A interface mostra
`v0.0.1 · dd/mm/aaaa HH:mm` (America/Sao_Paulo) em todas as telas.
