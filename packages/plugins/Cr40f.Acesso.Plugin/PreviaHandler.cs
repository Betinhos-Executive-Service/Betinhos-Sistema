using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Metadata.Query;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

/// <summary>Prévia de um pedido de perfis (Custom API cr40f_AcessoPrevia): o que a pessoa deixa de ter. Só lê.</summary>
public sealed class PreviaHandler
{
    public const int MaxTabelas = 200;
    public const int Dias = 90;
    /// <summary>Teto de cada contagem: lê só os ids, uma página; acima disso sai "limitado".</summary>
    public const int Limite = 5000;
    /// <summary>Valores por condição IN.</summary>
    private const int Lote = 500;
    private const int Ler = 1, Criar = 2, Gravar = 4;
    private static readonly string[] ColunasDoUso = { "createdby", "createdon", "modifiedby", "modifiedon" };
    private static readonly string[] OrdemTipos = { "Read", "Create", "Write", "Delete", "Append", "AppendTo", "Assign", "Share", "Use" };
    private static readonly string[] PadraoMedidas = { "account", "annotation", "appointment", "contact", "email", "phonecall", "task" };

    private readonly IOrganizationService _s;
    private readonly Guid _organizacao;
    private readonly DateTime _agora;
    private readonly Dictionary<Guid, PapelEfetivo?> _papeis = new();

    public PreviaHandler(IOrganizationService sistema, Guid organizacao, DateTime agora) { _s = sistema; _organizacao = organizacao; _agora = agora; }

    private sealed class Equipe
    {
        public Guid Id; public string Nome = ""; public int Tipo; public List<Guid> Papeis = new();
    }

    private sealed class Perda
    {
        public string? Tabela; public string? Rotulo; public SortedSet<int> Tipos = new(); public bool Incerto;
    }

    public string Executar(Guid chamador, Guid usuario, string? perfisJson, bool retirarAmplo, string? tabelasJson)
    {
        var admin = AcessoPrevisao.Autorizar(_s, chamador);
        if (retirarAmplo && !admin) throw new AcessoException("SEM_PERMISSAO", "Só o Administrador do Sistema retira o acesso amplo.");
        var plano = AcessoPrevisao.Planejar(_s, admin, usuario, perfisJson);
        var tabelasDoUso = string.IsNullOrWhiteSpace(tabelasJson) ? null : LerTabelas(tabelasJson!);
        var universo = AcessoUniverso.Obter(_s, _organizacao, _agora);
        var pais = AcessoUniverso.Todos(_s, new QueryExpression("businessunit") { ColumnSet = new ColumnSet("parentbusinessunitid") })
            .ToDictionary(b => b.Id, b => b.GetAttributeValue<EntityReference>("parentbusinessunitid")?.Id);
        var raiz = pais.FirstOrDefault(p => p.Value == null).Key;

        var equipes = Equipes(usuario);
        CarregarPapeis(plano.PapeisAtuais.Concat(plano.PapeisDepois).Concat(equipes.SelectMany(e => e.Papeis)));
        var tiradas = retirarAmplo
            ? equipes.Where(e => (e.Tipo == 2 || e.Tipo == 3) && e.Papeis.Any(r => AcessoCatalogo.EhAmplo(Papel(r)?.Nome))).ToList()
            : new List<Equipe>();
        var ficam = equipes.Where(e => !tiradas.Contains(e)).ToList();
        var diretosDepois = plano.PapeisDepois.Where(r => !retirarAmplo || !AcessoCatalogo.EhAmplo(Papel(r)?.Nome)).ToList();

        var antes = Efetivos(plano.PapeisAtuais, equipes);
        var depois = Efetivos(diretosDepois, ficam);
        var perdas = Agrupar(AcessoPrevisao.Perdas(antes, depois, universo.Privilegios.Keys, raiz, (x, anc) => Descende(pais, x, anc)), universo);

        if (tabelasDoUso != null) return Uso(usuario, tabelasDoUso, perdas);

        var adminAntes = antes.Any(p => p.Admin && !p.SemHeranca);
        var adminDepois = depois.Any(p => p.Admin && !p.SemHeranca);
        var colunas = new List<(string Coluna, int Perde)>();
        if (!adminDepois)
        {
            var perfisDasEquipes = Pares("teamprofiles", "teamid", equipes.Select(e => e.Id), "fieldsecurityprofileid");
            colunas = ColunasPerdidas(
                adminAntes ? null : plano.ColunasAtuais.Concat(equipes.SelectMany(e => perfisDasEquipes[e.Id])),
                plano.ColunasDepois.Concat(ficam.SelectMany(e => perfisDasEquipes[e.Id])));
        }
        var perdeAdmin = adminAntes && !adminDepois;
        var apps = adminDepois ? new List<string>() : Apps(adminAntes, antes, depois);
        var flows = Flows(usuario, universo, perdas, perdeAdmin);
        var conexoes = perdeAdmin || perdas.Count > 0 || colunas.Count > 0 || apps.Count > 0 || flows.Count > 0 ? Conexoes(usuario) : new List<string>();
        var tabelasDeDono = tiradas.Count > 0 ? TabelasDeDono(universo) : new List<string>();

        return "{\"admin\":{\"antes\":" + B(adminAntes) + ",\"depois\":" + B(adminDepois) + "}"
            + ",\"perdas\":[" + string.Join(",", perdas.OrderBy(p => p.Key, StringComparer.Ordinal).Select(p =>
                "{\"chave\":" + JsonLeve.Texto(p.Key) + ",\"tabela\":" + JsonLeve.Texto(p.Value.Tabela) + ",\"rotulo\":" + JsonLeve.Texto(p.Value.Rotulo)
                + ",\"perde\":[" + string.Join(",", p.Value.Tipos.Select(t => JsonLeve.Texto(OrdemTipos[t]))) + "],\"incerto\":" + B(p.Value.Incerto) + "}")) + "]"
            + ",\"colunas\":[" + string.Join(",", colunas.Select(c =>
            {
                var tabela = c.Coluna.Split('.')[0];
                return "{\"tabela\":" + JsonLeve.Texto(tabela) + ",\"rotulo\":" + JsonLeve.Texto(universo.Rotulo(tabela)) + ",\"coluna\":" + JsonLeve.Texto(c.Coluna)
                    + ",\"perde\":[" + string.Join(",", new[] { (Ler, "ler"), (Criar, "criar"), (Gravar, "gravar") }.Where(d => (c.Perde & d.Item1) != 0).Select(d => JsonLeve.Texto(d.Item2))) + "],\"incerto\":false}";
            })) + "]"
            + ",\"grupos\":[" + string.Join(",", tiradas.OrderBy(t => t.Nome, StringComparer.Ordinal).Select(t =>
            {
                var (n, limitado) = Donos(t.Id, tabelasDeDono);
                return "{\"nome\":" + JsonLeve.Texto(t.Nome) + ",\"perdeDonos\":" + N(n) + ",\"limitado\":" + B(limitado) + "}";
            })) + "]"
            + ",\"apps\":[" + string.Join(",", apps.Select(a => "{\"nome\":" + JsonLeve.Texto(a) + "}")) + "]"
            + ",\"flows\":[" + string.Join(",", flows.Select(f => "{\"nome\":" + JsonLeve.Texto(f.Nome) + ",\"tipo\":" + JsonLeve.Texto(f.Tipo) + ",\"dona\":" + B(f.Dona) + "}")) + "]"
            + ",\"conexoes\":[" + string.Join(",", conexoes.Select(c => "{\"nome\":" + JsonLeve.Texto(c) + "}")) + "]}";
    }

    private static HashSet<string> TabelasPerdidas(Dictionary<string, Perda> perdas) =>
        new HashSet<string>(perdas.Values.Where(p => p.Tabela != null).Select(p => p.Tabela!), StringComparer.Ordinal);

    private static string B(bool v) => v ? "true" : "false";
    private static string N(long? v) => v is long n ? n.ToString(CultureInfo.InvariantCulture) : "null";

    private static List<string> LerTabelas(string tabelasJson)
    {
        List<object?> itens;
        try { itens = JsonLeve.LerLista(tabelasJson); }
        catch (Exception) { throw new AcessoException("TABELA_INVALIDA", "Tabelas precisa ser uma lista JSON de nomes lógicos."); }
        var tabelas = itens.Select(i => i as string).ToList();
        if (tabelas.Count == 0 || tabelas.Count > MaxTabelas || tabelas.Any(t => string.IsNullOrEmpty(t)))
            throw new AcessoException("TABELA_INVALIDA", "Mande de 1 a " + MaxTabelas + " nomes de tabela.");
        return tabelas.Select(t => t!).Distinct(StringComparer.Ordinal).ToList();
    }

    private string Uso(Guid usuario, List<string> tabelas, Dictionary<string, Perda> perdas)
    {
        var perdidas = TabelasPerdidas(perdas);
        var fora = tabelas.Where(t => t == "cr40f_segredo" || !perdidas.Contains(t)).ToList();
        if (fora.Count > 0) throw new AcessoException("TABELA_INVALIDA", "Fora das perdas desta prévia: " + string.Join(", ", fora) + ".");

        var desde = DateTime.SpecifyKind(_agora.Date.AddDays(-Dias), DateTimeKind.Utc);
        var meta = Metadados(tabelas, ColunasDoUso, false);
        return "{\"uso\":[" + string.Join(",", tabelas.Select(t =>
        {
            long? n = null; var limitado = false;
            if (meta.TryGetValue(t, out var cols) && ColunasDoUso.All(cols.ContainsKey))
            {
                var filtro = new FilterExpression(LogicalOperator.Or);
                foreach (var (por, em) in new[] { ("createdby", "createdon"), ("modifiedby", "modifiedon") })
                {
                    var f = filtro.AddFilter(LogicalOperator.And);
                    f.AddCondition(por, ConditionOperator.Equal, usuario);
                    f.AddCondition(em, ConditionOperator.GreaterEqual, desde);
                }
                (n, limitado) = Contar(t, filtro);
            }
            return "{\"tabela\":" + JsonLeve.Texto(t) + ",\"registros\":" + N(n) + ",\"limitado\":" + B(limitado) + ",\"incerto\":" + B(n == null) + "}";
        })) + "]}";
    }

    /// <summary>Conta lendo só os ids, numa página de <see cref="Limite"/>; sem agregado, que estoura o limite e falharia dentro do step síncrono.
    /// Quem chama confere antes pela metadata que a tabela e as colunas do filtro existem.</summary>
    private (long N, bool Limitado) Contar(string tabela, FilterExpression filtro)
    {
        var q = new QueryExpression(tabela) { ColumnSet = new ColumnSet(false), Criteria = filtro, PageInfo = new PagingInfo { Count = Limite, PageNumber = 1 } };
        var r = _s.RetrieveMultiple(q);
        return (r.Entities.Count, r.MoreRecords);
    }

    /// <summary>Registros de que a equipe é dona nas tabelas da Betinhos e nas padrão medidas; tabela sem owningteam na metadata fica de fora.</summary>
    private List<string> TabelasDeDono(AcessoUniverso universo)
    {
        var candidatas = universo.TabelasComDono().Where(t => t.StartsWith("cr40f_", StringComparison.Ordinal) || t.StartsWith("new_", StringComparison.Ordinal) || PadraoMedidas.Contains(t)).ToList();
        var meta = Metadados(candidatas, new[] { "owningteam" }, false);
        return candidatas.Where(t => meta.TryGetValue(t, out var c) && c.ContainsKey("owningteam")).OrderBy(t => t, StringComparer.Ordinal).ToList();
    }

    private (long N, bool Limitado) Donos(Guid equipe, List<string> tabelas)
    {
        long total = 0; var limitado = false;
        foreach (var t in tabelas)
        {
            var filtro = new FilterExpression();
            filtro.AddCondition("owningteam", ConditionOperator.Equal, equipe);
            var (n, mais) = Contar(t, filtro);
            total += n; limitado |= mais;
        }
        return (total, limitado);
    }

    /// <summary>Tabela → coluna → IsSecured, pela metadata. <paramref name="tabelas"/> nulo = todas; <paramref name="soProtegidas"/> traz só colunas com IsSecured.</summary>
    private Dictionary<string, Dictionary<string, bool>> Metadados(IEnumerable<string>? tabelas, IEnumerable<string>? colunas, bool soProtegidas)
    {
        var consulta = new EntityQueryExpression { Properties = new MetadataPropertiesExpression("LogicalName", "Attributes") };
        var lista = tabelas?.Distinct(StringComparer.Ordinal).ToArray();
        if (lista != null)
        {
            if (lista.Length == 0) return new Dictionary<string, Dictionary<string, bool>>(StringComparer.Ordinal);
            consulta.Criteria = new MetadataFilterExpression(LogicalOperator.And);
            consulta.Criteria.Conditions.Add(new MetadataConditionExpression("LogicalName", MetadataConditionOperator.In, lista));
        }
        var atributos = new AttributeQueryExpression { Properties = new MetadataPropertiesExpression("LogicalName", "IsSecured"), Criteria = new MetadataFilterExpression(LogicalOperator.And) };
        var nomes = colunas?.ToArray();
        if (nomes != null) atributos.Criteria.Conditions.Add(new MetadataConditionExpression("LogicalName", MetadataConditionOperator.In, nomes));
        if (soProtegidas) atributos.Criteria.Conditions.Add(new MetadataConditionExpression("IsSecured", MetadataConditionOperator.Equals, true));
        consulta.AttributeQuery = atributos;
        var resposta = (RetrieveMetadataChangesResponse)_s.Execute(new RetrieveMetadataChangesRequest { Query = consulta });
        var mapa = new Dictionary<string, Dictionary<string, bool>>(StringComparer.Ordinal);
        foreach (var em in resposta.EntityMetadata)
        {
            if (lista != null && !lista.Contains(em.LogicalName)) continue;
            mapa[em.LogicalName] = (em.Attributes ?? new AttributeMetadata[0])
                .Where(a => a.LogicalName != null && (nomes == null || nomes.Contains(a.LogicalName)) && (!soProtegidas || a.IsSecured == true))
                .GroupBy(a => a.LogicalName).ToDictionary(g => g.Key, g => g.First().IsSecured == true, StringComparer.Ordinal);
        }
        return mapa;
    }

    private Dictionary<string, Perda> Agrupar(Dictionary<Guid, bool> perdas, AcessoUniverso universo)
    {
        var itens = new Dictionary<string, Perda>(StringComparer.Ordinal);
        void Somar(string chave, string? tabela, string tipo, bool incerto)
        {
            if (!itens.TryGetValue(chave, out var p)) itens[chave] = p = new Perda { Tabela = tabela, Rotulo = tabela == null ? null : universo.Rotulo(tabela) };
            var i = Array.IndexOf(OrdemTipos, tipo);
            p.Tipos.Add(i < 0 ? OrdemTipos.Length - 1 : i);
            p.Incerto |= incerto;
        }
        foreach (var kv in perdas)
        {
            if (!universo.Privilegios.TryGetValue(kv.Key, out var priv)) { Somar(kv.Key.ToString(), null, "Use", true); continue; }
            if (priv.Tabelas.Count == 0) Somar(priv.Nome, null, priv.Tipo, kv.Value);
            foreach (var t in priv.Tabelas) Somar(t, t, priv.Tipo, kv.Value);
        }
        return itens;
    }

    private List<PapelEfetivo> Efetivos(IEnumerable<Guid> diretos, IEnumerable<Equipe> equipes)
    {
        PapelEfetivo Copia(PapelEfetivo p, bool semHeranca) => new() { Id = p.Id, Nome = p.Nome, Unidade = p.Unidade, Raiz = p.Raiz, Admin = p.Admin, Privilegios = p.Privilegios, SemHeranca = semHeranca };
        var lista = diretos.Distinct().Select(Papel).Where(p => p != null).Select(p => Copia(p!, false)).ToList();
        foreach (var e in equipes)
            foreach (var r in e.Papeis)
                if (Papel(r) is { } p) lista.Add(Copia(p, p.SemHeranca));
        return lista;
    }

    /// <summary>Lê de uma vez os papéis que faltam, com os privilégios (o Administrador do Sistema não é lido: vale Global em tudo).
    /// SemHeranca guarda o isinherited do papel; só vale para papel de equipe. Papel que não existe fica nulo.</summary>
    private void CarregarPapeis(IEnumerable<Guid> ids)
    {
        var faltam = ids.Where(id => !_papeis.ContainsKey(id)).Distinct().ToList();
        foreach (var id in faltam) _papeis[id] = null;
        foreach (var e in Em("role", "roleid", faltam, new ColumnSet("name", "businessunitid", "isinherited", "parentrootroleid")))
        {
            var nome = e.GetAttributeValue<string>("name") ?? "";
            var papel = new PapelEfetivo
            {
                Id = e.Id, Nome = nome, Unidade = e.GetAttributeValue<EntityReference>("businessunitid")?.Id ?? Guid.Empty,
                Raiz = e.GetAttributeValue<EntityReference>("parentrootroleid")?.Id ?? e.Id,
                Admin = AcessoCatalogo.EhAdminDoSistema(new[] { nome }),
                SemHeranca = e.GetAttributeValue<OptionSetValue>("isinherited")?.Value == 0,
            };
            if (!papel.Admin)
            {
                var resposta = (RetrieveRolePrivilegesRoleResponse)_s.Execute(new RetrieveRolePrivilegesRoleRequest { RoleId = e.Id });
                papel.Privilegios = (resposta.RolePrivileges ?? new RolePrivilege[0]).Select(p => (p.PrivilegeId, p.Depth)).ToList();
            }
            _papeis[e.Id] = papel;
        }
    }

    private PapelEfetivo? Papel(Guid id)
    {
        CarregarPapeis(new[] { id });
        return _papeis[id];
    }

    private List<Equipe> Equipes(Guid usuario)
    {
        var ids = PapeisDoUsuario.Ids(_s, "teammembership", "systemuserid", usuario, "teamid");
        var papeis = Pares("teamroles", "teamid", ids, "roleid");
        return Em("team", "teamid", ids, new ColumnSet("name", "teamtype")).Select(e => new Equipe
        {
            Id = e.Id, Nome = e.GetAttributeValue<string>("name") ?? "", Tipo = e.GetAttributeValue<OptionSetValue>("teamtype")?.Value ?? 0,
            Papeis = papeis[e.Id].ToList(),
        }).ToList();
    }

    /// <summary>Linhas em que <paramref name="coluna"/> está entre <paramref name="valores"/>, em lotes de IN, paginado.</summary>
    private List<Entity> Em(string tabela, string coluna, IEnumerable<Guid> valores, ColumnSet colunas, Action<FilterExpression>? filtro = null)
    {
        var lista = valores.Distinct().ToList();
        var linhas = new List<Entity>();
        for (var i = 0; i < lista.Count; i += Lote)
        {
            var q = new QueryExpression(tabela) { ColumnSet = colunas };
            q.Criteria.AddCondition(coluna, ConditionOperator.In, lista.Skip(i).Take(Lote).Cast<object>().ToArray());
            filtro?.Invoke(q.Criteria);
            linhas.AddRange(AcessoUniverso.Todos(_s, q));
        }
        return linhas;
    }

    /// <summary>Tabela de interseção lida em lote: <paramref name="filtro"/> → valores de <paramref name="coluna"/>.</summary>
    private ILookup<Guid, Guid> Pares(string tabela, string filtro, IEnumerable<Guid> valores, string coluna) =>
        Em(tabela, filtro, valores, new ColumnSet(filtro, coluna)).ToLookup(e => IdDe(e, filtro), e => IdDe(e, coluna));

    private static Guid IdDe(Entity e, string coluna) => e.Contains(coluna) ? e[coluna] switch { Guid g => g, EntityReference r => r.Id, _ => Guid.Empty } : Guid.Empty;

    private static bool Descende(Dictionary<Guid, Guid?> pais, Guid unidade, Guid ancestral)
    {
        Guid? atual = unidade;
        for (var i = 0; atual is Guid u && i < 64; i++)
        {
            if (u == ancestral) return true;
            atual = pais.TryGetValue(u, out var p) ? p : null;
        }
        return false;
    }

    /// <summary>Direitos ("tabela.coluna" → ler/criar/gravar) que os perfis dão em colunas protegidas (valor 4 = permitido).
    /// <paramref name="perfis"/> nulo = Administrador do Sistema: tudo em toda coluna com IsSecured na metadata e em toda fieldpermission.</summary>
    private Dictionary<string, int> Direitos(IEnumerable<Guid>? perfis)
    {
        var mapa = new Dictionary<string, int>(StringComparer.Ordinal);
        var colunas = new ColumnSet("entityname", "attributelogicalname", "canread", "cancreate", "canupdate");
        List<Entity> linhas;
        if (perfis == null)
        {
            linhas = AcessoUniverso.Todos(_s, new QueryExpression("fieldpermission") { ColumnSet = colunas });
            foreach (var t in Metadados(null, null, true))
                foreach (var c in t.Value.Where(c => c.Value)) mapa[t.Key + "." + c.Key] = Ler | Criar | Gravar;
        }
        else
            linhas = Em("fieldpermission", "fieldsecurityprofileid", perfis, colunas);
        bool Pode(Entity l, string coluna) => l.GetAttributeValue<OptionSetValue>(coluna)?.Value == 4;
        foreach (var l in linhas)
        {
            var chave = l.GetAttributeValue<string>("entityname") + "." + l.GetAttributeValue<string>("attributelogicalname");
            var d = perfis == null ? Ler | Criar | Gravar : (Pode(l, "canread") ? Ler : 0) | (Pode(l, "cancreate") ? Criar : 0) | (Pode(l, "canupdate") ? Gravar : 0);
            mapa[chave] = (mapa.TryGetValue(chave, out var atual) ? atual : 0) | d;
        }
        return mapa;
    }

    private List<(string Coluna, int Perde)> ColunasPerdidas(IEnumerable<Guid>? antes, IEnumerable<Guid> depois)
    {
        var fica = Direitos(depois);
        return Direitos(antes)
            .Select(kv => (Coluna: kv.Key, Perde: kv.Value & ~(fica.TryGetValue(kv.Key, out var f) ? f : 0)))
            .Where(c => c.Perde != 0).OrderBy(c => c.Coluna, StringComparer.Ordinal).ToList();
    }

    /// <summary>Apps model-driven que deixam de abrir: os dos papéis de antes (todos, para o Administrador do Sistema) fora os dos papéis de depois.
    /// O app cita o papel da unidade raiz; papel de equipe sem herança não conta no depois. Apps canvas compartilhados não entram.</summary>
    private List<string> Apps(bool adminAntes, IEnumerable<PapelEfetivo> antes, IEnumerable<PapelEfetivo> depois)
    {
        var depoisQueContam = depois.Where(p => !p.SemHeranca).ToList();
        var papeis = (adminAntes ? depoisQueContam : antes.Concat(depoisQueContam)).SelectMany(p => new[] { p.Id, p.Raiz }).ToList();
        var appsDoPapel = Pares("appmoduleroles", "roleid", papeis, "appmoduleid");
        var colunas = new ColumnSet("name", "appmoduleidunique");
        var linhas = adminAntes
            ? AcessoUniverso.Todos(_s, new QueryExpression("appmodule") { ColumnSet = colunas })
            : Em("appmodule", "appmoduleid", appsDoPapel.SelectMany(g => g), colunas);
        var nomes = new Dictionary<Guid, string>();
        foreach (var app in linhas) nomes[app.Id] = app.GetAttributeValue<string>("name") ?? "";
        var semNome = appsDoPapel.SelectMany(g => g).Where(id => !nomes.ContainsKey(id)).ToList();
        foreach (var app in adminAntes ? linhas : Em("appmodule", "appmoduleidunique", semNome, colunas))
        {
            var unico = IdDe(app, "appmoduleidunique");
            if (unico != Guid.Empty && !nomes.ContainsKey(unico)) nomes[unico] = app.GetAttributeValue<string>("name") ?? "";
        }
        HashSet<string> DosPapeis(IEnumerable<PapelEfetivo> lista) => new(
            lista.SelectMany(p => new[] { p.Id, p.Raiz }).Distinct().SelectMany(r => appsDoPapel[r]).Where(nomes.ContainsKey).Select(id => nomes[id]), StringComparer.Ordinal);
        var tinha = adminAntes ? new HashSet<string>(linhas.Select(a => a.GetAttributeValue<string>("name") ?? ""), StringComparer.Ordinal) : DosPapeis(antes);
        tinha.ExceptWith(DosPapeis(depoisQueContam));
        return tinha.Where(n => n.Length > 0).OrderBy(n => n, StringComparer.Ordinal).ToList();
    }

    /// <summary>Flows de nuvem ligados de que a pessoa é dona ou coproprietária (principalobjectaccess) e que param: tipo "admin" (perde o Administrador do Sistema),
    /// "tabela" (perde privilégio numa tabela que o flow usa) ou "incerto" (não deu para ler as tabelas do flow e há perda).</summary>
    private List<(string Nome, string Tipo, bool Dona)> Flows(Guid usuario, AcessoUniverso universo, Dictionary<string, Perda> perdas, bool perdeAdmin)
    {
        if (!perdeAdmin && perdas.Count == 0) return new List<(string, string, bool)>();
        var colunas = perdeAdmin ? new ColumnSet("name") : new ColumnSet("name", "clientdata");
        static void Ligados(FilterExpression f)
        {
            f.AddCondition("category", ConditionOperator.Equal, 5);
            f.AddCondition("statecode", ConditionOperator.Equal, 1);
        }
        var donos = new QueryExpression("workflow") { ColumnSet = colunas };
        Ligados(donos.Criteria);
        donos.Criteria.AddCondition("ownerid", ConditionOperator.Equal, usuario);
        var achados = AcessoUniverso.Todos(_s, donos).Select(w => (Flow: w, Dona: true)).ToList();
        var proprios = new HashSet<Guid>(achados.Select(a => a.Flow.Id));
        var compartilhados = new QueryExpression("principalobjectaccess") { ColumnSet = new ColumnSet("objectid") };
        compartilhados.Criteria.AddCondition("principalid", ConditionOperator.Equal, usuario);
        compartilhados.Criteria.AddCondition("objecttypecode", ConditionOperator.Equal, "workflow");
        var ids = AcessoUniverso.Todos(_s, compartilhados).Select(p => IdDe(p, "objectid")).Where(id => id != Guid.Empty && !proprios.Contains(id));
        achados.AddRange(Em("workflow", "workflowid", ids, colunas, Ligados).Select(w => (w, false)));
        var perdidas = TabelasPerdidas(perdas);
        var lista = new List<(string, string, bool)>();
        foreach (var (w, dona) in achados)
        {
            var nome = w.GetAttributeValue<string>("name") ?? "";
            if (perdeAdmin) { lista.Add((nome, "admin", dona)); continue; }
            var (tabelas, incerto) = TabelasDoFlow(w.GetAttributeValue<string>("clientdata"), universo);
            if (tabelas.Any(perdidas.Contains)) lista.Add((nome, "tabela", dona));
            else if (incerto) lista.Add((nome, "incerto", dona));
        }
        return lista.OrderBy(f => f.Item1, StringComparer.Ordinal).ToList();
    }

    /// <summary>Tabelas que o flow toca pelo conector do Dataverse; operação sem tabela conhecida deixa o flow incerto.</summary>
    public static (List<string> Tabelas, bool Incerto) TabelasDoFlow(string? clientdata, AcessoUniverso universo)
    {
        Dictionary<string, object?> raiz;
        try { raiz = JsonLeve.Ler(clientdata ?? ""); }
        catch (Exception) { return (new List<string>(), true); }
        var definicao = raiz.TryGetValue("properties", out var p) && p is Dictionary<string, object?> props && props.TryGetValue("definition", out var d) ? d : null;
        if (definicao == null) return (new List<string>(), true);
        var tabelas = new SortedSet<string>(StringComparer.Ordinal);
        var incerto = false;
        void Visitar(object? no)
        {
            if (no is List<object?> itens) { foreach (var i in itens) Visitar(i); return; }
            if (no is not Dictionary<string, object?> obj) return;
            if (obj.TryGetValue("inputs", out var inp) && inp is Dictionary<string, object?> inputs && inputs.TryGetValue("host", out var host) && Contem(host, "commondataservice"))
            {
                var parametros = inputs.TryGetValue("parameters", out var pr) ? pr as Dictionary<string, object?> : null;
                object? bruto = null;
                if (parametros != null && !parametros.TryGetValue("entityName", out bruto)) parametros.TryGetValue("subscriptionRequest/entityname", out bruto);
                if (bruto is string nome && !nome.Contains("@") && universo.Tabelas.TryGetValue(nome, out var logico)) tabelas.Add(logico);
                else incerto = true;
            }
            foreach (var v in obj.Values) Visitar(v);
        }
        Visitar(definicao);
        return (tabelas.ToList(), incerto);
    }

    private static bool Contem(object? no, string texto) => no switch
    {
        string s => s.IndexOf(texto, StringComparison.OrdinalIgnoreCase) >= 0,
        Dictionary<string, object?> d => d.Values.Any(v => Contem(v, texto)),
        List<object?> l => l.Any(v => Contem(v, texto)),
        _ => false,
    };

    private List<string> Conexoes(Guid usuario)
    {
        var q = new QueryExpression("connectionreference") { ColumnSet = new ColumnSet("connectionreferencedisplayname", "connectionreferencelogicalname") };
        q.Criteria.AddCondition("ownerid", ConditionOperator.Equal, usuario);
        q.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        return AcessoUniverso.Todos(_s, q)
            .Select(c => c.GetAttributeValue<string>("connectionreferencedisplayname") ?? c.GetAttributeValue<string>("connectionreferencelogicalname") ?? "")
            .OrderBy(n => n, StringComparer.Ordinal).ToList();
    }
}
