import { createServer as createTcpServer } from "node:net";
import { pathToFileURL } from "node:url";
import { createControlServer } from "./control.js";
import { loadConfig } from "./config.js";
import { formatConnectSuccess, formatFeedMessage, formatPing, parseHandshake, parseLines } from "./protocol.js";
import { Simulator } from "./simulator.js";

const logLine = (connection, method, payload, eventId) => {
  const direction = connection ? `client=${connection.id}` : "broadcast";
  const event = typeof eventId === "number" ? eventId : "-";
  console.log(`${direction} ${event} ${method} ${Buffer.byteLength(payload, "utf8")}`);
};

const writeToConnection = (connection, message) => {
  const payload = formatFeedMessage(message);
  const eventId = message.data?.event_id;
  connection.socket.write(payload);
  logLine(connection, message.method, payload, eventId);
};

export const createApp = (config = loadConfig()) => {
  const connections = new Map();
  let connectionSeq = 0;

  const broadcast = (message) => {
    const payload = formatFeedMessage(message);
    const eventId = message.data?.event_id;
    logLine(null, message.method, payload, eventId);
    if (connections.size === 0) {
      console.warn("WARN no client is connected");
    }
    for (const connection of connections.values()) {
      if (connection.handshakeComplete) {
        connection.socket.write(payload);
      }
    }
  };

  const simulator = new Simulator(config, {
    emit: broadcast,
    getConnectedClients: () => [...connections.values()].filter((connection) => connection.handshakeComplete).length
  });

  const replaySnapshot = (connection) => {
    const snapshot = simulator.getSnapshot();
    for (const event of snapshot.activeEvents) {
      writeToConnection(connection, { method: "event.insert", data: event });
      for (const market of event.markets) {
        writeToConnection(connection, { method: "market.insert", data: market });
        for (const outcome of market.outcomes) {
          writeToConnection(connection, { method: "outcome.insert", data: outcome });
        }
        if (market.market_suspend === "yes") {
          writeToConnection(connection, { method: "market.suspend", data: { market_id: market.market_id } });
        }
      }

      if (event.status_type === "prematch") {
        writeToConnection(connection, { method: "event.set_prematch", data: { event_id: event.event_id } });
      }

      if (event.status_type === "live") {
        writeToConnection(connection, { method: "event.set_live", data: { event_id: event.event_id, is_live: true } });
        writeToConnection(connection, { method: "event.update", data: { ...event, markets: [] } });
      }
    }
  };

  const touchConnection = (connection) => {
    connection.lastActivityAt = Date.now();
  };

  const closeConnection = (connection, reason) => {
    if (!connections.delete(connection.id)) {
      return;
    }
    if (connection.pingTimer) {
      clearInterval(connection.pingTimer);
    }
    if (connection.idleTimer) {
      clearInterval(connection.idleTimer);
    }
    if (!connection.socket.destroyed) {
      connection.socket.destroy();
    }
    console.log(`disconnect client=${connection.id} reason=${reason}`);
  };

  const tcpServer = createTcpServer((socket) => {
    const connection = {
      id: ++connectionSeq,
      socket,
      handshakeComplete: false,
      lastActivityAt: Date.now(),
      buffer: ""
    };
    connections.set(connection.id, connection);
    console.log(`accepted client=${connection.id}`);

    connection.pingTimer = setInterval(() => {
      if (!connection.handshakeComplete) {
        return;
      }
      const payload = formatPing();
      socket.write(payload);
      logLine(connection, "ping", payload);
    }, config.pingIntervalMs);

    connection.idleTimer = setInterval(() => {
      if (Date.now() - connection.lastActivityAt > config.idleTimeoutMs) {
        closeConnection(connection, "idle_timeout");
      }
    }, 5_000);

    socket.on("data", (chunk) => {
      touchConnection(connection);
      for (const line of parseLines(connection, chunk)) {
        if (!connection.handshakeComplete) {
          const handshake = parseHandshake(line);
          if (!handshake) {
            closeConnection(connection, "bad_handshake");
            return;
          }
          connection.handshakeComplete = true;
          const payload = formatConnectSuccess();
          socket.write(payload);
          logLine(connection, "connect.success", payload);
          console.log(`handshake_ok client=${connection.id} app_key=${handshake.app_key}`);
          replaySnapshot(connection);
        }
      }
    });

    socket.on("close", () => closeConnection(connection, "socket_closed"));
    socket.on("error", () => closeConnection(connection, "socket_error"));
  });

  const httpServer = createControlServer({
    simulator,
    getConnectedClients: () => [...connections.values()].filter((connection) => connection.handshakeComplete).length
  });

  const close = async () => {
    simulator.stop();
    for (const connection of [...connections.values()]) {
      closeConnection(connection, "shutdown");
    }
    await Promise.all([
      new Promise((resolve, reject) => tcpServer.close((error) => error ? reject(error) : resolve())),
      new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()))
    ]);
  };

  return { config, tcpServer, httpServer, simulator, close };
};

export const startApp = async (config = loadConfig()) => {
  const app = createApp(config);
  await Promise.all([
    new Promise((resolve, reject) => app.tcpServer.listen(config.tcpPort, () => resolve()).on("error", reject)),
    new Promise((resolve, reject) => app.httpServer.listen(config.httpPort, () => resolve()).on("error", reject))
  ]);
  simulatorStart(app);
  return app;
};

const simulatorStart = (app) => {
  app.simulator.start();
  const tcpAddress = app.tcpServer.address();
  const httpAddress = app.httpServer.address();
  console.log(`tcp_listening port=${tcpAddress.port}`);
  console.log(`http_listening port=${httpAddress.port}`);
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const app = await startApp();
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
