# 🔧 Authentication Fix - Production Deployment

## Problem
The admin user was never seeded on the production server. The CI/CD pipeline runs migrations but not the seed script.

## Quick Fix (Run on your DigitalOcean server)

### 1. First, copy the diagnostic script to the server
```bash
# On your local machine:
scp pig-ai-watch/backend/check_auth.py root@YOUR_DROPLET_IP:/opt/prisma-atlas/pig-ai-watch/
```

### 2. SSH into your server
```bash
ssh root@YOUR_DROPLET_IP
cd /opt/prisma-atlas/pig-ai-watch
```

### 3. Check current auth setup
```bash
docker exec pig-ai-watch-backend python check_auth.py
```

### 4. Seed the admin user
```bash
docker compose --profile seed up seed
```

Expected output:
```
✅ Admin user created!
   Username: admin
   Password: admin123
```

### 5. Verify the fix
```bash
docker exec pig-ai-watch-backend python check_auth.py
```

### 6. Test login from the server
```bash
curl -i -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin123"
```

Expected: `HTTP/1.1 200 OK` with a JSON response containing `access_token`

### 7. Test from your browser
Go to your app and try logging in with:
- Username: `admin`
- Password: `admin123`

---

## Permanent Fix (Update CI/CD Pipeline)

Add the seed step to `.github/workflows/deploy.yml` after line 312:

```yaml
# ── rolling restart (zero-downtime for stateless services) ─
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  up -d --remove-orphans

# ── seed the database on first deployment ────────────────
docker compose --profile seed up seed || echo "⚠️ Seed failed (may already exist)"

# ── clean up dangling images ──────────────────────────────
docker image prune -f
```

This ensures the admin user is created on every deployment (the script handles duplicate prevention).

---

## Default Credentials

**⚠️ Change these after first login!**

- Username: `admin`
- Password: `admin123`
- Email: `admin@pigaiwatch.com`

---

## Troubleshooting

### If you still get 401 after seeding:

1. Check the SECRET_KEY matches in production:
```bash
docker exec pig-ai-watch-backend printenv SECRET_KEY
```

2. Check the .env file on the server:
```bash
cat /opt/prisma-atlas/pig-ai-watch/.env
```

3. Restart the backend to reload environment:
```bash
docker compose restart backend
```

4. Check backend logs:
```bash
docker logs pig-ai-watch-backend --tail 50
```
