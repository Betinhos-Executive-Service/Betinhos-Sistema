// Postos próximos no Dataverse (new_postocombustivel) e o conjunto fictício do modo local.
import { hasDataverseRuntime, retrieveMultiple } from "../../data/dataverse/cliente.ts";
import { DATAVERSE } from "../../data/dataverse/entidades.ts";
import { consultaPostosNaArea, mapearPosto, type Area, type Posto } from "./postosProximos.ts";

const POSTO = (n: number, nome: string, endereco: string, lat: number, lon: number): Posto => ({ id: `mock-posto-${n}`, nome, endereco, lat, lon });

// Nomes genéricos, coordenadas na região de São José dos Campos.
export const POSTOS_MOCK: Posto[] = [
  POSTO(1, "Posto Exemplo Centro", "Avenida Exemplo, 100 - Centro - São José dos Campos/SP", -23.1921, -45.8869),
  POSTO(2, "Posto Exemplo Jardim Satélite", "Rua Exemplo, 250 - Jardim Satélite - São José dos Campos/SP", -23.2287, -45.8933),
  POSTO(3, "Auto Posto Exemplo Dutra", "Rodovia Presidente Dutra, km 150 - São José dos Campos/SP", -23.2075, -45.8412),
  POSTO(4, "Posto Exemplo Aquarius", "Avenida Exemplo, 800 - Jardim Aquarius - São José dos Campos/SP", -23.2174, -45.9068),
  POSTO(5, "Posto Exemplo Vila Industrial", "Rua Exemplo, 45 - Vila Industrial - São José dos Campos/SP", -23.1768, -45.8702),
  POSTO(6, "Auto Posto Exemplo Colinas", "Avenida Exemplo, 1200 - Colinas - São José dos Campos/SP", -23.1649, -45.9015),
  POSTO(7, "Posto Exemplo Eugênio de Melo", "Estrada Exemplo, 30 - Eugênio de Melo - São José dos Campos/SP", -23.1581, -45.7867),
  POSTO(8, "Posto Exemplo Urbanova", "Avenida Exemplo, 560 - Urbanova - São José dos Campos/SP", -23.1523, -45.9264),
  POSTO(9, "Auto Posto Exemplo Santana", "Rua Exemplo, 90 - Santana - São José dos Campos/SP", -23.1712, -45.8855),
  POSTO(10, "Posto Exemplo Jacareí", "Avenida Exemplo, 700 - Centro - Jacareí/SP", -23.3053, -45.9658),
  POSTO(11, "Posto Exemplo Jardim das Indústrias", "Avenida Exemplo, 2100 - Jardim das Indústrias - São José dos Campos/SP", -23.2392, -45.9211),
  POSTO(12, "Auto Posto Exemplo Putim", "Estrada Exemplo, 10 - Putim - São José dos Campos/SP", -23.2006, -45.8225)
];

const dentro = (posto: Posto, { sul, norte, oeste, leste }: Area) => posto.lat >= sul && posto.lat <= norte && posto.lon >= oeste && posto.lon <= leste;

export async function carregarPostosNaArea(area: Area): Promise<Posto[]> {
  if (!hasDataverseRuntime()) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return POSTOS_MOCK.filter((posto) => dentro(posto, area));
  }
  const { entities } = await retrieveMultiple(DATAVERSE.postosCombustivel, consultaPostosNaArea(area));
  return entities.map((linha) => mapearPosto(linha as Record<string, unknown>)).filter((posto): posto is Posto => posto !== null);
}
