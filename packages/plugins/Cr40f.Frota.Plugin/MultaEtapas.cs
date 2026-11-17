using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Runtime.Serialization;
using System.Text.RegularExpressions;

namespace Cr40f.Frota.Plugin;

/// <summary>Códigos de cr40f_multas, iguais a apps/shell/src/pages/frota/data/schema.ts (MULTA, RESPONSAVEL, MOTIVO_EMPRESA, CANAL).</summary>
public static class MultaCodigos
{
    public const int Identificar = 202410000, Indicar = 202410004, Pagar = 202410001, Acertar = 202410006;
    public const int Encerrada = 202410005, Recurso = 202410002, Descontado = 202410003, Cancelada = 202410007;
    public const int Motorista = 100000000, Empresa = 100000001;
    public const int PrazoPerdido = 100000000, CulpaDaEmpresa = 100000001;
    public const int Senatran = 100000000, DsvDigital = 100000001, Prefeitura = 100000002;
}

public static class Passos
{
    public const string DefinirResponsavel = "DefinirResponsavel";
    public const string AvisarMotorista = "AvisarMotorista";
    public const string RegistrarIndicacao = "RegistrarIndicacao";
    public const string RegistrarAceite = "RegistrarAceite";
    public const string RegistrarPagamento = "RegistrarPagamento";
    public const string RegistrarAcerto = "RegistrarAcerto";
    public const string PrazoVencido = "PrazoVencido";
    public const string Cancelar = "Cancelar";
    public const string Recorrer = "Recorrer";
    public const string ResultadoRecurso = "ResultadoRecurso";
    public static readonly string[] Todos = { DefinirResponsavel, AvisarMotorista, RegistrarIndicacao, RegistrarAceite, RegistrarPagamento, RegistrarAcerto, PrazoVencido, Cancelar, Recorrer, ResultadoRecurso };
}

/// <summary>O que as regras leem e o passo muda. Datas em yyyy-MM-dd (dia de São Paulo). Espelho: MultaEstado de multaEtapas.ts.</summary>
[DataContract]
public sealed class MultaEstado
{
    [DataMember(Name = "status")] public int? Status { get; set; }
    [DataMember(Name = "responsavel")] public int? Responsavel { get; set; }
    [DataMember(Name = "motoristaId")] public string? MotoristaId { get; set; }
    [DataMember(Name = "motivoEmpresa")] public int? MotivoEmpresa { get; set; }
    [DataMember(Name = "dataParaIndicar")] public string? DataParaIndicar { get; set; }
    [DataMember(Name = "dataAviso")] public string? DataAviso { get; set; }
    [DataMember(Name = "canal")] public int? Canal { get; set; }
    [DataMember(Name = "dataIndicacao")] public string? DataIndicacao { get; set; }
    [DataMember(Name = "indicado")] public bool? Indicado { get; set; }
    [DataMember(Name = "aceiteEm")] public string? AceiteEm { get; set; }
    [DataMember(Name = "vencimento")] public string? Vencimento { get; set; }
    [DataMember(Name = "pagaEm")] public string? PagaEm { get; set; }
    [DataMember(Name = "valorPago")] public decimal? ValorPago { get; set; }
    [DataMember(Name = "competencia")] public string? Competencia { get; set; }
    [DataMember(Name = "acertoEm")] public string? AcertoEm { get; set; }
    [DataMember(Name = "encerradaEm")] public string? EncerradaEm { get; set; }
    [DataMember(Name = "canceladaEm")] public string? CanceladaEm { get; set; }
    [DataMember(Name = "motivoCancelamento")] public string? MotivoCancelamento { get; set; }
    [DataMember(Name = "recursoPendente")] public bool? RecursoPendente { get; set; }

    public MultaEstado Copia() => (MultaEstado)MemberwiseClone();
}

/// <summary>DadosJson da cr40f_PassoMulta. Textos fixos: responsavel motorista|empresa, motivo prazo-perdido|culpa-empresa,
/// canal senatran|dsv|prefeitura, acerto folha|empresa, resultado deferido|indeferido, competencia yyyy-MM.</summary>
[DataContract]
public sealed class DadosPasso
{
    [DataMember(Name = "responsavel")] public string? Responsavel { get; set; }
    [DataMember(Name = "motoristaId")] public string? MotoristaId { get; set; }
    [DataMember(Name = "motivo")] public string? Motivo { get; set; }
    [DataMember(Name = "canal")] public string? Canal { get; set; }
    [DataMember(Name = "data")] public string? Data { get; set; }
    [DataMember(Name = "valorPago")] public decimal? ValorPago { get; set; }
    [DataMember(Name = "competencia")] public string? Competencia { get; set; }
    [DataMember(Name = "acerto")] public string? Acerto { get; set; }
    [DataMember(Name = "indicou")] public bool? Indicou { get; set; }
    [DataMember(Name = "resultado")] public string? Resultado { get; set; }
    [DataMember(Name = "motivoTexto")] public string? MotivoTexto { get; set; }
}

/// <summary>Saída MultaJson da cr40f_PassoMulta; também usada pela tarefa e pelo e-mail.</summary>
[DataContract]
public sealed class MultaSituacao
{
    [DataMember(Name = "etapa", Order = 1)] public string Etapa { get; set; } = "";
    [DataMember(Name = "pendentes", Order = 2)] public List<string> Pendentes { get; set; } = new();
    [DataMember(Name = "proximoPasso", Order = 3)] public string ProximoPasso { get; set; } = "";
    [DataMember(Name = "proximoPrazo", Order = 4)] public string? ProximoPrazo { get; set; }
    [DataMember(Name = "prazoVencido", Order = 5)] public bool PrazoVencido { get; set; }
    [DataMember(Name = "aguardandoPenalidade", Order = 6)] public bool AguardandoPenalidade { get; set; }
}

/// <summary>
/// Regras da multa (spec §3 e §5.1). Espelho em apps/shell/src/pages/frota/domain/multaEtapas.ts; a paridade é conferida por
/// Fixtures/multa-etapas.json, lido pelos dois lados. Mudou aqui, mude lá e no fixture.
/// </summary>
public static class MultaEtapas
{
    public const string Identificar = "identificar", Indicar = "indicar", Pagar = "pagar", Acertar = "acertar";
    public const string Encerrada = "encerrada", Recurso = "recurso", Cancelada = "cancelada";
    private static readonly Regex DiaIso = new(@"^\d{4}-\d{2}-\d{2}$");
    private static readonly Regex MesIso = new(@"^\d{4}-(0[1-9]|1[0-2])(-01)?$");

    public static readonly IReadOnlyDictionary<string, string> RotuloPasso = new Dictionary<string, string>
    {
        [Passos.DefinirResponsavel] = "Definir o responsável",
        [Passos.AvisarMotorista] = "Avisar o motorista",
        [Passos.RegistrarIndicacao] = "Indicar no órgão",
        [Passos.RegistrarAceite] = "Conferir o aceite na CNH Digital",
        [Passos.RegistrarPagamento] = "Pagar a guia",
        [Passos.RegistrarAcerto] = "Acertar",
        [Passos.PrazoVencido] = "Prazo vencido: responder",
        [Passos.Cancelar] = "Cancelar",
        [Passos.Recorrer] = "Entrar com recurso",
        [Passos.ResultadoRecurso] = "Registrar o resultado do recurso",
    };

    public static readonly IReadOnlyDictionary<string, string> RotuloEtapa = new Dictionary<string, string>
    {
        [Identificar] = "1. Identificar o responsável", [Indicar] = "2. Indicar no órgão", [Pagar] = "3. Pagar", [Acertar] = "4. Acertar",
        [Encerrada] = "Encerrada", [Recurso] = "Em recurso", [Cancelada] = "Cancelada",
    };

    private static readonly IReadOnlyDictionary<string, string> Antes = new Dictionary<string, string>
    {
        [Passos.AvisarMotorista] = "Avise o motorista antes de registrar a indicação.",
        [Passos.RegistrarIndicacao] = "Registre a indicação antes do aceite.",
    };

    public static string Etapa(int? status) => status switch
    {
        MultaCodigos.Indicar => Indicar,
        MultaCodigos.Pagar => Pagar,
        MultaCodigos.Acertar => Acertar,
        MultaCodigos.Encerrada or MultaCodigos.Descontado => Encerrada,
        MultaCodigos.Recurso => Recurso,
        MultaCodigos.Cancelada => Cancelada,
        _ => Identificar,
    };

    public static bool Aberta(string etapa) => etapa != Encerrada && etapa != Cancelada;

    /// <summary>Responsável vazio (multas antigas) vale o motorista do lookup, inclusive os funcionários "Empresa" e "Locatário".</summary>
    public static int? ResponsavelEfetivo(MultaEstado m) => m.Responsavel ?? (string.IsNullOrEmpty(m.MotoristaId) ? null : MultaCodigos.Motorista);

    public static bool PrazoVencido(MultaEstado m, string hoje)
    {
        var etapa = Etapa(m.Status);
        return (etapa == Identificar || etapa == Indicar) && m.DataParaIndicar != null && string.CompareOrdinal(m.DataParaIndicar, hoje) < 0;
    }

    /// <summary>Indicação da Senatran registrada e ainda sem aceite na CNH Digital (mesma regra do passo RegistrarAceite).</summary>
    public static bool AceitePendente(MultaEstado m) => m.DataIndicacao != null && m.Canal == MultaCodigos.Senatran && m.AceiteEm == null;

    public static MultaSituacao Avaliar(MultaEstado m, string hoje)
    {
        var etapa = Etapa(m.Status);
        var s = new MultaSituacao
        {
            Etapa = etapa,
            PrazoVencido = PrazoVencido(m, hoje),
            ProximoPrazo = etapa == Identificar || etapa == Indicar ? m.DataParaIndicar : etapa == Pagar ? m.Vencimento : null,
        };
        if (s.PrazoVencido) s.Pendentes.Add(Passos.PrazoVencido);
        else switch (etapa)
        {
            case Identificar: s.Pendentes.Add(Passos.DefinirResponsavel); break;
            case Indicar:
                if (m.DataAviso == null) s.Pendentes.Add(Passos.AvisarMotorista);
                if (m.DataIndicacao == null || m.Canal == null) s.Pendentes.Add(Passos.RegistrarIndicacao);
                else if (AceitePendente(m)) s.Pendentes.Add(Passos.RegistrarAceite);
                break;
            case Pagar:
                if (m.Vencimento == null) s.AguardandoPenalidade = true;
                else s.Pendentes.Add(Passos.RegistrarPagamento);
                break;
            case Acertar: s.Pendentes.Add(Passos.RegistrarAcerto); break;
            case Recurso: s.Pendentes.Add(Passos.ResultadoRecurso); break;
        }
        s.ProximoPasso = s.Pendentes.Count > 0 ? RotuloPasso[s.Pendentes[0]]
            : s.AguardandoPenalidade ? "Aguardando penalidade"
            : etapa == Cancelada ? "Cancelada" : etapa == Encerrada ? "Encerrada" : "";
        return s;
    }

    public static string? Validar(MultaEstado m, string passo, DadosPasso d, string hoje)
    {
        if (!Passos.Todos.Contains(passo)) return $"Passo desconhecido: {passo}.";
        var s = Avaliar(m, hoje);
        if (s.PrazoVencido && passo != Passos.PrazoVencido) return "O prazo de indicação venceu. Responda se a multa foi indicada antes de seguir.";
        switch (passo)
        {
            case Passos.PrazoVencido:
                if (!s.PrazoVencido) return "O prazo de indicação ainda não venceu.";
                if (d.Indicou is not bool indicou) return "Responda se a multa foi indicada.";
                if (!indicou) return null;
                var ruim = CanalDe(d.Canal) == null ? "Escolha o canal da indicação." : DataRuim(d.Data, hoje, "Informe a data da indicação.");
                if (ruim != null) return ruim;
                // Sem responsável efetivo (multa nova no prazo vencido da etapa 1) a indicação precisa dizer quem foi indicado.
                return ResponsavelEfetivo(m) == null && string.IsNullOrWhiteSpace(d.MotoristaId) ? "Escolha o motorista que foi indicado." : null;
            case Passos.Cancelar:
                if (!Aberta(s.Etapa)) return "Esta multa já está encerrada.";
                var motivo = d.MotivoTexto?.Trim() ?? "";
                if (motivo.Length < 5) return "Escreva o motivo do cancelamento.";
                return motivo.Length > 2000 ? "O motivo do cancelamento passa de 2.000 caracteres." : null;
            case Passos.Recorrer:
                return s.Etapa == Identificar || s.Etapa == Indicar || s.Etapa == Pagar ? null : "Só dá para entrar com recurso antes do pagamento.";
        }
        if (s.Pendentes.Count == 0)
            return s.AguardandoPenalidade && passo == Passos.RegistrarPagamento
                ? "A penalidade ainda não chegou: grave o vencimento antes de registrar o pagamento."
                : "Este passo não vale para a etapa atual da multa. Recarregue a tela.";
        if (!s.Pendentes.Contains(passo)) return "Este passo não vale para a etapa atual da multa. Recarregue a tela.";
        if (s.Pendentes[0] != passo) return Antes.TryGetValue(s.Pendentes[0], out var antes) ? antes : "Siga a ordem dos passos.";
        switch (passo)
        {
            case Passos.DefinirResponsavel:
                if (d.Responsavel == "empresa") return null;
                if (d.Responsavel != "motorista") return "Escolha o responsável: motorista ou empresa.";
                return string.IsNullOrWhiteSpace(d.MotoristaId) ? "Escolha o motorista." : null;
            case Passos.AvisarMotorista:
                return string.IsNullOrWhiteSpace(d.Data) ? null : DataRuim(d.Data, hoje, "");
            case Passos.RegistrarIndicacao:
                return CanalDe(d.Canal) == null ? "Escolha o canal da indicação." : DataRuim(d.Data, hoje, "Informe a data da indicação.");
            case Passos.RegistrarAceite:
                return DataRuim(d.Data, hoje, "Informe a data do aceite.");
            case Passos.RegistrarPagamento:
                return DataRuim(d.Data, hoje, "Informe a data do pagamento.") ?? (d.ValorPago is decimal v && v > 0 ? null : "Informe o valor pago.");
            case Passos.RegistrarAcerto:
                if (d.Acerto == "folha") return d.Competencia != null && MesIso.IsMatch(d.Competencia) ? null : "Informe o mês do desconto.";
                if (d.Acerto == "empresa") return MotivoDe(d.Motivo) == null ? "Escolha o motivo de a empresa assumir." : null;
                return "Escolha: lancei na folha ou empresa assume.";
            case Passos.ResultadoRecurso:
                return d.Resultado == "deferido" || d.Resultado == "indeferido" ? null : "Escolha o resultado do recurso: deferido ou indeferido.";
        }
        return null;
    }

    public static MultaEstado Aplicar(MultaEstado m, string passo, DadosPasso d, string hoje)
    {
        var n = m.Copia();
        switch (passo)
        {
            case Passos.DefinirResponsavel:
                if (d.Responsavel == "empresa") { n.Responsavel = MultaCodigos.Empresa; n.MotivoEmpresa = MultaCodigos.CulpaDaEmpresa; n.Status = MultaCodigos.Pagar; }
                else { n.Responsavel = MultaCodigos.Motorista; n.MotoristaId = d.MotoristaId; n.Status = MultaCodigos.Indicar; }
                break;
            case Passos.AvisarMotorista:
                n.DataAviso = string.IsNullOrWhiteSpace(d.Data) ? hoje : d.Data;
                break;
            case Passos.RegistrarIndicacao:
                n.Canal = CanalDe(d.Canal); n.DataIndicacao = d.Data; n.Indicado = true;
                if (n.Canal != MultaCodigos.Senatran || n.AceiteEm != null) n.Status = MultaCodigos.Pagar;
                break;
            case Passos.RegistrarAceite:
                n.AceiteEm = d.Data; n.Status = MultaCodigos.Pagar;
                break;
            case Passos.RegistrarPagamento:
                n.PagaEm = d.Data; n.ValorPago = d.ValorPago;
                // Multa da Empresa: o acerto "empresa assume" (com o motivo já gravado) sai junto e a multa encerra.
                if (ResponsavelEfetivo(m) == MultaCodigos.Empresa) { n.AcertoEm = d.Data; n.EncerradaEm = d.Data; n.Status = MultaCodigos.Encerrada; }
                else n.Status = MultaCodigos.Acertar;
                break;
            case Passos.RegistrarAcerto:
                if (d.Acerto == "folha") n.Competencia = d.Competencia!.Length == 7 ? d.Competencia + "-01" : d.Competencia;
                else n.MotivoEmpresa = MotivoDe(d.Motivo);
                n.AcertoEm = hoje; n.EncerradaEm = hoje; n.Status = MultaCodigos.Encerrada;
                break;
            case Passos.PrazoVencido:
                if (d.Indicou == true)
                {
                    n.Canal = CanalDe(d.Canal); n.DataIndicacao = d.Data; n.Indicado = true;
                    if (!string.IsNullOrWhiteSpace(d.MotoristaId)) { n.MotoristaId = d.MotoristaId; n.Responsavel = MultaCodigos.Motorista; }
                }
                else { n.Responsavel = MultaCodigos.Empresa; n.MotivoEmpresa = MultaCodigos.PrazoPerdido; }
                n.Status = MultaCodigos.Pagar;
                break;
            case Passos.Cancelar:
                n.MotivoCancelamento = d.MotivoTexto!.Trim(); n.CanceladaEm = hoje; n.Status = MultaCodigos.Cancelada;
                break;
            case Passos.Recorrer:
                n.RecursoPendente = true; n.Status = MultaCodigos.Recurso;
                break;
            case Passos.ResultadoRecurso:
                n.RecursoPendente = false;
                if (d.Resultado == "deferido") { n.EncerradaEm = hoje; n.Status = MultaCodigos.Encerrada; }
                else n.Status = MultaCodigos.Pagar;
                break;
        }
        return n;
    }

    private static readonly (string Campo, Func<MultaEstado, object?> Ler)[] Campos =
    {
        ("status", m => m.Status), ("responsavel", m => m.Responsavel), ("motoristaId", m => m.MotoristaId), ("motivoEmpresa", m => m.MotivoEmpresa),
        ("dataAviso", m => m.DataAviso), ("canal", m => m.Canal), ("dataIndicacao", m => m.DataIndicacao), ("indicado", m => m.Indicado),
        ("aceiteEm", m => m.AceiteEm), ("pagaEm", m => m.PagaEm), ("valorPago", m => m.ValorPago), ("competencia", m => m.Competencia),
        ("acertoEm", m => m.AcertoEm), ("encerradaEm", m => m.EncerradaEm), ("canceladaEm", m => m.CanceladaEm),
        ("motivoCancelamento", m => m.MotivoCancelamento), ("recursoPendente", m => m.RecursoPendente),
    };

    public static List<KeyValuePair<string, object?>> Mudancas(MultaEstado antes, MultaEstado depois) =>
        Campos.Where(c => !Equals(c.Ler(antes), c.Ler(depois))).Select(c => new KeyValuePair<string, object?>(c.Campo, c.Ler(depois))).ToList();

    public static string Formatar(object? valor) => valor switch
    {
        null => "null",
        bool b => b ? "true" : "false",
        IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
        _ => valor.ToString() ?? "",
    };

    public static int? CanalDe(string? canal) => canal switch
    {
        "senatran" => MultaCodigos.Senatran, "dsv" => MultaCodigos.DsvDigital, "prefeitura" => MultaCodigos.Prefeitura, _ => null,
    };

    public static int? MotivoDe(string? motivo) => motivo switch
    {
        "prazo-perdido" => MultaCodigos.PrazoPerdido, "culpa-empresa" => MultaCodigos.CulpaDaEmpresa, _ => null,
    };

    private static string? DataRuim(string? data, string hoje, string vazio)
    {
        if (string.IsNullOrWhiteSpace(data)) return vazio;
        if (!DiaIso.IsMatch(data) || !DateTime.TryParseExact(data, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) return "Data inválida.";
        return string.CompareOrdinal(data, hoje) > 0 ? "A data não pode ser no futuro." : null;
    }
}
