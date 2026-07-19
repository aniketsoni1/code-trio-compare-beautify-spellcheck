/**
 * A small capability/permission model. Every operation an app can perform on
 * the user's behalf is described by a `ToolDescriptor`. Read operations (diff,
 * spell check) are safe; write operations (applying a format, editing the
 * dictionary) are explicit and auditable so a host can gate them behind
 * Workspace Trust or a confirmation prompt.
 */

export type AccessMode = "read" | "write";
export type RiskLevel = "none" | "low" | "medium" | "high";

export interface ToolDescriptor {
  readonly id: string;
  readonly title: string;
  readonly access: AccessMode;
  readonly risk: RiskLevel;
  /** Soft timeout budget in milliseconds. */
  readonly timeoutMs: number;
  /** Whether invocations should be recorded in an audit log. */
  readonly audit: boolean;
  readonly description: string;
}

export const TOOL_DESCRIPTORS = {
  "diff.compare": {
    id: "diff.compare",
    title: "Compare two documents",
    access: "read",
    risk: "none",
    timeoutMs: 5_000,
    audit: false,
    description: "Computes a two-way or three-way diff. Pure and read-only.",
  },
  "spell.check": {
    id: "spell.check",
    title: "Spell check a document",
    access: "read",
    risk: "none",
    timeoutMs: 5_000,
    audit: false,
    description: "Produces spelling diagnostics. Pure and read-only.",
  },
  "spell.addWord": {
    id: "spell.addWord",
    title: "Add a word to the project dictionary",
    access: "write",
    risk: "low",
    timeoutMs: 2_000,
    audit: true,
    description: "Appends a word to the checked-in project dictionary file.",
  },
  "format.preview": {
    id: "format.preview",
    title: "Preview formatting",
    access: "read",
    risk: "none",
    timeoutMs: 10_000,
    audit: false,
    description: "Runs a formatter and returns a dry-run diff without writing.",
  },
  "format.apply": {
    id: "format.apply",
    title: "Apply formatting to a document",
    access: "write",
    risk: "medium",
    timeoutMs: 10_000,
    audit: true,
    description: "Overwrites document contents with formatter output.",
  },
} as const satisfies Record<string, ToolDescriptor>;

export type ToolId = keyof typeof TOOL_DESCRIPTORS;

export function getToolDescriptor(id: ToolId): ToolDescriptor {
  return TOOL_DESCRIPTORS[id];
}

/** True when the descriptor mutates user files and should be gated. */
export function isWriteTool(id: ToolId): boolean {
  return TOOL_DESCRIPTORS[id].access === "write";
}
