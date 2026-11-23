using System;
using System.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    /// <summary>
    /// Recusa no servidor dos módulos desligados nas Custom APIs do App (checklists, postos próximos, minha nota): falha fechada só quando a
    /// configuração diz "desligado"; qualquer erro ao ler a configuração libera (só trace).
    /// </summary>
    public sealed class AppConfigGuardaTests
    {
        private static readonly DateTime Agora = new DateTime(2026, 11, 23, 15, 0, 0, DateTimeKind.Utc);

        private static ChecklistFakeService NovoMundo(out Entity ficha, string matriz = null)
        {
            var service = new ChecklistFakeService();
            ficha = service.Driver("Motorista", "m@exemplo.test", null, null);
            ficha["cr40f_tipodevinculo"] = new OptionSetValue(0);
            if (matriz != null)
                service.Rows("cr40f_appconfigversao").Add(new Entity("cr40f_appconfigversao", Guid.NewGuid())
                {
                    ["cr40f_numero"] = 1, ["cr40f_estado"] = new OptionSetValue(100000001), ["cr40f_conteudo"] = matriz
                });
            return service;
        }

        private static string Desligar(string chave) => "{\"proprio\":{\"" + chave + "\":false},\"terceiro\":{}}";

        [Theory]
        [InlineData(AppConfigLeitor.ChaveChecklists, AppConfigGuarda.ChecklistsDesligado)]
        [InlineData(AppConfigLeitor.ChavePostosProximos, AppConfigGuarda.PostosProximosDesligado)]
        [InlineData(AppConfigLeitor.ChaveMinhaNota, AppConfigGuarda.MinhaNotaDesligada)]
        public void Recusa_o_motorista_quando_o_modulo_esta_desligado(string chave, string mensagem)
        {
            var service = NovoMundo(out var ficha, Desligar(chave));
            var erro = Assert.Throws<InvalidPluginExecutionException>(() => AppConfigGuarda.Exigir(service, ficha.Id, chave, mensagem, null, () => Agora));
            Assert.Equal(mensagem, erro.Message);
            Assert.EndsWith("Procure o escritório.", erro.Message);
        }

        [Theory]
        [InlineData(AppConfigLeitor.ChaveChecklists, AppConfigGuarda.ChecklistsDesligado)]
        [InlineData(AppConfigLeitor.ChavePostosProximos, AppConfigGuarda.PostosProximosDesligado)]
        [InlineData(AppConfigLeitor.ChaveMinhaNota, AppConfigGuarda.MinhaNotaDesligada)]
        public void Libera_sem_configuracao_publicada_e_com_o_modulo_ligado(string chave, string mensagem)
        {
            var semConfig = NovoMundo(out var ficha1);
            AppConfigGuarda.Exigir(semConfig, ficha1.Id, chave, mensagem, null, () => Agora);
            var ligado = NovoMundo(out var ficha2, "{\"proprio\":{\"" + chave + "\":true},\"terceiro\":{}}");
            AppConfigGuarda.Exigir(ligado, ficha2.Id, chave, mensagem, null, () => Agora);
        }

        [Fact]
        public void Desligar_um_modulo_nao_barra_os_outros()
        {
            var service = NovoMundo(out var ficha, Desligar(AppConfigLeitor.ChaveMinhaNota));
            AppConfigGuarda.Exigir(service, ficha.Id, AppConfigLeitor.ChaveChecklists, AppConfigGuarda.ChecklistsDesligado, null, () => Agora);
            AppConfigGuarda.Exigir(service, ficha.Id, AppConfigLeitor.ChavePostosProximos, AppConfigGuarda.PostosProximosDesligado, null, () => Agora);
        }

        [Fact]
        public void Falha_ao_ler_a_configuracao_libera_e_so_registra_no_trace()
        {
            var tracing = new TraceColetor();
            AppConfigGuarda.Exigir(new ServicoQuebrado(), Guid.NewGuid(), AppConfigLeitor.ChaveChecklists, AppConfigGuarda.ChecklistsDesligado, tracing, () => Agora);
            Assert.Single(tracing.Linhas);
            Assert.Contains("liberado", tracing.Linhas[0]);
        }

        private sealed class TraceColetor : ITracingService
        {
            public readonly System.Collections.Generic.List<string> Linhas = new System.Collections.Generic.List<string>();
            public void Trace(string format, params object[] args) => Linhas.Add(args == null || args.Length == 0 ? format : string.Format(format, args));
        }

        private sealed class ServicoQuebrado : IOrganizationService
        {
            private static Exception Erro() => new InvalidOperationException("Dataverse fora do ar");
            public Guid Create(Entity entity) { throw Erro(); }
            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) { throw Erro(); }
            public void Update(Entity entity) { throw Erro(); }
            public void Delete(string entityName, Guid id) { throw Erro(); }
            public OrganizationResponse Execute(OrganizationRequest request) { throw Erro(); }
            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) { throw Erro(); }
            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) { throw Erro(); }
            public EntityCollection RetrieveMultiple(QueryBase query) { throw Erro(); }
        }
    }
}
