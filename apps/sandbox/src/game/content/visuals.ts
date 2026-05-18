import type { DataPackEntry } from "@gamekit/data";
import { sandboxVisualAssetEntries } from "./visual-assets";
import { sandboxVisualRenderObjectEntries } from "./visual-render-objects";
import { sandboxVisualRenderRigEntries } from "./visual-render-rigs";

export const sandboxVisualEntries: DataPackEntry[] = [
  ...sandboxVisualAssetEntries,
  ...sandboxVisualRenderObjectEntries,
  ...sandboxVisualRenderRigEntries
];
