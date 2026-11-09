import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = async (file) => JSON.parse(await readFile(new URL(`../power-platform/flows/${file}`, import.meta.url), "utf8"));
const interpret = await read("ai_schedule_interpret.json");
const schedule = await read("ai_schedule_schedule.json");

const interpretTrigger = interpret.triggers.When_a_session_is_waiting_ai;
assert.equal(interpretTrigger.inputs.parameters["subscriptionRequest/message"], 4);
assert.equal(interpretTrigger.inputs.parameters["subscriptionRequest/filterexpression"], "cr40f_status eq 100000001");
assert.match(interpretTrigger.conditions[0].expression, /cr40f_versaoentrada/);
assert.match(interpretTrigger.conditions[0].expression, /cr40f_versaoprocessada/);
assert.equal(interpretTrigger.runtimeConfiguration?.concurrency?.runs, 1);
assert.match(interpret.actions.Compose_Input.inputs, /cr40f_mensagensjson/);
assert.deepEqual(interpret.actions.Call_DeepSeek.runtimeConfiguration.secureData.properties.sort(), ["inputs", "outputs"]);
assert.ok(interpret.actions.Call_DeepSeek_Fallback, "fallback DeepSeek deve existir");
assert.ok(interpret.actions.Parse_Primary, "resposta primaria deve ser validada antes do fallback");
assert.ok(interpret.actions.Use_Fallback_On_Low_Confidence?.actions?.Call_DeepSeek_Fallback_Low_Confidence, "baixa confianca com campos completos deve usar fallback");
assert.ok(interpret.actions.Filter_Missing_Passengers, "IDs de passageiros devem ser validados deterministicamente");
assert.match(interpret.actions.Filter_Missing_Passengers.inputs.where, /proposedRegistration/);
assert.ok(interpret.actions.Filter_Missing_Services, "campos obrigatorios dos servicos devem ser validados deterministicamente");
assert.doesNotMatch(interpret.actions.Compose_Deterministic_Missing.inputs, /createArray\(\)/, "array vazio deve usar expressao valida no Power Automate");
assert.ok(interpret.actions.Update_Session_Error, "falha de parsing deve atualizar a sessao");
for (const actionName of ["Compose_Input", "Compose_Primary_Text", "Parse_Primary", "Compose_Selected_Response", "Compose_Proposal", "Parse_Proposal", "Compose_Deterministic_Missing"]) {
  assert.deepEqual(interpret.actions[actionName].runtimeConfiguration?.secureData?.properties, ["inputs"], `${actionName} deve ocultar entradas sem configurar outputs não suportados`);
}
for (const actionName of ["Filter_Missing_Passengers", "Filter_Missing_Services", "Update_Session", "Update_Session_Error"]) {
  assert.deepEqual(interpret.actions[actionName].runtimeConfiguration?.secureData?.properties?.sort(), ["inputs", "outputs"], `${actionName} deve ocultar dados sensiveis`);
}

const scheduleTrigger = schedule.triggers.When_a_session_is_scheduling;
assert.equal(scheduleTrigger.inputs.parameters["subscriptionRequest/message"], 4);
assert.equal(scheduleTrigger.inputs.parameters["subscriptionRequest/filterexpression"], "cr40f_status eq 100000004");
assert.match(scheduleTrigger.conditions[0].expression, /cr40f_versaoconfirmada/);
assert.equal(scheduleTrigger.runtimeConfiguration?.concurrency?.runs, 1);
assert.ok(schedule.actions.Validate_Confirmed_Proposal, "confirmacao deve ser revalidada no backend");
assert.match(schedule.actions.Validate_Confirmed_Proposal.inputs, /proposedRegistration/);
assert.match(schedule.actions.For_each_service.foreach, /Validate_Confirmed_Proposal/);
assert.equal(schedule.actions.For_each_service.runtimeConfiguration?.concurrency?.repetitions, 1);
assert.ok(schedule.actions.For_each_service.actions.Find_existing_reservation, "reserva deve ser idempotente");
assert.ok(schedule.actions.For_each_service.actions.Find_existing_reservation.inputs.parameters["$filter"], "ListRecords deve usar $filter");
assert.equal(schedule.actions.For_each_service.actions.Find_existing_reservation.inputs.parameters["$top"], 1);
assert.equal(schedule.actions.For_each_service.actions.Create_or_reuse_reservation.actions.Create_reservation.inputs.parameters["item/cr40f_status"], 202410004);
const reservationFields = schedule.actions.For_each_service.actions.Create_or_reuse_reservation.actions.Create_reservation.inputs.parameters;
for (const navigationProperty of ["cr40f_Cliente", "cr40f_Solicitante", "cr40f_Passageiro1", "cr40f_Passageiro2", "cr40f_Passageiro3", "cr40f_Passageiro4", "cr40f_ConversaoIAAgendamento"]) {
  assert.ok(reservationFields[`item/${navigationProperty}@odata.bind`], `${navigationProperty} deve usar o nome de navegação publicado no DEV`);
}
assert.ok(schedule.actions.For_each_service.actions.Create_or_reuse_reservation.actions.Create_reservation.inputs.parameters["item/cr40f_observaointerna"], "observacao interna deve usar nome logico do DEV");
assert.ok(schedule.actions.For_each_service.actions.Compose_Current_Reservation_Id, "o retry deve recuperar o id da reserva criada ou existente");
assert.ok(schedule.actions.For_each_service.actions.For_each_passenger_relation, "relacoes de passageiros devem ser gravadas");
assert.match(schedule.actions.For_each_service.actions.Compose_Service_Passengers.inputs, /For_each_service.*passengers/, "cada serviço deve escolher seus passageiros");
assert.equal(schedule.actions.For_each_service.actions.For_each_passenger_relation.foreach, "@outputs('Compose_Service_Passengers')", "relações devem usar passageiros do serviço");
assert.ok(schedule.actions.For_each_service.actions.For_each_passenger_relation.actions.Find_existing_passenger_relation, "relacoes devem ser consultadas antes da criacao");
assert.ok(schedule.actions.For_each_service.actions.For_each_passenger_relation.actions.Create_passenger_relation_if_missing, "relacoes devem ser idempotentes no retomar");
assert.ok(schedule.actions.Update_Session_PartialOrError, "falha parcial deve preservar IDs");
for (const actionName of ["Compose_Proposal"]) {
  assert.deepEqual(schedule.actions[actionName].runtimeConfiguration?.secureData?.properties, ["inputs"], `${actionName} deve ocultar entradas sem configurar outputs não suportados`);
}
for (const actionName of ["Filter_Invalid_Passengers", "Filter_Invalid_Services", "Update_Session_Scheduled", "Update_Session_PartialOrError"]) {
  assert.deepEqual(schedule.actions[actionName].runtimeConfiguration?.secureData?.properties?.sort(), ["inputs", "outputs"], `${actionName} deve ocultar dados sensiveis`);
}

console.log("ai_schedule_flow_contract.test: ok");
