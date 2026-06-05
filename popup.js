const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const loggedOutSection = document.getElementById("logged-out");
const loggedInSection = document.getElementById("logged-in");
const playlistSelect = document.getElementById("playlist-select");
const loginError = document.getElementById("login-error");

loginBtn.addEventListener("click", async () => {
  loginBtn.disabled = true;
  loginBtn.textContent = "Connecting...";
  loginError.classList.add("hidden");

  chrome.runtime.sendMessage({ action: "login" }, (response) => {
    loginBtn.disabled = false;
    loginBtn.textContent = "Login to Spotify";

    if (response?.ok) {
      showLoggedIn();
      loadPlaylists();
    } else {
      loginError.textContent = response?.error || "Login failed";
      loginError.classList.remove("hidden");
    }
  });
});

logoutBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "logout" }, () => {
    showLoggedOut();
  });
});

playlistSelect.addEventListener("change", () => {
  const playlistId = playlistSelect.value;
  if (playlistId) {
    chrome.runtime.sendMessage({ action: "setTargetPlaylist", playlistId });
  }
});

function showLoggedIn() {
  loggedOutSection.classList.add("hidden");
  loggedInSection.classList.remove("hidden");
}

function showLoggedOut() {
  loggedOutSection.classList.remove("hidden");
  loggedInSection.classList.add("hidden");
  playlistSelect.innerHTML = '<option value="">Loading playlists...</option>';
  playlistSelect.disabled = true;
}

function loadPlaylists() {
  playlistSelect.innerHTML = '<option value="">Loading playlists...</option>';
  playlistSelect.disabled = true;

  chrome.runtime.sendMessage({ action: "getPlaylists" }, (response) => {
    if (!response || response.error) {
      playlistSelect.innerHTML = `<option value="">Error: ${response?.error || "No response"}</option>`;
      return;
    }

    chrome.storage.local.get("targetPlaylistId", ({ targetPlaylistId }) => {
      playlistSelect.innerHTML = '<option value="">Select a playlist...</option>';

      for (const p of response.playlists) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.id === targetPlaylistId) opt.selected = true;
        playlistSelect.appendChild(opt);
      }

      playlistSelect.disabled = false;
    });
  });
}

chrome.storage.local.get("accessToken", (result) => {
  if (result.accessToken) {
    showLoggedIn();
    loadPlaylists();
  } else {
    showLoggedOut();
  }
});
