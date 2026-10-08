/**
 * The original parser reads the wall clock, so run it with the clock shifted to
 * when the message was sent. The clock keeps ticking (an offset, not a freeze)
 * so the SDK's own timeouts still behave. Eval-only; never do this in app code.
 */
export async function withClock<T>(now: Date, fn: () => Promise<T>): Promise<T> {
  const RealDate = Date;
  const offset = now.getTime() - RealDate.now();
  class ShiftedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...(args as [string | number]));
    }
    static now() {
      return RealDate.now() + offset;
    }
  }
  globalThis.Date = ShiftedDate as DateConstructor;
  try {
    return await fn();
  } finally {
    globalThis.Date = RealDate;
  }
}
