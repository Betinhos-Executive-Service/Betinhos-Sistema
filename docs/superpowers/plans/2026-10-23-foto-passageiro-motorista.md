# Plano: foto do passageiro para o motorista, com acesso controlado

Decisões do Renan (23/10/2026):
- O motorista só vê a foto quando o serviço está **Programado** (`cr40f_status = 202410005`) e ele é o motorista atual do serviço.
- Não há janela depois de finalizar: a perda de acesso é imediata.
- A equipe interna (Formulário Geral e Sistema Betinhos) continua vendo todas as fotos.

## Princípio
O App Motoristas nunca recebe uma URL da foto. Ele pede a imagem a uma Custom API, que confere o vínculo a cada chamada e devolve só os bytes reduzidos. Sem link guardado, não há o que vazar nem expirar.

## Fase A: fotos privadas e link com caminho (corrige também o Formulário Geral)
1. Os flows "Cadastro do passageiro | Link" e "Flow Salvar Foto BD" param de criar o link de compartilhamento "organization". Passam a gravar em `new_linkdafoto` a URL com caminho, `https://betinhos.sharepoint.com/:i:/r/sites/BetinhosGestoInterna/<biblioteca>/Passageiros/Fotos/<AMB>/<id>.<ext>`, que o Formulário Geral já converte em `getpreview.ashx` e `download.aspx`. O Salvar Foto BD continua devolvendo `webUrl`, agora com esse valor.
2. Script `regravar-links-fotos.ps1 -Ambiente DEV|PROD`, com DRY RUN e CSV de backup:
   - reescreve os `new_linkdafoto` de `/:i:/s/<token>` para a URL com caminho, resolvendo o arquivo via Graph;
   - remove os links de compartilhamento criados (6 no PROD, mais os testes do DEV).
3. Permissão da pasta `Passageiros/Fotos` só para a equipe interna. A conferência é manual no SharePoint e fica registrada no resultado.
4. Verificação: no Formulário Geral do DEV e do PROD, a foto aparece e o log `[TFG foto pax]` mostra `render:loaded`.

## Fase B: Custom API `new_ObterFotoPassageiro` (plugin `Cr40f.Cadastro.Plugin`)
- Entrada: `new_ReservaId`, `new_PassageiroId`. Saída: `new_FotoJson` = `{ok, mime, base64}` ou `{ok:false, motivo}`, com o motivo genérico.
- Regras, todas checadas a cada chamada:
  1. a reserva está com `cr40f_status = 202410005` (Programado);
  2. o usuário iniciador é o motorista do serviço: `_cr40f_motorista_value` → `cr40f_funcionarios.cr40f_emailmicrosoft` = `systemuser.domainname` do iniciador;
  3. o passageiro pertence ao serviço (filhos `cr40f_servicosporpassageiro`, com fallback em `passageiro1..4`), usando a mesma rotina do `GerarLinkCadastroHandler`;
  4. `new_linkdafoto` aponta para a biblioteca de fotos.
- Leitura do arquivo: Graph com credencial de aplicativo (`Sites.Selected` no site BetinhosGestoInterna), no padrão de `GraphGateway` e `AcessoConfig` do plugin Acesso, com o segredo na configuração segura do step. A imagem é redimensionada para no máximo 800 px e ~150 KB, em JPEG.
- A equipe interna não usa essa API: continua com a URL com caminho.
- Testes xUnit: motorista certo e Programado retorna ok; outro motorista, status Em andamento, Finalizado ou Cancelado, passageiro de fora, sem foto e serviço sem motorista retornam `ok:false`.
- Pendência: criar ou reaproveitar o app registration com `Sites.Selected` e conceder acesso ao site. Isso exige um admin do tenant.

## Fase C: App Motoristas (repo `App Motoristas`)
- No card e no detalhe do serviço Programado: avatar grande do passageiro, que amplia com um toque. Quando não há foto ou a API nega, aparece a inicial do nome.
- Busca sob demanda via `new_ObterFotoPassageiro`, guardada só em memória (`URL.createObjectURL`, revogada ao sair da tela), sem cache em disco nem service worker.
- Ao mudar o status ou a atribuição, a foto some na próxima atualização: a API já nega.

## Ordem e entregas
A → B → C, um PR por fase (A e B neste repo, C no App Motoristas). Publicação no DEV pela `main`. O PROD vai junto com a próxima liberação, ou antes para a Fase A, que corrige o Formulário Geral.
