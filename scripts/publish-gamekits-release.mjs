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

const token = process.env.NPM_TOKEN ?? readFileSync(0, "utf8").trim();
if (!token) {
  throw new Error("Missing npm token. Set NPM_TOKEN or pass the token on stdin.");
}

const version = process.env.GAMEKITS_RELEASE_VERSION ?? "0.1.0-alpha.0";
const releaseDir = process.env.GAMEKITS_RELEASE_DIR ?? "/private/tmp/gamekits-wave2-release";
const registry = process.env.GAMEKITS_NPM_REGISTRY ?? "https://registry.npmjs.org";
const distTag = process.env.GAMEKITS_NPM_TAG ?? "alpha";
const packages = resolvePackages();

if (packages.length === 0) {
  throw new Error("No packages to publish.");
}

const workDir = mkdtempSync(join(tmpdir(), "gamekits-publish-"));

function publish(slug) {
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
    if (status === "409" && body.includes("cannot modify pre-existing version")) {
      console.log(`${name}@${version} already exists`);
      return;
    }
    throw new Error(`${name}@${version} publish failed with HTTP ${status}: ${body}`);
  }

  console.log(`published ${name}@${version}`);
}

try {
  console.log(`Publishing ${packages.length} package(s) to npm dist-tag "${distTag}".`);
  for (const slug of packages) {
    publish(slug);
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
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
