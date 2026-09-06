import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createThreeRuntimeResources } from "../src/driver/runtime";

afterEach(() => vi.restoreAllMocks());

it("releases every GLTF scene and closes shared images only once", async () => {
  const image = { close: vi.fn() };
  const texture = new THREE.Texture(image);
  const textureDispose = vi.spyOn(texture, "dispose");
  const scenes = [new THREE.Group(), new THREE.Group()];
  const disposals = scenes.flatMap((scene) => {
    const geometry = new THREE.PlaneGeometry();
    const material = new THREE.MeshBasicMaterial({ map: texture });
    scene.add(new THREE.Mesh(geometry, material));
    return [vi.spyOn(geometry, "dispose"), vi.spyOn(material, "dispose")];
  });
  vi.spyOn(GLTFLoader.prototype, "loadAsync").mockResolvedValue({
    scene: scenes[0]!,
    scenes,
    animations: []
  } as unknown as GLTF);
  const resources = createThreeRuntimeResources(THREE, {
    assetLoadTimeoutMs: 1000,
    dracoDecoderPath: ""
  });
  try {
    await resources.loadModel("model", "fixture.glb");
    resources.unload("model");
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(image.close).toHaveBeenCalledOnce();
    expect(resources.has("model")).toBe(false);
  } finally {
    resources.dispose();
  }
});
