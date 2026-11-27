# Portal do cliente (cliente.betinhos.com.br)

- Nível: 1 por entrega (cada item abaixo foi uma feature pequena com PR próprio)
- Etapa: prova no DEV das entregas de 25/11/2026 (prazos e endereço padrão) feita em 26/11/2026
- Próximo passo: escolher a próxima entrega sem PROD (campos do pedido por cliente ou limites dos avisos) · com o Renan
- PROD: ainda não (go-live da Latasa fora do escopo por decisão do Renan)
- Atualizado: 26/11/2026 22:55

## Entregas na develop
| PR | O quê |
|---|---|
| #733 | Logo do cliente no login e no topo, sem cor própria |
| #742 / #744 | Aprovação de pedidos e avisos à operação |
| #747 / #748 | Prazos de pedir e cancelar por cliente (padrão 24 h / 12 h) |
| #755 / #756 | Endereço de saída e destino padrão do passageiro |

## Decisões
| Data | Decisão | Por quê | Quem decidiu |
|---|---|---|---|
| 25/11/2026 | Prazos configuráveis por cliente; fora do prazo bloqueia e mostra o contato | operação precisa de antecedência | Renan |
| 25/11/2026 | "Em análise" não cancela; passageiro que não pediu não vê Cancelar; saída ilegível conta como dentro do prazo | regras mantidas no teste | Renan |
| 25/11/2026 | Aprovador único: o pedido entra direto | sem passo vazio | Renan |
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

## Não verificado
- Aprovação com aprovador: a conta de teste não é aprovadora e a Latasa no DEV não tem aprovador.
- Ficha da pessoa no shell do DEV ("Endereço de destino") com login real.
- Conteúdo do e-mail na caixa da operação (só a execução do flow foi conferida).

## Pendências sem PROD
- Campos do pedido por cliente.
- Limites dos avisos: `$top=200` nos pendentes, aprovação sem `If-Match`, mais de 10 destinatários.
