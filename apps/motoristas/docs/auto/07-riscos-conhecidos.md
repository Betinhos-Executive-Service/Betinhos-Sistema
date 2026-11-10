# 07. Riscos conhecidos

Separados por origem: **A** = achado desta leitura do código; **B** = já documentado no repositório (não reconferido contra o Dataverse). Nenhuma correção foi aplicada.

## A. Achados desta leitura

| # | Risco | Evidência | Impacto |
|---|---|---|---|
| A1 | URLs de Flow chegam ao navegador do motorista e são chamadas sem identidade do usuário. Duas delas podem ser **embutidas no HTML** pelo build (`VITE_FLOW_GERAR_VOUCHER_URL`, `VITE_FLOW_SALVAR_FOTOS_MANUTENCAO_URL`) | `build-react-singlefile.cjs` (`flowEnv`); `resolveFlowUrl` | Quem tiver a URL pode chamar o Flow. Confirmar se o build de publicação usa essas variáveis (**não confirmado**) |
| A2 | Variáveis `VITE_FLOW_ENVIAR_RECIBO_CLIENTE_URL`, `VITE_FLOW_LEITURA_RAPIDA_URL`, `VITE_FLOW_DESPESA_ASYNC_URL` são citadas no código mas o build não as embute | `FLOW_URLS` × `build-react-singlefile.cjs` | Fallback documentado em código não funciona; só vale a variável Dataverse |
| A3 | `npm run build` altera `package.json`/`package-lock.json` (PATCH+1) e regrava `dist/` | `bumpPatchVersion` | Diffs de versão acidentais em PR; conflitos entre branches paralelas |
| A4 | `esbuild` não está declarado em `package.json`; vem transitivo do Vite 5 | `package.json`, lockfile | Atualizar/remover o Vite pode quebrar o build de publicação |
| A5 | Dois lockfiles (`package-lock.json` oficial, `pnpm-lock.yaml` defasado) e `pnpm-workspace.yaml` presente | raiz | Instalação por pnpm divergiria do que é publicado |
| A6 | `build-react-webresource.cjs`, `build-single-file.cjs`, `inline-dist-single-file.cjs`, `vite.config.ts` e `remotion` (scripts `demo:*`, pasta ausente) parecem legados/quebrados | `package.json`, árvore | Confusão sobre o build correto; `npm run demo:render` falha neste checkout (pasta `remotion/` inexistente) |
| A7 | `npm run push` depende de caminho absoluto de outra máquina/pasta (`C:/Users/mendo/Desktop/vscode/Sistema Betinhos/...`) | `package.json` | Só funciona na máquina do Renan; em outro ambiente apenas avisa |
| A8 | Regra de negócio fixa no código: cliente cujo nome casa `/tenn?aris/i` vai para voucher | `detailFlow.ts` | Mudança de cliente exige release do app |
| A9 | URL do DEV fixa em `dataverse.ts` (`DEV_DATAVERSE_URL`) para decidir o prefixo `DEV/` das pastas | `shouldUseDevFolderPrefix` | Novo ambiente de teste gravaria sem prefixo |
| A10 | Filtros de agenda dependem de `new_foiprogramado`, `cr40f_om`/`cr40f_ot` nulos e janela de 3 dias à frente; histórico só 5 dias (colaborador) | `loadRemoteStore` | Serviços fora dessa janela não aparecem; regra de negócio não verificada |
| A11 | Valores de choice espalhados (ex.: 202410008 concluído, 202410000 programada) sem fonte única; `new_mododajanela` "fixa" não tem valor no front | `dataverse.ts` | Mudança de metadata silenciosa quebra filtros |
| A12 | `src/lib/dataverse.ts` tem ~4,4 mil linhas e `App.tsx` ~4 mil | `wc -l` | Custo de manutenção; `system_architecture.md` já pede extrair regras puras |
| A13 | Cobrança por QR: o Flow do webhook não valida HMAC do Stripe; a defesa é consultar o Stripe pelo id da sessão | cabeçalho de `cobranca-qr-webhook-flow.cjs` | Depende de o plugin sempre espelhar o Stripe |
| A14 | Dados de passageiros (nome, telefone) ficam no `localStorage` (`app-motoristas-local-v1`) e fotos/assinaturas no IndexedDB por 7 dias | `bootstrap.ts`, `mediaDraftStore.ts` | Dados pessoais no aparelho (item S6 abaixo) |
| A15 | Nesta branch não foi possível rodar `tsc`, `npm run build`, testes .NET nem qualquer chamada ao Dataverse | `06` | Estado de tipos/build/plugins **não confirmado** aqui |
| A16 | Tabelas e colunas usadas por `treinamentos`/`new_checklistveiculo` são provisionadas por outro repositório (Sistema Betinhos) e por scripts; o front falha com 400 se faltarem colunas | comentários em `treinamentos.ts`, `push-dev.ps1` | Ordem de publicação importa |

## B. Já documentado no repositório

- **Revisão de segurança de 01/11/2026** (`docs/seguranca/2026-11-revisao-app-motoristas.md`), achados S1–S11: segredos em variáveis de ambiente tipo String legíveis por motoristas (S1, crítico); URLs de Flow sem identidade e sem expiração (S2); sessões Entra não revogadas e dados locais no aparelho (S3); Custom APIs sem *Execute Privilege* (S4); papel `Basic User` na equipe (S5); agenda com passageiros em `localStorage` (S6); vulnerabilidades em dependências de desenvolvimento (S7, produção com 0 no `npm audit --omit=dev` em 01/11); WebResource sem CSP e fontes do Google (S9); `new_OrganizarObservacao` aceita texto de qualquer usuário e envia à Anthropic (S10); `prvWrite` desnecessário em `new_AppMotoristasLog` (S11). Estado de cada decisão: consultar o documento (maioria "Decisão do Renan"). Plano em `docs/seguranca/2026-11-plano-segredos-e-flows.md`.
- **PROD só por solução gerenciada** (`docs/deploy-prod.md`, memória do projeto): camada Active sombreia a AppBetinhos; auditar antes de remover.
- **Plugin único**: publicar de branch desatualizada apaga código de outras frentes no DEV (AGENTS.md).
- **`PENDENCIAS_PRODUCAO.md`** e **`AUDITORIA_APP_MOTORISTAS_2026-06-11.md`**: listas antigas de pendências (jun/2026); partes já podem estar resolvidas. **Não confirmado** o que ainda vale.
- **Regra de QR**: sem mock fora de localhost (decisão de 21/10/2026).
