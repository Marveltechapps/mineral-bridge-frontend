# Dev networking (fast loop: Expo Go + emulator)

This project supports a fast development loop without waiting for cloud APK builds:

- Real phone over Wi‑Fi: use an **HTTPS tunnel** for the API
- Android emulator: use the emulator host alias **`10.0.2.2`**

## Real phone over Wi‑Fi (recommended: HTTPS tunnel)

1) Start your backend on port `5000`.

2) Start an HTTPS tunnel:

```powershell
ngrok http 5000
```

3) Copy the tunnel URL (it will look like `https://xxxx.ngrok-free.app`).

4) Set it as your API base (in `frontend/.env`):

```
EXPO_PUBLIC_API_BASE_URL=https://xxxx.ngrok-free.app
```

5) Start Expo and scan the QR code with **Expo Go**.

## Android emulator (fastest)

If your backend runs on your dev machine at `http://localhost:5000`, then from the Android emulator the API base must be:

- `http://10.0.2.2:5000`

### Good news: this project auto-handles it

`frontend/lib/api.js` automatically rewrites **HTTP** API base URLs to `10.0.2.2` **only when running on an Android emulator**.

So you can keep `EXPO_PUBLIC_API_BASE_URL` pointing to your phone tunnel/LAN host, and the emulator will still work.

## Why APK builds are slow

EAS `preview`/APK builds are full native cloud builds and can take 20–40 minutes on the free queue. Use Expo Go (or a dev client) for daily iteration and reserve APK builds for milestone testing.

