# Phase M8 — Enterprise Update System

## Release
- Current version: `18.3.0`
- Build: `18300`

## Implemented
- Network-only `version.json` check with cache bypass.
- Automatic checks on startup, reconnect, app resume, and every 15 minutes.
- Arabic update dialog showing the new version and release notes.
- Update button clears KYUM caches, asks the service worker to activate, and reloads with a cache buster.
- Optional forced update through `forceUpdate: true`.
- Service worker cache namespace updated to `kyum-crm-pwa-18-3-0`.

## Publishing future releases
1. Increase the local version in `assets/js/pwa.js`.
2. Increase `version.json` version/build and edit notes.
3. Change `CACHE_VERSION` in `service-worker.js`.
4. Update cache-busting references in `index.html`.
5. Upload all changed release files together.

## Scope note
The automatic web update flow applies to browser and installed PWA releases. A packaged Capacitor APK/IPA still requires publishing a new native build unless it is configured to load hosted web assets.
