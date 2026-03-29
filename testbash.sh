export FIREBASE_CREDS='{
  "type": "service_account"
}'
cat > test.env <<INNEREOF
FIREBASE_CREDENTIALS_JSON='$(echo "$FIREBASE_CREDS" | tr -d '\n')'
INNEREOF
cat test.env
