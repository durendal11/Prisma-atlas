# 🤖 Setting Up AI Briefings (Gemini API)

The AI Morning Briefing feature requires a Google Gemini API key.

## Quick Setup Guide

### 1. Get Your Gemini API Key (Free)

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Get API Key"** or **"Create API Key"**
4. Copy the key (starts with `AIza...`)

> **Note:** Gemini API has a generous free tier. The briefing feature uses very few tokens.

---

### 2. Add to GitHub Secrets

1. Go to your GitHub repository
2. Navigate to: **Settings → Secrets and variables → Actions**
3. Click **"New repository secret"**
4. Name: `GEMINI_API_KEY`
5. Value: Paste your API key
6. Click **"Add secret"**

---

### 3. Deploy

Once the secret is added, push your code:

```bash
git push origin main
```

The deployment will automatically:
- Write `GEMINI_API_KEY` to the `.env` file on the server
- Enable AI Morning Briefing
- Enable veterinary advisories

---

### 4. Verify It Works

After deployment completes (5-10 minutes):

1. Go to your app's **Dashboard** page
2. Click **"AI Morning Briefing"** tab
3. Select a time period (Last 24 Hours, 7 Days, or 30 Days)
4. Click **"Regenerate"**

You should see an AI-generated briefing instead of "LLM not configured".

---

## Manual Setup (Alternative)

If you want to test locally or set it up manually on the server:

### Local Development

```bash
# In pig-ai-watch/.env
GEMINI_API_KEY=your-key-here
```

Then restart your docker containers:
```bash
docker compose restart backend
```

### Production (Manual)

SSH into your server and edit the `.env` file:

```bash
ssh root@YOUR_DROPLET_IP
cd /opt/prisma-atlas/pig-ai-watch
nano .env
```

Add this line:
```
GEMINI_API_KEY=your-key-here
```

Save and restart:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart backend
```

---

## Troubleshooting

### "LLM not configured" still showing?

1. Check GitHub secret is named exactly `GEMINI_API_KEY` (case-sensitive)
2. Verify deployment completed successfully
3. Check backend logs:
   ```bash
   docker logs pig-ai-watch-backend --tail 50 | grep -i gemini
   ```
4. Should see: `"Gemini AI model configured successfully."`

### Backend logs show "GEMINI_API_KEY not found"?

The `.env` file on the server doesn't have the key. Either:
- Redeploy after adding GitHub secret, OR
- Add it manually (see "Manual Setup" above)

---

## What Uses the Gemini API?

1. **AI Morning Briefing** - Daily farm performance summary
2. **Pen Advisories** - Real-time veterinary recommendations based on behavior data
3. **Health Insights** - AI-generated health assessments

All features use the lightweight `gemini-2.5-flash` model for fast, cost-effective inference.
