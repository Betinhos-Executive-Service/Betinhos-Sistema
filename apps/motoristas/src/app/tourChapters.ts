// Conteúdo do tour: um capítulo por tela do App Motoristas, em pt-BR, tom Betinhos (humano e preciso).
// Cada passo aponta para um elemento real da tela por seletor CSS; passo `optional` some sem erro quando
// o elemento não existe (outro tipo de serviço, lista vazia, recurso não liberado para o motorista).
import type { TourChapter, TourStep } from "./tour";

type StepExtras = Pick<TourStep, "target" | "match" | "within" | "optional">;

const dt = (value: string) => `[data-tour="${value}"]`;
const step = (id: string, title: string, text: readonly string[], extras: StepExtras = {}): TourStep => ({ id, title, text, ...extras });
/** Campo de formulário localizado pelo rótulo (destaca rótulo + controle). */
const field = (label: string, extras: Pick<StepExtras, "optional"> = {}): StepExtras => ({ target: ".form-field-label", match: `^${label}`, within: "parent", ...extras });
const button = (label: string, extras: Pick<StepExtras, "optional"> = {}): StepExtras => ({ target: ".action-button", match: `^${label}$`, ...extras });

const BACK = '.form-menu-button[aria-label="Voltar"]';
const HELP = ".tour-help-button";
const SERVICE_HOME = ".services-nav-button--home";

const backStep = (extra = "Durante um envio a seta fica desativada, para você não perder o que digitou.") =>
  step("voltar", "Voltar", ["A seta no canto superior esquerdo leva você de volta à tela anterior.", ...(extra ? [extra] : [])], { target: BACK });

const helpStep = () =>
  step("ajuda", "Botão de ajuda", ["Este botão com ponto de interrogação reabre esta explicação sempre que você quiser."], { target: HELP, optional: true });

export const TOUR_CHAPTERS: readonly TourChapter[] = [
  {
    id: "inicio",
    title: "Início",
    steps: [
      step("boas-vindas", "Bem-vindo ao App Motoristas", [
        "Este guia mostra, passo a passo, tudo o que o app faz e para que serve cada botão.",
        "Use Próximo e Voltar, ou as setas do teclado. Pular fecha o guia.",
        "As outras telas têm um botão com ponto de interrogação no topo que explica aquela tela. Aqui no Início, use o link \"Ver tour de novo\", no rodapé."
      ]),
      step("topo", "Saudação", [
        "Aqui aparece o seu nome, que o app lê do seu cadastro, e a marca Betinhos.",
        "Se o nome estiver errado, avise a operação."
      ], { target: ".concept-topbar" }),
      step("proximo-servico", "Próximo serviço em", [
        "A contagem regressiva até o horário do seu próximo serviço, com o trajeto logo abaixo.",
        "Ela se atualiza sozinha a cada minuto e some quando não há serviço futuro. Tocar abre a lista de Serviços."
      ], { target: ".concept-next-service", optional: true }),
      step("servicos", "Serviços", [
        "É o coração do app: a sua agenda. O número ao lado de \"Corridas de hoje\" é quantos serviços de hoje estão com você.",
        "Toque aqui para ver cada serviço, abrir o detalhe e registrar todas as etapas até a finalização."
      ], { target: dt("servicos") }),
      step("pendencias", "Pendências", [
        "Avisos do que está esperando por você: checklists pendentes, multas para assinar (com o prazo) e comunicados para ler.",
        "Cada linha abre direto a tela certa. Quando você resolve tudo, a área desaparece."
      ], { target: ".concept-pending", optional: true }),
      step("modulos", "Os módulos do app", [
        "Cada botão desta grade abre uma área do app. Um número no ícone mostra quantos itens estão pendentes ali.",
        "Vamos ver um por um."
      ], { target: ".concept-tile-grid" }),
      step("historico", "Histórico", [
        "Os serviços que você já finalizou, em ordem, com busca. É só consulta: dá para rever horário, trajeto e dados, mas não editar."
      ], { target: dt("history") }),
      step("comunicados", "Comunicados", [
        "Avisos da operação para os motoristas. Alguns são só informativos; outros exigem ciência com assinatura na tela.",
        "O número no ícone é quantos ainda esperam por você."
      ], { target: dt("comunicados") }),
      step("checklists", "Checklist", [
        "A vistoria do seu veículo, feita com fotos. A operação pede uma vistoria a cada 15 dias e avisa por notificação.",
        "Inclui o recebimento do carro, com o nome de quem o entregou."
      ], { target: dt("checklists") }),
      step("multas", "Multas", [
        "Termos de multa para você assinar ou contestar. Cada termo mostra o prazo e o que você estaria aceitando, como o desconto em folha.",
        "A assinatura é feita no celular, com selfie e localização. Se não concordar, você contesta e conversa com o gestor de frota."
      ], { target: dt("multas") }),
      step("treinamentos", "Treinamentos", [
        "Conteúdos que o RH publicou para você: texto, vídeo e arquivos. Alguns pedem assinatura ou um quiz curto no fim.",
        "O que falta fazer aparece nas pendências; o que você concluiu fica guardado para consultar."
      ], { target: dt("treinamentos") }),
      step("manutencao", "Manutenção", [
        "Notou ruído, luz acesa no painel ou pneu vibrando? Solicite o reparo aqui, com a gravidade, a descrição e fotos.",
        "O pedido é enviado para a equipe da Betinhos."
      ], { target: dt("maintenancePhoto") }),
      step("gastos", "Gastos", [
        "Abastecimento, pedágio, estacionamento, hospedagem e outras despesas: fotografe o comprovante e registre.",
        "Se não há nada em andamento, o botão já abre a câmera. O app lê a foto e preenche os dados por você."
      ], { target: dt("expenses") }),
      step("colisoes", "Colisões", [
        "Em caso de batida, abra aqui. A primeira pergunta é se alguém se feriu, com ligação direta para SAMU (192) e Polícia (190).",
        "Depois você escolhe \"Eu bati\" ou \"Bateram em mim\" e registra o ocorrido com fotos."
      ], { target: dt("collisions") }),
      step("recibo", "Recibo personalizado", [
        "Gera, na hora, um recibo em PDF com o nome do pagante, o cliente, o idioma e o valor total, e permite enviá-lo ao cliente.",
        "Esse botão só aparece para quem tem a permissão liberada pela operação."
      ], { target: dt("personalReceipt"), optional: true }),
      step("ideias", "Boas ideias", [
        "Sugira melhorias para a operação: um título e, se quiser, como a ideia funcionaria.",
        "A equipe avalia, e você acompanha o status das suas ideias na mesma tela."
      ], { target: dt("ideas") }),
      step("atualizar", "Puxar para atualizar", [
        "Arraste a tela para baixo e solte para atualizar a agenda e os avisos na hora.",
        "O app também atualiza sozinho, a cada minuto."
      ]),
      step("versao", "Versão do app", [
        "No canto de baixo aparece a versão e a data da publicação do app que você está usando.",
        "Se precisar falar com o suporte, diga esse número."
      ], { target: ".build-stamp", optional: true }),
      step("rever", "Ver tour de novo", [
        "Este link reabre este guia completo, do começo. As explicações de cada tela também voltam a aparecer na primeira vez que você entrar nelas."
      ], { target: ".concept-tour-link" }),
      step("fim", "Pronto para começar", [
        "Agora você conhece o Início. Abra Serviços para ver a sua agenda.",
        "Em cada tela, o botão com ponto de interrogação no topo explica tudo de novo. Aqui no Início, use \"Ver tour de novo\"."
      ])
    ]
  },
  {
    id: "servicos",
    title: "Serviços",
    steps: [
      step("inicio", "Voltar ao Início", ["O botão da esquerda leva você de volta para a tela inicial."], { target: SERVICE_HOME }),
      step("titulo", "Seus Serviços", ["O título mostra onde você está: sua agenda de serviços, ordenada por data e horário."], { target: ".services-title-block" }),
      step("atualizar", "Atualizar", [
        "Recarrega agora a agenda e os avisos. O ícone gira enquanto busca.",
        "A lista também se atualiza sozinha a cada minuto, e você pode puxá-la para baixo para atualizar."
      ], { target: ".services-nav-button--refresh" }),
      step("comunicados", "Comunicados pendentes", [
        "Os avisos que esperam sua ciência aparecem aqui em cima, em linhas compactas, com o tipo: \"assinatura obrigatória\" ou \"informativo\".",
        "Toque para abrir e dar ciência."
      ], { target: ".comunicado-service-notices", match: "comunicados pendentes", optional: true }),
      step("checklists", "Checklist do veículo", [
        "Quando há uma vistoria para fazer, ela também aparece aqui, com o veículo e quem entregou o carro.",
        "Toque para preencher o checklist."
      ], { target: ".comunicado-service-notices", match: "checklist do ve", optional: true }),
      step("dias", "Divisores de dia", [
        "As faixas escuras separam a agenda por dia: HOJE, AMANHÃ e as datas seguintes."
      ], { target: ".agenda-card.header", optional: true }),
      step("cartao", "O cartão do serviço", [
        "Em cima, o horário (ou a janela, como 16:00 - 17:00). Embaixo, o trajeto de saída e destino.",
        "Toque em qualquer parte do cartão para abrir o detalhe e iniciar o serviço."
      ], { target: ".agenda-card:not(.header)", optional: true }),
      step("etiqueta", "Tipo do serviço", [
        "A etiqueta no canto do cartão diz o que é: serviço com passageiro, troca de carro entre motoristas, devolução ou retirada na base, ou manutenção."
      ], { target: ".agenda-card:not(.header) .agenda-label", optional: true }),
      step("marcadores", "Marcadores de atenção", [
        "Ícone de dinheiro: serviço em que você recebe do passageiro. Ponto: o serviço foi alterado depois que você viu.",
        "Triângulo de atenção: foi alterado e sai em até 30 minutos. Confira antes de sair."
      ], { target: ".notification-marker", optional: true }),
      step("fila", "A fila: um serviço por vez", [
        "Os serviços devem ser concluídos na ordem da lista. Se tentar avançar um que não é o primeiro pendente, o app avisa \"Conclua os itens anteriores da fila antes de prosseguir\" e destaca o serviço da vez.",
        "Ao finalizar, o serviço sai da agenda e vai para o Histórico."
      ]),
      step("cancelado", "Serviço cancelado", [
        "Um serviço cancelado fica na lista, até cerca de uma hora depois do horário, com a faixa CANCELADO e o aviso \"desconsiderar este item\". Você não precisa fazer nada com ele."
      ], { target: ".canceled-overlay", optional: true }),
      step("vazio", "Agenda vazia", [
        "Sem serviços atribuídos, aparece \"Nenhum serviço atribuído a você no momento\". Quando a operação programar, puxe a tela para atualizar."
      ], { target: ".empty-services", optional: true }),
      helpStep()
    ]
  },
  {
    id: "detalhes",
    title: "Detalhe do serviço",
    steps: [
      step("voltar", "Voltar", ["Volta para a lista de Serviços."], { target: ".details-back" }),
      step("copiar", "Copiar", [
        "Copia as informações do serviço em texto, pronto para colar no WhatsApp ou em um e-mail. O app confirma com \"Informações copiadas\"."
      ], { target: ".copy-button" }),
      step("faixa", "Data, horário e número", [
        "A faixa escura mostra o dia e a hora do serviço e, à direita, o número dele (#código). Use esse número ao falar com a operação."
      ], { target: ".details-header-v1" }),
      step("cliente", "Cliente", ["Para quem é o serviço: a empresa ou pessoa que contratou."], { target: ".detail-field", match: "^cliente", optional: true }),
      step("receber", "Receber e valor", [
        "\"Receber: Sim\", acompanhado do valor, significa que você cobra o passageiro neste serviço. \"Não\" quer dizer que não há cobrança a fazer.",
        "Nos serviços com valor a receber, o rodapé mostra o botão Receber."
      ], { target: ".detail-field", match: "^receber", optional: true }),
      step("trajeto", "Trajeto", ["Saída e destino em uma linha, para você entender o serviço de relance."], { target: ".detail-field", match: "^trajeto", optional: true }),
      step("passageiros", "Passageiros e contatos", [
        "Cada passageiro aparece com foto ou inicial, a bandeira do idioma que ele fala, nome e telefone.",
        "O botão do telefone liga e o do balão abre o WhatsApp. Tocar no nome abre a ficha do passageiro."
      ], { target: ".passenger-contacts", optional: true }),
      step("enderecos", "Endereços no mapa", [
        "Endereços completos de saída e destino aparecem sublinhados: tocar abre o endereço no Google Maps."
      ], { target: ".detail-map-link", within: ".detail-field", optional: true }),
      step("telefone", "Telefones em link", [
        "Telefones sublinhados abrem uma janela para você escolher entre ligar e enviar WhatsApp."
      ], { target: ".detail-contact-link", within: ".detail-field", optional: true }),
      step("operacao", "Obs. de operação", [
        "Orientações da operação para este serviço. Leia antes de sair: é onde ficam os combinados específicos da corrida."
      ], { target: ".detail-field", match: "^obs", optional: true }),
      step("perfil", "Perfil do passageiro", [
        "O que a Betinhos sabe sobre o passageiro, conforme o cadastro. Use para atender do jeito que ele espera."
      ], { target: ".detail-field", match: "^perfil", optional: true }),
      step("mais", "Mais detalhes abaixo", [
        "Quando há mais conteúdo, aparece a pílula \"Mais detalhes abaixo\". Role a tela para ler tudo; ela some depois do primeiro movimento."
      ], { target: ".details-scroll-hint", optional: true }),
      step("observacao", "Observação do motorista", [
        "Escreva aqui o que for importante do serviço. O texto é salvo sozinho enquanto você digita e o status mostra se já foi salvo.",
        "Ele segue para a tela de finalização."
      ], { target: ".service-observation-editor", optional: true }),
      step("fotos", "Fotos da solicitação", [
        "Nas manutenções, as fotos enviadas na solicitação aparecem aqui. Tocar abre a foto; \"Abrir link\" abre o endereço no navegador."
      ], { target: ".detail-photo-open", within: ".detail-field", optional: true }),
      step("junior", "Dúvidas", [
        "\"Contatar o Júnior\" abre a conversa com o gestor da frota quando você precisa tirar uma dúvida da manutenção."
      ], { target: ".questions-link", optional: true }),
      step("rodape", "Os botões de ação", [
        "Embaixo ficam as etapas do serviço. Elas mudam conforme o tipo: Receber, Voucher, Finalizar e Cancelar no local.",
        "Cada uma abre a tela da etapa, e o app guia você até a finalização."
      ], { target: ".details-footer-v1" }),
      step("btn-receber", "Receber", [
        "Aparece quando há valor a receber e, até o recebimento ser concluído, é a etapa que o rodapé mostra (junto com Cancelar no local). Abre a tela para enviar o comprovante ou cobrar por QR code."
      ], { ...button("Receber", { optional: true }) }),
      step("btn-voucher", "Voucher", [
        "Aparece nos serviços de clientes que usam voucher. Abre o formulário: horários, espera, despesas e, quando exigida, a assinatura do passageiro."
      ], { ...button("Voucher", { optional: true }) }),
      step("btn-finalizar", "Finalizar", [
        "Encerra o serviço: você escreve a observação final e o app envia tudo. Em serviços de clientes com voucher, o encerramento é pelo voucher e este botão não aparece."
      ], { ...button("Finalizar", { optional: true }) }),
      step("btn-cancelar", "Cancelar no local", [
        "Use quando o serviço foi cancelado no local. O primeiro toque pergunta \"O serviço foi mesmo cancelado no local?\"; toque de novo para confirmar.",
        "Em seguida você descreve o que aconteceu."
      ], { ...button("Cancelar no local", { optional: true }) })
    ]
  },
  {
    id: "receber",
    title: "Receber o pagamento",
    steps: [
      backStep(),
      step("valor", "Valor a receber", [
        "Mostra quanto você deve receber do passageiro. Se parte já foi paga por QR code, aparecem o total, o que já foi pago e quanto falta."
      ], { target: ".receive-amount, .receive-summary", optional: true }),
      step("qr", "Cobrar por QR code", [
        "O passageiro paga pelo próprio celular, lendo o QR code. Se uma cobrança ficou pela metade, o botão vira \"Retomar cobrança\".",
        "Esse recurso só aparece para quem tem a permissão liberada."
      ], { target: ".receive-qr-charge", optional: true }),
      step("comprovantes", "Comprovante(s) de pagamento", [
        "Envie ao menos uma foto do comprovante do pagamento que você recebeu. O asterisco indica que é obrigatório.",
        "Quando tudo já foi pago por QR, o comprovante passa a ser opcional."
      ], { target: ".form-field-label", match: "^comprovante", within: "parent" }),
      step("adicionar", "Adicionar comprovante", [
        "O botão com a câmera abre a câmera do app. Tire a foto com o comprovante inteiro, sem dobras e com boa luz.",
        "As fotos adicionadas aparecem em miniatura: toque para ver ou apagar."
      ], { target: ".photo-add-button" }),
      step("recibo", "Abrir recibo personalizado", [
        "Gera um recibo em PDF para entregar ao passageiro, com os dados do serviço já preenchidos.",
        "Só aparece para quem tem essa permissão."
      ], { ...button("Abrir recibo personalizado", { optional: true }) }),
      step("finalizar", "Finalizar", [
        "Confere se os comprovantes cobrem o valor e segue: para o voucher, nos serviços que exigem, ou para a finalização.",
        "Se o app não conseguir confirmar o valor na foto, pergunta \"Você recebeu os R$ que faltavam?\". Responda com sinceridade."
      ], { ...button("FINALIZAR") }),
      helpStep()
    ]
  },
  {
    id: "cobranca-qr",
    title: "Cobrança por QR code",
    // Tela mostrada ao passageiro: o guia não abre sozinho na frente dele, só pelo botão "?".
    auto: false,
    steps: [
      backStep("Antes de gerar o QR code ela volta ao passo anterior; depois de gerado, volta para o recebimento."),
      step("titulo", "Recebimento", [
        "Aqui você cobra o passageiro por QR code. A cobrança é feita em passos curtos, com a barra de progresso no alto."
      ], { target: ".finalize-title" }),
      step("progresso", "Passo a passo da cobrança", [
        "1. Valor da cobrança. 2. Quem vai pagar. 3. E-mail para o recibo. 4. Idioma do passageiro. 5. Confira e gere o QR code.",
        "Em cada passo, o botão principal (Confirmar ou Continuar) avança e \"Voltar\" corrige o que digitou."
      ], { target: ".qr-charge-progress", optional: true }),
      step("campo", "Preencha o passo", [
        "O valor tem um limite máximo, mostrado como dica. Em \"Quem vai pagar\" você escolhe um dos passageiros ou o solicitante do serviço, ou \"Outra pessoa\" para digitar o nome.",
        "O e-mail é opcional (\"Pular\") e serve para enviar o recibo. O idioma define a língua do QR code e do pagamento."
      ], { target: ".qr-charge-step", optional: true }),
      step("revisao", "Confira e gere", [
        "A revisão mostra tudo o que você informou; toque em uma linha (\"Alterar\") para corrigir.",
        "\"Gerar QR code\" cria a cobrança e mostra o código para o passageiro ler."
      ], { target: ".qr-charge-review", optional: true }),
      step("qrcode", "O QR code", [
        "Mostre o código ao passageiro. Ele tem um tempo para pagar, com contagem regressiva, e o app avisa sozinho quando o pagamento é confirmado.",
        "Se o passageiro pagou antes do prazo, a confirmação aparece no Recebimento."
      ], { target: ".qr-charge-result", optional: true }),
      step("confirmado", "Pagamento confirmado", [
        "Quando o pagamento cai, aparecem o valor, quem pagou e a hora. Toque em Continuar para seguir com o serviço."
      ], { target: ".qr-charge-confirmed", optional: true }),
      step("cancelar", "Cancelar cobrança", [
        "Se errou o valor ou o passageiro desistiu, cancele: o QR code deixa de aceitar pagamento. Depois você pode gerar outro QR code."
      ], { ...button("Cancelar cobrança", { optional: true }) }),
      helpStep()
    ]
  },
  {
    id: "recibo",
    title: "Recibo personalizado",
    steps: [
      backStep("Volta para a tela de onde você abriu o recibo: o Recebimento do serviço ou o Início."),
      step("preview", "Prévia do recibo", [
        "O recibo aparece pronto aqui em cima e muda conforme você preenche os campos. Toque na prévia para ampliar e conferir cada linha."
      ], { target: ".receipt-preview-card" }),
      step("pagante", "Pagante", [
        "Nome de quem paga. Quando o recibo é aberto a partir de um serviço, já vem preenchido com o passageiro; pelo Início, vem vazio. É obrigatório."
      ], field("pagante")),
      step("cliente", "Cliente", [
        "Escolha a empresa ou cliente do recibo na lista, que tem busca. É obrigatório. O botão de limpar remove a escolha."
      ], field("cliente")),
      step("idioma", "Idioma", [
        "Define a língua em que o recibo é escrito, para o passageiro estrangeiro entender cada linha."
      ], field("idioma")),
      step("total", "Total", ["O valor total do recibo, em reais. É obrigatório."], field("total")),
      step("observacoes", "Observações", ["Texto livre que sai impresso no recibo, como o motivo ou o trajeto. Opcional."], field("observa")),
      step("gerar", "Gerar", [
        "Cria o PDF do recibo.",
        "Depois de gerado, aparecem a opção de abrir o PDF e o botão \"Enviar para o cliente\"."
      ], { ...button("Gerar") }),
      helpStep()
    ]
  },
  {
    id: "voucher",
    title: "Formulário de voucher",
    steps: [
      backStep(),
      step("limpar", "Limpar formulário", [
        "A borracha apaga horários, desvio, observação e despesas, e a assinatura é mantida. O app pergunta \"Limpar o voucher?\" antes, e o botão só fica ativo depois que você preenche algo."
      ], { target: '.form-menu-button[aria-label="Limpar formulário"]', optional: true }),
      step("faixa", "Dados do serviço", ["A faixa escura repete o dia, a hora e o número do serviço a que o voucher pertence."], { target: ".voucher-main .details-header-v1, .details-header-v1", optional: true }),
      step("horario", "Horário inicial", [
        "A hora e os minutos em que o serviço começou, escolhidos nas duas listas. É obrigatório, por isso tem um asterisco."
      ], { target: ".voucher-row-label", match: "hor[aá]rio inicial", within: ".voucher-section" }),
      step("espera", "Espera", [
        "Se houve espera, informe a hora em que ela começou (Início) e a hora em que terminou (Final)."
      ], { target: ".voucher-section-title", match: "^espera", within: ".voucher-section" }),
      step("desvio", "Desvio", ["Se o trajeto teve desvio, descreva aqui o que mudou e por quê. Deixe em branco se não houve."], { target: ".voucher-row-label", match: "^desvio", within: "parent" }),
      step("observacao", "Observação", ["Qualquer informação extra que o passageiro ou a operação deva saber sobre este serviço."], { target: ".voucher-row-label", match: "^observa", within: "parent" }),
      step("despesas", "Despesas", [
        "Valores gastos durante o serviço: Pedágio, Estacionamento, Combustível, Hospedagem e Outros, em reais.",
        "Preencha só os que existirem."
      ], { target: ".voucher-section-title", match: "^despesas", within: ".voucher-section" }),
      step("assinar", "Assinar", [
        "Aparece em serviços de alguns clientes e, quando aparece, a assinatura é obrigatória. Abre a tela em que o passageiro assina com o dedo: entregue o celular a ele."
      ], { ...button("Assinar", { optional: true }) }),
      step("finalizar", "Finalizar", [
        "Envia o voucher. Se faltar um campo obrigatório, o app mostra o aviso no próprio campo."
      ], { ...button("FINALIZAR") }),
      helpStep()
    ]
  },
  {
    id: "assinatura",
    title: "Assinatura do passageiro",
    // O passageiro assina nesta tela: o guia não abre sozinho na frente dele, só pelo botão "?".
    auto: false,
    steps: [
      backStep("Volta ao formulário de voucher."),
      step("quadro", "Quadro de assinatura", [
        "O passageiro faz a assinatura com o dedo, no espaço em branco."
      ], { target: "canvas", within: "parent" }),
      step("apagar", "Apagar assinatura", [
        "O ícone da borracha limpa o quadro para recomeçar. Use quantas vezes precisar."
      ], { target: ".signature-icon-action", optional: true }),
      step("confirmar", "Confirmar", [
        "Salva a assinatura no voucher e volta ao formulário. Sem assinatura, o app avisa \"Assine antes de confirmar\"."
      ], { ...button("Confirmar") }),
      helpStep()
    ]
  },
  {
    id: "finalizar",
    title: "Finalizar o serviço",
    steps: [
      backStep(),
      step("titulo", "Título da tela", [
        "O título acompanha a etapa: \"Digite abaixo sua observação\", depois \"Confira sua observação\" ou \"Confira o resumo do serviço\". Nas trocas e nas manutenções, ele mostra o número do serviço."
      ], { target: ".finalize-title" }),
      step("observacao", "Observação do serviço", [
        "Conte como foi: atrasos, pedidos do passageiro, ocorrências. Se você já escreveu a observação na tela de detalhe, ela já vem aqui.",
        "Seja objetivo e use fatos: horários, nomes e o que foi combinado."
      ], { target: ".form-field-label", match: "observa[cç][aã]o do servi", within: "parent", optional: true }),
      step("ditado", "Falar em vez de digitar", [
        "O botão do microfone transcreve o que você fala e acrescenta ao texto. Toque de novo para parar."
      ], { target: ".ditado-button", optional: true }),
      step("sem-obs", "Não tenho observação", [
        "Finaliza o serviço sem observação, quando não houve nada a registrar."
      ], { ...button("Não tenho observação", { optional: true }) }),
      step("resumo", "Gerar resumo", [
        "O app organiza o seu texto em tópicos curtos para você conferir. Se concordar, toque em Confirmar, e o serviço é enviado.",
        "Se o resumo não puder ser gerado, aparece \"Não foi possível resumir agora\" e o botão vira Enviar, que manda o seu texto como escreveu."
      ], { ...button("Gerar resumo", { optional: true }) }),
      step("troca", "Observação da troca", [
        "Na troca de carro, descreva o estado do veículo entregue e recebido. Se a troca aconteceu fora do horário combinado, o app pede o motivo, que é obrigatório."
      ], { target: ".form-field-label", match: "observa[cç][aã]o da troca", within: "parent", optional: true }),
      step("manutencao", "Manutenção realizada", [
        "Na finalização de manutenção, informe o que foi feito, o valor em reais, a forma de pagamento, a cidade e o estabelecimento.",
        "Anexe as fotos da nota fiscal e da manutenção, e use Observações para detalhes extras."
      ], { target: ".form-field-label", match: "manuten[cç][aã]o realizada", within: "parent", optional: true }),
      step("enviar", "Finalizar", [
        "Envia o serviço para a Betinhos. Enquanto envia, aparece o andamento: aguarde terminar antes de sair da tela."
      ], { target: ".action-button", match: "^(finalizar|confirmar|enviar)$", optional: true }),
      helpStep()
    ]
  },
  {
    id: "cancelado-local",
    title: "Cancelado no local",
    steps: [
      backStep(),
      step("limpar", "Limpar texto", ["A borracha apaga o que você escreveu para recomeçar."], { target: '.form-menu-button[aria-label="Limpar texto"]', optional: true }),
      step("detalhes", "Detalhes do cancelamento", [
        "Escreva os envolvidos, horários, detalhes e motivos. O campo é obrigatório."
      ], field("detalhes")),
      step("errado", "Cliquei errado", [
        "Volta ao detalhe sem cancelar nada. Use se tocou em Cancelar no local por engano."
      ], { ...button("Cliquei errado", { optional: true }) }),
      step("enviar", "Enviar", [
        "Envia o relato e registra o cancelamento no local."
      ], { ...button("Enviar") }),
      helpStep()
    ]
  },
  {
    id: "comprovante",
    title: "Leitura do comprovante",
    probe: ".receipt-reading-card",
    steps: [
      step("leitura", "Lendo o comprovante", [
        "O app está lendo a foto para preencher o gasto: valor, data, estabelecimento, cidade e categoria. A forma de pagamento você escolhe.",
        "Isso leva alguns segundos. Se demorar, aparece \"Está demorando mais que o normal\"; aguarde."
      ], { target: ".receipt-reading-card" }),
      step("etapas", "As etapas da leitura", [
        "A lista mostra em que ponto a leitura está: cada item concluído ganha um visto."
      ], { target: ".receipt-reading-steps", optional: true }),
      step("ilegivel", "Não consegui ler", [
        "Se a foto estiver borrada, escura ou cortada, o app avisa e mostra dicas: aproxime o celular até o comprovante ocupar a tela, mostre o cupom inteiro e sem dobras, e procure mais luz.",
        "Toque em \"Tirar outra foto\". Depois de três tentativas, o app abre o formulário para você preencher na mão."
      ], { target: ".receipt-illegible-card", optional: true }),
      helpStep()
    ]
  },
  {
    id: "gastos",
    title: "Registrar gasto",
    probe: ".form-field-label",
    steps: [
      backStep(),
      step("data", "Data do gasto", ["O dia em que você pagou. Já vem com a data de hoje; mude se o gasto foi antes."], field("data do gasto")),
      step("categoria", "Categoria", [
        "O tipo da despesa: Abastecimento, Almoço, Aplicativos, Café, Estacionamento, Hospedagem, Jantar, Lanche, Lavagem, Locação de carro, Manutenção, Pedágio e outras.",
        "Algumas pedem campos extras: Abastecimento pede veículo, KM e litros; Lavagem e Manutenção pedem o veículo."
      ], field("categoria")),
      step("valor", "Valor", ["Quanto custou, em reais. Se o app leu o comprovante, o valor já vem preenchido; confira com a foto."], field("valor")),
      step("pagamento", "Forma de pagamento", [
        "Como foi pago, por exemplo Dinheiro (Corporativo). Escolha na lista, que tem busca."
      ], field("forma de pagamento")),
      step("cidade", "Cidade", ["Onde foi o gasto. Comece a digitar o nome da cidade e escolha na lista."], field("cidade")),
      step("estabelecimento", "Estabelecimento", ["Nome do posto, estacionamento, hotel ou loja. Opcional, mas ajuda a conferir o comprovante."], field("estabelecimento", { optional: true })),
      step("descricao", "Descrição", ["Qualquer detalhe que ajude a entender o gasto. Opcional."], field("descri[cç][aã]o", { optional: true })),
      step("comprovantes", "Comprovantes", [
        "A foto do comprovante é obrigatória: sem ela o gasto não é enviado. Fotografe o documento inteiro, com boa luz.",
        "Você pode adicionar mais de uma foto. Toque numa miniatura para ver ou apagar."
      ], field("comprovantes")),
      step("registrar", "Registrar", [
        "Envia o gasto com as fotos. Enquanto envia, o app mostra o andamento e, se algo falhar, os envios pendentes ficam registrados para você tentar de novo."
      ], { ...button("REGISTRAR") }),
      helpStep()
    ]
  },
  {
    id: "camera",
    title: "Câmera do app",
    auto: false,
    steps: [
      backStep("Volta sem guardar a foto."),
      step("previa", "Imagem da câmera", [
        "A câmera ao vivo mostra o que será fotografado. A captura acontece direto aqui, sem escolher da galeria, para garantir que a foto é de agora."
      ], { target: ".camera-stage, .photo-stage, .camera-preview, video", optional: true }),
      step("lanterna", "Lanterna", [
        "O raio liga e desliga a lanterna do celular, útil em estacionamentos e à noite. Só aparece se o aparelho tem lanterna."
      ], { target: ".camera-torch-toggle", optional: true }),
      step("video", "Gravar vídeo", [
        "O botão da esquerda grava um vídeo curto, quando a etapa permite. Toque de novo para parar; o tempo aparece na tela."
      ], { target: ".photo-record", optional: true }),
      step("foto", "Tirar foto", [
        "O botão grande do centro tira a foto. Segure o celular firme até abrir a prévia."
      ], { target: ".photo-capture" }),
      step("trocar", "Mudar câmera", [
        "O botão da direita alterna entre a câmera traseira e a frontal."
      ], { target: ".photo-switch", optional: true }),
      step("nativa", "Câmera do aparelho", [
        "Em iPhone e iPad, ou quando não há câmera ao vivo, o app mostra \"Tirar foto\" e, se a etapa permite, \"Gravar vídeo\", que usam a câmera do próprio celular.",
        "Se a câmera falhar, aparece \"Câmera indisponível\" com o botão \"Tentar de novo\"."
      ], { target: ".native-camera-panel", optional: true }),
      helpStep()
    ]
  },
  {
    id: "foto-previa",
    title: "Conferir a foto",
    auto: false,
    steps: [
      backStep(),
      step("previa", "Prévia", ["Confira se a foto está nítida, inteira e com o documento ou o item visível."], { target: "main [aria-label='Preview da foto'], main img, main video", optional: true }),
      step("refazer", "Refazer", ["Descarta esta foto e volta à câmera para fazer outra. O rótulo varia: \"Não, refazer\" ou \"Tirar outra\"."], { target: ".action-button", match: "refazer|tirar outra", optional: true }),
      step("confirmar", "Confirmar", ["Aceita a foto e volta ao formulário, onde ela aparece em miniatura. O botão se chama \"Confirmar\" ou \"Usar esta foto\"."], { target: ".action-button", match: "usar esta foto|^confirmar", optional: true }),
      step("apagar", "Apagar foto", ["Ao abrir uma foto que já está anexada, o único botão é \"Apagar foto\". O app pergunta \"Apagar foto?\" antes, para você não perder por engano."], { ...button("Apagar foto", { optional: true }) }),
      helpStep()
    ]
  },
  {
    id: "historico",
    title: "Histórico",
    steps: [
      step("inicio", "Voltar ao Início", ["Volta para a tela inicial."], { target: SERVICE_HOME }),
      step("busca", "Buscar serviço", [
        "Digite parte do trajeto ou do número do serviço para filtrar a lista. O X limpa a busca."
      ], { target: ".search-field" }),
      step("dias", "Dias", ["Os serviços finalizados dos últimos dias são agrupados por dia, do mais recente ao mais antigo."], { target: ".agenda-card.header", optional: true }),
      step("cartao", "Serviço finalizado", [
        "Cada cartão mostra horário, tipo (serviço, troca, manutenção) e trajeto. Toque para ver o detalhe, que é só consulta."
      ], { target: ".agenda-card:not(.header)", optional: true }),
      step("atualizar", "Atualizar", ["Recarrega o histórico agora."], { target: ".services-nav-button--refresh" }),
      helpStep()
    ]
  },
  {
    id: "historico-detalhe",
    title: "Detalhe do histórico",
    steps: [
      step("consulta", "Serviço finalizado", [
        "Aqui está o serviço depois de encerrado: data, número, destino e os demais dados. Alguns dados, como o endereço de saída e as observações de operação, não aparecem no histórico.",
        "Não há botões de ação, porque o serviço já foi finalizado."
      ], { target: ".details-header-v1" }),
      step("enderecos", "Destino no mapa", ["O destino sublinhado é um link: tocar abre o Google Maps."], { target: ".detail-map-link", within: ".detail-field", optional: true }),
      helpStep()
    ]
  },
  {
    id: "comunicados",
    title: "Comunicados",
    steps: [
      step("voltar", "Voltar", ["Volta para a tela anterior."], { target: SERVICE_HOME }),
      step("atualizar", "Atualizar", ["Busca novos comunicados agora."], { target: ".services-nav-button--refresh" }),
      step("pendentes", "Aguardando sua ciência", [
        "Os comunicados que ainda aguardam a sua ciência. O número ao lado do título é quantos faltam.",
        "Toque em um para ler e dar ciência."
      ], { target: ".comunicado-list h2, h2", match: "aguardando", optional: true }),
      step("cartao", "O comunicado", [
        "Cada cartão mostra o selo (ASSINATURA OBRIGATÓRIA ou INFORMATIVO), o título e a data."
      ], { target: ".agenda-card:not(.header)", optional: true }),
      step("cientes", "Já cientes", ["Os comunicados que você já assinou ou confirmou ficam guardados aqui para consulta."], { target: "h2", match: "j[aá] cientes", optional: true }),
      step("vazio", "Tudo em dia", ["Sem pendências, a tela mostra \"Tudo em dia. Nenhum comunicado aguardando sua ciência\"."], { target: ".comunicado-empty", optional: true }),
      helpStep()
    ]
  },
  {
    id: "comunicado-detalhe",
    title: "Ler e dar ciência",
    probe: ".comunicado-ack",
    steps: [
      step("leitura", "Leia com atenção", ["O texto completo do comunicado fica na tela. Leia tudo antes de dar ciência."], { target: ".comunicado-body, .comunicado-content, .comunicado-detail", optional: true }),
      step("ciencia", "Registrar ciência", [
        "Nos comunicados com assinatura obrigatória, desenhe a sua assinatura no quadro e, se quiser, escreva uma observação (até 1000 caracteres).",
        "Sem assinatura, o app avisa logo abaixo do quadro."
      ], { target: ".comunicado-ack" }),
      step("limpar", "Limpar assinatura", ["O botão de limpar zera o desenho do quadro para você assinar de novo."], { target: ".comunicado-text-button", optional: true }),
      step("assinar", "Assinar ciência", [
        "Salva a sua ciência com data, hora e assinatura. O comunicado passa para \"Já cientes\"."
      ], { ...button("Assinar ciência", { optional: true }) }),
      step("seguinte", "Seguinte", [
        "Nos informativos, \"Seguinte\" apenas registra que você leu e volta para a lista."
      ], { ...button("Seguinte", { optional: true }) }),
      helpStep()
    ]
  },
  {
    id: "checklists",
    title: "Checklists",
    steps: [
      step("voltar", "Voltar", ["Volta para a tela anterior."], { target: SERVICE_HOME }),
      step("atualizar", "Atualizar", ["Busca novos checklists agora."], { target: ".services-nav-button--refresh" }),
      step("pendentes", "Para fazer", [
        "As vistorias que esperam por você, com o veículo e quem entregou o carro. A operação pede uma vistoria do seu carro a cada 15 dias e avisa por notificação."
      ], { target: "h2", match: "para fazer", optional: true }),
      step("cartao", "O cartão do checklist", ["Toque para abrir a vistoria e preencher cada item."], { target: ".agenda-card:not(.header)", optional: true }),
      step("enviados", "Enviados", ["As vistorias já enviadas ficam aqui para consulta."], { target: "h2", match: "^enviados", optional: true }),
      helpStep()
    ]
  },
  {
    id: "checklist-formulario",
    title: "Preencher o checklist",
    probe: ".checklist-form",
    steps: [
      backStep("Durante o envio ela fica desativada."),
      step("resumo", "Veículo e progresso", [
        "No alto aparecem a placa do veículo e quantos itens você já preencheu. O progresso é salvo neste aparelho, então você pode sair e voltar sem perder o que marcou."
      ], { target: ".checklist-summary" }),
      step("itens", "Itens da vistoria", [
        "Cada item pede uma resposta: na maioria, OK ou Não OK; alguns pedem um número, como a quilometragem, ou um texto. Um asterisco indica que o item é obrigatório.",
        "Percorra o carro com calma e responda um por um."
      ], { target: ".checklist-oknok", optional: true }),
      step("problema", "Qual o problema?", [
        "Ao marcar Não OK, escolha o problema na pergunta \"Qual o problema?\" e tire a foto dele: os dois são obrigatórios. A observação do item é opcional."
      ], { target: ".checklist-oknok-chips", optional: true }),
      step("fotos", "Fotos do item", [
        "Alguns itens pedem foto. Toque para abrir a câmera: a foto fica anexada ao item e segue junto no envio."
      ], { target: ".photo-add-button", optional: true }),
      step("observacao", "Observação", ["Escreva aqui o que mais for importante, se precisar."], { target: "textarea", optional: true }),
      step("enviar", "Enviar checklist", [
        "Envia a vistoria completa. Itens obrigatórios sem resposta ficam marcados para você corrigir antes."
      ], { ...button("Enviar checklist", { optional: true }) }),
      helpStep()
    ]
  },
  {
    id: "multas",
    title: "Multas",
    steps: [
      step("voltar", "Voltar", ["Volta para a tela anterior."], { target: SERVICE_HOME }),
      step("abas", "Pendentes e Concluídos", [
        "Pendentes: termos esperando a sua assinatura. Concluídos: os que você já assinou, contestou ou que expiraram. O número mostra quantos há em cada aba."
      ], { target: ".termo-tab", within: "parent" }),
      step("termo", "O termo", [
        "Cada linha mostra a placa, o código da infração, a descrição, a data e hora, o valor e o prazo para assinar (\"Assine até\")."
      ], { target: ".termo-row", optional: true }),
      step("prazo", "Prazo", [
        "Assine dentro do prazo. Passado o prazo, o termo expira e você precisa falar com o gestor de frota."
      ], { target: ".termo-row", optional: true }),
      helpStep()
    ]
  },
  {
    id: "multa-detalhe",
    title: "Assinar o termo de multa",
    probe: ".termo-flow-scroll",
    steps: [
      step("prazo", "Prazo para responder", [
        "O aviso amarelo mostra até quando você pode assinar ou contestar. Passado o prazo, o termo expira e o gestor de frota fala com você."
      ], { target: ".termo-prazo", optional: true }),
      step("aconteceu", "O que aconteceu", [
        "Os dados da infração: placa, data e hora, local, descrição da infração e valor.",
        "O rastreador (InFleet) mostra a viagem do veículo naquele horário, para você conferir se o registro bate com o que você fez."
      ], { target: ".termo-card" }),
      step("aceitando", "O que você está aceitando", [
        "Aqui está o acordo: o que acontece com o valor se você assinar, como o desconto em folha e em quantas parcelas. Leia com atenção antes de continuar."
      ], { target: ".termo-acordo", optional: true }),
      step("texto", "Texto do termo", [
        "O texto completo do termo, com a versão. Role até o fim."
      ], { target: ".termo-texto", optional: true }),
      step("assinar", "Assinar", [
        "Concordando, toque em Assinar. Antes, o app confere o aditivo do seu contrato; se ele não estiver assinado, aparece \"Procure o escritório\".",
        "A assinatura tem 3 etapas: uma selfie, para confirmar que foi você (câmera da frente, com o rosto bem iluminado), a sua localização, que entra só neste registro, e a assinatura com o dedo.",
        "Ao confirmar, o termo fica registrado com data e hora do servidor, e uma cópia vai para o seu e-mail."
      ], { target: ".action-button, button", match: "^assinar$", optional: true }),
      step("contestar", "Não concordo", [
        "Se não concorda, toque em Não concordo e conte o que aconteceu. O gestor de frota fala com você pessoalmente, e nada é descontado enquanto vocês conversam.",
        "O termo fica em Concluídos com o seu motivo."
      ], { target: ".action-button, button", match: "n[aã]o concordo", optional: true }),
      helpStep()
    ]
  },
  {
    id: "manutencao",
    title: "Solicitar manutenção",
    steps: [
      backStep(),
      step("veiculo", "Veículo", ["Escolha o carro que precisa de reparo, na lista com busca."], field("ve[ií]culo")),
      step("km", "KM atual", ["A quilometragem que o painel mostra agora, só números. É obrigatória."], field("km atual")),
      step("gravidade", "Gravidade", [
        "Escolha o quanto é urgente: Baixa, Média, Alta ou Urgente."
      ], field("gravidade")),
      step("descricao", "Descrição", [
        "Conte o que está acontecendo, por exemplo: barulho ao frear, luz acesa no painel, pneu vibrando."
      ], field("descri[cç][aã]o")),
      step("fotos", "Fotos", [
        "Anexe fotos do problema: painel aceso, pneu, peça danificada. Pelo menos uma foto é obrigatória."
      ], field("fotos")),
      step("enviar", "Enviar", [
        "Envia o pedido de manutenção com as fotos para a equipe da Betinhos."
      ], { ...button("ENVIAR") }),
      helpStep()
    ]
  },
  {
    id: "colisoes",
    title: "Colisões",
    steps: [
      backStep(),
      step("emergencia", "Alguém se feriu?", [
        "Se houver feridos, ligue antes de registrar: o botão SAMU 192 e o botão Polícia 190 chamam direto. O registro pode esperar."
      ], { target: ".collision-emergency" }),
      step("pergunta", "O que aconteceu?", [
        "Se todos estão bem, escolha a opção que melhor descreve o ocorrido."
      ], { target: ".collision-start-kicker" }),
      step("eu-bati", "Eu bati", ["Quando você atingiu outro veículo, objeto, portão, guia ou estrutura."], { target: ".collision-choice--primary" }),
      step("bateram", "Bateram em mim", ["Quando outro motorista atingiu o veículo Betinhos."], { target: ".collision-choice:not(.collision-choice--primary)" }),
      helpStep()
    ]
  },
  {
    id: "colisao-registro",
    title: "Registrar colisão",
    steps: [
      backStep(),
      step("veiculo", "Veículo da Betinhos", ["O carro envolvido na colisão, na lista com busca."], field("ve[ií]culo da betinhos")),
      step("data", "Data e hora", ["Quando aconteceu. Já vem com o momento atual; ajuste se o registro é de antes."], field("data e hora")),
      step("local", "Local", ["O endereço do ocorrido, como \"Av. Paulista, 1000\"."], field("local")),
      step("relato", "O que aconteceu?", ["Conte em detalhes o que aconteceu, na ordem em que ocorreu. É obrigatório."], field("o que aconteceu")),
      step("terceiro", "Houve terceiro?", [
        "Em \"Eu bati\", escolha Sim se houve outra parte envolvida. Aparecem então os dados do terceiro: nome completo, WhatsApp ou telefone, placa e modelo/cor do veículo.",
        "Em \"Bateram em mim\", a pergunta não aparece: os dados do terceiro são sempre pedidos."
      ], field("houve terceiro")),
      step("fotos", "Fotos", [
        "Veículos e Local são obrigatórios; Complementares é opcional. Fotografe os danos, a placa e a posição dos carros.",
        "Quando há terceiro, o app pede também a CNH da pessoa e o documento do veículo dela."
      ], { target: ".photo-add-button", optional: true }),
      step("enviar", "Enviar", ["Envia o registro da colisão para a equipe da Betinhos."], { ...button("ENVIAR") }),
      helpStep()
    ]
  },
  {
    id: "ideias",
    title: "Boas ideias",
    steps: [
      backStep(),
      step("atualizar", "Atualizar ideias", ["O botão da direita recarrega a lista das suas ideias enviadas."], { target: '.form-menu-button[aria-label="Atualizar ideias"]', optional: true }),
      step("titulo", "Título", ["Resuma a ideia em uma frase, como \"água gelada nos carros executivos\". É obrigatório."], field("t[ií]tulo")),
      step("como", "Como funcionaria?", ["Conte o problema e como a ideia ajudaria. É opcional."], field("como funcionaria")),
      step("enviar", "Enviar ideia", ["Envia para a equipe, que vai avaliar. Você acompanha o status em \"Suas ideias\", logo abaixo."], { ...button("ENVIAR IDEIA") }),
      step("lista", "Suas ideias", ["O histórico das ideias que você já enviou."], { target: "h2", match: "suas ideias", optional: true }),
      helpStep()
    ]
  },
  {
    id: "treinamentos",
    title: "Treinamentos",
    steps: [
      step("voltar", "Voltar", ["Volta para o Início."], { target: SERVICE_HOME }),
      step("atualizar", "Atualizar", ["Busca novos treinamentos agora."], { target: ".services-nav-button--refresh" }),
      step("abas", "Pendentes e Concluídos", [
        "Pendentes mostra os treinamentos que o RH publicou para você e ainda faltam fazer. Concluídos guarda os que você terminou, com a data e a nota do quiz, para consultar quando quiser."
      ], { target: ".termo-tabs" }),
      step("cartao", "O treinamento", [
        "Cada cartão traz o título, um resumo, o que ele exige (Assinatura, Quiz), o prazo e a situação: Novo, Em andamento ou Concluído.",
        "Toque para abrir."
      ], { target: ".trn-row", optional: true }),
      step("vazio", "Nada pendente", ["Sem treinamentos para fazer, a aba Pendentes avisa que, quando o RH publicar um para você, ele aparece aqui."], { target: ".termo-empty", optional: true }),
      helpStep()
    ]
  },
  {
    id: "gastos-relatorio",
    title: "Relatório de gastos",
    steps: [
      step("voltar", "Voltar", ["Volta para o Início."], { target: SERVICE_HOME }),
      step("periodo", "Período", ["Escolha Mês atual, Mês anterior ou 3 meses. Todos os números da tela são recalculados para o período."], { target: ".gr-periodos" }),
      step("medias", "Suas médias", [
        "No topo, o preço por litro e a refeição média (almoço e jantar) lado a lado. A cor compara com a meta da empresa: verde dentro, amarelo pouco acima e vermelho acima. Embaixo, a variação contra o período anterior.",
        "Logo abaixo fica o café e lanche médio, quando há dados."
      ], { target: ".gr-destaques", optional: true }),
      step("alerta", "Pendências", ["Quando algum gasto precisa de correção ou foi recusado, o aviso aparece aqui no topo. Toque nele para ir direto à lista de pendentes."], { target: ".gr-alerta", optional: true }),
      step("evolucao", "Médias por mês", ["Escolha R$/L ou Refeição para ver a média de cada mês. Os meses do período escolhido ficam em azul-escuro."], { target: ".gr-evolucao", optional: true }),
      step("despesas", "Despesas", ["Pendentes mostra o que precisa de correção, completar ou foi recusado. Todas mostra as despesas do período. Toque num gasto do cartão marcado Completar para preenchê-lo; nos outros, abre o detalhe com o comprovante."], { target: ".gr-despesas", optional: true }),
      step("completar", "Completar", ["Quando há gastos do cartão para completar, o botão da esquerda abre a lista deles."], { target: ".gr-actions .action-button--secondary", optional: true }),
      step("precos", "Preço dos postos", ["Mostra quanto a frota pagou por litro nos postos de cada cidade."], { target: ".gr-preco-postos" }),
      step("anexar", "Anexar despesa", ["Abre a câmera para fotografar o comprovante e lançar um gasto novo."], { target: ".gr-actions .action-button--primary" }),
      helpStep()
    ]
  },
  {
    id: "ranking-postos",
    title: "Preço dos postos",
    steps: [
      step("voltar", "Voltar", ["Volta para o Relatório de gastos."], { target: SERVICE_HOME }),
      step("cidades", "Postos por cidade", ["Cada cidade lista os postos do menor para o maior R$/litro pago pela frota no período recente. A linha também mostra em quantos abastecimentos a média se baseia."], { target: ".rp-lista", optional: true }),
      helpStep()
    ]
  },
  {
    id: "gastos-cartao",
    title: "Gastos do cartão",
    steps: [
      step("voltar", "Voltar", ["Volta para o relatório de gastos."], { target: SERVICE_HOME }),
      step("atualizar", "Atualizar", ["Busca novos gastos do cartão agora."], { target: ".services-nav-button--refresh" }),
      step("gasto", "Gasto para completar", [
        "Cada linha é uma compra no cartão corporativo que o sistema já registrou: estabelecimento, valor, data e final do cartão.",
        "Toque para informar descrição, categoria, cidade e comprovante."
      ], { target: ".termo-row", optional: true }),
      step("vazio", "Nada pendente", ["Sem gastos do cartão para completar, esta tela avisa que eles aparecem aqui quando o cartão for usado. Para lançar um gasto novo, use Anexar despesa no relatório."], { target: ".termo-empty", optional: true }),
      helpStep()
    ]
  },
  {
    id: "treinamento-detalhe",
    title: "Fazer o treinamento",
    probe: ".trn-detail",
    steps: [
      step("voltar", "Voltar", ["Volta para a lista. Leitura, assinatura e quiz já enviados ficam salvos; o que estiver pela metade se perde."], { target: SERVICE_HOME }),
      step("conteudo", "Conteúdo", [
        "Leia o texto, assista ao vídeo e abra as fotos e os arquivos. Os anexos abrem no SharePoint.",
        "Se houver prazo, ele aparece em destaque logo abaixo do título."
      ], { target: ".trn-detail > .termo-card" }),
      step("confirmar", "Confirmar leitura", [
        "Role até o fim do conteúdo e toque em \"Confirmar leitura\". Se o treinamento não exigir mais nada, ele já fica concluído.",
        "Quando exigir, depois vêm a assinatura e o quiz, nesta ordem."
      ], { target: ".trn-step", optional: true }),
      step("assinatura", "Assinar", ["Desenhe a sua assinatura no quadro e toque em \"Assinar\". Ela fica registrada em seu nome, com data e hora."], { target: ".termo-signature", optional: true }),
      step("quiz", "Quiz", [
        "Marque uma alternativa por pergunta e toque em \"Enviar respostas\". Abaixo da nota mínima, o app mostra quantas você acertou e \"Refazer quiz\" libera uma nova tentativa."
      ], { target: ".trn-quiz", optional: true }),
      step("concluido", "Concluído", ["Aqui ficam a data de conclusão, a leitura, a assinatura e a nota. Reabrir um treinamento concluído não muda nada."], { target: ".trn-concluido", optional: true }),
      helpStep()
    ]
  },
  {
    id: "meu-carro",
    title: "Meu carro",
    steps: [
      backStep("Enquanto salva a escolha, ela fica desativada."),
      step("carros", "Escolha o seu carro", [
        "Toque no carro que você está usando agora. O app guarda a escolha e usa esse carro nos seus serviços.",
        "Se não aparecer nenhum, fale com a operação: o carro precisa estar cadastrado para você."
      ], { target: ".vehicle-choice-list, .ideas-intro", optional: true }),
      helpStep()
    ]
  }
];

const CHAPTER_IDS_BY_SCREEN: Readonly<Record<string, readonly string[]>> = {
  inicio: ["inicio"],
  servicos: ["servicos"],
  detalhes: ["detalhes"],
  detalhesHistorico: ["historico-detalhe"],
  receber: ["receber"],
  cobrancaQr: ["cobranca-qr"],
  reciboPersonalizado: ["recibo"],
  voucher: ["voucher"],
  assinatura: ["assinatura"],
  finalizar: ["finalizar"],
  canceladoLocal: ["cancelado-local"],
  gastos: ["comprovante", "gastos"],
  historico: ["historico"],
  comunicados: ["comunicado-detalhe", "comunicados"],
  checklists: ["checklist-formulario", "checklists"],
  multas: ["multa-detalhe", "multas"],
  treinamentos: ["treinamento-detalhe", "treinamentos"],
  gastosCartao: ["gastos-cartao"],
  gastosRelatorio: ["gastos-relatorio"],
  rankingPostos: ["ranking-postos"],
  solicitarManutencao: ["manutencao"],
  colisoesInicio: ["colisoes"],
  colisoes: ["colisao-registro"],
  boasIdeias: ["ideias"],
  meuCarro: ["meu-carro"],
  fotoReceber: ["camera"],
  fotoGasto: ["camera"],
  fotoColisao: ["camera"],
  fotoManutencao: ["camera"],
  fotoSolicitacaoManutencao: ["camera"],
  previewFotoReceber: ["foto-previa"],
  previewFotoGasto: ["foto-previa"],
  previewFotoColisao: ["foto-previa"],
  previewFotoManutencao: ["foto-previa"],
  previewFotoSolicitacaoManutencao: ["foto-previa"]
};

const CHAPTERS_BY_ID = new Map(TOUR_CHAPTERS.map((chapter) => [chapter.id, chapter]));

/** Capítulos candidatos da tela, do mais específico (com probe) para o mais geral. */
export function tourChaptersForScreen(screen: string): TourChapter[] {
  return (CHAPTER_IDS_BY_SCREEN[screen] ?? []).flatMap((id) => CHAPTERS_BY_ID.get(id) ?? []);
}

export function tourScreensWithChapters(): string[] {
  return Object.keys(CHAPTER_IDS_BY_SCREEN);
}
