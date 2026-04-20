import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { startApp } from "../src/server.js";
import { loadConfig } from "../src/config.js";

test("handshake and feed emits insert and update", async () => {
  const app = await startApp(loadConfig({
    MOCK_TCP_PORT: "7897",
    MOCK_HTTP_PORT: "7898",
    MOCK_TARGET_EVENT_COUNT: "1",
    MOCK_EVENT_LIFETIME_MIN_SECONDS: "12",
    MOCK_EVENT_LIFETIME_MAX_SECONDS: "15",
    MOCK_SEED: "42"
  }));

  try {
    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ port: 7897, host: "127.0.0.1" });
      const seen = new Set();
      let buffer = "";
      let spawned = false;
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Timed out waiting for messages: ${[...seen].join(",")}`));
      }, 5_000);

      socket.on("connect", () => {
        socket.write(`${JSON.stringify({ app_key: "test", partner_id: 1, service_id: 1 })}\n`);
      });

      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          const message = JSON.parse(line);
          seen.add(message.method);
          if (message.method === "connect.success" && !spawned) {
            spawned = true;
            app.simulator.spawnEvents(1);
          }
          if (seen.has("event.insert") && seen.has("outcome.update")) {
            clearTimeout(timeout);
            socket.destroy();
            resolve();
          }
        }
      });

      socket.on("error", reject);
    });

    assert.ok(true);
  } finally {
    await app.close();
  }
});

test("late-connecting client receives current snapshot after handshake", async () => {
  const app = await startApp(loadConfig({
    MOCK_TCP_PORT: "7907",
    MOCK_HTTP_PORT: "7908",
    MOCK_TARGET_EVENT_COUNT: "1",
    MOCK_EVENT_LIFETIME_MIN_SECONDS: "30",
    MOCK_EVENT_LIFETIME_MAX_SECONDS: "30",
    MOCK_SEED: "77"
  }));

  try {
    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ port: 7907, host: "127.0.0.1" });
      const seen = new Set();
      let buffer = "";
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Timed out waiting for snapshot messages: ${[...seen].join(",")}`));
      }, 5_000);

      socket.on("connect", () => {
        socket.write(`${JSON.stringify({ app_key: "test", partner_id: 1, service_id: 1 })}\n`);
      });

      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          const message = JSON.parse(line);
          seen.add(message.method);
          if (seen.has("connect.success") && seen.has("event.insert") && seen.has("market.insert") && seen.has("outcome.insert")) {
            clearTimeout(timeout);
            socket.destroy();
            resolve();
          }
        }
      });

      socket.on("error", reject);
    });

    assert.ok(true);
  } finally {
    await app.close();
  }
});

test("dashboard route serves HTML", async () => {
  const app = await startApp(loadConfig({
    MOCK_TCP_PORT: "7917",
    MOCK_HTTP_PORT: "7918",
    MOCK_TARGET_EVENT_COUNT: "1",
    MOCK_EVENT_LIFETIME_MIN_SECONDS: "30",
    MOCK_EVENT_LIFETIME_MAX_SECONDS: "30",
    MOCK_SEED: "88"
  }));

  try {
    const response = await fetch("http://127.0.0.1:7918/dashboard");
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.match(body, /Mock Sportsbook Dashboard/);
    assert.match(body, /Active Events/);
  } finally {
    await app.close();
  }
});
