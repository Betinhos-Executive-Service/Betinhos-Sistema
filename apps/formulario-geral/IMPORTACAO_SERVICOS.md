# Importação de Serviços XLSX

Este documento explica a lógica atual da importação de serviços por XLSX.

A ideia central é simples:

> A planilha vem em linhas.  
> O sistema transforma essas linhas em PGs.  
> Cada PG vira um ou mais serviços revisáveis.  
> O usuário confirma, separa, mescla ou corrige antes de salvar.

## 1. Vocabulário

| Termo | Significado prático |
| --- | --- |
| Linha da planilha | Uma linha do XLSX. Normalmente representa um passageiro em um horário. |
| PG | Número da Programação. É o agrupador externo principal. |
| ST | Número da Solicitação. Pode existir uma ou várias STs dentro da mesma PG. |
| Trecho | Serviço interno revisável. Na prática, vira uma OS se confirmado e salvo. |
| OS | Ordem de Serviço salva no Dataverse. |
| Ida | Primeira parte operacional do serviço. Ex.: buscar o passageiro em casa e levar até o destino. |
| Retorno / busca | Linha de volta. Ex.: buscar o passageiro no destino às 18:30 e levar de volta. |
| Espera | Uma única OS com motorista à disposição até o retorno previsto. |
| Split | Separar uma PG em duas OS: ida e busca. |
| Multi-coleta | Uma única OS em que o carro busca passageiros diferentes em horários próximos e vai para o mesmo destino. |
| Mesmo carro | Ação manual para mesclar serviços separados quando o operador sabe que é o mesmo veículo. |

## 2. Fluxo geral

1. O usuário importa um XLSX na aba de importação.
2. O sistema lê a aba `Passengers`. Se ela não existir, usa a primeira aba do arquivo.
3. O sistema valida apenas as colunas obrigatórias.
4. As linhas são normalizadas.
5. As linhas são agrupadas por PG.
6. Dentro de cada PG, o sistema decide se nasce 1 serviço ou mais de 1 serviço.
7. Cada serviço aparece em revisão.
8. O usuário pode editar, confirmar, ignorar, separar ida/busca ou mesclar como mesmo carro.
9. O botão `Agendar confirmados` salva somente os serviços confirmados.

## 3. Colunas do XLSX

### Obrigatórias

Sem essas colunas, a importação não deve continuar:

| Coluna | Uso |
| --- | --- |
| `Data da Viagem (inicial)` | Data principal do serviço. |
| `Número Programação` | PG. Agrupador externo. |
| `Horário Passageiro` | Horário da linha. |
| `Nome Passageiro` | Passageiro da linha. |
| `Origem` | Endereço de saída da linha. |
| `Destino` | Destino da linha. |

### Opcionais

Se uma coluna opcional não vier no XLSX, o sistema não deve travar.

Exemplos:

- `Número solicitação`
- `Status`
- `Tipo Serviço`
- `Tipo Transporte`
- `Tel Res.`
- `Tel Cel.`
- `Centro Custo Passageiro`
- `Solicitante`
- `Cidade Origem`
- `Cidade Destino`
- `Nome motorista`
- `Observação`
- `Observação faturamento`

Motivo: quando nenhuma linha tem informação em determinada coluna, o sistema que gera o XLSX pode remover a coluna inteira.

## 4. Normalização das linhas

Antes de agrupar, cada linha é limpa.

O sistema normaliza:

- data para formato interno;
- horário para `HH:mm`;
- nome do passageiro sem prefixos desnecessários;
- telefone só com números;
- centro de custo em maiúsculas;
- endereço e destino sem acentos, pontuação e ruídos para comparação;
- tipo de serviço sugerido;
- tipo de veículo sugerido.

Campos de valor do relatório, como `Valor Bruto da Viagem`, `Custo total da viagem`, `Outros/VALOR DA VIAGEM` e `Custo Passageiro`, são descartados.

Exemplo:

```text
Destino original:
Avenida das Nações Unidas, 8501 - Pinheiros, São Paulo, SP, ECO

Chave normalizada:
avenida das nacoes unidas 8501 pinheiros sao paulo sp eco
```

A chave normalizada serve para comparar endereços. O texto original continua sendo exibido para o operador.

## 5. Regra principal de agrupamento

O primeiro agrupamento é sempre por PG.

Exemplo:

```text
PG100
  linha 1
  linha 2
  linha 3

PG200
  linha 4
  linha 5
```

Depois disso, o sistema decide quantos serviços nascem dentro da PG.

## 6. Quando a PG vira 1 serviço

### Caso A: uma linha só

Se a PG tem uma linha, nasce 1 serviço.

Exemplo:

```text
08:00 - ANA - Hotel A -> Escritório A
```

Resultado:

```text
1 OS
Saída: 08:00
Retorno previsto: vazio
```

### Caso B: ida e retorno com espera

Se a PG tem uma linha de ida e uma linha posterior de retorno, por padrão nasce 1 serviço com retorno previsto.

Exemplo:

```text
08:00 - ANA - Hotel A -> Escritório A
17:00 - ANA - Escritório A -> Hotel A
```

Resultado:

```text
1 OS
Saída: 08:00
Horário previsto de retorno: 17:00
```

Essa OS significa:

> O motorista pega o passageiro às 08:00, fica à disposição, e retorna às 17:00.

### Caso C: múltiplos passageiros no mesmo serviço

Se várias linhas têm o mesmo contexto operacional, os passageiros entram na mesma OS.

Exemplo:

```text
08:00 - ANA - Hotel A -> Escritório A
08:00 - BRUNO - Hotel A -> Escritório B
```

Resultado:

```text
1 OS
Passageiros: ANA, BRUNO
Endereço de saída: 08:00 - ANA, BRUNO - Hotel A
Destino:
ANA - Escritório A
BRUNO - Escritório B
```

Observação importante:

> O campo `Destino` não mostra horário.  
> Horário no destino não ajuda a operação e polui a leitura.

## 7. Multi-coleta

Multi-coleta é quando passageiros diferentes têm horários próximos e vão para o mesmo destino.

Regra atual:

- mesmo destino normalizado;
- mesma data;
- janela máxima de 1h30 entre as linhas do grupo;
- mais de um passageiro.

Exemplo:

```text
05:00 - FULANO - Casa Fulano -> Aeroporto de Congonhas
05:20 - BELTRANO - Casa Beltrano -> Aeroporto de Congonhas
```

Interpretação:

> É provavelmente o mesmo carro pegando Fulano e depois Beltrano.

Resultado:

```text
1 OS
Modo: Multi-coleta
Retorno previsto: vazio
Endereço de saída:
05:00 - FULANO - Casa Fulano
05:20 - BELTRANO - Casa Beltrano

Destino:
FULANO, BELTRANO - Aeroporto de Congonhas
```

Por que não vira retorno?

Porque os horários próximos com mesmo destino indicam coleta em sequência, não ida e volta.

## 8. Mesmo destino com diferença maior que 1h30

Quando linhas da mesma PG têm o mesmo destino, mas a diferença de horário passa de 1h30, o sistema entende como serviços separados.

Exemplo:

```text
05:00 - FULANO - Casa Fulano -> Aeroporto de Congonhas
06:45 - BELTRANO - Casa Beltrano -> Aeroporto de Congonhas
```

Resultado inicial:

```text
Serviço 1
05:00 - FULANO

Serviço 2
06:45 - BELTRANO
```

Motivo:

> 1h45 de diferença é grande demais para o sistema assumir sozinho que é o mesmo carro.

Mas o operador pode saber que é o mesmo carro.

Nesse caso:

1. Seleciona os dois serviços.
2. Clica em `É o mesmo carro`.
3. O sistema mescla em uma única OS.

Resultado depois da mescla:

```text
1 OS
Modo: Mesmo carro
Retorno previsto: vazio
Passageiros: FULANO, BELTRANO
```

Limites para mesclar:

- precisa ser a mesma PG;
- precisa ser a mesma data;
- precisa ser o mesmo destino;
- não pode estar salvo;
- não pode estar bloqueado por duplicidade.

## 9. Ida e retorno na mesma OS

Esse é o caso mais sensível.

Exemplo real:

```text
05:40 - MARCOS - Rua Francisco Ricci, 181 -> Avenida das Nações Unidas, 8501
05:50 - DANIEL - Rua Benedito Osvaldo Lecques, 300 -> Avenida das Nações Unidas, 8501
18:30 - DANIEL - Avenida das Nações Unidas, 8501 -> Rua Benedito Osvaldo Lecques, 300
18:30 - MARCOS - Avenida das Nações Unidas, 8501, ECO -> Rua Francisco Ricci, 181
```

O sistema entende:

- manhã = ida;
- 18:30 = retorno;
- origem do retorno = destino da ida;
- portanto é uma OS com retorno previsto.

Resultado correto:

```text
Endereço de saída:
05:40 - MARCOS - Rua Francisco Ricci, 181 - Vila Ema, São José dos Campos, SP
05:50 - DANIEL - Rua Benedito Osvaldo Lecques, 300 - Parque Residencial Aquarius, São José dos Campos, SP

Destino:
MARCOS - Avenida das Nações Unidas, 8501 - Pinheiros, São Paulo, SP, ECO
DANIEL - Avenida das Nações Unidas, 8501 - Pinheiros, São Paulo, SP

Horário previsto de retorno:
18:30
```

Por que as linhas das 18:30 não aparecem no `Endereço de saída`?

Porque, quando `Horário previsto de retorno` está preenchido, o retorno já está implícito.

Se o campo mostrasse isso:

```text
18:30 - DANIEL - Avenida das Nações Unidas, 8501
18:30 - MARCOS - Avenida das Nações Unidas, 8501
```

o operador poderia interpretar errado, como se a OS tivesse quatro coletas de saída.

## 10. Validação do retorno

O sistema só esconde as linhas do retorno quando valida que o retorno parece mesmo sair do destino da ida.

A validação funciona assim:

1. Ordena as linhas por data e horário.
2. Pega o último horário como grupo de retorno.
3. Pega as linhas anteriores como grupo de ida.
4. Compara a origem do retorno com os destinos da ida.
5. Se todas as origens do retorno baterem com algum destino da ida, o retorno é considerado validado.

Comparação aceita:

- endereço exatamente igual;
- um texto contendo o outro;
- similaridade por palavras, com corte mínimo aproximado de `0.7`.

Exemplo validado:

```text
Destino da ida:
Avenida das Nações Unidas, 8501 - Pinheiros, São Paulo, SP, ECO

Origem do retorno:
Avenida das Nações Unidas, 8501 - Pinheiros, São Paulo, SP
```

Resultado:

```text
Retorno validado.
Endereço de saída mostra só a ida.
Destino mostra só a ida.
Retorno previsto fica preenchido.
```

Exemplo suspeito:

```text
Destino da ida:
Avenida das Nações Unidas, 8501

Origem do retorno:
Shopping Morumbi
```

Resultado:

```text
Retorno não validado.
O sistema mantém a linha do retorno visível no Endereço de saída.
O operador precisa revisar.
```

Essa regra evita esconder informação errada.

## 11. Campo `Endereço de saída`

Formato:

```text
HH:mm - Passageiro(s) - Endereço
```

Se dois passageiros têm o mesmo horário e o mesmo endereço, o sistema agrupa.

Exemplo:

```text
08:00 - ANA - Hotel A
08:00 - BRUNO - Hotel A
```

Vira:

```text
08:00 - ANA, BRUNO - Hotel A
```

Se os horários ou endereços forem diferentes, ficam em linhas separadas.

Exemplo:

```text
05:00 - FULANO - Casa Fulano
05:20 - BELTRANO - Casa Beltrano
```

## 12. Campo `Destino`

Formato:

```text
Passageiro(s) - Destino
```

O destino não mostra horário.

Paradas intermediárias não entram no `Destino`.

Elas entram no campo `Endereço de saída`.

Quando o XLSX tem colunas `Parada N`, o sistema lê dinamicamente todas as paradas preenchidas.

As colunas podem aparecer como:

```text
Horário Parada 1
Parada 1
Horário Parada 2
Parada 2
...
Horário Parada N
Parada N
```

Se o relatório não trouxer uma coluna de parada porque ela está vazia, a importação continua.

Com paradas, o campo `Endereço de saída` inclui a origem e as paradas em ordem:

```text
05:55 - PAX TESTE - Rodovia Exemplo, s/nº - Guarulhos, SP
Parada 1 - 06:30 - PAX TESTE - Avenida São João, 2200
Parada 2 - 07:00 - PAX TESTE - Avenida Doutor Nélson D'Ávila, 2200
```

Exemplo:

```text
ANA - Escritório A
BRUNO - Escritório B
```

Se o destino é igual para vários passageiros:

```text
FULANO, BELTRANO - Aeroporto de Congonhas
```

## 13. Campo `Trajeto`

O trajeto é uma sequência única de cidades.

Exemplo:

```text
São Paulo / Campinas / São Paulo
```

As cidades vêm das colunas `Cidade Origem` e `Cidade Destino`. Quando o relatório não traz essas colunas (o da Embraer deixou de trazer em 05/11/2026), a cidade sai do próprio endereço: é o trecho antes da UF (`, SP`, ` - SP` ou `/SP`).

```text
Avenida Brigadeiro Faria Lima, 2170 - Putim, São José dos Campos, SP, F56  -> São José dos Campos
Rua Exemplo Um, 100 - Campos do Jordão, SP                  -> Campos do Jordão
```

Se o endereço não tiver UF, a cidade fica vazia e não entra no trajeto.

O sistema evita repetir cidade consecutiva.

Exemplo:

```text
São Paulo / São Paulo / Campinas
```

Vira:

```text
São Paulo / Campinas
```

## 14. PG com datas diferentes

Se a mesma PG tem linhas em datas diferentes, o sistema não tenta decidir sozinho.

Exemplo:

```text
20/05/2026 - 08:00 - ANA
21/05/2026 - 09:00 - ANA
```

Resultado:

```text
Modo: Revisão necessária
Pendência: PG com datas diferentes.
```

Motivo:

> Pode ser diária, pode ser erro da planilha, pode ser ida em um dia e volta no outro.  
> Não é seguro inferir automaticamente.

## 15. Decisão operacional na revisão


Cada serviço mostra uma área chamada `Interpretação da PG`.

Ela explica o que o sistema entendeu e oferece ações úteis.

Se a PG já virou apenas 1 OS, o sistema não mostra botão `Manter 1 OS`.

O operador segue com:

- `Validar`, no cabeçalho do inspector;
- `Ignorar`, no cabeçalho do inspector;
- `Manter espera`, apenas quando a PG já indicar espera;
- `Separar ida/busca`, quando o serviço estiver com ida e busca separáveis;
- `É o mesmo carro`, quando dois trechos separados devem virar uma OS.

Serviços `Confirmados` e `Salvos` saem da fila principal e entram na lista fechada `Validados`.

Serviços `Ignorados` saem da fila principal e entram na lista fechada `Ignorados`.

As duas listas ficam minimizadas na galeria esquerda para manter foco nos serviços pendentes.

O topo da revisão usa filtros clicáveis:

- `Todos`;
- `Validados`;
- `Pendentes`;
- `Ignorados`.

Cada filtro mostra a contagem pequena ao lado do rótulo.

### `Manter espera`

Use quando o motorista precisa ficar à disposição até o retorno.

Não aparece quando o serviço está classificado como ida e busca separáveis.
Nesse caso, a ação disponível é `Separar ida/busca`.

Exemplo:

```text
08:00 - ANA - Hotel -> Evento
17:00 - ANA - Evento -> Hotel
```

Decisão:

```text
Manter espera
```

### `Separar ida/busca`

Se já tiver separado corretamente, o botão não aparece.


Use quando o passageiro não precisa do carro durante o período.

Exemplo:

```text
08:00 - ANA - Hotel -> Evento
17:00 - ANA - Evento -> Hotel
```

Se o motorista não precisa esperar:

```text
Separar ida/busca
```

Resultado:

```text
OS 1: ida
OS 2: busca
```

### Casos que exigem revisão humana

Quando não dá para decidir com segurança, o serviço continua pendente.

Exemplos:

- datas diferentes;
- endereços inconsistentes;
- passageiro ambíguo;
- serviço que precisa de conferência humana.

O operador deve editar, `VALIDAR` ou `IGNORAR`.

## 16. Split: separar ida e busca

Só aparece a Opção se já nao estiver separado.

O Split cria uma segunda OS rascunho dentro da mesma PG.

Ele funciona assim:

1. O sistema identifica o último grupo de horário como retorno.
2. As linhas anteriores ficam na OS original.
3. A OS original perde o `Horário previsto de retorno`.
4. A OS original recalcula:
   - passageiros;
   - endereço de saída;
   - destino;
   - trajeto;
   - STs;
   - linhas de origem.
5. O clone nasce como busca separada.
6. O clone fica pendente para o operador revisar.

Exemplo antes do Split:

```text
OS única
08:00 - ANA - Hotel A -> Escritório A
17:00 - ANA - Escritório A -> Hotel A
Retorno previsto: 17:00
```

Depois do Split:

```text
OS 1 - Ida
Saída: 08:00
Endereço de saída: 08:00 - ANA - Hotel A
Destino: ANA - Escritório A
Retorno previsto: vazio

OS 2 - Busca
Saída: 17:00
Endereço de saída: 17:00 - ANA - Escritório A
Destino: ANA - Hotel A
Retorno previsto: vazio
Status: pendente
```

O clone copia dados comuns:

- PG;
- cliente;
- solicitante;
- tipo de serviço;
- tipo de veículo;
- observações;
- passageiros das linhas de retorno.

O clone não deve ser salvo sem revisão.

## 17. Função removida: serviço manual dentro da PG

A importação não cria serviço manual dentro da PG.

Motivo:

> Serviço manual dentro da importação abre brecha para OS sem origem real na planilha e aumenta o risco de salvar trecho sem revisão operacional.

Alternativas permitidas:

1. Separar ida/busca.
2. Mesclar como mesmo carro.
3. Editar o trecho importado.
4. Ignorar o trecho e criar serviço fora do fluxo de importação.

Regra técnica:

```text
Não deve existir botão "+" para criar trecho manual na revisão da PG.
Não deve existir handler de adição manual de trecho.
Não deve existir função de criação manual de trecho importado.
Não deve existir origem técnica manual.
```

## 18. Edição na revisão

Por padrão, os campos ficam bloqueados para evitar alteração acidental.

Para editar:

1. Selecione o serviço na lista.
2. Clique no ícone de lápis.
3. Ajuste os campos.
4. Confirme a revisão novamente.

Sempre que um campo é editado, o serviço volta para pendente.

Motivo:

> Se mudou dado operacional, precisa confirmar de novo antes de salvar.

Serviço bloqueado por duplicidade não pode ser editado nessa tela.

## 19. Passageiros

Cada passageiro importado passa por tentativa de conciliação com o Banco de Dados.

Estados possíveis:

| Estado | Significado |
| --- | --- |
| `use-existing` | O sistema encontrou cadastro confiável e vai reutilizar. |
| `create-new` | Não encontrou cadastro confiável. Vai criar novo passageiro. |
| `ambiguous` | Encontrou cadastro parecido. O operador precisa decidir. |
| `invalid` | Falta dado essencial, normalmente nome. |

O cliente padrão da importação é `Embraer`.

Na hora de salvar, o sistema:

1. garante o solicitante;
2. garante cada passageiro;
3. cria passageiros novos quando necessário;
4. cria os vínculos entre OS e passageiros.

## 20. Duplicidade de serviço

A importação consulta serviços existentes pela PG.

Depois pontua similaridade por:

- mesma PG;
- mesma data;
- mesmo horário;
- horário próximo;
- mesmo destino;
- destino parecido;
- trajeto parecido;
- mesmo endereço de saída;
- endereço parecido;
- mesmos passageiros;
- passageiros parecidos.

Classificação:

| Resultado | Regra prática |
| --- | --- |
| `exact` | Bloqueia. Acontece quando a PG já existe no Dataverse ou quando a pontuação é alta e há mesmo horário + mesmos passageiros. |
| `possible` | Avisa, mas permite revisão. |
| vazio | Não considera duplicidade relevante. |

Regra importante:

> Mesma PG já existente no Dataverse bloqueia sozinha.

Isso evita importar novamente uma PG já processada.

Exemplo:

```text
PG100 - 08:00 - ANA
PG100 - 17:00 - ANA
```

Pode ser ida e busca separadas antes do salvamento.

Depois que a PG existe no Dataverse, a importação considera a PG já tratada e bloqueia novo salvamento automático.

## 21. Status da revisão

| Status | O que significa |
| --- | --- |
| `Pendente` | Precisa revisar ou confirmar. |
| `Confirmado` | Pronto para salvar. |
| `Bloqueado` | Tem problema impeditivo. |
| `Ignorado` | Não será salvo. |
| `Salvo` | Já foi criado no Dataverse. |

O botão `Agendar confirmados` só salva itens confirmados.

Ele não salva:

- pendentes;
- bloqueados;
- ignorados;
- já salvos.

## 22. O que é salvo na OS

Quando um serviço confirmado é salvo, o payload da reserva recebe:

| Campo interno | Origem |
| --- | --- |
| ID externo | PG |
| Endereço de saída | Campo `Endereço de saída` revisado |
| Destino | Campo `Destino` revisado |
| Data e hora de saída | Data/hora do serviço |
| Horário previsto de retorno | Campo `Horário previsto de retorno`, se preenchido |
| Observação operacional | Observação revisada |
| Observação interna | Texto informando origem da importação |
| Trajeto | Campo `Trajeto` revisado |
| Passageiros e telefones | Passageiros vinculados |
| CR | Primeiro centro de custo encontrado nos passageiros |
| Cliente | Cliente padrão da importação |
| Solicitante | Solicitante importado ou primeiro passageiro |
| Motorista | Motorista por nome, se encontrado |
| Tipo de serviço | Sugestão mapeada ou seleção manual |
| Tipo de veículo | Sugestão mapeada ou seleção manual |
| Status | Solicitado ou Pré-reserva |
| Status de faturamento | Pendente |

Depois de criar a reserva, o sistema cria os vínculos de passageiros.

## 23. Exemplos rápidos de decisão

### Exemplo 1: uma ida simples

```text
PG1
08:00 - ANA - Hotel -> Aeroporto
```

Resultado:

```text
1 OS
Sem retorno previsto
Pode confirmar se os dados estiverem corretos
```

### Exemplo 2: ida e volta com espera

```text
PG2
08:00 - ANA - Hotel -> Evento
17:00 - ANA - Evento -> Hotel
```

Resultado:

```text
1 OS
Retorno previsto: 17:00
Decisão sugerida: ida + busca separáveis, se não houver palavra de espera
Operador decide: Manter espera ou Separar ida/busca
```

### Exemplo 3: multi-coleta

```text
PG3
05:00 - FULANO - Casa 1 -> Aeroporto
05:20 - BELTRANO - Casa 2 -> Aeroporto
```

Resultado:

```text
1 OS
Modo: Multi-coleta
Sem retorno previsto
```

### Exemplo 4: mesmo destino, horário muito distante

```text
PG4
05:00 - FULANO - Casa 1 -> Aeroporto
06:45 - BELTRANO - Casa 2 -> Aeroporto
```

Resultado:

```text
2 serviços
Operador pode mesclar com É o mesmo carro
```

### Exemplo 5: retorno validado

```text
PG5
05:40 - MARCOS - Casa Marcos -> Empresa
05:50 - DANIEL - Casa Daniel -> Empresa
18:30 - MARCOS - Empresa -> Casa Marcos
18:30 - DANIEL - Empresa -> Casa Daniel
```

Resultado:

```text
1 OS
Endereço de saída mostra só Casa Marcos e Casa Daniel
Destino mostra Empresa
Retorno previsto: 18:30
```

### Exemplo 6: retorno suspeito

```text
PG6
08:00 - ANA - Hotel -> Escritório
17:00 - ANA - Shopping -> Hotel
```

Resultado:

```text
1 OS
Retorno previsto: 17:00
Endereço de saída mantém Hotel e Shopping visíveis
Operador precisa revisar
```

## 24. Limites conscientes da regra atual

### 1. O sistema não sabe a intenção real do passageiro

Ele infere por:

- horário;
- destino;
- data;
- texto de espera;
- endereço de ida e retorno.

Se a planilha vier ambígua, a decisão precisa ser humana.

### 2. Destinos diferentes dentro da mesma PG não são separados automaticamente por destino

Se a PG tem destinos diferentes, o sistema tende a manter junto para revisão.

Motivo:

> Destino diferente pode ser rota com múltiplas paradas, não necessariamente outro serviço.

### 3. Mesmo destino acima de 1h30 é separado por segurança

Isso evita juntar serviços que parecem independentes.

Mas o operador pode corrigir com `É o mesmo carro`.

### 4. Retorno só é escondido do campo de saída se bater com o destino da ida

Se não bater, o sistema mostra para revisão.

Essa é uma proteção contra erro silencioso.

### 5. Split usa o último horário como retorno

Se a PG tiver três ou mais blocos de horários, o Split pode não representar toda a operação sozinho.

Nesse caso, use revisão manual, split, mesmo carro ou ajuste direto no trecho importado.

## 25. Mapa mental do processo

```text
XLSX
  ↓
Ler aba Passengers
  ↓
Validar colunas obrigatórias
  ↓
Normalizar linhas
  ↓
Agrupar por PG
  ↓
Dentro da PG:
  ├─ mesmo destino + janela até 1h30 → multi-coleta / 1 OS
  ├─ mesmo destino + janela maior que 1h30 → serviços separados
  ├─ horários de ida e retorno → 1 OS com retorno previsto
  ├─ datas diferentes → revisão manual
  └─ caso ambíguo → pendente para decisão
  ↓
Revisão no inspector
  ├─ editar
  ├─ confirmar
  ├─ ignorar
  ├─ separar ida/busca
  ├─ mesclar como mesmo carro
  └─ revisar manualmente sem criar trecho manual
  ↓
Agendar confirmados
  ↓
Criar reserva + vínculos de passageiros no Dataverse
```

## 26. Onde a lógica está no código

| Parte | Arquivo |
| --- | --- |
| Parser e agrupamento XLSX | `scripts/xlsx_import_core.js` |
| Validação de cabeçalhos | `scripts/xlsx_import_core.js` |
| Interpretação operacional da PG | `scripts/xlsx_import_core.js` |
| Split e mesmo carro | `scripts/xlsx_import_core.js` |
| Revisão visual e inspector | `app.js` |
| Ações da revisão | `app.js` |
| Salvamento no Dataverse | `app.js` |
| Bundle final do web resource | `webresource.html` |
| Testes principais da importação | `scripts/xlsx_import_parser.test.js` |
| Testes de contrato UI/bundle | `scripts/formulario_operational_features.test.js`, `scripts/webresource_bundle.test.js` |

## 27. Regra de ouro para operação

Use esta leitura:

```text
Se o carro precisa ficar com o passageiro:
  manter 1 OS com retorno previsto.

Se o carro só leva e depois outro serviço pode buscar:
  Separar ida/busca.

Se são passageiros diferentes indo ao mesmo destino em até 1h30:
  Multi-coleta.

Se o sistema separou por horário, mas você sabe que é o mesmo carro:
  É o mesmo carro.

Se a planilha parece errada ou incompleta:
  edite o trecho, valide ou ignore.
```
