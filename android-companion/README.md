Rafi AI Android Companion

This companion polls the Rafi AI /api/device endpoint and executes only the allowlisted device commands queued by the server.

Supported commands:
- home
- back
- recents
- notifications
- open_app
- open_url

Setup:
1. Build the debug APK with the repository GitHub Actions workflow.
2. In Vercel, set DEVICE_TOKEN to a long random secret.
3. In the companion, enter the Rafi AI Vercel URL and the same token.
4. Install the APK on the Android phone.
5. Explicitly enable Rafi AI Companion in Android Accessibility settings.
6. Keep the companion service enabled while phone control is needed.

Android requires the user to explicitly enable an accessibility service in device settings.
