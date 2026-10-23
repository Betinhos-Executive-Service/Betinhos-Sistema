using System;
using System.Collections.Generic;
using System.Linq;
using Cr40f.Acesso.Plugin;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin.Tests;

/// <summary>addUser em memória: deixa o systemuser habilitado e licenciado no FakeService (ou não, para simular atraso).</summary>
public sealed class FakePowerPlatformGateway : IPowerPlatformGateway
{
    private readonly FakeService _svc;
    public FakePowerPlatformGateway(FakeService svc) { _svc = svc; }
    public List<Guid> Sincronizados { get; } = new();
    public bool CriarSystemuser { get; set; } = true;
    public bool Falhar { get; set; }

    public void SincronizarUsuario(Guid objectId)
    {
        Sincronizados.Add(objectId);
        if (Falhar) throw new AcessoException("GRAPH_INDISPONIVEL", "403 no addUser do Power Platform");
        if (!CriarSystemuser) return;
        var consulta = new QueryExpression("systemuser");
        consulta.Criteria.AddCondition("azureactivedirectoryobjectid", ConditionOperator.Equal, objectId);
        var existente = _svc.RetrieveMultiple(consulta).Entities.FirstOrDefault();
        if (existente is null) _svc.Com(existente = new Entity("systemuser", Guid.NewGuid()) { ["azureactivedirectoryobjectid"] = objectId });
        existente["isdisabled"] = false; existente["islicensed"] = true;
    }
}
