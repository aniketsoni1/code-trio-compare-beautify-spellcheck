import { type Dictionary, makeDictionary } from "./dictionary";

/**
 * Dictionary scopes and their precedence.
 *
 * v0.1.0 had exactly one custom scope — a single checked-in project dictionary
 * — so there was nothing to resolve and nothing to explain. Multi-root
 * workspaces need more: a word that is correct in one folder of a monorepo is
 * often noise in another, and a personal preference should not require a commit
 * to a shared file.
 *
 * Precedence, highest first. The first scope that has an opinion wins.
 *
 *   1. session      — "ignore for this session", in memory only
 *   2. folder       — the workspace folder that owns the document
 *   3. workspace    — the workspace or repository root
 *   4. user         — the user's own dictionary, outside the repository
 *   5. technical    — bundled technical terms
 *   6. base         — bundled English baseline
 *
 * Higher scopes are more specific and more recently expressed, so they win.
 * "Has an opinion" matters: a scope can *block* a word with a leading `!`
 * entry, which is how a folder can reject a word the workspace accepted.
 * Without blocking, precedence would only ever be additive and the order would
 * be meaningless.
 */
export type DictionaryScope =
  | "session"
  | "folder"
  | "workspace"
  | "user"
  | "technical"
  | "base";

/** Scopes in precedence order, most specific first. */
export const SCOPE_PRECEDENCE: readonly DictionaryScope[] = [
  "session",
  "folder",
  "workspace",
  "user",
  "technical",
  "base",
];

/** Human-readable description of each scope, for UI and documentation. */
export const SCOPE_LABELS: Readonly<Record<DictionaryScope, string>> = {
  session: "Session (this window only, not saved)",
  folder: "Workspace folder dictionary",
  workspace: "Workspace dictionary",
  user: "User dictionary",
  technical: "Built-in technical dictionary",
  base: "Built-in base dictionary",
};

/** One layer of the stack. */
export interface DictionaryLayer {
  readonly scope: DictionaryScope;
  /** Where the words came from, for "view dictionary source" actions. */
  readonly origin?: string;
  /** Accepted words. */
  readonly words: readonly string[];
  /**
   * Words this layer explicitly rejects, from `!word` entries. A rejection at a
   * higher-precedence scope overrides acceptance at a lower one.
   */
  readonly blocked?: readonly string[];
  /** True when the layer's file was expected but could not be read. */
  readonly unavailable?: boolean;
  /** Why the layer is unavailable, for diagnostics. */
  readonly error?: string;
}

/** Where a word was found, and whether it was accepted. */
export interface WordLookup {
  readonly known: boolean;
  readonly scope?: DictionaryScope;
  readonly origin?: string;
  /** True when the deciding layer rejected rather than accepted the word. */
  readonly blocked?: boolean;
}

/**
 * A precedence-ordered stack of dictionary layers.
 *
 * Implements `Dictionary` so it can be dropped into the spell engine
 * unchanged, while additionally answering "which scope decided this?" — which
 * is what lets the UI offer "remove from workspace dictionary" against the
 * right file instead of guessing.
 */
export class DictionaryStack implements Dictionary {
  private readonly layers: DictionaryLayer[] = [];
  private readonly accept = new Map<DictionaryScope, Set<string>>();
  private readonly reject = new Map<DictionaryScope, Set<string>>();
  /** Words added at runtime via `add`, treated as session scope. */
  private readonly session = new Set<string>();
  private cachedList: string[] | undefined;

  constructor(layers: readonly DictionaryLayer[] = []) {
    for (const layer of layers) this.push(layer);
  }

  /** Add a layer. Later calls for the same scope merge into it. */
  push(layer: DictionaryLayer): this {
    this.layers.push(layer);
    const accepted = this.accept.get(layer.scope) ?? new Set<string>();
    for (const w of layer.words) {
      const n = normalize(w);
      if (n) accepted.add(n);
    }
    this.accept.set(layer.scope, accepted);

    if (layer.blocked && layer.blocked.length > 0) {
      const rejected = this.reject.get(layer.scope) ?? new Set<string>();
      for (const w of layer.blocked) {
        const n = normalize(w);
        if (n) rejected.add(n);
      }
      this.reject.set(layer.scope, rejected);
    }
    this.cachedList = undefined;
    return this;
  }

  /**
   * Resolve a word against the stack, reporting which scope decided.
   *
   * Walks scopes in precedence order and stops at the first that either accepts
   * or rejects. A rejection is a decision: it stops the walk so a lower scope
   * cannot re-accept the word.
   */
  lookup(word: string): WordLookup {
    const n = normalize(word);
    if (!n) return { known: true };
    if (this.session.has(n)) {
      return { known: true, scope: "session", origin: "session ignore list" };
    }
    for (const scope of SCOPE_PRECEDENCE) {
      if (this.reject.get(scope)?.has(n)) {
        return { known: false, scope, origin: this.originOf(scope), blocked: true };
      }
      if (this.accept.get(scope)?.has(n)) {
        return { known: true, scope, origin: this.originOf(scope) };
      }
    }
    return { known: false };
  }

  private originOf(scope: DictionaryScope): string | undefined {
    return this.layers.find((l) => l.scope === scope && l.origin)?.origin;
  }

  has(word: string): boolean {
    return this.lookup(word).known;
  }

  /** Add a word for this session only. Never touches a file. */
  add(word: string): void {
    const n = normalize(word);
    if (n) {
      this.session.add(n);
      this.cachedList = undefined;
    }
  }

  /**
   * Every accepted word, for suggestion generation.
   *
   * Blocked words are excluded so a word a folder has rejected is never offered
   * as a correction. Cached because the spell engine asks for it once per
   * document and rebuilding the union of six layers per call is wasteful.
   */
  list(): readonly string[] {
    if (this.cachedList) return this.cachedList;
    const out = new Set<string>(this.session);
    for (const scope of SCOPE_PRECEDENCE) {
      const rejectedHere = this.reject.get(scope);
      for (const w of this.accept.get(scope) ?? []) {
        if (!this.isBlockedAbove(w, scope) && !rejectedHere?.has(w)) out.add(w);
      }
    }
    this.cachedList = [...out];
    return this.cachedList;
  }

  private isBlockedAbove(word: string, scope: DictionaryScope): boolean {
    for (const s of SCOPE_PRECEDENCE) {
      if (s === scope) return false;
      if (this.reject.get(s)?.has(word)) return true;
    }
    return false;
  }

  get size(): number {
    return this.list().length;
  }

  /** The layers, in the order they were added. For reporting and diagnostics. */
  describe(): readonly DictionaryLayer[] {
    return this.layers;
  }

  /** Layers that were expected but could not be loaded. */
  problems(): readonly DictionaryLayer[] {
    return this.layers.filter((l) => l.unavailable);
  }

  /** A plain `Dictionary` view, for callers that want no scope information. */
  flatten(): Dictionary {
    return makeDictionary(this.list());
  }
}

function normalize(word: string): string {
  return word.trim().toLowerCase();
}
