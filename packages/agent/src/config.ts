import fs from 'fs';
import path from 'path';
import os from 'os';
import { parse, stringify } from 'toml';

/**
 * Default log level when none is specified.
 */
export const DEFAULT_LOG_LEVEL = 'info' as const;

/**
 * Application configuration interface.
 */
export interface Config {
  /** Optional API key for remote authentication. */
  apiKey?: string;
  /** Optional node identifier used when connecting to the server. */
  nodeId?: string;
  /** Logging verbosity level. */
  logLevel: 'info' | 'debug' | 'error';
}

/**
 * Resolve the base directory used for storing configuration data.
 *
 * The lookup order is:
 * 1. `XDG_CONFIG_HOME` environment variable.
 * 2. Windows `%APPDATA%`.
 * 3. `~/Library/Application Support` on macOS and other POSIX systems.
 *
 * @returns Absolute path to the configuration directory.
 */
function getDataDir(): string {
  return (
    process.env.XDG_CONFIG_HOME ||
    process.env.APPDATA ||
    path.join(os.homedir(), 'Library', 'Application Support')
  );
}

/**
 * Ensures that the `aichain-helper` directory exists with secure permissions.
 *
 * On POSIX systems the directory is created and its permissions are set to
 * `0o600` to restrict access to the current user.
 *
 * @returns The full path to the application configuration directory.
 */
function ensureAppDir(): string {
  const dir = path.join(getDataDir(), 'aichain-helper');

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(dir, 0o600);
    } catch (_) {
      // Ignore chmod errors on filesystems that do not support permissions.
    }
  }

  return dir;
}

/**
 * Retrieve the path to the application configuration directory.
 *
 * The directory is created if it does not yet exist.
 */
export function getConfigDir(): string {
  return ensureAppDir();
}

/**
 * Load the application configuration from `config.toml`.
 *
 * @returns The parsed configuration object.
 */
export function loadConfig(): Config {
  const dir = ensureAppDir();
  const file = path.join(dir, 'config.toml');

  if (!fs.existsSync(file)) {
    return { logLevel: DEFAULT_LOG_LEVEL };
  }

  const raw = fs.readFileSync(file, 'utf8');
  const data = parse(raw) as Config;

  return { ...data, logLevel: data.logLevel ?? DEFAULT_LOG_LEVEL };
}

/**
 * Save configuration changes back to `config.toml`.
 *
 * The provided partial configuration is merged with the existing
 * configuration before being written.
 *
 * @param partial - Partial configuration values to persist.
 */
export function saveConfig(partial: Partial<Config>): void {
  const dir = ensureAppDir();
  const file = path.join(dir, 'config.toml');

  const current = loadConfig();
  const next: Config = { ...current, ...partial };
  const content = stringify(next);

  fs.writeFileSync(file, content);

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(file, 0o600);
    } catch (_) {
      // Ignore chmod errors on filesystems that do not support permissions.
    }
  }
}
