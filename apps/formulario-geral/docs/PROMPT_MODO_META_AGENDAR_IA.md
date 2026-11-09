# Prompt para o modo meta

```text
Você é o agente responsável por concluir e validar o recurso “Agendar por IA” no Web Resource Formulário Geral da Betinhos Executive Service.

Objetivo: permitir que o operador cole uma solicitação de cliente em linguagem natural, use DeepSeek para interpretar uma ou várias reservas, mostre uma proposta estruturada em português, pergunte uma pendência por vez e só crie reservas após confirmação humana explícita.

Regras obrigatórias:
- Preserve a aba existente “Solicitações IA” e o fluxo Outlook; não misture os dois fluxos.
- Use DeepSeek via Power Automate assíncrono + Custom Connector/Connection Reference. Nunca coloque chave no browser, Dataverse, Git ou log.
- Use `deepseek-v4-flash` como primário e `deepseek-v4-pro` como fallback controlado.
- O contrato deve rejeitar inferência silenciosa de tipo de serviço, tipo de veículo, identidade, data ou horário.
- Confirmação válida: botão “Confirmar e agendar” ou texto explícito contextual como “confirmo”, “pode agendar” e “pode ser”. Nunca agende com “ok” fora do contexto.
- Para múltiplos serviços, processe cada item com chave idempotente `sessionId:inputVersion` e registre cada reserva criada imediatamente.
- Em erro, preserve sucessos, marque `PARTIAL` e permita retomada sem duplicar reservas.
- Se cliente, solicitante ou passageiro não existir, proponha cadastro; criação de identidade exige confirmação humana separada.
- Retenha texto original e conversa por 90 dias, com acesso restrito aos operadores atuais.
- DEV primeiro. Não publique em PROD e não declare UAT/produção sem evidência.

Contrato de sessão:
`DRAFT`, `WAITING_AI`, `WAITING_USER`, `READY`, `SCHEDULING`, `PARTIAL`, `SCHEDULED`, `ERROR`, `CANCELLED`.
Entrada: texto original, mensagens, `inputVersion`.
Saída: proposta JSON, pendências, alertas, modelo, tokens, `processedVersion`, IDs criados e erro.

Plano de execução:
1. Leia AGENTS.md, o código atual e `docs/AI_AGENDAR_POR_IA.md`.
2. Confirme os nomes lógicos e valores Choice no ambiente DEV antes de mutar Dataverse.
3. Crie/ajuste tabela de sessão, Connection Reference, Custom Connector e os dois fluxos assíncronos.
4. Valide JSON, concorrência, timeout, retry, deduplicação, partial save e retenção.
5. Teste local com mensagens anonimizadas, depois DEV autenticado.
6. Rode `pnpm --filter @betinhos/formulario-geral test` (o `test` já gera o `webresource.html` sem mudar a versão) e `git diff --check`.
7. Revise o diff, preserve mudanças pré-existentes, faça commit cirúrgico em português e relate gates concluídos e pendentes.

Não invente metadados. Se um nome lógico, Choice, conexão ou URL estiver ausente, pare naquele passo, registre o bloqueio e peça somente o dado necessário.
```
