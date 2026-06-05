function scrapeCurrentTrack() {
  const ldJson = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of ldJson) {
    try {
      const data = JSON.parse(script.textContent);
      const recording = extractFromLdJson(data);
      if (recording?.track) return recording;
    } catch {
      continue;
    }
  }

  const trackTitle = document.querySelector("h2.trackTitle");
  if (trackTitle) {
    return {
      track: cleanTrackName(trackTitle.textContent.trim()),
      artist: getArtistFromDom(),
      album: getAlbumFromDom(),
    };
  }

  const ogTitle = getMeta("og:title");
  if (ogTitle) {
    const parsed = parseOgTitle(ogTitle);
    return {
      track: cleanTrackName(parsed.track),
      artist: parsed.artist || getArtistFromDom() || getMeta("og:site_name"),
      album: null,
    };
  }

  return null;
}

function extractFromLdJson(data) {
  if (Array.isArray(data)) {
    for (const item of data) {
      const result = extractFromLdJson(item);
      if (result?.track) return result;
    }
    return null;
  }

  if (data["@graph"]) {
    return extractFromLdJson(data["@graph"]);
  }

  if (data["@type"] === "MusicRecording") {
    return {
      track: data.name,
      artist: data.byArtist?.name || null,
      album: data.inAlbum?.name || null,
    };
  }

  if (data["@type"] === "MusicAlbum") {
    const playing = getPlayingTrackFromAlbum();
    if (playing) return playing;
    return {
      track: null,
      artist: data.byArtist?.name || null,
      album: data.name,
    };
  }

  return null;
}

function getPlayingTrackFromAlbum() {
  const playing =
    document.querySelector(".track_list .playing .track-title") ||
    document.querySelector(".track_list .playing td.title span");
  if (!playing) return null;

  return {
    track: cleanTrackName(playing.textContent.trim()),
    artist: getArtistFromDom(),
    album: document.querySelector("h2.trackTitle")?.textContent.trim() || null,
  };
}

function getArtistFromDom() {
  const selectors = [
    '[itemprop="byArtist"] a',
    '[itemprop="byArtist"]',
    'span.artist a',
    '#band-name-location .title',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const text = el?.textContent.trim();
    if (text) return text;
  }
  return getMeta("artist") || getMeta("og:site_name") || null;
}

function getAlbumFromDom() {
  const selectors = [
    '[itemprop="inAlbum"] a',
    '[itemprop="inAlbum"]',
    'span.fromAlbum a',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const text = el?.textContent.trim();
    if (text) return text;
  }
  return null;
}

function getMeta(name) {
  return (
    document.querySelector(`meta[property="${name}"]`)?.content ||
    document.querySelector(`meta[name="${name}"]`)?.content ||
    null
  );
}

function parseOgTitle(title) {
  const byMatch = title.match(/^(.+?),?\s+by\s+(.+)$/i);
  if (byMatch) {
    return { track: byMatch[1].trim(), artist: byMatch[2].trim() };
  }
  const pipeMatch = title.match(/^(.+?)\s*\|\s*(.+)$/);
  if (pipeMatch) {
    return { track: pipeMatch[1].trim(), artist: pipeMatch[2].trim() };
  }
  return { track: title, artist: null };
}

function cleanTrackName(name) {
  return name
    .replace(/^[A-Z]?\d+[\.\)\-]\s*/i, "")
    .trim();
}
