export const serializeLine = (payload) => `${JSON.stringify(payload)}\n`;

export const parseLines = (connection, chunk) => {
  connection.buffer += chunk.toString("utf8");
  const lines = connection.buffer.split("\n");
  connection.buffer = lines.pop() ?? "";
  return lines.map((line) => line.trim()).filter(Boolean);
};

export const parseHandshake = (line) => {
  try {
    const parsed = JSON.parse(line);
    if (!parsed.app_key) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const formatFeedMessage = (message) => serializeLine(message);

export const formatConnectSuccess = () => serializeLine({
  method: "connect.success",
  data: { status: "ok" }
});

export const formatPing = () => serializeLine({
  method: "ping",
  data: { ts: Date.now() }
});
