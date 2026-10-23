# Termo de multa v2 — brief de UX (gestor e motorista)

Data: 23/10/2026. Base: auditoria UX em modo Fluxo (`.superpowers/ux-termo-multa/RELATORIO.md`) e diagnóstico do PDF.

## Objetivo

1. **Gestor:** do "multa chegou" até o "termo assinado e parcelas no DP" sem precisar caçar informação. Ele deve:
   - ver de uma vez quais termos estão pendentes, assinados, contestados ou expirados;
   - resolver o aditivo sem sair do fluxo;
   - ser avisado do resultado.
2. **Motorista:** entender a multa e o acordo, assinar ou contestar em poucos toques. Deve:
   - saber o prazo antes de começar;
   - nunca perder tempo com selfie e assinatura quando algo o impede de concluir;
   - conseguir rever e baixar o que já assinou.
3. **Corrigir o PDF que não baixa:** hoje o botão falha em silêncio no Power Apps, e o motorista comum nem teria permissão para ler o PDF.

## Contexto

- **Gestor:** escritório, desktop, várias multas por semana. A ação dele chega ao motorista, por isso confirmar antes de enviar.
- **Motorista:** celular, entre viagens, com pressa e às vezes com sinal fraco. O que ele assina mexe no salário. Contestar tem de ser tão fácil e respeitoso quanto assinar.
- Plataforma: Sistema Betinhos (React em `#/frota`) e App Motoristas v2 (React, WebResource no Power Apps).
- Design System Betinhos: tema claro, sem gradiente, azul só em foco, ação e status. Motion ≤ 200 ms ease-out, respeitando `prefers-reduced-motion`.

## O que muda

### 0. PDF (correção)
- Nova Custom API `new_BaixarPdfTermoMulta`: confere que o termo é do motorista (o admin também passa), lê o PDF como sistema e devolve base64. O PDF continua protegido por segurança de campo.
- O app abre o PDF com `Xrm.Navigation.openFile`, que usa o visualizador nativo do Power Apps. Na falta dele, usa o compartilhamento e depois o download. Nunca mais falha em silêncio: se nada funcionar, mostra o erro e registra no log.
- No gestor, "Baixar PDF" passa pela mesma API.

### Gestor (Sistema Betinhos)
| # | Mudança | Achado |
|---|---|---|
| G1 | Primeira linha do painel: "Motorista: Nome · Aditivo ✓/✗". Sem aditivo, um alerta com o botão **Registrar aditivo de Nome**, que abre a ficha e, ao salvar, volta para a multa com o painel já atualizado. | G1, G3 |
| G2 | Coluna **Termo** na lista de Multas (Pendente · expira dd/mm, Assinado, Contestado, Expirado) e filtros rápidos "Termos pendentes" e "Contestados". | G2 |
| G3 | **Enviar** abre a confirmação "Enviar a Nome: desconto em folha 3x de R$ 43,39 (nov/26–jan/27)?" com os botões Enviar e Voltar. | G4 |
| G4 | Termo pendente mostra "Enviado em dd/mm · expira em dd/mm" e o botão **Lembrar motorista** (reenvia o push, limitado a 1 por dia). | G8 |
| G5 | Termo assinado mostra, dentro da multa, a data/hora do servidor, o hash, o PDF e as **parcelas** (competência, valor, status). | G7 |
| G6 | O valor da guia aparece na lista e trava enquanto há termo pendente. Toasts embaixo no mobile. | G5, G6 |
| G7 | **Aviso ao gestor** quando o motorista assina ou contesta (ver pergunta 1). | falta |
| G8 | **Contestação:** o gestor registra a resposta ("Mantida", com novo envio, ou "Cancelada"), e o motorista vê essa resposta no app. | falta |

### Motorista (App Motoristas)
| # | Mudança | Achado |
|---|---|---|
| M1 | Banner na Home: "Você tem N multas para assinar · prazo até dd/mm", acima dos cards. Push no envio (já existe) e lembrete do gestor. | M3 |
| M2 | Abas **Pendentes / Concluídos**. Concluídos mostra os assinados e contestados, com o PDF e a resposta da contestação. | M2 |
| M3 | Aditivo verificado ao abrir o termo: sem aditivo, vai direto para "Procure o escritório", sem pedir selfie. | M1 |
| M4 | Detalhe com o prazo visível e o texto inteiro legível, sem ficar escondido atrás do rodapé. Ordem: o que aconteceu → o que você está aceitando → texto. | M5 |
| M5 | Quadro de assinatura com "Assine com o dedo aqui" e uma linha de base. | M6 |
| M6 | Erros definitivos ("não é seu", termo já resolvido) levam a uma tela final. "Tentar de novo" só aparece para falha de rede. | M4 |
| M7 | Contestar: confirmação neutra (sem o check verde), com o próximo passo e o prazo de resposta. | M7 |
| M8 | Sucesso: "Voltar para multas" como botão principal, PDF como secundário; o botão de atualizar fica escondido durante a assinatura. | M8 |

Movimento: banner e abas com fade/slide de 160 ms; o check de sucesso fica como está; nenhuma animação em altura ou layout.

## Verificação (cenários)

1. Multa com motorista sem aditivo: Registrar aditivo → salvar → voltar → Enviar habilitado, sem recarregar a página.
2. Envio pede confirmação; depois, a lista mostra "Pendente · expira dd/mm".
3. Lembrar motorista: o push chega; um segundo lembrete no mesmo dia aparece desabilitado com o motivo.
4. O motorista vê o banner na Home e o prazo no termo, assina, e o termo vai para Concluídos com "Baixar PDF" funcionando no Power Apps Android/iOS e no desktop.
5. O motorista tenta baixar o PDF de outro motorista pela API: negado.
6. Motorista sem aditivo: tela de bloqueio antes da selfie.
7. Contestar: o gestor recebe o aviso, responde "Cancelada", e o motorista vê a resposta em Concluídos. Nenhuma parcela é criada.
8. Expiração após 15 dias: status Expirado nos dois lados e reenvio possível.
9. Casos de borda:
   - GPS negado;
   - sinal caindo no envio (sem envio duplicado, dados preservados);
   - termo cancelado enquanto o motorista assina;
   - 375 px sem rolagem horizontal;
   - leitor de tela no fluxo de assinatura.
10. `ux-audit` modo Fluxo de novo nos dois lados, com veredito sem nenhum High.

## Decisões do Renan (23/10)

1. O gestor é avisado por **e-mail e pelo painel**: e-mail para quem enviou o termo quando ele é assinado ou contestado.
2. **Prazo de 7 dias.** Lembrete automático no **3º dia** e botão manual "Lembrar motorista" limitado a 1 por dia. A expiração passa de 15 para 7 dias, no plugin e no flow.
3. **Contestação resolvida pessoalmente, fora do app:** o G8 sai. O motorista vê "Contestado — o gestor de frota vai falar com você".
4. **Várias multas pendentes ao mesmo tempo:** sim.

## Contratos novos

- `new_BaixarPdfTermoMulta(new_TermoId: Guid) → new_PdfBase64: String, new_NomeArquivo: String`. Liberada para o motorista dono do termo ou para quem tem `prvCreatenew_TermoMulta`; qualquer outro recebe "Este termo não é seu.".
- `new_LembrarTermoMulta(new_TermoId: Guid)`, com privilégio `prvCreatenew_TermoMulta`. Só aceita termo Pendente, grava `new_ultimolembreteem` com o horário do servidor e recusa se já houve lembrete nas últimas 24 h, com a mensagem "Já foi enviado um lembrete nas últimas 24 horas.".
- Nova coluna `new_termomulta.new_ultimolembreteem` (DateTime), que só o plugin grava; a trava a protege.
- O flow de push do termo dispara no Create Pendente e também na alteração de `new_ultimolembreteem`, com o texto "Lembrete: multa para assinar até dd/mm".
- Flow diário de lembrete às 07:00: termos Pendentes com `new_enviadoem` há 3 dias ou mais e `new_ultimolembreteem` vazio → chama `new_LembrarTermoMulta`.
- Flow "Termo de multa | Aviso ao gestor": quando o status muda para Assinado ou Contestado, manda e-mail para quem criou o termo, com placa, motorista, desfecho e o link da multa.

## Perguntas de negócio (respondidas acima)

1. **Aviso ao gestor** quando o motorista assina ou contesta: por e-mail, por WhatsApp (whatsapp-inbox) ou basta o painel e o filtro?
2. **Prazo e lembrete:** 15 dias para assinar está bom? Lembrete automático no 7º dia, ou só manual pelo gestor?
3. **Resposta à contestação:** quem decide e em quanto tempo, e quais desfechos existem (manter e reenviar, cancelar a cobrança, outro)?
4. **Vários termos:** o motorista pode ter mais de uma multa pendente ao mesmo tempo, assinando uma por uma? (Assumi que sim.)
