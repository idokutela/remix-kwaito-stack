/**
 * This script looks in ~/db for up and down schema definitions.
 * It migrates the database from its current version to the target version.
 * If asked to, it also seeds the database into the given version.
 *
 * One specifies schemata with the following files:
 * <version>.up.sql - this is executed to move from <version - 1> to <version>
 * <version>.down.sql - this is executed to move from <version> to <version - 1>
 */

import { promises as fs } from "fs";
import { join } from "path";
import { Client } from "pg";
import invariant from "tiny-invariant";
import * as dotenv from "dotenv";

type Migration = {
  up: string;
  down: string;
};

run();

async function run() {
  const target = getTarget();
  const client = getClient();
  await client.connect();
  const migrations = await readMigrationFiles("./db");
  console.log(`Migration files read. ${migrations.length} versions available.`);
  await applyMigrations(client, migrations, target);
  client.end();
  console.log("Success.");
}

function getTarget() {
  const numTargets = process.argv
    .filter((f) => /^\d+$/.test(f))
    .map((f) => Number.parseInt(f));
  return numTargets[numTargets.length - 1];
}

function getDatabaseUrl() {
  let { DATABASE_URL } = process.env;
  if (typeof DATABASE_URL !== "string") {
    dotenv.config();
    ({ DATABASE_URL } = process.env);
  }
  invariant(typeof DATABASE_URL === "string", "DATABASE_URL env var not set");
  return DATABASE_URL;
}

function getClient() {
  const DATABASE_URL = getDatabaseUrl();
  const databaseUrl = new URL(DATABASE_URL);

  const isLocalHost = databaseUrl.hostname === "localhost";

  const PRIMARY_REGION = isLocalHost ? null : process.env.PRIMARY_REGION;
  const FLY_REGION = isLocalHost ? null : process.env.FLY_REGION;

  const isReadReplicaRegion = !PRIMARY_REGION || PRIMARY_REGION === FLY_REGION;

  if (!isLocalHost) {
    if (databaseUrl.host.endsWith(".internal")) {
      databaseUrl.host = `${FLY_REGION}.${databaseUrl.host}`;
    }

    if (!isReadReplicaRegion) {
      // 5433 is the read-replica port
      databaseUrl.port = "5433";
    }
  }

  const client = new Client({
    connectionString: databaseUrl.toString(),
  });

  return client;
}

function readSingleMigration(directory: string) {
  return async function readSingleMigrationStep(file: string) {
    if (!file.includes(".up.")) {
      return null;
    }
    const migrationNumberStr = file.match(/^(\d+)\.up\.sql/)?.[1];
    if (!migrationNumberStr) return null;
    const migrationNumber = parseInt(migrationNumberStr);

    const upFile = join(directory, file);
    const downFile = join(directory, `${migrationNumberStr}.down.sql`);

    try {
      const [upContent, downContent] = await Promise.all([
        fs.readFile(upFile, "utf-8"),
        fs.readFile(downFile, "utf-8"),
      ]);
      return {
        index: migrationNumber,
        content: { up: upContent, down: downContent },
      };
    } catch (e) {
      throw new Error(
        `Error reading migrations at step ${migrationNumber}. Error: ${
          (e as Error).message
        }`
      );
    }
  };
}

async function applyMigrations(
  c: Client,
  m: Migration[],
  target: number = m.length - 1
) {
  if (target !== -1 && !m[target]) {
    throw new Error(`Cannot migrate to ${target}. Missing steps.`);
  }
  await ensureVersionsTable(c);
  const currentVersion = await getCurrentVersion(c);
  if (currentVersion !== -1 && !m[currentVersion]) {
    throw new Error(`Cannot migrate from ${currentVersion}. Missing steps.`);
  }
  console.log(`Migrating from ${currentVersion} to ${target}`);
  if (currentVersion <= target) {
    for (let step = currentVersion + 1; step < target; step++) {
      execStep(c, { step: m[step].up });
    }
    return;
  }
  for (let step = currentVersion; target < step; step--) {
    execStep(c, { step: m[step].down, down: true });
  }
}

// Reads the migrations
async function readMigrationFiles(directory: string): Promise<Migration[]> {
  const filesWithIndices = (
    await Promise.all(
      (await fs.readdir(directory)).map(readSingleMigration(directory))
    )
  ).filter((f) => f !== null) as { index: number; content: Migration }[];
  filesWithIndices.sort((f, g) => f.index - g.index);
  const migrations: Migration[] = [];
  for (const { index, content } of filesWithIndices) {
    if (migrations[index]) {
      throw new Error(`Multiple migrations at step ${index}.`);
    }
    migrations[index] = content;
  }
  migrations.forEach((m, i) => {
    if (!m) {
      throw new Error(`Missing migration at step ${i}.`);
    }
  });
  return migrations;
}

async function ensureVersionsTable(c: Client) {
  await c.query(`
    CREATE TABLE IF NOT EXISTS __schema_version (
        id integer PRIMARY KEY,
        version integer NOT NULL
    )`);

  await c.query(`
  INSERT INTO __schema_version (id, version)
  SELECT 0, -1
  WHERE
  NOT EXISTS (
    SELECT id FROM __schema_version WHERE id = 0
  )
  `);
}

async function getCurrentVersion(c: Client) {
  const {
    rows: [result],
  } = await c.query(`
    SELECT version FROM __schema_version WHERE id = 0;
    `);
  if (!result) {
    return -1;
  }
  return result.version as number;
}

async function up(c: Client) {
  await c.query(
    `
        INSERT INTO __schema_version SET version = version + 1 WHERE id = 0;`
  );
}

async function down(c: Client) {
  await c.query(
    `
        INSERT INTO __schema_version SET version = version - 1 WHERE id = 0;`
  );
}

async function execStep(
  c: Client,
  { step, down: goDown = false }: { step: string; down?: boolean }
) {
  await c.query("BEGIN");
  await c.query(step);
  if (goDown) {
    down(c);
  } else {
    await up(c);
  }
  await c.query("END");
}
