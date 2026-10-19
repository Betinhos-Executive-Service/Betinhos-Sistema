# Publicação no PROD

O PROD (`orgf261ae8e`) recebe mudanças **somente pela solução gerenciada AppBetinhos**, exportada do DEV (`org23b93544`). Publicar componente direto no PROD cria uma camada "Active" não gerenciada. Essa camada fica por cima da solução, e os imports seguintes deixam de valer para aquele componente: o PROD continua servindo a versão antiga sem dar erro.

## Regras

- **Uma solução dona por componente.** Tudo do App Motoristas fica na AppBetinhos. Não crie outra solução com componentes que já estão nela; uma gerenciada importada por cima sombreia a AppBetinhos.
- **Scripts de publicação só alteram o DEV.** `scripts/lib/assert-dev-environment.ps1` bloqueia `deploy-webresource`, `provision-*`, registro de plugin, papéis e segurança de campo fora do DEV. Exceção consciente, só em emergência: `BETINHOS_ALLOW_DIRECT_PROD=1`. Depois, leve a mesma mudança ao DEV e remova a camada Active.
- **Ordem:** develop -> main -> `npm run push` (DEV, pela main) -> `scripts/deploy-prod.ps1 -Apply`.

## Comandos

```powershell
# Plano, sem alterar nada
powershell -ExecutionPolicy Bypass -File scripts/deploy-prod.ps1
# Publica: sobe a versão no DEV, exporta a gerenciada, confere o ZIP, importa no PROD e verifica
powershell -ExecutionPolicy Bypass -File scripts/deploy-prod.ps1 -Apply
# Auditoria somente leitura: componentes com camada acima da AppBetinhos
powershell -ExecutionPolicy Bypass -File scripts/audit-prod-layers.ps1 -OutFile camadas.csv
# Web resource preso em camada Active: mostra antes, remove com -Apply (faz backup)
powershell -ExecutionPolicy Bypass -File scripts/remove-prod-active-layer.ps1 -WebResourceName new_app-motoristas-v2
```

O `deploy-prod.ps1` falha em três casos: a main não está limpa e igual a `origin/main`; o DEV não serve a versão do `package.json`; ou, depois do import, o PROD não serve essa versão.

## Estado em 19/10/2026

- A solução BetinhosInfleetLink foi desinstalada do PROD. Os 25 componentes dela já estavam na AppBetinhos 1.0.0.268. O retrato do PROD ficou idêntico antes e depois: 82 Flows ativos, 742 etapas, 457 Custom APIs e os 7 campos da Infleet.
- Ainda há camadas Active sombreando a AppBetinhos no PROD, criadas por publicação direta: 9 Flows, 28 etapas de plugin, 1 assembly e 3 web resources (Composição de Preço e Planner). Remova cada uma só depois de compará-la com o DEV, porque ela pode conter um hotfix que nunca voltou ao DEV.
- A solução gerarpagantes fica por cima da AppBetinhos em 12 web resources e 1 assembly. É preciso decidir qual das duas é a dona desses componentes.
