export type Screen =
  | "inicio"
  | "servicos"
  | "comunicados"
  | "checklists"
  | "historico"
  | "detalhes"
  | "detalhesHistorico"
  | "receber"
  | "cobrancaQr"
  | "reciboPersonalizado"
  | "voucher"
  | "assinatura"
  | "finalizar"
  | "gastos"
  | "fotoReceber"
  | "previewFotoReceber"
  | "fotoGasto"
  | "previewFotoGasto"
  | "colisoesInicio"
  | "colisoes"
  | "fotoColisao"
  | "previewFotoColisao"
  | "solicitarManutencao"
  | "fotoSolicitacaoManutencao"
  | "previewFotoSolicitacaoManutencao"
  | "fotoManutencao"
  | "previewFotoManutencao"
  | "canceladoLocal"
  | "boasIdeias"
  | "meuCarro"
  | "multas"
  | "treinamentos"
  | "gastosCartao"
  | "gastosRelatorio"
  | "rankingPostos"
  | "postosProximos";

export type TileIcon = "cars" | "clock" | "money" | "tools";

export type AgendaType = "HEADER" | "SERVICO" | "TROCA" | "MANUTENCAO";

export type Tile = {
  label: string;
  variant: "active" | "disabled";
  icon: TileIcon;
  target?: Screen;
};

export type DetailAction = "cancel" | "receber" | "voucher" | "finalizar";

export type MaintenancePhotoKind = "NOTAFISCAL" | `NOTAFISCAL_${number}` | "FOTO1" | "FOTO2" | "FOTO3";

export type CapturedVideoDraft = {
  rawBlob: Blob;
  previewUrl: string;
  posterUrl?: string;
  durationLabel?: string;
};

export type DetailField = {
  label: string;
  value: string;
  strong?: boolean;
  html?: boolean;
  contact?: {
    phone: string;
  };
};

export type DetailPassenger = {
  id: string;
  name: string;
  /** Telefone como cadastrado (cr40f_telefone). */
  phone?: string;
  /** Link do WhatsApp com a mensagem pronta, igual ao da seção de passageiros. */
  whatsappUrl?: string;
  /** Idioma (cr40f_idioma); a tabela não tem campo de nacionalidade. */
  language?: string;
};

export type DetailData = {
  type: Exclude<AgendaType, "HEADER">;
  id: string;
  title: string;
  fields: DetailField[];
  actions: DetailAction[];
  /** Passageiros (cr40f_bancodedados) do serviço, na ordem de seleção; base do avatar com foto. */
  passengers?: DetailPassenger[];
  dataverse?: {
    entitySetName: string;
    id: string;
    record?: Record<string, unknown>;
  };
};

export type AgendaItem = {
  id: string;
  tipo: AgendaType;
  tituloData?: string;
  seta?: string;
  label?: string;
  time?: string;
  description?: string;
  priority?: 0 | 1 | 2 | 3 | 10;
  canceled?: boolean;
  searchText?: string;
  detail?: DetailData;
};
