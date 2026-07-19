import { z } from "zod";

/**
 * Zod schemas mirroring the model types. These validate data crossing a trust
 * boundary (config files, project dictionaries, JSON passed to the CLI) and are
 * the single source of truth for those shapes.
 */

export const PositionSchema = z.object({
  line: z.number().int().nonnegative(),
  character: z.number().int().nonnegative(),
});

export const RangeSchema = z.object({
  start: PositionSchema,
  end: PositionSchema,
});

export const TextEditSchema = z.object({
  range: RangeSchema,
  newText: z.string(),
});

export const TokenKindSchema = z.enum(["identifier", "comment", "string", "keyword", "other"]);

export const TokenSchema = z.object({
  kind: TokenKindSchema,
  text: z.string(),
  offset: z.number().int().nonnegative(),
  range: RangeSchema,
});

export const DocumentSchema = z.object({
  uri: z.string().min(1),
  languageId: z.string().min(1),
  text: z.string(),
  version: z.number().int().optional(),
});

export const SeveritySchema = z.enum(["error", "warning", "information", "hint"]);

export const QuickFixSchema = z.object({
  title: z.string(),
  kind: z.enum(["replace", "addToDictionary", "ignore"]),
  edits: z.array(TextEditSchema),
  word: z.string().optional(),
  isPreferred: z.boolean().optional(),
});

export const DiagnosticSchema = z.object({
  source: z.string(),
  code: z.string().optional(),
  message: z.string(),
  severity: SeveritySchema,
  range: RangeSchema,
  quickFixes: z.array(QuickFixSchema).optional(),
  data: z.record(z.unknown()).optional(),
});

export const DiffGranularitySchema = z.enum(["line", "word", "char"]);

export const FormatterInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
});

/** A permissive project-dictionary schema: a newline word list is parsed
 * elsewhere; this validates the structured form. */
export const ProjectDictionarySchema = z.object({
  words: z.array(z.string()),
  ignoreWords: z.array(z.string()).default([]),
});

export type ProjectDictionary = z.infer<typeof ProjectDictionarySchema>;

/** Parse helper that returns a typed value or throws a readable error. */
export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`);
    throw new Error(`Invalid ${label}:\n  ${issues.join("\n  ")}`);
  }
  return result.data;
}
