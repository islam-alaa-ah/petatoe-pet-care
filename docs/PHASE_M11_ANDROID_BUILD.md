# KYUM CRM — Android Build Guide

## Requirements
- Node.js compatible with Capacitor 8.
- Android Studio with Android SDK and JDK configured.
- HTTPS Supabase project URLs remain unchanged.

## First-time setup
```bash
npm install
npm run native:add:android
npm run native:open:android
```

## After every web update
```bash
npm run native:sync
npm run native:open:android
```

## Build outputs
In Android Studio:
- Debug APK: Build > Build APK(s)
- Signed AAB: Build > Generate Signed Bundle / APK > Android App Bundle

## Security
- Do not place Supabase service-role keys in the application.
- Keep only the existing public anon configuration used by the web app.
- `webContentsDebuggingEnabled` is disabled in the production configuration.

## iOS
On macOS with Xcode:
```bash
npm install
npm run native:add:ios
npm run native:open:ios
```
