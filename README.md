# Seabird NestCam Annotation

A Next.js PWA for reviewing seabird nest camera images, saving local annotations, and syncing finished rows to Google Sheets from server-only API routes.

## Features

- Load local JPG, PNG, and WebP files for browser-only review.
- Load image lists from a Synology NAS through server-side File Station API routes.
- Show the full image in contain mode, with fullscreen viewing when needed.
- Mark sequence start/end points or single-image observations.
- Save annotations locally, then edit, delete, undo, export CSV, or sync rows.
- Keep Google Sheets and Synology credentials out of the browser.
- Install as a PWA with a manifest, custom SVG icons, service worker, and offline fallback.

## Local Development

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Desktop App

The desktop app bundles Electron, Node.js, the production Next.js server, and npm packages. End users do not need Node.js or npm installed.

For most users, download the latest desktop app from the GitHub Releases page:

- Windows: download `Seabird NestCam Annotation Setup <version>.exe`.
- macOS: download the `.dmg` file, or the `.zip` file if the disk image does not open on that computer.

These files are built by the `Desktop Builds` GitHub Actions workflow for Windows and macOS. Tagged releases attach the generated files directly to the release so users can download them without building anything.

On first launch, the installed app opens a settings modal for the Google Sheets and Synology values that are normally stored in `.env`. Users can save those settings on their own computer so they do not have to enter them every time. Settings can be changed later from `Server > Settings...`.

Developers can also build an installer from a development machine with Node.js/npm:

```bash
npm run desktop:dist
```

See [DESKTOP_APP_SETUP.md](DESKTOP_APP_SETUP.md) for the packaging and handoff workflow.

## Verification

```bash
npm run typecheck
npm test
npm run build
npm audit
```

The CI workflow runs typecheck, tests, build, and audit on pushes and pull requests targeting `main`. The Desktop Builds workflow creates downloadable Windows and macOS desktop artifacts for version tags and manual runs.

## Google Sheets Setup

1. In Google Cloud, enable the Google Sheets API for your project.
2. Create a service account and generate a JSON key.
3. Share the assignment and annotation spreadsheets with the service account email as an editor.
4. Copy `.env.example` to `.env` for local development.
5. Set either `GOOGLE_SERVICE_ACCOUNT_JSON` or both `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY`.
6. Set `GOOGLE_SHEETS_SPREADSHEET_ID` if assignments and annotations are tabs in one spreadsheet, or set `GOOGLE_ASSIGNMENTS_SPREADSHEET_ID` and `GOOGLE_ANNOTATIONS_SPREADSHEET_ID` separately.
7. Set `GOOGLE_ASSIGNMENTS_SHEET_NAME` and `GOOGLE_ANNOTATIONS_SHEET_NAME` if either tab is not named `Sheet1`.

For Vercel, add the same variables in Project Settings under Environment Variables. Do not use `NEXT_PUBLIC_` for any credential.

## Synology NAS Setup

The app can list and proxy images from Synology File Station without exposing NAS credentials to the browser.

### Local LAN Setup

Use this when the operator is on the same network or VPN as the NAS. This is the setup that matches a successful R script check using `NAS_URL <- "http://192.168.12.166:5000"`.

```bash
cp .env.synology-local.example .env.local
npm install
npm run check:synology
npm run dev
```

Before running `npm run check:synology`, edit `.env.local`:

```bash
SYNOLOGY_BASE_URL=http://192.168.12.166:5000
SYNOLOGY_PORT=
SYNOLOGY_USERNAME=your-synology-user
SYNOLOGY_PASSWORD=your-synology-password
SYNOLOGY_DEFAULT_FOLDER=/volume1/camera-folder
SYNOLOGY_ALLOWED_FOLDER_PREFIX=/volume1
```

Leave `SYNOLOGY_PORT` empty when `SYNOLOGY_BASE_URL` already includes `:5000`. The check command verifies both authentication and File Station folder access. If it passes, open <http://localhost:3000> and use the Synology image loader in the app.

This local setup will not work from Vercel or from a machine outside the NAS network because `192.168.12.166` is a private LAN address. For outside access, use a VPN/tunnel, deploy the app on a machine inside the network, or expose the NAS through a properly secured public endpoint.

### Server Variables

Set these server-side variables:

```bash
SYNOLOGY_BASE_URL=https://your-nas.example.com
SYNOLOGY_PORT=5001
SYNOLOGY_USERNAME=
SYNOLOGY_PASSWORD=
SYNOLOGY_VERIFY_SSL=true
SYNOLOGY_DEFAULT_FOLDER=/volume1/camera-folder
SYNOLOGY_ALLOWED_FOLDER_PREFIX=/volume1
```

`SYNOLOGY_ALLOWED_FOLDER_PREFIX` limits which paths the image proxy may access. On Vercel, the NAS hostname must be reachable from Vercel's network over HTTPS; private LAN-only addresses will not work without a public endpoint, VPN/proxy layer, or another deployment target inside the same network.

## Vercel Deployment

1. Create a Vercel project from this repository.
2. Use the repository root as the project root.
3. Keep the build command as `npm run build`.
4. Add Google Sheets and optional Synology environment variables.
5. Deploy.

## Image Fit

The main viewer uses contain mode so the entire frame stays visible. If you need detail inspection, use the fullscreen control rather than relying on cropped preview behavior.

## License

This project is available for research and educational purposes.
