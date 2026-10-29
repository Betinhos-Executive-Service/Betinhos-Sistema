// Consultas OData da tela, idênticas às do WebResource (mesmos $select, $filter e $orderby). Só montam texto:
// a IO fica em data/dataverse.ts. Os caminhos são relativos a /api/data/v9.2 e usam o entity set.
import { CONFIG } from "./config";
import { cleanId } from "./payloads";
import { toODataDate } from "./utils";

const F = CONFIG.fields;
const S = CONFIG.entitySets;

export const SWAP_SELECT = [
  F.trocaCarro.id, F.trocaCarro.inicioJanela, F.trocaCarro.fimJanela, F.trocaCarro.status, F.trocaCarro.tipo, F.trocaCarro.observacao,
  F.trocaCarro.lookupMotorista1, F.trocaCarro.lookupMotorista2, F.trocaCarro.lookupVeiculo1, F.trocaCarro.lookupVeiculo2, F.trocaCarro.lookupLocalBase,
  F.trocaCarro.modoJanela, F.trocaCarro.local, F.trocaCarro.alertaJanela,
  F.trocaCarro.lookupM1DepoisDe, F.trocaCarro.lookupM1AntesDe, F.trocaCarro.lookupM2DepoisDe, F.trocaCarro.lookupM2AntesDe
].join(",");

export function driversPath(): string {
  const f = F.funcionario;
  return `${S.funcionario}?$select=${f.id},${f.nome},${f.apelido},${f.emailMicrosoft},${f.tipoVinculo},statecode&$filter=statecode eq 0`;
}

/** Usuários ativos do Dataverse para até 12 e-mails (o `'` vira `''`). */
export function systemUsersPath(emails: string[]): string {
  const clauses = emails.map((email) => `internalemailaddress eq '${email.replace(/'/g, "''")}'`);
  return `systemusers?$select=internalemailaddress&$filter=isdisabled eq false and (${clauses.join(" or ")})`;
}

export function vehiclesPath(): string {
  const f = F.veiculo;
  const select = [f.id, f.modelo, f.cor, f.placa, f.propriedade, f.blindado, f.fornecedorLocacao, f.fimLocacao, "statecode"].join(",");
  return `${S.veiculo}?$select=${select}&$filter=statecode eq 0`;
}

export function locationsPath(): string {
  const f = F.localBase;
  return `${S.localBase}?$select=${[f.id, f.nome, f.endereco, f.linkMapa].join(",")}&$filter=statecode eq 0&$orderby=${f.nome} asc`;
}

/** Janela fixa de serviços: 00:00 de hoje −7 dias até 00:00 de hoje +8 dias (horário local). */
export function servicesWindow(now: Date): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + CONFIG.ranges.servicesStartOffsetDays);
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + CONFIG.ranges.servicesEndOffsetDays + 1);
  return { start, end };
}

export function servicesPath(now: Date): string {
  const f = F.reserva;
  const select = [
    f.id, f.readableId, f.dataSaida, f.previsaoRetorno, f.statusOperacao,
    f.statusFaturamento, f.tipoServico, f.tipoVeiculo, f.destino, f.enderecoSaida,
    f.obsOperacao, f.obsInterna, f.paxView, f.trajeto, f.perfilPassageiro,
    f.email, f.receber, f.formaPagamento, f.cotacao, f.cr, f.categoriaItem,
    f.lookupCliente, f.lookupSolicitante, f.lookupMotorista, f.lookupVeiculo
  ].join(",");
  const { start, end } = servicesWindow(now);
  const filter = `${f.dataSaida} ge ${toODataDate(start)} and ${f.dataSaida} lt ${toODataDate(end)}`;
  return `${S.reserva}?$select=${select}&$filter=${filter}&$orderby=${f.dataSaida} asc`;
}

/** Vínculos de passageiros de até 10 reservas. */
export function passengerLinksPath(serviceIds: string[]): string {
  const f = F.servicoPassageiro;
  const select = [f.id, f.ordem, f.endereco, f.lookupGeral, f.lookupPassageiro].join(",");
  const filter = serviceIds.map((serviceId) => `${f.lookupGeral} eq ${String(serviceId).replace(/[{}]/g, "")}`).join(" or ");
  return `${S.servicoPassageiro}?$select=${select}&$filter=${filter}`;
}

/** Só trocas ativas Programadas ou Confirmadas. */
export function swapsPath(): string {
  const status = F.trocaCarro.status;
  return `${S.trocaCarro}?$select=${SWAP_SELECT}&$filter=(statecode eq 0) and (${status} eq 202410000 or ${status} eq 100000001)`;
}

export function swapPath(id: string): string {
  return `${S.trocaCarro}(${cleanId(id)})?$select=${SWAP_SELECT}`;
}

/** Posses ativas abertas ou encerradas nos últimos 365 dias. */
export function possessionsPath(now: Date): string {
  const f = F.posseVeiculo;
  const select = [f.id, f.inicio, f.fim, f.lookupMotorista, f.lookupVeiculo, f.lookupLocalBase].join(",");
  const historyStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
  return `${S.posseVeiculo}?$select=${select}&$filter=statecode eq 0 and (${f.fim} eq null or ${f.fim} ge ${historyStart})&$orderby=${f.inicio} asc`;
}
