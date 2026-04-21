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

test("manual settlement endpoint finishes event with selected winner", async () => {
  const app = await startApp(loadConfig({
    MOCK_TCP_PORT: "7927",
    MOCK_HTTP_PORT: "7928",
    MOCK_TARGET_EVENT_COUNT: "1",
    MOCK_EVENT_LIFETIME_MIN_SECONDS: "30",
    MOCK_EVENT_LIFETIME_MAX_SECONDS: "30",
    MOCK_SEED: "99"
  }));

  try {
    const snapshotResponse = await fetch("http://127.0.0.1:7928/state");
    const snapshot = await snapshotResponse.json();
    const event = snapshot.activeEvents[0];
    assert.ok(event);

    const winners = Object.fromEntries(event.markets.map((market) => [market.market_id, market.outcomes[0].outcome_id]));
    const firstWinner = event.markets[0].outcomes[0];
    let settleResponsePromise;

    const settlementMessage = await new Promise((resolve, reject) => {
      const socket = net.createConnection({ port: 7927, host: "127.0.0.1" });
      let buffer = "";
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error("Timed out waiting for settlement payload"));
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
          if (message.method === "connect.success") {
            settleResponsePromise = fetch(`http://127.0.0.1:7928/scenario/settle/${event.event_id}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ winners })
            });
            settleResponsePromise.catch(reject);
            continue;
          }
          if (message.method !== "event.set_finished" || message.data.event_id !== event.event_id) {
            continue;
          }

          clearTimeout(timeout);
          socket.destroy();
          resolve(message);
        }
      });

      socket.on("error", reject);
    });

    const settleResponse = await settleResponsePromise;
    const settleBody = await settleResponse.json();

    assert.equal(settleResponse.status, 200);
    assert.deepEqual(settleBody, { ok: true });
    assert.equal(settlementMessage.data.result_id, firstWinner.outcome_type_id);
    assert.ok(Array.isArray(settlementMessage.data.results));
    assert.equal(settlementMessage.data.results.length, event.markets.length);
    assert.deepEqual(settlementMessage.data.results[0], {
      market_id: event.markets[0].market_id,
      market_name: event.markets[0].market_name,
      result_id: event.markets[0].outcomes[0].outcome_type_id,
      result_name: event.markets[0].outcomes[0].outcome_name,
      outcome_id: event.markets[0].outcomes[0].outcome_id
    });

    const settledSnapshotResponse = await fetch("http://127.0.0.1:7928/state");
    const settledSnapshot = await settledSnapshotResponse.json();
    const settledEvent = settledSnapshot.activeEvents.find((entry) => entry.event_id === event.event_id);

    assert.ok(settledEvent);
    assert.equal(settledEvent.status_type, "finished");
    assert.equal(settledEvent.is_live, false);
    assert.equal(firstWinner.outcome_type_id, event.markets[0].outcomes[0].outcome_type_id);
  } finally {
    await app.close();
  }
});
