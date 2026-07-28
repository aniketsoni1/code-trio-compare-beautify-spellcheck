/**
 * A minimal cancellation contract shared by every engine.
 *
 * It is structurally compatible with `vscode.CancellationToken` and with
 * `AbortSignal`-shaped adapters, so the extension can pass VS Code's token
 * straight through and the CLI can build one from a signal handler — without
 * either engine ever importing `vscode` or `node:*`.
 *
 * Engines poll the token at loop boundaries rather than accepting a callback,
 * because polling keeps the engines synchronous and therefore trivially
 * testable. A cancelled engine throws `CancellationError`; it never returns a
 * partial result dressed up as a complete one.
 */
export interface CancellationToken {
  readonly isCancellationRequested: boolean;
}

/** A token that is never cancelled. Shared, because it is immutable. */
export const NEVER_CANCELLED: CancellationToken = Object.freeze({
  isCancellationRequested: false,
});

/**
 * Thrown when an engine observes cancellation. Distinguished by a `name` check
 * rather than `instanceof`, so it survives being thrown across a bundle
 * boundary where two copies of the class could otherwise exist.
 */
export class CancellationError extends Error {
  override readonly name = "CancellationError";

  constructor(operation?: string) {
    super(operation ? `Operation cancelled: ${operation}` : "Operation cancelled");
  }
}

/** True when `err` is a cancellation, whichever copy of the class produced it. */
export function isCancellationError(err: unknown): boolean {
  return err instanceof Error && err.name === "CancellationError";
}

/** Throw `CancellationError` if the token has been cancelled. */
export function throwIfCancelled(token: CancellationToken | undefined, operation?: string): void {
  if (token?.isCancellationRequested) throw new CancellationError(operation);
}

/**
 * A token whose state a caller controls directly.
 *
 * The token is a separate object from the source so that handing a token to an
 * engine does not hand it the ability to cancel — the engine can observe, only
 * the owner can trigger.
 */
export class CancellationSource {
  private cancelled = false;

  readonly token: CancellationToken = {
    isCancellationRequested: false,
  };

  constructor() {
    Object.defineProperty(this.token, "isCancellationRequested", {
      get: () => this.cancelled,
      enumerable: true,
    });
  }

  cancel(): void {
    this.cancelled = true;
  }
}

/**
 * A token that cancels itself once `budgetMs` of wall-clock time has elapsed.
 *
 * Used as a safety net around unbounded work (a pathological diff, a very large
 * workspace scan) so a runaway operation degrades into a reported cancellation
 * instead of a hung editor. `now` is injectable so tests need no fake timers.
 */
export function timeBudgetToken(
  budgetMs: number,
  now: () => number = Date.now,
): CancellationToken {
  const deadline = now() + budgetMs;
  return {
    get isCancellationRequested(): boolean {
      return now() > deadline;
    },
  };
}

/** A token that is cancelled when any of the inputs is. */
export function anyCancelled(
  ...tokens: readonly (CancellationToken | undefined)[]
): CancellationToken {
  const present = tokens.filter((t): t is CancellationToken => t !== undefined);
  if (present.length === 0) return NEVER_CANCELLED;
  if (present.length === 1) return present[0] as CancellationToken;
  return {
    get isCancellationRequested(): boolean {
      return present.some((t) => t.isCancellationRequested);
    },
  };
}
