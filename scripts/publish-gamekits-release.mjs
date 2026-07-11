import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseAdditionalDistTags,
  resolveRequiredDistTags,
  validateDistTagPolicy
} from "./release-dist-tags.mjs";

const version = process.env.GAMEKITS_RELEASE_VERSION ?? "0.1.0-alpha.0";
const releaseDir = process.env.GAMEKITS_RELEASE_DIR ?? "/private/tmp/gamekits-wave2-release";
const registry = process.env.GAMEKITS_NPM_REGISTRY ?? "https://registry.npmjs.org";
const distTag = process.env.GAMEKITS_NPM_TAG ?? "alpha";
const additionalDistTags = parseAdditionalDistTags(process.env.GAMEKITS_NPM_ADDITIONAL_TAGS);
validateDistTagPolicy({ additionalDistTags, distTag, version });
const packages = resolvePackages();
const trustedPublisher = hasTrustedPublisherEnvironment();
const token = resolveToken();
const publishedNames = [];

if (packages.length === 0) {
  throw new Error("No packages to publish.");
}

if (!trustedPublisher && !token) {
  throw new Error(
    "Missing npm authorization. Configure npm Trusted Publisher/OIDC for this workflow, or set NPM_TOKEN/pass a token on stdin."
  );
}

const workDir = mkdtempSync(join(tmpdir(), "gamekits-publish-"));

async function publish(plan) {
  const { isNewPackage, name, slug } = plan;
  let authMode;

  if (isNewPackage) {
    console.log(`${name} is new in npm registry; bootstrapping first publish with NPM_TOKEN.`);
    await publishWithToken(slug);
    authMode = "token";
  } else if (trustedPublisher) {
    try {
      await publishWithTrustedPublisher(slug);
      authMode = "trusted";
    } catch (error) {
      if (!token || !isNpmAuthFailure(error)) {
        throw error;
      }

      console.warn(
        `Trusted Publisher publish for @gamekits/${slug}@${version} was not authorized; falling back to NPM_TOKEN.`
      );
    }
  }

  if (!authMode) {
    await publishWithToken(slug);
    authMode = "token";
  }

  await syncPrimaryDistTag(name, authMode);
  publishedNames.push(name);
}

async function publishWithTrustedPublisher(slug) {
  const name = `@gamekits/${slug}`;
  const tarballPath = join(releaseDir, "tarballs", `gamekits-${slug}-${version}.tgz`);

  try {
    execFileSync(
      "npm",
      [
        "publish",
        tarballPath,
        "--tag",
        distTag,
        "--access",
        "public",
        "--registry",
        registry,
        "--loglevel",
        "warn"
      ],
      {
        encoding: "utf8",
        stdio: "pipe"
      }
    );
    console.log(`published ${name}@${version} via Trusted Publisher`);
  } catch (error) {
    if (isNpmAlreadyPublished(error)) {
      console.log(`${name}@${version} already exists`);
    } else {
      throw error;
    }
  }
}

async function publishWithToken(slug) {
  if (!token) {
    throw new Error(
      `Cannot publish @gamekits/${slug}@${version}: Trusted Publisher is unavailable and NPM_TOKEN is not set.`
    );
  }

  const name = `@gamekits/${slug}`;
  const tarballPath = join(releaseDir, "tarballs", `gamekits-${slug}-${version}.tgz`);
  const userConfigPath = writeNpmTokenConfig(slug, "publish");

  try {
    execFileSync(
      "npm",
      [
        "publish",
        tarballPath,
        "--tag",
        distTag,
        "--access",
        "public",
        "--registry",
        registry,
        "--userconfig",
        userConfigPath,
        "--loglevel",
        "warn"
      ],
      {
        encoding: "utf8",
        stdio: "pipe"
      }
    );
  } catch (error) {
    if (isNpmAlreadyPublished(error)) {
      console.log(`${name}@${version} already exists`);
      return;
    }

    throw new Error(`${name}@${version} publish failed via NPM_TOKEN: ${commandOutput(error)}`);
  }

  console.log(`published ${name}@${version} via NPM_TOKEN`);
}

try {
  const packagePlans = await resolvePackagePlans(packages);
  const newPackagePlans = packagePlans.filter((plan) => plan.isNewPackage);
  const orderedPackagePlans = orderPackagePlans(packagePlans);

  console.log(`Publishing ${packages.length} package(s) to npm dist-tag "${distTag}".`);
  if (trustedPublisher) {
    console.log(
      "Trusted Publisher/OIDC environment detected; using it for existing packages when possible."
    );
  } else {
    console.log("Trusted Publisher/OIDC environment not detected; using NPM_TOKEN publish.");
  }
  if (newPackagePlans.length > 0) {
    const names = newPackagePlans.map((plan) => plan.name).join(", ");
    if (!token) {
      throw new Error(
        `New npm package(s) require NPM_TOKEN bootstrap before Trusted Publisher can be configured: ${names}.`
      );
    }

    verifyTokenAuthentication(`bootstrap new npm package(s): ${names}`);
    console.log(
      `Bootstrapping new npm package(s) with NPM_TOKEN before existing packages: ${names}.`
    );
  } else if (!trustedPublisher && token) {
    verifyTokenAuthentication("publish packages without Trusted Publisher/OIDC");
  }

  for (const plan of orderedPackagePlans) {
    await publish(plan);
  }
  await syncDeferredDistTags();
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

async function syncDeferredDistTags() {
  const uniqueNames = [...new Set(publishedNames)].sort();
  const preferredAuthMode = trustedPublisher ? "trusted" : "token";

  for (const name of uniqueNames) {
    const metadata = await fetchPackageMetadata(name);
    const tags = resolveRequiredDistTags({
      additionalDistTags,
      distTag,
      version
    }).filter((tag) => tag !== distTag && metadata?.["dist-tags"]?.[tag] !== version);

    if (tags.length === 0) {
      continue;
    }

    console.log(`Synchronizing deferred dist-tag(s) ${tags.join(", ")} for ${name}@${version}.`);
    await syncDistTags(name, tags, preferredAuthMode);
  }
}

async function syncPrimaryDistTag(name, authMode) {
  const metadata = await fetchPackageMetadata(name);
  if (metadata?.["dist-tags"]?.[distTag] === version) {
    return;
  }

  await syncDistTags(name, [distTag], authMode);
}

async function syncDistTags(name, tags, authMode) {
  for (const tag of tags) {
    if (authMode === "trusted") {
      try {
        setDistTagWithTrustedPublisher(name, tag);
        continue;
      } catch (error) {
        if (!token || !isNpmAuthFailure(error)) {
          throw error;
        }

        console.warn(
          `Trusted Publisher dist-tag sync for ${name}@${version} was not authorized; falling back to NPM_TOKEN.`
        );
      }
    }

    setDistTagWithToken(name, tag);
  }
}

async function fetchPackageMetadata(name) {
  const response = await fetch(registryPackageUrl(name), {
    headers: {
      Accept: "application/json"
    }
  });

  if (response.status === 200) {
    return response.json();
  }

  if (response.status === 404) {
    return undefined;
  }

  const body = await response.text();
  throw new Error(`Unable to read ${name} metadata: HTTP ${response.status}: ${body}`);
}

function setDistTagWithTrustedPublisher(name, tag) {
  execFileSync(
    "npm",
    ["dist-tag", "add", `${name}@${version}`, tag, "--registry", registry, "--loglevel", "warn"],
    {
      encoding: "utf8",
      stdio: "pipe"
    }
  );
  console.log(`tagged ${name}@${version} as ${tag} via Trusted Publisher`);
}

function setDistTagWithToken(name, tag) {
  if (!token) {
    throw new Error(
      `Cannot set ${name}@${version} dist-tag "${tag}": Trusted Publisher is unavailable and NPM_TOKEN is not set.`
    );
  }

  const userConfigPath = writeNpmTokenConfig(nameToSlug(name), `${tag}.dist-tag`);

  try {
    execFileSync(
      "npm",
      [
        "dist-tag",
        "add",
        `${name}@${version}`,
        tag,
        "--registry",
        registry,
        "--userconfig",
        userConfigPath,
        "--loglevel",
        "warn"
      ],
      {
        encoding: "utf8",
        stdio: "pipe"
      }
    );
  } catch (error) {
    throw new Error(
      `${name}@${version} dist-tag "${tag}" failed via NPM_TOKEN: ${commandOutput(error)}`
    );
  }

  console.log(`tagged ${name}@${version} as ${tag} via NPM_TOKEN`);
}

function registryPackageUrl(name) {
  const base = registry.endsWith("/") ? registry : `${registry}/`;
  return `${base}${encodeURIComponent(name)}`;
}

function nameToSlug(name) {
  return name.replace(/^@/, "").replace(/\W+/g, "-");
}

async function resolvePackagePlans(slugs) {
  const plans = [];
  for (const slug of slugs) {
    const name = `@gamekits/${slug}`;
    const metadata = await fetchPackageMetadata(name);
    plans.push({
      isNewPackage: metadata === undefined,
      name,
      slug
    });
  }

  return plans;
}

function orderPackagePlans(plans) {
  return [...plans].sort((a, b) => {
    if (a.isNewPackage !== b.isNewPackage) {
      return a.isNewPackage ? -1 : 1;
    }

    return a.slug.localeCompare(b.slug);
  });
}

function verifyTokenAuthentication(reason) {
  if (!token) {
    throw new Error(`Cannot ${reason}: NPM_TOKEN is not set.`);
  }

  const userConfigPath = writeNpmTokenConfig("preflight", "whoami");
  try {
    execFileSync(
      "npm",
      ["whoami", "--registry", registry, "--userconfig", userConfigPath, "--loglevel", "warn"],
      {
        encoding: "utf8",
        stdio: "pipe"
      }
    );
  } catch (error) {
    throw new Error(`Cannot ${reason}: NPM_TOKEN authentication failed: ${commandOutput(error)}`);
  }
}

function writeNpmTokenConfig(slug, purpose) {
  const configPath = join(workDir, `${slug}.${purpose}.npmrc`);
  const registryUrl = normalizedRegistryUrl();
  writeFileSync(
    configPath,
    [
      `registry=${registryUrl}`,
      `@gamekits:registry=${registryUrl}`,
      `${npmAuthConfigKey(registryUrl)}:_authToken=${token}`,
      "always-auth=true",
      ""
    ].join("\n")
  );
  return configPath;
}

function normalizedRegistryUrl() {
  const url = new URL(registry);
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  return url.toString();
}

function npmAuthConfigKey(registryUrl) {
  const url = new URL(registryUrl);
  return `//${url.host}${url.pathname}`;
}

function hasTrustedPublisherEnvironment() {
  return Boolean(
    process.env.ACTIONS_ID_TOKEN_REQUEST_URL && process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  );
}

function resolveToken() {
  const envToken = process.env.NPM_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }

  if (process.stdin.isTTY) {
    return undefined;
  }

  try {
    return readFileSync(0, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

function isNpmAlreadyPublished(error) {
  const output = commandOutput(error).toLowerCase();
  return (
    output.includes("cannot modify pre-existing version") ||
    output.includes("cannot publish over") ||
    output.includes("previously published versions") ||
    output.includes("epublishconflict")
  );
}

function isNpmAuthFailure(error) {
  const output = commandOutput(error).toLowerCase();
  const status = String(error.status ?? "");
  return (
    ["401", "403", "404"].includes(status) ||
    output.includes("e401") ||
    output.includes("e403") ||
    output.includes("e404") ||
    output.includes("eneedauth") ||
    output.includes("not authorized") ||
    output.includes("not found") ||
    output.includes("you must be logged in") ||
    output.includes("trusted publishing") ||
    output.includes("oidc")
  );
}

function commandOutput(error) {
  return [error?.stdout, error?.stderr, error?.message]
    .filter(Boolean)
    .map((value) => (Buffer.isBuffer(value) ? value.toString("utf8") : String(value)))
    .join("\n");
}

function resolvePackages() {
  const explicitPackages = process.env.GAMEKITS_PUBLISH_PACKAGES;
  if (explicitPackages) {
    return explicitPackages
      .split(",")
      .map((slug) => slug.trim())
      .filter(Boolean);
  }

  const packagesDir = join(releaseDir, "packages");
  if (!existsSync(packagesDir)) {
    return [];
  }

  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
