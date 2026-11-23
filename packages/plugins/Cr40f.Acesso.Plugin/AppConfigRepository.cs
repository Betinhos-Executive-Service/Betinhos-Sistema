using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Cr40f.AppConfig;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

public sealed class AppConfigVersao
{
    public Guid Id;
    public int? Numero;
    public int Estado;
    public string? Conteudo;
    public string? Nota;
    /// <summary>modifiedon em ISO 8601 (UTC): a tela devolve em "Base" para o servidor detectar rascunho alterado por outra pessoa.</summary>
    public string Marca = "";
}

public sealed class AppConfigFicha
{
    public Guid Id;
    public string Nome = "";
    public string? Email;
    public int? Status;
    public int? Vinculo;
    /// <summary>Colunas legadas da ficha (transição): valem exceção implícita "ligado" enquanto não houver linha da chave.</summary>
    public bool PodeCobrarQr;
    public bool GeraReciboPersonalizado;
    /// <summary>Ativo e com e-mail Microsoft = tem acesso ao App.</summary>
    public bool TemAcesso => Status == FuncionarioRepository.StatusAtivo && !string.IsNullOrWhiteSpace(Email);
}

public sealed class AppConfigRepository
{
    public const string TabelaVersao = "cr40f_appconfigversao";
    public const string TabelaPessoa = "cr40f_appconfigpessoa";
    public const int Rascunho = 100000000, Publicada = 100000001, Substituida = 100000002;
    public const int TipoExcecao = 100000000, TipoPiloto = 100000001;

    private readonly IOrganizationService _service;
    public AppConfigRepository(IOrganizationService service) { _service = service; }

    // ---- versões ----

    private static readonly ColumnSet ColunasVersao = new("cr40f_numero", "cr40f_estado", "cr40f_conteudo", "cr40f_nota", "modifiedon");

    private List<AppConfigVersao> Versoes(int? estado)
    {
        var q = new QueryExpression(TabelaVersao) { ColumnSet = ColunasVersao };
        if (estado.HasValue) q.Criteria.AddCondition("cr40f_estado", ConditionOperator.Equal, estado.Value);
        return _service.RetrieveMultiple(q).Entities.Select(MapearVersao).ToList();
    }

    public AppConfigVersao? LerRascunho() => Versoes(Rascunho).FirstOrDefault();

    /// <summary>A de maior número, se por erro houver mais de uma publicada.</summary>
    public AppConfigVersao? LerPublicada() => Versoes(Publicada).OrderByDescending(v => v.Numero ?? 0).FirstOrDefault();

    public int MaiorNumero() => Versoes(null).Select(v => v.Numero ?? 0).DefaultIfEmpty(0).Max();

    public Guid CriarRascunho(string conteudo, Guid usuario) => _service.Create(new Entity(TabelaVersao)
    {
        ["cr40f_name"] = "Rascunho", ["cr40f_estado"] = new OptionSetValue(Rascunho), ["cr40f_conteudo"] = conteudo,
        ["cr40f_alteradopor"] = new EntityReference("systemuser", usuario),
    });

    public void AtualizarRascunho(Guid id, string conteudo, Guid usuario) => _service.Update(new Entity(TabelaVersao, id)
    {
        ["cr40f_conteudo"] = conteudo, ["cr40f_alteradopor"] = new EntityReference("systemuser", usuario),
    });

    public Guid CriarPublicada(int numero, string conteudo, string? nota, Guid usuario, DateTime agoraUtc)
    {
        var e = new Entity(TabelaVersao)
        {
            ["cr40f_name"] = "Versão " + numero.ToString(CultureInfo.InvariantCulture), ["cr40f_numero"] = numero, ["cr40f_estado"] = new OptionSetValue(Publicada),
            ["cr40f_conteudo"] = conteudo, ["cr40f_publicadoem"] = agoraUtc, ["cr40f_publicadopor"] = new EntityReference("systemuser", usuario),
        };
        if (!string.IsNullOrWhiteSpace(nota)) e["cr40f_nota"] = nota!.Trim().Length > 500 ? nota.Trim().Substring(0, 500) : nota.Trim();
        return _service.Create(e);
    }

    public void Substituir(Guid id) => _service.Update(new Entity(TabelaVersao, id) { ["cr40f_estado"] = new OptionSetValue(Substituida) });

    public void ExcluirVersao(Guid id) => _service.Delete(TabelaVersao, id);

    private static AppConfigVersao MapearVersao(Entity e) => new()
    {
        Id = e.Id,
        Numero = e.GetAttributeValue<int?>("cr40f_numero"),
        Estado = e.GetAttributeValue<OptionSetValue>("cr40f_estado")?.Value ?? 0,
        Conteudo = e.GetAttributeValue<string>("cr40f_conteudo"),
        Nota = e.GetAttributeValue<string>("cr40f_nota"),
        Marca = e.GetAttributeValue<DateTime?>("modifiedon") is { } m ? DateTime.SpecifyKind(m, DateTimeKind.Utc).ToString("o", CultureInfo.InvariantCulture) : "",
    };

    // ---- funcionário e usuário ----

    private static readonly ColumnSet ColunasFicha = new("cr40f_nomecompleto", "cr40f_emailmicrosoft", "cr40f_status", "cr40f_tipodevinculo", AppConfigLegado.ColunaCobrarQr, AppConfigLegado.ColunaReciboPersonalizado);

    public AppConfigFicha? Ficha(Guid id)
    {
        var q = new QueryExpression(FuncionarioRepository.Tabela) { ColumnSet = ColunasFicha, TopCount = 1 };
        q.Criteria.AddCondition("cr40f_funcionariosid", ConditionOperator.Equal, id);
        return _service.RetrieveMultiple(q).Entities.Select(MapearFicha).FirstOrDefault();
    }

    public AppConfigFicha? FichaPorEmail(string email)
    {
        var q = new QueryExpression(FuncionarioRepository.Tabela) { ColumnSet = ColunasFicha, TopCount = 2 };
        q.Criteria.AddCondition("cr40f_emailmicrosoft", ConditionOperator.Equal, email.Trim().ToLowerInvariant());
        return _service.RetrieveMultiple(q).Entities.Select(MapearFicha).FirstOrDefault();
    }

    /// <summary>Funcionário apontado por um lookup de outro registro (ex.: dono de uma participação de treinamento). null se o lookup está vazio.</summary>
    public Guid? DonoDoRegistro(string tabela, Guid id, string colunaFuncionario) =>
        _service.Retrieve(tabela, id, new ColumnSet(colunaFuncionario)).GetAttributeValue<EntityReference>(colunaFuncionario)?.Id;

    /// <summary>E-mail do usuário do Dataverse (internalemailaddress, ou domainname se vazio).</summary>
    public string? EmailDoUsuario(Guid userId)
    {
        var q = new QueryExpression("systemuser") { ColumnSet = new ColumnSet("internalemailaddress", "domainname"), TopCount = 1 };
        q.Criteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
        var u = _service.RetrieveMultiple(q).Entities.FirstOrDefault();
        if (u is null) return null;
        var email = u.GetAttributeValue<string>("internalemailaddress");
        return string.IsNullOrWhiteSpace(email) ? u.GetAttributeValue<string>("domainname") : email;
    }

    private static AppConfigFicha MapearFicha(Entity e) => new()
    {
        Id = e.Id,
        Nome = e.GetAttributeValue<string>("cr40f_nomecompleto") ?? "",
        Email = e.GetAttributeValue<string>("cr40f_emailmicrosoft"),
        Status = e.GetAttributeValue<OptionSetValue>("cr40f_status")?.Value,
        Vinculo = e.GetAttributeValue<OptionSetValue>("cr40f_tipodevinculo")?.Value,
        PodeCobrarQr = e.GetAttributeValue<bool>(AppConfigLegado.ColunaCobrarQr),
        GeraReciboPersonalizado = e.GetAttributeValue<bool>(AppConfigLegado.ColunaReciboPersonalizado),
    };

    // ---- exceções e piloto ----

    private static readonly ColumnSet ColunasPessoa = new("cr40f_tipo", "cr40f_chave", "cr40f_ligado", "cr40f_validade", "cr40f_encerradoem", "createdon");

    /// <summary>Linhas ainda não encerradas do funcionário, da mais antiga para a mais recente.</summary>
    private List<Entity> LinhasAbertas(Guid funcionarioId)
    {
        var q = new QueryExpression(TabelaPessoa) { ColumnSet = ColunasPessoa };
        q.Criteria.AddCondition("cr40f_funcionario", ConditionOperator.Equal, funcionarioId);
        q.Criteria.AddCondition("cr40f_encerradoem", ConditionOperator.Null);
        return _service.RetrieveMultiple(q).Entities.OrderBy(e => e.GetAttributeValue<DateTime?>("createdon") ?? DateTime.MinValue).ToList();
    }

    /// <summary>Todas as linhas do funcionário (abertas e encerradas), da mais antiga para a mais recente.</summary>
    private List<Entity> TodasAsLinhas(Guid funcionarioId)
    {
        var q = new QueryExpression(TabelaPessoa) { ColumnSet = ColunasPessoa };
        q.Criteria.AddCondition("cr40f_funcionario", ConditionOperator.Equal, funcionarioId);
        return _service.RetrieveMultiple(q).Entities.OrderBy(e => e.GetAttributeValue<DateTime?>("createdon") ?? DateTime.MinValue).ToList();
    }

    /// <summary>Ponto único que monta a pessoa: linhas da tabela mais o legado da ficha (AppConfigLegado), igual no DriverRecordSharing.</summary>
    public AppConfigPessoa PessoaDe(AppConfigFicha ficha)
    {
        var pessoa = new AppConfigPessoa { Vinculo = ficha.Vinculo };
        foreach (var linha in TodasAsLinhas(ficha.Id))
        {
            var encerrada = linha.GetAttributeValue<DateTime?>("cr40f_encerradoem") != null;
            var tipo = linha.GetAttributeValue<OptionSetValue>("cr40f_tipo")?.Value;
            if (tipo == TipoPiloto) { if (!encerrada) pessoa.Piloto = true; }
            else if (tipo == TipoExcecao)
                pessoa.Excecoes.Add(new AppConfigExcecao
                {
                    Chave = linha.GetAttributeValue<string>("cr40f_chave") ?? "",
                    Ligado = linha.GetAttributeValue<bool>("cr40f_ligado"),
                    Validade = linha.GetAttributeValue<DateTime?>("cr40f_validade") is { } v ? v.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : null,
                    Encerrada = encerrada,
                });
        }
        AppConfigLegado.Aplicar(pessoa, ficha.PodeCobrarQr, ficha.GeraReciboPersonalizado);
        return pessoa;
    }

    public bool TemPilotoAberto(Guid funcionarioId) => LinhasAbertas(funcionarioId).Any(l => l.GetAttributeValue<OptionSetValue>("cr40f_tipo")?.Value == TipoPiloto);

    /// <summary>Encerra (nunca exclui) as linhas abertas do tipo (e da chave, nas exceções). Devolve quantas.</summary>
    public int Encerrar(Guid funcionarioId, int tipo, string? chave, Guid usuario, DateTime agoraUtc)
    {
        var alvo = LinhasAbertas(funcionarioId)
            .Where(l => l.GetAttributeValue<OptionSetValue>("cr40f_tipo")?.Value == tipo && (tipo == TipoPiloto || l.GetAttributeValue<string>("cr40f_chave") == chave))
            .ToList();
        foreach (var l in alvo)
            _service.Update(new Entity(TabelaPessoa, l.Id) { ["cr40f_encerradoem"] = agoraUtc, ["cr40f_encerradopor"] = new EntityReference("systemuser", usuario) });
        return alvo.Count;
    }

    public Guid CriarPiloto(Guid funcionarioId, string nome, string? motivo, Guid usuario) => _service.Create(new Entity(TabelaPessoa)
    {
        ["cr40f_name"] = "Piloto - " + nome, ["cr40f_tipo"] = new OptionSetValue(TipoPiloto), ["cr40f_motivo"] = motivo,
        ["cr40f_funcionario"] = new EntityReference(FuncionarioRepository.Tabela, funcionarioId), ["cr40f_criadopor"] = new EntityReference("systemuser", usuario),
    });

    public Guid CriarExcecao(Guid funcionarioId, string nome, string chave, bool ligado, string motivo, string? validade, Guid usuario)
    {
        var e = new Entity(TabelaPessoa)
        {
            ["cr40f_name"] = chave + " - " + nome, ["cr40f_tipo"] = new OptionSetValue(TipoExcecao), ["cr40f_chave"] = chave, ["cr40f_ligado"] = ligado, ["cr40f_motivo"] = motivo,
            ["cr40f_funcionario"] = new EntityReference(FuncionarioRepository.Tabela, funcionarioId), ["cr40f_criadopor"] = new EntityReference("systemuser", usuario),
        };
        if (!string.IsNullOrEmpty(validade)) e["cr40f_validade"] = DateTime.ParseExact(validade, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        return _service.Create(e);
    }
}
