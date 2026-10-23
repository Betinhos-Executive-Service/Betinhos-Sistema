---
name: verificar-termo-multa
description: "Verifica o termo de multa do lado do gestor no Sistema Betinhos (painel do termo na multa, coluna Termo e visões da lista de Multas, volta da ficha do funcionário) e os scripts de schema e flows do termo no DEV. Use após mudar apps/shell/src/pages/frota/components/TermoMultaPanel.tsx, frota/data/** (termo), frota/domain/{termoMulta,linhas,listas}.ts, funcionarios/lib/voltar.ts, packages/deploy/provision-termo-multa.ps1 ou packages/deploy/provision-flow-termo-multa.ps1."
---
# Verificar termo de multa (gestor)

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
