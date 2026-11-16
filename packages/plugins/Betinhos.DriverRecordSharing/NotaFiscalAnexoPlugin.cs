using System;
using System.Globalization;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    // Steps síncronos de pré-operação (stage 20) no Create e no Update (filtro cr40f_chaveacesso, cr40f_situacaonota) de
    // cr40f_anexodespesaoperacional. É o bloqueio que vale para a chave da nota fiscal (o do app é só aviso):
    // revalida a chave, confere o mês contra a data da despesa e recusa a chave já usada em outra despesa que não foi
    // cancelada nem recusada. Preenche a decomposição (UF, AAMM, CNPJ, modelo, número) e a situação "verificada".
    // Registro do plugin type e dos steps: packages/plugins/scripts/register-notafiscal-anexo-plugin.ps1 (à mão, só DEV).
    public sealed class NotaFiscalAnexoPlugin : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            if (context.PrimaryEntityName != NotaFiscalAnexo.Tabela) return;
            if (context.MessageName != "Create" && context.MessageName != "Update") return;
            if (!(context.InputParameters["Target"] is Entity target)) return;
            // Serviço elevado: o motorista não lê os anexos dos outros, e a repetida tem de olhar todos.
            var system = factory.CreateOrganizationService(null);
            new NotaFiscalAnexo(system, tracing).AoGravar(target, context.MessageName == "Update");
        }
    }

    public sealed class NotaFiscalAnexo
    {
        public const string Tabela = "cr40f_anexodespesaoperacional";
        public const string Despesa = "cr40f_despesaoperacional";
        public const string ColunaChave = "cr40f_chaveacesso";
        public const string ColunaSituacao = "cr40f_situacaonota";
        public const string ColunaDespesa = "cr40f_despesa";

        // Choices da migration 20261116-2100-chave-nota-fiscal.ps1 (a ordem é o contrato).
        public const int SituacaoVerificada = 100000000;
        public const int SituacaoNaoVerificada = 100000001;
        public const int SituacaoSemNota = 100000002;

        // cr40f_statusoperacional da despesa: Recusado e Cancelado não contam como uso da nota.
        public const int StatusRecusado = 100000003;
        public const int StatusCancelado = 100000004;

        public static readonly string[] ColunasDecompostas = { "cr40f_notauf", "cr40f_notaaamm", "cr40f_notacnpjemitente", "cr40f_notamodelo", "cr40f_notanumero" };

        private readonly IOrganizationService _system;
        private readonly ITracingService _tracing;

        public NotaFiscalAnexo(IOrganizationService system, ITracingService tracing)
        {
            _system = system;
            _tracing = tracing;
        }

        public sealed class Conferencia
        {
            public ChaveNotaFiscal.Nota Nota;
            public string Erro;
            public bool Repetida;
            public DateTime? UsadaEm;
        }

        public void AoGravar(Entity target, bool update)
        {
            if (update && !target.Contains(ColunaChave) && !target.Contains(ColunaSituacao)) return;
            var atual = update ? _system.Retrieve(Tabela, target.Id, new ColumnSet(ColunaChave, ColunaDespesa)) : null;
            var chaveAtual = atual?.GetAttributeValue<string>(ColunaChave);
            var chave = target.Contains(ColunaChave) ? target.GetAttributeValue<string>(ColunaChave) : chaveAtual;
            var situacao = target.GetAttributeValue<OptionSetValue>(ColunaSituacao)?.Value;

            if (string.IsNullOrWhiteSpace(chave))
            {
                if (situacao == SituacaoVerificada) throw new InvalidPluginExecutionException("A nota só fica \"chave conferida\" com a chave de acesso.");
                if (target.Contains(ColunaChave)) foreach (var coluna in ColunasDecompostas) target[coluna] = null;
                return;
            }
            // Update que não mexe na chave (reenvio do mesmo valor, troca só da situação para verificada) não revalida.
            var normalizada = ChaveNotaFiscal.Normalizar(chave);
            if (update && string.Equals(normalizada, chaveAtual, StringComparison.Ordinal))
            {
                if (situacao.HasValue && situacao != SituacaoVerificada) throw new InvalidPluginExecutionException("Anexo com chave de acesso fica com a situação \"chave conferida\".");
                return;
            }

            var despesa = target.GetAttributeValue<EntityReference>(ColunaDespesa) ?? atual?.GetAttributeValue<EntityReference>(ColunaDespesa);
            var resultado = Conferir(normalizada, despesa?.Id, DataDaDespesa(despesa?.Id), update ? target.Id : (Guid?)null);
            if (resultado.Erro != null)
            {
                _tracing?.Trace("NotaFiscalAnexo recusou: {0}", resultado.Repetida ? "repetida" : "validacao");
                throw new InvalidPluginExecutionException(resultado.Erro);
            }
            var nota = resultado.Nota;
            target[ColunaChave] = nota.Chave;
            target["cr40f_notauf"] = nota.Uf;
            target["cr40f_notaaamm"] = nota.Aamm;
            target["cr40f_notacnpjemitente"] = nota.Cnpj;
            target["cr40f_notamodelo"] = nota.Modelo;
            target["cr40f_notanumero"] = nota.Numero;
            target[ColunaSituacao] = new OptionSetValue(SituacaoVerificada);
            _tracing?.Trace("NotaFiscalAnexo chave conferida modelo={0} uf={1}", nota.Modelo, nota.Uf);
        }

        /// <summary>
        /// Valida a chave, o mês (quando a data da despesa é conhecida) e a repetida. `despesaId`: anexos da mesma despesa não
        /// contam (dois comprovantes do mesmo cupom). `anexoProprio`: o próprio anexo num update.
        /// </summary>
        public Conferencia Conferir(string chave, Guid? despesaId, DateTime? dataDespesa, Guid? anexoProprio)
        {
            var nota = ChaveNotaFiscal.Validar(chave, out var erro);
            if (nota == null) return new Conferencia { Erro = erro };
            if (dataDespesa.HasValue && !ChaveNotaFiscal.MesConfere(nota.Aamm, dataDespesa.Value))
                return new Conferencia { Erro = "Esta nota é de " + ChaveNotaFiscal.MesPorExtenso(nota.Aamm) + ", e o gasto está em outro mês." };

            var query = new QueryExpression(Tabela) { ColumnSet = new ColumnSet(ColunaDespesa, "createdon") };
            query.Criteria.AddCondition(ColunaChave, ConditionOperator.Equal, nota.Chave);
            var usos = _system.RetrieveMultiple(query).Entities
                .Where(outro => !anexoProprio.HasValue || outro.Id != anexoProprio.Value)
                .Select(outro => new { Despesa = outro.GetAttributeValue<EntityReference>(ColunaDespesa), Criado = outro.GetAttributeValue<DateTime?>("createdon") })
                .Where(uso => uso.Despesa != null && (!despesaId.HasValue || uso.Despesa.Id != despesaId.Value))
                .Select(uso => new { Valendo = DespesaValendo(uso.Despesa.Id, out var lancadaEm), Quando = lancadaEm ?? uso.Criado })
                .Where(uso => uso.Valendo)
                .ToList();
            if (usos.Count == 0) return new Conferencia { Nota = nota };
            var usadaEm = usos.Where(uso => uso.Quando.HasValue).Select(uso => uso.Quando).Min();
            var data = usadaEm.HasValue ? ", lançada em " + ChaveNotaFiscal.DiaDaOperacao(usadaEm.Value).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture) : "";
            return new Conferencia { Repetida = true, UsadaEm = usadaEm, Erro = "Esta nota já foi usada em outra despesa" + data + "." };
        }

        /// <summary>Data do gasto da despesa, no dia da operação; null quando não há despesa ou ela não foi lida.</summary>
        public DateTime? DataDaDespesa(Guid? despesaId)
        {
            if (!despesaId.HasValue) return null;
            try
            {
                var valor = _system.Retrieve(Despesa, despesaId.Value, new ColumnSet("cr40f_datagasto")).GetAttributeValue<DateTime?>("cr40f_datagasto");
                return valor.HasValue ? ChaveNotaFiscal.DiaDaOperacao(valor.Value) : (DateTime?)null;
            }
            catch (Exception error)
            {
                _tracing?.Trace("NotaFiscalAnexo despesa ilegivel: {0}", error.GetType().Name);
                return null;
            }
        }

        private bool DespesaValendo(Guid despesaId, out DateTime? criadaEm)
        {
            criadaEm = null;
            Entity despesa;
            try { despesa = _system.Retrieve(Despesa, despesaId, new ColumnSet("cr40f_statusoperacional", "createdon")); }
            catch (Exception) { return false; }
            var status = despesa.GetAttributeValue<OptionSetValue>("cr40f_statusoperacional")?.Value;
            if (status == StatusRecusado || status == StatusCancelado) return false;
            criadaEm = despesa.GetAttributeValue<DateTime?>("createdon");
            return true;
        }
    }
}
