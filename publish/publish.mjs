// Publish one build to the update feed.
//
// In order: the installer goes into a release of its own, then the app's feed
// manifest is replaced to point at it, then releases beyond the retention count
// are removed. The manifest moves last, so an app that checks mid-publish sees
// either the previous build or this one, never a manifest naming a file that
// is not there yet.
//
// Every value arrives in the environment, set by action.yml.

import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import * as feed from "./feed.mjs";

const input = (name, { required = true } = {}) => {
  const value = (process.env[name] ?? "").trim();
  if (required && !value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const gh = (args, { allowFailure = false } = {}) => {
  try {
    return execFileSync("gh", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (allowFailure) {
      return null;
    }
    const said = String(error.stderr || error.message).trim();
    throw new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${said}`);
  }
};

const output = (key, value) => {
  console.log(`${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
};

const summary = (line) => {
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
  }
};

function main() {
  const repo = input("RELEASES_REPO", { required: false }) || feed.RELEASES_REPO;
  const app = input("APP");
  const kind = input("KIND");
  const version = input("VERSION");
  feed.assertApp(app);
  feed.assertKind(kind);
  feed.assertVersion(version);

  const tag = feed.releaseTag(app, version);
  const feedTag = feed.feedTag(app);
  const manifestName = feed.MANIFEST_NAMES[kind];
  const releaseExists = (name) =>
    gh(["release", "view", name, "--repo", repo, "--json", "tagName"], {
      allowFailure: true,
    }) !== null;

  // Published means the feed already offers this version, not merely that its
  // release exists: a run that failed between the two has to be able to finish.
  const current = gh(
    ["release", "download", feedTag, "--repo", repo, "--pattern", manifestName, "--output", "-"],
    { allowFailure: true },
  );
  const feedVersion = current === null ? null : feed.manifestVersion(kind, current);
  if (input("CHECK_ONLY", { required: false }) === "true") {
    output("published", String(feedVersion === version));
    return;
  }

  const installer = input("INSTALLER");
  if (!existsSync(installer)) {
    throw new Error(`the installer is not at ${installer}`);
  }
  const notes = input("NOTES", { required: false }) || `vaexcore ${app} ${version}`;
  const stage = mkdtempSync(join(tmpdir(), "vaexcore-release-"));
  const assetName = feed.installerAssetName(app, version);
  const url = feed.assetUrl(repo, tag, assetName);
  const assets = [join(stage, assetName)];
  copyFileSync(installer, assets[0]);

  let manifest;
  if (kind === "tauri") {
    const signature = readFileSync(input("SIGNATURE"), "utf8");
    const document = feed.tauriManifest({
      version,
      notes,
      signature,
      url,
      publishedAt: new Date().toISOString(),
    });
    manifest = `${JSON.stringify(document, null, 2)}\n`;
  } else {
    const blockmap = `${installer}.blockmap`;
    if (existsSync(blockmap)) {
      const staged = join(stage, `${assetName}.blockmap`);
      copyFileSync(blockmap, staged);
      assets.push(staged);
    }
    manifest = feed.electronManifest(readFileSync(input("ELECTRON_MANIFEST"), "utf8"), {
      version,
      fileName: basename(installer),
      url,
    });
  }
  // The versioned release keeps its own manifest too, so rolling the feed back
  // to an earlier build is copying one file.
  const manifestPath = join(stage, manifestName);
  writeFileSync(manifestPath, manifest);
  assets.push(manifestPath);

  if (releaseExists(tag)) {
    gh(["release", "upload", tag, ...assets, "--repo", repo, "--clobber"]);
  } else {
    gh([
      "release", "create", tag, ...assets,
      "--repo", repo,
      "--title", `vaexcore ${app} ${version}`,
      "--notes", notes,
      "--latest=false",
    ]);
  }

  if (releaseExists(feedTag)) {
    gh(["release", "upload", feedTag, manifestPath, "--repo", repo, "--clobber"]);
  } else {
    gh([
      "release", "create", feedTag, manifestPath,
      "--repo", repo,
      "--title", `vaexcore ${app} update feed`,
      "--notes", `The manifest installed copies of vaexcore ${app} read. Installers are in the ${app}-v* releases.`,
      "--latest=false",
    ]);
  }

  const keep = Number.parseInt(input("KEEP", { required: false }) || "10", 10);
  const listed = JSON.parse(
    gh(["release", "list", "--repo", repo, "--limit", "1000", "--json", "tagName"]),
  );
  const pruned = feed.releasesToPrune(listed, app, keep);
  for (const old of pruned) {
    gh(["release", "delete", old, "--repo", repo, "--cleanup-tag", "--yes"]);
  }

  output("published", "true");
  summary(`Published vaexcore ${app} ${version} (was ${feedVersion ?? "nothing"}).`);
  summary(`- Installer: ${url}`);
  if (pruned.length > 0) {
    summary(`- Removed ${pruned.join(", ")}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`::error::${error.message}`);
  process.exit(1);
}
