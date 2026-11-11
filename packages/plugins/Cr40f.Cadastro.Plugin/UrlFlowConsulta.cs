using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Cadastro.Plugin;

/// <summary>URL do gatilho do flow de consulta: variável de ambiente primeiro (cada ambiente tem a sua), configuração segura do step como fallback.</summary>
public static class UrlFlowConsulta
{
    public const string Variavel = "new_URLFlowConsultarArquivosSharePoint";

    /// <summary>Devolve a URL ou null. O trace leva só a origem ou o motivo, nunca a URL.</summary>
    public static string? Ler(IOrganizationService sistema, string? configuracaoSegura, Action<string> trace)
    {
        string? daVariavel = null;
        try { daVariavel = LerVariavel(sistema); }
        catch (Exception erro) { trace("variável " + Variavel + " ilegível: " + erro.Message); }
        if (daVariavel is not null) { trace("URL do flow: variável de ambiente"); return daVariavel; }

        var segura = configuracaoSegura?.Trim();
        if (!string.IsNullOrEmpty(segura)) { trace("URL do flow: configuração segura (variável " + Variavel + " sem valor)"); return segura; }

        trace("URL do flow ausente: variável " + Variavel + " sem valor e configuração segura vazia");
        return null;
    }

    // Mesmo padrão de Cr40f.Prontuario.Plugin/Dataverse.cs: valor atual; sem ele, o padrão da definição.
    private static string? LerVariavel(IOrganizationService sistema)
    {
        var def = new QueryExpression("environmentvariabledefinition") { ColumnSet = new ColumnSet("defaultvalue"), TopCount = 1 };
        def.Criteria.AddCondition("schemaname", ConditionOperator.Equal, Variavel);
        var definicao = sistema.RetrieveMultiple(def).Entities.FirstOrDefault();
        if (definicao is null) return null;
        var val = new QueryExpression("environmentvariablevalue") { ColumnSet = new ColumnSet("value"), TopCount = 1 };
        val.Criteria.AddCondition("environmentvariabledefinitionid", ConditionOperator.Equal, definicao.Id);
        var valor = sistema.RetrieveMultiple(val).Entities.FirstOrDefault()?.GetAttributeValue<string>("value");
        var url = (string.IsNullOrWhiteSpace(valor) ? definicao.GetAttributeValue<string>("defaultvalue") : valor)?.Trim();
        return string.IsNullOrEmpty(url) ? null : url;
    }
}
