export function cancellable<T>(
  events: AsyncGenerator<T>,
  cancel: () => Promise<unknown>,
): AsyncGenerator<T> {
  const finish = events.return.bind(events);
  const fail = events.throw.bind(events);
  let cancelled = false;

  const cancelOnce = (): Promise<unknown> => {
    if (cancelled) {
      return Promise.resolve();
    }
    cancelled = true;
    return cancel();
  };

  events.return = value => {
    const cleanup = cancelOnce();
    return finish(value).finally(() => cleanup);
  };

  events.throw = error => {
    const cleanup = cancelOnce();
    return fail(error).finally(() => cleanup);
  };
  return events;
}
