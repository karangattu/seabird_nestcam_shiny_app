# Desktop App Packaging Guide

This creates installable Windows and macOS desktop apps that bundle Electron, Node.js, the production Next.js server, and npm packages.

The person installing the app does not need Node.js, npm, or this source repository. They install the app, enter their Synology and Google Sheets settings on first run, and start annotating.

## How Settings Work

The installer does not bundle `.env` credentials.

On first launch, the desktop app opens a settings modal and asks for the same values normally placed in `.env`:

- Google service account email plus private key, or Google service account JSON
- shared Google spreadsheet ID, or separate assignment and annotation spreadsheet IDs
- assignment and annotation sheet names
- Synology NAS URL, username, password, default folder, and allowed folder prefix
- optional Synology port override and HTTPS certificate verification setting

The user can leave `SYNOLOGY_PORT` blank when the NAS URL already includes a port, for example `http://192.168.12.166:5000`.

If the user keeps `Save these settings on this computer` checked, the values are saved in that user's local app data folder and reused the next time the app opens. They can update them later from `Server > Settings...`.

## Security Note

Credentials are no longer inside the installer. If a user chooses to save settings, those credentials are stored on that user's computer for this app.

Use limited Synology and Google service accounts that can only access the needed File Station folder and spreadsheets. Do not use a personal admin account.

## Build Machine Requirements

The person creating installers still needs Node.js and npm on the build machine.

To create a macOS installer, build on macOS.

To create a Windows installer, build on Windows. Cross-building Windows installers from macOS may require extra Wine/Mono setup and is not the recommended path.

## 1. Install Build Dependencies

```bash
npm install
```

## 2. Build an Unpacked Desktop App for Testing

```bash
npm run desktop:pack
```

This creates an unpacked app in `release/`. Open it on a machine that can reach the NAS, enter the settings in the modal, save them, and confirm it loads images and syncs sheets.

## 3. Build an Installer

```bash
npm run desktop:dist
```

Artifacts are written to `release/`.

## End User Instructions

1. Install the app from the generated installer.
2. Open `Seabird NestCam Annotation`.
3. Enter the Synology and Google Sheets settings in the first-run modal.
4. Keep `Save these settings on this computer` checked if the app should remember them.
5. Select `Save and Start`.
6. Keep the app open while annotating.
7. To change settings later, use `Server > Settings...`.
8. To stop the local server, close the app window or use `Server > Stop Server and Quit`.

The laptop still needs to be on the same LAN/VPN as the NAS when the user enters a private NAS address such as `192.168.12.166`.

## Optional Developer Preflight

For local development only, you can still use `.env.local` and run:

```bash
npm run check:synology
```

That check is not required for end users of the installed desktop app.
