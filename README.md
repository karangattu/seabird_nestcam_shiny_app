# Seabird NestCam Annotation

Review seabird camera images and save observations in the desktop or web app.

## Install and use

Download the Windows or macOS installer from [Releases](https://github.com/karangattu/seabird_nestcam_shiny_app/releases).
Open the app and enter your Synology details in the setup modal.
Select Save and Start.

## Repository layout

The project uses these folders:

- `src/`: Web app, server routes, tests beside the code, and shared test setup in `test/`.
- `desktop/`: Electron app, setup modal, tests, and installer assets in `resources/`.
- `supabase/`: Database schema.
- `scripts/`: Connection checks and desktop build preparation.
- `public/`: Web icons and offline support.
- `.github/workflows/`: Project checks and desktop releases.
