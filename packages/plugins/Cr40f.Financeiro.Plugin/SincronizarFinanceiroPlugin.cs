using System;
using System.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Newtonsoft.Json;

namespace Cr40f.Financeiro.Plugin;

public sealed class SincronizarFinanceiroPlugin : IPlugin
{
    public const string SharedFlag = "cr40f_sync";

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        var userService = factory.CreateOrganizationService(context.UserId);
        var systemService = factory.CreateOrganizationService(null);

        if (!context.InputParameters.Contains("Target") || context.InputParameters["Target"] is not EntityReference target || target.LogicalName != Codigos.Op)
            throw new InvalidPluginExecutionException("A Custom API deve ser vinculada a uma OP.");
        var json = context.InputParameters.Contains("cr40f_RequestJson") ? context.InputParameters["cr40f_RequestJson"] as string : null;
        var request = string.IsNullOrWhiteSpace(json) ? new SincronizarRequest() : JsonConvert.DeserializeObject<SincronizarRequest>(json!) ?? new SincronizarRequest();
        request.Validate();

        var access = (RetrievePrincipalAccessResponse)userService.Execute(new RetrievePrincipalAccessRequest { Target = target, Principal = new EntityReference("systemuser", context.UserId) });
        if (!access.AccessRights.HasFlag(AccessRights.WriteAccess)) throw new InvalidPluginExecutionException("Sem permissão de escrita nesta OP.");

        var response = Executar(systemService, tracing, target.Id, request, context.UserId);
        if (request.Modo == "aplicar") context.SharedVariables[SharedFlag] = true;
        context.OutputParameters["cr40f_ResponseJson"] = JsonConvert.SerializeObject(response);
    }

    /// <summary>Compartilhado com o step automático (Task 9).</summary>
    public static SincronizarResponse Executar(IOrganizationService service, ITracingService tracing, Guid opId, SincronizarRequest request, Guid usuarioId)
    {
        var snapshot = SnapshotLoader.Load(service, opId);
        var mudancas = SyncEngine.Compute(snapshot);
        tracing.Trace("cr40f_SincronizarFinanceiro {0} op={1} mudancas={2}", request.Modo, opId, mudancas.Count);
        var response = new SincronizarResponse { OpId = opId, Modo = request.Modo };
        response.Mudancas.AddRange(mudancas.Select(MudancaDto.From));
        if (request.Modo == "aplicar" && mudancas.Count > 0)
        {
            MudancaApplier.Apply(service, opId, mudancas, request.Origem, usuarioId);
            response.Aplicadas = true;
        }
        return response;
    }
}
