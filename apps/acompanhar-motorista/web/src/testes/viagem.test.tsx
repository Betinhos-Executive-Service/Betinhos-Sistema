import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estadoVivo, idadePosicao, sinalVelho } from "../status";
import { fazTraduz } from "../i18n";
import { decimal, km } from "../formato";

vi.mock("../bt", () => ({ BT: { estado: "ativo", versao: "0.0.46", cfg: { aoVivo: false, completo: true } }, DEBUG: false, INTERVALO_MS: 15000, SEM_CONEXAO_MS: 60000, POSICAO_VELHA_MIN: 15, EASE_QUINT: "", reduzMovimento: () => false }));
const { useViagem } = await import("../hooks/useViagem");

const reload = vi.fn();
beforeEach(() => {
  sessionStorage.clear(); reload.mockClear();
  vi.stubGlobal("location", { ...window.location, reload, pathname: "/r/aB3dE5gH7jK8", search: "" });
});
afterEach(() => vi.unstubAllGlobals());
const resposta = (d: object) => vi.fn().mockResolvedValue(new Response(JSON.stringify(d), { status: 200 }));

describe("useViagem", () => {
  it("recarrega uma vez quando o /dados traz versão nova do Worker", async () => {
    vi.stubGlobal("fetch", resposta({ fase: "a_caminho", versao: "0.0.47" }));
    renderHook(() => useViagem());
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem("recarregou:0.0.47")).toBe("1");
  });
  it("já recarregou para essa versão: mostra os dados em vez de entrar em laço", async () => {
    sessionStorage.setItem("recarregou:0.0.47", "1");
    vi.stubGlobal("fetch", resposta({ fase: "a_caminho", versao: "0.0.47" }));
    const { result } = renderHook(() => useViagem());
    await waitFor(() => expect(result.current.dados?.fase).toBe("a_caminho"));
    expect(reload).not.toHaveBeenCalled();
  });
  it("mesma versão: só mostra os dados e calcula o desvio do relógio do servidor", async () => {
    vi.stubGlobal("fetch", resposta({ fase: "em_viagem", versao: "0.0.46", servidorEm: new Date(Date.now() + 5000).toISOString() }));
    const { result } = renderHook(() => useViagem());
    await waitFor(() => expect(result.current.dados?.fase).toBe("em_viagem"));
    expect(result.current.desvio).toBeGreaterThan(3000);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("status e formato", () => {
  const t = fazTraduz("pt");
  it("sinal velho: posição antiga ou sem sinal vira aviso; em viagem recente não", () => {
    const base = { posicao: { lat: 1, lon: 1 }, comSinal: true };
    expect(sinalVelho({ ...base, fase: "em_viagem" }, 0)).toBe(false);
    expect(sinalVelho({ ...base, fase: "a_caminho" }, 20 * 60000)).toBe(true);
    expect(sinalVelho({ fase: "a_caminho" }, 0)).toBe(true);
  });
  it("ao vivo: sem posição fica oculto; com rastreador sem sinal avisa", () => {
    expect(estadoVivo(null, t, 0, 0, Date.now()).oculto).toBe(true);
    const d = { fase: "a_caminho", posicao: { lat: 1, lon: 1, atualizadoEm: new Date().toISOString() } };
    expect(idadePosicao(d, 0, Date.now())).toBeLessThan(5000);
    expect(estadoVivo({ ...d, comSinal: false } as any, t, 0, 0, Date.now()).texto).toBeTruthy();
  });
  it("formatos por idioma: vírgula em pt/es e ponto em en; metros abaixo de 1 km", () => {
    expect(decimal("pt", "1.5")).toBe("1,5");
    expect(decimal("en", "1.5")).toBe("1.5");
    expect(km("pt", 0.4)).toBe("400 m");
    expect(km("pt", 12.34)).toBe("12,3 km");
  });
});
