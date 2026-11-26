using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

/// <summary>O "antes" e o "depois" de um pedido de perfis: o que o DefinirPerfis grava e a prévia simula.</summary>
public sealed class PlanoDePerfis
{
    public Entity Alvo { get; set; } = null!;
    public PerfisDoUsuario Antes { get; set; } = null!;
    public PerfisDoUsuario Pedido { get; set; } = null!;
    /// <summary>Papéis do catálogo (unidade do alvo e cópias da Frota): os únicos que o pedido troca.</summary>
    public HashSet<Guid> PapeisConhecidos { get; set; } = new();
    public List<Guid> PapeisAtuais { get; set; } = new();
    public List<Guid> PapeisQuerer { get; set; } = new();
    public HashSet<Guid> ColunasConhecidas { get; set; } = new();
    public List<Guid> ColunasAtuais { get; set; } = new();
    public List<Guid> ColunasQuerer { get; set; } = new();

    public List<Guid> PapeisDepois => AcessoPrevisao.Depois(PapeisAtuais, PapeisConhecidos, PapeisQuerer);
    public List<Guid> ColunasDepois => AcessoPrevisao.Depois(ColunasAtuais, ColunasConhecidas, ColunasQuerer);
}

/// <summary>Um privilégio dado por um papel: unidade do papel e profundidade.</summary>
public readonly struct Alcance
{
    public Alcance(Guid unidade, PrivilegeDepth profundidade) { Unidade = unidade; Profundidade = profundidade; }
    public Guid Unidade { get; }
    public PrivilegeDepth Profundidade { get; }
}

/// <summary>Papel lido para a prévia. Admin = todos os privilégios em Global. SemHeranca = papel de equipe com isinherited 0.</summary>
public sealed class PapelEfetivo
{
    public Guid Id { get; set; }
    public string Nome { get; set; } = "";
    public Guid Unidade { get; set; }
    /// <summary>Papel da unidade raiz de que este é cópia (parentrootroleid); é ele que os apps model-driven citam.</summary>
    public Guid Raiz { get; set; }
    public bool Admin { get; set; }
    public bool SemHeranca { get; set; }
    public List<(Guid Privilegio, PrivilegeDepth Profundidade)> Privilegios { get; set; } = new();
}

/// <summary>Regra única dos perfis: monta o "depois" de um pedido e compara a cobertura de privilégios antes e depois.</summary>
public static class AcessoPrevisao
{
    /// <summary>Recusa quem não é Administrador do Sistema nem Administrador de acessos; devolve se é Administrador do Sistema.</summary>
    public static bool Autorizar(IOrganizationService s, Guid chamador)
    {
        var papeis = PapeisDoUsuario.Nomes(s, chamador);
        var admin = AcessoCatalogo.EhAdminDoSistema(papeis);
        if (!admin && !papeis.Contains(AcessoCatalogo.AdminAcessos))
            throw new AcessoException("SEM_PERMISSAO", "Só o Administrador de acessos altera perfis.");
        return admin;
    }

    public static PlanoDePerfis Planejar(IOrganizationService s, bool chamadorAdmin, Guid usuario, string? perfisJson)
    {
        // Pedido ausente não pode virar "[]" (só o Base): só a lista vazia explícita retira as áreas.
        if (string.IsNullOrWhiteSpace(perfisJson)) throw new AcessoException("PERFIL_INVALIDO", "A lista de perfis é obrigatória (use [] para ficar só com o Base).");
        var pedido = AcessoCatalogo.LerPedido(perfisJson);
        var alvo = Alvo(s, usuario) ?? throw new AcessoException("USUARIO_INVALIDO", "Usuário não encontrado, desativado ou de aplicação.");
        var unidade = alvo.GetAttributeValue<EntityReference>("businessunitid")!.Id;
        var papeis = Catalogo(s, "role", unidade);
        var colunas = Catalogo(s, "fieldsecurityprofile", null);
        var copias = CopiasNaFrota(s, unidade, out var temFrota);
        var conhecidos = papeis.Concat(copias).ToList();
        var papeisAtuais = PapeisDoUsuario.IdsDiretos(s, usuario);
        var antes = AcessoCatalogo.DosPapeis(conhecidos.Where(p => papeisAtuais.Contains(p.Value)).Select(p => p.Key).Distinct());
        if (antes.Acessos != pedido.Acessos && !chamadorAdmin)
            throw new AcessoException("SEM_PERMISSAO", "Só o Administrador do Sistema concede ou retira o perfil Administrador de acessos.");

        var papeisDesejados = AcessoCatalogo.Papeis(pedido);
        papeisDesejados.Add(AcessoCatalogo.Base);
        var colunasDesejadas = AcessoCatalogo.Papeis(pedido);
        var faltam = papeisDesejados.Where(n => !papeis.ContainsKey(n)).Concat(colunasDesejadas.Where(n => !colunas.ContainsKey(n))).Distinct().ToList();
        if (faltam.Count > 0)
            throw new AcessoException("PERFIL_INDISPONIVEL", "Perfil ainda não publicado neste ambiente: " + string.Join("; ", faltam) + ".");

        // Com a unidade Frota, Frota Operador/Gestor vão pela cópia do papel nela; sem a cópia, recusa em vez de cair no papel raiz.
        var faltamCopias = temFrota ? papeisDesejados.Where(n => NomesFrota.Contains(n) && !copias.ContainsKey(n)).ToList() : new List<string>();
        if (faltamCopias.Count > 0)
            throw new AcessoException("PERFIL_INDISPONIVEL", "Perfil ainda não copiado para a unidade Frota: " + string.Join("; ", faltamCopias) + ".");

        return new PlanoDePerfis
        {
            Alvo = alvo, Antes = antes, Pedido = pedido,
            PapeisConhecidos = new HashSet<Guid>(conhecidos.Select(p => p.Value)),
            PapeisAtuais = papeisAtuais,
            PapeisQuerer = papeisDesejados.Select(n => copias.TryGetValue(n, out var c) ? c : papeis[n]).ToList(),
            ColunasConhecidas = new HashSet<Guid>(colunas.Values),
            ColunasAtuais = PapeisDoUsuario.Ids(s, "systemuserprofiles", "systemuserid", usuario, "fieldsecurityprofileid"),
            ColunasQuerer = colunasDesejadas.Select(n => colunas[n]).ToList(),
        };
    }

    /// <summary>O que fica: os atuais fora do universo conhecido, mais o que se quer.</summary>
    public static List<Guid> Depois(IEnumerable<Guid> atuais, ICollection<Guid> conhecidos, List<Guid> querer) =>
        atuais.Where(id => !conhecidos.Contains(id) || querer.Contains(id)).Concat(querer).Distinct().ToList();

    /// <summary>
    /// Perdas por privilégio. Perde quando algum alcance do "antes" não fica coberto pelo "depois".
    /// Papel sem herança nunca cobre: o que só ele dá, ou o que se perde e ele ainda daria para os registros da equipe, sai incerto.
    /// </summary>
    public static Dictionary<Guid, bool> Perdas(IReadOnlyCollection<PapelEfetivo> antes, IReadOnlyCollection<PapelEfetivo> depois,
        IEnumerable<Guid> universo, Guid raiz, Func<Guid, Guid, bool> descende)
    {
        var a = Alcances(antes, universo, raiz);
        var d = Alcances(depois, universo, raiz);
        var resultado = new Dictionary<Guid, bool>();
        foreach (var p in a.Cobre.Keys.Union(a.SemHeranca.Keys))
        {
            var depoisCobre = d.Cobre.TryGetValue(p, out var dc) ? dc : new List<Alcance>();
            var depoisSem = d.SemHeranca.TryGetValue(p, out var ds) ? ds : new List<Alcance>();
            var perdidos = (a.Cobre.TryGetValue(p, out var ac) ? ac : new List<Alcance>()).Where(x => !depoisCobre.Any(y => Cobre(y, x, descende))).ToList();
            var soDaEquipe = (a.SemHeranca.TryGetValue(p, out var asem) ? asem : new List<Alcance>())
                .Where(x => !depoisCobre.Concat(depoisSem).Any(y => Cobre(y, x, descende))).ToList();
            if (perdidos.Count == 0 && soDaEquipe.Count == 0) continue;
            var incerto = soDaEquipe.Count > 0 || perdidos.Any(x => depoisSem.Any(y => Cobre(y, x, descende)))
                || perdidos.Any(x => !Conhecida(x.Profundidade));
            resultado[p] = incerto;
        }
        return resultado;
    }

    private static bool Conhecida(PrivilegeDepth p) => p >= PrivilegeDepth.Basic && p <= PrivilegeDepth.Global;

    /// <summary>Global cobre tudo; Deep a unidade e as filhas; Local só a unidade; Basic só o que é da pessoa (qualquer alcance cobre).</summary>
    public static bool Cobre(Alcance depois, Alcance antes, Func<Guid, Guid, bool> descende)
    {
        if (!Conhecida(depois.Profundidade) || !Conhecida(antes.Profundidade)) return false;
        if (depois.Profundidade == PrivilegeDepth.Global) return true;
        return antes.Profundidade switch
        {
            PrivilegeDepth.Basic => true,
            PrivilegeDepth.Local => (depois.Profundidade == PrivilegeDepth.Local && depois.Unidade == antes.Unidade)
                || (depois.Profundidade == PrivilegeDepth.Deep && descende(antes.Unidade, depois.Unidade)),
            PrivilegeDepth.Deep => depois.Profundidade == PrivilegeDepth.Deep && descende(antes.Unidade, depois.Unidade),
            _ => false,
        };
    }

    private static (Dictionary<Guid, List<Alcance>> Cobre, Dictionary<Guid, List<Alcance>> SemHeranca) Alcances(
        IEnumerable<PapelEfetivo> papeis, IEnumerable<Guid> universo, Guid raiz)
    {
        var cobre = new Dictionary<Guid, List<Alcance>>();
        var sem = new Dictionary<Guid, List<Alcance>>();
        List<Guid>? todos = null;
        foreach (var papel in papeis)
        {
            var destino = papel.SemHeranca ? sem : cobre;
            var itens = papel.Admin
                ? (todos ??= universo.ToList()).Select(p => (p, new Alcance(raiz, PrivilegeDepth.Global)))
                : papel.Privilegios.Select(p => (p.Privilegio, new Alcance(papel.Unidade, p.Profundidade)));
            foreach (var (p, alcance) in itens)
            {
                if (!destino.TryGetValue(p, out var lista)) destino[p] = lista = new List<Alcance>();
                lista.Add(alcance);
            }
        }
        return (cobre, sem);
    }

    private static Entity? Alvo(IOrganizationService s, Guid usuario)
    {
        if (usuario == Guid.Empty) return null;
        var q = new QueryExpression("systemuser") { ColumnSet = new ColumnSet("isdisabled", "applicationid", "businessunitid", "fullname") };
        q.Criteria.AddCondition("systemuserid", ConditionOperator.Equal, usuario);
        var e = s.RetrieveMultiple(q).Entities.FirstOrDefault();
        if (e == null || e.GetAttributeValue<bool>("isdisabled") || e.GetAttributeValue<Guid?>("applicationid") != null
            || e.GetAttributeValue<EntityReference>("businessunitid") == null) return null;
        return e;
    }

    /// <summary>Nome → id dos registros da lista fixa (<see cref="AcessoCatalogo.Lista"/>) na tabela (papéis: só os da unidade de negócio do alvo). Nome repetido é recusado.</summary>
    private static Dictionary<string, Guid> Catalogo(IOrganizationService s, string tabela, Guid? unidade)
    {
        var q = new QueryExpression(tabela) { ColumnSet = new ColumnSet("name") };
        if (unidade is Guid id) q.Criteria.AddCondition("businessunitid", ConditionOperator.Equal, id);
        var mapa = new Dictionary<string, Guid>(StringComparer.Ordinal);
        foreach (var e in s.RetrieveMultiple(q).Entities)
        {
            var nome = e.GetAttributeValue<string>("name");
            if (nome == null || !AcessoCatalogo.EhDoCatalogo(nome)) continue;
            if (mapa.ContainsKey(nome)) throw new AcessoException("PERFIL_INDISPONIVEL", "Há mais de um registro chamado " + nome + " neste ambiente.");
            mapa[nome] = e.Id;
        }
        return mapa;
    }

    private static readonly HashSet<string> NomesFrota = new(new[] { "operador", "gestor" }.Select(n => AcessoCatalogo.NomeDoPapel("frota", n)), StringComparer.Ordinal);

    /// <summary>Cópias dos papéis Frota na unidade "Frota" filha da unidade do alvo; vazio quando a unidade não existe.</summary>
    private static Dictionary<string, Guid> CopiasNaFrota(IOrganizationService s, Guid buAlvo, out bool temUnidade)
    {
        var q = new QueryExpression("businessunit") { ColumnSet = new ColumnSet("name", "isdisabled") };
        q.Criteria.AddCondition("parentbusinessunitid", ConditionOperator.Equal, buAlvo);
        var frotas = s.RetrieveMultiple(q).Entities
            .Where(b => !b.GetAttributeValue<bool>("isdisabled") && string.Equals(b.GetAttributeValue<string>("name"), "Frota", StringComparison.OrdinalIgnoreCase))
            .ToList();
        if (frotas.Count > 1) throw new AcessoException("PERFIL_INDISPONIVEL", "Há mais de uma unidade Frota ativa neste ambiente.");
        temUnidade = frotas.Count == 1;
        if (!temUnidade) return new Dictionary<string, Guid>(StringComparer.Ordinal);
        return Catalogo(s, "role", frotas[0].Id).Where(p => NomesFrota.Contains(p.Key)).ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal);
    }
}
