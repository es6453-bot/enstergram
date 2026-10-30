/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  createClient,
  type Client,
  type InValue,
  type ResultSet,
} from "@libsql/client";
export type GameRow = Record<string, any>;
export interface GameStatement {
  readonly sql: string;
  readonly args: InValue[];
  bind(...values: InValue[]): GameStatement;
  first(): Promise<GameRow | null>;
  all(): Promise<{ results: GameRow[] }>;
  run(): Promise<{ changes: number }>;
}
export interface GameDatabase {
  prepare(sql: string): GameStatement;
  batch(statements: GameStatement[]): Promise<unknown[]>;
}
const rows = (result: ResultSet): GameRow[] =>
  result.rows.map((row) =>
    Object.fromEntries(result.columns.map((name, i) => [name, row[i]])),
  );
export function adaptClient(client: Client): GameDatabase {
  return {
    prepare(sql) {
      const statement: GameStatement = {
        sql,
        args: [],
        bind(...values) {
          return { ...this, args: values };
        },
        async first() {
          return (
            rows(await client.execute({ sql: this.sql, args: this.args }))[0] ||
            null
          );
        },
        async all() {
          return {
            results: rows(
              await client.execute({ sql: this.sql, args: this.args }),
            ),
          };
        },
        async run() {
          return {
            changes: (await client.execute({ sql: this.sql, args: this.args }))
              .rowsAffected,
          };
        },
      };
      return statement;
    },
    async batch(statements) {
      if (!statements.length) return [];
      // Write batches use BEGIN IMMEDIATE and roll back the entire transaction.
      return client.batch(
        statements.map((s) => ({ sql: s.sql, args: s.args })),
        "write",
      );
    },
  };
}
let cached: { client: Client; database: GameDatabase } | undefined;
export function databaseClient() {
  if (cached) return cached.client;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("The game database has not been configured.");
  if (
    process.env.VERCEL &&
    (!/^libsql:\/\//.test(url) || !process.env.TURSO_AUTH_TOKEN)
  )
    throw new Error(
      "Vercel requires a remote libSQL database and authentication token.",
    );
  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
    intMode: "number",
  });
  cached = { client, database: adaptClient(client) };
  return client;
}
export function database() {
  databaseClient();
  return cached!.database;
}
