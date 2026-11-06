export function createRemoteReadBatch(limit = 4) {
  let active = 0;
  const waiting: Array<() => void> = [];
  const cached = new Map<string, Promise<unknown>>();

  function next() {
    if (active >= limit) return;
    const start = waiting.shift();
    if (start) start();
  }

  function run<T>(request: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      waiting.push(() => {
        active += 1;
        void Promise.resolve().then(request).then(resolve, reject).finally(() => {
          active -= 1;
          next();
        });
      });
      next();
    });
  }

  function once<T>(key: string, request: () => Promise<T>): Promise<T> {
    const existing = cached.get(key);
    if (existing) return existing as Promise<T>;
    const pending = run(request).catch((error: unknown) => {
      cached.delete(key);
      throw error;
    });
    cached.set(key, pending);
    return pending;
  }

  return { run, once };
}

/** Como Promise.all(items.map(fn)), mas com no máximo `limit` itens em andamento; o resultado mantém a ordem. */
export async function mapWithLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        // Como no Promise.all: a primeira falha rejeita e os demais itens deixam de começar.
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}
