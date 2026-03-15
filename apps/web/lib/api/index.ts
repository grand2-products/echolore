/**
 * API Client for corp-internal
 * Handles all communication with the backend API
 *
 * This barrel re-exports everything from the sub-modules so that existing
 * `import { ... } from "@/lib/api"` imports continue to work unchanged.
 */

export * from "./admin";
export * from "./auth";
export * from "./calendar";
export * from "./fetch";
export * from "./files";
export * from "./hooks";
export * from "./meetings";
export * from "./query-keys";
export * from "./site-settings";
export * from "./types";
export * from "./users";
export * from "./wiki";
