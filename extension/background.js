/**
 * Aria Chrome extension — opens the side panel on toolbar click (Gemini-style).
 */
const DEFAULT_APP_URL = "https://aria-vert-chi.vercel.app";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch {
    /* older Chrome — behavior flag may already open the panel */
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_APP_URL") {
    chrome.storage.sync.get({ appUrl: DEFAULT_APP_URL }, (data) => {
      sendResponse({ appUrl: data.appUrl || DEFAULT_APP_URL });
    });
    return true;
  }
  return false;
});
