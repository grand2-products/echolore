/**
 * API Client for corp-internal
 * Handles all communication with the backend API
 *
 * This barrel re-exports everything from the sub-modules so that existing
 * `import { ... } from "@/lib/api"` imports continue to work unchanged.
 */

export * from "./types";
export * from "./fetch";
export * from "./users";
export * from "./auth";
export * from "./wiki";
export * from "./meetings";
export * from "./admin";
export * from "./calendar";
export * from "./files";
export * from "./site-settings";
export * from "./query-keys";
export * from "./hooks";
