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

export function resolveRequiredDistTags({
  additionalDistTags = [],
  currentDistTags = {},
  distTag,
  syncPrereleaseLatest = false,
  version
}) {
  const tags = new Set([distTag, ...additionalDistTags]);

  if (shouldMirrorPrereleaseToLatest({ currentDistTags, distTag, syncPrereleaseLatest, version })) {
    tags.add("latest");
  }

  return [...tags].sort();
}

export function shouldSyncPrereleaseLatest(value) {
  if (value === undefined) {
    return false;
  }

  return ["1", "true", "yes"].includes(value.trim().toLowerCase());
}

export function prereleaseChannel(version) {
  return version.split("-")[1]?.split(".")[0];
}

function shouldMirrorPrereleaseToLatest({
  currentDistTags,
  distTag,
  syncPrereleaseLatest,
  version
}) {
  if (!syncPrereleaseLatest || distTag === "latest" || !version.includes("-")) {
    return false;
  }

  const channel = prereleaseChannel(version);
  const currentLatest = currentDistTags.latest;
  return currentLatest === undefined || prereleaseChannel(currentLatest) === channel;
}
