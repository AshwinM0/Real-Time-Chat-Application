import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRedisClients, redisTlsOptions } from "../../redis/client.js";

// The files only have to exist: redisTlsOptions reads them, and node-redis only
// parses them when it connects. Connecting over TLS to redis-in-java was checked by hand.
let dir;
const file = (name, content) => {
  const filePath = path.join(dir, name);
  writeFileSync(filePath, content);
  return filePath;
};
beforeAll(() => { dir = mkdtempSync(path.join(tmpdir(), "chat-redis-tls-")); });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const TLS_URL = "rediss://:secret@127.0.0.1:6380";

test("BU-21: without REDIS_TLS_* there's nothing to read, whatever the URL", () => {
  expect(redisTlsOptions("redis://127.0.0.1:6379", {})).toEqual({});
  // A server certificate from an authority Node already trusts needs no files.
  expect(redisTlsOptions(TLS_URL, {})).toEqual({});
});

test("BU-22: with rediss://, reads the CA, the client certificate and its key", () => {
  const env = {
    REDIS_TLS_CA: file("ca.pem", "the ca"),
    REDIS_TLS_CERT: file("client.pem", "the cert"),
    REDIS_TLS_KEY: file("client.key", "the key"),
  };

  const tls = redisTlsOptions(TLS_URL, env);

  expect(Object.keys(tls).sort()).toEqual(["ca", "cert", "key"]);
  expect(tls.ca.toString()).toBe("the ca");
  expect(tls.cert.toString()).toBe("the cert");
  expect(tls.key.toString()).toBe("the key");
  // Only the CA, for a server that doesn't ask for client certificates.
  expect(Object.keys(redisTlsOptions(TLS_URL, { REDIS_TLS_CA: env.REDIS_TLS_CA }))).toEqual(["ca"]);
});

test("BU-23: settings that don't add up are refused, saying what to fix", () => {
  const ca = file("ca.pem", "the ca");

  // The files would be ignored and the connection sent in plaintext.
  expect(() => redisTlsOptions("redis://127.0.0.1:6379", { REDIS_TLS_CA: ca }))
    .toThrow("REDIS_URL doesn't start with rediss://");
  expect(() => redisTlsOptions(TLS_URL, { REDIS_TLS_CERT: file("client.pem", "the cert") }))
    .toThrow("set REDIS_TLS_CERT and REDIS_TLS_KEY together");
  const missing = path.join(dir, "missing.pem");
  expect(() => redisTlsOptions(TLS_URL, { REDIS_TLS_CA: missing }))
    .toThrow(`could not read REDIS_TLS_CA (${missing})`);
});

test("BU-24: both clients get the TLS files, and TLS is on", () => {
  const tls = { ca: Buffer.from("the ca"), cert: Buffer.from("the cert"), key: Buffer.from("the key") };

  const { pub, sub } = createRedisClients(TLS_URL, { tls });

  // sub comes from duplicate(), which must not lose them.
  for (const client of [pub, sub]) {
    expect(client.options.socket).toMatchObject({ tls: true, ...tls });
  }
});
