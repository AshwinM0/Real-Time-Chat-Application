import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Starts the real server.ts and waits for it to exit. It runs from an empty folder,
// so dotenv can't load anyone's real .env, and gets only the app variables a test
// passes in. tsx's loader runs the TypeScript, as in `npm run server`; it's found
// from here, since the empty folder has no node_modules.
const serverTs = fileURLToPath(new URL("../../server.ts", import.meta.url));
const tsxLoader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
let emptyDir: string;
beforeAll(() => { emptyDir = mkdtempSync(path.join(tmpdir(), "chat-startup-")); });
afterAll(() => rmSync(emptyDir, { recursive: true, force: true }));

const APP_VARIABLES = ["PORT", "MONGO_DB_URI", "JWT_SECRET", "REDIS_URL", "REDIS_TLS_CA", "REDIS_TLS_CERT", "REDIS_TLS_KEY"];

const startServer = (appEnv: Record<string, string>) => {
  const osEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !APP_VARIABLES.includes(name)));
  return new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(process.execPath, ["--import", tsxLoader, serverTs], { cwd: emptyDir, env: { ...osEnv, ...appEnv } });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("exit", (code) => resolve({ code, output }));
  });
};

test("BI-47: the server won't start without its required variables, and names the missing ones", async () => {
  const { code, output } = await startServer({ JWT_SECRET: "set" });

  expect(code).toBe(1);
  expect(output).toContain("Missing environment variables: PORT, MONGO_DB_URI. See .env.example.");
}, 20_000);

test("BI-48: the server stops, saying why, when it can't reach MongoDB", async () => {
  const { code, output } = await startServer({
    PORT: "0", // any free port
    JWT_SECRET: "set",
    // Nothing listens on port 1, and the short timeout makes the attempt fail fast.
    MONGO_DB_URI: "mongodb://127.0.0.1:1/chat?serverSelectionTimeoutMS=500",
  });

  expect(code).toBe(1);
  expect(output).toContain("Could not connect to MongoDB");
}, 20_000);

test("BI-49: with REDIS_URL set, the server stops, saying why, when it can't reach Redis", async () => {
  const { code, output } = await startServer({
    PORT: "0",
    JWT_SECRET: "set",
    MONGO_DB_URI: "mongodb://127.0.0.1:1/chat?serverSelectionTimeoutMS=500",
    // Nothing listens on port 1. Redis comes first, so MongoDB is never tried.
    REDIS_URL: "redis://127.0.0.1:1",
  });

  expect(code).toBe(1);
  expect(output).toMatch(/Could not connect to Redis: .*\(gave up after 5 s\)/);
  expect(output).not.toContain("MongoDB");
}, 20_000);

test("BI-67: the server won't start with TLS files but a redis:// URL, which would send them nowhere", async () => {
  const { code, output } = await startServer({
    PORT: "0",
    JWT_SECRET: "set",
    MONGO_DB_URI: "mongodb://127.0.0.1:1/chat?serverSelectionTimeoutMS=500",
    REDIS_URL: "redis://127.0.0.1:1",
    // Checked before the file is read, so it needn't exist.
    REDIS_TLS_CA: path.join(emptyDir, "ca.pem"),
  });

  expect(code).toBe(1);
  expect(output).toContain("Could not connect to Redis: REDIS_TLS_* is set, but REDIS_URL doesn't start with rediss://");
}, 20_000);
