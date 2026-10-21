# Equipamentos — fotos do item

Data: 21/10/2026 · Aprovado por Renan. Complementa `2026-10-21-equipamentos-mvp-design.md` (que deixava fotos fora do MVP).

## 1. Objetivo

Anexar várias fotos a cada equipamento com facilidade, como os anexos do Planner, com uma foto de **capa** que aparece como miniatura na lista.

Fora do escopo: PDF e outros anexos (só imagens), edição ou rotação de imagem, legenda por foto, publicação no PROD.

## 2. Decisões

1. Só imagens: PNG, JPG, GIF ou BMP até 5 MB (os tipos que a coluna de imagem do Dataverse aceita; mesmo limite da foto do funcionário). Arquivo inválido mostra a mensagem e não é enviado.
2. Fotos tiradas pela TI e pelo celular: "Adicionar fotos" usa `<input type=file accept="image/*" multiple>`, que no celular abre câmera ou galeria.
3. Três jeitos de adicionar com o drawer do item aberto: Ctrl+V de imagem (como na ficha do veículo), arrastar vários arquivos e o botão. Texto colado num campo do formulário continua indo para o campo.
4. Envio uma a uma, na ordem recebida, com barra de progresso. Uma falha não para as demais.
5. Fotos gravam na hora, à parte do Salvar do formulário. Item novo só recebe fotos depois do primeiro salvamento ("Salve o item para adicionar fotos."). Durante o envio o drawer não fecha nem salva.
6. Regra da capa (domínio puro, `domain/fotos.ts`): a primeira foto do item vira capa; só uma capa por item; "Definir como capa" marca a nova e desmarca a antiga; excluir a capa promove a mais antiga restante. Sem nenhuma marcada (gravado fora do shell), o drawer trata a mais antiga como capa e a lista mostra o ícone do tipo.
7. Clicar na miniatura abre a foto grande (`$value?size=full`); se ela não carregar, mostra a miniatura com aviso.
8. Excluir pede confirmação ("Excluir foto?"). Excluir o equipamento (só pelo maker portal; o shell não exclui) apaga as fotos (Cascade).
9. Drawer, overlay, "Descartar alterações?" e versão do build continuam como estão.
10. Privilégios: a tabela nova entra no `conceder-privilegios-equipamentos.ps1` com as outras duas; pela decisão do Renan, só os papéis Acesso-Betinhos-MDA e DEV - Usuário (padrão de `-Roles` no script).

## 3. Dados (Dataverse DEV)

Tabela `cr40f_fotoequipamento` (UserOwned), criada por `packages/deploy/provision-equipamentos.ps1`:

| Coluna | Tipo | Regra |
| --- | --- | --- |
| `cr40f_name` | Texto (primária, 200) | obrigatório; nome do arquivo (imagem colada: "Foto colada aaaa-mm-dd HHhMMmSSs.png") |
| `cr40f_imagem` | Imagem | primária da tabela (`IsPrimaryImage`: só a primária aceita a imagem no POST que cria o registro), `CanStoreFullImage`, `MaxSizeInKB` 10240 |
| `cr40f_equipamento` | Lookup → `cr40f_equipamento` | obrigatório; exclusão **Cascade** |
| `cr40f_capa` | Sim/Não | padrão Não; uma por item, mantida pelo shell |

Leitura: o `$select` de `cr40f_imagem` devolve a miniatura (144 px, JPEG, base64); a grande vem de `…/cr40f_fotoequipamentos(<id>)/cr40f_imagem/$value?size=full&v=<cr40f_imagemid>`. A lista busca só as capas (`cr40f_capa eq true`); as fotos do item, só no drawer. Sem a tabela (antes do provision), a lista carrega sem miniaturas e só a seção Fotos mostra "Tabela cr40f_fotoequipamento não encontrada na metadata.".

Envio: POST com `cr40f_name`, `cr40f_capa`, `cr40f_imagem` (base64) e `cr40f_Equipamento@odata.bind`, depois GET da foto para a miniatura e a data. Capa: PATCH `cr40f_capa`, a nova antes da antiga (falha no meio deixa duas capas, nunca nenhuma; a lista mostra a mais antiga). Exclusão: DELETE da foto e, se era a capa, PATCH na mais antiga restante.

## 4. Telas

- Seção **Fotos (n)** no fim do drawer do item: grade de miniaturas quadradas, botão "Adicionar fotos", texto de ajuda, barra "Enviando foto 2 de 3 · nome", alerta com os arquivos recusados.
- Cada foto: miniatura (abre a grande), nome, selo "Capa" ou botão "Definir como capa" (estrela), botão "Excluir" (lixeira).
- Lista: miniatura da capa ao lado da descrição (tabela 32 px, cards 48 px); sem foto, ícone do tipo (pelo nome do tipo; desconhecido, ícone genérico). A coluna Equipamento mantém a largura para as 7 colunas caberem em 1366 px.

## 5. Verificação

Vitest (`domain/fotos.test.ts`, `components/FotosSecao.test.tsx`), `pnpm typecheck`, `pnpm test`, roteiro em mock (`fluxo-mock.cjs`) e roteiro do DEV na skill `verificar-equipamentos`.
