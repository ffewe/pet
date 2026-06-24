# Desktop Pet Pixel Preview

Phase 1 of the desktop pet project: upload an image, generate a single pixel-style preview with OpenAI, then export it as a PNG.

## Setup

1. Install dependencies:

```powershell
npm install
```

2. Start the Electron app:

```powershell
npm start
```

## Notes

- The app stores `app-config.json` in Electron's user data directory.
- The default `Provider Mode` is `Local Pixel`, which generates a deterministic pixel-art style preview on-device and does not require API billing.
- `Remote OpenAI Images` targets providers that support OpenAI-style image endpoints.
- `Remote Chat Compat` is a best-effort path for providers that expose image-capable models through `chat/completions`.
- In `Remote OpenAI Images`, you can switch between `images/edits` and `images/generations` to test provider compatibility.
- Generated previews are stored in the app user data `generated` folder until exported.
