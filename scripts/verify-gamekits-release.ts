import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

type PackageManifest = {
  name: string;
  version: string;
  type?: string;
  main?: string;
  types?: string;
  exports?: unknown;
  repository?: {
    type: "git";
    url: string;
    directory?: string;
  };
  sideEffects?: boolean | string[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  optionalDependencies?: Record<string, string>;
  optionalPeerDependencies?: Record<string, string>;
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const releaseRepositoryUrl = "https://github.com/ziyu/gamekit";
const releaseVersion = process.env.GAMEKITS_RELEASE_VERSION ?? "0.1.0-alpha.0";
const releaseDir =
  process.env.GAMEKITS_RELEASE_DIR ?? mkdtempSync(join(tmpdir(), "gamekits-release-"));
const shouldCleanReleaseDir = process.env.GAMEKITS_RELEASE_DIR === undefined;
const commandEnv = {
  ...process.env,
  npm_config_cache: join(releaseDir, "npm-cache"),
  npm_config_logs_dir: join(releaseDir, "npm-logs")
};

const wave1PackageSlugs = [
  "core",
  "event-bus",
  "world",
  "platform-core",
  "renderer-core",
  "world-koota",
  "game-runtime",
  "data",
  "tca",
  "gas",
  "test-utils"
];

const wave2SupportPackageSlugs = wave1PackageSlugs.filter(
  (slug) => !["world-koota", "test-utils"].includes(slug)
);

const wave2PackageSlugs = [
  "input-core",
  "camera-core",
  "driver-core",
  "devtools",
  "ui-core",
  "asset",
  "save",
  "platform-web",
  "input-dom",
  "renderer-phaser",
  "driver-phaser",
  "driver-three",
  "app-host"
];

const wave3SupportPackageSlugs = ["core", "devtools", "ui-core"];

const wave3PackageSlugs = ["react-ui", "devtools-ui"];

const allPackageSlugs = unique([...wave1PackageSlugs, ...wave2PackageSlugs, ...wave3PackageSlugs]);

const releaseWave = process.env.GAMEKITS_RELEASE_WAVE ?? "1";
const installOffline = process.env.GAMEKITS_RELEASE_OFFLINE === "1";

const smokeSource = `
import { Clock } from "@gamekits/core";
import { createEventBus } from "@gamekits/event-bus";
import { defineComponent } from "@gamekits/world";
import { createKootaWorld } from "@gamekits/world-koota";
import { createGame } from "@gamekits/game-runtime";
import { createDataRegistry } from "@gamekits/data";
import { createCoreTcaDefinitions, createTcaRuleDataType, createTcaTraceStore } from "@gamekits/tca";
import { GasActor, createGasDataTypes, createGasTraceStore } from "@gamekits/gas";
import { createPlatformServiceRegistry } from "@gamekits/platform-core";

const clock = new Clock();
clock.start();
clock.tick(16);

const bus = createEventBus({ now: () => 1 });
const events = [];
bus.onAny((event) => events.push(event));
bus.emit("release.smoke", { ok: true }, "verify");

const Position = defineComponent({ id: "position", create: () => ({ x: 0, y: 0 }) });
const world = createKootaWorld();
const entity = world.spawn();
world.add(entity, Position, { x: 1 });
world.add(entity, GasActor, { id: "actor.release-smoke" });

const game = createGame({ modules: [], world, eventBus: bus, seed: "release-smoke" });
game.start();
game.tick(16);
game.dispose();

const data = createDataRegistry();
data.registerType(createTcaRuleDataType());
for (const type of createGasDataTypes()) {
  data.registerType(type);
}

createCoreTcaDefinitions();
createTcaTraceStore();
createGasTraceStore();
createPlatformServiceRegistry();

if (clock.snapshot().ticks !== 1) throw new Error("clock smoke failed");
if (world.count() !== 1) throw new Error("world smoke failed");
if (events[0]?.type !== "release.smoke") throw new Error("event smoke failed");
console.log("gamekits wave 1 smoke ok");
`;

const wave2BaseSmokeSource = `
import { Clock } from "@gamekits/core";
import { createEventBus } from "@gamekits/event-bus";
import { defineComponent } from "@gamekits/world";
import { createDataRegistry } from "@gamekits/data";
import { createCoreTcaDefinitions, createTcaRuleDataType, createTcaTraceStore } from "@gamekits/tca";
import { createGasDataTypes, createGasTraceStore } from "@gamekits/gas";
import { createPlatformServiceRegistry } from "@gamekits/platform-core";

const clock = new Clock();
clock.start();
clock.tick(16);

const bus = createEventBus({ now: () => 1 });
const events = [];
bus.onAny((event) => events.push(event));
bus.emit("release.wave2.base", { ok: true }, "verify");

defineComponent({ id: "position", create: () => ({ x: 0, y: 0 }) });

const data = createDataRegistry();
data.registerType(createTcaRuleDataType());
for (const type of createGasDataTypes()) {
  data.registerType(type);
}

createCoreTcaDefinitions();
createTcaTraceStore();
createGasTraceStore();
createPlatformServiceRegistry();

if (clock.snapshot().ticks !== 1) throw new Error("clock smoke failed");
if (events[0]?.type !== "release.wave2.base") throw new Error("event smoke failed");
`;

const testUtilsSmokeSource = `
import { describe, expect, it } from "vitest";
import { createEventBus } from "@gamekits/event-bus";
import { createMemoryRenderer, recordEvents } from "@gamekits/test-utils";

describe("@gamekits/test-utils release smoke", () => {
  it("exports vitest-facing helpers", () => {
    const bus = createEventBus({ now: () => 1 });
    const recorder = recordEvents();
    bus.onAny(recorder.push);
    bus.emit("release.test-utils", {}, "verify");

    expect(recorder.types()).toEqual(["release.test-utils"]);
    expect(createMemoryRenderer().id).toBe("memory-renderer");
  });
});
`;

const wave2SmokeSource = `
import { createWebPlatform } from "@gamekits/platform-web";
import { createDriverRegistry } from "@gamekits/driver-core";
import { createPhaserDriver } from "@gamekits/driver-phaser";
import { createThreeDriver } from "@gamekits/driver-three";
import { createInputRouter } from "@gamekits/input-core";
import { createDomInputAdapter } from "@gamekits/input-dom";
import { createCameraController } from "@gamekits/camera-core";
import { createAssetManager } from "@gamekits/asset";
import { createMemorySaveStore } from "@gamekits/save";
import { createDevToolsRuntime } from "@gamekits/devtools";
import { createUiRuntime as createWave2UiRuntime } from "@gamekits/ui-core";
import { createHeadlessHost, createStandardAppProfile, defineGameApp } from "@gamekits/app-host";

const platform = createWebPlatform({ appName: "GameKits Wave 2 Smoke" });
if ((await platform.services.app.name()) !== "GameKits Wave 2 Smoke") {
  throw new Error("platform smoke failed");
}

const phaserDriver = createPhaserDriver({ id: "phaser-smoke" });
const threeDriver = createThreeDriver({ id: "three-smoke" });
const drivers = createDriverRegistry([phaserDriver, threeDriver]);
if (!drivers.has("phaser-smoke") || drivers.require("phaser-smoke").capabilities().renderer !== true) {
  throw new Error("driver smoke failed");
}
if (!drivers.has("three-smoke") || drivers.require("three-smoke").capabilities().assets !== true) {
  throw new Error("three driver smoke failed");
}

const inputRouter = createInputRouter();
let inputCount = 0;
const domTarget = {
  addEventListener() {
    inputCount += 1;
  },
  removeEventListener() {
    inputCount -= 1;
  }
};
const domInput = createDomInputAdapter({
  target: domTarget,
  onInput(input) {
    inputRouter.handle(input);
  },
  scope: "game",
  clock: () => 1
});
domInput.start();
domInput.stop();
if (inputCount !== 0) throw new Error("dom input smoke failed");

const camera = createCameraController({ viewport: { width: 800, height: 600 } });
camera.pan(10, 20);
if (camera.getState().x <= 400) throw new Error("camera smoke failed");

const assets = createAssetManager({
  adapter: {
    id: "wave2-memory-assets",
    supports() {
      return true;
    },
    async load() {
      return undefined;
    }
  }
});
assets.register({ id: "debug-square", type: "image", source: { uri: "debug-square.png" } });
await assets.load("debug-square");

const saveStore = createMemorySaveStore();
await saveStore.write("slot-1", new Uint8Array([1, 2, 3]), { id: "slot-1", label: "Smoke" });
const saveBytes = await saveStore.read("slot-1");
const saveSlots = await saveStore.list();
if (saveBytes[2] !== 3 || saveSlots[0]?.label !== "Smoke") {
  throw new Error("save smoke failed");
}

const devtools = createDevToolsRuntime();
devtools.pushTrace({ kind: "runtime", label: "wave2.smoke", source: "verify" });
if (devtools.snapshot().traces.length !== 1) throw new Error("devtools smoke failed");

const ui = createWave2UiRuntime();
ui.registerPanel({ id: "panel.smoke", kind: "panel", title: "Smoke" });
ui.open("panel.smoke");
if (ui.openPanels().length !== 1) throw new Error("ui smoke failed");

const app = defineGameApp({ id: "wave2-smoke", services: [] });
const profile = createStandardAppProfile({ id: "wave2-profile" });
const host = createHeadlessHost({ id: "wave2-headless" });
if (app.id !== "wave2-smoke" || profile.id !== "wave2-profile" || host.snapshot().phase !== "registered") {
  throw new Error("app-host smoke failed");
}

console.log("gamekits wave 2 smoke ok");
`;

const wave3SmokeSource = `
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createUiRuntime as createWave3UiRuntime } from "@gamekits/ui-core";
import {
  createGameKitUiAnimator,
  GameKitUiShell,
  UiPanelHost,
  UiTip
} from "@gamekits/react-ui";
import { createDevToolsRuntime as createWave3DevToolsRuntime } from "@gamekits/devtools";
import {
  createDevToolsUiBridge,
  DevToolsLauncher,
  DevToolsOverlay
} from "@gamekits/devtools-ui";

{
function assertCssExport(specifier) {
  const resolved = import.meta.resolve(specifier);
  if (!resolved.endsWith("/dist/styles.css")) {
    throw new Error(\`Unexpected CSS export for \${specifier}: \${resolved}\`);
  }
}

assertCssExport("@gamekits/react-ui/styles.css");
assertCssExport("@gamekits/devtools-ui/styles.css");

const ui = createWave3UiRuntime();
ui.registerPanel({ id: "actor", title: "Actor", kind: "panel" });
ui.open("actor", { actorId: "a" });

const shellHtml = renderToStaticMarkup(
  createElement(
    GameKitUiShell,
    { runtime: ui },
    createElement(UiPanelHost, {
      renderPanel: (panel) => createElement("span", null, String(panel.props))
    })
  )
);

if (!shellHtml.includes('data-ui-panel="actor"') || !shellHtml.includes("Actor")) {
  throw new Error("react-ui shell smoke failed");
}

const tipHtml = renderToStaticMarkup(
  createElement(UiTip, { content: "Runtime focus scope" }, createElement("button", null, "?"))
);
if (!tipHtml.includes('role="tooltip"')) throw new Error("react-ui tip smoke failed");

const animator = createGameKitUiAnimator({ reducedMotion: true });
if (typeof animator.enter !== "function" || typeof animator.exit !== "function") {
  throw new Error("react-ui animator smoke failed");
}

const devtools = createWave3DevToolsRuntime();
const devtoolsUi = createWave3UiRuntime();
const bridge = createDevToolsUiBridge({ devtools, ui: devtoolsUi });
bridge.openShell();
if (!bridge.snapshot().shell.open) throw new Error("devtools-ui bridge smoke failed");

const launcherHtml = renderToStaticMarkup(
  createElement(DevToolsLauncher, { runtime: devtools, uiRuntime: devtoolsUi, label: "Inspect" })
);
if (!launcherHtml.includes("gamekit-devtools-launcher")) {
  throw new Error("devtools-ui launcher smoke failed");
}

devtools.registerPanel({ id: "app.chain", label: "App Chain" });
const overlayHtml = renderToStaticMarkup(
  createElement(DevToolsOverlay, {
    runtime: devtools,
    uiRuntime: devtoolsUi,
    renderPanel: () => createElement("section", null, "Custom Chain Panel")
  })
);
if (!overlayHtml.includes("Custom Chain Panel")) {
  throw new Error("devtools-ui overlay smoke failed");
}

console.log("gamekits wave 3 smoke ok");
}
`;

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function resolvePackageSlugs(): string[] {
  const explicitPackages = process.env.GAMEKITS_RELEASE_PACKAGES;
  if (explicitPackages) {
    return unique(
      explicitPackages
        .split(",")
        .map((slug) => slug.trim())
        .filter(Boolean)
    );
  }

  if (releaseWave === "2") {
    return unique([...wave2SupportPackageSlugs, ...wave2PackageSlugs]);
  }

  if (releaseWave === "3") {
    return unique([...wave3SupportPackageSlugs, ...wave3PackageSlugs]);
  }

  if (releaseWave === "all") {
    return allPackageSlugs;
  }

  if (releaseWave !== "1") {
    throw new Error(`Unknown GAMEKITS_RELEASE_WAVE: ${releaseWave}`);
  }

  return wave1PackageSlugs;
}

function resolveSmokeSource(): string {
  if (releaseWave === "2") {
    return `${wave2BaseSmokeSource}\n${wave2SmokeSource}`;
  }

  if (releaseWave === "3") {
    return wave3SmokeSource;
  }

  if (releaseWave === "all") {
    return `${wave2BaseSmokeSource}\n${wave2SmokeSource}\n${wave3SmokeSource}`;
  }

  return smokeSource;
}

function shouldRunTestUtilsSmoke(packageSlugs: string[]): boolean {
  if (!packageSlugs.includes("test-utils")) {
    return false;
  }

  return (
    process.env.GAMEKITS_RUN_TEST_UTILS_SMOKE === "1" ||
    releaseWave === "1" ||
    releaseWave === "all"
  );
}

function run(command: string, args: string[], cwd = root): string {
  return execFileSync(command, args, {
    cwd,
    env: commandEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function runInherit(command: string, args: string[], cwd = root): void {
  execFileSync(command, args, {
    cwd,
    env: commandEnv,
    stdio: "inherit"
  });
}

function workspaceName(slug: string): string {
  return `@gamekit/${slug}`;
}

function publicName(name: string): string {
  return name.replace(/^@gamekit\//, "@gamekits/");
}

function mapDependencies(dependencies: Record<string, string> | undefined) {
  if (!dependencies) {
    return undefined;
  }

  const mapped = Object.fromEntries(
    Object.entries(dependencies).map(([name, range]) => {
      if (name.startsWith("@gamekit/")) {
        return [publicName(name), releaseVersion];
      }

      return [name, range];
    })
  );

  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function rewritePackageScope(path: string): void {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      rewritePackageScope(join(path, entry));
    }
    return;
  }

  if (!/\.(js|mjs|cjs|d\.ts|map)$/.test(path)) {
    return;
  }

  const current = readFileSync(path, "utf8");
  const next = current.replaceAll("@gamekit/", "@gamekits/");
  if (next !== current) {
    writeFileSync(path, next);
  }
}

function removeBuildInfo(path: string): void {
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
}

function listFiles(path: string): string[] {
  const stat = statSync(path);
  if (!stat.isDirectory()) {
    return [path];
  }

  return readdirSync(path).flatMap((entry) => listFiles(join(path, entry)));
}

function assertNoInternalScope(path: string): void {
  const offenders = listFiles(path).filter((file) => {
    if (!/\.(js|mjs|cjs|d\.ts|map|json)$/.test(file)) {
      return false;
    }

    return readFileSync(file, "utf8").includes("@gamekit/");
  });

  if (offenders.length > 0) {
    throw new Error(
      `Publish artifacts still reference @gamekit/*:\n${offenders
        .map((file) => relative(root, file))
        .join("\n")}`
    );
  }
}

function assertTarballContents(tarball: string): void {
  const contents = run("tar", ["-tf", tarball]).trim().split("\n");
  const forbiddenEntries = contents.filter(
    (entry) =>
      [
        "package/src/",
        "package/test/",
        "package/apps/",
        "package/.turbo/",
        "package/node_modules/"
      ].some((prefix) => entry.startsWith(prefix)) || entry.endsWith(".tsbuildinfo")
  );

  if (forbiddenEntries.length > 0) {
    throw new Error(`Unexpected files in ${tarball}:\n${forbiddenEntries.join("\n")}`);
  }
}

function assertPublishManifest(manifest: PackageManifest, slug: string): void {
  if (manifest.repository?.url !== releaseRepositoryUrl) {
    throw new Error(
      `${manifest.name} publish manifest repository.url must be ${releaseRepositoryUrl} for npm provenance.`
    );
  }

  if (manifest.repository.directory !== `packages/${slug}`) {
    throw new Error(
      `${manifest.name} publish manifest repository.directory must be packages/${slug}.`
    );
  }
}

function preparePackage(slug: string, packagesDir: string): string {
  const sourceDir = join(root, "packages", slug);
  const manifestPath = join(sourceDir, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
  const targetDir = join(packagesDir, slug);
  const sourceDist = join(sourceDir, "dist");
  const targetDist = join(targetDir, "dist");

  if (!existsSync(sourceDist)) {
    throw new Error(`Missing dist for ${manifest.name}. Run build before release verification.`);
  }

  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  cpSync(sourceDist, targetDist, { recursive: true });
  removeBuildInfo(targetDist);
  rewritePackageScope(targetDist);

  const publishManifest: PackageManifest & {
    files: string[];
    publishConfig: { access: "public" };
  } = {
    name: publicName(manifest.name),
    version: releaseVersion,
    type: manifest.type,
    main: manifest.main,
    types: manifest.types,
    exports: manifest.exports,
    repository: {
      type: "git",
      url: releaseRepositoryUrl,
      directory: `packages/${slug}`
    },
    files: ["dist"],
    sideEffects: manifest.sideEffects ?? false,
    publishConfig: { access: "public" },
    dependencies: mapDependencies(manifest.dependencies),
    peerDependencies: mapDependencies(manifest.peerDependencies),
    peerDependenciesMeta: manifest.peerDependenciesMeta,
    optionalDependencies: mapDependencies(manifest.optionalDependencies),
    optionalPeerDependencies: mapDependencies(manifest.optionalPeerDependencies)
  };

  for (const key of [
    "dependencies",
    "peerDependencies",
    "peerDependenciesMeta",
    "optionalDependencies",
    "optionalPeerDependencies"
  ] as const) {
    if (publishManifest[key] === undefined) {
      delete publishManifest[key];
    }
  }

  assertPublishManifest(publishManifest, slug);
  writeJson(join(targetDir, "package.json"), publishManifest);
  assertNoInternalScope(targetDir);

  return targetDir;
}

try {
  const packageSlugs = resolvePackageSlugs();
  const packagesDir = join(releaseDir, "packages");
  const packDir = join(releaseDir, "tarballs");
  const consumerDir = join(releaseDir, "consumer");
  rmSync(packagesDir, { recursive: true, force: true });
  rmSync(packDir, { recursive: true, force: true });
  rmSync(consumerDir, { recursive: true, force: true });
  mkdirSync(packDir, { recursive: true });
  mkdirSync(consumerDir, { recursive: true });

  for (const slug of packageSlugs) {
    runInherit("corepack", ["pnpm", "--filter", workspaceName(slug), "build"]);
  }

  const preparedDirs = packageSlugs.map((slug) => preparePackage(slug, packagesDir));
  const tarballs = preparedDirs.map((preparedDir) => {
    const output = run("npm", ["pack", "--pack-destination", packDir], preparedDir).trim();
    const tarball = join(packDir, output.split("\n").at(-1)!);
    assertTarballContents(tarball);
    return tarball;
  });

  const localTarballDependencies = Object.fromEntries(
    packageSlugs.map((slug, index) => [publicName(workspaceName(slug)), `file:${tarballs[index]!}`])
  );
  const runTestUtilsSmoke = shouldRunTestUtilsSmoke(packageSlugs);

  writeJson(join(consumerDir, "package.json"), {
    name: `gamekits-wave-${releaseWave}-release-smoke`,
    private: true,
    type: "module",
    dependencies: {
      ...localTarballDependencies,
      ...(releaseWave === "3" || releaseWave === "all"
        ? { react: "^18.3.1", "react-dom": "^18.3.1" }
        : {}),
      ...(runTestUtilsSmoke ? { vitest: "^3.1.3" } : {})
    }
  });
  writeFileSync(
    join(consumerDir, ".pnpmfile.cjs"),
    `const localPackages = ${JSON.stringify(localTarballDependencies, null, 2)};

function rewriteDependencies(dependencies) {
  if (!dependencies) return;
  for (const [name, specifier] of Object.entries(localPackages)) {
    if (dependencies[name]) {
      dependencies[name] = specifier;
    }
  }
}

module.exports = {
  hooks: {
    readPackage(pkg) {
      rewriteDependencies(pkg.dependencies);
      rewriteDependencies(pkg.peerDependencies);
      rewriteDependencies(pkg.optionalDependencies);
      return pkg;
    }
  }
};
`
  );
  writeFileSync(join(consumerDir, "smoke.mjs"), resolveSmokeSource());
  writeFileSync(join(consumerDir, "test-utils-smoke.test.mjs"), testUtilsSmokeSource);

  runInherit(
    "corepack",
    [
      "pnpm",
      "install",
      "--ignore-scripts",
      ...(installOffline ? ["--offline"] : []),
      "--registry",
      "https://registry.npmjs.org/"
    ],
    consumerDir
  );
  runInherit("node", ["smoke.mjs"], consumerDir);
  if (runTestUtilsSmoke) {
    runInherit(
      "corepack",
      ["pnpm", "exec", "vitest", "run", "test-utils-smoke.test.mjs"],
      consumerDir
    );
  }

  console.log(`Verified @gamekits wave ${releaseWave} release artifacts in ${releaseDir}`);
} finally {
  if (shouldCleanReleaseDir) {
    rmSync(releaseDir, { recursive: true, force: true });
  }
}
