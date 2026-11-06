# Destinatário do link e do recibo

Decisões do Renan em 06/11/2026.

## Problema

O Gerar Pagantes troca o destinatário só no envio do link de pagamento e não grava essa escolha. Os flows
Enviar Recibo Automático e Gerar Recibo Manual enviam o recibo para `cr40f_email` da pessoa do pagante, então o
recibo não chega à secretária que recebeu o link.

## Comportamento

- Com link gerado, o Gerar Pagantes permite pesquisar uma pessoa ou digitar um e-mail, mesmo sem enviar o e-mail do link.
- Com destinatário diferente do pagante, a opção "Enviar também o recibo" vem marcada. Desmarcada, o recibo vai para o pagante.
- O PDF continua no nome do pagante. O e-mail do recibo vai para o destinatário e para o financeiro, sem cópia ao pagante.
- Pessoa cadastrada: saudação e idioma dela. E-mail digitado: saudação e idioma do pagante, no link e no recibo.
- A regra vale para os dois flows. Pagante sem destinatário gravado segue como hoje.
- Destinatário cadastrado sem e-mail na hora do recibo: o financeiro recebe o recibo com um aviso explicando o motivo.
- No modal do recibo manual, um campo de e-mail vem com o destinatário atual. A troca vale só para aquele envio e saúda o pagante.
- O flow Enviar Recibo Personalizado fica de fora: já recebe o e-mail digitado.

## Entrega

1. PR de importação, sem mudar comportamento: tela (`apps/gerar-pagantes`), plugin (`Cr40f.GerarPagantes.Plugin`,
   assembly `Cr40f.GerarPagantes.Plugin.V2`) e `cr40f_GerarRecibo`, publicados pelo Deploy. O repositório
   `Tela-Gerar-Pagantes` fica congelado.
2. PR do destinatário: colunas no pagante, tela, plugin, modal e os dois flows versionados.

Como há schema novo, o PR 2 chega ao PROD por "Publicar soluções", com aprovação do Renan.
