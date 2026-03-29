mkdir dc_test && cd dc_test
cat << 'DC' > docker-compose.yml
services:
  test:
    image: alpine:latest
    env_file: .env
    command: /bin/sh -c 'if [ "$$VAL" = "{\"a\":1}" ]; then echo "STRIPPED"; else echo "NOT_STRIPPED: $$VAL"; fi'
DC
cat << 'ENVEQF' > .env
VAL='{"a":1}'
ENVEQF
# Simulate docker compose logic without docker daemon if possible, or we just trust the docs.
# But there is no docker daemon.
