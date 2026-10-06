# Seabird NestCam Annotation

An app for reviewing seabird nest camera pictures and saving observations. It works as a desktop app (Windows, macOS, Linux) and as a web app.

## Desktop App Setup (Windows, macOS, Linux)

1. Download the app for your system from the [Releases](https://github.com/karangattu/seabird_nestcam_shiny_app/releases) page:
   - **Windows**: Download and open `Seabird NestCam Annotation Setup <version>.exe`.
   - **macOS**: Download and open the `.dmg` file (or unzip the `.zip` file).
   - **Linux**: Run the desktop build package.
2. Open the app. When you open it the first time, you will see a settings screen:
   - **Supabase Database**: Enter your Supabase Project URL and Key. Leave blank if you want to use the default shared database.
   - **Synology NAS (Images)**: Enter your NAS URL (for example `http://192.168.12.166:5000`), username, password, and camera folder path.
   - **Google Sheets (Optional)**: Only fill this if your team syncs data to Google Sheets.
3. Click **Save and Start**.
4. You can open these settings anytime from the menu bar: **Server > Settings...**.

## Database Setup (Supabase)

Supabase is the main database for storing observations, cameras, species, behaviors, and templates:

1. Create a project at [supabase.com](https://supabase.com).
2. Go to the SQL Editor and run the queries in [`supabase-schema.sql`](supabase-schema.sql).
3. Copy your **Project URL** and **Publishable / Anon Key** into the app setup screen or into `.env.local`.

## Image Storage Setup (Synology NAS)

The app reads camera pictures from your Synology NAS over your local network or VPN:

- **NAS URL**: `http://<nas-ip>:5000` (or `https://<nas-ip>:5001`)
- **Username & Password**: An account with read access to the camera folder.
- **Default folder**: The folder path on the NAS (such as `/volume1/camera-folder`).

Make sure your computer is on the same local network or connected to the VPN.

## Local Development

To run the web version locally:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000> in your browser.

## Tests & Checks

Run these commands to verify the project:

```bash
npm run typecheck
npm test
npm run build
```
