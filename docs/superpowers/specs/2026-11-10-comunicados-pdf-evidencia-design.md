# Comunicados: PDF de evidência de ciência (Fase 1)

Data: 10/11/2026 · Status: aprovado pelo Renan (grilling de 10/11/2026)

## Problema

Quem usa o módulo de Comunicados precisa provar que, no dia X, o motorista Y teve acesso ao comunicado Z e o assinou (ou o leu, no Informativo). Hoje o relatório só exporta CSV, sem o texto do comunicado e sem a assinatura.

## Decisões

| Tema | Decisão |
|---|---|
| Onde gera | No navegador, com `pdf-lib`, no padrão de `pages/treinamentos/data/comprovantePdf.ts`. Sem schema, flow ou plugin. O arquivo é só baixado, sem cópia guardada. |
| Por comunicado | O relatório ganha caixas nos destinatários concluídos e o botão "Gerar PDF (n)". Sem nenhuma marcada, gera de todos os concluídos. O clique na linha continua abrindo o detalhe. |
| Por motorista | (a) Botão "Gerar PDF por motorista" na lista de Comunicados, que abre um diálogo: escolher o motorista e depois os comunicados que ele concluiu (todos marcados por padrão). (b) Aba nova "Comunicados" na ficha do motorista (Funcionários): histórico com status e datas, caixas e "Gerar PDF (n)"; sem nenhuma marcada, gera de todos os concluídos. |
| Quem entra | Só os pares concluídos: Ciência com `cienteEm`, Informativo com `lidoEm`. Os pendentes ficam fora. |
| Informativo | Gera comprovante de leitura (enviado, aberto, lido), sem o bloco de assinatura. |
| Layout | Um PDF por geração: capa com resumo e depois um comprovante por par (motorista × comunicado), cada um começando numa página nova e legível sozinho. |
| Auditoria | Só no PDF: rodapé "Gerado por <nome> em dd/mm/aaaa HH:mm · Sistema Betinhos vX.Y.Z". Sem registro no Dataverse. |
| Permissão | Quem já acessa Comunicados ou a ficha. O Dataverse já filtra a leitura. |

## Conteúdo do comprovante (uma página por par)

1. Título "Comprovante de ciência" (Ciência) ou "Comprovante de leitura" (Informativo).
2. Comunicado: título e tipo.
3. Motorista: nome do cadastro e, na Ciência, o nome do assinante gravado pelo plugin.
4. Linha do tempo (America/Sao_Paulo): disparado, enviado, aberto, lido e ciência. Todas as datas vêm do relógio do servidor (plugin).
5. Assinatura: os traços de `new_assinaturajson` desenhados em 250 × 100, na mesma proporção da tela. Na Ciência entra também a observação.
6. Texto integral do comunicado (`new_corpo`). Disparado é imutável, então o texto é exatamente o que o motorista recebeu.
7. Identificação: ID do comunicado, ID do destinatário e o SHA-256 de `titulo + "\n" + corpo`, com o rótulo "Identificador do conteúdo disparado". O hash é calculado na geração; não é prova de integridade nem de autoria, e o PDF diz isso em letra pequena.
8. Nota fixa: "Assinatura registrada pelo App Motoristas com a conta Microsoft do motorista; datas do servidor." Na Fase 2 entram aqui dispositivo, IP e localização.

A capa traz o tipo de geração (por comunicado ou por motorista), o alvo, a quantidade de comprovantes, o intervalo de datas e quem gerou.

Nome do arquivo:
- por comunicado: `comunicado-<slug-titulo>-<n>-comprovantes.pdf`;
- por motorista: `comunicados-<slug-nome>-<n>.pdf`;
- par único: `comprovante-<slug-titulo>-<slug-nome>.pdf`.

## Dados (sem schema novo)

- `Source.destinatariosDoMotorista(motoristaId)`: mesmo `DESTINATARIO_SELECT`, filtro `_new_motorista_value eq <id>`. `new_motorista` aponta para `cr40f_funcionarios`, o mesmo id da ficha.
- `Source.quemSou()`: `WhoAmI` → `systemusers(<id>)?$select=fullname`, com cache. No mock, "Usuário de teste".
- Os comunicados já vêm de `Source.comunicados()` (o corpo vem junto).
- O texto passa por `paraWinAnsi`. Ele sai de `treinamentos/data/comprovantePdf.ts` para um utilitário compartilhado (`apps/shell/src/lib/pdf/texto.ts`) junto com `quebrar` e o desenho da assinatura; o comprovante de Treinamentos passa a importar de lá, sem mudar a saída.

## Fora do escopo (Fase 2, projeto separado)

A captura no App Motoristas (repo `app-motoristas-v2`), as colunas novas e o plugin: dispositivo (user-agent, modelo, SO), versão do App, IP público visto pelo Worker e geolocalização (coordenadas e precisão), na leitura e na assinatura. Se o motorista negar a localização, assina mesmo assim e fica "não autorizada". Entra um aviso curto de LGPD na tela de assinatura (texto revisado pelo Renan). O PDF mostra coordenadas com link do mapa, sem geocodificação. Assinaturas anteriores aparecem como "não registrado".

## Verificação

- Testes de domínio: seleção dos pares concluídos, montagem dos dados do comprovante, nome do arquivo, hash estável.
- Teste do gerador: PDF com N páginas + capa, texto com acento, Informativo sem assinatura.
- Testes de tela (vitest + mock): caixas e "Gerar PDF (n)" no relatório; diálogo por motorista; aba Comunicados na ficha; download via `createObjectURL`.
- Prints da UI no chat e `ux-audit` Rápido no `pnpm dev` (mock).
- Não verificável na nuvem/mock: leitura real no Dataverse DEV (filtro por motorista, `WhoAmI` + `fullname`). Verificar no DEV depois do Deploy.
