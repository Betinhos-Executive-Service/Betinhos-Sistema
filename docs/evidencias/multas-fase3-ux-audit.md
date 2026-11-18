# Multas fase 3: ux-audit (modo Fluxo, mock)

Data: 18/11/2026. Ambiente: shell em 1440 px (porta 36472) e App Motoristas em 390 px (porta 36480), ambos no mock fora do Dataverse. Playwright/Chromium headless, locale pt-BR.

## Veredito: Conditional

O fluxo completo funciona e não gera erro de console nem resposta 5xx. Os achados abaixo são de clareza, contraste e mock; nenhum bloqueia a fase.

## Fluxo exercitado

- Shell, Frota > Multas: A000000101 enviar termo (confirmação, aviso, Lembrar, Cancelar termo), A000000102 aguardando, A000000103 contestação, A000000104 aceite declarado até registrar o aceite, A000000105/106 acertar com "Termo assinado em… + Baixar PDF" (download `Termo-tf3e-1.pdf`) e Registrar acerto.
- Ficha de funcionário (Carlos Alberto Teste): Gerar aditivo (download), Anexar assinado, recusa do PDF sem assinatura, registro e estado assinado.
- App 390 px: três grupos, "Já aceitei" (o cartão passa para "Em andamento" com "Aceite em conferência"), detalhe do termo, offline com cache ("Sem conexão. Mostrando as multas de 17:17.", botões desabilitados).
- Console: só o aviso de mock `Xrm.WebApi nao encontrado` no App. 5xx: nenhum.
- axe (shell, drawer e ficha): nada nos componentes novos; só dívidas já existentes do shell (`aria-required-children` na tabela, contraste em `.bt-shell__section-label`, landmarks). axe (App, Multas): 1 serious (achado 2) e `page-has-heading-one` (moderate, do app inteiro).

## Achados

1. **Média. O aceite declarado pelo motorista não aparece dentro do drawer.** Local: `apps/shell/src/pages/frota/components/MultaPassoAPasso.tsx` (passo RegistrarAceite) e `domain/multaEtapas.ts:113`. A frase "motorista declarou em 17/11" só existe na coluna "Próximo passo" da lista; no drawer de A000000104 o campo de data vem vazio e "Feito até agora" não cita a declaração. Correção: mostrar "Motorista declarou o aceite em dd/mm" acima do campo e preencher a data com a declarada. **[Corrigido: o drawer mostra a declaração e preenche a data, commit cfd795e4.]**
2. **Média. Contraste insuficiente na data e hora do cartão "Precisa de você" do App.** Local: `.multa-card[data-grupo="precisa"] .multa-card-head small` em `apps/motoristas/src/features/termos/termos.css` (axe serious, 3 nós). Correção: usar o token de texto principal ou secundário forte sobre o fundo amarelo, razão mínima 4,5:1. **[Corrigido: cor #475569, 7,08:1 sobre #fff7df (era #64748b, 4,45:1), commit cfd795e4.]**
3. **Baixa. Depois de "Registrar acerto" some o link do termo assinado.** Local: `MultaPassoAPasso.tsx:300`, que só aparece enquanto o passo Acertar está aberto. Em A000000105 acertada o drawer não tem mais "Baixar PDF". Correção: manter a linha "Termo assinado em… · Baixar PDF" em "Feito até agora". **[Corrigido: a linha do termo assinado também aparece em Feito até agora, commit cfd795e4.]**
4. **Baixa. Textos contraditórios ou inconsistentes.** (a) Na ficha com aditivo já assinado continua "Sem o aditivo, o motorista não assina termos pelo app." (`AditivoAssinatura.tsx:82`): mostrar só quando não há aditivo. (b) O drawer diz "até 7 dias", mas o mock mostra "Enviado em 18/11 · expira em 23/11" (5 dias) e em A000000102 "Enviado em 17/11 · expira em 23/11"; revisar o cálculo do mock. (c) A000000102 mostra "3x · R$ 293,47" sem dizer se é o valor da parcela ou o total. **[Item (a) corrigido: texto só sem aditivo; (b) e (c) seguem abertos, commit cfd795e4.]**
5. **Baixa. Divergências do mock.** (a) O mock de funcionários não tem "Motorista Teste (fictício)": o aditivo foi verificado na ficha "Carlos Alberto Teste" (m1). (b) A recusa do aditivo no mock olha o conteúdo do PDF (`sem-assinatura`), não o nome do arquivo como diz o brief da Task 11. (c) No App, "Abrir termo" do cartão TST1A23 abre o termo mock de RTB4F21 (Renan, prazo 29/10), e há tour guiado que cobre a tela na primeira abertura (precisa "Pular" duas vezes: início e Multas). Correção: alinhar os mocks e, se desejado, desligar o tour no mock.

Observação menor: no modo offline, o rótulo flutuante "Sem conexão" sobrepõe o rodapé da lista; "Ver termo assinado (PDF)" continua habilitado sem conexão.

## Prints

Em `~/.t3/userdata/attachments/`:

- multas-fase3-shell-termo-enviado.png
- multas-fase3-shell-aceite-declarado.png
- multas-fase3-shell-acertar-termo-assinado.png
- multas-fase3-aditivo-sem-aditivo.png
- multas-fase3-aditivo-anexando.png
- multas-fase3-aditivo-assinado.png
- multas-fase3-app-grupos.png
- multas-fase3-app-aceite-antes.png
- multas-fase3-app-aceite-depois.png
- multas-fase3-app-offline.png
