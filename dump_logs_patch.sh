cat << 'PATCH' > logs_deploy.patch
--- .github/workflows/deploy.yml
+++ .github/workflows/deploy.yml
@@ -176,6 +176,14 @@
             # ── clean up dangling images ──────────────────────────
             docker image prune -f
 
+            echo "=========================================================="
+            echo "BACKEND CONTAINER LOGS:"
+            docker logs pig-ai-watch-backend --tail 100 || true
+            echo "=========================================================="
+            echo "DATABASE CONTAINER LOGS:"
+            docker logs pig-ai-watch-db --tail 100 || true
+            echo "=========================================================="
+
             echo "✅ Deployment complete — \$(date -u)"
PATCH
patch -p0 < logs_deploy.patch
