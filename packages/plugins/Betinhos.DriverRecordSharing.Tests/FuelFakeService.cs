using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using Microsoft.Xrm.Sdk.Metadata;

namespace Betinhos.DriverRecordSharing.Tests
{
    // Dataverse em memória só com o que o relatório de combustível usa: despesa, categoria, posto, resumo, veículo.
    internal sealed class FuelFakeService : IOrganizationService
    {
        private readonly Dictionary<string, List<Entity>> tables = new Dictionary<string, List<Entity>>();
        public readonly List<Entity> Updated = new List<Entity>();
        private readonly Guid categoriaAbastecimento;
        private long clock;

        // Tamanho máximo de página devolvido (o Dataverse real devolve 5000); testes baixam o valor para exercitar a paginação.
        public bool TemTabelaAvaliacoes = true;
        public int PageSize = int.MaxValue;
        public int Pages;

        // Relógio lógico: cada criação ou alteração de resumo avança o modifiedon, como no Dataverse.
        private DateTime Tick() => new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddSeconds(++clock);

        public FuelFakeService()
        {
            categoriaAbastecimento = Add(new Entity(FuelSchema.Categoria) { [FuelSchema.CategoriaNome] = FuelSchema.CategoriaCombustivel }).Id;
        }

        public IEnumerable<Entity> Rows(string table) => RowList(table);
        private List<Entity> RowList(string table) => tables.TryGetValue(table, out var rows) ? rows : (tables[table] = new List<Entity>());

        private Entity Add(Entity entity)
        {
            if (entity.Id == Guid.Empty) entity.Id = Guid.NewGuid();
            RowList(entity.LogicalName).Add(entity);
            return entity;
        }

        public Entity Get(string table, Guid id) => RowList(table).Single(r => r.Id == id);

        public Guid Driver(string nome = "Motorista") => Add(new Entity(FuelSchema.Funcionario) { ["cr40f_nomecompleto"] = nome }).Id;

        public Guid Vehicle(string modelo) => Add(new Entity(FuelSchema.Veiculo) { [FuelSchema.VeiculoModelo] = modelo }).Id;

        public Guid Posto(string cnpj, string nome, double lat, double lon, int status = FuelSchema.StatusGeoGeocodificado) => Add(new Entity(FuelSchema.Posto)
        {
            ["new_cnpj"] = cnpj, ["new_name"] = nome, ["new_latitude"] = (decimal)lat, ["new_longitude"] = (decimal)lon, ["new_statusgeo"] = new OptionSetValue(status)
        }).Id;

        public Guid Resumo(Guid motorista, string mes, int? nota, bool precisaInsight = true, decimal gasto = 100m, decimal economiaPerdida = 0m)
        {
            var row = new Entity(FuelSchema.Resumo)
            {
                ["new_motorista"] = new EntityReference(FuelSchema.Funcionario, motorista), ["new_mes"] = mes, ["new_qtdabastecimentos"] = 4, ["new_litros"] = 100m,
                ["new_gastototal"] = new Money(gasto), ["new_economiaperdida"] = new Money(economiaPerdida), ["new_precisainsight"] = precisaInsight
            };
            if (nota != null) row["new_nota"] = nota.Value;
            row["modifiedon"] = Tick();
            return Add(row).Id;
        }

        // Abastecimento já comparado (preço e posto gravados), usado como vizinho.
        public Guid Fuel(Guid motorista, decimal preco, decimal litros, DateTime data, Guid posto)
        {
            var id = FuelRaw(motorista, preco * litros, litros, data, null);
            var row = Get(FuelSchema.Despesa, id);
            row["new_precolitro"] = preco;
            row["new_posto"] = new EntityReference(FuelSchema.Posto, posto);
            return id;
        }

        public Guid FuelRaw(Guid motorista, decimal valor, decimal litros, DateTime data, string cnpj, string categoria = FuelSchema.CategoriaCombustivel, Guid? veiculo = null, int? km = null)
        {
            var cat = categoria == FuelSchema.CategoriaCombustivel ? categoriaAbastecimento : Add(new Entity(FuelSchema.Categoria) { [FuelSchema.CategoriaNome] = categoria }).Id;
            var row = new Entity(FuelSchema.Despesa)
            {
                [FuelSchema.DespesaMotorista] = new EntityReference(FuelSchema.Funcionario, motorista),
                [FuelSchema.DespesaCategoria] = new EntityReference(FuelSchema.Categoria, cat),
                ["cr40f_valor"] = new Money(valor), ["cr40f_litros"] = litros, ["cr40f_datagasto"] = data, ["createdon"] = data.AddHours(1)
            };
            if (cnpj != null) row["new_cnpjposto"] = cnpj;
            if (veiculo != null) row[FuelSchema.DespesaVeiculo] = new EntityReference(FuelSchema.Veiculo, veiculo.Value);
            if (km != null) row["cr40f_kminformado"] = km.Value;
            return Add(row).Id;
        }

        public Guid Create(Entity entity)
        {
            var copy = new Entity(entity.LogicalName, Guid.NewGuid());
            foreach (var a in entity.Attributes) copy[a.Key] = a.Value;
            Add(copy);
            return copy.Id;
        }

        public void Update(Entity entity)
        {
            Updated.Add(entity);
            var existing = Get(entity.LogicalName, entity.Id);
            foreach (var a in entity.Attributes) existing[a.Key] = a.Value;
            existing["modifiedon"] = Tick();
        }

        public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => Clone(RowList(entityName).SingleOrDefault(r => r.Id == id)
            ?? throw new InvalidOperationException("Registro inesperado: " + entityName));

        public OrganizationResponse Execute(OrganizationRequest request)
        {
            if (request is RetrieveMetadataChangesRequest)
            {
                var encontradas = new EntityMetadataCollection();
                if (TemTabelaAvaliacoes) encontradas.Add(new EntityMetadata { LogicalName = FuelSchema.Avaliacao });
                var resposta = new RetrieveMetadataChangesResponse();
                resposta.Results["EntityMetadata"] = encontradas;
                return resposta;
            }
            if (!(request is UpsertRequest upsert)) throw new NotSupportedException(request.RequestName);
            var key = upsert.Target.KeyAttributes.Single();
            var existing = RowList(upsert.Target.LogicalName).FirstOrDefault(r => Equals(r.GetAttributeValue<object>(key.Key), key.Value));
            if (existing == null)
            {
                existing = new Entity(upsert.Target.LogicalName) { [key.Key] = key.Value };
                Add(existing);
            }
            foreach (var a in upsert.Target.Attributes) existing[a.Key] = a.Value;
            existing["modifiedon"] = Tick();
            return new UpsertResponse();
        }

        public EntityCollection RetrieveMultiple(QueryBase query)
        {
            var q = (QueryExpression)query;
            IEnumerable<Entity> rows = RowList(q.EntityName).Where(r => q.Criteria.Conditions.All(c => Matches(r, c)));
            foreach (var order in q.Orders.Reverse())
            {
                var attribute = order.AttributeName;
                rows = order.OrderType == OrderType.Descending
                    ? rows.OrderByDescending(r => r.Contains(attribute) ? r[attribute] : null)
                    : rows.OrderBy(r => r.Contains(attribute) ? r[attribute] : null);
            }
            if (q.TopCount != null) rows = rows.Take(q.TopCount.Value);
            var result = new List<Entity>();
            foreach (var row in rows.ToList())
            {
                var copy = Clone(row);
                var keep = true;
                foreach (var link in q.LinkEntities)
                {
                    var reference = row.GetAttributeValue<EntityReference>(link.LinkFromAttributeName);
                    var target = reference == null ? null : RowList(link.LinkToEntityName).FirstOrDefault(t => t.Id == reference.Id);
                    if (target == null) { keep = false; break; }
                    foreach (var column in link.Columns.Columns.Where(target.Contains))
                        copy[link.EntityAlias + "." + column] = new AliasedValue(link.LinkToEntityName, column, target[column]);
                }
                if (keep) result.Add(copy);
            }
            if (q.PageInfo == null || q.PageInfo.Count <= 0) return new EntityCollection(result);

            var size = Math.Min(q.PageInfo.Count, PageSize);
            var pageIndex = q.PageInfo.PageNumber < 1 ? 0 : q.PageInfo.PageNumber - 1;
            if (pageIndex > 0 && string.IsNullOrEmpty(q.PageInfo.PagingCookie)) throw new InvalidOperationException("Página seguinte sem PagingCookie.");
            Pages++;
            var page = new EntityCollection(result.Skip(pageIndex * size).Take(size).ToList()) { MoreRecords = result.Count > (pageIndex + 1) * size, PagingCookie = "cookie" };
            return page;
        }

        private static Entity Clone(Entity row)
        {
            var copy = new Entity(row.LogicalName, row.Id);
            foreach (var a in row.Attributes) copy[a.Key] = a.Value;
            return copy;
        }

        private static bool Matches(Entity row, ConditionExpression c)
        {
            var value = c.AttributeName == row.LogicalName + "id" ? row.Id : Normalize(row.Contains(c.AttributeName) ? row[c.AttributeName] : null);
            switch (c.Operator)
            {
                case ConditionOperator.In: return c.Values.Select(Normalize).Contains(value);
                case ConditionOperator.Equal: return Equals(value, Normalize(c.Values[0]));
                case ConditionOperator.NotNull: return value != null;
                case ConditionOperator.GreaterEqual: return value is DateTime a && a >= (DateTime)c.Values[0];
                case ConditionOperator.LessThan: return value is DateTime b && b < (DateTime)c.Values[0];
                default: throw new NotSupportedException(c.Operator.ToString());
            }
        }

        private static object Normalize(object value)
        {
            switch (value)
            {
                case OptionSetValue o: return o.Value;
                case EntityReference r: return r.Id;
                default: return value;
            }
        }

        public void Delete(string entityName, Guid id) => RowList(entityName).Remove(Get(entityName, id));
        public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
        public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
    }
}
