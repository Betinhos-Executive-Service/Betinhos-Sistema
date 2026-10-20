using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Cr40f.Frota.Plugin;

/// <summary>
/// Porte de apps/shell/src/pages/frota/domain/alertas.ts e da parte proativa de pendencias.ts/preventiva.ts.
/// Tipos: prioridade, reincidencia, preventiva, agendada (só vencida), custo, hodometro. A paridade é conferida pelo
/// fixture Fixtures/paridade.json, lido também por apps/shell/src/pages/frota/domain/paridade.test.ts.
/// </summary>
public static class Regras
{
    private static readonly CultureInfo PtBr = new("pt-BR");
    private static readonly int[] Anuladas = { Codigos.Cancelado, Codigos.Reprovado };
    public static readonly string[] Ordem = { "prioridade", "reincidencia", "preventiva", "agendada", "custo", "hodometro" };
    private static readonly int[] EmAndamento = { Codigos.Solicitado, Codigos.Aprovado, Codigos.Programado };

    public static Resultado Avaliar(DadosFrota dados, string hoje, DateTime agoraUtc)
    {
        var lista = new List<Pendencia>();
        foreach (var m in dados.Manutencoes)
        {
            var parada = PrioridadeParada(m, hoje);
            if (parada is int dias)
                lista.Add(new Pendencia { Tipo = "prioridade", Id = m.Id, VeiculoId = m.VeiculoId, Placa = m.VeiculoLabel, ManutencaoId = m.Id, Titulo = m.Descricao, Detalhe = $"{(m.Status == Codigos.Solicitado ? "Aguardando aprovação" : "Aprovada sem data")} há {dias} dias" });
            else if ((m.Status == Codigos.Aprovado || m.Status == Codigos.Programado) && m.AgendarPara != null && Dias(hoje, m.AgendarPara) < 0)
                lista.Add(new Pendencia { Tipo = "agendada", Id = m.Id, VeiculoId = m.VeiculoId, Placa = m.VeiculoLabel, ManutencaoId = m.Id, Titulo = m.Descricao, Detalhe = $"Agendada para {Br(m.AgendarPara)} e ainda não realizada" });
        }
        lista.AddRange(Reincidencias(dados.Manutencoes, hoje));
        lista.AddRange(Preventivas(dados, hoje));
        lista.AddRange(CustoForaDaCurva(dados.Veiculos, dados.Manutencoes, hoje));
        lista.AddRange(HodometrosAtrasados(dados.Veiculos, agoraUtc));
        // Ordem do e-mail e do agente: o que pede decisão primeiro (OrderBy é estável, mantém a ordem dentro do tipo).
        var ordenada = lista.OrderBy(p => Array.IndexOf(Ordem, p.Tipo)).ToList();
        return new Resultado { Hoje = hoje, Total = ordenada.Count, Pendencias = ordenada };
    }

    public static int? PrioridadeParada(Manutencao m, string hoje)
    {
        if ((m.Grau ?? 0) < Limiares.PrioridadeGrauMinimo) return null;
        var dias = Dias(m.CriadoEm, hoje);
        if (m.Status == Codigos.Solicitado && dias > Limiares.SolicitadoParadoDias) return dias;
        if (m.Status == Codigos.Aprovado && m.AgendarPara == null && dias > Limiares.AprovadoSemDataDias) return dias;
        return null;
    }

    private static string DiaDe(Manutencao m) => m.DataManutencao ?? m.CriadoEm;

    public static IEnumerable<Pendencia> Reincidencias(IEnumerable<Manutencao> manutencoes, string hoje)
    {
        var grupos = manutencoes
            .Where(m => m.VeiculoId != null && !(m.Status is int s && Anuladas.Contains(s)))
            .SelectMany(m => m.Servicos.Distinct().Select(servico => (m, servico)))
            .GroupBy(x => (x.m.VeiculoId, x.servico));
        foreach (var grupo in grupos)
        {
            foreach (var (vezes, janela) in new[] { (Limiares.ReincidenciaCurtaVezes, Limiares.ReincidenciaCurtaDias), (Limiares.ReincidenciaLongaVezes, Limiares.ReincidenciaLongaDias) })
            {
                var naJanela = grupo.Select(x => x.m).Where(m => { var d = Dias(DiaDe(m), hoje); return d >= 0 && d <= janela; }).ToList();
                if (naJanela.Count < vezes) continue;
                var custo = naJanela.Sum(m => m.Valor ?? 0);
                var primeira = naJanela[0];
                var periodo = janela == 365 ? "12 meses" : $"{janela} dias";
                var gasto = custo > 0 ? $" · {custo.ToString("C", PtBr)} gastos" : "";
                yield return new Pendencia
                {
                    Tipo = "reincidencia", Id = $"reinc:{grupo.Key.VeiculoId}:{grupo.Key.servico}", VeiculoId = grupo.Key.VeiculoId, Placa = primeira.VeiculoLabel,
                    Titulo = $"{naJanela.Count}ª vez: {Catalogo.Rotulo(grupo.Key.servico)}",
                    Detalhe = $"{naJanela.Count} vezes em {periodo}{gasto}. Dá para resolver a causa raiz?",
                };
                break;
            }
        }
    }

    public static IEnumerable<Pendencia> Preventivas(DadosFrota dados, string hoje)
    {
        var itens = dados.Itens.Where(i => i.Ativo).ToList();
        foreach (var v in dados.Veiculos.Where(v => v.Status == Codigos.VeiculoAtivo && v.Categoria == Codigos.Proprio))
        {
            var doVeiculo = dados.Manutencoes.Where(m => m.VeiculoId == v.Id).ToList();
            var kms = doVeiculo.Where(m => m.Km != null).Select(m => m.Km!.Value).ToList();
            var kmAtual = v.Hodometro ?? (kms.Count > 0 ? kms.Max() : (decimal?)null);
            foreach (var item in itens)
            {
                if (item.Servico is int srv && doVeiculo.Any(m => m.Status is int s && EmAndamento.Contains(s) && m.Servicos.Contains(srv))) continue;
                var baseline = dados.Baselines.FirstOrDefault(b => b.VeiculoId == v.Id && b.ItemId == item.Id);
                var (kmUltima, dataUltima) = UltimaExecucao(item, doVeiculo, baseline);
                var kmProxima = kmUltima != null && item.IntervaloKm != null ? kmUltima + item.IntervaloKm : null;
                var dataProxima = dataUltima != null && item.IntervaloMeses != null ? AddMonths(dataUltima, item.IntervaloMeses.Value) : null;
                var faltamKm = kmProxima != null && kmAtual != null ? kmProxima - kmAtual : null;
                int? faltamDias = dataProxima != null ? Dias(hoje, dataProxima) : null;
                var vencido = faltamKm < 0 || faltamDias < 0;
                var aVencer = !vencido && (faltamKm <= item.AvisoKm || faltamDias <= item.AvisoDias);
                if (!vencido && !aVencer) continue;
                var partes = new List<string>();
                if (faltamKm != null) partes.Add(faltamKm < 0 ? $"vencida há {(-faltamKm.Value).ToString("N0", PtBr)} km" : $"faltam {faltamKm.Value.ToString("N0", PtBr)} km");
                if (faltamDias != null) partes.Add(faltamDias < 0 ? $"vencida há {-faltamDias} dias" : $"vence em {Br(dataProxima!)}");
                yield return new Pendencia { Tipo = "preventiva", Id = $"{v.Id}:{item.Id}", VeiculoId = v.Id, Placa = v.Placa, Titulo = $"{item.Nome} · {v.Placa}", Detalhe = (vencido ? "Vencida: " : "A vencer: ") + string.Join(", ", partes) };
            }
        }
    }

    private static (decimal? km, string? data) UltimaExecucao(ItemPlano item, List<Manutencao> doVeiculo, Baseline? baseline)
    {
        Manutencao? melhor = null;
        if (item.Servico is int srv)
            foreach (var m in doVeiculo.Where(m => m.Status == Codigos.Realizado && m.Servicos.Contains(srv)))
                if (melhor == null || string.CompareOrdinal(DiaDe(m), DiaDe(melhor)) > 0) melhor = m;
        if (melhor != null)
        {
            var dia = DiaDe(melhor);
            var baselineValida = baseline != null && (baseline.Data == null || string.CompareOrdinal(baseline.Data, dia) >= 0) ? baseline : null;
            return (melhor.Km ?? baselineValida?.Km, dia);
        }
        if (baseline != null && (baseline.Km != null || baseline.Data != null)) return (baseline.Km, baseline.Data);
        return (null, null);
    }

    private static bool Ativo(Veiculo v) => v.Status != Codigos.VeiculoVendido;

    public static IEnumerable<Pendencia> CustoForaDaCurva(List<Veiculo> veiculos, List<Manutencao> manutencoes, string hoje)
    {
        var porVeiculo = manutencoes
            .Where(m => m.Status == Codigos.Realizado && m.VeiculoId != null && m.Valor is > 0)
            .Where(m => { var d = Dias(DiaDe(m), hoje); return d >= 0 && d <= Limiares.CustoJanelaDias; })
            .GroupBy(m => m.VeiculoId!).ToDictionary(g => g.Key, g => g.Sum(m => m.Valor!.Value));
        decimal CustoDe(Veiculo v) => porVeiculo.TryGetValue(v.Id, out var c) ? c : 0;
        var custos = veiculos.Where(Ativo).Select(CustoDe).Where(c => c > 0).OrderBy(c => c).ToList();
        if (custos.Count < Limiares.CustoMinimoVeiculos) yield break;
        var meio = custos.Count / 2;
        var mediana = custos.Count % 2 == 1 ? custos[meio] : (custos[meio - 1] + custos[meio]) / 2;
        foreach (var v in veiculos.Where(Ativo).Where(v => CustoDe(v) > mediana * Limiares.CustoFatorMediana).OrderByDescending(CustoDe))
            yield return new Pendencia { Tipo = "custo", Id = $"custo:{v.Id}", VeiculoId = v.Id, Placa = v.Placa, Titulo = $"Custo alto: {v.Placa}", Detalhe = $"{CustoDe(v).ToString("C", PtBr)} em 90 dias (mediana da frota {mediana.ToString("C", PtBr)}). Avaliar troca ou venda?" };
    }

    public static IEnumerable<Pendencia> HodometrosAtrasados(List<Veiculo> veiculos, DateTime agoraUtc)
    {
        foreach (var v in veiculos.Where(v => Ativo(v) && !string.IsNullOrEmpty(v.HodometroEm)))
        {
            if (!DateTime.TryParse(v.HodometroEm, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var em)) continue;
            var horas = (int)Math.Floor((agoraUtc - em).TotalHours);
            if (horas <= Limiares.HodometroHoras) continue;
            yield return new Pendencia { Tipo = "hodometro", Id = $"hod:{v.Id}", VeiculoId = v.Id, Placa = v.Placa, Titulo = $"Hodômetro parado: {v.Placa}", Detalhe = $"Última leitura do Infleet há {(horas >= 72 ? $"{horas / 24} dias" : $"{horas} h")}" };
        }
    }

    public static int Dias(string de, string ate) => (int)Math.Round((Dia(ate) - Dia(de)).TotalDays);

    private static DateTime Dia(string valor) => DateTime.ParseExact(valor.Substring(0, 10), "yyyy-MM-dd", CultureInfo.InvariantCulture);

    public static string AddMonths(string dia, int meses) => Dia(dia).AddMonths(meses).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string Br(string dia) => Dia(dia).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
}
