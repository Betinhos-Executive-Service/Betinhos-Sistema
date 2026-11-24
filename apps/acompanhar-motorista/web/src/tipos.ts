// Contrato do /dados (frouxo de propósito: o Worker é a fonte da verdade e a página só lê o que usa).
export interface Etapa { tipo?: string; rotulo?: string; lat?: number; lon?: number; atual?: boolean; visitada?: boolean }
export interface Eta { minutos: number; faixa?: [number, number]; km?: number; transito?: boolean }
export interface Dados {
  versao?: string; servidorEm?: string; titulo?: string; modo?: string; fase: string; chegando?: boolean;
  posicao?: { lat: number; lon: number; atualizadoEm?: string; velocidadeKmh?: number; endereco?: string } | null;
  comSinal?: boolean; sinalAtrasadoMin?: number; fonteIndisponivel?: boolean; avaliado?: boolean;
  motorista?: { nome?: string; foto?: string; telefone?: string };
  veiculo?: { marca?: string; modelo?: string; cor?: string; placa?: string; foto?: string };
  etapas?: Etapa[]; eta?: Eta | null; horarioAgendado?: string;
  marcos?: { chegouEmbarqueEm?: string; saiuEmbarqueEm?: string; concluidoEm?: string };
  rota?: { coords?: [number, number][] } | null; percorrido?: [number, number][] | null;
  embarque?: { lat: number; lon: number; label?: string };
  diagnostico?: any;
}
export interface Cfg { tomtom: boolean; telefone: string | null; whatsapp: string | null; aoVivo: boolean; vapid: string | null; completo: boolean }
export interface Bootstrap { estado: "ativo" | "expirado" | "revogado"; versao: string; cfg: Cfg }
declare global { interface Window { __BT__?: Bootstrap } }
