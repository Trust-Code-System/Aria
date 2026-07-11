const DEFAULT_APP_URL = "https://aria-vert-chi.vercel.app";

const frame = document.getElementById("frame");
const boot = document.getElementById("boot");
const btnChat = document.getElementById("btn-chat");
const btnConnections = document.getElementById("btn-connections");
const btnOpen = document.getElementById("btn-open");
const btnSettings = document.getElementById("btn-settings");

let appUrl = DEFAULT_APP_URL;
let path = "/chat";

async function loadAppUrl() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ appUrl: DEFAULT_APP_URL }, (data) => {
      appUrl = (data.appUrl || DEFAULT_APP_URL).replace(/\/$/, "");
      resolve(appUrl);
    });
  });
}

function navigate(nextPath) {
  path = nextPath;
  boot.classList.remove("hidden");
  frame.src = `${appUrl}${path}`;
  btnChat.classList.toggle("active", path.startsWith("/chat"));
  btnConnections.classList.toggle("active", path.startsWith("/connections"));
}

frame.addEventListener("load", () => {
  boot.classList.add("hidden");
});

btnChat.addEventListener("click", () => navigate("/chat"));
btnConnections.addEventListener("click", () => navigate("/connections"));
btnOpen.addEventListener("click", () => {
  chrome.tabs.create({ url: `${appUrl}${path}` });
});
btnSettings.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

await loadAppUrl();
navigate("/chat");
