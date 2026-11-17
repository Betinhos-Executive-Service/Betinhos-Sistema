using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Frota.Plugin.Tests;

public sealed class Provedor : IServiceProvider, IOrganizationServiceFactory, ITracingService
{
    private readonly IPluginExecutionContext _ctx;
    private readonly FakeMundo _mundo;
    public Provedor(IPluginExecutionContext ctx, FakeMundo mundo) { _ctx = ctx; _mundo = mundo; }
    public object? GetService(Type tipo) =>
        tipo == typeof(IPluginExecutionContext) ? _ctx : tipo == typeof(IOrganizationServiceFactory) || tipo == typeof(ITracingService) ? this : null;
    public IOrganizationService CreateOrganizationService(Guid? userId) => _mundo;
    public void Trace(string format, params object[] args) => _mundo.Traces.Add(args.Length == 0 ? format : string.Format(format, args));
}

public static class Contexto
{
    public static RemoteExecutionContext Api(string mensagem, Dictionary<string, object> entradas)
    {
        var ctx = new RemoteExecutionContext { MessageName = mensagem, Depth = 1, UserId = Guid.NewGuid(), InitiatingUserId = Guid.NewGuid() };
        foreach (var e in entradas) ctx.InputParameters[e.Key] = e.Value;
        return ctx;
    }

    public static RemoteExecutionContext Gravacao(string mensagem, Entity alvo, Entity? pre = null, RemoteExecutionContext? pai = null, int stage = 20)
    {
        var ctx = new RemoteExecutionContext
        {
            MessageName = mensagem, PrimaryEntityName = alvo.LogicalName, PrimaryEntityId = alvo.Id, Stage = stage,
            Depth = pai == null ? 1 : 2, ParentContext = pai, UserId = Guid.NewGuid(), InitiatingUserId = Guid.NewGuid(),
        };
        ctx.InputParameters["Target"] = alvo;
        if (pre != null) ctx.PreEntityImages["pre"] = pre;
        return ctx;
    }

    public static void Rodar(IPlugin plugin, RemoteExecutionContext ctx, FakeMundo mundo) => plugin.Execute(new Provedor(ctx, mundo));
}
