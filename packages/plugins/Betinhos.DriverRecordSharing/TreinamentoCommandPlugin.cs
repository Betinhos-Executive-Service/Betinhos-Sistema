using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    /// Lembrete de treinamento: reenfileira o push (Pendente) das participações não concluídas, no máximo 1 a cada 24 h
    /// (contados desde cr40f_lembradoem ou, se vazio, desde a criação da participação).
    /// O envio é do flow "Push Treinamentos | Motoristas", igual ao dos comunicados.
    public sealed class TreinamentoCommandPlugin : IPlugin
    {
        private const string HeaderTable = "cr40f_treinamento";
        private const string ParticipacaoTable = "cr40f_treinamentoparticipacao";
        private const int Publicado = 100000001;
        private const int PushPendente = 100000000;
        private static readonly TimeSpan Intervalo = TimeSpan.FromHours(24);

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var caller = factory.CreateOrganizationService(context.InitiatingUserId);
            var system = factory.CreateOrganizationService(null);

            try
            {
                if (context.MessageName != "cr40f_LembrarTreinamento") throw new InvalidPluginExecutionException("Ação de treinamento desconhecida.");
                Lembrar(context, caller, system);
            }
            catch (InvalidPluginExecutionException) { throw; }
            catch (Exception error) { throw new InvalidPluginExecutionException("Falha ao lembrar o treinamento. Contate a operação.", error); }
        }

        private static Guid Input(IPluginExecutionContext context, string name, bool required)
        {
            if (context.InputParameters.Contains(name) && context.InputParameters[name] is Guid id && id != Guid.Empty) return id;
            if (required) throw new InvalidPluginExecutionException("Parâmetro " + name + " obrigatório.");
            return Guid.Empty;
        }

        private static void Lembrar(IPluginExecutionContext context, IOrganizationService caller, IOrganizationService system)
        {
            var treinamentoId = Input(context, "cr40f_TreinamentoId", true);
            var participacaoId = Input(context, "cr40f_ParticipacaoId", false);
            // Lido pelo chamador: quem não enxerga o treinamento não lembra ninguém.
            var header = caller.Retrieve(HeaderTable, treinamentoId, new ColumnSet("cr40f_estado"));
            if (header.GetAttributeValue<OptionSetValue>("cr40f_estado")?.Value != Publicado)
                throw new InvalidPluginExecutionException("Só treinamento publicado pode ser lembrado.");

            var query = new QueryExpression(ParticipacaoTable) { ColumnSet = new ColumnSet("cr40f_pushstatus", "cr40f_lembradoem", "cr40f_concluidoem", "createdon") };
            query.Criteria.AddCondition("cr40f_treinamento", ConditionOperator.Equal, treinamentoId);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            if (participacaoId != Guid.Empty) query.Criteria.AddCondition("cr40f_treinamentoparticipacaoid", ConditionOperator.Equal, participacaoId);
            var linhas = system.RetrieveMultiple(query).Entities;
            if (participacaoId != Guid.Empty && linhas.Count == 0) throw new InvalidPluginExecutionException("Participação não pertence a este treinamento.");

            var agora = DateTime.UtcNow;
            int enfileirados = 0, ignorados = 0;
            foreach (var linha in linhas.Where(row => !row.Contains("cr40f_concluidoem")))
            {
                var status = linha.GetAttributeValue<OptionSetValue>("cr40f_pushstatus")?.Value;
                // O primeiro push conta como lembrete: sem lembradoem, vale a criação da participação (nasce na publicação).
                var ultimoAviso = linha.GetAttributeValue<DateTime?>("cr40f_lembradoem") ?? linha.GetAttributeValue<DateTime?>("createdon");
                if (status == PushPendente || (ultimoAviso.HasValue && agora - ultimoAviso.Value < Intervalo)) { ignorados++; continue; }
                var update = new Entity(ParticipacaoTable, linha.Id);
                update["cr40f_pushstatus"] = new OptionSetValue(PushPendente);
                update["cr40f_pusherro"] = "";
                update["cr40f_lembradoem"] = agora;
                system.Update(update);
                enfileirados++;
            }
            context.OutputParameters["cr40f_Enfileirados"] = enfileirados;
            context.OutputParameters["cr40f_Ignorados"] = ignorados;
        }
    }
}
