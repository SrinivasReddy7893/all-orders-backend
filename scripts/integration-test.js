// Runs the HTTP integration tests (test/**/*.itest.ts) against a separate
// database "<your db>_test". Your development database is never touched.
// Non-destructive setup: creates the test database if missing and applies
// migrations; the tests empty their own tables (only in a *_test database).
require("dotenv").config({ quiet: true });
const { spawnSync } = require("child_process");
const { Client } = require("pg");

const devUrl = new URL(process.env.DATABASE_URL);
const testDb = `${devUrl.pathname.replace(/^\//, "")}_test`;
const testUrl = new URL(devUrl);
testUrl.pathname = `/${testDb}`;

const env = { ...process.env, DATABASE_URL: testUrl.toString(), NODE_ENV: "test" };
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: "inherit", env });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

(async () => {
  const admin = new Client({ connectionString: devUrl.toString() });
  await admin.connect();
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [testDb]);
  if (!rowCount) {
    console.log(`Creating test database ${testDb} …`);
    await admin.query(`CREATE DATABASE "${testDb.replace(/"/g, "")}"`);
  }
  await admin.end();

  run("npx", ["prisma", "migrate", "deploy"]);
  run("node", ["--require", "ts-node/register/transpile-only", "--test", "--test-concurrency=1", "test/**/*.itest.ts"]);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
