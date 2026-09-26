# Production Deployment Guide

## Quick Deploy

SSH to VPS and run:

```bash
ssh root@bob133.mikrus.xyz -p 10133
bash /opt/car_videos/deploy.sh
```

That's it! The script will:
1. ✅ Pull latest `serwis` branch from GitHub (using stored PAT)
2. ✅ Rebuild all Docker containers (no-cache for fresh builds)
3. ✅ Restart services (web, api, postgres)
4. ✅ Verify API health
5. ✅ Show deployment status

## Output

After completion, you'll see:

```
[HH:MM:SS] ✅ Deployment completed successfully!
Access the application at:
  - Hub: https://bob133-20133.wykr.es/hub
  - Service: https://bob133-20133.wykr.es/service
  - API: https://bob133-30133.wykr.es/api/v1/service
```

## If Deployment Fails

Check logs:
```bash
ssh root@bob133.mikrus.xyz -p 10133
cd /opt/car_videos
docker compose -f docker-compose.mikrus.yml logs --tail=50
```

## Security Notes

- GitHub PAT stored in `/opt/car_videos/.github_pat` (chmod 600)
- **ACTION REQUIRED:** Rotate the PAT after testing!
  1. Go to https://github.com/settings/tokens
  2. Delete old token (github_pat_11AXDTKFQ0...)
  3. Create new Personal Access Token with `repo` scope
  4. Update VPS: `echo "new_token_here" > /opt/car_videos/.github_pat`

## Manual Rebuild (if needed)

```bash
cd /opt/car_videos
git checkout serwis
git pull origin serwis
docker compose -f docker-compose.mikrus.yml down
docker compose -f docker-compose.mikrus.yml build --no-cache
docker compose -f docker-compose.mikrus.yml up -d
```

## Current Branch

Deployment always pulls from `main` branch (production-ready code). 

**Branch strategy:**
- `serwis` — development branch (features, fixes in progress)
- `main` — production-ready, merged from `serwis`
- When ready to deploy: merge `serwis` → `main`, then run `bash /opt/car_videos/deploy.sh`

To deploy from a different branch, edit `/opt/car_videos/deploy.sh` line ~11:

```bash
BRANCH="main"  # <- change to desired branch (e.g. "serwis" for testing)
```

## Common Issues

**Issue:** "Failed to clone repository"
- Check GitHub PAT is valid: `cat /opt/car_videos/.github_pat`
- Check internet connectivity: `curl -I https://github.com`

**Issue:** "Docker build fails"
- Check disk space: `df -h /`
- Check Docker is running: `docker ps`
- Review full logs: `docker compose -f docker-compose.mikrus.yml logs api`

**Issue:** "API not responding after deploy"
- Wait 30-60 seconds for PostgreSQL to initialize
- Check container status: `docker compose -f docker-compose.mikrus.yml ps`
- Restart if needed: `docker compose -f docker-compose.mikrus.yml restart`

## Next Steps

1. Test deployment by making a small change locally
   - Edit a file on `serwis` branch
   - `git push origin serwis`
   - Run `bash /opt/car_videos/deploy.sh`
   - Verify changes appear in production

2. Rotate GitHub PAT (security)

3. Consider adding webhook for auto-deployment on push (advanced)
