# Install Aria on desktop + Chrome (Gemini-style)

## 1. Desktop app (PWA)

After the latest deploy is live:

### Chrome / Edge (Windows, Mac, Linux)
1. Open https://aria-vert-chi.vercel.app/chat and sign in once.
2. Click the **install icon** in the address bar (or use the in-app **Install Aria** banner).
3. Confirm **Install**.
4. Aria opens in its own window and gets a Start Menu / Dock / desktop shortcut.

### Alternative (Chrome menu)
**⋮ → Cast, save, and share → Install page as app**

### Uninstall
Chrome → `chrome://apps` → right-click Aria → Remove  
or Windows Settings → Apps → Aria → Uninstall.

---

## 2. Chrome side-panel extension (Ask Aria)

The extension lives in `/extension` and opens Aria in a **side panel**, similar to Ask Gemini.

### Load unpacked (dev / personal use)
1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this repo’s `extension` folder  
   (`…/Ai agent/extension`)
4. Pin **Aria** on the toolbar
5. Click the icon (or press **Alt+A**) → side panel opens with chat

### Settings
Right-click the extension → **Options** → set your app URL:

- Production: `https://aria-vert-chi.vercel.app`
- Local: `http://localhost:3000`

### What you get
- Toolbar button → side panel (Gemini-like)
- Shortcuts: Chat / Apps (Connections) / open full tab
- Keyboard: **Alt+A**

> Chrome’s built-in Gemini button slot is reserved by Google. Aria ships as **its own** extension icon — same side-panel pattern, different brand.

---

## 3. Publish later (optional)
- **Chrome Web Store**: zip the `extension` folder and submit
- **Desktop store**: PWA is enough for most users; Electron/Tauri only if you need deeper OS hooks
