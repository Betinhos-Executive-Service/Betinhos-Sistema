using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;
using FakeService = Betinhos.DriverRecordSharing.Tests.ChecklistFakeService;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class ChecklistCommandPluginTests
    {
        private const int Foto = 100000000;
        private const int Numero = 100000001;
        private const int Texto = 100000002;
        private const int OkNok = 100000003;
        private const int AguardandoMotorista = 100000000;
        private const int Pendente = 100000001;
        private const int Concluido = 100000002;
        private const int Cancelado = 100000003;
        private const int PushPendente = 100000000;
        private const int PushEnviado = 100000001;

        [Fact]
        public void SolicitacaoManualCopiaItensDoModeloPadraoEAguardaMotorista()
        {
            var service = new FakeService();
            var vehicle = service.Vehicle("ABC1D23");
            service.Template(padrao: true);
            var context = Context(P("new_VeiculoId", vehicle.Id));

            Invoke("Request", context, service, service);

            var checklist = service.Rows("new_checklistveiculo").Single();
            Assert.Equal(AguardandoMotorista, Choice(checklist, "new_estado"));
            Assert.Equal(100000001, Choice(checklist, "new_origem"));
            Assert.Equal(checklist.Id, (Guid)context.OutputParameters["new_ChecklistId"]);
            var items = ChecklistAnswers.ParseItems(checklist.GetAttributeValue<string>("new_itensjson"));
            Assert.Equal(new[] { "Frente", "KM", "Observações", "Pneus" }, items.Select(item => item.Rotulo));
            Assert.Contains("Nenhum motorista", checklist.GetAttributeValue<string>("new_erroatribuicao"));
        }

        [Fact]
        public void SolicitacaoSemModeloPadraoUnicoEhRecusada()
        {
            var service = new FakeService();
            var vehicle = service.Vehicle("ABC1D23");
            service.Template(padrao: true);
            service.Template(padrao: true);

            AssertPluginError(() => Invoke("Request", Context(P("new_VeiculoId", vehicle.Id)), service, service));
            Assert.Empty(service.Rows("new_checklistveiculo"));
        }

        [Fact]
        public void RotinaCriaSomenteParaVeiculoProprioAtivoSemChecklistRecenteOuAberto()
        {
            var service = new FakeService();
            service.Template(padrao: true);
            var due = service.Vehicle("AAA0001");
            var withOpen = service.Vehicle("AAA0002");
            var recent = service.Vehicle("AAA0003");
            var old = service.Vehicle("AAA0004");
            service.Vehicle("AAA0005", proprio: false);
            service.Checklist(withOpen, Pendente);
            service.Checklist(recent, Concluido)["new_concluidoem"] = DateTime.UtcNow.AddDays(-3);
            service.Checklist(old, Concluido)["new_concluidoem"] = DateTime.UtcNow.AddDays(-20);
            var context = Context();

            Invoke("Process", context, service, DateTime.UtcNow);

            var created = service.Created.Where(row => row.LogicalName == "new_checklistveiculo").ToList();
            Assert.Equal(new[] { due.Id, old.Id }.OrderBy(id => id), created.Select(row => row.GetAttributeValue<EntityReference>("new_veiculo").Id).OrderBy(id => id));
            Assert.All(created, row => Assert.Equal(100000000, Choice(row, "new_origem")));
            Assert.Equal("criados=2;abertos=1;atribuidos=0", context.OutputParameters["new_Resumo"]);
        }

        [Fact]
        public void RotinaSemNenhumModeloAtivoIgnoraSemCriarChecklist()
        {
            var service = new FakeService();
            service.Vehicle("AAA0001");
            var context = Context();

            Invoke("Process", context, service, DateTime.UtcNow);

            Assert.Empty(service.Rows("new_checklistveiculo"));
            Assert.Equal("ignorado:sem-modelo-ativo", context.OutputParameters["new_Resumo"]);
        }

        [Fact]
        public void RotinaComModeloAtivoSemPadraoFalha()
        {
            var service = new FakeService();
            service.Template(padrao: false, name: "Blindados");
            service.Vehicle("AAA0001");

            AssertPluginError(() => Invoke("Process", Context(), service, DateTime.UtcNow));
            Assert.Empty(service.Rows("new_checklistveiculo"));
        }

        [Fact]
        public void SolicitacaoManualAtribuiQuemEstaComOVeiculo()
        {
            var service = new FakeService();
            var vehicle = service.Vehicle("ABC1D23", hodometro: 45210);
            service.Template(padrao: true);
            var driver = service.Driver("Motorista", "m@empresa.test", vehicle, DateTime.UtcNow.AddDays(-1));
            var user = service.User("m@empresa.test");

            Invoke("Request", Context(P("new_VeiculoId", vehicle.Id)), service, service);

            var checklist = service.Rows("new_checklistveiculo").Single();
            Assert.Equal(Pendente, Choice(checklist, "new_estado"));
            Assert.Equal(driver.Id, checklist.GetAttributeValue<EntityReference>("new_motorista").Id);
            Assert.Equal(user.Id, checklist.GetAttributeValue<EntityReference>("ownerid").Id);
            Assert.Equal(PushPendente, Choice(checklist, "new_pushstatus"));
            Assert.Equal(45210m, checklist.GetAttributeValue<decimal>("new_odometroinfleet"));
            Assert.Equal("", checklist.GetAttributeValue<string>("new_erroatribuicao"));
        }

        [Fact]
        public void AtribuicaoEscolheQuemPegouOVeiculoPorUltimo()
        {
            var service = new FakeService();
            var vehicle = service.Vehicle("ABC1D23");
            service.Driver("Anterior", "a@empresa.test", vehicle, DateTime.UtcNow.AddDays(-5));
            var latest = service.Driver("Atual", "b@empresa.test", vehicle, DateTime.UtcNow.AddHours(-2));
            service.User("a@empresa.test");
            service.User("b@empresa.test");
            var checklist = service.Checklist(vehicle, AguardandoMotorista);

            Invoke("AssignCurrentDriver", service, checklist.Id);

            Assert.Equal(latest.Id, checklist.GetAttributeValue<EntityReference>("new_motorista").Id);
        }

        [Fact]
        public void AtribuicaoComEmpateGravaErroParaOperacao()
        {
            var service = new FakeService();
            var vehicle = service.Vehicle("ABC1D23");
            var since = DateTime.UtcNow.AddDays(-1);
            service.Driver("Um", "a@empresa.test", vehicle, since);
            service.Driver("Dois", "b@empresa.test", vehicle, since);
            var checklist = service.Checklist(vehicle, AguardandoMotorista);

            Invoke("AssignCurrentDriver", service, checklist.Id);

            Assert.Equal(AguardandoMotorista, Choice(checklist, "new_estado"));
            Assert.Contains("Mais de um motorista", checklist.GetAttributeValue<string>("new_erroatribuicao"));
        }

        [Fact]
        public void AtribuicaoSemMotoristaGravaErroEMantemEstado()
        {
            var service = new FakeService();
            var checklist = service.Checklist(service.Vehicle("ABC1D23"), AguardandoMotorista);

            Invoke("AssignCurrentDriver", service, checklist.Id);

            Assert.Equal(AguardandoMotorista, Choice(checklist, "new_estado"));
            Assert.Contains("Nenhum motorista", checklist.GetAttributeValue<string>("new_erroatribuicao"));
            Assert.False(checklist.Contains("new_pushstatus"));
        }

        [Fact]
        public void AtribuicaoAoMesmoMotoristaNaoRepetePush()
        {
            var service = new FakeService();
            var vehicle = service.Vehicle("ABC1D23");
            var driver = service.Driver("Motorista", "m@empresa.test", vehicle, DateTime.UtcNow.AddDays(-1));
            var user = service.User("m@empresa.test");
            var checklist = service.Checklist(vehicle, Pendente, driver, user);
            checklist["new_pushstatus"] = new OptionSetValue(PushEnviado);

            Invoke("AssignCurrentDriver", service, checklist.Id);

            Assert.Equal(PushEnviado, Choice(checklist, "new_pushstatus"));
        }

        [Fact]
        public void TrocaDeMotoristaReatribuiChecklistPendente()
        {
            var service = new FakeService();
            var vehicle = service.Vehicle("ABC1D23");
            var old = service.Driver("Antigo", "a@empresa.test", null, null);
            var oldUser = service.User("a@empresa.test");
            var current = service.Driver("Novo", "b@empresa.test", vehicle, DateTime.UtcNow);
            var currentUser = service.User("b@empresa.test");
            var checklist = service.Checklist(vehicle, Pendente, old, oldUser);
            checklist["new_pushstatus"] = new OptionSetValue(PushEnviado);

            Invoke("RequestAssignment", Context(P("new_ChecklistId", checklist.Id)), service, service);

            Assert.Equal(current.Id, checklist.GetAttributeValue<EntityReference>("new_motorista").Id);
            Assert.Equal(currentUser.Id, checklist.GetAttributeValue<EntityReference>("ownerid").Id);
            Assert.Equal(PushPendente, Choice(checklist, "new_pushstatus"));
        }

        [Fact]
        public void RotinaContaChecklistDeTrocaConcluidoComoVistoria()
        {
            var service = new FakeService();
            service.Template(padrao: true);
            var vehicle = service.Vehicle("ABC1D23");
            var troca = service.Checklist(vehicle, Concluido);
            troca["new_origem"] = new OptionSetValue(100000002);
            troca["new_concluidoem"] = DateTime.UtcNow.AddDays(-3);

            Invoke("Process", Context(), service, DateTime.UtcNow);

            Assert.Single(service.Rows("new_checklistveiculo"));
        }

        [Fact]
        public void RotinaNaoReatribuiChecklistDeTrocaDeQuemRecebeu()
        {
            var service = new FakeService();
            service.Template(padrao: true);
            var vehicle = service.Vehicle("ABC1D23");
            var receiver = service.Driver("Recebedor", "r@empresa.test", null, null);
            var receiverUser = service.User("r@empresa.test");
            service.Driver("Outro", "o@empresa.test", vehicle, DateTime.UtcNow);
            service.User("o@empresa.test");
            var troca = service.Checklist(vehicle, Pendente, receiver, receiverUser);
            troca["new_origem"] = new OptionSetValue(100000002);

            Invoke("Process", Context(), service, DateTime.UtcNow);

            Assert.Equal(receiver.Id, troca.GetAttributeValue<EntityReference>("new_motorista").Id);
            Assert.Equal(receiverUser.Id, troca.GetAttributeValue<EntityReference>("ownerid").Id);
        }

        [Fact]
        public void ReatribuirNaoPassaChecklistDeTrocaAdiante()
        {
            var service = new FakeService();
            var vehicle = service.Vehicle("ABC1D23");
            var receiver = service.Driver("Recebedor", "r@empresa.test", null, null);
            var receiverUser = service.User("r@empresa.test");
            service.Driver("Outro", "o@empresa.test", vehicle, DateTime.UtcNow);
            service.User("o@empresa.test");
            var troca = service.Checklist(vehicle, Pendente, receiver, receiverUser);
            troca["new_origem"] = new OptionSetValue(100000002);

            Invoke("RequestAssignment", Context(P("new_ChecklistId", troca.Id)), service, service);

            Assert.Equal(receiver.Id, troca.GetAttributeValue<EntityReference>("new_motorista").Id);
        }

        [Fact]
        public void RotinaAtribuiChecklistDeTrocaNuncaAtribuidoPelaRegraNormal()
        {
            var service = new FakeService();
            service.Template(padrao: true);
            var vehicle = service.Vehicle("ABC1D23");
            var current = service.Driver("Atual", "o@empresa.test", vehicle, DateTime.UtcNow);
            service.User("o@empresa.test");
            var troca = service.Checklist(vehicle, AguardandoMotorista);
            troca["new_origem"] = new OptionSetValue(100000002);

            Invoke("Process", Context(), service, DateTime.UtcNow);

            Assert.Equal(current.Id, troca.GetAttributeValue<EntityReference>("new_motorista").Id);
            Assert.Equal(Pendente, Choice(troca, "new_estado"));
        }

        [Fact]
        public void AtribuicaoIgnoraChecklistEncerrado()
        {
            var service = new FakeService();
            var vehicle = service.Vehicle("ABC1D23");
            service.Driver("Motorista", "m@empresa.test", vehicle, DateTime.UtcNow);
            service.User("m@empresa.test");
            var checklist = service.Checklist(vehicle, Cancelado);

            Invoke("AssignCurrentDriver", service, checklist.Id);

            Assert.Equal(Cancelado, Choice(checklist, "new_estado"));
            Assert.Empty(service.Updated);
        }

        [Fact]
        public void MotoristaConcluiComFotosEValores()
        {
            var service = new FakeService();
            var pending = PendingForDriver(service);
            var checklist = pending.Checklist;
            var user = pending.User;
            var items = pending.Items;
            var answers = Answers(items, foto: "https://contoso.sharepoint.com/f1", numero: "45210", texto: "Tudo certo");

            Invoke("Conclude", Context(user.Id, P("new_ChecklistId", checklist.Id), P("new_RespostasJson", answers)), service);

            Assert.Equal(Concluido, Choice(checklist, "new_estado"));
            var photo = service.Created.Single(row => row.LogicalName == "new_checklistveiculofoto");
            Assert.Equal(user.Id, photo.GetAttributeValue<EntityReference>("ownerid").Id);
            Assert.Equal("https://contoso.sharepoint.com/f1", photo.GetAttributeValue<string>("new_link"));
            Assert.Contains("45210", checklist.GetAttributeValue<string>("new_respostasjson"));
        }

        [Fact]
        public void ConclusaoRepetidaNaoDuplicaFotos()
        {
            var service = new FakeService();
            var pending = PendingForDriver(service);
            var checklist = pending.Checklist;
            var user = pending.User;
            var items = pending.Items;
            var context = Context(user.Id, P("new_ChecklistId", checklist.Id), P("new_RespostasJson", Answers(items, "https://x.test/1", "1", "")));

            Invoke("Conclude", context, service);
            Invoke("Conclude", context, service);

            Assert.Single(service.Created.Where(row => row.LogicalName == "new_checklistveiculofoto"));
        }

        [Fact]
        public void ConclusaoSemFotoObrigatoriaEhRecusada()
        {
            var service = new FakeService();
            var pending = PendingForDriver(service);
            var checklist = pending.Checklist;
            var user = pending.User;
            var items = pending.Items;

            AssertPluginError(() => Invoke("Conclude", Context(user.Id, P("new_ChecklistId", checklist.Id), P("new_RespostasJson", Answers(items, null, "1", ""))), service));
            Assert.Equal(Pendente, Choice(checklist, "new_estado"));
        }

        [Fact]
        public void OutroUsuarioNaoConcluiChecklist()
        {
            var service = new FakeService();
            var pending = PendingForDriver(service);
            var checklist = pending.Checklist;
            var items = pending.Items;

            AssertPluginError(() => Invoke("Conclude", Context(Guid.NewGuid(), P("new_ChecklistId", checklist.Id), P("new_RespostasJson", Answers(items, "https://x.test/1", "1", ""))), service));
        }

        [Theory]
        [InlineData("-1")]
        [InlineData("abc")]
        public void NumeroInvalidoEhRecusado(string value)
        {
            var service = new FakeService();
            var pending = PendingForDriver(service);
            var checklist = pending.Checklist;
            var user = pending.User;
            var items = pending.Items;

            AssertPluginError(() => Invoke("Conclude", Context(user.Id, P("new_ChecklistId", checklist.Id), P("new_RespostasJson", Answers(items, "https://x.test/1", value, ""))), service));
        }

        [Fact]
        public void FotoSemHttpsEhRecusada()
        {
            var service = new FakeService();
            var pending = PendingForDriver(service);
            var checklist = pending.Checklist;
            var user = pending.User;
            var items = pending.Items;

            AssertPluginError(() => Invoke("Conclude", Context(user.Id, P("new_ChecklistId", checklist.Id), P("new_RespostasJson", Answers(items, "http://x.test/1", "1", ""))), service));
        }

        [Fact]
        public void SnapshotLevaOpcoesDoItemOuPadrao()
        {
            var items = ChecklistAnswers.ParseItems(RequestAndReadItemsJson());
            Assert.Equal(new[] { "Murcho", "Careca", "Furado" }, items.Single(i => i.Tipo == "okNok").OpcoesProblema);
            Assert.Equal(ChecklistAnswers.DefaultProblemOptions, ChecklistAnswers.ParseProblemOptions(null));
        }

        [Fact]
        public void NaoOkComFotoEProblemaConcluiEGravaResumo()
        {
            var (service, checklist, user, items) = PendingChecklist();
            var nok = "\"valor\":\"nok\",\"problemas\":[\"Murcho\"],\"observacao\":\"dianteiro\",\"fotos\":[{\"link\":\"https://x.test/p\",\"caminho\":\"c\",\"nomeArquivo\":\"p.jpg\"}]";
            Invoke("Conclude", Context(user.Id, P("new_ChecklistId", checklist.Id), P("new_RespostasJson", Answers(items, "https://x.test/1", "1", "", nok))), service);
            var saved = service.Retrieve("new_checklistveiculo", checklist.Id, new ColumnSet(true));
            Assert.True(saved.GetAttributeValue<bool>("new_temproblema"));
            Assert.Equal(1, saved.GetAttributeValue<int>("new_qtdproblemas"));
            Assert.Contains("\"problemas\":[\"Murcho\"]", saved.GetAttributeValue<string>("new_respostasjson"));
        }

        [Theory]
        [InlineData("\"valor\":\"nok\",\"problemas\":[\"Murcho\"],\"fotos\":[]", "Tire a foto do problema: Pneus.")]
        [InlineData("\"valor\":\"nok\",\"problemas\":[],\"fotos\":[{\"link\":\"https://x.test/p\"}]", "Escolha o problema: Pneus.")]
        [InlineData("\"valor\":\"nok\",\"problemas\":[\"Amassado\"],\"fotos\":[{\"link\":\"https://x.test/p\"}]", "Problema inválido em: Pneus.")]
        [InlineData("\"valor\":\"\"", "Escolha OK ou Não OK: Pneus.")]
        public void NaoOkInvalidoEhRecusado(string okNok, string message)
        {
            var (service, checklist, user, items) = PendingChecklist();
            var error = Assert.Throws<TargetInvocationException>(() => Invoke("Conclude", Context(user.Id, P("new_ChecklistId", checklist.Id), P("new_RespostasJson", Answers(items, "https://x.test/1", "1", "", okNok))), service));
            Assert.IsType<InvalidPluginExecutionException>(error.InnerException);
            Assert.Equal(message, error.InnerException.Message);
        }

        [Fact]
        public void ProblemasRepetidosSaoGravadosSemDuplicata()
        {
            var (service, checklist, user, items) = PendingChecklist();
            var nok = "\"valor\":\"nok\",\"problemas\":[\"Murcho\",\"Murcho\",\"Careca\"],\"fotos\":[{\"link\":\"https://x.test/p\"}]";
            Invoke("Conclude", Context(user.Id, P("new_ChecklistId", checklist.Id), P("new_RespostasJson", Answers(items, "https://x.test/1", "1", "", nok))), service);
            var saved = service.Retrieve("new_checklistveiculo", checklist.Id, new ColumnSet(true));
            var json = saved.GetAttributeValue<string>("new_respostasjson");
            Assert.Contains("\"problemas\":[\"Murcho\",\"Careca\"]", json);
            Assert.DoesNotContain("\"Murcho\",\"Murcho\"", json);
        }

        [Fact]
        public void OnzeProblemasComRepetidoPassaPorqueSaoDezDistintos()
        {
            var opcoes = Enumerable.Range(1, 10).Select(i => "P" + i).ToList();
            var itemsJson = "[{\"chave\":\"k\",\"ordem\":1,\"rotulo\":\"Pneus\",\"tipo\":\"okNok\",\"obrigatorio\":true,\"opcoesProblema\":[" + string.Join(",", opcoes.Select(o => "\"" + o + "\"")) + "]}]";
            var problemas = string.Join(",", opcoes.Concat(new[] { "P1" }).Select(o => "\"" + o + "\""));
            var answers = "[{\"chave\":\"k\",\"valor\":\"nok\",\"problemas\":[" + problemas + "],\"fotos\":[{\"link\":\"https://x.test/p\"}]}]";
            var result = ChecklistAnswers.Validate(itemsJson, answers);
            Assert.Equal(opcoes, result.Single().Problemas);
        }

        [Fact]
        public void OkDescartaFotosEProblemasEnviados()
        {
            var (service, checklist, user, items) = PendingChecklist();
            var ok = "\"valor\":\"ok\",\"problemas\":[\"Murcho\"],\"fotos\":[{\"link\":\"https://x.test/p\"}]";
            Invoke("Conclude", Context(user.Id, P("new_ChecklistId", checklist.Id), P("new_RespostasJson", Answers(items, "https://x.test/1", "1", "", ok))), service);
            var saved = service.Retrieve("new_checklistveiculo", checklist.Id, new ColumnSet(true));
            Assert.False(saved.GetAttributeValue<bool>("new_temproblema"));
            Assert.Equal(0, saved.GetAttributeValue<int>("new_qtdproblemas"));
            Assert.DoesNotContain("x.test/p", saved.GetAttributeValue<string>("new_respostasjson"));
        }

        [Fact]
        public void CancelamentoSoParaChecklistAberto()
        {
            var service = new FakeService();
            var open = service.Checklist(service.Vehicle("ABC1D23"), Pendente);
            var done = service.Checklist(service.Vehicle("ABC1D24"), Concluido);

            Invoke("Cancel", Context(P("new_ChecklistId", open.Id), P("new_Motivo", "Veículo na oficina")), service, service);

            Assert.Equal(Cancelado, Choice(open, "new_estado"));
            AssertPluginError(() => Invoke("Cancel", Context(P("new_ChecklistId", done.Id)), service, service));
        }

        [Fact]
        public void ChecklistConcluidoNaoAceitaEdicaoNemExclusao()
        {
            var service = new FakeService();
            var done = service.Checklist(service.Vehicle("ABC1D23"), Concluido);
            var update = Context(P("Target", new Entity("new_checklistveiculo", done.Id) { ["new_respostasjson"] = "[]" }));
            var delete = Context(P("Target", new EntityReference("new_checklistveiculo", done.Id)));

            AssertPluginError(() => Invoke("GuardClosedChecklist", update, service));
            AssertPluginError(() => Invoke("GuardClosedChecklistDelete", delete, service));
        }

        [Fact]
        public void ChecklistAbertoAceitaEdicao()
        {
            var service = new FakeService();
            var open = service.Checklist(service.Vehicle("ABC1D23"), Pendente);
            var update = Context(P("Target", new Entity("new_checklistveiculo", open.Id) { ["new_estado"] = new OptionSetValue(Concluido) }));

            Assert.Null(Record.Exception(() => Invoke("GuardClosedChecklist", update, service)));
        }

        // ---------- helpers ----------

        private sealed class Pending { public Entity Checklist; public Entity User; public List<ChecklistItem> Items; }

        private static Pending PendingForDriver(FakeService service)
        {
            var template = service.Template(padrao: true);
            var vehicle = service.Vehicle("ABC1D23");
            var driver = service.Driver("Motorista", "m@empresa.test", vehicle, DateTime.UtcNow);
            var user = service.User("m@empresa.test");
            var checklist = service.Checklist(vehicle, Pendente, driver, user);
            var items = service.Rows("new_checklistmodeloitem")
                .Where(row => row.GetAttributeValue<EntityReference>("new_modelo").Id == template.Id)
                .Select(row => new ChecklistItem
                {
                    Chave = row.Id.ToString("D"),
                    Ordem = row.GetAttributeValue<int>("new_ordem"),
                    Rotulo = row.GetAttributeValue<string>("new_name"),
                    Tipo = ChecklistAnswers.TipoFromChoice(Choice(row, "new_tipo")),
                    Obrigatorio = row.GetAttributeValue<bool>("new_obrigatorio"),
                    Unidade = row.GetAttributeValue<string>("new_unidade"),
                    OpcoesProblema = ChecklistAnswers.ParseProblemOptions(row.GetAttributeValue<string>("new_opcoesproblema"))
                }).ToList();
            checklist["new_itensjson"] = ChecklistAnswers.SerializeItems(items);
            return new Pending { Checklist = checklist, User = user, Items = items };
        }

        private static (FakeService service, Entity checklist, Entity user, List<ChecklistItem> items) PendingChecklist()
        {
            var service = new FakeService();
            var pending = PendingForDriver(service);
            return (service, pending.Checklist, pending.User, pending.Items);
        }

        private static string RequestAndReadItemsJson()
        {
            var service = new FakeService();
            var vehicle = service.Vehicle("ABC1D23");
            service.Template(padrao: true);
            Invoke("Request", Context(P("new_VeiculoId", vehicle.Id)), service, service);
            return service.Rows("new_checklistveiculo").Single().GetAttributeValue<string>("new_itensjson");
        }

        private static string Answers(List<ChecklistItem> items, string foto, string numero, string texto, string okNok = "\"valor\":\"ok\"")
        {
            var parts = new List<string>();
            foreach (var item in items)
            {
                if (item.Tipo == "foto")
                    parts.Add("{\"chave\":\"" + item.Chave + "\",\"fotos\":[" + (foto == null ? "" : "{\"link\":\"" + foto + "\",\"caminho\":\"Checklists/x\",\"nomeArquivo\":\"f.jpg\"}") + "]}");
                else if (item.Tipo == "numero")
                    parts.Add("{\"chave\":\"" + item.Chave + "\",\"valor\":\"" + numero + "\"}");
                else if (item.Tipo == "okNok")
                    parts.Add("{\"chave\":\"" + item.Chave + "\"," + okNok + "}");
                else
                    parts.Add("{\"chave\":\"" + item.Chave + "\",\"valor\":\"" + texto + "\"}");
            }
            return "[" + string.Join(",", parts) + "]";
        }

        // ---------- Escolha do modelo por filtro de veículo ----------

        private const int Vendido = 202410000;
        private const string Blindado = "{\"condicoes\":[{\"campo\":\"cr40f_blindado\",\"operador\":\"igual\",\"valor\":true}]}";

        [Fact]
        public void RotinaNaoEscolheModeloInativo()
        {
            var service = new FakeService();
            var padrao = service.Template(padrao: true, name: "Padrão");
            service.Template(padrao: false, name: "Inativo", filtro: Blindado, prioridade: 1)["new_ativo"] = false;
            var blindado = service.Vehicle("BLD0001");
            blindado["cr40f_blindado"] = true;

            Invoke("Process", Context(), service, DateTime.UtcNow);

            Assert.Equal(padrao.Id, service.Rows("new_checklistveiculo").Single().GetAttributeValue<EntityReference>("new_modelo").Id);
        }

        [Fact]
        public void RotinaComModeloFiltradoEDoisPadroesEhRecusada()
        {
            var service = new FakeService();
            service.Template(padrao: true, name: "Padrão A");
            service.Template(padrao: true, name: "Padrão B");
            service.Template(padrao: false, name: "Blindados", filtro: Blindado, prioridade: 1);
            service.Vehicle("BLD0001")["cr40f_blindado"] = true;

            var error = Assert.Throws<TargetInvocationException>(() => Invoke("Process", Context(), service, DateTime.UtcNow));
            Assert.IsType<InvalidPluginExecutionException>(error.InnerException);
            Assert.Empty(service.Rows("new_checklistveiculo"));
        }

        [Fact]
        public void RotinaUsaModeloEPeriodicidadeDeCadaVeiculo()
        {
            var service = new FakeService();
            var padrao = service.Template(padrao: true, name: "Padrão", periodicidade: 15);
            var semanal = service.Template(padrao: false, name: "Blindados semanal", filtro: Blindado, prioridade: 10, periodicidade: 7);
            var blindado = service.Vehicle("BLD0001");
            blindado["cr40f_blindado"] = true;
            var comum = service.Vehicle("CMM0001");
            var terceiro = service.Vehicle("TRC0001", proprio: false);
            var vendido = service.Vehicle("VND0001");
            vendido["cr40f_blindado"] = true;
            vendido["cr40f_statusdoveiculo"] = new OptionSetValue(Vendido);
            // Os dois concluíram há 10 dias: vence o de 7, não o de 15.
            service.Checklist(blindado, Concluido)["new_concluidoem"] = DateTime.UtcNow.AddDays(-10);
            service.Checklist(comum, Concluido)["new_concluidoem"] = DateTime.UtcNow.AddDays(-10);
            var context = Context();

            Invoke("Process", context, service, DateTime.UtcNow);

            var created = service.Created.Where(row => row.LogicalName == "new_checklistveiculo").ToList();
            var row = Assert.Single(created);
            Assert.Equal(blindado.Id, row.GetAttributeValue<EntityReference>("new_veiculo").Id);
            Assert.Equal(semanal.Id, row.GetAttributeValue<EntityReference>("new_modelo").Id);
            Assert.Equal("criados=1;abertos=0;atribuidos=0", context.OutputParameters["new_Resumo"]);

            // 16 dias depois da última conclusão o comum também vence, com o padrão; terceiro e vendido seguem fora.
            service.Rows("new_checklistveiculo").Single(c => c.GetAttributeValue<EntityReference>("new_veiculo").Id == comum.Id)["new_concluidoem"] = DateTime.UtcNow.AddDays(-16);
            service.Rows("new_checklistveiculo").Remove(service.Rows("new_checklistveiculo").Single(c => c.Id == row.Id));
            service.Created.Clear();
            Invoke("Process", Context(), service, DateTime.UtcNow);
            var second = service.Created.Where(c => c.LogicalName == "new_checklistveiculo")
                .ToDictionary(c => c.GetAttributeValue<EntityReference>("new_veiculo").Id, c => c.GetAttributeValue<EntityReference>("new_modelo").Id);
            Assert.Equal(2, second.Count);
            Assert.Equal(semanal.Id, second[blindado.Id]);
            Assert.Equal(padrao.Id, second[comum.Id]);
            Assert.False(second.ContainsKey(terceiro.Id));
            Assert.False(second.ContainsKey(vendido.Id));
        }

        [Fact]
        public void SolicitacaoManualSemModeloUsaEscolhaPeloVeiculo()
        {
            var service = new FakeService();
            service.Template(padrao: true, name: "Padrão");
            var blindados = service.Template(padrao: false, name: "Blindados", filtro: Blindado, prioridade: 10);
            var vehicle = service.Vehicle("BLD0001");
            vehicle["cr40f_blindado"] = true;

            Invoke("Request", Context(P("new_VeiculoId", vehicle.Id)), service, service);

            Assert.Equal(blindados.Id, service.Rows("new_checklistveiculo").Single().GetAttributeValue<EntityReference>("new_modelo").Id);
        }

        [Fact]
        public void SolicitacaoManualSemModeloENadaCasandoUsaPadrao()
        {
            var service = new FakeService();
            var padrao = service.Template(padrao: true, name: "Padrão");
            service.Template(padrao: false, name: "Blindados", filtro: Blindado, prioridade: 10);
            var vehicle = service.Vehicle("TRC0001", proprio: false);

            Invoke("Request", Context(P("new_VeiculoId", vehicle.Id)), service, service);

            Assert.Equal(padrao.Id, service.Rows("new_checklistveiculo").Single().GetAttributeValue<EntityReference>("new_modelo").Id);
        }

        [Fact]
        public void SolicitacaoManualComModeloInformadoVence()
        {
            var service = new FakeService();
            service.Template(padrao: true, name: "Padrão");
            service.Template(padrao: false, name: "Blindados", filtro: Blindado, prioridade: 10);
            var avulso = service.Template(padrao: false, name: "Avulso");
            var vehicle = service.Vehicle("BLD0001");
            vehicle["cr40f_blindado"] = true;

            Invoke("Request", Context(P("new_VeiculoId", vehicle.Id), P("new_ModeloId", avulso.Id)), service, service);

            Assert.Equal(avulso.Id, service.Rows("new_checklistveiculo").Single().GetAttributeValue<EntityReference>("new_modelo").Id);
        }

        private static int Choice(Entity entity, string name) => entity.GetAttributeValue<OptionSetValue>(name)?.Value ?? -1;

        private static void AssertPluginError(Action action)
        {
            var error = Assert.Throws<TargetInvocationException>(action);
            Assert.IsType<InvalidPluginExecutionException>(error.InnerException);
        }

        private static void Invoke(string method, params object[] args)
        {
            var flags = BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public;
            var target = typeof(ChecklistCommandPlugin).GetMethod(method, flags) ?? typeof(ChecklistFactory).GetMethod(method, flags);
            target.Invoke(null, args);
        }

        private static KeyValuePair<string, object> P(string key, object value) => new KeyValuePair<string, object>(key, value);

        private static RemoteExecutionContext Context(params KeyValuePair<string, object>[] parameters) => Context(Guid.NewGuid(), parameters);

        private static RemoteExecutionContext Context(Guid userId, params KeyValuePair<string, object>[] parameters)
        {
            var context = new RemoteExecutionContext { InitiatingUserId = userId };
            foreach (var pair in parameters) context.InputParameters[pair.Key] = pair.Value;
            return context;
        }
    }
}
