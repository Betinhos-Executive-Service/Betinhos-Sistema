# 08. FAQ

**O app roda fora do Dataverse?**
Só em `localhost` (modo mock). Em outro host sem `Xrm` e fora de `*.dynamics.com`, `getWebApi()` lança "Dataverse indisponível". Nunca há dados de exemplo fora de `localhost`.

**Por que a tela abre mas pede para "abrir pelo Power Apps ou pelo link do Dataverse"?**
As Custom APIs (`customApi.ts`) precisam de `Xrm.WebApi.online.execute` ou do host `*.dynamics.com` (fetch com cookie). Abrir o HTML de outro lugar não serve.

**Como o motorista é identificado?**
Pelo e-mail do `systemuser` logado ↔ `cr40f_funcionarios.cr40f_emailmicrosoft` (funcionário ativo, `cr40f_status eq 0`). Zero ou mais de um resultado = erro.

**Por que um serviço não aparece na agenda?**
Precisa: motorista = logado, `new_foiprogramado = true`, categoria serviço, status ≠ concluído, sem `cr40f_om` e `cr40f_ot`, e saída até 3 dias à frente. Manutenções exigem `cr40f_om` preenchido; trocas, status Programada. Ver `03`.

**Quando o fluxo vai para Voucher em vez de Finalizar?**
Hoje, quando o campo Cliente casa `/tenn?aris/i` (`detailFlow.ts`). Antes, se o serviço exige "Receber", o motorista passa pelo comprovante (ou QR pago no total).

**O voucher deu erro 504. Posso reenviar?**
O app não reenvia: consulta o Dataverse até 21 vezes (3 s) para ver se o Flow concluiu e só então finaliza. Se não confirmar, mostra o erro original e preserva o rascunho.

**Cobrança por QR não aparece.**
Falta `cr40f_podecobrarqrcode` no cadastro do funcionário, ou a coluna não existe no ambiente (o app desativa em silêncio com aviso), ou a Custom API `new_CobrancaQR`/chave do Stripe não estão provisionadas.

**Despesa foi para o modo "legado" ou "assíncrono"?**
Assíncrono só se `new_FlowURLDespesaAsync` tem valor **e** os anexos têm as colunas `new_uploadattemptid`, `new_uploadrunid`, `new_uploaderror`, `cr40f_mimetype`, `cr40f_driveitemid`. Qualquer falha antes de criar registros usa o legado.

**O toque da notificação não abre a tela certa.**
Depende do web resource `new_appmotoristas_push_redirect` registrado no OnLoad dos forms (`provision-push-redirect.ps1`) e do parâmetro de deep link (`02`). Estado real nos ambientes: **não confirmado**.

**Posso editar `dist/`?**
Não; é gerado por `npm run build`.

**Por que `npm run build` mudou `package.json`?**
Faz bump de PATCH e grava a versão exibida no rodapé. Use `--no-version` para não alterar (`dev` já usa).

**Como publico só o web resource?**
`npm run deploy:webresource` (ou `scripts/deploy-webresource.ps1 -EnvironmentUrl <DEV>`). Atenção: sem os provisionamentos de schema do `push-dev.ps1`, colunas novas podem faltar e a consulta devolver 400.

**Dá para publicar direto no PROD?**
Não pelo fluxo normal: `deploy-prod.ps1 -Apply` (solução gerenciada). Exceção de hotfix: `BETINHOS_ALLOW_DIRECT_PROD=1`, que cria camada Active a remover depois.

**O que fazer se `npm ci` falhar com 401/404 em `@betinhos-executive-service/ui`?**
Definir `NODE_AUTH_TOKEN` com token GitHub `read:packages` (`.npmrc` registra `https://npm.pkg.github.com` para esse escopo).

**Onde ficam logs de erro?**
`new_appmotoristaslog` (app, via pacote UI; dados sensíveis redigidos), `plugintracelog` (plugins, `Ref` = `correlationid`) e console `[AppMotoristas:Dataverse]`.

**O app funciona offline?**
Só abre o HTML pelo service worker (PWA). Dados, fotos e login nunca são cacheados. Rascunhos locais (voucher, observação, mídia de finalização, envios de despesa pendentes) sobrevivem a recarregar.

**Quais testes cobrem o quê?**
`tests/*.test.ts` (56 arquivos, 415 testes) cobrem payloads, regras de fluxo, câmera, despesas, comunicados, checklists, termos, tour, push redirect, higiene do repositório etc. Plugins: `plugins/*.Tests` (35 arquivos de teste em C#, não executados aqui).
