# vaexcore releases

Installers and update feeds for the vaexcore desktop apps. The source is
private; this repository holds only what an installed app downloads.

Nothing here is published by hand. Each app's repository builds on every change
to `main` that passes CI and publishes through the action in [`publish/`](publish).

## Update feeds

| App | Feed |
| --- | --- |
| vaexcore studio | `https://github.com/JAMARQ-Digital-LLC/vaexcore-releases/releases/download/studio-latest/latest.json` |
| vaexcore pulse | `https://github.com/JAMARQ-Digital-LLC/vaexcore-releases/releases/download/pulse-latest/latest.json` |
| vaexcore console | `https://github.com/JAMARQ-Digital-LLC/vaexcore-releases/releases/download/console-latest/latest.yml` |
| vaexcore suite | `https://github.com/JAMARQ-Digital-LLC/vaexcore-releases/releases/download/suite-latest/latest.json` |

## Releases

- `<app>-v<version>`: one build - its installer, and the manifest that points at
  it. The newest ten per app are kept.
- `<app>-latest`: the manifest installed copies read, and nothing else. It is
  replaced last when a build is published, so it never names an installer that
  has not finished uploading.

To install an app for the first time, download the newest
`vaexcore-<app>-<version>-x64-setup.exe` from its `<app>-v*` release. From then on
it updates itself.

## Versions

`MAJOR.MINOR` comes from the app's own version field; `PATCH` is the number of
commits on `main` that changed the app. Every published build is therefore
newer than the last, and a change to docs or CI alone does not publish anything.

## Signing

Tauri updates (studio, pulse, suite) are signed with the suite's minisign key,
and the apps refuse an update that does not verify. Console's updates are checked
against the SHA-512 in its manifest.

The installers are not yet Authenticode-signed. Windows may warn before running
one downloaded from here, and Smart App Control may block it.

## Rolling back

Copy the manifest from the release you want to go back to into that app's
`<app>-latest` release, replacing the one there. Installed copies only move
forward, so this stops newer installs from updating further but does not
downgrade anyone.
