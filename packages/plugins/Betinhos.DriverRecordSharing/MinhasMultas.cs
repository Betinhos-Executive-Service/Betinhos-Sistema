using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Betinhos.DriverRecordSharing
{
    // Estado mínimo de uma multa lido do Dataverse para a lista "Minhas multas" do App Motoristas.
    public sealed class LinhaMinhaMulta
    {
        public Guid Id;
        public string Auto, Placa, Local, Infracao;
        public DateTime? DataHora;
        public int Status;
        public int? Responsavel, Canal;
        public DateTime? ContestadaEm, DataIndicacao, AceiteEm, AceiteDeclaradoEm, DataParaIndicar, DataAviso, EncerradaEm, CanceladaEm;
        public bool RecursoPendente;
        public Guid? TermoVigenteId, UltimoTermoId;
        public int? TermoVigenteStatus, UltimoTermoStatus;
        public List<MinhaParcela> Parcelas = new List<MinhaParcela>();
    }

    public sealed class MinhaParcela
    {
        public int Numero;
        public string Competencia;
        public decimal Valor;
        public string Status; // prevista | descontada | cancelada
    }

    // Multa como o app mostra. Sem o valor da guia: o valor só aparece no termo e nas parcelas.
    public sealed class MinhaMulta
    {
        public Guid Id;
        public string Auto, Placa, DataHora, Local, Infracao, Grupo, Situacao, Acao, TermoStatus, PrazoAceite, AceiteDeclaradoEm;
        public Guid? TermoId;
        public List<MinhaParcela> Parcelas = new List<MinhaParcela>();
        internal string FimEm; // só para ordenar o histórico

        public Dictionary<string, object> ParaJson() => new Dictionary<string, object>
        {
            ["id"] = Id.ToString(),
            ["auto"] = Auto,
            ["placa"] = Placa,
            ["dataHora"] = DataHora,
            ["local"] = Local,
            ["infracao"] = Infracao,
            ["grupo"] = Grupo,
            ["situacao"] = Situacao,
            ["acao"] = Acao,
            ["termoId"] = TermoId?.ToString(),
            ["termoStatus"] = TermoStatus,
            ["prazoAceite"] = PrazoAceite,
            ["aceiteDeclaradoEm"] = AceiteDeclaradoEm,
            ["parcelas"] = Parcelas.Select(p => new Dictionary<string, object>
            {
                ["numero"] = p.Numero, ["competencia"] = p.Competencia, ["valor"] = p.Valor, ["status"] = p.Status,
            }).ToList(),
        };
    }

    public static class MinhasMultas
    {
        private const int Identificar = 202410000, Indicar = 202410004, Recurso = 202410002, Acertar = 202410006, Encerrada = 202410005, Cancelada = 202410007;
        private const int Empresa = 100000001, Senatran = 100000000, TermoPendente = 100000000;

        public static List<MinhaMulta> Montar(IEnumerable<LinhaMinhaMulta> linhas, DateTime hoje)
        {
            var corte = hoje.Date.AddMonths(-12);
            var saida = new List<MinhaMulta>();
            foreach (var l in linhas)
            {
                var fechada = l.Status == Encerrada || l.Status == Cancelada;
                var fimEm = l.EncerradaEm ?? l.CanceladaEm;
                if (fechada && (fimEm == null || fimEm.Value.Date <= corte)) continue;
                if (l.Responsavel == Empresa && !(fechada && (l.DataAviso != null || l.UltimoTermoId != null))) continue;
                if (l.Status == Identificar && l.ContestadaEm == null) continue;
                saida.Add(Converter(l));
            }
            return saida
                .OrderBy(m => Ordem(m.Grupo))
                .ThenBy(m => m.Grupo == "precisa" ? (m.PrazoAceite ?? "9999") : "")
                .ThenByDescending(m => m.Grupo == "encerrada" ? m.FimEm : m.DataHora, StringComparer.Ordinal)
                .ToList();
        }

        private static int Ordem(string grupo) => grupo == "precisa" ? 0 : grupo == "andamento" ? 1 : 2;

        private static MinhaMulta Converter(LinhaMinhaMulta l)
        {
            var fechada = l.Status == Encerrada || l.Status == Cancelada;
            var fimEm = l.EncerradaEm ?? l.CanceladaEm;
            var termoPendente = l.TermoVigenteId != null && l.TermoVigenteStatus == TermoPendente;
            var aceitePendente = l.Status == Indicar && l.Canal == Senatran && l.DataIndicacao != null && l.AceiteEm == null && l.AceiteDeclaradoEm == null;
            var previstas = l.Parcelas.Count(p => p.Status == "prevista");
            var vigentes = l.Parcelas.Count(p => p.Status != "cancelada");
            var descontadas = l.Parcelas.Count(p => p.Status == "descontada");

            string grupo = fechada ? "encerrada" : "andamento", acao = null, situacao, prazo = null;
            if (l.Responsavel == Empresa) { grupo = "encerrada"; situacao = "Empresa assumiu"; }
            else if (termoPendente) { grupo = "precisa"; acao = "assinar"; situacao = "Assine o termo da multa"; }
            else if (aceitePendente) { grupo = "precisa"; acao = "aceite"; situacao = "Aceite a indicação na CNH Digital"; prazo = Dia(l.DataParaIndicar); }
            else if (l.Status == Cancelada) situacao = "Cancelada";
            else if (l.Status == Encerrada)
            {
                // Com parcelas previstas o desconto ainda corre: continua em andamento.
                if (previstas > 0) { grupo = "andamento"; situacao = "Descontando " + descontadas.ToString(CultureInfo.InvariantCulture) + " de " + vigentes.ToString(CultureInfo.InvariantCulture); }
                else situacao = "Encerrada";
            }
            else if (l.Status == Identificar) situacao = "Contestação em análise";
            else if (l.Status == Recurso || l.RecursoPendente) situacao = "Em recurso";
            else if (l.Status == Indicar) situacao = l.DataIndicacao == null || l.AceiteDeclaradoEm == null ? "Aguardando a indicação no órgão" : "Aceite em conferência";
            else if (l.Status == Acertar) situacao = "Aguardando o lançamento na folha";
            else situacao = "Aguardando o pagamento";

            var termoId = l.TermoVigenteId ?? l.UltimoTermoId;
            var termoStatus = l.TermoVigenteId != null ? l.TermoVigenteStatus : l.UltimoTermoStatus;
            return new MinhaMulta
            {
                Id = l.Id, Auto = l.Auto, Placa = l.Placa, Local = l.Local, Infracao = l.Infracao,
                DataHora = l.DataHora?.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture),
                Grupo = grupo, Situacao = situacao, Acao = acao, PrazoAceite = prazo,
                AceiteDeclaradoEm = Dia(l.AceiteDeclaradoEm),
                TermoId = termoId, TermoStatus = StatusTermo(termoId == null ? null : termoStatus),
                Parcelas = l.Parcelas.OrderBy(p => p.Numero).ToList(),
                FimEm = Dia(fimEm),
            };
        }

        private static string Dia(DateTime? d) => d?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        private static string StatusTermo(int? s)
        {
            switch (s)
            {
                case 100000000: return "pendente";
                case 100000001: return "assinado";
                case 100000002: return "contestado";
                case 100000003: return "expirado";
                case 100000004: return "cancelado";
                default: return null;
            }
        }
    }
}
