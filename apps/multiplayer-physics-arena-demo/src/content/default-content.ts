import { compileArenaContent, createArenaDataRegistry } from "./registry";

/** Immutable default content shared by authority, prediction, validation and presentation. */
export const ARENA_COMPILED_CONTENT = compileArenaContent(createArenaDataRegistry());
