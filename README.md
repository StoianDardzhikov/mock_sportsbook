# Mock Sportsbook Provider

Standalone Node.js service that generates a continuous stream of simulated sportsbook events, markets, and odds. It exposes a **TCP feed** (JSON-line protocol) and an **HTTP API** for control and inspection.

## Run

```bash
npm install
npm start
```

Development mode (auto-restart on changes):

```bash
npm run dev
```

Smoke test:

```bash
npm test
```

## Configuration

Environment variables with defaults:

```bash
MOCK_TCP_PORT=7887                    # TCP feed port
MOCK_HTTP_PORT=7888                   # HTTP API port
MOCK_TARGET_EVENT_COUNT=5             # concurrent active events
MOCK_EVENT_LIFETIME_MIN_SECONDS=240   # min event duration
MOCK_EVENT_LIFETIME_MAX_SECONDS=300   # max event duration
MOCK_TICK_INTERVAL_MS=1000            # odds update tick interval
MOCK_CANCEL_PROBABILITY=0.07          # chance an event gets canceled instead of finished
MOCK_SEED=                            # optional, for reproducible runs
```

---

## TCP Feed (port 7887)

Connect with a raw TCP client. Every message is **one JSON object per line** (`\n`-delimited).

### Handshake

After connecting, send a JSON line with an `app_key` field. Any value is accepted. The server replies:

```json
{ "method": "connect.success", "data": { "status": "ok" } }
```

### Keep-alive

The server sends a `ping` every 10 seconds:

```json
{ "method": "ping", "data": { "ts": 1710000000000 } }
```

Idle connections with no client traffic are closed after 60 seconds.

### Feed Messages

All feed messages follow the shape `{ "method": "<name>", "data": { ... } }`.

| Method | Description |
|---|---|
| `event.announce` | New event created |
| `event.insert` | Full event payload with markets and outcomes |
| `event.update` | Event metadata changed (name, start time, score) |
| `event.set_prematch` | Event is upcoming |
| `event.set_live` | Event goes live |
| `event.set_finished` | Event ended with results |
| `event.set_canceled` | Event voided |
| `event.remove` | Event removed |
| `market.insert` | New market added |
| `market.update` | Market changed |
| `market.suspend` | Market trading suspended |
| `market.unsuspend` | Market trading resumed |
| `market.remove` | Market removed |
| `outcome.insert` | New outcome added |
| `outcome.update` | Odds changed for an outcome |

### Example Payloads

**`event.insert`** -- full event with nested markets and outcomes:

```json
{
  "method": "event.insert",
  "data": {
    "event_id": 3001,
    "event_name": "Lions vs Tigers",
    "event_dt": 1734552000,
    "status_type": "prematch",
    "is_live": false,
    "broadcast_url": null,
    "sport": { "sport_id": 1, "sport_name": "Soccer", "sport_weight": 100 },
    "category": { "category_id": 1001, "category_name": "England", "country_id": "GB", "category_weight": 50 },
    "tournament": { "tournament_id": 2001, "tournament_name": "Premier League", "tournament_weight": 80 },
    "participants": [
      { "participant_id": 4001, "participant_name": "Lions", "participant_type": "team", "participant_number": 1 },
      { "participant_id": 4002, "participant_name": "Tigers", "participant_type": "team", "participant_number": 2 }
    ],
    "markets": [
      {
        "market_id": 5001,
        "event_id": 3001,
        "market_name": "1X2",
        "market_template_id": 1,
        "market_order": 1,
        "market_suspend": "no",
        "result_type_id": 1,
        "outcomes": [
          { "outcome_id": 6001, "market_id": 5001, "outcome_name": "Lions", "outcome_coef": 2.1, "outcome_type_id": 1, "outcome_visible": "yes", "participant_id": 4001 },
          { "outcome_id": 6002, "market_id": 5001, "outcome_name": "Draw", "outcome_coef": 3.2, "outcome_type_id": 2, "outcome_visible": "yes" },
          { "outcome_id": 6003, "market_id": 5001, "outcome_name": "Tigers", "outcome_coef": 3.4, "outcome_type_id": 3, "outcome_visible": "yes", "participant_id": 4002 }
        ]
      }
    ]
  }
}
```

**`outcome.update`** -- odds change for a single outcome:

```json
{
  "method": "outcome.update",
  "data": {
    "outcome_id": 6001,
    "market_id": 5001,
    "outcome_name": "Lions",
    "outcome_coef": 2.08,
    "outcome_type_id": 1,
    "outcome_visible": "yes",
    "participant_id": 4001
  }
}
```

**`event.set_finished`** -- event result:

```json
{
  "method": "event.set_finished",
  "data": {
    "event_id": 3001,
    "result_id": 1,
    "result_total": 2,
    "result_name": "Lions",
    "results": [
      {
        "market_id": 5001,
        "market_name": "1X2",
        "result_id": 1,
        "result_name": "Lions",
        "outcome_id": 6001
      }
    ]
  }
}
```

---

## HTTP API (port 7888)

### Dashboard

`GET /dashboard` -- live auto-refreshing web UI showing all active events, markets, and odds.

### Health & State

| Endpoint | Description |
|---|---|
| `GET /health` | `{ status, connectedClients, activeEvents }` |
| `GET /state` | Full snapshot: active events with markets, suspended markets, last tick time |

### Scenario Controls

Force specific states for testing:

| Endpoint | Description |
|---|---|
| `POST /scenario/spawn?count=N` | Spawn N new events immediately |
| `POST /scenario/finish/:eventId` | Force-finish an event with results |
| `POST /scenario/cancel/:eventId` | Force-cancel an event |
| `POST /scenario/suspend/:marketId` | Suspend a market |
| `POST /scenario/unsuspend/:marketId` | Resume a market |
| `POST /scenario/odds/:outcomeId?coef=2.30` | Set a specific odds value |

---

## Event Lifecycle

Each simulated event follows this cycle:

1. **Prematch** -- event is announced with 3-6 markets. Odds drift slightly every 1-3 seconds.
2. **Live** -- after ~30-60 seconds the event goes live. Odds update more frequently, markets may suspend/unsuspend.
3. **Finished/Canceled** -- after 4-5 minutes total, the event finishes with a result (or ~7% chance of cancellation).

The service maintains 3-8 concurrent active events at all times, spawning replacements as events end.

### Sports Covered

- **Soccer** -- 1X2, Total Over/Under, Both Teams To Score, Double Chance
- **Basketball** -- Winner, Total Points O/U, Handicap
- **Tennis** -- Winner, Set Winner, Total Games O/U
