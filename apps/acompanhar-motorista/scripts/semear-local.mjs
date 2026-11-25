// Grava links de exemplo no KV local do `wrangler dev` (.wrangler/state) para testar a página sem a Operacional.
// Uso: node scripts/semear-local.mjs  (depois abra http://127.0.0.1:36489/r/<id>). Ids fixos, listados ao final.
import { gravarTrackLocal } from "./kv-local.mjs";

const expiraEm = new Date(Date.now() + 12 * 3600e3).toISOString();
const horarioAgendado = new Date(Date.now() + 20 * 60000).toISOString();
const saida = { lat: -23.5614, lon: -46.6559, label: "Av. Paulista, 1000", rotuloLimpo: true, area: null };
const parada = { lat: -23.5700, lon: -46.6900, label: "Rua Oscar Freire, 900", rotuloLimpo: true, area: null };
const destino = { lat: -23.6267, lon: -46.6554, label: "Aeroporto de Congonhas", rotuloLimpo: true, area: null };
const etapa = (tipo, p) => ({ tipo, lat: p.lat, lon: p.lon, rotulo: p.label, rotuloLimpo: true, area: null });
const base = { vehicleId: "veic-mock", placa: "MOCK123", corVeiculo: "Preto", modeloVeiculo: "Corolla Altis", titulo: "Embarque OS-10001", horarioAgendado, expiraEm, criadoPor: "semente-local",
  motorista: { nome: "Carlos", telefone: "(11) 98765-4321", temFoto: false }, veiculoTemFoto: false };

// Portal de passageiros: o hash casa com o flow falso do mock (CADASTRO_FLOW_URL_DEV no .dev.vars). Valores fictícios.
const cadastro = { cadastroHash: "d".repeat(64), cadastroAmbiente: "dev" };
const aeroporto = { lat: -23.4356, lon: -46.4731, label: "Aeroporto Internacional de Guarulhos · Terminal 2", rotuloLimpo: true, area: null };
const agendado = new Date(Date.now() + 6 * 3600e3).toISOString();

const links = {
  DevPassagei1: { ...base, ...cadastro, modo: "completo", titulo: "Embarque OS-10008", destino: saida, destinoFinal: destino, etapas: [etapa("saida", saida), etapa("destino", destino)] },
  DevPaxConcl1: { ...base, ...cadastro, modo: "completo", titulo: "Embarque OS-10009", concluidoPor: "dataverse", destino: saida, destinoFinal: destino, etapas: [etapa("saida", saida), etapa("destino", destino)] },
  DevAgendado1: { ...base, ...cadastro, modo: "completo", titulo: "Embarque OS-10010", horarioAgendado: agendado, destino: saida, destinoFinal: destino, etapas: [etapa("saida", saida), etapa("destino", destino)] },
  DevCompleto1: { ...base, modo: "completo", destino: saida, destinoFinal: destino, etapas: [etapa("saida", saida), etapa("destino", destino)] },
  DevParadas01: { ...base, modo: "completo", titulo: "Embarque OS-10002", destino: saida, destinoFinal: destino, etapas: [etapa("saida", saida), etapa("parada", parada), etapa("destino", destino)] },
  DevSimples01: { ...base, modo: "simples", titulo: "Embarque OS-10003", motivoSimples: "etapa sem endereço", destino: saida, destinoFinal: null, etapas: [] },
  DevSemNome01: { ...base, modo: "completo", titulo: "Embarque OS-10004", motorista: null, destino: saida, destinoFinal: destino, etapas: [etapa("saida", saida), etapa("destino", destino)] },
  DevRevogar01: { ...base, modo: "completo", titulo: "Embarque OS-10005", destino: saida, destinoFinal: destino, etapas: [etapa("saida", saida), etapa("destino", destino)] },
  DevConcluir1: { ...base, modo: "completo", titulo: "Embarque OS-10006", destino: saida, destinoFinal: destino, etapas: [etapa("saida", saida), etapa("destino", destino)] },
  DevFluxo0001: { ...base, modo: "completo", titulo: "Embarque OS-10007", destino: saida, destinoFinal: destino, etapas: [etapa("saida", saida), etapa("destino", destino)] },
  // Fase 2: sem motorista (em definição) e terceiro sem rastreador (sem mapa).
  DevDefinica1: { ...base, ...cadastro, vehicleId: null, placa: null, corVeiculo: null, modeloVeiculo: null, motorista: null, modo: "completo", titulo: "Embarque OS-10011", destino: saida, destinoFinal: destino, etapas: [etapa("saida", saida), etapa("destino", destino)] },
  // Embarque em aeroporto (fictício): faixa com "Seja bem-vindo" e título de desembarque quando o motorista chega.
  DevAeroport1: { ...base, ...cadastro, modo: "completo", titulo: "Embarque OS-10013", destino: aeroporto, destinoFinal: destino, etapas: [etapa("saida", aeroporto), etapa("destino", destino)] },
  DevSemRastr1: { ...base, ...cadastro, vehicleId: null, placa: "TER1A23", modo: "completo", titulo: "Embarque OS-10012", destino: saida, destinoFinal: destino, etapas: [etapa("saida", saida), etapa("destino", destino)] },
  ["a".repeat(64)]: { vehicleId: "veic-mock", placa: "MOCK123", titulo: "Link antigo", destino: { ...saida, label: "13:40 - FULANO - Av. Paulista, 1000 - Bela Vista" }, destinoFinal: destino, destinoTentadoEm: "x", horarioAgendado, expiraEm },
};
for (const [id, t] of Object.entries(links)) { gravarTrackLocal(id, t); console.log(`track:${id}`); }
console.log("\nCenários: " + Object.keys(links).map((id) => `http://127.0.0.1:36489/r/${id}`).join("\n          "));
