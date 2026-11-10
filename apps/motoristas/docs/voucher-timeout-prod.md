# Correção do timeout de voucher — PROD 2.1.683

Em 30/09/2026, os dois logs fornecidos registraram a mesma falha na OS-9549: HTTP 504 após 120.728 ms ao enviar o voucher. A leitura de PROD encontrou o serviço concluído, link de voucher preenchido e finalização registrada 13 segundos após o erro. Timeout HTTP não comprovava falha definitiva do processamento.

## Alterações

- Após HTTP 504, consultar status e link no Dataverse durante 60 segundos, sem repetir o POST.
- Aceitar conclusão remota com voucher ou novo link gerado; sem confirmação, manter a falha e preservar o rascunho pelo fluxo existente do app.
- Evitar reenvio de serviço já concluído com voucher e preservar sua data de finalização.
- Registrar erros estruturados com mensagem legível, preservando os detalhes no payload; retirar fragmentos de assinatura das URLs de diagnóstico.

## Validação e publicação

- Base: `3f67b41`, versão 2.1.679. JavaScript original compilado comparado byte a byte com o WebResource de PROD antes das alterações.
- 113 testes passaram, incluindo sete cenários de voucher. TypeScript estrito e build aprovados.
- Publicado exclusivamente `new_app-motoristas-v2` em `https://orgf261ae8e.crm2.dynamics.com`, solução `AppBetinhos`.
- Conteúdo remoto conferido após publicação: SHA-256 `A7C169868A0D65BEE2EC1925311AFC9F90A6A3E945CD115D1BE25634DB8C3AD5`.
- Backup anterior: `.tmp/prod-voucher-before.html`, SHA-256 `E4328489147EC0DBB8675603445B52FFCFB3DA447CE4EC0DD63F5BB0E1DB960A`.
- Nenhum Flow, schema ou registro de serviço foi alterado na publicação. Não houve novo envio real de voucher no celular; a validação comportamental foi automatizada com os limites HTTP/Dataverse simulados.
- Código mantido na branch `codex/voucher-timeout-prod`. Alterações ainda não commitadas.
