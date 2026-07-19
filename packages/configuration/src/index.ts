/** @ctr/configuration - namespaced config schema, defaults, and merge helpers. */
export {
  DiffConfigSchema,
  SpellConfigSchema,
  FormatConfigSchema,
  CodeTrioConfigSchema,
  DEFAULT_CONFIG,
  resolveConfig,
  mergeConfig,
  type DiffConfig,
  type SpellConfig,
  type FormatConfig,
  type CodeTrioConfig,
  type DeepPartial,
} from "./config";
