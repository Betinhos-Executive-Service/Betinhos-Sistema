# Spec: aviso "Cancelado" ao motorista

## Objetivo
Motorista com serviço Programado recebe push "Serviço cancelado" quando o serviço é cancelado, qualquer que seja a ordem em que a operação grava status e motorista.

## Regras (plugin `DriverNoticePlugin`, pós-operação, step já filtra `cr40f_motorista,cr40f_status`)
- Tipo novo em `new_avisomotorista.new_tipo`: **Cancelado = 100000002** (hoje: Novo 100000000, Retirado 100000001).
- "Funcionário Cancelado" = `cr40f_funcionarios` com `cr40f_nomecompleto` igual a "Cancelado" (sem espaços nas pontas, sem diferenciar maiúsculas) (PROD `6bc5e712-0335-f111-88b4-7ced8da87c97`; não existe no DEV). Nunca recebe aviso de nenhum tipo.
- Gera **Cancelado** para o motorista anterior P quando: status anterior Programado (202410005), P existe e não é o funcionário Cancelado, e (a) status final Cancelado (202410002), ou (b) o motorista mudou para o funcionário Cancelado.
- Quando gera Cancelado para P, não gera Retirado para P na mesma gravação.
- Cancelado com ressalvas (202410010): sem mudança (decisão do Renan).
- Novo e Retirado: sem mudança, exceto não irem para o funcionário Cancelado.
- Cancelado não tem prazo de visualização (como Retirado).

## Flow "Aviso Motorista | Enviar" (`provision-flow-aviso-motorista.ps1`)
- Cancelado: título "Serviço cancelado"; corpo "<OS> · <dia>\nCancelado pelo gestor. Toque para ver a agenda atualizada."; link `?agenda=1` (como Retirado). Envio igual ao Retirado (não depende de o serviço continuar Programado).
- Vigia: já trata todo tipo diferente de Novo como Retirado; sem mudança.

## Cenários de aceite
1. Programado (P) → status Cancelado, mesmo motorista → 1 aviso Cancelado para P.
2. Programado (P) → motorista vira "Cancelado" → 1 aviso Cancelado para P (sem Retirado); depois status Cancelado → nenhum aviso.
3. Mesma gravação: motorista "Cancelado" + status Cancelado → 1 aviso Cancelado para P.
4. Programado (P) → Cancelado com ressalvas, mesmo motorista → nenhum aviso.
5. Programado (P) → motorista Q → Retirado para P e Novo para Q (como hoje).
6. Confirmado/Solicitado (P) → Cancelado → nenhum aviso.
7. Flow: aviso Cancelado Pendente → push "Serviço cancelado", abre a agenda, aviso vira Enviado.

## Dependentes do que muda
- `new_tipo`: plugin (`DriverNoticeRules/Writer`), flows Enviar e Vigia (rótulo formatado no e-mail da Vigia), doc `apps/motoristas/docs/virada-aviso-motorista.md`. Shell e App não leem `new_tipo` (rg).
- Opção nova é aditiva; nada irreversível. PROD pelas soluções (develop → main, a pedido).

## Fora de escopo
- Cancelado com ressalvas; inscrição de Web Push do Romildo; trocar o "funcionário Cancelado" por outro mecanismo.
