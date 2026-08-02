import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { outpostRuntimeFeedbackAssets } from "../apps/multiplayer-outpost-siege-demo/src/content/runtime-feedback-assets";
import { outpostRuntimeImageAssets } from "../apps/multiplayer-outpost-siege-demo/src/content/runtime-image-assets";

const APP_ROOT = join(process.cwd(), "apps/multiplayer-outpost-siege-demo");

for (const asset of outpostRuntimeImageAssets) {
  const sourcePath = join(APP_ROOT, asset.authoringSource);
  const outputPath = join(APP_ROOT, "public", asset.runtimeUrl.slice(1));
  mkdirSync(dirname(outputPath), { recursive: true });
  const padding = asset.padding ?? 0;
  const contentWidth = asset.width - padding * 2;
  const contentHeight = asset.height - padding * 2;
  const geometry = `${contentWidth}x${contentHeight}${asset.fit === "cover" ? "^" : ""}`;

  const result = spawnSync(
    "magick",
    [
      sourcePath,
      ...(asset.fit === "contain" ? ["-trim", "+repage"] : []),
      "-resize",
      geometry,
      "-gravity",
      "center",
      "-background",
      "none",
      "-extent",
      `${asset.width}x${asset.height}`,
      "-strip",
      "-define",
      "webp:method=6",
      "-quality",
      asset.fit === "cover" ? "80" : "90",
      outputPath
    ],
    { encoding: "utf8" }
  );

  if (result.error) {
    throw new Error(`Unable to build ${asset.id}. Install ImageMagick so magick is available.`, {
      cause: result.error
    });
  }
  if (result.status !== 0) {
    throw new Error(`Unable to build ${asset.id}: ${result.stderr.trim()}`);
  }
}

for (const asset of outpostRuntimeFeedbackAssets) {
  const sourcePath = join(APP_ROOT, asset.authoringSource);
  const outputPath = join(APP_ROOT, "public", asset.runtimeUrl.slice(1));
  mkdirSync(dirname(outputPath), { recursive: true });
  const raster = spawnSync(
    "rsvg-convert",
    ["-w", String(asset.width), "-h", String(asset.height), sourcePath],
    { maxBuffer: 4 * 1024 * 1024 }
  );
  if (raster.error) {
    throw new Error(
      `Unable to rasterize ${asset.id}. Install librsvg so rsvg-convert is available.`,
      { cause: raster.error }
    );
  }
  if (raster.status !== 0) {
    throw new Error(`Unable to rasterize ${asset.id}: ${raster.stderr.toString().trim()}`);
  }
  const result = spawnSync(
    "magick",
    ["png:-", "-strip", "-define", "webp:lossless=true", outputPath],
    { input: raster.stdout, encoding: "utf8" }
  );
  if (result.error) {
    throw new Error(`Unable to encode ${asset.id}. Install ImageMagick so magick is available.`, {
      cause: result.error
    });
  }
  if (result.status !== 0) {
    throw new Error(`Unable to encode ${asset.id}: ${result.stderr.trim()}`);
  }
}

console.log(
  `Built ${outpostRuntimeImageAssets.length + outpostRuntimeFeedbackAssets.length} Outpost runtime WebP assets.`
);
