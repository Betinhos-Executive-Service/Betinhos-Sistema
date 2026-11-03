---
name: verificar-treinamentos
description: "Verifica o módulo Treinamentos do App Motoristas: card e pendência na Home, lista Pendentes/Concluídos, detalhe com texto, vídeo e anexos, confirmar leitura ao rolar até o fim, assinatura desenhada, quiz com nota mínima e refazer, histórico e reabertura sem alteração. Use após mudar src/screens/TreinamentosScreen.tsx, src/lib/treinamentos.ts, src/treinamentos.css, os capítulos 'treinamentos' do tour ou a integração em src/App.tsx, ou quando pedirem para testar treinamentos."
---
# Verificar treinamentos

## Cobre
- Código: `src/screens/TreinamentosScreen.tsx`, `src/lib/treinamentos.ts` (regras e acesso), `src/treinamentos.css` (reaproveita `termos.css`), card/pendência em `src/screens/InitialScreen.tsx`, estado em `src/App.tsx`, capítulos `treinamentos` e `treinamento-detalhe` em `src/app/tourChapters.ts`, `tests/treinamentos.test.ts`.
- Rota: `#treinamentos`. Dados: `cr40f_treinamento` (publicados, `cr40f_estado eq 100000001`) e `cr40f_treinamentoparticipacao` filtrada por `_cr40f_funcionario_value` do motorista logado. O App só atualiza a própria participação (`cr40f_abertoem`, `confirmadoem`, `assinadoem` + `nomeassinante` + `assinaturajson`, `nota` + `aprovado` + `tentativas` + `respostasjson`, `concluidoem`); nunca cria nem apaga. Quem não tem participação (fora do público) não vê o treinamento.
- Regra de conclusão: leitura confirmada → assinatura (se `cr40f_exigeassinatura`) → quiz aprovado pela `cr40f_notaminima` (se `cr40f_exigequiz`) → `concluidoem`. Reprovado pode refazer (tentativas somam). Reabrir concluído não grava nada.

## Preparar ambiente
- `PORT=<porta reservada> node scripts/dev-server.cjs --strictPort` (porta em `~/.codex/dev-ports.json`; nesta worktree 36487). Modo mock em `localhost`: cabeçalho "RH · Mock local"; dois treinamentos para o motorista local ("[Mock] Direção defensiva na Marginal", sem exigências, com link de vídeo e dois anexos; "[Mock] Atendimento premium ao passageiro", assinatura + quiz com 3 perguntas e nota mínima 70, vídeo do YouTube) e um terceiro sem participação, que não deve aparecer. O mock vive na memória da página: recarregar zera.
- Parâmetros: `?mockTreinamentos=vazio` (sem treinamentos), `?mockTreinamentoErro=gravar` (toda gravação falha). A abertura mostra o erro logo abaixo do título, com "Tentar de novo" (refaz a gravação); as ações mostram só a mensagem amigável, nunca o texto cru do Dataverse (só `ErroTreinamento` chega ao motorista).
- Tour: `localStorage.setItem("app-motoristas-tour-v2:localhost-driver:*", "visto")` para ele não abrir sobre a tela.

## Roteiro automatizado (preferido)
`NODE_PATH=<node_modules com playwright-core> APP_MOTORISTAS_URL=http://127.0.0.1:<porta> CHROME_PATH=<chromium> node scripts/qa/verify-treinamentos.cjs .verificacao/<data>-<branch>` — todas as linhas `OK` em `resultado.txt` (39), prints `01-home` … `14-falha-gravar` (375×812, 2x). Cobre os cenários 1–6 do brief e os casos de borda (vídeo inválido vira link, imagem que não carrega vira link, fora do público não aparece, reabrir não altera, falha ao gravar com `?mockTreinamentoErro=gravar`).
Tour: `node scripts/qa/verify-tour.cjs <pasta> treinamentos,treinamento-detalhe [--largura=360]` — `31 OK`.

## Roteiro manual (375 px)
1. Home: card "Treinamentos" com selo 2 e linha "2 treinamentos para fazer" nas pendências. Toque abre `#treinamentos`.
2. Lista: aba Pendentes (2) com selo "Novo", exigências ("Assinatura · Quiz") e prazo ("Até 15/12/2026"); Concluídos vazia.
3. "Direção defensiva": topo com selo "Leitura", data, "Conclua até 15/12/2026", link "Abrir vídeo do treinamento" (URL do SharePoint não embute), texto com títulos/listas/negrito, "Fotos e arquivos" (PDF como link; o vídeo `.mp4` vira player nativo (`<video controls>`; em localhost não carrega e cai no link "O vídeo não carregou aqui"); a foto do SharePoint não carrega em localhost e vira link "A imagem não carregou aqui"). Sem toast de erro. "Confirmar leitura" desativado com a dica "Role até o fim…"; ao chegar ao fim habilita; tocar conclui ("Treinamento concluído", "Concluído em", "Leitura confirmada").
4. "Atendimento premium": selos "Assinatura obrigatória" e "Quiz · nota mínima 70%", vídeo do YouTube embutido + "Abrir o vídeo em outra janela". Confirmar leitura → bloco "Assinatura" ("em seu nome: Renan", quadro com "Assine com o dedo aqui", "Assinar" desativado sem traço). Assinar → bloco "Quiz" (3 perguntas, "Enviar respostas" desativado até responder tudo). 15 minutos / O motorista / Contar… → "Você acertou 2 de 3 (66%). A nota mínima é 70%." + "Refazer quiz". Refazer com as três certas → concluído com "100% · aprovado", "2 tentativas", "Assinado por Renan" e o desenho da assinatura.
5. Voltar: Pendentes "Nenhum treinamento pendente…"; Concluídos (2) com "Concluído em dd/mm/aaaa" e "Nota 100%". Reabrir um concluído mostra o resumo sem botões de etapa; voltar mantém os mesmos dados.
6. `?mockTreinamentos=vazio`: lista vazia e Home sem selo/pendência.
7. Console sem erros (fora o aviso WebGPU do Chromium headless e as falhas esperadas de sharepoint.com/youtube).

## Casos de borda
- Vídeo próprio: `cr40f_videourl` com link https terminando em .mp4/.m4v/.webm/.mov, ou anexo com mime `video/*`, toca no player nativo; se falhar, vira link para abrir.
- Treinamento sem vídeo/anexos: blocos somem. Vídeo com URL que não é https → "O link do vídeo deste treinamento é inválido. Avise o RH."
- Quiz com pergunta de uma alternativa só ou JSON inválido: pergunta descartada (`parsePerguntas`).
- Duas participações do mesmo treinamento (publicação repetida): fica a mais adiantada.
- Falha ao gravar: alerta vermelho acima da etapa com mensagem amigável, botão volta ao normal, nada muda localmente. Erro da abertura: topo da tela com "Tentar de novo".
- Foco por etapa: ao mudar de etapa (leitura → assinatura → quiz → concluído) a seção rola ao topo da tela e recebe o foco (`aria-label` "Assinatura"/"Quiz"); "Refazer quiz" devolve o foco ao quiz; na abertura nada rola (também em StrictMode).

## Push e lembrete (Custom API + flow)
- Código: `plugins/DriverRecordSharing/TreinamentoCommandPlugin.cs` (`cr40f_LembrarTreinamento`: só treinamento publicado; ignora concluídas, já na fila (Pendente) e lembradas há menos de 24 h; grava `cr40f_pushstatus` = Pendente, `cr40f_pusherro` vazio, `cr40f_lembradoem`), testes em `plugins/DriverRecordSharing.Tests/TreinamentoCommandPluginTests.cs`; `scripts/provision-treinamentos-push.ps1` (Custom API + flow "Push Treinamentos | Motoristas"; chamado pelo `push-dev.ps1`, depois dos comunicados); deep link `treinamentoParticipacaoId` (`getInitialTreinamentoParticipacaoId` em `src/app/bootstrap.ts` e efeito em `src/App.tsx`).
- Local: `pnpm test` (bootstrap e pushRedirect cobrem o deep link); `dotnet test plugins/DriverRecordSharing.Tests` (net462 pede `mono` no Linux; `ExchangePossessionFinalizerTests.cs` não compila fora do Windows).
- DEV, depois do schema do Sistema aplicado e do `pnpm push` do App: disparar `cr40f_LembrarTreinamento` num treinamento de teste e conferir na participação `cr40f_pushstatus` 100000001 (Enviado) ou 100000002 com `cr40f_pusherro`; segundo disparo em menos de 24 h devolve `cr40f_Ignorados`. Recebimento no aparelho é verificação separada.

## Evidência obrigatória
- `resultado.txt` só com `OK`, prints `04-confirmar-leitura.png`, `08-quiz-reprovado.png`, `09-concluido-quiz.png`, `11-lista-concluidos.png`.

## Limites
- Premissas que o mock não prova e só o DEV (URL direta do web resource, motorista de teste) confirma: o motorista lê o site `BetinhosGestoInterna` do SharePoint (`SP_HOST`/`SP_SITE_PATH` fixos, iguais em DEV e PROD); `<img>` do SharePoint carrega a partir de `*.dynamics.com` (em iOS pode cair no link por cookie de terceiros); `<video>` do SharePoint toca a partir de `*.dynamics.com` (cookie de terceiros e CSP `media-src`; se falhar cai no link); a CSP permite iframe de `youtube-nocookie.com` e `player.vimeo.com`.
- O quiz é corrigido no cliente (`corretaId` vem no JSON) e o motorista grava `nota`, `aprovado` e `concluidoem` na própria participação: serve como registro informativo. Garantia para auditoria do RH exige mover a correção para uma Custom API.
- Em localhost nada vai ao Dataverse. No DEV exige o papel do motorista com leitura em `cr40f_treinamento` e leitura+escrita na própria `cr40f_treinamentoparticipacao` (a participação precisa pertencer ao usuário do motorista, ou ser compartilhada com ele). Validação com dados reais só no DEV, com usuário motorista de teste.
