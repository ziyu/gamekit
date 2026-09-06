import {
  defineWorldCheckpointConformanceTests,
  defineWorldConformanceTests
} from "@gamekit/test-utils";
import { createKootaWorld } from "../src/index";

defineWorldConformanceTests("Koota", createKootaWorld);
defineWorldCheckpointConformanceTests("Koota", createKootaWorld);
