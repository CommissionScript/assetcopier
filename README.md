# Roblox Profile Webhook Website

Run the website locally:

Create a `.env` file first:

```text
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook-id/your-webhook-token
TARGET_LINE_KEYWORD=the text that identifies the line to embed
```

```powershell
npm start
```

Then open:

```text
http://localhost:3000
```

You can also double-click `start-local.bat` from this folder.

If port `3000` is already in use, run it on another port:

```powershell
$env:PORT=3001; npm start
```

Then open `http://localhost:3001`.
