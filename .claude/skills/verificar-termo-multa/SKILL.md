---
name: verificar-termo-multa
description: "Verifica o termo de multa do lado do gestor no Sistema Betinhos (painel do termo na multa, coluna Termo e visões da lista de Multas, volta da ficha do funcionário) e os scripts de schema e flows do termo no DEV. Use após mudar apps/shell/src/pages/frota/components/TermoMultaPanel.tsx, frota/data/** (termo), frota/domain/{termoMulta,linhas,listas}.ts, funcionarios/lib/voltar.ts, packages/deploy/provision-termo-multa.ps1 ou packages/deploy/provision-flow-termo-multa.ps1."
---
# Verificar termo de multa (gestor)

> **Fase 1 (17/11/2026): termo escondido. Fase 3 (18/11/2026): ele volta**, dentro do passo a passo (`AvisoPorTermo`, em
> `TermoMultaPanel.tsx`, usado por `MultaPassoAPasso.tsx`), sem a coluna Termo nem as visões "Termos pendentes" e
> "Contestados". As seções 1 a 3 abaixo são da fase 2 e seguem valendo para os testes do componente; a fase 3 está nas seções
> 4 a 9 (spec `docs/superpowers/specs/2026-11-18-multas-fase3-app-design.md`; regras gerais na skill `verificar-multas`, seção 5).

## Cobre
- Painel `TermoMultaPanel.tsx`: G1 motorista/aditivo e "Registrar aditivo de Nome" (`#/funcionarios?ficha=<id>&voltar=<hash>`), G3 confirmação do envio, G4 prazo e "Lembrar motorista" (`new_LembrarTermoMulta`), G5 hash, "Baixar PDF" (`new_BaixarPdfTermoMulta`, base64 → Blob) e parcelas, G6 valor travado com termo pendente.
- Lista de Multas: coluna Termo (`domain/linhas.ts`, `rotuloTermo`) e visões "Termos pendentes" e "Contestados" (`domain/listas.ts`).
- Volta da ficha: `funcionarios/lib/voltar.ts` e `FuncionariosPage.tsx` (salvar ou fechar a ficha volta para `voltar`).
- Dataverse DEV: coluna `new_termomulta.new_ultimolembreteem` (`provision-termo-multa.ps1`) e flows "Expirar pendentes" (7 dias), "Lembrete diário" e "Aviso ao gestor" (`provision-flow-termo-multa.ps1`).
- Brief: `docs/superpowers/specs/2026-10-23-termo-multa-ux-v2-brief.md`.

## Testes e tipos
```
cd apps/shell
npx tsc --noEmit -p .
npx vitest run src/pages/frota/components/TermoMultaPanel.test.tsx src/pages/frota/domain src/pages/frota/views/Registros.test.tsx src/pages/funcionarios/lib
```
Rodar a pasta frota inteira junto com funcionarios estoura timeout por carga na máquina local; rode isolado o arquivo que falhar.

## UI em mock (sem Dataverse)
1. `npx vite --port <livre> --strictPort` em `apps/shell` (ou `pnpm dev`, porta 36472).
2. `playwright-cli -s=tm open about:blank` e `BASE_URL=http://localhost:<porta>/ playwright-cli -s=tm run-code --filename=.claude/skills/verificar-termo-multa/roteiro-mock.js`.
3. O roteiro passa por 1280 e 375 px: lista (scrollWidth = largura), u1 sem aditivo (Bruno), u2 pendente com lembrete, u3 assinado com parcelas, u4 contestado, envio com confirmação e a ida à ficha. Esperado: `errs: []` e capturas em `.superpowers/ux-termo-multa-v2/`.
- Mock: u2 Ana (aditivo ok, pendente), u3 assinado com 3 parcelas, u4 contestado. O mock de Funcionários não tem os ids `f1/f2` da Frota: a ficha aberta pelo botão mostra "Colaborador não encontrado". Para provar a volta, abra `#/funcionarios?ficha=m2&secao=dados&voltar=%23%2Ffrota-multas%3Fregistro%3Dmulta%3Au1`, anexe um PDF ao aditivo, salve e confira que o hash volta para `#/frota-multas?registro=multa:u1`.

## Dataverse DEV (só DEV; PROD é proibido)
- Carregue o `.env` do checkout principal como variáveis de processo sem imprimir valores e rode os scripts em DRY RUN e depois `-Apply` com `powershell.exe` (5.1).
- `provision-termo-multa.ps1` termina com "SCHEMA OK" e confere `new_ultimolembreteem`.
- `provision-flow-termo-multa.ps1`: "Lembrete diário" fica DESLIGADO enquanto a Custom API `new_LembrarTermoMulta` não existir; rode de novo depois que ela existir para ligar.
- Aviso ao gestor: precisa de um termo ir para Assinado ou Contestado pelas Custom APIs, chamadas pelo usuário do motorista (o `DriverResolver` do plugin recusa o admin com "Este termo não é seu."). Teste pelo App Motoristas com um motorista de teste e confira o e-mail do criador do termo e a execução no Power Automate.

## 4. Fase 3: regras do termo (leia só no DEV; sem dado real)
- **Envio só em folha e só na etapa 2** (a de indicar; `AvisarMotorista` foi removido): 1 a 3 parcelas ("Escolha de 1 a 3 parcelas."; termos antigos com até 12 continuam legíveis), parcelas iguais sobre o valor cheio da multa com o resto na última, primeiro mês na janela do RH (`MultaParcelas.Janela`: do mês anterior até 12 meses à frente). Recusas com texto: "O primeiro mês do termo (mm/aaaa) já passou; as parcelas começam em mm/aaaa." e "Faltam menos de 3 dias para o prazo de indicação; indique sem o termo." (`TermoPrazos.PrazoCurtoParaEnviar`). O texto provisório aparece como "O texto do termo ainda é provisório.".
- **Assinatura vira aviso**: o motorista assina no app (`new_AssinarTermoMulta`); o passo interno `TermoAssinado` grava `dataAviso` = data da assinatura e o drawer mostra o aviso registrado (`AvisoPorTermo`). Esse passo só passa com a API do termo no `ParentContext`.
- **Contestação volta à etapa 1**: `new_ContestarTermoMulta` leva a multa a Identificar com `cr40f_contestadaem` = hoje; o próximo passo é "Decidir a contestação do motorista". O `DefinirResponsavel` e os dois desfechos do `PrazoVencido` limpam a data.
- **Expiração em D-3** (`TermoPrazos.ExpiraEm`): o que vier primeiro entre `new_enviadoem + 7 dias` e `cr40f_dataparaindicar - 3 dias`, 00:00 de Brasília (`new_ExpirarTermoMulta` devolve `new_Expirou`).
- **Lembretes automáticos**: flow "Lembrete diário" chama `new_LembrarTermoMulta` com `new_Automatico = true`; a API decide quem recebe (`TermoPrazos.LembrarTermo`), grava `new_ultimolembreteem` e devolve `new_Lembrou`, que dispara o push.
- **Aceite declarado e push do aceite**: `new_DeclararAceiteMulta` grava `cr40f_aceitedeclaradoem`; o gestor vê "Conferir o aceite na CNH Digital (motorista declarou em dd/mm)". Flow "Multa | Push do aceite" (`provision-flow-multa-aceite-push.ps1`, 09:00 de Brasília) chama `new_LembrarAceiteMulta` e só com `new_Lembrou` envia o Web Push "Você tem uma multa para resolver no app" (nunca valor nem infração), em indicação +2, +4 e +6 dias, no máximo 3 (`TermoPrazos.LembrarAceite`).
- **Aviso ao gestor**: o flow continua avisando Assinado e Contestado (decisão do Renan, 18/11/2026); o texto do Contestado foi ajustado.
- Testes: `export PATH=$HOME/.dotnet:$PATH; dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests -p:SignAssembly=false` (`TermoPrazos`, `MinhasMultas`, `AditivoPdf`, comandos do termo) e `dotnet test packages/plugins/Cr40f.Frota.Plugin.Tests -p:SignAssembly=false`; shell: `pnpm --filter shell exec vitest run src/pages/frota src/pages/funcionarios/components/AditivoAssinatura.test.tsx`.

## 5. Passos manuais depois do merge (quem for verificar)
1. `packages/plugins/scripts/register-multas-fase3-customapis.ps1 -Apply` logo depois do Deploy do merge (o flow do termo passa `new_Automatico`; sem o parâmetro registrado a chamada falha).
2. Flow "Multa | Push do aceite": criado à mão no DEV, e ainda sem mapa em `packages/deploy/flows-dev.mjs`.
3. A conta do flow do aceite precisa do privilégio de gestor (`prvCreatenew_TermoMulta`) exigido por `new_LembrarAceiteMulta`.

## 6. Aditivo do gov.br (shell: `funcionarios/components/AditivoAssinatura.tsx`)
Gerar ("Gerar aditivo", `new_GerarAditivoMotorista`), assinar no gov.br, anexar ("Anexar assinado", `new_RegistrarAditivoMotorista`) e conferir ("Conferir no validar.iti.gov.br"). Conferências do servidor, nesta ordem (`AditivoPdf`): PDF (`%PDF-`), até 5 MB, dicionário `/Type /Sig` com `/ByteRange`, e prefixo (o arquivo assinado começa com os bytes exatos do aditivo regenerado com o texto vigente; `AditivoPdf.ExigirIntegridade = true`). Recusas: "Este PDF não tem assinatura digital. Assine no gov.br e envie o arquivo que o gov.br devolveu." e "Este PDF não é o aditivo gerado para este funcionário com o texto vigente. Gere o aditivo de novo e peça a assinatura."

## 7. Prova manual do gov.br (única coisa não automatizável)
No DEV, com o funcionário fictício "Motorista Teste (fictício)": gerar o aditivo, assinar no gov.br com a conta do Renan, anexar. Esperado: aceito, com o link "Conferir no validar.iti.gov.br" válido.
- Se o servidor recusar pelo prefixo (o gov.br reescreveu o arquivo), registre o resultado e troque `AditivoPdf.ExigirIntegridade` para `false` em um PR próprio de uma linha; ficam só as demais conferências.
- **O PDF assinado nunca vai para o repositório nem para o chat** (o certificado leva nome e CPF; o repositório é público). Apague o arquivo local depois; os testes usam só fixture sintético.

## 8. Tela Multas do app (App Motoristas, `apps/motoristas/src/features/termos`)
`MinhasMultasScreen.tsx` (lista de `new_MinhasMultas`, só multas da etapa 2 em diante mais as contestadas, responsável diferente de Empresa; encerradas e canceladas dos últimos 12 meses), `AceiteCnhCard.tsx` ("Já aceitei"), `minhasMultasOffline.ts` (cache), `TermoMultaDetalheScreen.tsx` (assinar e contestar).
- Testes: `pnpm --filter motoristas test` (node --test).
- Layout (redesenho A+B): todo cartão (tarefa, desconto, andamento, encerrada) começa FECHADO; o cabeçalho é um botão (`aria-expanded`/`aria-controls`, chevron que gira) que mostra chip de prazo, título e uma linha de resumo ("PLACA · dd/mm", "Falta descontar R$ X · N de M descontadas", "PLACA · dd/mm · Encerrada"); tocar abre os detalhes (vários ao mesmo tempo, sem persistir), conferir mouse, Enter e Espaço, e que o conteúdo fechado não recebe foco. "Para fazer agora · N" com cartões que começam pelo verbo, chip de prazo ("Até dd/mm · faltam N dias", vencido em vermelho, "Sem prazo marcado" em cinza) e trilha Termo/CNH Digital/Desconto/Fim (`etapaDaMulta`); "Desconto em folha" com "Falta descontar", barra por parcela e linhas por mês (`resumoDesconto`, `legendaParcelas`); "Encerradas · N" recolhível. Conferir a 390 px sem rolagem horizontal.
- Mock: abrir Multas, assinar o termo, tocar em "Já aceitei" e repetir sem rede: o botão mostra "Sem conexão, tente de novo" e a lista mostra "Sem conexão. Mostrando as multas de <hora>."
- Tour `multas` (`apps/motoristas/src/app/tourChapters.ts`): passos Precisa de você, Termo da multa, Aceite na CNH Digital e Parcelas, ancorados nos cabeçalhos visíveis dos cartões fechados, `data-tour="multas-precisa|multas-termo|multas-aceite|multas-parcelas"`; todos opcionais, então conferir no mock que cada âncora existe com a multa certa (`tests/tour.test.ts` cobre a ordem). O contador "Precisa de você" no menu vem de `precisaDeVoce` (`useTermosMulta`).
- DEV: com o motorista de teste (nunca real), conferir a lista e depois `cr40f_aceitedeclaradoem` na multa (só leitura).

## 9. Evidência
Testes das seções 4 e 8, prints do mock do shell (autos A000000101 a A000000106) e do app, e o resultado da prova manual da seção 7 (aceito ou recusado, nunca o PDF).

## Configuração do App (fase B2)
- O flow "Termo de multa | Push ao motorista" chama `cr40f_AppConfigEfetiva` e pula o push com `multas` desligado (sem status novo; falha na leitura envia como antes). A Custom API de termo recusa com o módulo desligado (`TermoMultaCommandPluginTests`, 114 testes). Prova no DEV: exceção `multas` `Ligado=false` num motorista de teste, termo enviado e conferir que o flow não envia push.

## 3x, valor cheio e aviso automático (24/11/2026)
- `TermoMultaCommandPlugin` limita a 3 parcelas e sobrescreve `valorTotal` pelo valor cheio (`new_valorguia`, senão catálogo) quando > 0; a sobra de centavos vai na última parcela. No painel (`TermoMultaPanel.tsx`) o "Valor cheio da multa (R$)" vem pré-preenchido (`new_valorguia`, senão catálogo) e continua editável (agravante muda o valor), gravando em `new_valorguia`.
- Quando o responsável vira motorista, o flow `Multa | Aviso ao motorista` (criado à mão, desligado, fora do `flows-dev.mjs`) avisa por push; o envio do termo não exige mais "Avisei": a etapa `AvisarMotorista` foi removida, e a indicação mostra o termo como caminho principal e "Indicar sem o termo" como alternativa. O App Motoristas só exibe as parcelas que o servidor devolve (sem cálculo local).
