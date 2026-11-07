import type { DatabaseDriverKind } from "./driver.js";
import { PostgresDriver } from "./postgres-driver.js";
import { UserRepository } from "./repository.js";
import { SqliteDriver } from "./sqlite-driver.js";
import {
  resolveDatabaseConfig,
  type DatabaseConfig,
  type ResolveDatabaseConfigOptions,
} from "./path.js";

export type { DatabaseDriverKind, SqlDriver } from "./driver.js";
export { UserRepository } from "./repository.js";
export {
  PROD_DATABASE_PATH,
  PROD_DATA_DIR,
  inspectDatabasePersistence,
  resolveAvatarDir,
  resolveDatabaseConfig,
  resolveDatabasePath,
  type DatabaseConfig,
  type DatabasePersistenceInfo,
  type ResolveDatabaseConfigOptions,
  type ResolveDatabasePathOptions,
} from "./path.js";

export interface CreateUserRepositoryOptions
  extends ResolveDatabaseConfigOptions {
  /**
   * Explicit SQLite path (legacy sync helper). Prefer resolveDatabaseConfig /
   * createUserRepository() with env so DATABASE_URL is honored.
   */
  databasePath?: string;
}

export interface OpenedDatabase {
  users: UserRepository;
  config: DatabaseConfig;
  driver: DatabaseDriverKind;
}

/**
 * Open the shared DB. Prefers `DATABASE_URL` (Postgres); otherwise SQLite
 * via `DATABASE_PATH` / production `/data/gamebot.sqlite`.
 */
export async function createUserRepository(
  options: CreateUserRepositoryOptions | string = {},
): Promise<UserRepository> {
  const opened = await openDatabase(
    typeof options === "string"
      ? { databasePath: options, envPath: options }
      : options,
  );
  return opened.users;
}

/**
 * Same as createUserRepository but also returns which driver/path was chosen
 * (for healthz / boot logs — never logs the Postgres URL).
 */
export async function openDatabase(
  options: CreateUserRepositoryOptions = {},
): Promise<OpenedDatabase> {
  const config = resolveDatabaseConfig({
    env: options.env,
    envPath: options.envPath ?? options.databasePath,
    databaseUrl: options.databaseUrl,
    localFallback: options.localFallback,
  });

  let driver;
  if (config.driver === "postgres") {
    if (!config.databaseUrl) {
      throw new Error("DATABASE_URL required for postgres driver");
    }
    driver = new PostgresDriver(config.databaseUrl);
  } else {
    if (!config.databasePath) {
      throw new Error("DATABASE_PATH required for sqlite driver");
    }
    driver = new SqliteDriver(config.databasePath);
  }

  const users = new UserRepository(driver);
  await users.migrate();
  return { users, config, driver: config.driver };
}
