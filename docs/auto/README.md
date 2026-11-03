# Documentação automática — Sistema Betinhos

Gerada a partir do código do repositório (base `origin/main`, shell `v0.0.129`). Leitura estática: nada foi executado contra Dataverse ou serviços externos. Itens sem evidência estão marcados **não confirmado**.

| Doc | Conteúdo |
| --- | --- |
| [01-visao-geral-arquitetura.md](01-visao-geral-arquitetura.md) | O que é, componentes, arquitetura e pipeline (Mermaid) |
| [02-fluxos-principais.md](02-fluxos-principais.md) | Abertura do shell, listas, erros e plantão, build e publicação |
| [03-mapa-modulos.md](03-mapa-modulos.md) | Rotas e telas do shell, host, `@betinhos/dataverse` |
| [04-contratos-dados-shell.md](04-contratos-dados-shell.md) | Tabelas, campos, choices, Custom APIs e payloads por módulo |
| [05-ambiente-scripts-deploy.md](05-ambiente-scripts-deploy.md) | Scripts, variáveis (só nomes), como rodar, buildar e publicar, CI/CD, soluções |
| [06-backend-dataverse.md](06-backend-dataverse.md) | Plugins C#, Custom APIs, schema provisionado, flows, IA |
| [07-apps-satelites.md](07-apps-satelites.md) | Portal do cliente, cadastro de passageiro, escala FDS, Planner, legado, plantão |
| [08-riscos-faq.md](08-riscos-faq.md) | Riscos conhecidos e perguntas frequentes |

Regras do projeto que valem ao usar estes documentos: `pnpm push` só na `main` do checkout principal; TEST e PROD só pelo workflow "Publicar soluções" (`CLAUDE.md`).
