# Joplin integration — license & compliance note

_Engineering-hygiene note, not legal advice. It exists so the obligations that
come with embedding a third-party application are visible in the repository
instead of being discovered at release time._

## 1. What we embed

The My Day route (`#/my-day`) hosts **Joplin's own web build** as a
sub-application:

| Item | Value |
| --- | --- |
| Upstream project | `https://github.com/laurent22/joplin` |
| Package compiled | `packages/app-mobile` (`@joplin/app-mobile`, 3.7.x) |
| Pinned commit | `JOPLIN_SOURCE_COMMIT` in `scripts/joplin/build-workspace.mjs` (currently `d32307364cc5c4fc7e3a0e36d85c0a0f8722aaa7`) |
| License of that package | **AGPL-3.0-or-later** (see `packages/app-mobile/LICENSE` in the upstream tree) |
| How it is used | Compiled to `public/my-day-workspace/`, served from our origin, mounted in an isolated same-origin frame |

We do **not** modify Joplin's source. The only build-time change is the
`resolve.extensionAlias` patch applied by `scripts/joplin/build-workspace.mjs`,
which is required for Webpack to resolve TypeScript workspace sources imported as
`.js`; it changes no behaviour, only module resolution. The patch, the exact
commit and the build command are committed, so the "Corresponding Source" for
what we deploy is reproducible byte-for-byte from this repository.

## 2. Obligations this creates

1. **AGPL §13 (network use).** Serving the compiled application to users over the
   network means those users are entitled to the Corresponding Source of that
   application. Our offer is satisfied by: the pinned commit recorded in the
   build script, the recipe in `scripts/joplin/build-workspace.mjs`, and the
   manifest written next to the bundle (`dc-workspace.json` carries
   `sourceCommit`, `sourceTag`, `builtAt` and `buildMode`).
   **Action for release:** publish that manifest and the upstream commit
   alongside the deployed bundle (the CI workflow already uploads both as build
   artifacts).
2. **License text must travel with the artifact.** Joplin's LICENSE file lives
   in `packages/app-mobile/` upstream; the build copies `web/public/*` into the
   output but not the license. **Action for release:** add
   `THIRD-PARTY-NOTICES.md` to `public/my-day-workspace/` listing AGPL-3.0-or-later
   plus the bundled dependencies (SQLite WASM, fonts, `react-native-web` shims)
   before the artifact is published. The file is added by the release checklist,
   not silently.
3. **No relicensing, no rebranding.** The workspace keeps Joplin's own UI,
   strings, menus and typography (also a product requirement). We do not present
   it as "Digitalcatalyst Notes" and we do not remove Joplin's attributions from
   its interface.
4. **Trademark.** "Joplin" is used descriptively ("the Joplin workspace", "built
   from Joplin") and not as our product name. No Joplin logo is used in our
   navigation; the global nav item stays "My Day".

## 3. What is ours

Everything the host adds is our own code and stays separate from the AGPL
bundle:

* `src/joplin/**` — the host adapter, bridge, sync, scheduler, clipper glue;
* `api/_lib/joplin*.ts` — the server write path, allowance and clipper endpoints;
* `extensions/joplin-clipper/**` — the browser extension (original work);
* `firestore.rules` / `storage.rules` additions.

These communicate with the bundle **only** through `postMessage` on the
documented bridge protocol. There is no shared module graph, no import of
Joplin internals into host code, and no Joplin code compiled into the host
bundle — which is also why the host app builds with Vite while the workspace is
built by Joplin's Webpack.

## 4. Third-party plugins

Joplin's plugin system is **not** enabled for this deployment, and no
third-party plugin is loaded (explicit product decision). This removes both a
code-execution surface and the licence ambiguity that plugins would introduce.

## 5. Clipper

The Web Clipper is original code shipped in this repository. It authenticates
with a scoped, revocable, expiring token minted by our server — it never carries
Joplin code or Joplin branding, and it does not use any Joplin sync API.

## 6. Checklist before a public release that includes the bundle

- [ ] Bundle built in CI from the pinned commit (`joplin-artifacts.yml`).
- [ ] `dc-workspace.json` published with the artifact.
- [ ] `THIRD-PARTY-NOTICES.md` included in `public/my-day-workspace/`.
- [ ] Upstream commit linked from the release notes.
- [ ] The workspace still shows Joplin's own UI (no rebrand pass sneaked in).
