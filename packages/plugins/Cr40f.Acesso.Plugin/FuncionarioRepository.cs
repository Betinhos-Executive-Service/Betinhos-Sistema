using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

public sealed class FuncionarioRegistro { public Guid Id; public string Nome = ""; public string? EmailMicrosoft; public string? Celular; }

public sealed class FuncionarioRepository
{
    public const string Tabela = "cr40f_funcionarios";
    public const string ColunaCelular = "cr40f_telefonecorporativo";
    public const string ColunaCelularPessoal = "cr40f_telefonepessoal";
    public const string ColunaCpf = "cr40f_numerodocpf";
    public const int FuncaoMotorista = 202410000;
    public const int StatusAtivo = 0;
    private static readonly ColumnSet Colunas = new("cr40f_nomecompleto", "cr40f_emailmicrosoft", ColunaCelular);
    private readonly IOrganizationService _service;
    public FuncionarioRepository(IOrganizationService service) { _service = service; }

    public FuncionarioRegistro? PorId(Guid id)
    {
        var q = new QueryExpression(Tabela) { ColumnSet = Colunas, TopCount = 1 };
        q.Criteria.AddCondition("cr40f_funcionariosid", ConditionOperator.Equal, id);
        return _service.RetrieveMultiple(q).Entities.Select(Mapear).FirstOrDefault();
    }

    public FuncionarioRegistro? PorEmail(string email)
    {
        var q = new QueryExpression(Tabela) { ColumnSet = Colunas, TopCount = 2 };
        q.Criteria.AddCondition("cr40f_emailmicrosoft", ConditionOperator.Equal, email.Trim().ToLowerInvariant());
        return _service.RetrieveMultiple(q).Entities.Select(Mapear).FirstOrDefault();
    }

    /// <summary>
    /// Funcionários de qualquer função e status com o mesmo nome (sem acentos, caixa e espaços extras), o mesmo celular
    /// (corporativo ou pessoal) ou o mesmo CPF, quando informado. A comparação é feita aqui porque o Dataverse não ignora acentos.
    /// </summary>
    public bool TemParecido(string nome, string celular, string? cpf)
    {
        var alvoNome = AcessoRules.NomeComparavel(nome);
        var alvoCelular = AcessoRules.NormalizarCelular(celular);
        var alvoCpf = AcessoRules.SoDigitos(cpf);
        var q = new QueryExpression(Tabela) { ColumnSet = new ColumnSet("cr40f_nomecompleto", ColunaCelular, ColunaCelularPessoal, ColunaCpf), PageInfo = new PagingInfo { Count = 5000, PageNumber = 1 } };
        while (true)
        {
            var pagina = _service.RetrieveMultiple(q);
            if (pagina.Entities.Any(e =>
                AcessoRules.NomeComparavel(e.GetAttributeValue<string>("cr40f_nomecompleto")) == alvoNome
                || alvoCelular is not null && (AcessoRules.NormalizarCelular(e.GetAttributeValue<string>(ColunaCelular)) == alvoCelular || AcessoRules.NormalizarCelular(e.GetAttributeValue<string>(ColunaCelularPessoal)) == alvoCelular)
                || alvoCpf.Length == 11 && AcessoRules.SoDigitos(e.GetAttributeValue<string>(ColunaCpf)) == alvoCpf)) return true;
            if (!pagina.MoreRecords) return false;
            q.PageInfo.PageNumber++; q.PageInfo.PagingCookie = pagina.PagingCookie;
        }
    }

    /// <summary>email null: liberação do systemuser pendente; o e-mail é gravado quando o Dataverse liberar.</summary>
    public Guid Criar(string nome, string? email, string celular, int tipoVinculo)
    {
        var e = new Entity(Tabela)
        {
            ["cr40f_nomecompleto"] = nome.Trim(), [ColunaCelular] = celular,
            ["cr40f_funcao"] = new OptionSetValue(FuncaoMotorista), ["cr40f_status"] = new OptionSetValue(StatusAtivo), ["cr40f_tipodevinculo"] = new OptionSetValue(tipoVinculo),
        };
        if (email is not null) e["cr40f_emailmicrosoft"] = email;
        return _service.Create(e);
    }

    /// <summary>Liberação pendente: grava só o celular (sem e-mail, não dispara o DriverRecordSharing) para "Concluir liberação" na ficha ter um celular válido.</summary>
    public void CompletarCelular(Guid id, string celular) => _service.Update(new Entity(Tabela, id) { [ColunaCelular] = celular });

    public void VincularEmail(Guid id, string email, string? celularSeVazio)
    {
        var atual = PorId(id) ?? throw new AcessoException("FUNCIONARIO_NAO_ENCONTRADO", "Funcionário " + id + " não existe.");
        var e = new Entity(Tabela, id) { ["cr40f_emailmicrosoft"] = email };
        if (string.IsNullOrWhiteSpace(atual.Celular) && celularSeVazio is not null) e[ColunaCelular] = celularSeVazio;
        _service.Update(e);
    }

    private static FuncionarioRegistro Mapear(Entity e) => new()
    {
        Id = e.Id,
        Nome = e.GetAttributeValue<string>("cr40f_nomecompleto") ?? "",
        EmailMicrosoft = e.GetAttributeValue<string>("cr40f_emailmicrosoft"),
        Celular = e.GetAttributeValue<string>(ColunaCelular),
    };
}
