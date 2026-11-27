# Portal do cliente (cliente.betinhos.com.br)

- Nível: 1 por entrega (cada item abaixo foi uma feature pequena com PR próprio)
- Etapa: obrigatórios do pedido e prazos de 4 h / 2 h provados no DEV em 27/11/2026 (PR em revisão)
- Próximo passo: merge do PR dos obrigatórios na develop; depois escolher a próxima entrega sem PROD · com o Renan
- PROD: ainda não (go-live da Latasa fora do escopo por decisão do Renan)
- Atualizado: 27/11/2026 09:40

## Entregas na develop
| PR | O quê |
|---|---|
| #733 | Logo do cliente no login e no topo, sem cor própria |
| #742 / #744 | Aprovação de pedidos e avisos à operação |
| #747 / #748 | Prazos de pedir e cancelar por cliente (padrão 24 h / 12 h) |
| #755 / #756 | Endereço de saída e destino padrão do passageiro |
| (este PR) | Pedido chega com trajeto, tipo do serviço e solicitante; veículo obrigatório; prazos padrão 4 h / 2 h |

## Decisões
| Data | Decisão | Por quê | Quem decidiu |
|---|---|---|---|
| 25/11/2026 | Prazos configuráveis por cliente; fora do prazo bloqueia e mostra o contato | operação precisa de antecedência | Renan |
| 25/11/2026 | "Em análise" não cancela; passageiro que não pediu não vê Cancelar; saída ilegível conta como dentro do prazo | regras mantidas no teste | Renan |
| 25/11/2026 | Aprovador único: o pedido entra direto | sem passo vazio | Renan |
| 27/11/2026 | Solicitante = pessoa do cliente com o e-mail do login; cria a ficha se não existir | campo obrigatório no Formulário Geral | Renan |
| 27/11/2026 | Tipo de veículo obrigatório no portal; tipo do serviço sem cidade conhecida = Outras Cidades | obrigatórios do Formulário Geral | Renan |
| 27/11/2026 | Padrão 4 h para pedir e 2 h para cancelar (era 24 h / 12 h) | a Latasa pede quase sempre no mesmo dia | Renan |
| 25/11/2026 | Endereço padrão: cliente cadastra no portal, operação no shell; 1º passageiro preenche, os outros viram sugestão; o pedido não muda o padrão | preenchimento automático sem sobrescrever | Renan |

## Provas no DEV (26/11/2026, portal v0.0.15, login real da Latasa)
| Cenário | Resultado |
|---|---|
| Pedir com saída em 2 h | Recusado: "menos de 24 h ... Fale com a Betinhos." |
| Pedir com saída em 48 h, passageiro novo com saída e destino padrão | Criado (Solicitado, entra direto); a pessoa gravou `cr40f_enderecodesaida` e `cr40f_enderecodedestino` |
| Mesmo passageiro com saída "" e destino novo | Saída limpa, destino trocado |
| Mesmo passageiro sem os campos | Padrão intacto |
| Cancelar Solicitado dentro do prazo | Cancelado (202410002); sem e-mail, como previsto |
| Cancelar com saída em 5 h | Recusado: "prazo para cancelar ... 12 h" |
| Cancelar Confirmado dentro do prazo | Cancelado; flow "Portal cliente – e-mails" do DEV rodou com sucesso (aviso à operação) |
| Tela Pedir, passo 2 | Destino padrão preenchido sozinho (print no chat) |
| Limpeza | 3 reservas, 3 Serviços por Passageiro e a pessoa de teste apagados |

## Provas no DEV (27/11/2026, portal v0.0.16, login real da Latasa)
| Cenário | Resultado |
|---|---|
| Pedir com saída em 3h30 | Recusado: "menos de 4 h ... Fale com a Betinhos." |
| Pedir com saída em 5 h, Rua A (SJC) → Aeroporto de Guarulhos | Criado; trajeto "TESTE PORTAL - Rua A / Aeroporto de Guarulhos (GRU)", tipo do serviço Guarulhos, veículo Executivo, solicitante preenchido |
| 2º pedido, Pindamonhangaba → Rio de Janeiro | Tipo do serviço Rio de Janeiro; mesmo solicitante (não duplicou a ficha) |
| Cancelar com saída em 5 h | Cancelado |
| Cancelar com saída em 1h30 | Recusado: "prazo para cancelar ... 2 h" |
| Limpeza | 3 reservas, 3 vínculos e 3 pessoas (inclusive a ficha do solicitante) apagados |

## Não verificado
- Abrir no Formulário Geral uma reserva do portal e salvar sem completar nada (a reserva tem os obrigatórios, mas o salvar real não foi feito).
- Aprovação com aprovador: a conta de teste não é aprovadora e a Latasa no DEV não tem aprovador.
- Ficha da pessoa no shell do DEV ("Endereço de destino") com login real.
- Conteúdo do e-mail na caixa da operação (só a execução do flow foi conferida).

## Pendências sem PROD
- Campos do pedido por cliente.
- Limites dos avisos: `$top=200` nos pendentes, aprovação sem `If-Match`, mais de 10 destinatários.
