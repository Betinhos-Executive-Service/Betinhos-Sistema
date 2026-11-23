---
name: verificar-push-motorista
description: "Verifica os avisos push ao motorista (Web Push primeiro, Power Apps Notification V2 só de reserva) nos flows Push Checklist, Push Comunicados, Termo de multa, Push Treinamentos e Aviso Motorista | Enviar. Use após mudar flows/checklist-push.json, comunicados-push.json, termo-multa-push.json, treinamentos-push.json, provision-flow-aviso-motorista.ps1, flows/sincronizar-flow.ps1 ou o Worker web-push."
---
# Verificar push ao motorista (Web Push primeiro)

## Cobre
- Flows: "Flow Push Checklist | Motoristas", "Flow Push Comunicados | Motoristas", "Termo de multa | Push ao motorista", "Push Treinamentos | Motoristas" (JSON em `packages/deploy/flows/`) e "Flow Aviso Motorista | Enviar" (gerado por `provision-flow-aviso-motorista.ps1`). A "Vigia" e o "Serviço Editado | Interno e Motoristas" ficam de fora (o V2 da Vigia vai para operadores internos; o Serviço Editado só tem `patch-flow-servico-editado.ps1`).
- Regra: escopo `Web_Push_Send_push` roda primeiro (Worker `EnviarPush`); `Fallback_V2` (V2) roda só se a variável `Web_Push_Entregue` ficou falsa (sem funcionário, sem inscrição ou nenhuma inscrição com 2xx). `Mark_sent`/`Marcar_enviado` depois do `Fallback_V2` Succeeded; `Mark_failed`/`Marcar_falhou` quando o `Fallback_V2` falha.

## Local (sem Dataverse)
1. `node --test packages/deploy/flows/push-motorista-web-push-primeiro.test.mjs packages/deploy/flows-dev.test.mjs` → passam (V2 só dentro de `Fallback_V2` com `runAfter` no escopo Web Push; Init da variável no topo; Filter 2xx; status; deep links; inscrições montadas pela ação `Select_subs*`, nunca `select()` em expressão).
2. `python3 -m json.tool <json>` em cada JSON alterado.
3. `node scripts/dados-pessoais.mjs` → sem dados pessoais (repo público: nada de e-mail, `sig=`, segredo).

## DEV, depois do Deploy (escreve no DEV; só com ok do Renan)
1. Resumo do Deploy: "Flows no DEV" com `ok` para os 5 flows. O de treinamentos pega a connection reference do Worker do "Flow Push Checklist | Motoristas" (`-FlowDeReferencias`); sem ela o script falha antes de gravar.
2. Motorista COM inscrição (`new_inscricaopushmotoristas`): disparar cada aviso (checklist em Pendente, destinatário de comunicado em Pendente, termo enviado, participação de treinamento em Pendente, aviso em Pendente). Esperado na execução: `Web_Push_Send_push` Succeeded, `Worker_Send_push` com `results[].status` 2xx, `Fallback_V2` Succeeded com `Send_push` **Skipped**/não executado, registro em Enviado. O aparelho recebe 1 push só, abrindo o PWA na tela certa (`?checklistId=`, `comunicadoId=`, `termoMultaId=`, `treinamentoParticipacaoId=`, `servicoId=`).
3. Motorista SEM inscrição: `Web_Push_Send_push` Succeeded sem Worker, `Fallback_V2` roda `Send_push` (V2), registro em Enviado, push abre o model-driven.
4. Inscrição inválida (endpoint 404/410): inscrição apagada pelo escopo e V2 roda de reserva.
5. Falha do V2 depois de web push não entregue: registro em Falhou com a mensagem do erro.
6. Conferir que o estado ligado/desligado dos flows ficou como antes.

## Cuidados
- O Worker é chamado por conector; o segredo fica na conexão, nunca no flow.
- A linguagem de expressões do Power Automate não tem `select()`: usada em `body/subscriptions`, o Worker falha com `InvalidTemplate` e todo aviso cai no V2 (bug de 10/11 a 16/11/2026). A lista de inscrições sai da ação Select.
- Pendente (fora deste PR): "Flow Notificação Serviço Editado | Interno e Motoristas" ainda manda V2 e Web Push em paralelo (sem provision no repo).
- Configuração do App (fase B2): checklist, treinamentos, termo de multa e "Multa | Push do aceite" chamam `cr40f_AppConfigEfetiva` antes do envio (`Init_modulo_desligado` → `Config_App` → `Se_modulo_ligado`; chaves `checklists`, `treinamentos`, `multas`). Módulo desligado = nada é enviado (checklist e treinamentos marcam Falhou com "Push não enviado: o módulo X está desligado no App deste motorista."; termo e aceite só pulam). Falha ao ler a configuração = envia como antes. A "Conciliação do cartão" respeita `expenses` por motorista. Aviso Motorista é `services` (fixo, não desliga) e Comunicados ficou de fora. No DEV: desligar o módulo para um motorista-piloto (`cr40f_AppConfigDefinirPessoa`, exceção `Ligado=false`), disparar o aviso e conferir no histórico do flow o ramo desligado; depois encerrar a exceção. A conta da conexão do flow precisa ser gestor, administrador ou conta de serviço para ler a configuração de outra pessoa.
