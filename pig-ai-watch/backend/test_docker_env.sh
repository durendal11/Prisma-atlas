mkdir -p test_dt && cd test_dt
cat << 'ENVEQF' > .env
TEST='{"a":1}'
ENVEQF
cat << 'DC' > docker-compose.yml
services:
  test:
    image: alpine
    env_file: .env
    command: /bin/sh -c 'echo test=$$TEST'
DC
docker compose up
