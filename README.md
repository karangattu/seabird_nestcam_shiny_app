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

Shared lists and reviewed image markers update automatically when the database changes.
Select Sync to share observations saved on your computer.
Automatic updates require the Realtime publication in `supabase/schema.sql` to be enabled in your database.

The management screen shows annotations in pages. Filters apply to the database, and Export CSV includes all matching records.
For an existing database, run [the index migration](supabase/migrations/202610070001_annotation_indexes.sql) in the Supabase SQL editor.
New databases get these indexes from `supabase/schema.sql`.

## Repository layout

The project uses these folders:

- `src/`: Web app, server routes, tests beside the code, and shared test setup in `test/`.
- `desktop/`: Electron app, setup modal, tests, and installer assets in `resources/`.
- `supabase/`: Database schema.
- `scripts/`: Connection checks and desktop build preparation.
- `public/`: Web icons and offline support.
- `.github/workflows/`: Project checks and desktop releases.
