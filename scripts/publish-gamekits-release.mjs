import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseAdditionalDistTags,
  resolveRequiredDistTags,
  shouldSyncPrereleaseLatest
} from "./release-dist-tags.mjs";

const version = process.env.GAMEKITS_RELEASE_VERSION ?? "0.1.0-alpha.0";
const releaseDir = process.env.GAMEKITS_RELEASE_DIR ?? "/private/tmp/gamekits-wave2-release";
const registry = process.env.GAMEKITS_NPM_REGISTRY ?? "https://registry.npmjs.org";
const distTag = process.env.GAMEKITS_NPM_TAG ?? "alpha";
const additionalDistTags = parseAdditionalDistTags(process.env.GAMEKITS_NPM_ADDITIONAL_TAGS);
const syncPrereleaseLatest = shouldSyncPrereleaseLatest(
  process.env.GAMEKITS_NPM_SYNC_PRERELEASE_LATEST
);
const packages = resolvePackages();
const trustedPublisher = hasTrustedPublisherEnvironment();
const token = resolveToken();

if (packages.length === 0) {
  throw new Error("No packages to publish.");
}

if (!trustedPublisher && !token) {
  throw new Error(
    "Missing npm authorization. Configure npm Trusted Publisher/OIDC for this workflow, or set NPM_TOKEN/pass a token on stdin."
  );
}

const workDir = mkdtempSync(join(tmpdir(), "gamekits-publish-"));

async function publish(slug) {
  if (trustedPublisher) {
    try {
      await publishWithTrustedPublisher(slug);
      return;
    } catch (error) {
      if (!token || !isNpmAuthFailure(error)) {
        throw error;
      }

      console.warn(
        `Trusted Publisher publish for @gamekits/${slug}@${version} was not authorized; falling back to NPM_TOKEN.`
      );
    }
  }

  await publishWithToken(slug);
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

  await syncDistTags(name, "trusted");
}

async function publishWithToken(slug) {
  if (!token) {
    throw new Error(
      `Cannot publish @gamekits/${slug}@${version}: Trusted Publisher is unavailable and NPM_TOKEN is not set.`
    );
  }

  const name = `@gamekits/${slug}`;
  const encodedName = encodeURIComponent(name).replace("%40", "@");
  const tarballName = `gamekits-${slug}-${version}.tgz`;
  const tarballPath = join(releaseDir, "tarballs", tarballName);
  const manifestPath = join(releaseDir, "packages", slug, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const tarball = readFileSync(tarballPath);
  const shasum = createHash("sha1").update(tarball).digest("hex");
  const integrity = `sha512-${createHash("sha512").update(tarball).digest("base64")}`;
  const tarballUrl = `${registry}/${encodedName}/-/${tarballName}`;
  const payloadPath = join(workDir, `${slug}.json`);
  const responsePath = join(workDir, `${slug}.response.json`);
  const authConfigPath = join(workDir, `${slug}.curlrc`);
  const payload = {
    _id: name,
    name,
    access: "public",
    "dist-tags": {
      [distTag]: version
    },
    versions: {
      [version]: {
        ...manifest,
        dist: {
          shasum,
          integrity,
          tarball: tarballUrl
        }
      }
    },
    _attachments: {
      [tarballName]: {
        content_type: "application/octet-stream",
        data: tarball.toString("base64"),
        length: statSync(tarballPath).size
      }
    }
  };

  writeFileSync(payloadPath, `${JSON.stringify(payload)}\n`);
  writeFileSync(authConfigPath, `header = "Authorization: Bearer ${token}"\n`);
  const status = execFileSync(
    "curl",
    [
      "--config",
      authConfigPath,
      "--silent",
      "--show-error",
      "--connect-timeout",
      "20",
      "--retry",
      "5",
      "--retry-all-errors",
      "--retry-delay",
      "5",
      "--output",
      responsePath,
      "--write-out",
      "%{http_code}",
      "--request",
      "PUT",
      "--header",
      "Content-Type: application/json",
      "--data-binary",
      `@${payloadPath}`,
      `${registry}/${encodedName}`
    ],
    { encoding: "utf8" }
  );
  const body = readFileSync(responsePath, "utf8");
  if (!["200", "201"].includes(status)) {
    if (isAlreadyPublishedResponse(status, body)) {
      console.log(`${name}@${version} already exists`);
      await syncDistTags(name, "token");
      return;
    }
    throw new Error(`${name}@${version} publish failed with HTTP ${status}: ${body}`);
  }

  console.log(`published ${name}@${version}`);
  await syncDistTags(name, "token");
}

function isAlreadyPublishedResponse(status, body) {
  return (
    (status === "409" && body.includes("cannot modify pre-existing version")) ||
    (status === "403" && body.includes("previously published versions"))
  );
}

try {
  console.log(`Publishing ${packages.length} package(s) to npm dist-tag "${distTag}".`);
  if (trustedPublisher) {
    console.log("Trusted Publisher/OIDC environment detected; trying npm CLI publish first.");
  } else {
    console.log("Trusted Publisher/OIDC environment not detected; using NPM_TOKEN publish.");
  }
  for (const slug of packages) {
    await publish(slug);
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

async function syncDistTags(name, authMode) {
  const metadata = await fetchPackageMetadata(name);
  const tags = resolveRequiredDistTags({
    additionalDistTags,
    currentDistTags: metadata?.["dist-tags"],
    distTag,
    syncPrereleaseLatest,
    version
  });

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

  const payloadPath = join(workDir, `${nameToSlug(name)}-${tag}.dist-tag.json`);
  const responsePath = join(workDir, `${nameToSlug(name)}-${tag}.dist-tag.response.json`);
  const authConfigPath = join(workDir, `${nameToSlug(name)}-${tag}.dist-tag.curlrc`);

  writeFileSync(payloadPath, `${JSON.stringify(version)}\n`);
  writeFileSync(authConfigPath, `header = "Authorization: Bearer ${token}"\n`);

  const status = execFileSync(
    "curl",
    [
      "--config",
      authConfigPath,
      "--silent",
      "--show-error",
      "--connect-timeout",
      "20",
      "--retry",
      "5",
      "--retry-all-errors",
      "--retry-delay",
      "5",
      "--output",
      responsePath,
      "--write-out",
      "%{http_code}",
      "--request",
      "PUT",
      "--header",
      "Content-Type: application/json",
      "--data-binary",
      `@${payloadPath}`,
      registryDistTagUrl(name, tag)
    ],
    { encoding: "utf8" }
  );
  const body = readFileSync(responsePath, "utf8");
  if (!["200", "201", "204"].includes(status)) {
    throw new Error(`${name}@${version} dist-tag "${tag}" failed with HTTP ${status}: ${body}`);
  }

  console.log(`tagged ${name}@${version} as ${tag}`);
}

function registryPackageUrl(name) {
  const base = registry.endsWith("/") ? registry : `${registry}/`;
  return `${base}${encodeURIComponent(name)}`;
}

function registryDistTagUrl(name, tag) {
  const base = registry.endsWith("/") ? registry : `${registry}/`;
  return `${base}-/package/${encodeURIComponent(name)}/dist-tags/${encodeURIComponent(tag)}`;
}

function nameToSlug(name) {
  return name.replace(/^@/, "").replace(/\W+/g, "-");
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
