import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function main() {
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

main().catch((error) => {
  console.error(`release manifest failed: ${error.message}`);
  process.exitCode = 1;
});
