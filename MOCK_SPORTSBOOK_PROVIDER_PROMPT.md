# Build Prompt — Mock Sportsbook Data Provider

Build a small, **standalone service** that emulates a live sports-data feed for end-to-end testing of the VLR Game Aggregator's sportsbook integration. The aggregator currently consumes a Betinvest-style JSON line protocol over a raw TCP socket (see `provider/betinvest/BetinvestConnectionService.java` and `BetinvestMessageRouter`); the mock service must be **wire-compatible** with that protocol so the aggregator can connect to it by simply pointing `betinvest.host` / `betinvest.port` at the mock and providing any `betinvest.app_key`.

## Goals

- Continuously generate a realistic stream of sportsbook events with markets and odds.
- Produce enough variety/churn that the aggregator's persistence, WebSocket broadcast, admin UI, stake/liability rules, and settlement code paths are all exercised.
- Be self-contained — no DB, no external dependencies. State lives in memory.

## Non-goals

- Do not implement bet placement, wallet, or any aggregator-side logic.
- Do not load real fixtures or schedules.
- Do not implement a UI; a tiny HTTP control surface is enough.

---

## Tech / Layout

- Language: **Node.js (TypeScript)**. Single repo, single process.
- One TCP server (the feed) + one HTTP server (control + health). Suggested ports:
  - `7887` — TCP feed (matches `betinvest.port` default)
  - `7888` — HTTP control (`/health`, `/state`, `/scenario`)
- Project layout:
  ```
  mock-sportsbook-provider/
    src/
      server.ts           # TCP listener + connection lifecycle
      protocol.ts         # framing, handshake, ping/pong
      simulator.ts        # event/market/odds generator + tick loop
      catalog.ts          # static sports/categories/tournaments/teams pool
      control.ts          # HTTP control surface
      config.ts
    package.json / pyproject.toml
    README.md
  ```

---

## Wire Protocol (must match Betinvest line format)

- Transport: plain TCP, **one JSON object per line**, terminated with `\n`.
- After a client connects, expect a JSON handshake with `app_key`, `partner_id`, `service_id`. Reply with a `connect.success` line. (For mock purposes: accept any `app_key`.)
- Send a `ping` line every 10 seconds; close the socket if no client traffic for 60 s.
- All feed messages have shape:
  ```json
  { "method": "<name>", "data": { ... } }
  ```

### Methods to emit

| Method | When | Required `data` fields |
|---|---|---|
| `event.announce` | new event created | full event payload (see below) |
| `event.insert` | first push of an event after announce | full event payload |
| `event.update` | metadata change (name, start time, score) | event payload |
| `event.set_prematch` | event still upcoming | `event_id` |
| `event.set_live` | event goes live | `event_id`, `is_live: true` |
| `event.set_finished` | event ends, must include `result_id`, `result_total`, `result_name` | settlement trigger |
| `event.set_canceled` | event voided | `event_id` |
| `event.remove` | rare cleanup | `event_id` |
| `market.insert` / `market.update` | market created or odds/limits changed | full market payload |
| `market.suspend` / `market.unsuspend` | toggle market trading | `market_id` |
| `market.remove` | market dropped | `market_id` |
| `outcome.insert` / `outcome.update` | odds change for a single outcome | full outcome payload |

### Event payload shape (`data`)

```json
{
  "event_id": 1001,
  "event_name": "Lions vs Tigers",
  "event_dt": 1734552000,
  "status_type": "prematch",
  "is_live": false,
  "broadcast_url": null,
  "sport":      { "sport_id": 1, "sport_name": "Soccer", "sport_weight": 100 },
  "category":   { "category_id": 10, "category_name": "England", "country_id": "GB", "category_weight": 50 },
  "tournament": { "tournament_id": 100, "tournament_name": "Premier League", "tournament_weight": 80 },
  "participants": [
    { "participant_id": 5001, "participant_name": "Lions",  "participant_type": "team", "participant_number": 1 },
    { "participant_id": 5002, "participant_name": "Tigers", "participant_type": "team", "participant_number": 2 }
  ],
  "markets": [ /* see below; only on insert/announce */ ]
}
```

### Market payload shape

```json
{
  "market_id": 70001,
  "event_id": 1001,
  "market_name": "1X2",
  "market_template_id": 1,
  "market_order": 1,
  "market_suspend": "no",
  "result_type_id": 1,
  "outcomes": [
    { "outcome_id": 80001, "market_id": 70001, "outcome_name": "Lions",  "outcome_coef": 2.10, "outcome_type_id": 1, "outcome_visible": "yes", "participant_id": 5001 },
    { "outcome_id": 80002, "market_id": 70001, "outcome_name": "Draw",   "outcome_coef": 3.20, "outcome_type_id": 2, "outcome_visible": "yes" },
    { "outcome_id": 80003, "market_id": 70001, "outcome_name": "Tigers", "outcome_coef": 3.40, "outcome_type_id": 3, "outcome_visible": "yes", "participant_id": 5002 }
  ]
}
```

> All booleans use `"yes"` / `"no"` strings — that is what the aggregator's `getYesNoBoolean` parser expects.

---

## Simulator behaviour

Run a deterministic-ish, seedable loop with these rules:

### Event lifecycle (each event)

1. **Announce** — pick from the catalog (sport, tournament, two participants), assign a fresh `event_id`. Emit `event.announce` then `event.insert` with 3–6 markets and their outcomes. Initial status `prematch`. `event_dt` = `now + 30 s`.
2. **Pre-match window** — for ~30–60 s, emit `outcome.update` ticks every 1–3 s with small odds drift.
3. **Go live** — emit `event.set_live`. Change pace: more frequent odds updates (every 0.5–2 s), occasional `market.suspend`/`market.unsuspend` cycles (suspend for 3–10 s, then resume), occasional new market via `market.insert` mid-event.
4. **Live duration** — total event lifetime: **4–5 minutes (random)** from announce to finish.
5. **Finish** — emit `event.set_finished` with a populated `result_*` block referencing one of the existing outcome `outcome_type_id` values so the aggregator's settlement service has a winner to grade against. Roughly **5–10 % of events** instead emit `event.set_canceled` (to exercise the void-bets path).

### Concurrency

- Maintain a target of **3–8 active events at any time**. When an event finishes, spawn a new one after a short delay so there is always overlap.
- Each event's tick loop runs independently (own timer / async task).

### Odds generation

- Start each outcome's coefficient on the official decimal odds ladder (1.01–2.00 step 0.01, 2.00–3.00 step 0.02, 3.00–4.00 step 0.05, 4.00–6.00 step 0.10, 6.00–10.00 step 0.20, 10–20 step 0.50, 20–50 step 1, 50–100 step 2, 100–1000 step 5; max 1000.00). The aggregator snaps to this ladder, so emitting on-ladder values keeps numbers stable.
- Per tick: pick 1–N outcomes in the event, multiply by a random factor in `[0.95, 1.05]`, snap to the ladder, clamp to `[1.01, 1000]`, emit `outcome.update`.
- For a 1X2 market, roughly preserve `Σ 1/odds ≈ 1.05–1.08` (i.e. realistic overround).

### Suspensions

- Independently of odds: every 10–30 s (random) per live event, pick one market and suspend it for 3–10 s, then unsuspend. Occasionally suspend two markets at once.

### Result selection

- When emitting `event.set_finished`, pick a winning outcome weighted **inversely by its current coefficient** (favourites win more often). Set `result_id` to that outcome's `outcome_type_id` so the aggregator's settlement matches by type id. Emit a numeric `result_total` (e.g. random 0–4 for soccer-ish markets) and a human `result_name`.

---

## Catalog (static, in code)

Pre-define a small pool so generated events look plausible:

- 3 sports: Soccer (id 1), Basketball (id 2), Tennis (id 3) — each with 2 categories and 2 tournaments.
- ~20 team / player names per sport.
- 4–6 market templates per sport with their outcome shapes:
  - Soccer: `1X2`, `Total Over/Under 2.5`, `Both Teams To Score`, `Double Chance`.
  - Basketball: `Winner`, `Total Points O/U`, `Handicap`.
  - Tennis: `Winner`, `Set Winner`, `Total Games O/U`.
- IDs across all entities should be globally unique within the run (use monotonic counters per type).

---

## Control surface (HTTP, port 7888)

Tiny REST endpoints to make manual testing easier:

- `GET  /health` — `{ status: "ok", connectedClients: N, activeEvents: N }`
- `GET  /state`  — current snapshot: events, markets, suspended markets, last tick time.
- `POST /scenario/spawn?count=3` — force-spawn N events immediately.
- `POST /scenario/finish/:eventId` — force-finish an event.
- `POST /scenario/cancel/:eventId` — force-cancel an event.
- `POST /scenario/suspend/:marketId` / `POST /scenario/unsuspend/:marketId` — toggle a specific market.
- `POST /scenario/odds/:outcomeId?coef=2.30` — push a specific odds value.

These let a developer reproduce edge cases (cancellation, settlement, suspended-while-betting) on demand.

---

## Configuration

Env vars with sane defaults:

```
MOCK_TCP_PORT=7887
MOCK_HTTP_PORT=7888
MOCK_TARGET_EVENT_COUNT=5
MOCK_EVENT_LIFETIME_MIN_SECONDS=240
MOCK_EVENT_LIFETIME_MAX_SECONDS=300
MOCK_TICK_INTERVAL_MS=1000
MOCK_CANCEL_PROBABILITY=0.07
MOCK_SEED=                       # optional, for reproducible runs
```

---

## Logging

- One log line per emitted message: `direction event_id method bytes`.
- Connection lifecycle (`accepted`, `handshake_ok`, `disconnect`).
- WARN when no client is connected (so the operator knows the aggregator hasn't dialled in yet).

---

## Deliverables

1. The service in the chosen language with the layout above.
2. `README.md` covering: how to run, how to point the aggregator at it (`betinvest.host=localhost`, `betinvest.port=7887`, any `betinvest.app_key`), and a short list of every method the simulator emits with example payloads.
3. A `Makefile` or npm scripts: `start`, `dev`, `test`.
4. A minimal smoke test that boots the server, opens a TCP client, completes the handshake, and asserts at least one `event.insert` and one `outcome.update` are received within 5 s.

## Acceptance test against the aggregator

Once running:

1. Start the aggregator with `betinvest.host=localhost`, `betinvest.port=7887`.
2. Within ~30 s, `GET /api/admin/sportsbook/feed-health` should report the betinvest provider as `connected` with a recent `lastSync`.
3. `GET /api/admin/sportsbook/events` should return the generated events; their statuses should transition `PREMATCH → LIVE → FINISHED|CANCELED` over 4–5 minutes.
4. `GET /api/admin/sportsbook/odds-monitor` should show coefficient values changing over time.
5. Markets should occasionally appear with `suspended=true` then return to `false`.
6. After an event finishes with a `result_id` matching a placed bet's outcome type, the bet should auto-settle (verify through `GET /api/admin/sportsbook/bets`).
