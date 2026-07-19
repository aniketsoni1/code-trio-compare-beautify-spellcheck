/** @ctr/core - the shared model and contracts every Code Trio engine builds on. */
export * from "./model";
export * from "./text";
export * from "./language";
export * from "./permissions";
export * from "./engine";
export * from "./schemas";

/** Semantic version of the shared model, bumped on breaking model changes. */
export const CORE_MODEL_VERSION = "1.0.0";
