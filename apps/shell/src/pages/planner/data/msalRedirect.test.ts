import { expect, test } from 'vitest'
import { resolvePlannerRedirectUri } from "./msalRedirect";

test("mantém o redirect configurado no localhost", () => {
  expect(resolvePlannerRedirectUri({
      origin: "http://localhost:5192",
      pathname: "/",
      search: "",
      configuredRedirectUri: "http://localhost:5192/redirect.html",
      fallbackRedirect: "http://localhost:5192/redirect.html",
    })).toBe("http://localhost:5192/redirect.html");
});

test("gera o redirect bridge no mesmo ambiente do WebResource aberto pelo main.aspx", () => {
  expect(resolvePlannerRedirectUri({
      origin: "https://org23b93544.crm2.dynamics.com",
      pathname: "/main.aspx",
      search: "?appid=7c7c8fda-53d0-f011-8543-6045bd3a51ea&pagetype=webresource&webresourceName=new_TelaPlanner.html",
      configuredRedirectUri: "http://localhost:5192/redirect.html",
      fallbackRedirect: "http://localhost:5192/redirect.html",
    })).toBe("https://org23b93544.crm2.dynamics.com/WebResources/new_TelaPlanner_redirect.html");
});

test("remove o prefixo de versão quando o Dataverse expõe o WebResource diretamente", () => {
  expect(resolvePlannerRedirectUri({
      origin: "https://orgf261ae8e.crm2.dynamics.com",
      pathname: "/%7b639245003080000142%7d/webresources/new_TelaPlanner.html",
      search: "",
      redirectResourceName: "new_TelaPlanner_redirect.html",
    })).toBe("https://orgf261ae8e.crm2.dynamics.com/WebResources/new_TelaPlanner_redirect.html");
});
