using System;
using System.Globalization;
using System.Linq;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Documentos.Plugin;

/// <summary>Entity → modelo, com as mesmas regras de apps/shell/src/pages/documentos/data/queries.ts.</summary>
public static class DataverseMapper
{
    public static TipoDoc Tipo(Entity e) => new()
    {
        Id = e.Id.ToString(),
        Nome = Texto(e, "cr40f_name"),
        Categoria = Inteiro(e, "cr40f_categoria") == Codigos.CategoriaFrota ? Categorias.Frota : Categorias.Pessoas,
        TemValidade = e.GetAttributeValue<bool>("cr40f_temvalidade"),
        ObrigatorioPara = e.GetAttributeValue<OptionSetValueCollection>("cr40f_obrigatoriopara")?.Select(o => o.Value).ToArray() ?? new int[0],
        Ordem = e.GetAttributeValue<int?>("cr40f_ordem") ?? 0,
        Ativo = Inteiro(e, "statecode") != 1,
    };

    public static Dono Funcionario(Entity e)
    {
        var apelido = Texto(e, "new_apelido");
        return new Dono
        {
            Id = e.Id.ToString(),
            Categoria = Categorias.Pessoas,
            Nome = apelido.Length > 0 ? apelido : Texto(e, "cr40f_nomecompleto"),
            Detalhe = e.FormattedValues.Contains("cr40f_funcao") ? e.FormattedValues["cr40f_funcao"] : "",
            ObrigKey = Codigos.ObrigDeFuncao(Inteiro(e, "cr40f_funcao")),
            Ativo = Inteiro(e, "cr40f_status") != Codigos.FuncionarioDesligado,
        };
    }

    public static Dono Veiculo(Entity e) => new()
    {
        Id = e.Id.ToString(),
        Categoria = Categorias.Frota,
        Nome = Texto(e, "cr40f_placa"),
        Detalhe = string.Join(" ", new[] { Texto(e, "cr40f_marca"), Texto(e, "cr40f_modelo") }.Where(s => s.Length > 0)),
        ObrigKey = Codigos.ObrigDeCategoriaVeiculo(Inteiro(e, "new_categoriadoveiculo")),
        Ativo = Inteiro(e, "cr40f_statusdoveiculo") != Codigos.VeiculoVendido,
    };

    public static DocEmitido Documento(Entity e)
    {
        var funcionario = e.GetAttributeValue<EntityReference>("cr40f_funcionario");
        var veiculo = e.GetAttributeValue<EntityReference>("cr40f_veiculo");
        return new DocEmitido
        {
            Id = e.Id.ToString(),
            TipoId = e.GetAttributeValue<EntityReference>("cr40f_tipo")?.Id.ToString() ?? "",
            DonoId = (funcionario ?? veiculo)?.Id.ToString() ?? "",
            Categoria = funcionario != null ? Categorias.Pessoas : Categorias.Frota,
            Emissao = Data(e, "cr40f_emissao"),
            Validade = Data(e, "cr40f_validade"),
            Situacao = Inteiro(e, "cr40f_situacao") == Codigos.SituacaoSubstituido ? "substituido" : "vigente",
            ModificadoEm = e.GetAttributeValue<DateTime?>("modifiedon")?.ToString("o", CultureInfo.InvariantCulture),
        };
    }

    private static string Texto(Entity e, string campo) => (e.GetAttributeValue<string>(campo) ?? "").Trim();

    private static int? Inteiro(Entity e, string campo)
    {
        if (!e.Contains(campo)) return null;
        return e[campo] switch
        {
            OptionSetValue opcao => opcao.Value,
            int numero => numero,
            _ => null,
        };
    }

    /// <summary>Colunas "só data": o SDK devolve meia-noite, então a data vale como está.</summary>
    private static string? Data(Entity e, string campo) =>
        e.GetAttributeValue<DateTime?>(campo)?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
}
