# Seabird NestCam Annotation

Review seabird camera images and save observations in the desktop or web app.

## Install and use

Download the Windows or macOS installer from [Releases](https://github.com/karangattu/seabird_nestcam_shiny_app/releases).
Open the app and enter your Synology details in the setup modal.
Select Save and Start.

The modal includes field help, guidance for saved passwords, and steps for server problems.
For a private NAS address, connect to the same local network or VPN as the NAS.
To change your configuration, open Server > Settings...
To load another image folder, select Browse folders in the annotation screen.
Open a folder, select Use this folder, then select Load NAS images.

## Develop and build

Install Node.js and npm on your development computer.
Run these commands, then enter your connection details in `.env.local`.
The example covers local and hosted NAS addresses:

```bash
npm install
cp .env.example .env.local
```

Supabase stores observations, cameras, species, behaviors, and templates.
Create a [Supabase project](https://supabase.com).
In its SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql).
Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`.

Run `npm run dev` and open [localhost:3000](http://localhost:3000) for the web app.
If you need to test your NAS connection, run `npm run check:synology`.

For desktop builds, use `npm run desktop:pack` to create a test app or `npm run desktop:dist` to create an installer.
Build Windows installers on Windows and macOS installers on macOS.
Both commands write files to `release/` and bundle the Supabase connection from your environment or `.env.local`.
Users enter their NAS credentials in the app. They do not need Node.js or npm.

Run the project checks before you release a build:

```bash
npm run typecheck
npm test
npm run build
```

## Repository layout

The project uses these folders:

- `src/`: Web app, server routes, tests beside the code, and shared test setup in `test/`.
- `desktop/`: Electron app, setup modal, tests, and installer assets in `resources/`.
- `supabase/`: Database schema.
- `scripts/`: Connection checks and desktop build preparation.
- `public/`: Web icons and offline support.
- `.github/workflows/`: Project checks and desktop releases.

Keep package files and tool configuration at the root.
Use `.env.example` as the single template for connection details. Git ignores local environment files.
Builds create `.next/`, `desktop-runtime/`, and `release/`. Git ignores these folders.
