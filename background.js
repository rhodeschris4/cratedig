importScripts("spotify.js");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((err) => {
    sendResponse({ ok: false, error: err.message || "Unknown error" });
  });
  return true;
});

async function handleMessage(message) {
  switch (message.action) {
    case "login": {
      await startAuthFlow();
      return { ok: true };
    }

    case "logout": {
      await chrome.storage.local.remove([
        "accessToken",
        "refreshToken",
        "tokenExpiry",
        "targetPlaylistId",
      ]);
      return { ok: true };
    }

    case "getPlaylists": {
      const playlists = await getUserPlaylists();
      return {
        playlists: playlists.map((p) => ({
          id: p.id,
          name: p.name,
        })),
      };
    }

    case "setTargetPlaylist": {
      await chrome.storage.local.set({ targetPlaylistId: message.playlistId });
      return { ok: true };
    }

    case "searchSpotify": {
      const { accessToken } = await chrome.storage.local.get("accessToken");
      if (!accessToken) {
        return { error: "Not logged in — click the extension icon to connect Spotify" };
      }
      const { results, query } = await searchTrack(message.track, message.artist);
      if (results.length === 0) {
        return { found: false, query };
      }
      const confident =
        results.length === 1 ||
        isConfidentMatch(results[0].name, message.track);
      return {
        found: true,
        confident,
        tracks: results.map((t) => ({
          uri: t.uri,
          name: t.name,
          artist: t.artists?.map((a) => a.name).join(", ") || "Unknown Artist",
          album: t.album?.name || "",
          url: t.external_urls?.spotify,
        })),
      };
    }

    case "addToPlaylist": {
      const { accessToken, targetPlaylistId } = await chrome.storage.local.get([
        "accessToken",
        "targetPlaylistId",
      ]);
      if (!accessToken) {
        return { added: false, error: "Not logged in — click the extension icon to connect Spotify" };
      }
      if (!targetPlaylistId) {
        return { added: false, error: "No playlist selected — pick one in the popup" };
      }
      const duplicate = await isTrackInPlaylist(targetPlaylistId, message.trackUri);
      if (duplicate) {
        return { added: false, duplicate: true };
      }
      await addTrackToPlaylist(targetPlaylistId, message.trackUri);
      return { added: true };
    }

    default:
      return { error: "Unknown action" };
  }
}
