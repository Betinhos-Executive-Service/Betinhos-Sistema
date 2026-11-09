# Implantação do Web Resource no Model-driven App

## Arquivos para subir

1. Suba `webresource.html` como Web Resource HTML.
   - Nome: `new_formulario_geral.html`
   - Tipo: `Webpage (HTML)`

2. Suba `model_driven_formulario_geral_command.js` como Web Resource JavaScript.
   - Nome: `cr40f_formulario_geral_command.js`
   - Tipo: `Script (JScript)`

3. Publique tudo.

## Botão Criar da tabela

Na tabela `cr40f_reservadeveculos`:

1. Abra o Command Designer da tabela.
2. Edite o comando `Novo` ou crie um comando novo.
3. Ação: `Run JavaScript`.
4. Library: `cr40f_formulario_geral_command.js`.
5. Function: `BetinhosFormularioGeral.openCreate`.
6. Parâmetro: `PrimaryControl`.
7. Publique.

Resultado: o botão abre `new_formulario_geral.html` em modo criação.

## Clicar em um item para editar

Command bar não substitui o clique nativo da linha.

Faça assim:

1. Crie um formulário principal novo para `cr40f_reservadeveculos`.
2. Nome do formulário: `Formulário Geral WebResource`.
3. Adicione o Web Resource `new_formulario_geral.html`.
4. Marque a opção de passar o identificador do registro, se aparecer no editor.
5. Deixe o web resource ocupando a tela.
6. Remova ou esconda os campos nativos desse formulário.
7. Coloque esse formulário como o primeiro formulário da tabela.
8. Ajuste security roles para ele aparecer para os usuários certos.
9. Publique.

Resultado: ao clicar em um registro, o Model-driven abre esse formulário e o HTML carrega o ID do registro pelo parâmetro ou pelo contexto pai.

## Comando Editar na grid

Use também se quiser um botão explícito de edição na lista.

1. Abra o Command Designer da tabela.
2. Crie um comando `Editar no Formulário Geral`.
3. Ação: `Run JavaScript`.
4. Library: `cr40f_formulario_geral_command.js`.
5. Function: `BetinhosFormularioGeral.openEdit`.
6. Parâmetros:
   - `PrimaryControl`
   - `SelectedControlSelectedItemReferences`
7. Regra de seleção: exatamente `1` linha selecionada.
8. Publique.

Resultado: o comando abre `new_formulario_geral.html` em modo edição para a linha selecionada.

## Teste obrigatório

1. Clique em `Novo`.
2. Preencha cliente, solicitante, passageiro, data, trajeto, destino e endereço.
3. Salve.
4. Confirme criação em `cr40f_reservadeveculos`.
5. Confirme vínculos em `cr40f_servicosporpassageiro`.
6. Abra o registro criado pela lista.
7. Altere um campo.
8. Salve.
9. Confirme update no mesmo registro, sem duplicar reserva.
