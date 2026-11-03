# Plano: notificações Web Push no PWA do App Motoristas

## Objetivo
Cada notificação que os Flows já enviam pelo Power Apps Notification V2 passa a chegar também como push web no PWA instalado (Android e iPhone), com o mesmo título e texto. Tocar na notificação abre o app no item certo.

## Decisões (3/11/2026)
- Escopo: clonar todas as notificações existentes dos Flows (Novo Serviço, Serviço Retirado da Agenda, Serviço Editado, Serviço Não Visualizado, Comunicados, Termo de Multa, Treinamentos, Checklist).
- Emissor: plugin .NET + Custom API `new_EnviarWebPush` (sem Azure Function). A chave privada VAPID fica em variável de ambiente secreta do Dataverse, nunca no cliente nem no repositório.
- Ativação: botão "Ativar notificações" no app. Públicos Android e iPhone (guia de instalação na tela inicial para iOS 16.4+).
- Os Flows chamam a Custom API em paralelo à notificação atual; a notificação do Power Apps continua como está.

## Contexto
- `src/pwa/sw.js`: hoje só cacheia o HTML. Receberá `push` e `notificationclick`; subir `CACHE`.
- `src/lib/pwa.ts`: registra o SW só na URL direta `*.dynamics.com`; o botão só aparece aí.
- Flows: `scripts/provision-motorista-push-flows.ps1`, `provision-comunicados-push-flow.ps1`, `provision-termo-multa-push-flow.ps1`, `provision-treinamentos-push.ps1`, `provision-checklist-flows.ps1`.
- Redirect do toque: `webresources/new_appmotoristas_push_redirect.js` mapeia registro para tela; o clique do push web reaproveita a mesma tabela de destinos.
- Plugin: `plugins/` (DriverRecordSharing). Regra: publicar só com a branch sincronizada com `origin/main`.
- Dados: nova tabela de inscrições (motorista, endpoint, chaves p256dh/auth, aparelho, criado em). Nomes lógicos a confirmar na metadata antes de criar.
- Segurança: a revisão de 11/2026 já aponta segredos em env vars String; a chave VAPID usa env var do tipo Secret e a tabela de inscrições só é legível pelo próprio motorista (escrita) e pelo plugin.

## Fatias (cada uma vira PR)
1. Cliente: handlers no SW, botão de ativação, guia iOS, gravação da inscrição.
2. Schema: tabela de inscrições, papéis e env var secreta (script de provisionamento, DEV).
3. Emissor: Custom API + plugin com assinatura VAPID e cifra `aes128gcm`, remoção de inscrição 404/410.
4. Flows: adicionar a chamada da Custom API em cada Flow clonado.

## Verificação (pronto quando todos passarem)
1. Toque em "Ativar notificações" → permissão concedida → linha na tabela com o motorista correto.
2. Cada Flow clonado: evento dispara os dois canais; o push web chega com o app fechado e o toque abre o item certo.
3. Permissão negada, iPhone sem instalar e Power Apps (iframe): aviso claro, sem erro.
4. Inscrição expirada é removida; dois aparelhos do mesmo motorista recebem; motorista sem inscrição não gera erro no Flow.
- Prova: `npm test` (payload e destinos), `tsc` estrito, `verificar-push-redirect`, plugin compilado, e teste em aparelho real no DEV.
- Não verificável na nuvem: recebimento real, iOS, Dataverse, Flows e plugin.
