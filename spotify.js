const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const CLIENT_ID = CONFIG.SPOTIFY_CLIENT_ID;
const REDIRECT_URI = chrome.identity.getRedirectURL();
const SCOPES = [
  "playlist-read-private",
  "playlist-modify-private",
  "playlist-modify-public",
].join(" ");

function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function startAuthFlow() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  });

  const authUrl = `${SPOTIFY_AUTH_URL}?${params.toString()}`;

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true,
  });

  const code = new URL(responseUrl).searchParams.get("code");
  if (!code) throw new Error("No authorization code received");

  const tokens = await exchangeCodeForTokens(code, codeVerifier);
  await storeTokens(tokens);
  return tokens;
}

async function exchangeCodeForTokens(code, codeVerifier) {
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error_description || "Token exchange failed");
  }

  return response.json();
}

async function refreshAccessToken() {
  const { refreshToken } = await chrome.storage.local.get("refreshToken");
  if (!refreshToken) throw new Error("No refresh token — please log in again");

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    await chrome.storage.local.remove(["accessToken", "refreshToken", "tokenExpiry"]);
    throw new Error("Session expired — please log in again");
  }

  const tokens = await response.json();
  await storeTokens(tokens);
  return tokens.access_token;
}

async function storeTokens(tokens) {
  const data = {
    accessToken: tokens.access_token,
    tokenExpiry: Date.now() + tokens.expires_in * 1000,
  };
  if (tokens.refresh_token) data.refreshToken = tokens.refresh_token;
  await chrome.storage.local.set(data);
}

async function getAccessToken() {
  const { accessToken, tokenExpiry } = await chrome.storage.local.get([
    "accessToken",
    "tokenExpiry",
  ]);

  if (accessToken && tokenExpiry && Date.now() < tokenExpiry - 60_000) {
    return accessToken;
  }

  return refreshAccessToken();
}

async function spotifyFetch(endpoint, options = {}) {
  const token = await getAccessToken();
  const url = endpoint.startsWith("http") ? endpoint : `${SPOTIFY_API_BASE}${endpoint}`;

  let response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${newToken}`,
        ...options.headers,
      },
    });
  }

  return response;
}

async function searchTrack(track, artist) {
  const strategies = [
    `track:"${track}" artist:"${artist}"`,
    `${track} ${artist}`,
  ];

  const simplified = simplifyTrackName(track);
  if (simplified !== track) {
    strategies.push(`${simplified} ${artist}`);
  }

  for (const query of strategies) {
    const results = await doSearch(query);
    if (results.length > 0) return { results, query };
  }

  return { results: [], query: strategies[0] };
}

async function doSearch(query) {
  const params = new URLSearchParams({ q: query, type: "track", limit: "5" });
  const response = await spotifyFetch(`/search?${params}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Search failed (${response.status})`);
  }
  const data = await response.json();
  const trackResults = data.tracks?.items || data.items || [];
  return trackResults.filter(Boolean);
}

function simplifyTrackName(name) {
  return name
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s*\[.*?\]\s*/g, " ")
    .replace(/\s*[-–—]\s*(feat|ft|featuring)\.?\s*.*/i, "")
    .trim();
}

function normalizeForComparison(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isConfidentMatch(spotifyTrack, scrapedTrack) {
  const a = normalizeForComparison(spotifyTrack);
  const b = normalizeForComparison(scrapedTrack);
  return a === b || a.includes(b) || b.includes(a);
}

async function isTrackInPlaylist(playlistId, trackUri) {
  let url = `/playlists/${playlistId}/items?fields=items(item(uri)),next&limit=100`;
  while (url) {
    const response = await spotifyFetch(url);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || "Failed to check playlist");
    }
    const data = await response.json();
    if (data.items.some((entry) => entry.item?.uri === trackUri)) return true;
    url = data.next || null;
  }
  return false;
}

async function addTrackToPlaylist(playlistId, trackUri) {
  const response = await spotifyFetch(
    `/playlists/${playlistId}/items?uris=${encodeURIComponent(trackUri)}`,
    { method: "POST" }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to add track (${response.status})`);
  }
}

async function getUserPlaylists() {
  const playlists = [];
  let url = "/me/playlists?limit=50";

  while (url) {
    const response = await spotifyFetch(url);
    if (!response.ok) throw new Error("Failed to fetch playlists");
    const data = await response.json();
    playlists.push(...data.items.filter(Boolean));
    url = data.next || null;
  }

  return playlists;
}
