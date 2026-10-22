---
name: verificar-equipamentos
description: "Verifica o módulo de Equipamentos do shell (#/equipamentos com as fotos do item, aba Equipamentos da ficha do funcionário) e os scripts de schema e privilégios no Dataverse DEV. Use após mudar apps/shell/src/pages/equipamentos/**, a aba Equipamentos em apps/shell/src/pages/funcionarios/**, packages/deploy/provision-equipamentos.ps1 ou packages/deploy/conceder-privilegios-equipamentos.ps1."
---
# Verificar Equipamentos

## Cobre
- Código: `apps/shell/src/pages/equipamentos/**` (fotos: `domain/fotos.ts`, `components/FotosSecao.tsx`, `components/ImagemFoto.tsx` (imagem sob demanda), `data/imagens.ts` (cache), consultas em `data/queries.ts`; arquivos no SharePoint pelo store generalizado `funcionarios/data/sharepoint.ts`, pasta `Equipamentos/<id>`, no DEV `Equipamentos/DEV/<id>`); aba Equipamentos em `apps/shell/src/pages/funcionarios/**` (`components/RelatedTabs.tsx` `EquipamentosTab`, `Ficha.tsx`, `data/{types,source,dataverse,mock}.ts`).
- Schema e privilégios no DEV: `packages/deploy/provision-equipamentos.ps1` (tabelas `cr40f_tipoequipamento`, `cr40f_equipamento` e `cr40f_fotoequipamento`, UserOwned, semente de tipos) e `packages/deploy/conceder-privilegios-equipamentos.ps1` (copia para as três tabelas os privilégios que os papéis têm em `cr40f_funcionarios`).
- Specs: `docs/superpowers/specs/2026-10-21-equipamentos-mvp-design.md` e `docs/superpowers/specs/2026-10-21-equipamentos-fotos-design.md`.

## Testes e tipos
1. `cd apps/shell && pnpm exec vitest run src/pages/equipamentos src/pages/funcionarios` → todos passam (188 em 22 arquivos em 22/10/2026, com as fotos no SharePoint). `pnpm test -- <arquivo>` não filtra: roda a suíte toda.
   Fotos: `domain/fotos.test.ts` (regra da capa, validação, nome no SharePoint, Ctrl+V, mapeamento, cache das imagens e fonte do Dataverse com host e flows simulados: Salvar em `Equipamentos/DEV/<id>` antes do registro com `cr40f_caminho`, falha no Salvar sem registro, falha no registro exclui o arquivo, excluir apaga arquivo e registro, Consultar devolve a imagem), `components/FotosSecao.test.tsx` (colar, arrastar, capa, excluir, item novo, Esc da foto grande, envio que falha) e `components/EquipamentosList.test.tsx` (50 itens com IntersectionObserver simulado: só as linhas visíveis pedem a capa, rolar pede as próximas, voltar usa o cache; capa que falha mostra o ícone do tipo). O store de Funcionários continua em `funcionarios/data/sharepoint.test.ts`.
2. `pnpm typecheck` → sem erros. Suíte completa (`pnpm test`, ~2,5 min) antes do PR: 1472 no shell em 22/10/2026.

## Dados do mock (`pnpm dev`, porta 36472)
`data/mock.ts`; o mock recarrega a cada entrada na página (o que foi cadastrado some ao sair e voltar).
- Notebook do Financeiro: Em uso com Bruna Ficticia Lima, com data e valor de compra.
- Celular plantão: Em uso com Gustavo Amostra Pires, desligado no mock de Funcionários → selo "Inativo" na coluna Responsável.
- Impressora antiga: Baixado, fora da Visão padrão (aparece em "Baixados" e "Todos, inclusive baixados").
- Maquininha Carlos: Em uso com Carlos Alberto Teste (`m1`, id `eeeeeeee-0000-4000-8000-000000000005`); é o item da aba Equipamentos da ficha dele.
- Pager da portaria: tipo Pager inativo (marcado no drawer de Tipos; some do seletor para novos itens).
- Sem responsável (fora baixados): Notebook reserva, Maquininha reserva, Pager da portaria.
- Fotos (`createMockFotos`, imagens SVG geradas num "SharePoint" em memória por caminho `Equipamentos/DEV/<id>/<arquivo>`; o download simula 400 ms): Notebook do Financeiro com `notebook-frente.jpg` (capa) e `notebook-etiqueta.jpg`; Maquininha Carlos com `maquininha.jpg` (capa). Os demais itens começam sem foto (ícone do tipo na lista). Fotos enviadas ficam em memória até recarregar a página; as imagens aparecem como `blob:` (cache da página).

## Roteiro em mock (navegador)
Com `pnpm dev` rodando em `apps/shell` (na VM cloud, em grupo próprio: `setsid pnpm dev > log 2>&1 &`, e no fim `kill -TERM -<PGID>`; nunca `pkill -f vite`):
`node .claude/skills/verificar-equipamentos/fluxo-mock.cjs <pasta-dos-prints> [desktop|mobile|ambos]` (Playwright + Chromium headless de `/opt/node-tools` e `/opt/pw-browsers`; fora da VM, `PLAYWRIGHT_MODULE` e `CHROMIUM`). Desktop 1366×800 e celular 375×800; uma linha ✅/❌ por passo e prints `<viewport>-NN-<passo>.png`.
1. Lista carrega com "Dados de exemplo", versão do build no canto (`v0.0.NN · data`), sem rolagem horizontal da página nem da tabela em 1366 px; colunas Equipamento (com a miniatura da capa ou o ícone do tipo), Tipo, Marca/modelo, Responsável, Status, Nº de série, Compra, todas à vista.
2. Novo equipamento "Webcam sala de reunião", tipo Outro → nasce Disponível, toast "… cadastrado.", item na lista.
3. Atribuir responsável → status vira Em uso; trocar responsável → linha com o novo nome.
4. Status Baixado → Responsável limpo e desabilitado ("Item baixado não fica com responsável."); depois de salvar o item sai da Visão padrão e aparece na visão "Baixados" com "Sem responsável".
5. Visão pronta "Sem responsável": só os três itens sem responsável e não baixados.
6. Tipos: adicionar "Webcam", renomear para "Câmera", inativar → selo "Inativo"; repetido (sem diferenciar maiúsculas e acentos) é recusado.
7. Fechar o drawer com alteração → "Descartar alterações?" (Continuar editando / Descartar). Sem alteração, clique no fundo (desktop) ou Esc fecha sem perguntar; abaixo de 560 px o drawer ocupa a tela toda (sem fundo clicável).
8. `#/funcionarios` → ficha de Carlos Alberto Teste → aba Equipamentos (entre Veículos e Anotações) lista Maquininha Carlos; clicar abre `#/equipamentos?ver=eeeeeeee-0000-4000-8000-000000000005` com o drawer do item.
9. Fotos (antes de sair para a ficha, porque recarregar zera o mock):
   - Capa da lista de Notebook do Financeiro chega como `blob:` (baixada do "SharePoint" só na linha visível); nenhuma `<img>` quebrada.
   - Ctrl+V real de uma imagem (clipboard do Chromium liberado no contexto) no drawer de Notebook reserva → miniatura na seção, vira capa e aparece na lista no lugar do ícone do tipo.
   - Ctrl+V de texto no campo Marca/modelo → o texto vai para o campo e nenhuma foto é criada.
   - Arrastar 3 imagens (PNG, JPG, PNG) no drawer de Monitor 24" recepção → barra "Enviando foto 1 de 3 · …", enviadas na ordem; só a primeira é capa.
   - PDF e PNG de 6 MB → alerta "2 fotos não foram enviadas" com a mensagem de cada um; nada é enviado.
   - "Definir como capa" na 2ª → só ela marcada (sem mostrar duas capas no meio) e a lista troca a miniatura.
   - Excluir a capa (confirmando) → a mais antiga restante vira capa; excluir todas → lista volta ao ícone do tipo.
   - Clicar na miniatura → foto grande; Esc fecha só ela (o drawer continua aberto).
   - Novo equipamento → seção Fotos com "Salve o item para adicionar fotos." e "Adicionar fotos" desabilitado; sem rolagem horizontal no drawer.
   - Desktop: a tabela não rola por dentro em 1366 px (a miniatura divide a coluna Equipamento; descrições longas quebram em 2 linhas).
10. Console sem `console.error` nem `pageerror` em todo o fluxo.

## Verificação no DEV (Tarefa 10 do plano; só depois do merge)
Só na `main` do checkout principal (`Sistema Betinhos`), com `git pull`. Nunca em sessão cloud, worktree ou branch de feature; nunca PROD (os scripts recusam o host de PROD e `DV_BLOCKED_HOSTS`).
1. Antes de rodar, conferir os `.ps1` no Windows: `[System.Management.Automation.Language.Parser]::ParseFile(<caminho>, [ref]$null, [ref]$erros)` sem erros e os 3 primeiros bytes `ef bb bf` (BOM; o PowerShell 5.1 precisa dele para os acentos). Rodar com `powershell.exe` (5.1), não `pwsh`.
2. `powershell.exe -File packages/deploy/provision-equipamentos.ps1` (dry run) → "DRY RUN criaria a tabela cr40f_tipoequipamento" e "… cr40f_equipamento". Se disser que já existem, pare e compare a metadata.
3. Mesmo script com `-Apply` → `SCHEMA OK`; conferências pós-publicação: `cr40f_datacompra` DateOnly, padrão do status Disponível, relacionamentos com RemoveLink na exclusão (tipo e responsável) e Cascade (fotos), MaxLength das colunas, `cr40f_fotoequipamento.cr40f_caminho` texto com MaxLength 400, tudo na solução `DV_SOLUTION`. Com a tabela de fotos ainda inexistente, o dry run mostra "DRY RUN criaria a tabela cr40f_fotoequipamento" e a linha das colunas `cr40f_caminho`/`cr40f_capa` e do lookup. Com a tabela já criada (DEV, 22/10/2026), o dry run mostra "DRY RUN criaria cr40f_fotoequipamento.cr40f_caminho" e o "AVISO: cr40f_fotoequipamento.cr40f_imagem … não é mais usada": a coluna de imagem da versão anterior **não** é apagada pelo script; removê-la no maker portal só com confirmação do Renan (tabela sem fotos, sem migração). `cr40f_name` precisa sair 100 (tipo) e 200 (equipamento), `ApplicationRequired`: o Dataverse ignora isso no POST da tabela (no DEV nasceu 850/None em 21/10/2026), e o `Ensure-NameAttribute` acerta por PUT; o dry run mostra "DRY RUN mudaria … de MaxLength 850/None para …" enquanto não estiver certo. Lógica testável sem Dataverse: extrair a função pelo AST e rodar com `Invoke-Dataverse` simulado (dry run sem PUT; Apply com um PUT `StringAttributeMetadata`, sem anotações `@odata` extras e com `MSCRM.MergeLabels`; já correto não grava).
4. `powershell.exe -File packages/deploy/conceder-privilegios-equipamentos.ps1` (dry run): papéis padrão Acesso-Betinhos-MDA e DEV - Usuário (decisão do Renan, 21/10/2026: o Canvas fica de fora e aparece só no AVISO de papéis que acessam `cr40f_funcionarios`). As três tabelas aparecem no resumo; para fotos, conferir `prvCreate`/`prvAppend`/`prvDelete` em `cr40f_fotoequipamento` e `prvAppendTo` em `cr40f_equipamento` (sem eles o envio ou a exclusão falha com a mensagem do Dataverse na seção Fotos). A profundidade é copiada de `cr40f_funcionarios`: conferir que `prvRead*` das três tabelas saem **Global** (tabelas UserOwned: com profundidade Usuário cada um só veria os próprios registros, e os tipos semeados ficam com quem rodou o provision). Ler o AVISO dos papéis que acessam `cr40f_funcionarios` e ficaram fora da lista; incluir com `-Roles` se o Renan pedir. Depois `-Apply` → `PRIVILEGIOS OK`. Para tirar acesso de um papel (ex.: Acesso-Betinhos-Canvas, que recebeu prv* Global numa execução antiga): `-RemoverDe "Acesso-Betinhos-Canvas"`; o dry run lista "DRY RUN <papel> perderia: …" (só o que ele tem nas três tabelas), o `-Apply` remove por `RemovePrivilegeRole` e falha se sobrar algum. Papel em `-Roles` e `-RemoverDe` ao mesmo tempo é recusado. Conferir depois pela Web API: `roles(<id>)/roleprivileges_association?$filter=contains(name,'equipamento')` vazio (os nomes vêm com o SchemaName, ex.: `prvReadcr40f_Equipamento`).
5. `pnpm push` (nunca em paralelo) e commit do bump `build: Sistema Betinhos vX.Y.Z publicado no DEV a partir da main`.
6. Teste autenticado no DEV (`https://org23b93544.crm2.dynamics.com/WebResources/cr40f_SistemaBetinhos.html#/equipamentos`, forçar o cache como em `verificar-shell`):
   - cadastrar um item real e atribuir responsável (PATCH com `cr40f_Responsavel@odata.bind`);
   - limpar o responsável: na aba Rede, `DELETE …/cr40f_equipamentos(<id>)/cr40f_Responsavel/$ref` antes do PATCH (nunca `@odata.bind: null`); recarregar e conferir o campo vazio;
   - aba Equipamentos na ficha do responsável lista o item e o link abre `#/equipamentos?ver=<guid>`;
   - inativar um tipo: some do seletor de novo item; no drawer de um item que já o usa aparece como "<tipo> (inativo)";
   - antes do provision (ou num ambiente sem as tabelas) a página mostra "Tabela cr40f_equipamento não encontrada na metadata." e a aba da ficha mostra o erro só dentro dela, sem cair em mock.
   - Fotos (num item de teste; os arquivos vão para "Documentos Compartilhados" › `Equipamentos/DEV/<id>`, pelos flows de Funcionários):
     - Ctrl+V de um print → na aba Rede, o POST no flow Salvar (`new_URLFlowsalvararquivosSharePoint`) com `caminhoCompleto: "Equipamentos/DEV/<id>"`, seguido do POST em `cr40f_fotoequipamentos` com `cr40f_name`, `cr40f_caminho` (o caminho devolvido pelo flow), `cr40f_capa: true` e `cr40f_Equipamento@odata.bind`; nenhum base64 vai ao Dataverse. A miniatura aparece na seção e na lista sem baixar de volta (vem do arquivo colado). Conferir o arquivo na pasta do SharePoint.
     - arrastar 3 fotos tiradas pelo celular (JPG) → 3 pares Salvar + POST em sequência, na ordem; só o primeiro com `cr40f_capa: true`.
     - foto do celular pelo "Adicionar fotos" no próprio celular (abre câmera ou galeria).
     - recarregar a página → só as linhas visíveis chamam o flow Consultar (`new_URLFlowConsultarArquivosSharePoint`) para a capa; rolar chama as próximas; voltar a uma linha não chama de novo. Abrir o item → as miniaturas vêm do Consultar; clicar numa → a foto grande aparece sem novo Consultar.
     - "Definir como capa" → PATCH `cr40f_capa: true` na nova e `false` na antiga; recarregar a página e conferir a miniatura da lista (consulta `cr40f_capa eq true` com `cr40f_caminho`).
     - excluir a capa → flow Excluir (`new_URLFlowExcluirArquivoSharePoint`) com o caminho, DELETE da foto e PATCH `cr40f_capa: true` na mais antiga restante; o arquivo some da pasta.
     - registro que falha (ex.: usuário sem `prvCreate` em `cr40f_fotoequipamento`) → mensagem do Dataverse na seção e o flow Excluir apaga o arquivo enviado (a pasta fica sem ele).
     - cascata: com fotos num item de teste, excluir o item pelo maker portal (o shell não exclui equipamento) e conferir em `cr40f_fotoequipamentos?$filter=_cr40f_equipamento_value eq <id>` que não sobrou registro (os arquivos no SharePoint ficam; apagar a pasta à mão).
     - usuário de um papel concedido (não o administrador) envia, vê, troca a capa e exclui sem erro de privilégio nem de permissão na pasta do SharePoint.
     - sem a tabela de fotos (ambiente sem o provision novo): a lista carrega sem miniaturas e só a seção Fotos mostra "Tabela cr40f_fotoequipamento não encontrada na metadata.".
   Apague os itens de teste depois. Informar ao Renan a versão publicada.

## Casos de borda
- Funcionário inativo = desligado (`cr40f_status` 1) ou registro inativo (`statecode` 1); Afastado conta como ativo e pode receber equipamento (confirmado pelo Renan, 21/10/2026). Inativo continua no item com selo, fora do seletor.
- Item Baixado com responsável gravado fora do shell: o campo fica habilitado só para limpar.
- Número de série repetido avisa (com a descrição do outro item) e não bloqueia.
- `?ver=` inexistente: aviso "Equipamento não encontrado" e "Voltar à lista".
- Falha ao salvar: drawer aberto com o que foi digitado e toast com a mensagem do Dataverse.
- Conhecido (herdado de Infrações): trocar o `?ver=` por voltar/avançar com o formulário alterado descarta sem perguntar.
- Fotos: gravam na hora, à parte do Salvar do formulário; nome do arquivo sem `/ \\ : * ? " < > | # %` e sem repetir outro do item ("a (2).png"). Capa que não baixa (flow fora, arquivo apagado no SharePoint) fica com o ícone do tipo até recarregar a página (a falha fica no cache, para não pedir de novo a cada rolagem). Excluir apaga o arquivo antes do registro: se o flow Excluir falhar, a foto continua no item para tentar de novo. Durante o envio o drawer não fecha nem salva ("Aguarde o envio das fotos terminar."). Imagem copiada de página web vem com texto: colada num campo de texto, vale o texto. Sem capa marcada (gravado fora do shell), a lista mostra o ícone do tipo e o drawer trata a mais antiga como capa; excluir uma foto acerta a marcação.

## Evidência obrigatória
- Saída de `vitest`/`typecheck`, linhas ✅/❌ do `fluxo-mock.cjs` e prints das duas larguras; no DEV, saída dos dry runs e do `-Apply`, print da aba Rede com o DELETE no `$ref`, com o flow Salvar seguido do POST da foto (`cr40f_caminho`) e com os Consultar só das linhas visíveis.

## Limites
- Sessão cloud: só mock. Schema (`cr40f_caminho`, remoção manual de `cr40f_imagem`), privilégios, permissões da pasta `Equipamentos` no SharePoint, flows reais (Salvar/Consultar/Excluir), `$ref`, cascata e dados reais ficam "não verificados na nuvem".
- Nenhum `.ps1`, `pnpm push` ou `pnpm wr` fora da `main` do checkout principal. PROD fora do escopo.
