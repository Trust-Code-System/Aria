const DEFAULT_APP_URL = "https://aria-vert-chi.vercel.app";
const input = document.getElementById("appUrl");
const status = document.getElementById("status");

chrome.storage.sync.get({ appUrl: DEFAULT_APP_URL }, (data) => {
  input.value = data.appUrl || DEFAULT_APP_URL;
});

document.getElementById("save").addEventListener("click", () => {
  const value = input.value.trim().replace(/\/$/, "") || DEFAULT_APP_URL;
  chrome.storage.sync.set({ appUrl: value }, () => {
    status.textContent = "Saved. Reopen the side panel to apply.";
  });
});
