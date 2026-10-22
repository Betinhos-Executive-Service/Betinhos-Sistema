---
name: verificar-acesso-motorista
description: "Verifica o acesso de motoristas ao App Motoristas: drawer Cadastrar acesso e bloco Acesso ao app na ficha (apps/shell/src/pages/funcionarios/** arquivos de acesso), plugin Cr40f.Acesso.Plugin (Custom APIs cr40f_CadastrarAcessoMotorista e cr40f_EncerrarAcessoMotorista), registrador Cr40f.Acesso.Registrar e os scripts push-acesso-plugin.ps1 e provision-acesso.ps1. Use após mudar qualquer um deles."
---
# Verificar acesso ao App Motoristas

## Cobre
- Shell: `apps/shell/src/pages/funcionarios/` → `data/acesso.ts` (fonte, parse do erro do plugin, mensagem e link do WhatsApp), `data/acessoMock.ts`, `components/CadastroAcessoDrawer.tsx`, `components/AcessoApp.tsx`, `components/EncerrarAcessoDialog.tsx`, a ligação em `Ficha.tsx` e `FuncionariosPage.tsx` (botão "Cadastrar acesso" no topo da lista).
- Plugin: `packages/plugins/Cr40f.Acesso.Plugin/**` e testes em `packages/plugins/Cr40f.Acesso.Plugin.Tests/**`; registrador `packages/plugins/tools/Cr40f.Acesso.Registrar/**`; scripts `packages/plugins/scripts/push-acesso-plugin.ps1` e `packages/deploy/provision-acesso.ps1`.
- Spec: `docs/superpowers/specs/2026-10-22-acesso-motorista-design.md`; guia do Entra em `docs/acesso-motorista-entra.md`.

## Testes e tipos
1. `dotnet test packages/plugins/Cr40f.Acesso.Plugin.Tests/Cr40f.Acesso.Plugin.Tests.csproj` → "Com falha: 0" (68 em 22/10/2026).
2. `dotnet build packages/plugins/tools/Cr40f.Acesso.Registrar/Cr40f.Acesso.Registrar.csproj` → "0 Erro(s)".
3. Em `apps/shell`: `npx vitest run src/pages/funcionarios` (91 em 18 arquivos em 22/10/2026) e `npx tsc --noEmit` sem erros. `pnpm --filter` estoura o tempo nesta máquina; sob carga, um teste pode cair por timeout (ex.: `Anotacoes.test.tsx`, `MobileHome.test.tsx`): rode de novo uma vez e registre.

## Roteiro em mock (`pnpm dev`, porta 36472)
Sem Dataverse e sem Graph; o mock (`createAcessoMock`) guarda e-mails em memória até recarregar. Se a porta estiver ocupada por outra sessão, rode `npx vite --port <livre> --strictPort` em `apps/shell` e encerre o processo no fim.
1. `#/funcionarios` → botão "Cadastrar acesso" (topo) abre o drawer. Digitar "Ana Lúcia Lima" → prévia "ana.lima@betinhos.com.br" (prefixo derivado do nome, sem acento). Editar o prefixo à mão deixa de seguir o nome.
2. Celular `12999990000` → "Criar acesso" → resultado com e-mail, senha temporária, link `https://org23b93544.crm2.dynamics.com/WebResources/new_app-motoristas-v2`, etapas ✓ (validacao, email, usuario, licenca, grupo, funcionario) e "Enviar no WhatsApp" com `href` `https://wa.me/5512999990000?text=...` contendo link, e-mail e senha.
3. Fechar o resultado (X, Esc ou clique fora) → "Fechar sem enviar?" (a senha não reaparece). Com o formulário alterado (inclusive só prefixo ou vínculo) → "Descartar alterações?".
4. Falhas simuladas pelo nome: contém "Erro Graph" → erro GRAPH_INDISPONIVEL com etapas feitas até `usuario` e `licenca` em erro, e "Tentar de novo"; contém "Sem Licenca" → SEM_LICENCA_DISPONIVEL. Nome de uma palavra → NOME_INVALIDO; celular sem 11 dígitos → CELULAR_INVALIDO.
5. Ficha de Carlos Alberto Teste (`m1`, `?ficha=m1`): bloco "Acesso ao app" (aba Dados, no fim) mostra "Acesso ativo" e `carlos.teste@betinhos.com.br`. "Encerrar acesso" → 1ª tela com o que acontece → "Continuar" → digitar "carlos" (sem diferenciar acento e maiúsculas) habilita "Encerrar agora" → toast "Acesso encerrado." e etapas na ordem confirmacao, licenca, conta, grupo, funcionario. Nome errado → erro no campo (CONFIRMACAO_INVALIDA). Limitação do mock: a ficha continua "Acesso ativo" (o mock de funcionários não muda o status).
6. Ficha de Helena Simulada Costa (`m7`): "Sem acesso ao app" e botão "Cadastrar acesso", que abre o drawer já com nome e celular dela; ao concluir, "Abrir ficha" relê o registro (prop `versao`).
7. Console sem `console.error`; versão do build no canto.

## Verificação no DEV (depois do merge e da publicação)
Pré-requisitos do Renan: app registration no Entra com `User.ReadWrite.All`, `GroupMember.ReadWrite.All`, `Organization.Read.All` (guia em `docs/acesso-motorista-entra.md`), grupo de motoristas, SKU da licença e o `.env` com os segredos. Só da `main` no checkout principal: `packages/deploy/provision-acesso.ps1` (dry run, depois `-Apply`) e `packages/plugins/scripts/push-acesso-plugin.ps1`; nunca em worktree, sessão cloud ou PROD.
1. Shell no DEV (`#/funcionarios`), usuário com a função "Acesso - Gestão de Motoristas" ou administrador: cadastrar um terceiro de teste (ex.: "Teste Acesso Motorista", celular real do Renan).
2. Conferir no Entra: usuário `teste.motorista@betinhos.com.br` criado, licença do SKU configurado atribuída, membro do grupo de motoristas, celular em `mobilePhone`; no Dataverse, linha em `cr40f_funcionarios` com `cr40f_emailmicrosoft`, função motorista, status Ativo e vínculo escolhido.
3. "Enviar no WhatsApp" abre `wa.me` com a mensagem; no celular, abrir a URL direta `https://org23b93544.crm2.dynamics.com/WebResources/new_app-motoristas-v2`, entrar com e-mail e senha temporária e trocar a senha (aguardar até 5 min de replicação se der erro de acesso).
4. Encerrar pela ficha com dupla confirmação → no Entra a conta fica desativada (`accountEnabled=false`), sem a licença e fora do grupo; em `cr40f_funcionarios` status Desligado (`cr40f_status` = 1) e data de demissão de hoje (só se estava vazia). Nada é excluído.
5. Repetir o encerramento depois de forçar falha (ex.: tirar permissão do app temporariamente) → a nova tentativa termina o que faltou (o grupo sai por último).

## Limitações conhecidas
- Autorização confere funções atribuídas direto ao usuário: função herdada por equipe não autoriza (SEM_PERMISSAO).
- A senha temporária só aparece no resultado do cadastro; nunca é recuperável. Conta que já existia volta sem senha (linha omitida no WhatsApp).
- Conta desativada no Entra → ACESSO_ENCERRADO; só a TI reativa.
- Encerrar só mexe em contas que estão no grupo de motoristas (R11); conta fora do grupo tem as etapas puladas e o funcionário é apenas inativado.

## Estado
DEV não verificado ainda (22/10/2026): depende de app registration, grupo e `.env` do Renan. Mock e testes verificados em 22/10/2026.
