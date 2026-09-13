import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertVersion,
  assetUrl,
  electronManifest,
  feedTag,
  installerAssetName,
  manifestVersion,
  releaseTag,
  releasesToPrune,
  tauriManifest,
} from "./feed.mjs";

const repo = "JAMARQ-Digital-LLC/vaexcore-releases";

test("each build and each feed has a tag of its own", () => {
  assert.equal(releaseTag("studio", "0.1.311"), "studio-v0.1.311");
  assert.equal(feedTag("console"), "console-latest");
  assert.equal(installerAssetName("pulse", "0.2.116"), "vaexcore-pulse-0.2.116-x64-setup.exe");
});

test("only a three-part numeric version is accepted", () => {
  assertVersion("0.1.311");
  assert.throws(() => assertVersion("0.1"));
  assert.throws(() => assertVersion("v0.1.3"));
  assert.throws(() => assertVersion("0.1.3-beta"));
});

test("a Tauri manifest names the installer and its signature for Windows", () => {
  const url = assetUrl(repo, "studio-v0.1.311", "vaexcore-studio-0.1.311-x64-setup.exe");
  const manifest = tauriManifest({
    version: "0.1.311",
    notes: "notes",
    signature: "c2lnbmF0dXJl\n",
    url,
    publishedAt: "2026-09-13T00:00:00.000Z",
  });
  assert.deepEqual(manifest.platforms, {
    "windows-x86_64": { signature: "c2lnbmF0dXJl", url },
  });
  assert.equal(manifestVersion("tauri", JSON.stringify(manifest)), "0.1.311");
});

test("a Tauri manifest refuses an empty signature", () => {
  assert.throws(() =>
    tauriManifest({ version: "0.1.1", notes: "", signature: " \n", url: "u", publishedAt: "t" }),
  );
});

const latestYml = [
  "version: 0.1.187",
  "files:",
  "  - url: vaexcore-console-0.1.187-x64-setup.exe",
  "    sha512: abc==",
  "    size: 90000000",
  "path: vaexcore-console-0.1.187-x64-setup.exe",
  "sha512: abc==",
  "releaseDate: '2026-09-13T00:00:00.000Z'",
  "",
].join("\r\n");

test("an Electron manifest points every installer reference at the release", () => {
  const url = assetUrl(repo, "console-v0.1.187", "vaexcore-console-0.1.187-x64-setup.exe");
  const rewritten = electronManifest(latestYml, {
    version: "0.1.187",
    fileName: "vaexcore-console-0.1.187-x64-setup.exe",
    url,
  });
  assert.match(rewritten, new RegExp(`^  - url: ${url}$`, "m"));
  assert.match(rewritten, new RegExp(`^path: ${url}$`, "m"));
  assert.match(rewritten, /^    sha512: abc==$/m);
  assert.equal(manifestVersion("electron", rewritten), "0.1.187");
});

test("an Electron manifest for another version or file is refused", () => {
  const options = { version: "0.1.187", fileName: "vaexcore-console-0.1.187-x64-setup.exe", url: "u" };
  assert.throws(() => electronManifest(latestYml, { ...options, version: "0.1.188" }));
  assert.throws(() => electronManifest(latestYml, { ...options, fileName: "other.exe" }));
  assert.throws(() => electronManifest("version: 0.1.187\n", options));
});

test("pruning keeps the newest versions of one app and never touches the feed", () => {
  const releases = [
    "studio-v0.1.9",
    "studio-v0.1.10",
    "studio-v0.1.100",
    "studio-latest",
    "pulse-v0.2.1",
    "studio-v0.1.11",
  ].map((tagName) => ({ tagName }));
  assert.deepEqual(releasesToPrune(releases, "studio", 2), ["studio-v0.1.10", "studio-v0.1.9"]);
  assert.deepEqual(releasesToPrune(releases, "pulse", 2), []);
  assert.deepEqual(releasesToPrune(releases, "studio", 0), [
    "studio-v0.1.11",
    "studio-v0.1.10",
    "studio-v0.1.9",
  ]);
});
