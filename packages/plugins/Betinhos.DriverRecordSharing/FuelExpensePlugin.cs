using System;
using Microsoft.Xrm.Sdk;

namespace Betinhos.DriverRecordSharing
{
    // Steps assíncronos Create/Update/Delete de cr40f_despesaoperacional. Só agem em Abastecimento: Create/Update gravam a comparação
    // de preço na despesa e recalculam o resumo do mês do motorista; Update com pré-imagem também recalcula o resumo antigo quando a despesa
    // mudou de mês, motorista ou deixou de ser combustível; Delete recalcula o resumo da despesa excluída. As colunas que grava ficam fora do filtro do step.
    public sealed class FuelExpensePlugin : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context.Depth > 2 || context.PrimaryEntityName != FuelSchema.Despesa) return;
            var pre = context.PreEntityImages != null && context.PreEntityImages.Contains(PluginConfig.PreImageAlias) ? context.PreEntityImages[PluginConfig.PreImageAlias] : null;
            var system = factory.CreateOrganizationService(null);
            if (context.MessageName == "Delete") ProcessDelete(system, pre, tracing);
            else Process(system, context.PrimaryEntityId, PostoGeocoder.HttpGet, tracing, context.MessageName == "Update" ? pre : null);
        }

        // Despesa excluída: recalcula o resumo do mês/motorista dela (a pré-imagem é o único retrato que sobra).
        public static void ProcessDelete(IOrganizationService system, Entity pre, ITracingService tracing)
        {
            if (pre == null) return;
            var repo = new FuelRepository(system);
            if (RecomputeOld(repo, pre, null)) tracing?.Trace("Combustivel: despesa excluída {0}; resumo antigo recalculado", pre.Id);
        }

        // pre: pré-imagem do Update (motorista, categoria, data, veículo antes da alteração); sem ela só o resumo novo é recalculado.
        public static void Process(IOrganizationService system, Guid expenseId, PostoGeocoder.Get get, ITracingService tracing, Entity pre = null)
        {
            var repo = new FuelRepository(system);
            var expense = repo.LoadExpense(expenseId);
            var isFuel = repo.IsFuel(expense);
            if (pre != null && RecomputeOld(repo, pre, isFuel ? expense : null)) tracing?.Trace("Combustivel: despesa={0} mudou de mês/motorista/categoria; resumo antigo recalculado", expenseId);
            if (!isFuel) return;

            var valor = expense.GetAttributeValue<Money>("cr40f_valor")?.Value ?? 0m;
            var litros = expense.GetAttributeValue<decimal?>("cr40f_litros") ?? 0m;
            var preco = FuelMath.PricePerLiter(valor, litros);
            var data = expense.GetAttributeValue<DateTime>("cr40f_datagasto");
            var motorista = expense.GetAttributeValue<EntityReference>(FuelSchema.DespesaMotorista);

            var cnpj = FuelRepository.DigitsOnly(expense.GetAttributeValue<string>("new_cnpjposto"));
            var posto = cnpj.Length == 14 ? repo.EnsurePosto(cnpj, get) : null;
            var pendente = posto != null && posto.GetAttributeValue<OptionSetValue>("new_statusgeo")?.Value == FuelSchema.StatusGeoPendente;
            var lat = pendente ? null : posto?.GetAttributeValue<decimal?>("new_latitude");
            var lon = pendente ? null : posto?.GetAttributeValue<decimal?>("new_longitude");

            FuelComparison.Result result;
            if (preco == null)
                result = new FuelComparison.Result { Status = posto == null ? "sem_cnpj" : "sem_referencia" };
            else
            {
                var target = new FuelComparison.Fueling(expenseId, data, preco.Value, litros, posto?.Id, posto?.GetAttributeValue<string>("new_name"),
                    (double?)lat, (double?)lon, motorista?.Id);
                result = FuelComparison.Compare(target, repo.LoadNeighbors(data));
            }
            repo.SaveComparison(expenseId, preco, posto?.Id, result);

            if (motorista != null)
                repo.RecomputeMonth(motorista.Id, FuelRepository.MonthOf(data), expense.GetAttributeValue<EntityReference>(FuelSchema.DespesaCategoria).Id);
            tracing?.Trace("Combustivel: despesa={0} status={1} refs={2}", expenseId, result.Status, result.Referencias);
        }

        // Recalcula o resumo descrito pela pré-imagem, se ela era combustível e a despesa atual (null = excluída ou já não é combustível) não cai no mesmo resumo.
        private static bool RecomputeOld(FuelRepository repo, Entity pre, Entity current)
        {
            var motorista = pre.GetAttributeValue<EntityReference>(FuelSchema.DespesaMotorista);
            var categoria = pre.GetAttributeValue<EntityReference>(FuelSchema.DespesaCategoria);
            var data = pre.GetAttributeValue<DateTime?>("cr40f_datagasto");
            if (motorista == null || categoria == null || data == null || !repo.IsFuel(pre)) return false;

            var mes = FuelRepository.MonthOf(data.Value);
            if (current != null)
            {
                var newMotorista = current.GetAttributeValue<EntityReference>(FuelSchema.DespesaMotorista);
                var newCategoria = current.GetAttributeValue<EntityReference>(FuelSchema.DespesaCategoria);
                var newData = current.GetAttributeValue<DateTime?>("cr40f_datagasto");
                if (newMotorista?.Id == motorista.Id && newCategoria?.Id == categoria.Id && newData != null && FuelRepository.MonthOf(newData.Value) == mes) return false;
            }
            repo.RecomputeMonth(motorista.Id, mes, categoria.Id);
            return true;
        }
    }
}
