import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifyManifest(manifestPath, artifactDirectory = path.dirname(manifestPath)) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    manifest.schema_version !== 1
    || typeof manifest.product !== "string"
    || typeof manifest.version !== "string"
    || !/^[a-f0-9]{40}$/i.test(manifest.commit ?? "")
    || !Array.isArray(manifest.artifacts)
    || manifest.artifacts.length === 0
  ) {
    throw new Error("unsupported or incomplete release manifest");
  }
  const names = new Set();
  for (const artifact of manifest.artifacts) {
    const name = artifact.filename;
    if (typeof name !== "string" || !name || name === "." || name === ".." || /[\\/]/.test(name)) {
      throw new Error("manifest contains an unsafe artifact filename");
    }
    if (names.has(name)) throw new Error(`duplicate artifact filename: ${name}`);
    names.add(name);
    if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 1 || !/^[a-f0-9]{64}$/.test(artifact.sha256)) {
      throw new Error(`invalid size or SHA-256 for ${name}`);
    }
    const file = path.join(artifactDirectory, name);
    const linkInfo = await lstat(file);
    const info = await stat(file);
    if (linkInfo.isSymbolicLink() || !info.isFile() || info.size !== artifact.bytes || await sha256(file) !== artifact.sha256) {
      throw new Error(`size or SHA-256 mismatch: ${name}`);
    }
  }
  return manifest.artifacts.length;
}

async function main() {
  if (process.argv[2] === "--verify") {
    const manifestPath = path.resolve(process.argv[3] ?? "");
    const artifactDirectory = path.resolve(process.argv[4] ?? path.dirname(manifestPath));
    const count = await verifyManifest(manifestPath, artifactDirectory);
    console.log(`Verified ${count} release artifacts against ${manifestPath}`);
    return;
  }

  const bundle = path.join(root, "src-tauri/target/release/bundle");
  const files = [];
  for (const format of ["nsis", "msi"]) {
    const directory = path.join(bundle, format);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith(format === "nsis" ? ".exe" : ".msi")) {
        files.push(path.join(directory, entry.name));
      }
    }
  }
  files.push(path.join(root, "dist/zshelper-portable.zip"));
  if (files.length < 3) throw new Error(`expected NSIS, MSI and portable archive; found ${files.length} files`);

  const tauri = JSON.parse(await readFile(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
  let commit = process.env.GITHUB_SHA;
  if (!commit) commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

  const artifacts = [];
  for (const file of files.sort()) {
    const info = await stat(file);
    artifacts.push({
      filename: path.basename(file),
      format: file.endsWith(".zip") ? "portable-zip" : file.toLowerCase().endsWith(".msi") ? "msi" : "nsis-exe",
      bytes: info.size,
      sha256: await sha256(file),
    });
  }
  const manifest = {
    schema_version: 1,
    product: tauri.productName,
    version: tauri.version,
    commit,
    workflow_run_id: process.env.GITHUB_RUN_ID ?? null,
    artifacts,
    note: "Checksums identify these files; GitHub provenance attestations are separate and are not Authenticode signatures.",
  };
  const output = path.join(root, "dist/zshelper-release.json");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Release manifest: ${artifacts.length} artifacts, ${output}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`release manifest failed: ${error.message}`);
    process.exitCode = 1;
  });
}
