# Spec: Cancelado da Tenaris passa pela trava e vira Requer Análise

## Objetivo
Quando a Tenaris cancela no sistema dela um serviço que a equipe já editou (status protegido), o status sai do aberto para Requer Análise, a gestão recebe o aviso que já existe e o motorista programado recebe o aviso Cancelado.

## Fora de escopo
Outros campos protegidos; status não protegido (segue gravando Cancelado direto); Cancelado com ressalvas vindo da Tenaris; tipo novo de aviso; tela.

## Como funciona hoje (conferido em 26/11/2026)
- Flow "Flow Novo Sistema Tenaris -> Dataverse" (`cbcd9564-1b1e-f111-88b1-7ced8da87540`): `Compose_Status` traduz o texto da planilha (cancelado → 202410002 ...). `Upsert_Geral` manda o status atual do Dataverse quando `new_camposprotegidos` contém `cr40f_status`, senão o `Compose_Status`. Sempre manda `new_snapshotsharepoint`.
- `Cr40f.Protecao.Plugin` (pré-operação, Update de `cr40f_reservadeveculos`): gravação com snapshot tem os campos protegidos removidos do Target.
- "Flow Notificação Novo Requer Análise | Interno": gatilho em `cr40f_status eq 100000001` (ligado no PROD, rascunho no DEV). Avisa a gestão em qualquer mudança para Requer Análise.
- `DriverNoticeRules`: aviso Cancelado só para status final Cancelado ou funcionário "Cancelado", partindo de Programado.

## Cenários de aceite
1. Status protegido Programado, sincronização manda Cancelado → status Requer Análise; outros campos protegidos seguem barrados; snapshot gravado.
2. Status protegido Concluído, Requer Análise, Cancelado ou Cancelado com ressalvas, sincronização manda Cancelado → status não muda.
3. Status protegido aberto, sincronização manda outro status (ex.: Confirmado) → barrado, como hoje.
4. Programado com motorista → Requer Análise por gravação com snapshot → um aviso Cancelado ao motorista anterior.
5. Programado → Requer Análise sem snapshot (motorista cancela no local pelo App, ou equipe na tela) → nenhum aviso.
6. Aviso Cancelado chega com título "Serviço cancelado" e corpo "Este serviço foi cancelado e saiu da sua agenda."

## Dados (nomes lógicos conferidos)
`cr40f_reservadeveculos.cr40f_status`: Cancelado 202410002, Cancelado com ressalvas 202410010, Requer Análise 100000001, Concluído 202410008, Programado 202410005. `new_camposprotegidos`, `new_snapshotsharepoint`. Sem schema novo.

## Dependentes
Flow Requer Análise (cenário 4/6 na prova); `Cr40f.Frota` Ciclo (Requer Análise não mexe em manutenção, já testado); shell `geral/domain/protecao.ts` (só leitura, sem mudança); portal do cliente (Requer Análise = "em análise").

## Irreversível
Nada. Plugins e flows voltam pelo commit anterior; o patch do flow Tenaris grava backup.
