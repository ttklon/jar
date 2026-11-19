import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { verifyManifest } from "./release-manifest.mjs";

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "zshelper-release-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bytes = Buffer.from("installer fixture\n");
  const filename = "zshelper-setup.exe";
  await writeFile(path.join(directory, filename), bytes);
  const manifestPath = path.join(directory, "zshelper-release.json");
  await writeFile(manifestPath, JSON.stringify({
    schema_version: 1,
    product: "ZShelper",
    version: "0.1.0",
    commit: "a".repeat(40),
    artifacts: [{
      filename,
      format: "nsis-exe",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }],
  }));
  return { directory, filename, manifestPath };
}

test("manifest verifier accepts exact matching bytes", async (t) => {
  const { directory, manifestPath } = await fixture(t);
  assert.equal(await verifyManifest(manifestPath, directory), 1);
});

test("manifest verifier detects modified artifact bytes", async (t) => {
  const { directory, filename, manifestPath } = await fixture(t);
  await writeFile(path.join(directory, filename), "tampered");
  await assert.rejects(() => verifyManifest(manifestPath, directory), /mismatch/);
});

test("manifest verifier rejects path traversal", async (t) => {
  const { manifestPath } = await fixture(t);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.artifacts[0].filename = "../outside.exe";
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(() => verifyManifest(manifestPath), /unsafe/);
});
