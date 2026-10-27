import { expect, test } from 'vitest'

type Listener = (event: Record<string, unknown>) => void
const g = globalThis as unknown as Record<string, unknown>
const fakeWindow = () => g.window as Record<string, unknown>

import { APP_VERSION } from './version';
import { buildErrorLogRecord, installGlobalErrorLogging, logAppError, resetErrorLoggerForTests, sanitizeDataversePath, setErrorLogContext } from './errorLogger';

function installFakeBrowser() {
  const posts: Array<{ url: string; body: Record<string, string> }> = [];
  const listeners: Record<string, Listener | undefined> = {};
  g.window = {
    Xrm: { Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org.crm2.dynamics.com/', userSettings: { userId: '{ABC}', userName: 'Juliana' } }) } },
    location: { href: 'https://org.crm2.dynamics.com/WebResources/new_TelaPlanner.html' },
    innerWidth: 1280, innerHeight: 720,
    addEventListener: (type: string, fn: Listener) => { listeners[type] = fn; },
    removeEventListener: (type: string) => { delete listeners[type]; },
  };
  g.document = { referrer: '', visibilityState: 'visible' };
  g.fetch = async (url: string, options: { body: string }) => { posts.push({ url, body: JSON.parse(options.body) }); return { ok: true }; };
  resetErrorLoggerForTests();
  return { posts, listeners };
}

test('monta o registro com usuário, tela, versão e mensagem', () => {
  setErrorLogContext({ screen: 'kanban', userEmail: 'juliana@betinhos.com.br' });
  const record = buildErrorLogRecord(new Error('boom'), { action: 'GET /x', source: 'Dataverse', errorCode: '500' }, { userSettings: { userId: '{ABC}', userName: 'Juliana' }, now: '2026-10-19T12:00:00Z' });
  expect(record.new_appname).toBe('Tela Planner');
  expect(record.new_screen).toBe('kanban');
  expect(record.new_userid).toBe('ABC');
  expect(record.new_username).toBe('Juliana');
  expect(record.new_useremail).toBe('juliana@betinhos.com.br');
  expect(record.new_builtat).toBe(APP_VERSION);
  expect(record.new_message).toBe('boom');
  expect(record.new_errorcode).toBe('500');
  expect(record.new_name.length <= 160).toBeTruthy();
});

test('remove query e GUIDs da rota do Dataverse', () => {
  expect(sanitizeDataversePath('/cr40f_plannertarefas(0fe9c337-a0c9-f111-a05c-7ced8da8c473)?$select=a')).toBe('/cr40f_plannertarefas(id)');
});

test('grava na tabela de logs e não repete o mesmo erro em seguida', async () => {
  const { posts } = installFakeBrowser();
  await logAppError(new Error('falhou'), { action: 'GET /a' });
  await logAppError(new Error('falhou'), { action: 'GET /a' });
  expect(posts.length).toBe(1);
  expect(posts[0].url).toBe('https://org.crm2.dynamics.com/api/data/v9.2/new_appmotoristaslogs');
  expect(posts[0].body.new_message).toBe('falhou');
});

test('não grava sem contexto do Dataverse (modo mock)', async () => {
  const { posts } = installFakeBrowser();
  fakeWindow().Xrm = undefined;
  await logAppError(new Error('mock'));
  expect(posts.length).toBe(0);
});

test('captura window.error e unhandledrejection', async () => {
  const { posts, listeners } = installFakeBrowser();
  const uninstall = installGlobalErrorLogging(fakeWindow() as unknown as Parameters<typeof installGlobalErrorLogging>[0]);
  listeners.error!({ error: new Error('quebrou'), filename: 'app.js', lineno: 1, colno: 2 });
  listeners.unhandledrejection!({ reason: new Error('promessa') });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(posts.map((post) => post.body.new_action).sort()).toStrictEqual(['unhandledrejection', 'window.error']);
  uninstall();
  expect(listeners.error).toBe(undefined);
});
