# Documentação automática: App Motoristas

Gerada em 03/11/2026 por leitura do código (branch `docs/auto-app-motoristas`, versão do app `2.1.814`). Nada foi publicado, enviado ou gravado em Dataverse/PROD. Itens sem evidência no código estão marcados **não confirmado**.

| Arquivo | Conteúdo |
|---|---|
| [01-visao-geral-e-arquitetura.md](01-visao-geral-e-arquitetura.md) | O que é, stack, diagramas Mermaid de contexto e arquitetura, runtimes, PWA, ambientes |
| [02-mapa-de-modulos-e-telas.md](02-mapa-de-modulos-e-telas.md) | Telas e hashes, deep links, módulos `src/lib` e `src/app`, regras de rota |
| [03-contratos-de-dados.md](03-contratos-de-dados.md) | Tabelas, colunas, choices, payloads, Custom APIs, plugins, Flows |
| [04-fluxos-principais.md](04-fluxos-principais.md) | Sequências e fluxogramas: agenda, serviço, QR, manutenção/troca, gastos, colisão, recibo, módulos de RH |
| [05-ambiente-e-scripts.md](05-ambiente-e-scripts.md) | Variáveis (só nomes), scripts npm e catálogo de `scripts/` |
| [06-como-rodar-buildar-publicar.md](06-como-rodar-buildar-publicar.md) | Rodar em mock, testes, publicar DEV e PROD, cloud |
| [07-riscos-conhecidos.md](07-riscos-conhecidos.md) | Riscos desta leitura e os já documentados |
| [08-faq.md](08-faq.md) | Perguntas frequentes |

## Verificação feita para este levantamento

- `node --test --experimental-strip-types tests/*.test.ts`: **415 passaram, 0 falharam** (sem `node_modules`).
- Não executados: `tsc`, `npm run build`, testes .NET, qualquer script de publicação ou consulta ao Dataverse.

## Limites

- Metadata real do Dataverse (existência de colunas, steps de plugin, Flows ativos, papéis) não foi consultada: os contratos refletem o que o código lê e escreve.
- Scripts de `scripts/` foram catalogados por nome e cabeçalho; só `push-dev.ps1`, `deploy-prod.ps1`, `build-react-singlefile.cjs` e `dev-server.cjs` foram lidos com atenção.
- Telas pouco detalhadas aqui (leitura parcial): `ReceiptScreen`, `MyVehicleScreen`, `IdeasScreen`, tour guiado.
- Documentos anteriores do repositório (`system_architecture.md`, `PENDENCIAS_PRODUCAO.md`, `docs/`) podem divergir do código atual.
