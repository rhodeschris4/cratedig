# CrateDig

A Chrome extension that lets you save music you discover on Bandcamp to your Spotify playlist with one click.

## Why

I kept finding myself in the same loop, browsing Bandcamp, clicking through people's purchase histories, discovering something amazing, and then switching to Spotify to search for it and add it to a playlist. Half the time I'd forget what I was looking for by the time I got there. CrateDig cuts that down to one click.

## How It Works

1. Browse any Bandcamp page — track pages, album pages, someone's collection
2. Click the CrateDig button that appears on the page
3. It searches Spotify for a match
4. Hit "Add to Playlist" and it's saved to your chosen playlist

## Install

**From the Chrome Web Store:**

1. Install CrateDig from the [Chrome Web Store](https://chromewebstore.google.com) *(link coming soon)*
2. Click the extension icon and log in with your Spotify account
3. Pick your target playlist and start digging

**From source:**

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create an app
2. Clone this repo and load it as an unpacked extension in Chrome (`chrome://extensions` → Developer Mode → Load Unpacked)
3. Copy your extension ID from `chrome://extensions`
4. In the Spotify Dashboard, set the redirect URI to `https://<your-extension-id>.chromiumapp.org/`
5. Add your Spotify Client ID to the extension's config

## Features

- One click add to any of your Spotify playlists
- Works on track pages, album pages, and discovery feeds
- Smart search with fallbacks for mismatched titles between platforms
- Duplicate detection
- Pick and switch your target playlist anytime

## Privacy

CrateDig doesn't collect or transmit any personal data. Spotify tokens are stored locally in your browser. The extension only reads track and artist info from Bandcamp pages to search Spotify on your behalf. See the full [privacy policy](https://gist.github.com/rhodeschris4/1d9061fbb87f1aee7ddd5316e18bf2b2).

## License

MIT
