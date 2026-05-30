import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FORBIDDEN_GAME_IMPORTS = [
  "phaser",
  "@gamekit/driver-phaser",
  "@gamekit/renderer-phaser",
  "@gamekit/app-host",
  "@gamekit/input-dom",
  "@gamekit/platform-web",
  "@gamekit/world-koota",
  "react",
  "react-dom"
];

describe("Abyss Delve package boundaries", () => {
  it("keeps gameplay free of external runtime and UI imports", () => {
    for (const file of gameFiles()) {
      const source = readFileSync(file, "utf8");
      for (const forbidden of FORBIDDEN_GAME_IMPORTS) {
        expect(source, `${file} imports ${forbidden}`).not.toContain(`"${forbidden}"`);
        expect(source, `${file} imports ${forbidden}`).not.toContain(`'${forbidden}'`);
      }
    }
  });
});

function gameFiles(): string[] {
  return collectTsFiles(join(import.meta.dirname, "game"));
}

function collectTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectTsFiles(path);
    }
    return entry.isFile() && path.endsWith(".ts") ? [path] : [];
  });
}
