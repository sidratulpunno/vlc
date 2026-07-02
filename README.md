# VLC Cloud Launcher

Save streaming links from any device and access them from any other device. Open streams directly in VLC for Android.

## Features

- **Cloud Sync** — Streams stored in Google Sheets via Google Apps Script
- **VLC Integration** — One-tap open in VLC for Android (intent:// scheme)
- **Cross Platform** — Works on Android phones, Android TV, tablets, and desktop
- **QR Codes** — Generate QR codes for every stream
- **Favorites** — Pin favorite streams to the top
- **Search & Filter** — Live search by name, URL, or category
- **Categories** — Movies, Sports, Anime, TV, Music, Kids, Live, Other
- **Export / Import** — JSON and CSV export and import
- **Offline Support** — Local cache with background sync
- **PWA** — Installable as a Progressive Web App
- **Dark UI** — Modern dark theme with smooth animations
- **Android TV** — Remote-friendly UI with keyboard navigation
- **Privacy** — No tracking, no ads, no cookies

## Setup

### 1. Google Sheet

1. Go to [Google Sheets](https://sheets.new)
2. Create a new sheet
3. Set the header row to:
   - `ID` | `Name` | `Category` | `URL` | `Favorite` | `CreatedAt`
4. Copy the Sheet ID from the URL (the long string between `/d/` and `/edit`)

### 2. Google Apps Script

1. In your sheet, go to **Extensions > Apps Script**
2. Delete any existing code and paste the contents of `Code.gs`
3. Replace `YOUR_GOOGLE_SHEET_ID` with your actual Sheet ID
4. Click **Deploy > New Deployment**
   - Choose **Web App**
   - **Execute as:** Me
   - **Who has access:** Anyone
5. Click **Deploy** and copy the Web App URL

### 3. Configuration

1. Open `config.js`
2. Replace `YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL` with your Web App URL

```js
const CONFIG = {
  API_URL: "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec",
  // ...
};
```

### 4. Deploy to GitHub Pages

1. Create a repository on GitHub
2. Push all files to the repository
3. Go to **Settings > Pages**
4. Select the branch (usually `main`) and folder (`/root`)
5. Click **Save**
6. Your site will be live at `https://yourusername.github.io/repository-name/`

If deploying to a subfolder (e.g., `username.github.io/vlc-cloud-launcher/`), update the `start_url` and `scope` in `manifest.json`.

## Usage

1. Open the website on any device
2. Paste a stream URL (M3U8, MP4, DASH, RTMP, YouTube Live, etc.)
3. Optionally add a name and select a category
4. Click **Save**
5. The stream appears in the list
6. On Android, tap **Open in VLC** to launch the stream directly
7. Access your saved streams from any device

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `list` | Get all streams |
| POST | `add` | Add a new stream |
| PUT | `update` | Update an existing stream |
| DELETE | `delete` | Delete a stream |

## Project Structure

```
vlc-cloud-launcher/
  index.html          Main HTML
  style.css           Styles
  script.js           Application logic
  config.js           API configuration
  manifest.json       PWA manifest
  sw.js               Service Worker
  Code.gs             Google Apps Script
  assets/
    logo.svg          App logo
    favicon.svg       Favicon
  README.md           This file
```

## Screenshots

*[Screenshot placeholders — add your own here]*

## Troubleshooting

- **API not responding** — Verify the Web App URL in `config.js` and ensure the Apps Script is deployed with "Anyone" access
- **CORS errors** — Apps Script Web Apps handle CORS automatically; if issues persist, redeploy as a new version
- **VLC not opening** — Ensure VLC for Android is installed from the Play Store
- **Empty stream list** — Check that the Sheet ID is correct and headers match exactly
- **Offline mode** — Streams are cached; they will sync when connectivity returns

## License

MIT
"# vlc" 
