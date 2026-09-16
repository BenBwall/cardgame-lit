import { expect, test } from "bun:test";
import { multiplayerUrl } from "@cardgame/multiplayer/config.js";
import { serverConfiguration } from "@server/config.js";

test("development defaults to loopback and keeps frontend and game ports separate", () => {
  expect(multiplayerUrl({}, true)).toBe("http://127.0.0.1:8787");
  expect(multiplayerUrl({ PORT: "4176" }, true)).toBe("http://127.0.0.1:8787");
  expect(multiplayerUrl({ MULTIPLAYER_PORT: "9876" }, true)).toBe("http://127.0.0.1:9876");
  expect(serverConfiguration({}, true)).toMatchObject({ hostname: "127.0.0.1", port: 8787 });
  expect(serverConfiguration({ PORT: "4176", MULTIPLAYER_PORT: "9876" }, true).port).toBe(9876);
  expect(multiplayerUrl({ NODE_ENV: "development" })).toBe("http://127.0.0.1:8787");
  expect(multiplayerUrl({}, false)).toBe("");
});

test("explicit URLs override mode-specific URLs and an empty override disables multiplayer", () => {
  const env = {
    MULTIPLAYER_DEV_URL: "http://localhost:9000/",
    MULTIPLAYER_PROD_URL: "https://cards.example.org/",
  };
  expect(multiplayerUrl(env, true)).toBe("http://localhost:9000");
  expect(multiplayerUrl(env, false)).toBe("https://cards.example.org");
  expect(multiplayerUrl({ ...env, MULTIPLAYER_URL: "https://override.example.org" }, true)).toBe(
    "https://override.example.org",
  );
  expect(multiplayerUrl({ ...env, MULTIPLAYER_URL: "" }, true)).toBe("");
  for (const value of [
    "http://example.org",
    "https://example.org/path",
    "https://user:pass@example.org",
    "https://example.org?q=1",
  ])
    expect(() => multiplayerUrl({ MULTIPLAYER_URL: value }, true)).toThrow();
});

test("server environment validates ports, TLS pairs, loopback development binding and exact origins", () => {
  expect(() => serverConfiguration({}, false)).toThrow("TLS_CERT");
  expect(() => serverConfiguration({ TLS_CERT: "cert.pem" }, true)).toThrow("together");
  expect(() => serverConfiguration({ MULTIPLAYER_HOST: "0.0.0.0" }, true)).toThrow("loopback");
  for (const port of ["", "0", "-1", "1.5", "65536", "abc"])
    expect(() => serverConfiguration({ MULTIPLAYER_PORT: port }, true)).toThrow("port");
  const config = serverConfiguration(
    {
      TLS_CERT: "cert.pem",
      TLS_KEY: "key.pem",
      MULTIPLAYER_PORT: "9443",
      MULTIPLAYER_ORIGINS: "https://one.example.org, https://two.example.org",
    },
    false,
  );
  expect(config).toEqual({
    hostname: "0.0.0.0",
    port: 9443,
    origins: ["https://one.example.org", "https://two.example.org"],
    tls: { cert: "cert.pem", key: "key.pem" },
  });
  for (const origin of [
    "*",
    "https://*.example.org",
    "https://example.org/path",
    "https://user:pass@example.org",
    "",
    "https://example.org,",
  ])
    expect(() => serverConfiguration({ MULTIPLAYER_ORIGINS: origin }, true)).toThrow(
      "MULTIPLAYER_ORIGINS",
    );
});
