const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toFloat = (value, fallback) => {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const loadConfig = (env = process.env) => ({
  tcpPort: toInt(env.MOCK_TCP_PORT, 7887),
  httpPort: toInt(env.MOCK_HTTP_PORT, 7888),
  targetEventCount: toInt(env.MOCK_TARGET_EVENT_COUNT, 5),
  eventLifetimeMinSeconds: toInt(env.MOCK_EVENT_LIFETIME_MIN_SECONDS, 240),
  eventLifetimeMaxSeconds: toInt(env.MOCK_EVENT_LIFETIME_MAX_SECONDS, 300),
  tickIntervalMs: toInt(env.MOCK_TICK_INTERVAL_MS, 1000),
  cancelProbability: toFloat(env.MOCK_CANCEL_PROBABILITY, 0.07),
  seed: env.MOCK_SEED ? toInt(env.MOCK_SEED, 0) : undefined,
  pingIntervalMs: 10_000,
  idleTimeoutMs: 60_000
});
