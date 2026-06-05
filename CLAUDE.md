# CLAUDE.md — Bandcamp Finds (Chrome Extension)

## Project Overview

A Chrome extension that runs on Bandcamp pages, detects the currently playing or displayed track, searches for it on Spotify, and adds it to a user-designated Spotify playlist (e.g. "Bandcamp Finds") with one click. The goal is to streamline the workflow of discovering music on Bandcamp and saving it to Spotify without switching between devices or apps.

## Core User Flow

1. User browses Bandcamp (album pages, track pages, discovery feed, user purchase feeds)
2. Extension detects the current track name and artist from the page
3. User clicks the extension's overlay button or popup
4. Extension searches Spotify for that track
5. If found, user clicks "Add to Playlist" and it's added to their configured playlist
6. If multiple results are found, show a short list so the user can pick the right one
7. Visual confirmation that the track was added (or already exists in the playlist)

## Tech Stack

- **Manifest V3** Chrome Extension
- **Content Script**: Vanilla JS injected on `*.bandcamp.com` pages to scrape track/artist info and render an overlay UI
- **Service Worker** (background): Handles Spotify OAuth token management, API calls, and message passing
- **Popup**: Small settings UI for choosing the target playlist, logging in/out of Spotify, and viewing recently added tracks
- **Storage**: `chrome.storage.local` for OAuth tokens, user preferences, selected playlist ID
- **No external dependencies required**, but optionally use a lightweight QR library (`qrcode-generator` or similar) if the user wants a QR fallback feature later

## File Structure

```
bandcamp-finds/
├── manifest.json
├── background.js          # Service worker: OAuth, Spotify API, message handling
├── content.js             # Injected on Bandcamp: DOM scraping, overlay UI
├── content.css            # Styles for the overlay button/panel on Bandcamp
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic: playlist picker, settings, recent adds
├── popup.css              # Popup styles
├── spotify.js             # Spotify API wrapper (search, playlist ops, auth helpers)
├── scraper.js             # Bandcamp DOM scraping logic (isolated for testability)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Bandcamp Scraping Details

Bandcamp pages have predictable DOM structures. The scraper should handle these page types:

- **Track pages** (`artist.bandcamp.com/track/slug`): Extract from `<h2 class="trackTitle">` and `<span itemprop="byArtist">`, or fall back to `og:title` meta tag
- **Album pages** (`artist.bandcamp.com/album/slug`): Extract the currently highlighted/playing track from the tracklist, plus the album artist
- **Discovery/feed pages** (`bandcamp.com/discover`, user collection pages): Extract from the currently playing item in the player widget at the bottom
- **Fan/purchase pages** (`bandcamp.com/username`): Extract from collection items

Always prefer structured data first: check for `ld+json` script tags with `@type: MusicRecording` or `MusicAlbum` schema, then fall back to DOM selectors, then `og:` meta tags.

The scraper module should export a function like:

```js
// Returns { track: string, artist: string, album?: string } or null
function scrapeCurrentTrack() { ... }
```

## Spotify Integration

### App Registration

The user must create a Spotify Developer app at https://developer.spotify.com/dashboard to get a Client ID. The redirect URI should be set to `https://<extension-id>.chromiumapp.org/` for the Chrome identity flow.

### OAuth 2.0 with PKCE

Use the Authorization Code flow with PKCE (no client secret needed in the extension). Implement using `chrome.identity.launchWebAuthFlow`:

- Auth URL: `https://accounts.spotify.com/authorize`
- Token URL: `https://accounts.spotify.com/api/token`
- Required scopes: `playlist-read-private playlist-modify-private playlist-modify-public`
- Store access token and refresh token in `chrome.storage.local`
- Auto-refresh tokens before they expire

### API Endpoints Used

- `GET /v1/search?type=track&q=track:{name}+artist:{artist}` — Find the track
- `GET /v1/me/playlists` — List user's playlists for the picker
- `POST /v1/playlists/{playlist_id}/tracks` — Add track to playlist
- `GET /v1/playlists/{playlist_id}/tracks` — Check if track already exists (avoid duplicates)

### Search Strategy

Spotify search can be finicky with exact matches. Use this fallback chain:

1. Search with both track name and artist: `track:"Song Name" artist:"Artist Name"`
2. If no results, try a looser search: `Song Name Artist Name` (no field filters)
3. If still no results, try with simplified track name (strip parentheticals, "feat." suffixes, etc.)
4. Present top 3-5 results to the user if confidence is low (e.g. track names don't closely match)

## Manifest V3 Configuration

```json
{
  "manifest_version": 3,
  "name": "Bandcamp Finds",
  "version": "1.0.0",
  "description": "Save Bandcamp discoveries to your Spotify playlist with one click",
  "permissions": ["storage", "identity"],
  "host_permissions": ["https://accounts.spotify.com/*", "https://api.spotify.com/*"],
  "content_scripts": [
    {
      "matches": ["*://*.bandcamp.com/*", "*://bandcamp.com/*"],
      "js": ["scraper.js", "content.js"],
      "css": ["content.css"]
    }
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "oauth2": {
    "client_id": "YOUR_SPOTIFY_CLIENT_ID",
    "scopes": ["playlist-read-private", "playlist-modify-private", "playlist-modify-public"]
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

## UI/UX Guidelines

### Overlay Button (Content Script)

- Small, unobtrusive floating button on Bandcamp pages (bottom-right corner or near the player)
- Uses Bandcamp's own color palette so it doesn't feel alien: dark background, light text
- Expands on click to show: track name, artist, Spotify match status, and "Add to Playlist" button
- States: idle, searching, found, not found, added, already in playlist, error
- Should not interfere with Bandcamp's own UI or player controls

### Popup

- Clean, minimal UI
- Spotify login/logout status
- Playlist dropdown selector (fetched from user's Spotify playlists)
- "Recently Added" list showing last ~10 tracks added this session
- Settings: toggle overlay visibility, default playlist selection

## Message Passing Architecture

Content script and service worker communicate via `chrome.runtime.sendMessage`:

```
Content Script → background: { action: "searchSpotify", track, artist }
Background → Content Script: { found: true, spotifyTrack: {...} }

Content Script → background: { action: "addToPlaylist", trackUri }
Background → Content Script: { added: true }

Popup → background: { action: "getPlaylists" }
Background → Popup: { playlists: [...] }

Popup → background: { action: "setTargetPlaylist", playlistId }
```

## Error Handling

- **No Spotify match found**: Show "Not found on Spotify" with the search query used, and offer a manual search link that opens Spotify search in a new tab
- **Auth expired**: Silently refresh tokens; if refresh fails, show a re-login prompt
- **Rate limiting**: Spotify's API rate limits are generous for personal use, but implement exponential backoff on 429 responses
- **Duplicate detection**: Before adding, check if the track URI already exists in the target playlist; if so, show "Already in playlist" instead of adding again
- **Network errors**: Show a retry button with a brief error message

## Future Enhancements (Out of Scope for V1)

- QR code generation as an alternative "send to phone" workflow
- Batch mode: scan an entire Bandcamp album and add all found tracks at once
- "Create playlist from album" feature
- Support for other music sources (SoundCloud, YouTube Music)
- Track match confidence scoring and fuzzy matching improvements
- Browser action badge showing count of tracks added this session

## Development Notes

- Test on these Bandcamp URL patterns: `/track/`, `/album/`, `/discover`, fan collection pages
- The Spotify Client ID should be stored in the manifest or a config file the user edits before loading the extension — do not hardcode secrets
- For local development, load as an unpacked extension via `chrome://extensions` with Developer Mode enabled
- The extension ID changes when unpacked, so the OAuth redirect URI needs to be updated in the Spotify dashboard to match
