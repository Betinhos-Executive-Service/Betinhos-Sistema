const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const commandPath = path.join(root, "model_driven_formulario_geral_command.js");

assert.ok(fs.existsSync(commandPath), "arquivo de comando do Model-driven deve existir");

const source = fs.readFileSync(commandPath, "utf8");
assert.ok(source.includes("new_formulario_geral.html"), "comando deve apontar para o web resource HTML publicado");
assert.ok(source.includes("openCreate"), "comando deve expor abertura de criacao");
assert.ok(source.includes("openEdit"), "comando deve expor abertura de edicao");
assert.ok(source.includes("selectedItemReferences"), "comando deve aceitar selecao da grid");
assert.ok(source.includes("navigateTo"), "comando deve abrir via Xrm.Navigation.navigateTo");
assert.ok(source.includes("safeCall(() => global.top?.Xrm)"), "comando deve proteger acesso a top.Xrm");

(async () => {
  const calls = [];
  const sandbox = {
    window: {},
    console,
    Xrm: {
      Navigation: {
        navigateTo(pageInput, navigationOptions) {
          calls.push({ pageInput, navigationOptions });
          return Promise.resolve();
        },
        openAlertDialog() {
          throw new Error("openAlertDialog nao deve ser chamado neste teste");
        }
      },
      Utility: {
        getGlobalContext() {
          return { getClientUrl: () => "https://org.crm.dynamics.com" };
        }
      }
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: commandPath });

  assert.ok(sandbox.BetinhosFormularioGeral, "namespace global deve existir");
  await sandbox.BetinhosFormularioGeral.openCreate();
  assert.equal(calls[0].pageInput.pageType, "webresource", "criacao deve abrir webresource");
  assert.equal(calls[0].pageInput.webresourceName, "new_formulario_geral.html", "criacao deve usar o HTML publicado");
  assert.equal(JSON.parse(calls[0].pageInput.data).mode, "create", "criacao deve enviar modo create");
  assert.equal(calls[0].navigationOptions.target, 1, "criacao deve abrir integrada ao Model-driven App");

  const selectedId = "{11111111-2222-3333-4444-555555555555}";
  await sandbox.BetinhosFormularioGeral.openEdit(null, [{ Id: selectedId }]);
  const editData = JSON.parse(calls[1].pageInput.data);
  assert.equal(editData.mode, "edit", "edicao deve enviar modo edit");
  assert.equal(editData.recordId, "11111111-2222-3333-4444-555555555555", "edicao deve enviar id limpo");
  assert.equal(editData.entityName, "cr40f_reservadeveculos", "edicao deve enviar entidade da reserva");

  const guardedCalls = [];
  const guardedSandbox = {
    window: {},
    console,
    Xrm: {
      Navigation: {
        navigateTo(pageInput) {
          guardedCalls.push(pageInput);
          return Promise.resolve();
        }
      }
    }
  };
  Object.defineProperty(guardedSandbox, "top", {
    get() {
      throw new Error("top bloqueado");
    }
  });
  guardedSandbox.window = guardedSandbox;
  vm.createContext(guardedSandbox);
  vm.runInContext(source, guardedSandbox, { filename: commandPath });
  await guardedSandbox.BetinhosFormularioGeral.openCreate();
  assert.equal(guardedCalls.length, 1, "comando deve ignorar top cross-origin quando Xrm local existe");

  console.log("model_driven_command: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
