using System.Runtime.Serialization;

namespace Cr40f.Frota.Plugin.Manutencao;

[DataContract]
public sealed class AgendarPedido
{
    [DataMember(Name = "manutencaoId")] public string ManutencaoId { get; set; } = "";
    /// <summary>yyyy-MM-dd.</summary>
    [DataMember(Name = "inicio")] public string Inicio { get; set; } = "";
    [DataMember(Name = "fim")] public string Fim { get; set; } = "";
    [DataMember(Name = "comentario")] public string? Comentario { get; set; }
}

[DataContract]
public sealed class MotivoPedido
{
    [DataMember(Name = "manutencaoId")] public string ManutencaoId { get; set; } = "";
    [DataMember(Name = "comentario")] public string? Comentario { get; set; }
}

[DataContract]
public sealed class ConcluirPedido
{
    [DataMember(Name = "manutencaoId")] public string ManutencaoId { get; set; } = "";
    [DataMember(Name = "servicos")] public int[] Servicos { get; set; } = new int[0];
    [DataMember(Name = "km")] public int Km { get; set; }
    /// <summary>ISO 8601 com fuso (hora da ação no aparelho ou no shell).</summary>
    [DataMember(Name = "data")] public string Data { get; set; } = "";
    [DataMember(Name = "valor")] public decimal Valor { get; set; }
    [DataMember(Name = "pagamento")] public int Pagamento { get; set; }
    [DataMember(Name = "estabelecimento")] public string Estabelecimento { get; set; } = "";
    [DataMember(Name = "cidadeId")] public string CidadeId { get; set; } = "";
    [DataMember(Name = "realizadoPorId")] public string RealizadoPorId { get; set; } = "";
    [DataMember(Name = "servicoRealizado")] public string? ServicoRealizado { get; set; }
    [DataMember(Name = "comentario")] public string? Comentario { get; set; }
    [DataMember(Name = "linkNotaFiscal")] public string? LinkNotaFiscal { get; set; }
    [DataMember(Name = "linkFotoFinal1")] public string? LinkFotoFinal1 { get; set; }
    [DataMember(Name = "linkFotoFinal2")] public string? LinkFotoFinal2 { get; set; }
    [DataMember(Name = "linkFotoFinal3")] public string? LinkFotoFinal3 { get; set; }
    /// <summary>Quem chamou: "shell" (Sistema Betinhos) ou ausente (App Motoristas). Só vale para a despesa nova.</summary>
    [DataMember(Name = "origem")] public string? Origem { get; set; }
}

[DataContract]
public sealed class AgendarResposta
{
    [DataMember(Name = "geralId")] public string GeralId { get; set; } = "";
}

[DataContract]
public sealed class ConcluirResposta
{
    [DataMember(Name = "despesaId")] public string DespesaId { get; set; } = "";
    /// <summary>D.AnexoPendente: quem chamou ainda sobe a nota fiscal na despesa. D.AnexoEnviado: já subiu antes.</summary>
    [DataMember(Name = "statusAnexo")] public int StatusAnexo { get; set; }
    [DataMember(Name = "geralId")] public string? GeralId { get; set; }
}
