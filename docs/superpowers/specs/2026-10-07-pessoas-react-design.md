# Pessoas (Banco de Dados) em React — design

**Data:** 07/10/2026 · **Status:** escolhas do Renan em conversa · **Escopo:** rota `#/pessoas` no shell, no lugar da lista nativa `cr40f_bancodedados` (grupo Cadastros).

## 1. Decisões

- Pessoa = passageiro, solicitante ou contato de cliente (`cr40f_bancodedados`). É a base do contato em Reservas, Serviços por Passageiro e Pagantes.
- Novidades: ficha com histórico, possíveis duplicados, ações rápidas e busca com visões salvas.
- Edição: criar e editar no formulário da tela. Sem excluir e sem inativar (`statecode`); o campo de negócio `cr40f_status` (Ativo/Inativo) é editável.
- Fora do escopo: mesclar duplicados, upload de foto (há flow próprio), ações em lote.

## 2. Schema (metadata de DEV, 07/10/2026)

| Coluna | Tipo | Uso |
|---|---|---|
| `cr40f_bancodedadosid` | id | |
| `cr40f_nomedopassageiro` | texto 850, **obrigatório** | nome (nome primário) |
| `cr40f_cliente` | lookup → `cr40f_clientes1` (`cr40f_nomedocliente`) | cliente |
| `cr40f_telefone` | telefone 250 | celular |
| `cr40f_email` | e-mail 1000 | |
| `cr40f_cargo` | choice | C-Level, Presidente, Vice, Diretor, Assistente Executiva, Gerente, Supervisor, Analista, Comprador, Engenheiro, Conselheiro |
| `cr40f_classificacao` | choice | Passageiro Frequente, Visitante, Solicitante, Grupo, Lead |
| `cr40f_idioma` | choice, **obrigatório** | Português, Inglês, Espanhol |
| `cr40f_status` | choice, **obrigatório** | Ativo, Inativo |
| `cr40f_sexo` | choice | |
| `new_tipodoveiculo` | choice | tipo de veículo preferido |
| `cr40f_departamento`, `cr40f_cr` | texto | |
| `cr40f_enderecodesaida`, `cr40f_preferenciasdopassageiro` | texto longo | |
| `cr40f_datadenascimento`, `cr40f_datadecadastro`, `cr40f_datadoultimoservico` | data | |
| `new_linkdafoto` | URL | foto (só leitura) |

Rótulos de choice vêm da metadata em tempo real, com recuo para os rótulos acima. A navigation property do lookup de cliente vem da metadata (`ManyToOneRelationships`), nunca fixa.

## 3. Histórico (ficha)

- Serviços: reservas com `_cr40f_solicitante_value` ou `_cr40f_passageiro1..4_value` = pessoa, mais as reservas ligadas por `cr40f_servicosporpassageiro._cr40f_bancodedados_value` (via `_cr40f_geral_value`). Sem repetição, mais recentes primeiro, papel (Solicitante/Passageiro) indicado.
- Resumo: total de serviços, primeiro e último, e serviços nos últimos 90 dias.
- Pagantes: parcelas em que a pessoa é o pagante, com valor e status.

## 4. Duplicados

Calculados na lista carregada, sem gravar nada:
- mesmo celular (dígitos sem DDI, 10–11);
- mesmo e-mail (sem caixa);
- mesmo nome normalizado (sem acento, espaços e caixa) e mesmo cliente.

Selo "Possível duplicado" na linha, filtro "Só possíveis duplicados" e bloco na ficha com o motivo e acesso ao outro cadastro. No formulário, aviso ao digitar celular, e-mail ou nome já existentes.

## 5. Busca, filtros e visões

Busca local por nome, cliente, celular (com ou sem máscara), e-mail, cargo e departamento. Filtros: cliente, classificação, idioma, status e duplicados. Visões prontas: Todos, Ativos, Passageiros frequentes, Solicitantes, Possíveis duplicados; visões do usuário no navegador, validadas campo a campo, como em Pagantes.

## 6. Formulário

Drawer com seções: Identificação (nome*, cliente, cargo, departamento, CR, classificação, status*), Contato (celular, e-mail, idioma*), Perfil (sexo, nascimento, tipo de veículo, preferências, endereço de saída). Grava só o que mudou. Fechar com alteração não salva pede "Descartar alterações?"; durante o salvamento não fecha. Celular e e-mail validados no formato; duplicado é aviso, não bloqueio.

## 7. Layout e aceite

Mesmo molde de Pagantes: `PageHeader` (Cadastros › Pessoas, total, "Nova pessoa"), `PageToolbar filters`, tabela paginada em 50 com clique na linha, cartões no celular, ficha em `Drawer wide`. Aceite: lista, busca e visões funcionam em mock e DEV; ficha mostra histórico e duplicados; criar e editar gravam e refletem na lista; testes e typecheck verdes; 320 px sem rolagem horizontal.
