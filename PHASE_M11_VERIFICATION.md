# Phase M11 Verification — Native Packaging Foundation

## Root Cause
The M10 baseline was installable as a PWA but had no native container configuration, dependency manifest, deterministic web-bundle preparation, native lifecycle bridge, Android hardware-back handling, or Android Studio/Xcode build workflow.

## Scope
- Added Capacitor 8 project configuration for `com.kyum.company.crm`.
- Added deterministic `www/` preparation script.
- Added defensive native runtime bridge for status bar, Android back button, and external browser links.
- Disabled PWA install prompts and Service Worker registration inside Capacitor.
- Added Android/iOS build instructions.

## Files Modified
- index.html
- assets/js/pwa.js

## Files Added
- assets/js/native.js
- package.json
- capacitor.config.json
- scripts/prepare-native-web.mjs
- docs/PHASE_M11_ANDROID_BUILD.md
- PHASE_M11_VERIFICATION.md

## Verification Performed
- `node --check assets/js/native.js`
- `node --check assets/js/pwa.js`
- `node --check scripts/prepare-native-web.mjs`
- `npm run native:prepare`
- JSON validation for package.json and capacitor.config.json
- Verified generated www bundle includes index, assets, manifest, Service Worker and offline page.
- Verified business logic files were not modified.

## Environment Limitation
The Android project directory, APK and AAB require downloading Capacitor dependencies and running Android Studio. Network package installation and Android SDK build execution were unavailable in this environment, so no claim is made that an APK/AAB was compiled here.
