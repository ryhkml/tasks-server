set -e

bun -v 1>/dev/null
curl -V 1>/dev/null

cat .env.example > .env.development
echo ".env.development file has been created"

cat .env.example > .env.test
sed -i "s|9220|9320|" .env.test
sed -i "s|.database/tasks-dev.db|.database/tasks-test.db|" .env.test
echo ".env.test file has been created"

cat .env.example > .env.production
sed -i "s|9220|9420|" .env.production
sed -i "s|.database/tasks-dev.db|.database/tasks.db|" .env.production
echo ".env.production file has been created"

bun install --save-text-lockfile
bun --env-file=.env.development run init-db.ts

echo "Installation complete"
