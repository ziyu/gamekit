import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const packageRoot = process.cwd();
const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const shouldBundleDts = manifest.gamekitBuild?.bundleDts !== false;

function removeBuildInfo(path) {
  try {
    const stat = statSync(path);
    if (!stat.isDirectory()) {
      if (path.endsWith(".tsbuildinfo")) {
        rmSync(path, { force: true });
      }
      return;
    }

    for (const entry of readdirSync(path)) {
      removeBuildInfo(join(path, entry));
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

const externalDependencies = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.peerDependencies ?? {}),
  ...Object.keys(manifest.optionalDependencies ?? {})
]);

rmSync(join(packageRoot, "dist"), { recursive: true, force: true });
removeBuildInfo(packageRoot);

execFileSync(
  "tsc",
  [
    "-p",
    "tsconfig.json",
    ...(shouldBundleDts ? ["--noEmit"] : ["--emitDeclarationOnly"]),
    "--ignoreDeprecations",
    "5.0"
  ],
  {
    cwd: packageRoot,
    stdio: "inherit"
  }
);

removeBuildInfo(packageRoot);

execFileSync(
  "tsdown",
  [
    "src/index.ts",
    "--format",
    "esm",
    "--target",
    "es2022",
    "--platform",
    "neutral",
    "--out-dir",
    "dist",
    ...(shouldBundleDts ? ["--dts", "--clean"] : ["--no-dts", "--no-clean"]),
    ...[...externalDependencies].flatMap((dependency) => ["--deps.never-bundle", dependency])
  ],
  {
    cwd: packageRoot,
    stdio: "inherit"
  }
);

removeBuildInfo(packageRoot);
