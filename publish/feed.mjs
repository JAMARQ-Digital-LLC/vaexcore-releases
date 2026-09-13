// The update feed, as data.
//
// Kept apart from publish.mjs, which talks to GitHub, so that what an installed
// app reads can be tested without a network or a token.

export const RELEASES_REPO = "JAMARQ-Digital-LLC/vaexcore-releases";

export const APPS = ["studio", "pulse", "console", "suite"];

/** The two manifest formats, by the updater that reads them. */
export const MANIFEST_NAMES = {
  tauri: "latest.json",
  electron: "latest.yml",
};

export function assertApp(app) {
  if (!APPS.includes(app)) {
    throw new Error(`app must be one of ${APPS.join(", ")}, got "${app}"`);
  }
}

export function assertKind(kind) {
  if (!Object.hasOwn(MANIFEST_NAMES, kind)) {
    throw new Error(`kind must be tauri or electron, got "${kind}"`);
  }
}

export function assertVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`version must be MAJOR.MINOR.PATCH, got "${version}"`);
  }
}

/** The release holding one build's installer. */
export const releaseTag = (app, version) => `${app}-v${version}`;

/**
 * The release holding an app's current manifest, and nothing else.
 *
 * One per app rather than GitHub's "latest release", which is a single release
 * for the whole repository and so could only ever describe one of the apps.
 */
export const feedTag = (app) => `${app}-latest`;

/**
 * The name an installer is published under.
 *
 * Normalised, because Tauri names its installer after the product name, with a
 * space in it, and GitHub silently rewrites spaces in asset names - the
 * manifest would then point at a file that does not exist.
 */
export const installerAssetName = (app, version) =>
  `vaexcore-${app}-${version}-x64-setup.exe`;

export const assetUrl = (repo, tag, name) =>
  `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`;

/** The latest.json a Tauri app's updater reads. */
export function tauriManifest({ version, notes, signature, url, publishedAt }) {
  const trimmed = signature.trim();
  if (!trimmed) {
    throw new Error("the updater signature is empty");
  }
  return {
    version,
    notes,
    pub_date: publishedAt,
    platforms: {
      "windows-x86_64": { signature: trimmed, url },
    },
  };
}

/**
 * latest.yml as electron-builder wrote it, pointed at the published installer.
 *
 * electron-builder names the installer relative to the feed. The installer is
 * published in its own versioned release rather than beside the manifest, so
 * every reference to it becomes an absolute URL; electron-updater resolves an
 * absolute URL as itself. Anything unexpected is an error rather than a guess,
 * since a wrong manifest is an update every install downloads.
 */
export function electronManifest(text, { version, fileName, url }) {
  const written = manifestVersion("electron", text);
  if (written !== version) {
    throw new Error(`latest.yml describes ${written}, not ${version}`);
  }

  let replaced = 0;
  const lines = text.split(/\r?\n/).map((line) => {
    const match = line.match(/^(\s*(?:-\s+)?(?:url|path):\s*)(.+)$/);
    if (!match) {
      return line;
    }
    const value = unquote(match[2]);
    if (value !== fileName) {
      throw new Error(`latest.yml names ${value}, expected ${fileName}`);
    }
    replaced += 1;
    return `${match[1]}${url}`;
  });

  if (replaced === 0) {
    throw new Error("latest.yml does not name an installer");
  }
  return lines.join("\n");
}

/** The version a manifest describes, or null if it names none. */
export function manifestVersion(kind, text) {
  assertKind(kind);
  if (kind === "tauri") {
    const version = JSON.parse(text).version;
    return typeof version === "string" ? version : null;
  }
  const match = text.match(/^version:\s*(.+)$/m);
  return match ? unquote(match[1]) : null;
}

export function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return a[index] - b[index];
    }
  }
  return 0;
}

/**
 * The versioned releases of `app` beyond the newest `keep`, oldest last.
 *
 * Ordered by version rather than by date, so a rebuild of an older commit
 * cannot push the current release out.
 */
export function releasesToPrune(releases, app, keep) {
  const prefix = `${app}-v`;
  return releases
    .map((release) => release.tagName)
    .filter(
      (tag) =>
        tag.startsWith(prefix) && /^\d+\.\d+\.\d+$/.test(tag.slice(prefix.length)),
    )
    .sort((a, b) => compareVersions(b.slice(prefix.length), a.slice(prefix.length)))
    .slice(Math.max(keep, 1));
}

const unquote = (value) => value.trim().replace(/^(['"])(.*)\1$/, "$2");
