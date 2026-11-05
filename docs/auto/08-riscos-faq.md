# Riscos conhecidos e FAQ

Riscos reunidos dos achados em [05](05-ambiente-scripts-deploy.md), [06](06-backend-dataverse.md) e [07](07-apps-satelites.md), mais as regras do `CLAUDE.md`.

## Riscos

| Risco | Evidência | Mitigação sugerida |
| --- | --- | --- |
| `wrangler.jsonc` do portal-cliente com `TROCAR_PELO_ID_DO_KV`; sem script de deploy | `apps/portal-cliente/wrangler.jsonc` | Criar o KV, trocar o id e definir script de publicação |
| Scripts `push:plugin:*:dev` com caminho absoluto do checkout principal | `package.json` raiz | Usar caminho relativo; hoje só funcionam nesta máquina |
| `deploy.yml` não roda typecheck nem testes; só dispara pelos `paths` listados | `.github/workflows/deploy.yml` | Depende do CI do PR; manter a `main` verde |
| `bump-version.test.mjs` e testes de `scripts/` fora de `pnpm test` | `packages/deploy/package.json` | Incluir no script de teste ou no CI |
| Custom APIs e flows sem código no repo (`new_*TrocaDeCarro`, `new_ExpirarTermoMulta` etc.) | [06](06-backend-dataverse.md) §2 | Versionar ou documentar a origem |
| Plantão usa credencial de leitura do PROD; mascaramento por regex pode deixar passar formato não previsto | `scripts/plantao/` | Revisar padrões do `mascarar.mjs` |
| Hotfix direto no PROD cria camada Active que precisa sair antes do import | `CLAUDE.md`, `solucoes/remover-camadas-active.ps1` | Seguir `publicar.yml` |
| Identificadores de modelo de IA são literais no código; validade na API não conferida | `packages/agentes-ia`, `packages/despesas-ia` | Conferir na API antes de depender |
| `@betinhos/ui` vem do GitHub Packages: instalar exige token `read:packages` | `README.md` | Configurar `~/.npmrc` (nunca no repo) |

## FAQ

**Como rodo localmente?** `pnpm install` (token `read:packages` no `~/.npmrc`), depois `pnpm dev`; abre em `http://localhost:36472` em modo mock (só navegação, sem dados).

**Como testo e valido tipos?** `pnpm test` e `pnpm typecheck` na raiz. Os testes C# dos plugins ficam em `packages/plugins/*.Tests`; como rodá-los: **não confirmado**.

**Como publico no DEV?** Merge na `develop` (workflow Deploy), ou `pnpm push` do checkout principal na `develop`. Nunca de worktree ou de branch de feature.

**E TEST/PROD?** Merge da `develop` na `main` (workflow Produção): só a tela vai direto ao PROD; o resto passa pelo ensaio no TEST, backup e aprovação do Renan.

**Onde mudo componentes visuais?** No repo `design-system-betinhos`; aqui só se atualiza a versão de `@betinhos/ui`.

**Por que há iframes?** Telas legadas ainda abrem como WebResource e chamam `parent.Xrm`, atendido pelo `Xrm` do host ou por um shim (`packages/dataverse/src/xrm.ts`).

**Como adiciono uma rota?** Item em `apps/shell/src/nav/menu.ts` e página em `apps/shell/src/pages/<modulo>`, registrada em `app/routes.tsx`. Detalhes em [03](03-mapa-modulos.md).

**Onde vejo as variáveis de ambiente?** [05](05-ambiente-scripts-deploy.md) §3 (somente nomes) e `.env.example`.

## Limites desta documentação

Gerada por leitura estática do código. Nada foi executado contra Dataverse, PROD ou serviços externos, e os testes não foram rodados. Lacunas específicas estão no fim de cada documento e marcadas "não confirmado".
