import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const changesetDir = join(root, ".changeset");
const changesetIds = readdirSync(changesetDir)
  .filter((file) => file.endsWith(".md") && file !== "README.md")
  .map((file) => basename(file, ".md"))
  .sort();
const consumedChangesets = readConsumedChangesets();
const pendingChangesets = changesetIds.filter((id) => !consumedChangesets.has(id));
const hasChangesets = pendingChangesets.length > 0;

writeOutput("has-changesets", String(hasChangesets));
writeOutput("pending-changesets", pendingChangesets.join(","));

if (hasChangesets) {
  console.log(`Pending changesets: ${pendingChangesets.join(", ")}`);
} else if (changesetIds.length > 0) {
  console.log(`No pending changesets. Consumed prerelease changesets: ${changesetIds.join(", ")}`);
} else {
  console.log("No changesets found.");
}

function readConsumedChangesets() {
  const preStatePath = join(changesetDir, "pre.json");
  if (!existsSync(preStatePath)) {
    return new Set();
  }

  const preState = JSON.parse(readFileSync(preStatePath, "utf8"));
  if (!Array.isArray(preState.changesets)) {
    return new Set();
  }

  return new Set(preState.changesets.filter((id) => typeof id === "string"));
}

function writeOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    console.log(`${name}=${value}`);
    return;
  }

  appendFileSync(outputPath, `${name}=${value}\n`);
}
