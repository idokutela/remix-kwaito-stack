import invariant from "tiny-invariant";
import * as dotenv from "dotenv";
import { Client } from "pg";

function getDatabaseUrl() {
  let { DATABASE_URL } = process.env;
  if (typeof DATABASE_URL !== "string") {
    dotenv.config();
    ({ DATABASE_URL } = process.env);
  }
  invariant(typeof DATABASE_URL === "string", "DATABASE_URL env var not set");
  return DATABASE_URL;
}

export default function getClient() {
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

  