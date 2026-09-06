export function inferDistTag(version) {
  const channel = prereleaseChannel(version);
  if (channel === "alpha" || channel === "beta" || channel === "rc") {
    return channel;
  }

  return "latest";
}

export function parseAdditionalDistTags(value) {
  return (value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function resolveRequiredDistTags({ additionalDistTags = [], distTag }) {
  const tags = new Set([distTag, ...additionalDistTags]);
  return [...tags].sort();
}

export function validateDistTagPolicy({ additionalDistTags = [], distTag, version }) {
  if (!version.includes("-")) {
    return;
  }

  const requestedTags = new Set([distTag, ...additionalDistTags]);
  if (requestedTags.has("latest")) {
    throw new Error(
      `Refusing to tag prerelease version ${version} as latest. Publish a stable version with dist-tag "latest" instead.`
    );
  }
}

export function prereleaseChannel(version) {
  return version.split("-")[1]?.split(".")[0];
}
