import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sentinelManifest = JSON.parse(readFileSync(join(root, "packages/core/package.json"), "utf8"));
const version = process.env.GAMEKITS_RELEASE_VERSION ?? sentinelManifest.version;
const registry = process.env.GAMEKITS_NPM_REGISTRY ?? "https://registry.npmjs.org";
const packageNames = resolvePackageNames();

const missingPackages = [];
for (const packageName of packageNames) {
  if (!(await isPublished(packageName, version))) {
    missingPackages.push(packageName);
  }
}

const shouldPublish = missingPackages.length > 0;

writeOutput("should-publish", String(shouldPublish));
writeOutput("release-version", version);
writeOutput("missing-packages", missingPackages.join(","));

if (shouldPublish) {
  console.log(
    `${missingPackages.map((name) => `${name}@${version}`).join(", ")} not published yet; release should run.`
  );
} else {
  console.log(
    `All ${packageNames.length} @gamekits package(s) are already published at ${version}.`
  );
}

async function isPublished(name, packageVersion) {
  const response = await fetch(registryVersionUrl(name, packageVersion), {
    headers: {
      Accept: "application/json"
    }
  });

  if (response.status === 200) {
    return true;
  }

  if (response.status === 404) {
    return false;
  }

  const body = await response.text();
  throw new Error(
    `Unable to check ${name}@${packageVersion} in npm registry: HTTP ${response.status} ${body}`
  );
}

function registryVersionUrl(name, packageVersion) {
  const base = registry.endsWith("/") ? registry : `${registry}/`;
  const encodedName = encodeURIComponent(name);
  return `${base}${encodedName}/${encodeURIComponent(packageVersion)}`;
}

function resolvePackageNames() {
  const sentinelPackage = process.env.GAMEKITS_RELEASE_SENTINEL_PACKAGE;
  if (sentinelPackage) {
    return [sentinelPackage];
  }

  const explicitPackages = process.env.GAMEKITS_PUBLISH_PACKAGES;
  if (explicitPackages) {
    return explicitPackages
      .split(",")
      .map((slug) => slug.trim())
      .filter(Boolean)
      .map((slug) => `@gamekits/${slug}`);
  }

  const packagesDir = join(root, "packages");
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesDir, entry.name, "package.json"))
    .filter((manifestPath) => existsSync(manifestPath))
    .map((manifestPath) => JSON.parse(readFileSync(manifestPath, "utf8")).name)
    .filter((name) => typeof name === "string" && name.startsWith("@gamekits/"))
    .sort();
}

function writeOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    console.log(`${name}=${value}`);
    return;
  }

  appendFileSync(outputPath, `${name}=${value}\n`);
}
