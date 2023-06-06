import { Pool, type PoolClient } from "pg";

let pool: Promise<Pool>;

declare global {
  var __db__: Promise<Pool>;
}

if (process.env.NODE_ENV === "production") {
  pool = getPool();
} else {
  if (!global.__db__) {
    global.__db__ = getPool();
  }
  pool = global.__db__;
}

// this is needed because in development we don't want to restart
// the server with every change, but we want to make sure we don't
// create a new connection to the DB with every change either.
// in production we'll have a single connection to the DB.

async function getPool() {
  const { DATABASE_URL } = process.env;
  if (typeof DATABASE_URL !== "string") {
    throw new Error("DATABASE_URL env var not set");
  }

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

  console.log(`🔌 setting up postgres client to ${databaseUrl.host}`);
  // NOTE: during development if you change anything in this function, remember
  // that this only runs once per server restart and won't automatically be
  // re-run per request like everything else is. So if you need to change
  // something in this file, you'll need to manually restart the server.
  const client = new Pool({
    connectionString: databaseUrl.toString(),
  });
  // connect eagerly
  await client.connect();

  return client;
}

export { pool };

function sqlOfQuery(
  q: (s: string, params?: any[]) => Promise<{ rows: unknown[] }>
) {
  return async function sql(
    strings: TemplateStringsArray,
    ...params: any[]
  ): Promise<ReadonlyArray<unknown>> {
    let queryString = strings[0];
    for (let i = 1; i < strings.length; i++) {
      const part = strings[i];
      const param = `$${i}`;
      queryString = `${queryString}${param}${part}`;
    }

    const { rows } = await q(queryString, params);
    return rows;
  };
}

/**
 * Executes a one-shot query with a template literal.
 * Example:
 *     sql`SELECT * FROM foo WHERE id=${"Hello"}`
 */
export const sql = sqlOfQuery(async (p, str) => (await pool).query(p, str));

/**
 * Fetches a client from the pool and runs `f` on it.
 */
export async function withClient<T extends unknown>(
  f: (_: {
    client: PoolClient;
    sql: (
      strings: TemplateStringsArray,
      ...params: ReadonlyArray<unknown>
    ) => Promise<ReadonlyArray<unknown>>;
  }) => Promise<T>
): Promise<T> {
  const client = await (await pool).connect();
  const sql = sqlOfQuery((p, str) => client.query(p, str));
  try {
    const res = await f({ client, sql });
    console.log("Done with query");
    return res;
  } finally {
    console.log("Releasing");
    client.release();
  }
}
