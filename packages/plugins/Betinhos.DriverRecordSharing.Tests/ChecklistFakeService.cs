using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing.Tests
{
    internal sealed class ChecklistFakeService : IOrganizationService
    {
        private const int Foto = 100000000;
        private const int Numero = 100000001;
        private const int Texto = 100000002;
        private const int OkNok = 100000003;

        private readonly Dictionary<string, List<Entity>> tables = new Dictionary<string, List<Entity>>();
        public readonly List<Entity> Created = new List<Entity>();
        public readonly List<Entity> Updated = new List<Entity>();

        public List<Entity> Rows(string table)
        {
            if (!tables.TryGetValue(table, out var rows)) tables[table] = rows = new List<Entity>();
            return rows;
        }

        private Entity Add(Entity entity)
        {
            if (entity.Id == Guid.Empty) entity.Id = Guid.NewGuid();
            if (!entity.Contains("statecode")) entity["statecode"] = new OptionSetValue(0);
            Rows(entity.LogicalName).Add(entity);
            return entity;
        }

        public Entity Vehicle(string plate, bool proprio = true, int? hodometro = null) => Add(new Entity("cr40f_veiculos")
        {
            ["cr40f_hodometro"] = hodometro,
            ["cr40f_placa"] = plate,
            ["cr40f_statusdoveiculo"] = new OptionSetValue(202410001),
            ["new_categoriadoveiculo"] = new OptionSetValue(proprio ? 100000000 : 100000001),
            ["new_infleetvehicleid"] = "inf-" + plate
        });

        public Entity Driver(string name, string email, Entity vehicle, DateTime? since, string infleetDriverId = null) => Add(new Entity("cr40f_funcionarios")
        {
            ["cr40f_nomecompleto"] = name,
            ["cr40f_emailmicrosoft"] = email,
            ["cr40f_veiculoatual"] = vehicle?.ToEntityReference(),
            ["new_veiculoatualdesde"] = since,
            ["new_infleetdriverid"] = infleetDriverId,
            ["cr40f_status"] = 0,
            ["cr40f_tipodevinculo"] = 0
        });

        public Entity User(string email) => Add(new Entity("systemuser") { ["internalemailaddress"] = email, ["isdisabled"] = false });

        public Entity Template(bool padrao, string name = "Vistoria quinzenal", string filtro = null, int? prioridade = null, int periodicidade = 15)
        {
            var template = Add(new Entity("new_checklistmodelo")
            {
                ["new_name"] = name,
                ["new_ativo"] = true,
                ["new_padraoquinzenal"] = padrao,
                ["new_periodicidadedias"] = periodicidade,
                ["new_filtrojson"] = filtro,
                ["new_prioridade"] = prioridade
            });
            Item(template, 3, "Observações", Texto, false, "");
            Item(template, 4, "Pneus", OkNok, true, "", "Murcho\nCareca\nFurado");
            Item(template, 1, "Frente", Foto, true, "");
            Item(template, 2, "KM", Numero, true, "km");
            return template;
        }

        private void Item(Entity template, int order, string label, int type, bool required, string unit, string options = null) => Add(new Entity("new_checklistmodeloitem")
        {
            ["new_modelo"] = template.ToEntityReference(),
            ["new_ordem"] = order,
            ["new_name"] = label,
            ["new_tipo"] = new OptionSetValue(type),
            ["new_obrigatorio"] = required,
            ["new_unidade"] = unit,
            ["new_opcoesproblema"] = options
        });

        public Entity Checklist(Entity vehicle, int state, Entity driver = null, Entity user = null)
        {
            var row = new Entity("new_checklistveiculo")
            {
                ["new_veiculo"] = vehicle.ToEntityReference(),
                ["new_estado"] = new OptionSetValue(state),
                ["ownerid"] = new EntityReference("systemuser", user?.Id ?? Guid.NewGuid())
            };
            if (driver != null) row["new_motorista"] = driver.ToEntityReference();
            return Add(row);
        }

        public Guid Create(Entity entity)
        {
            var copy = new Entity(entity.LogicalName, Guid.NewGuid());
            foreach (var attribute in entity.Attributes) copy[attribute.Key] = attribute.Value;
            Created.Add(copy);
            Add(copy);
            return copy.Id;
        }

        public void Update(Entity entity)
        {
            Updated.Add(entity);
            var existing = Rows(entity.LogicalName).Single(row => row.Id == entity.Id);
            foreach (var attribute in entity.Attributes) existing[attribute.Key] = attribute.Value;
        }

        public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet)
        {
            var row = Rows(entityName).SingleOrDefault(entry => entry.Id == id);
            return row ?? throw new InvalidOperationException("Registro inesperado: " + entityName);
        }

        public EntityCollection RetrieveMultiple(QueryBase query)
        {
            var expression = (QueryExpression)query;
            IEnumerable<Entity> rows = Rows(expression.EntityName);
            foreach (var condition in expression.Criteria.Conditions) rows = rows.Where(row => Matches(row, condition));
            return new EntityCollection(rows.ToList());
        }

        private static bool Matches(Entity row, ConditionExpression condition)
        {
            var value = Normalize(row.Contains(condition.AttributeName) ? row[condition.AttributeName] : null);
            switch (condition.Operator)
            {
                case ConditionOperator.Equal:
                    return Equals(value, Normalize(condition.Values[0])) || (value is string text && string.Equals(text, Convert.ToString(condition.Values[0]), StringComparison.OrdinalIgnoreCase));
                case ConditionOperator.In:
                    return condition.Values.Select(Normalize).Any(entry => Equals(entry, value));
                case ConditionOperator.Like:
                    return Convert.ToString(value, CultureInfo.InvariantCulture)?
                        .StartsWith(Convert.ToString(condition.Values[0], CultureInfo.InvariantCulture).TrimEnd('%'), StringComparison.Ordinal) == true;
                case ConditionOperator.GreaterThan:
                    return value is DateTime date && date > (DateTime)condition.Values[0];
                default:
                    throw new NotSupportedException(condition.Operator.ToString());
            }
        }

        private static object Normalize(object value)
        {
            switch (value)
            {
                case OptionSetValue option: return option.Value;
                case EntityReference reference: return reference.Id;
                default: return value;
            }
        }

        public void Delete(string entityName, Guid id) => throw new NotSupportedException();
        public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();
        public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
        public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
    }
}
