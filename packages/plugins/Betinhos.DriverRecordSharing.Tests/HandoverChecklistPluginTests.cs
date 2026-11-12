using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class HandoverChecklistPluginTests
    {
        private const int Troca = 100000002;
        private const int AguardandoMotorista = 100000000;
        private const int Pendente = 100000001;
        private const int Cancelado = 100000003;
        private const int PushPendente = 100000000;
        private const int OrigemInfleet = 100000000;
        private const int OrigemMotorista = 100000001;
        private static readonly DateTime Now = new DateTime(2026, 10, 20, 15, 0, 0, DateTimeKind.Utc);

        private sealed class FakeHistory : IVehicleHistoryGateway
        {
            public PreviousDriverResult Result = PreviousDriverResult.Unknown;
            public bool Fail;
            public string AskedVehicle;
            public string AskedReceiver;
            public PreviousDriverResult PreviousDriver(string infleetVehicleId, string receiverInfleetDriverId, DateTime atUtc)
            {
                AskedVehicle = infleetVehicleId; AskedReceiver = receiverInfleetDriverId;
                if (Fail) throw new InfleetUnavailableException("Infleet não respondeu a tempo.");
                return Result;
            }
        }

        private sealed class Scene
        {
            public ChecklistFakeService Service = new ChecklistFakeService();
            public FakeHistory History = new FakeHistory();
            public Entity Vehicle, OldVehicle, Receiver, ReceiverUser, Giver;
        }

        private static Scene NewScene(bool proprio = true)
        {
            var s = new Scene();
            s.Service.Template(padrao: true);
            s.Vehicle = s.Service.Vehicle("ABC1D23", proprio);
            s.OldVehicle = s.Service.Vehicle("XYZ9K88");
            s.Giver = s.Service.Driver("Entregador", "e@empresa.test", null, null, "inf-entregador");
            s.Receiver = s.Service.Driver("Recebedor", "r@empresa.test", s.Vehicle, Now, "inf-recebedor");
            s.ReceiverUser = s.Service.User("r@empresa.test");
            s.History.Result = PreviousDriverResult.Found("inf-entregador");
            return s;
        }

        private static string Run(Scene s, Entity newVehicle, Entity oldVehicle, int origem = OrigemInfleet, DateTime? now = null, bool semGateway = false, DateTime? desde = null)
        {
            var target = new Entity("cr40f_funcionarios", s.Receiver.Id)
            {
                ["cr40f_veiculoatual"] = newVehicle?.ToEntityReference(),
                ["new_veiculoatualdesde"] = desde ?? now ?? Now,
                ["new_origemveiculoatual"] = new OptionSetValue(origem)
            };
            var pre = new Entity("cr40f_funcionarios", s.Receiver.Id) { ["cr40f_veiculoatual"] = oldVehicle?.ToEntityReference() };
            var context = new RemoteExecutionContext { MessageName = "Update", PrimaryEntityName = "cr40f_funcionarios", InitiatingUserId = Guid.NewGuid() };
            context.InputParameters["Target"] = target;
            context.PreEntityImages["pre"] = pre;
            return HandoverChecklistPlugin.Handle(context, s.Service, semGateway ? null : s.History, now ?? Now, null);
        }

        private static Entity Created(Scene s) => s.Service.Rows("new_checklistveiculo").Single(row => row.GetAttributeValue<OptionSetValue>("new_origem")?.Value == Troca);
        private static int Choice(Entity e, string name) => e.GetAttributeValue<OptionSetValue>(name)?.Value ?? -1;

        [Fact]
        public void TrocaPelaInfleetCriaChecklistParaQuemRecebeComEntreguePor()
        {
            var s = NewScene();
            var desde = Now.AddMinutes(-3);
            Assert.StartsWith("criado:", Run(s, s.Vehicle, s.OldVehicle, desde: desde));
            var row = Created(s);
            Assert.Equal(s.Vehicle.Id, row.GetAttributeValue<EntityReference>("new_veiculo").Id);
            Assert.Equal(s.Receiver.Id, row.GetAttributeValue<EntityReference>("new_motorista").Id);
            Assert.Equal(s.ReceiverUser.Id, row.GetAttributeValue<EntityReference>("ownerid").Id);
            Assert.Equal(s.Giver.Id, row.GetAttributeValue<EntityReference>("new_entreguepor").Id);
            // Vem do new_veiculoatualdesde do Target, não do fallback "agora".
            Assert.Equal(desde, row.GetAttributeValue<DateTime>("new_trocadetectadaem"));
            Assert.Equal(Pendente, Choice(row, "new_estado"));
            Assert.Equal(PushPendente, Choice(row, "new_pushstatus"));
            Assert.Equal(VehicleHandover.UniqueKey(s.Vehicle.Id, s.Receiver.Id, Now), row.GetAttributeValue<string>("new_chaveunica"));
            Assert.Equal("inf-ABC1D23", s.History.AskedVehicle);
            Assert.Equal("inf-recebedor", s.History.AskedReceiver);
        }

        [Fact]
        public void EntregadorNaoIdentificadoCriaComCampoVazio()
        {
            var s = NewScene();
            s.History.Result = PreviousDriverResult.Unknown;
            Assert.StartsWith("criado:", Run(s, s.Vehicle, s.OldVehicle));
            Assert.Null(Created(s).GetAttributeValue<EntityReference>("new_entreguepor"));
        }

        [Fact]
        public void EntregadorSemFuncionarioCorrespondenteCriaComCampoVazio()
        {
            var s = NewScene();
            s.History.Result = PreviousDriverResult.Found("inf-desconhecido");
            Assert.StartsWith("criado:", Run(s, s.Vehicle, s.OldVehicle));
            Assert.Null(Created(s).GetAttributeValue<EntityReference>("new_entreguepor"));
        }

        [Fact]
        public void InfleetForaCriaComEntregadorVazio()
        {
            var s = NewScene();
            s.History.Fail = true;
            Assert.StartsWith("criado:", Run(s, s.Vehicle, s.OldVehicle));
            var row = Created(s);
            Assert.Null(row.GetAttributeValue<EntityReference>("new_entreguepor"));
            Assert.Equal(s.Receiver.Id, row.GetAttributeValue<EntityReference>("new_motorista").Id);
        }

        [Fact]
        public void SemTokenDaInfleetCriaComEntregadorVazio()
        {
            var s = NewScene();
            Assert.StartsWith("criado:", Run(s, s.Vehicle, s.OldVehicle, semGateway: true));
            Assert.Null(Created(s).GetAttributeValue<EntityReference>("new_entreguepor"));
            Assert.Null(s.History.AskedVehicle);
        }

        [Fact]
        public void MesmoMotoristaNaInfleetNaoCria()
        {
            var s = NewScene();
            s.History.Result = PreviousDriverResult.SameDriver;
            Assert.Equal("ignorado:mesmo-motorista", Run(s, s.Vehicle, s.OldVehicle));
            Assert.Empty(s.Service.Rows("new_checklistveiculo"));
        }

        [Theory]
        [InlineData("vazio")]
        [InlineData("mesmo")]
        [InlineData("origem")]
        [InlineData("terceiro")]
        [InlineData("inativo")]
        [InlineData("status-inativo")]
        public void MudancaQueNaoEhTrocaDaFrotaPropriaNaoCria(string caso)
        {
            var s = NewScene(proprio: caso != "terceiro");
            if (caso == "inativo") s.Vehicle["statecode"] = new OptionSetValue(1);
            if (caso == "status-inativo") s.Vehicle["cr40f_statusdoveiculo"] = new OptionSetValue(202410002);
            var result = caso == "vazio" ? Run(s, null, s.OldVehicle)
                : caso == "mesmo" ? Run(s, s.Vehicle, s.Vehicle)
                : caso == "origem" ? Run(s, s.Vehicle, s.OldVehicle, OrigemMotorista)
                : Run(s, s.Vehicle, s.OldVehicle);
            Assert.StartsWith("ignorado:", result);
            if (caso == "terceiro" || caso == "inativo" || caso == "status-inativo") Assert.Equal("ignorado:frota-nao-propria", result);
            Assert.Empty(s.Service.Rows("new_checklistveiculo"));
            Assert.Null(s.History.AskedVehicle);
        }

        [Fact]
        public void TrocaRepetidaEmDuasHorasNaoDuplicaEDepoisCria()
        {
            var s = NewScene();
            Run(s, s.Vehicle, s.OldVehicle);
            Assert.Equal("ignorado:troca-recente", Run(s, s.Vehicle, s.OldVehicle, now: Now.AddMinutes(90)));
            Assert.StartsWith("criado:", Run(s, s.Vehicle, s.OldVehicle, now: Now.AddHours(3)));
        }

        [Fact]
        public void DoisPadroesSoFalhamQuandoATrocaVaiGerarChecklist()
        {
            var s = NewScene();
            Run(s, s.Vehicle, s.OldVehicle);
            s.Service.Template(padrao: true, name: "Outro padrão");
            Assert.Equal("ignorado:troca-recente", Run(s, s.Vehicle, s.OldVehicle, now: Now.AddMinutes(90)));
            Assert.Throws<InvalidPluginExecutionException>(() => Run(s, s.Vehicle, s.OldVehicle, now: Now.AddHours(3)));
        }

        [Fact]
        public void VeiculoProprioSemPadraoAtivoFalhaEmVezDeSerIgnorado()
        {
            var s = NewScene();
            s.Service.Rows("new_checklistmodelo").ForEach(modelo => modelo["new_ativo"] = false);
            s.Service.Template(padrao: false, name: "Blindados", filtro: Blindado, prioridade: 10);
            Assert.Throws<InvalidPluginExecutionException>(() => Run(s, s.Vehicle, s.OldVehicle));
        }

        [Fact]
        public void SemNenhumModeloAtivoIgnoraSemConsultarAInfleet()
        {
            var s = NewScene();
            s.Service.Rows("new_checklistmodelo").ForEach(modelo => modelo["new_ativo"] = false);
            Assert.Equal("ignorado:sem-modelo-ativo", Run(s, s.Vehicle, s.OldVehicle));
            Assert.Empty(s.Service.Rows("new_checklistveiculo"));
            Assert.Null(s.History.AskedVehicle);
        }

        [Fact]
        public void ChecklistAbertoDoVeiculoEhCanceladoComMotivo()
        {
            var s = NewScene();
            var aberto = s.Service.Checklist(s.Vehicle, Pendente, s.Giver);
            var outroVeiculo = s.Service.Checklist(s.OldVehicle, Pendente);
            Run(s, s.Vehicle, s.OldVehicle);
            Assert.Equal(Cancelado, Choice(aberto, "new_estado"));
            Assert.Equal("Substituído pelo checklist da troca", aberto.GetAttributeValue<string>("new_motivocancelamento"));
            Assert.Equal(Now, aberto.GetAttributeValue<DateTime>("new_canceladoem"));
            Assert.Equal(Pendente, Choice(outroVeiculo, "new_estado"));
            Assert.Equal(Pendente, Choice(Created(s), "new_estado"));
        }

        [Fact]
        public void TrocaSeguidaCancelaOChecklistDaTrocaAnteriorEMantemONovo()
        {
            var s = NewScene();
            var outro = s.Service.Driver("Outro", "o@empresa.test", s.Vehicle, Now, "inf-outro");
            s.Service.User("o@empresa.test");
            var anterior = s.Service.Checklist(s.Vehicle, Pendente, outro);
            Assert.StartsWith("criado:", Run(s, s.Vehicle, s.OldVehicle));
            Assert.Equal(Cancelado, Choice(anterior, "new_estado"));
            var novo = Created(s);
            Assert.Equal(Pendente, Choice(novo, "new_estado"));
            Assert.False(novo.Contains("new_canceladoem"));
        }

        [Fact]
        public void CriacaoQueFalhaMantemOChecklistAnteriorAberto()
        {
            var s = NewScene();
            var aberto = s.Service.Checklist(s.Vehicle, Pendente, s.Giver);
            foreach (var item in s.Service.Rows("new_checklistmodeloitem")) item["statecode"] = new OptionSetValue(1);
            var error = Assert.Throws<InvalidPluginExecutionException>(() => Run(s, s.Vehicle, s.OldVehicle));
            Assert.Contains("sem itens válidos", error.Message);
            Assert.Equal(Pendente, Choice(aberto, "new_estado"));
            Assert.False(aberto.Contains("new_canceladoem"));
        }

        [Theory]
        [InlineData("status")]
        [InlineData("vinculo")]
        [InlineData("inativo")]
        public void RecebedorForaDosFiltrosDoEnvioFicaAguardandoComErro(string caso)
        {
            var s = NewScene();
            if (caso == "status") s.Receiver["cr40f_status"] = new OptionSetValue(1);
            if (caso == "vinculo") s.Receiver["cr40f_tipodevinculo"] = new OptionSetValue(2);
            if (caso == "inativo") s.Receiver["statecode"] = new OptionSetValue(1);
            Assert.StartsWith("criado:", Run(s, s.Vehicle, s.OldVehicle));
            var row = Created(s);
            Assert.Equal(AguardandoMotorista, Choice(row, "new_estado"));
            Assert.Null(row.GetAttributeValue<EntityReference>("new_motorista"));
            Assert.False(row.Contains("new_pushstatus"));
            Assert.Contains("não está ativo como motorista", row.GetAttributeValue<string>("new_erroatribuicao"));
        }

        [Fact]
        public void RecebedorSemUsuarioMicrosoftFicaAguardandoComErro()
        {
            var s = NewScene();
            s.ReceiverUser["isdisabled"] = true;
            Run(s, s.Vehicle, s.OldVehicle);
            var row = Created(s);
            Assert.Equal(AguardandoMotorista, Choice(row, "new_estado"));
            Assert.Null(row.GetAttributeValue<EntityReference>("new_motorista"));
            Assert.Contains("sem usuário Microsoft único ativo", row.GetAttributeValue<string>("new_erroatribuicao"));
        }

        [Fact]
        public void RecebedorSemEmailMicrosoftFicaAguardandoComErro()
        {
            var s = NewScene();
            s.Receiver["cr40f_emailmicrosoft"] = null;
            Run(s, s.Vehicle, s.OldVehicle);
            var row = Created(s);
            Assert.Equal(AguardandoMotorista, Choice(row, "new_estado"));
            Assert.Contains("sem e-mail Microsoft", row.GetAttributeValue<string>("new_erroatribuicao"));
        }

        [Fact]
        public void RecebedorComDoisUsuariosAtivosFicaAguardandoComErro()
        {
            var s = NewScene();
            s.Service.User("r@empresa.test");
            Run(s, s.Vehicle, s.OldVehicle);
            var row = Created(s);
            Assert.Equal(AguardandoMotorista, Choice(row, "new_estado"));
            Assert.Contains("sem usuário Microsoft único ativo", row.GetAttributeValue<string>("new_erroatribuicao"));
        }

        [Fact]
        public void AtribuicaoDiretaNaoRepeteQuandoJaPendenteComOMesmoMotorista()
        {
            var s = NewScene();
            var checklist = s.Service.Checklist(s.Vehicle, Pendente, s.Receiver, s.ReceiverUser);
            var antes = s.Service.Updated.Count;

            Assert.False(ChecklistFactory.AssignDriver(s.Service, checklist.Id, s.Receiver.Id));

            var updates = s.Service.Updated.Skip(antes).ToList();
            Assert.All(updates, update => Assert.False(update.Contains("new_pushstatus")));
            Assert.All(updates, update => Assert.False(update.Contains("new_atribuidoem")));
            Assert.Equal(s.Receiver.Id, checklist.GetAttributeValue<EntityReference>("new_motorista").Id);
        }

        [Fact]
        public void ChecklistEncerradoNaoEhAtribuido()
        {
            var s = NewScene();
            var checklist = s.Service.Checklist(s.Vehicle, Cancelado);
            Assert.False(ChecklistFactory.AssignDriver(s.Service, checklist.Id, s.Receiver.Id));
            Assert.Null(checklist.GetAttributeValue<EntityReference>("new_motorista"));
        }

        [Fact]
        public void UpdateSemVeiculoAtualNoTargetNaoCria()
        {
            var s = NewScene();
            var context = new RemoteExecutionContext { MessageName = "Update", PrimaryEntityName = "cr40f_funcionarios" };
            context.InputParameters["Target"] = new Entity("cr40f_funcionarios", s.Receiver.Id) { ["cr40f_nomecompleto"] = "Outro nome" };
            Assert.Equal("ignorado:sem-mudanca", HandoverChecklistPlugin.Handle(context, s.Service, s.History, Now, null));
            Assert.Empty(s.Service.Rows("new_checklistveiculo"));
        }

        private const string Blindado = "{\"condicoes\":[{\"campo\":\"cr40f_blindado\",\"operador\":\"igual\",\"valor\":true}]}";

        [Fact]
        public void TrocaUsaModeloCujoFiltroCasaComOVeiculo()
        {
            var s = NewScene();
            var blindados = s.Service.Template(padrao: false, name: "Blindados", filtro: Blindado, prioridade: 10);
            s.Vehicle["cr40f_blindado"] = true;
            Assert.StartsWith("criado:", Run(s, s.Vehicle, s.OldVehicle));
            Assert.Equal(blindados.Id, Created(s).GetAttributeValue<EntityReference>("new_modelo").Id);
        }

        [Fact]
        public void TrocaUsaPadraoQuandoNenhumFiltroCasa()
        {
            var s = NewScene();
            s.Service.Template(padrao: false, name: "Blindados", filtro: Blindado, prioridade: 10);
            var padrao = s.Service.Rows("new_checklistmodelo").Single(row => row.GetAttributeValue<bool>("new_padraoquinzenal"));
            Assert.StartsWith("criado:", Run(s, s.Vehicle, s.OldVehicle));
            Assert.Equal(padrao.Id, Created(s).GetAttributeValue<EntityReference>("new_modelo").Id);
        }

        [Fact]
        public void TrocaDeTerceiroAlcancadoPorFiltroGeraChecklistDoModelo()
        {
            var s = NewScene(proprio: false);
            var blindados = s.Service.Template(padrao: false, name: "Blindados", filtro: Blindado, prioridade: 10);
            s.Vehicle["cr40f_blindado"] = true;
            Assert.StartsWith("criado:", Run(s, s.Vehicle, s.OldVehicle));
            Assert.Equal(blindados.Id, Created(s).GetAttributeValue<EntityReference>("new_modelo").Id);
        }

        [Fact]
        public void TrocaDeTerceiroSemFiltroQueCaseContinuaIgnorada()
        {
            var s = NewScene(proprio: false);
            s.Service.Template(padrao: false, name: "Blindados", filtro: Blindado, prioridade: 10);
            Assert.Equal("ignorado:frota-nao-propria", Run(s, s.Vehicle, s.OldVehicle));
            Assert.Empty(s.Service.Rows("new_checklistveiculo"));
        }
    }
}
