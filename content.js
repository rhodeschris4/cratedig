(() => {
  if (!chrome.runtime?.id) return;

  document.getElementById("bcf-overlay")?.remove();

  let selectedTrack = null;

  const overlay = document.createElement("div");
  overlay.id = "bcf-overlay";
  overlay.innerHTML = `
    <button id="bcf-btn" title="CrateDig">&#9835;</button>
    <div id="bcf-panel" class="bcf-hidden">
      <div id="bcf-track-info"></div>
      <div id="bcf-results"></div>
      <button id="bcf-add" class="bcf-hidden">Add to Playlist</button>
      <div id="bcf-status"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const btn = document.getElementById("bcf-btn");
  const panel = document.getElementById("bcf-panel");
  const trackInfo = document.getElementById("bcf-track-info");
  const resultsDiv = document.getElementById("bcf-results");
  const addBtn = document.getElementById("bcf-add");
  const statusEl = document.getElementById("bcf-status");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.toggle("bcf-hidden");
    if (!panel.classList.contains("bcf-hidden")) {
      doSearch();
    }
  });

  panel.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("click", () => {
    panel.classList.add("bcf-hidden");
  });

  addBtn.addEventListener("click", () => {
    if (!selectedTrack) return;
    addBtn.disabled = true;
    addBtn.textContent = "Adding...";
    setStatus("");

    sendMsg(
      { action: "addToPlaylist", trackUri: selectedTrack.uri },
      (response) => {
        addBtn.disabled = false;
        if (chrome.runtime?.lastError) {
          setStatus(chrome.runtime.lastError.message, "bcf-error");
          return;
        }
        if (!response) {
          setStatus("No response from extension", "bcf-error");
          return;
        }
        if (response.added) {
          addBtn.classList.add("bcf-hidden");
          setStatus("Added to playlist!", "bcf-success");
        } else if (response.duplicate) {
          addBtn.classList.add("bcf-hidden");
          setStatus("Already in playlist.", "bcf-warn");
        } else {
          setStatus(response.error || "Failed to add", "bcf-error");
          addBtn.textContent = "Add to Playlist";
        }
      }
    );
  });

  function sendMsg(msg, cb) {
    if (!chrome.runtime?.id) {
      setStatus("Extension was reloaded — refresh this page", "bcf-error");
      return;
    }
    chrome.runtime.sendMessage(msg, cb);
  }

  function doSearch() {
    selectedTrack = null;
    resultsDiv.innerHTML = "";
    addBtn.classList.add("bcf-hidden");
    setStatus("");

    const data = scrapeCurrentTrack();
    if (!data || !data.track) {
      trackInfo.textContent = "No track detected on this page.";
      return;
    }

    trackInfo.textContent = `${data.track} — ${data.artist || "Unknown Artist"}`;
    setStatus("Searching Spotify...");

    sendMsg(
      { action: "searchSpotify", track: data.track, artist: data.artist || "" },
      (response) => {
        if (chrome.runtime?.lastError) {
          setStatus(chrome.runtime.lastError.message, "bcf-error");
          return;
        }
        if (!response) {
          setStatus("No response from extension", "bcf-error");
          return;
        }
        if (response.error) {
          setStatus(response.error, "bcf-error");
          return;
        }
        if (!response.found) {
          showNotFound(data);
          return;
        }
        if (response.confident) {
          selectTrack(response.tracks[0]);
          setStatus("");
        } else {
          showResultsList(response.tracks);
        }
      }
    );
  }

  function selectTrack(track) {
    selectedTrack = track;
    resultsDiv.innerHTML = `
      <div class="bcf-match">
        <div class="bcf-match-name">${esc(track.name)}</div>
        <div class="bcf-match-detail">${esc(track.artist)} · ${esc(track.album)}</div>
      </div>
    `;
    addBtn.textContent = "Add to Playlist";
    addBtn.disabled = false;
    addBtn.classList.remove("bcf-hidden");
  }

  function showResultsList(tracks) {
    setStatus("Multiple matches — pick one:");
    resultsDiv.innerHTML = tracks
      .map(
        (t, i) => `
      <button class="bcf-result-item" data-index="${i}">
        <span class="bcf-match-name">${esc(t.name)}</span>
        <span class="bcf-match-detail">${esc(t.artist)} · ${esc(t.album)}</span>
      </button>`
      )
      .join("");

    resultsDiv.querySelectorAll(".bcf-result-item").forEach((el) => {
      el.addEventListener("click", () => {
        const track = tracks[parseInt(el.dataset.index)];
        selectTrack(track);
        setStatus("");
      });
    });
  }

  function showNotFound(data) {
    setStatus("");
    const searchUrl = `https://open.spotify.com/search/${encodeURIComponent(
      (data.track || "") + " " + (data.artist || "")
    )}`;
    resultsDiv.innerHTML = `
      <div class="bcf-not-found">
        Not found on Spotify.
        <a href="${searchUrl}" target="_blank" rel="noopener">Search manually</a>
      </div>
    `;
    addBtn.classList.add("bcf-hidden");
  }

  function setStatus(msg, className) {
    statusEl.textContent = msg;
    statusEl.className = className || "";
  }

  function esc(str) {
    const el = document.createElement("span");
    el.textContent = str;
    return el.innerHTML;
  }
})();
