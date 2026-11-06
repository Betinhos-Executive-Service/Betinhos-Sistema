---
name: verificar-gerar-pagantes
description: "Verifica a Tela Gerar Pagantes (apps/gerar-pagantes), o gerador de recibo cr40f_GerarRecibo e o plugin Cr40f.GerarPagantes.Plugin (assembly V2). Use ao mudar essa tela, o plugin, o recibo ou os e-mails de link e recibo."
---
# Verificar Gerar Pagantes

## Cobre
- `apps/gerar-pagantes/**`, incluindo `webresources/cr40f_GerarRecibo.js`
- `packages/plugins/Cr40f.GerarPagantes.Plugin/**` e `packages/plugins/tools/Cr40f.GerarPagantes.Registrar/**`
- Fora do Dataverse a tela abre em modo demonstração (sem `Xrm`); gerar link e enviar e-mail exigem o DEV.

## Roteiro local
1. `pnpm --filter @betinhos/gerar-pagantes exec tsc -b` sem erros.
2. `pnpm --filter @betinhos/gerar-pagantes test` com todos passando.
3. `dotnet build packages/plugins/Cr40f.GerarPagantes.Plugin --configuration Release` com 0 erros. Exige `%USERPROFILE%\.codex\keys\Cr40f.GerarPagantes.Plugin.snk`.
4. Token da DLL `Cr40f.GerarPagantes.Plugin.V2.dll` = `70fc5ed6b1f0f0c9`. Outro token faria o Dataverse tratar como outro assembly.
5. `pnpm --filter @betinhos/gerar-pagantes exec vite --port 36491 --strictPort`, abrir `http://localhost:36491/` e conferir: a tela de pagantes da demonstração renderiza e o rodapé mostra a versão.

6. Destinatário: em `/?recordId=<guid>&demo=edit`, clicar em Trocar destinatário, digitar um e-mail inválido (erro) e um válido. O chip mostra o e-mail, aparece "Enviar também o recibo" marcado, e desmarcar mantém a linha como alterada.
7. Transformação dos flows: `node --test packages/deploy/flows/recibo-destinatario.test.mjs` e `powershell -File packages/deploy/provision-flow-recibo-destinatario.ps1 -SomenteValidar` (só leitura).

## Roteiro no DEV (sessão autenticada, só com o Deploy concluído)
1. `Tela_GerarPagantes/index.html` com descrição `vX.Y.Z <sha>` da `develop`.
2. Abrir uma OP de teste, clicar em Gerar pagantes e conferir que o iframe abre com a versão publicada.
3. Com ok do Renan, recibo de teste em quatro casos: pessoa cadastrada (saudação e idioma dela, sem cópia ao pagante), e-mail digitado (saúda o pagante), destinatário sem e-mail (só o financeiro, com aviso) e troca avulsa no modal (vale só para o envio).
4. Não gerar link real nem enviar e-mail sem confirmação do Renan: o plugin chama a Cielo e o Graph de verdade.

## Armadilhas
- A pasta se chama `Cr40f.GerarPagantes.Plugin`, mas o assembly tem sufixo `.V2`: o nome vem do `<AssemblyName>` do csproj. Nunca renomeie.
- O plugin ainda não tem projeto de testes.
