import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageVersion = JSON.parse(
  readFileSync(join(root, "packages/core/package.json"), "utf8")
).version;
const releaseVersion = process.env.GAMEKITS_RELEASE_VERSION ?? packageVersion;
const releaseDir =
  process.env.GAMEKITS_RELEASE_DIR ?? mkdtempSync(join(tmpdir(), "gamekits-release-"));
const distTag = process.env.GAMEKITS_NPM_TAG ?? inferDistTag(releaseVersion);

function inferDistTag(version) {
  const prerelease = version.split("-")[1]?.split(".")[0];
  if (prerelease === "alpha" || prerelease === "beta" || prerelease === "rc") {
    return prerelease;
  }

  return "latest";
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: root,
    env: {
      ...process.env,
      GAMEKITS_NPM_TAG: distTag,
      GAMEKITS_RELEASE_DIR: releaseDir,
      GAMEKITS_RELEASE_VERSION: releaseVersion,
      GAMEKITS_RELEASE_WAVE: process.env.GAMEKITS_RELEASE_WAVE ?? "all"
    },
    stdio: "inherit",
    ...options
  });
}

console.log(`Preparing @gamekits release ${releaseVersion} for npm dist-tag "${distTag}".`);
run("corepack", ["pnpm", "verify:release:gamekits"]);
run("corepack", ["pnpm", "publish:release:gamekits"]);
