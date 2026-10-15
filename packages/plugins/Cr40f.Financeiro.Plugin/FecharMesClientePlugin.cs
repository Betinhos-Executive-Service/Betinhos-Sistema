using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json;

namespace Cr40f.Financeiro.Plugin;

public sealed class FecharMesClientePlugin : IPlugin
{
    const string ReservaSaida = "cr40f_dataehorriodesada";
    const string ReservaCliente = "cr40f_cliente";
    const string Cliente = "cr40f_clientes1";

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            var userService = factory.CreateOrganizationService(context.UserId);
            var systemService = factory.CreateOrganizationService(null);

            var json = context.InputParameters.Contains("cr40f_RequestJson") ? context.InputParameters["cr40f_RequestJson"] as string : null;
            FecharMesRequest request;
            try
            {
                request = JsonConvert.DeserializeObject<FecharMesRequest>(json ?? "") ?? throw new InvalidPluginExecutionException("Payload inválido.");
            }
            catch (JsonException)
            {
                throw new InvalidPluginExecutionException("Payload inválido.");
            }
            request.Validate();
            FechamentoMensal.ValidarMes(request.Mes, DateTime.UtcNow);

            var response = Executar(userService, systemService, tracing, request, context.UserId, context.SharedVariables);
            context.OutputParameters["cr40f_ResponseJson"] = JsonConvert.SerializeObject(response);
        }
        catch (Exception error)
        {
            tracing.Trace("cr40f_FecharMesCliente: {0}", error);
            throw error is InvalidPluginExecutionException ? error : new InvalidPluginExecutionException("Não foi possível fechar o mês. " + error.Message, error);
        }
    }

    static FecharMesResponse Executar(IOrganizationService userService, IOrganizationService systemService, ITracingService tracing, FecharMesRequest request, Guid usuarioId, ParameterCollection shared)
    {
        var (ini, fim) = FechamentoMensal.Janela(request.Mes);
        var query = new QueryExpression(Codigos.Reserva) { ColumnSet = new ColumnSet(ReservaSaida, Codigos.ReservaCpLookup, "cr40f_status", Codigos.ReservaFatStatus, Codigos.ReservaOpLookup) };
        query.Criteria.AddCondition(ReservaCliente, ConditionOperator.Equal, request.ClienteId);
        query.Criteria.AddCondition(Codigos.ReservaFatStatus, ConditionOperator.Equal, Codigos.ReservaFatMensal);
        query.Criteria.AddCondition("cr40f_status", ConditionOperator.Equal, Codigos.ReservaConcluida);
        query.Criteria.AddCondition(Codigos.ReservaOpLookup, ConditionOperator.Null);
        query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        query.Criteria.AddCondition(ReservaSaida, ConditionOperator.GreaterEqual, ini);
        query.Criteria.AddCondition(ReservaSaida, ConditionOperator.LessThan, fim);
        var entidades = userService.RetrieveMultiple(query).Entities.Where(e => e.GetAttributeValue<DateTime?>(ReservaSaida) != null).ToList();

        var cpIds = entidades.Select(e => e.GetAttributeValue<EntityReference>(Codigos.ReservaCpLookup)?.Id).Where(i => i != null).Select(i => i!.Value).Distinct().ToList();
        var cpValores = new Dictionary<Guid, int>();
        if (cpIds.Count > 0)
        {
            var cpQuery = new QueryExpression(Codigos.Composicao) { ColumnSet = new ColumnSet(Codigos.CpValor) };
            cpQuery.Criteria.AddCondition(Codigos.Composicao + "id", ConditionOperator.In, cpIds.Cast<object>().ToArray());
            foreach (var cp in userService.RetrieveMultiple(cpQuery).Entities)
            {
                var valor = cp.GetAttributeValue<Money>(Codigos.CpValor);
                if (valor != null) cpValores[cp.Id] = (int)Math.Round(valor.Value * 100m, MidpointRounding.AwayFromZero);
            }
        }

        var reservas = entidades.Select(e =>
        {
            var cpId = e.GetAttributeValue<EntityReference>(Codigos.ReservaCpLookup)?.Id;
            return new ReservaMensal
            {
                Id = e.Id,
                SaidaUtc = DateTime.SpecifyKind(e.GetAttributeValue<DateTime>(ReservaSaida), DateTimeKind.Utc),
                Status = e.GetAttributeValue<OptionSetValue>("cr40f_status")?.Value,
                FatStatus = e.GetAttributeValue<OptionSetValue>(Codigos.ReservaFatStatus)?.Value,
                TemOp = e.GetAttributeValue<EntityReference>(Codigos.ReservaOpLookup) != null,
                CpValorCents = cpId != null && cpValores.TryGetValue(cpId.Value, out var c) ? c : (int?)null
            };
        }).ToList();

        var elegiveis = FechamentoMensal.Elegiveis(reservas, request.Mes);
        if (elegiveis.Count == 0) throw new InvalidPluginExecutionException("Nenhum serviço mensal concluído sem OP para este cliente no mês.");
        var totalCents = FechamentoMensal.TotalCents(elegiveis);

        var cliente = systemService.Retrieve(Cliente, request.ClienteId, new ColumnSet("cr40f_nomedocliente"));
        var primeiro = elegiveis.Min(r => r.SaidaUtc).AddHours(-3).Date;
        var ultimo = elegiveis.Max(r => r.SaidaUtc).AddHours(-3).Date;
        var valorTotal = totalCents / 100m;

        var op = new Entity(Codigos.Op);
        op[Codigos.OpStatus] = new OptionSetValue(Codigos.OpAberta);
        op[Codigos.OpValor] = new Money(valorTotal);
        op["new_clientedaop"] = cliente.GetAttributeValue<string>("cr40f_nomedocliente");
        op["cr40f_datado1servico"] = primeiro;
        op["cr40f_datadoultimoservico"] = ultimo;
        var opId = userService.Create(op);

        shared[SincronizarFinanceiroPlugin.SharedFlag] = true;
        var motivo = "Fechamento mensal " + request.Mes;
        foreach (var r in elegiveis)
        {
            var update = new Entity(Codigos.Reserva, r.Id);
            update[Codigos.ReservaOpLookup] = new EntityReference(Codigos.Op, opId);
            systemService.Update(update);
            LogWriter.Write(systemService, opId, r.Id, Codigos.Reserva, Codigos.ReservaOpLookup, null, opId.ToString(), motivo, MudancaApplier.OrigemManual, usuarioId);
        }
        tracing.Trace("cr40f_FecharMesCliente cliente={0} mes={1} op={2} reservas={3}", request.ClienteId, request.Mes, opId, elegiveis.Count);
        return new FecharMesResponse { OpId = opId, Reservas = elegiveis.Count, Valor = valorTotal };
    }
}
