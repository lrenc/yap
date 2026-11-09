export function cancellable<T>(
  events: AsyncGenerator<T>,
  cancel: () => Promise<unknown>,
): AsyncGenerator<T> {
  const finish = events.return.bind(events);
  const fail = events.throw.bind(events);

  events.return = value => {
    const cleanup = cancel();
    return finish(value).finally(() => cleanup);
  };

  events.throw = error => {
    const cleanup = cancel();
    return fail(error).finally(() => cleanup);
  };
  return events;
}
