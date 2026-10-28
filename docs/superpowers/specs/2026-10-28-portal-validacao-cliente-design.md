# Portal de validação de serviços pelo cliente (Tenaris)

Data: 28/10/2026 · Status: spec aprovada nas decisões de negócio; próximo passo é o protótipo React com dados fictícios para validar com a Tenaris antes do plano de implementação.

## Objetivo

Reduzir o atraso de 15 a 20 dias no faturamento da Tenaris. Hoje a Juliana (financeiro) compõe o preço de cada serviço, no fim do mês envia um Excel com tudo e as dúvidas voltam em lote por e-mail. Com o portal, ela libera serviço a serviço conforme termina a composição, a Tenaris valida ao longo do mês e cada dúvida vira uma conversa curta no próprio serviço. **O resultado continua o mesmo**: um Excel mensal no layout atual. O portal só adianta a validação.

## Dados reais (PROD, 28/10/2026, somente leitura)

- Cliente: um registro "Tenaris" em `cr40f_clientes1` (lookup `cr40f_cliente` na reserva).
- Volume: 151 (jul), 297 (ago), 253 (set) e 275 (out até 28) serviços por mês, cerca de 10 por dia.
- Preço: tabela `cr40f_composicaodeprecos` (lookup `new_composicaodepreco` na reserva), com hora motorista, diária, espera, pedágios, estacionamento, ajuste, `new_subtotal` e `new_valortotal`. Está preenchida em 100% dos serviços de setembro.
- Voucher: `new_linkdovoucher` (PDF gerado, não assinado) em 75% dos serviços.
- Campos úteis da Tenaris: `cr40f_idtenaris` (pedido na Tenaris) e `cr40f_cr` (centro de resultado).
- `new_observacaodefaturamento` existe, mas está vazio. Cerca de 165 serviços de ago/set seguem em "Composição Realizada" sem passar a "Faturamento Mensal". O significado de cada status ainda precisa ser confirmado com a Juliana.

## Decisões (Renan, 28/10/2026)

| Tema | Decisão |
|---|---|
| Quem valida na Tenaris | Poucos validadores centrais, que veem todos os serviços liberados do cliente |
| Acesso | E-mail + código de 6 dígitos, sem senha, só para e-mails cadastrados pela Betinhos |
| Liberação | A Juliana libera por serviço ou em lote, só serviços com composição realizada |
| O que o validador vê | Dados do serviço, preço detalhado pela composição, observação da Juliana e PDF do voucher (trajeto Infleet fica para depois) |
| Aprovação | Explícita, por serviço ou em lote |
| Aprovação tácita | Serviço liberado e sem dúvida aberta por 5 dias úteis vira "Aprovado tácito" (proposta a negociar com a Tenaris) |
| Dúvida | Por serviço, com motivo obrigatório (Espera, Km/rota, Valor, Passageiro, Outro) e texto livre. Vira uma conversa |
| Quem responde | Só a Juliana |
| Notificações | Resumo diário por e-mail para a Tenaris (liberados no dia e vencendo a tácita). Cada resposta numa conversa avisa o outro lado na hora |
| Mudança de preço depois de liberar | O serviço volta para "Liberado" e reabre o prazo da tácita. O valor anterior fica visível para os dois lados |
| Faturamento | Continua mensal, com um Excel no layout atual. A Juliana decide caso a caso, no fechamento, o que entra |
| Excel | A Juliana e a Tenaris exportam com filtros, no layout atual |
| Clientes | Modelo multi-cliente, liberado só para a Tenaris |
| Tela interna | Tela nova no shell, `#/validacao-cliente` |
| Stack | React + Vite + TypeScript + `@betinhos/ui` + tokens do Design System, igual ao shell |
| Antes de construir | Protótipo navegável com dados fictícios, mostrado a quem valida na Tenaris |

**Assumi:** o Worker fala direto com a Web API do Dataverse por um usuário de aplicação (S2S) com papel de segurança mínimo, em vez de um flow por endpoint. Os e-mails (código de acesso, resumo diário e aviso de resposta) saem por um flow HTTP "Portal cliente – e-mails" usando a caixa compartilhada do financeiro no M365.

## Status da validação

```
(composição realizada) --Juliana libera--> Liberado
Liberado --Tenaris aprova--> Aprovado
Liberado --5 dias úteis sem dúvida--> Aprovado tácito
Liberado --Tenaris abre dúvida--> Em dúvida
Em dúvida --Juliana responde--> Respondido   (a Tenaris aprova ou responde de novo)
Respondido --Tenaris aprova--> Aprovado
Respondido --5 dias úteis sem retorno--> Aprovado tácito
Respondido --Tenaris responde--> Em dúvida
Qualquer status --preço muda--> Liberado (registra valor anterior)
Liberado/Em dúvida/Respondido --Juliana retira--> Retirado (some do portal)
```

Os dias úteis são de segunda a sexta, sem feriados nacionais, e contam a partir da última mudança para "Liberado" ou "Respondido". O status de faturamento `cr40f_statusdefaturamento` fica intocado: o portal não trava nem altera o fluxo financeiro existente.

## Componentes

1. **Tabelas novas** (solução BetinhosCore):
   - `cr40f_validadorcliente`: nome, e-mail (único), cliente, ativo, último acesso.
   - `cr40f_validacaoservico`: reserva (única), cliente, status, liberado em/por, observação da Juliana, valor liberado, valor anterior, prazo da tácita, aprovado em/por, incluir no fechamento (Sim/Não/Pendente).
   - `cr40f_mensagemvalidacao`: validação, autor (validador ou usuário interno), lado (Cliente/Betinhos), motivo (só na primeira mensagem da dúvida), texto, criada em.
   - `cr40f_codigoacesso`: validador, hash do código, expira em, tentativas, usado. As sessões ficam em cookie assinado, sem tabela.
2. **Portal `apps/portal-cliente`** (Cloudflare Pages + Worker na mesma origem):
   - Telas: entrar (e-mail → código), lista (filtros de mês, CR e status, seleção em lote, contadores), detalhe (dados, composição em linhas, observação, voucher, histórico de valor, conversa), exportar Excel.
   - O Worker (`/api/*`) valida a sessão e filtra sempre pelo cliente do validador no servidor. Só retorna serviços com validação ativa (não retirada). Mostra só o nome dos passageiros, sem telefone nem e-mail.
   - O Worker tem um gatilho cron diário que aplica a tácita e dispara o resumo.
   - A versão de build aparece no canto, no padrão `v0.0.1 · dd/mm/aaaa HH:mm`.
3. **Tela `#/validacao-cliente` no shell**: abas A liberar, Liberado, Em dúvida, Aprovado e Retirado. Tem liberação e retirada em lote, campo de observação ao liberar, caixa de dúvidas com resposta, marcação "incluir no fechamento" e exportação do Excel do mês.
4. **Detecção de mudança de preço**: plugin pós-Update em `cr40f_composicaodeprecos` (`new_valortotal`) que reabre a validação. O molde é o `packages/plugins`.
5. **Flow "Portal cliente – e-mails"** (solução BetinhosAutomacao): envia o código de acesso, o resumo diário e os avisos de resposta. É chamado pelo Worker e pelo shell.

## Protótipo (próxima entrega)

- `apps/portal-cliente` em React com adaptador de dados fictícios (`isLocalHost()`), sem Worker nem Dataverse.
- Telas: entrar, lista, detalhe, aprovar em lote, abrir e responder dúvida, aprovação tácita (simulada), valor alterado e exportar Excel (layout provisório até chegar o modelo da Juliana).
- O protótipo serve para mostrar à Tenaris e é a base do produto. A parte real (Worker, tabelas, plugin, flow e tela da Juliana) só entra no plano depois da reunião.

## Riscos e mitigação

- **Adoção da Tenaris**: valide antes com o protótipo e mantenha o atrito mínimo (código por e-mail, lote, resumo diário).
- **Tácita sem acordo**: o prazo é proposta comercial. Se a Tenaris não aceitar, o status "Aprovado tácito" fica desligado por configuração do cliente.
- **Exposição de dados**: o filtro por cliente roda sempre no Worker. O código vale 10 minutos, com no máximo 5 tentativas e limite de taxa por IP e por e-mail. A sessão fica em cookie HttpOnly de 12 horas. O usuário de aplicação só lê reserva, composição e voucher e só grava nas tabelas novas.
- **Gargalo depois da validação** (SAP/medição da Tenaris): está fora do alcance do portal. Pergunte na reunião.
- **Status ambíguo** ("Composição Realizada" parado): confirme com a Juliana qual status habilita "A liberar" antes do plano.

## Verificação

- Login: e-mail não cadastrado → mensagem genérica, sem revelar se existe. Código errado 5 vezes → bloqueio de 15 minutos. Código expirado → pede um novo.
- Isolamento: um validador de outro cliente nunca vê serviço da Tenaris, nem pela API direta com o id.
- Liberar em lote 20 serviços → todos aparecem no portal. Um serviço sem composição realizada não pode ser liberado.
- Abrir dúvida sem motivo → bloqueado. Resposta da Juliana → e-mail ao validador e status "Respondido".
- Tácita: liberado na sexta, com feriado na segunda → vence na sexta seguinte, não antes.
- Preço alterado num serviço aprovado → volta para "Liberado" com o valor anterior visível e o prazo da tácita reiniciado.
- Retirado → some do portal, e a conversa fica preservada.
- Excel do mês: só leva o que a Juliana marcou para o fechamento, no layout atual, com valores iguais aos da composição.
- Celular e desktop, Design System Betinhos e versão de build visível em todas as telas e estados.

## Em aberto (não bloqueia o protótipo)

- O que acontece do lado da Tenaris depois da validação até o pagamento (Renan levanta na reunião).
- Excel modelo do mês (Renan pega com a Juliana).
- Domínio do portal (ex.: `portal.betinhos.com.br`).
