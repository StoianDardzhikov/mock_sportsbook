# Feed Integration Guide

Complete reference for consuming the Mock Sportsbook Provider TCP feed and building an in-memory representation of sports events, markets, and odds.

---

## Table of Contents

1. [Connecting & Handshake](#1-connecting--handshake)
2. [Message Format](#2-message-format)
3. [Initial State Replay](#3-initial-state-replay)
4. [Building Your Data Model](#4-building-your-data-model)
5. [Event Lifecycle](#5-event-lifecycle)
6. [Market Handling](#6-market-handling)
7. [Outcome & Odds Handling](#7-outcome--odds-handling)
8. [Keep-Alive & Connection Health](#8-keep-alive--connection-health)
9. [Data Hierarchy](#9-data-hierarchy)
10. [Full Method Reference](#10-full-method-reference)
11. [Field Reference](#11-field-reference)
12. [Example: Reconstructing State from Scratch](#12-example-reconstructing-state-from-scratch)

---

## 1. Connecting & Handshake

Connect a raw TCP socket to the feed port (default `7887`). The protocol is **newline-delimited JSON** -- one JSON object per line, terminated with `\n`.

### Step 1: Send the handshake

Immediately after connecting, send a single JSON line:

```json
{"app_key":"any-value"}
```

You may also include optional fields `partner_id` and `service_id`, but only `app_key` is required. Any non-empty string is accepted.

### Step 2: Receive `connect.success`

The server responds with:

```json
{"method":"connect.success","data":{"status":"ok"}}
```

If you send an invalid handshake (missing `app_key` or malformed JSON), the server closes the connection immediately.

### Step 3: Receive state replay

Immediately after the handshake, the server replays the full current state (see [Section 3](#3-initial-state-replay)). After the replay, you receive live updates in real time.

---

## 2. Message Format

Every message follows this structure:

```json
{"method":"<method_name>","data":{...}}
```

Parse each line as JSON, switch on the `method` field, and handle the `data` payload accordingly.

---

## 3. Initial State Replay

On connection (after handshake), the server sends a snapshot of **all currently active events** so your client starts with a complete picture. The replay sequence for each event is:

```
event.insert        → full event with participants, sport, category, tournament, markets[]
  market.insert     → for each market (with nested outcomes[])
    outcome.insert  → for each outcome in each market
  market.suspend    → only if the market is currently suspended
event.set_prematch  → if the event is in prematch status
event.set_live      → if the event is live
event.update        → if the event is live (includes score)
```

This means after processing the replay, your local state should match the server's state exactly. You do **not** need to call any HTTP endpoint to bootstrap -- the TCP feed is self-sufficient.

---

## 4. Building Your Data Model

You need three indexed collections:

| Collection | Key | Populated by |
|---|---|---|
| **Events** | `event_id` | `event.insert`, `event.update`, `event.remove` |
| **Markets** | `market_id` | `market.insert`, `market.update`, `market.remove` |
| **Outcomes** | `outcome_id` | `outcome.insert`, `outcome.update` |

### Relationships

```
Sport (sport_id)
  └─ Category (category_id)
       └─ Tournament (tournament_id)
            └─ Event (event_id)
                 ├─ Participant[] (participant_id)
                 └─ Market[] (market_id)
                      └─ Outcome[] (outcome_id)
```

- Each **event** belongs to one sport, one category, and one tournament.
- Each **market** belongs to one event (`market.event_id`).
- Each **outcome** belongs to one market (`outcome.market_id`).
- Some outcomes link to a **participant** (`outcome.participant_id`) -- this is optional and only present for participant-specific outcomes like "Home Win" or "Away Win".

### Recommended approach

When you receive `event.insert`, store the event and index its nested markets and outcomes. On subsequent `market.insert` / `outcome.insert` messages, add them to your collections and link them to their parent event/market by ID.

---

## 5. Event Lifecycle

Every event transitions through these statuses in order:

```
prematch → live → finished
                → canceled  (~7% chance)
```

After finishing/canceling, the event is eventually removed.

### 5.1 Event Creation

**`event.announce`** -- Signals a new event is about to be created. Contains the full event payload with markets and outcomes. Use this as an early heads-up.

**`event.insert`** -- The authoritative "create" message. Contains the full event payload. **Always store/overwrite your local event from this message.** The payload includes:

- Event metadata (`event_id`, `event_name`, `event_dt`, `status_type`, `is_live`)
- Sport, category, and tournament objects
- Participants array
- Markets array (each market contains its outcomes)

**`event.set_prematch`** -- Confirms the event is in prematch status. Contains only `{ event_id }`. Set your local event's `status_type` to `"prematch"`.

```json
{"method":"event.set_prematch","data":{"event_id":3001}}
```

### 5.2 Going Live

**`event.set_live`** -- The event has started. Contains `event_id` and `is_live: true`. Update your local state:

```json
{"method":"event.set_live","data":{"event_id":3001,"is_live":true}}
```

Set `status_type = "live"` and `is_live = true` on your local event.

After going live, expect:
- More frequent `outcome.update` messages (odds change faster)
- `market.suspend` / `market.unsuspend` cycles
- New markets added via `market.insert`
- Score updates via `event.update`

### 5.3 Event Updates

**`event.update`** -- Partial or full event metadata has changed. Most commonly sent when the **score** changes during a live event. The `markets` array will be empty in updates -- do **not** clear your local markets based on this. Only update the event-level fields:

```json
{
  "method":"event.update",
  "data":{
    "event_id":3001,
    "event_name":"Lions vs Tigers",
    "status_type":"live",
    "is_live":true,
    "score":"1:0",
    "markets":[]
  }
}
```

Handle this by merging the incoming fields into your stored event, but **preserve your existing markets/outcomes**.

### 5.4 Event Finished

**`event.set_finished`** -- The event has ended with a result. This is followed by an `event.update` confirming the status change.

```json
{
  "method":"event.set_finished",
  "data":{
    "event_id":3001,
    "result_id":1,
    "result_total":2,
    "result_name":"Lions"
  }
}
```

| Field | Meaning |
|---|---|
| `result_id` | The `outcome_type_id` of the winning outcome. Match this against your stored outcomes to determine the winner. |
| `result_total` | A numeric result value (e.g., total goals for soccer, total points for basketball). |
| `result_name` | Human-readable name of the winning outcome. |

Set `status_type = "finished"` and `is_live = false`.

### 5.5 Event Canceled

**`event.set_canceled`** -- The event has been voided. Approximately 7% of events are canceled instead of finished. No result is provided.

```json
{"method":"event.set_canceled","data":{"event_id":3001}}
```

Set `status_type = "canceled"` and `is_live = false`. All markets and outcomes for this event should be treated as void.

### 5.6 Event Removed

**`event.remove`** -- The event and all its data should be purged from your local state. Sent some time after the event finishes or is canceled.

```json
{"method":"event.remove","data":{"event_id":3001}}
```

Remove the event, all its markets, and all outcomes from your collections.

---

## 6. Market Handling

Markets belong to events and contain outcomes. They can be created at any point during an event's life.

### 6.1 Market Creation

**`market.insert`** -- A new market has been added to an event. Store it and index it by `market_id`. Link it to the parent event via `event_id`.

```json
{
  "method":"market.insert",
  "data":{
    "market_id":5001,
    "event_id":3001,
    "market_name":"1X2",
    "market_template_id":1,
    "market_order":1,
    "market_suspend":"no",
    "result_type_id":1,
    "outcomes":[
      {"outcome_id":6001,"market_id":5001,"outcome_name":"Lions","outcome_coef":2.10,"outcome_type_id":1,"outcome_visible":"yes","participant_id":4001},
      {"outcome_id":6002,"market_id":5001,"outcome_name":"Draw","outcome_coef":3.20,"outcome_type_id":2,"outcome_visible":"yes"},
      {"outcome_id":6003,"market_id":5001,"outcome_name":"Tigers","outcome_coef":3.40,"outcome_type_id":3,"outcome_visible":"yes","participant_id":4002}
    ]
  }
}
```

New markets can arrive **mid-event** (during live status). Your client must handle late-arriving markets.

### 6.2 Market Updates

**`market.update`** -- Market metadata has changed (typically the `market_suspend` field). Merge into your stored market.

### 6.3 Market Suspension

**`market.suspend`** -- The market is temporarily suspended. No bets should be accepted on this market's outcomes.

```json
{"method":"market.suspend","data":{"market_id":5001}}
```

Set `market_suspend = "yes"` on your local market.

**`market.unsuspend`** -- The market is back open for trading.

```json
{"method":"market.unsuspend","data":{"market_id":5001}}
```

Set `market_suspend = "no"` on your local market.

Suspensions happen every 10-30 seconds per live event, lasting 3-10 seconds each. Occasionally two markets on the same event suspend simultaneously.

### 6.4 Market Removal

**`market.remove`** -- Remove the market and all its outcomes from your local state.

```json
{"method":"market.remove","data":{"market_id":5001}}
```

---

## 7. Outcome & Odds Handling

Outcomes represent the selectable options within a market (e.g., "Home", "Draw", "Away" in a 1X2 market). Each outcome has a coefficient (decimal odds).

### 7.1 Outcome Creation

**`outcome.insert`** -- A new outcome has been added. Store it and link to its parent market via `market_id`.

```json
{
  "method":"outcome.insert",
  "data":{
    "outcome_id":6001,
    "market_id":5001,
    "outcome_name":"Lions",
    "outcome_coef":2.10,
    "outcome_type_id":1,
    "outcome_visible":"yes",
    "participant_id":4001
  }
}
```

### 7.2 Odds Updates

**`outcome.update`** -- The coefficient has changed. This is the **most frequent message** you will receive.

```json
{
  "method":"outcome.update",
  "data":{
    "outcome_id":6001,
    "market_id":5001,
    "outcome_name":"Lions",
    "outcome_coef":2.08,
    "outcome_type_id":1,
    "outcome_visible":"yes",
    "participant_id":4001
  }
}
```

Update your stored outcome's `outcome_coef` (and any other fields that may have changed).

**Update frequency:**
- During prematch: every 1-3 seconds, 1-2 outcomes per tick
- During live: every 0.5-2 seconds, 1-4 outcomes per tick

**Odds ladder:** All coefficients are snapped to a standard decimal odds ladder:

| Range | Step |
|---|---|
| 1.01 - 2.00 | 0.01 |
| 2.00 - 3.00 | 0.02 |
| 3.00 - 4.00 | 0.05 |
| 4.00 - 6.00 | 0.10 |
| 6.00 - 10.00 | 0.20 |
| 10.00 - 20.00 | 0.50 |
| 20.00 - 50.00 | 1.00 |
| 50.00 - 100.00 | 2.00 |
| 100.00 - 1000.00 | 5.00 |

Coefficients are always between `1.01` and `1000.00`.

### 7.3 Boolean String Convention

All boolean-like fields use `"yes"` / `"no"` strings, not actual booleans:
- `market_suspend`: `"yes"` or `"no"`
- `outcome_visible`: `"yes"` or `"no"`

---

## 8. Keep-Alive & Connection Health

### Ping

The server sends a `ping` every 10 seconds:

```json
{"method":"ping","data":{"ts":1710000000000}}
```

The `ts` field is the server's Unix timestamp in milliseconds. You can use this to detect clock drift or measure latency. No response is required.

### Idle Timeout

If the server receives **no data from your client** for 60 seconds, it closes the connection. If your client is read-only (never sends data after handshake), the connection will be closed after 60 seconds. To keep it alive, send any data periodically (even a newline).

### Reconnection

On disconnect, simply reconnect and re-handshake. The server will replay the full current state, so your client will be back in sync without any special recovery logic.

---

## 9. Data Hierarchy

### Sports

Three sports are available. Each event belongs to exactly one.

| sport_id | sport_name | sport_weight |
|---|---|---|
| 1 | Soccer | 100 |
| 2 | Basketball | 90 |
| 3 | Tennis | 80 |

`sport_weight` indicates display priority (higher = more prominent).

### Categories

Each sport has two categories. Categories represent regions or governing bodies.

| Sport | Categories |
|---|---|
| Soccer | England (GB), Spain (ES) |
| Basketball | USA (US), Europe (EU) |
| Tennis | ATP (INT), WTA (INT) |

Each category includes a `country_id` (ISO code) and `category_weight`.

### Tournaments

Each sport has two tournaments. Tournaments are assigned to events along with a category.

| Sport | Tournaments |
|---|---|
| Soccer | Premier League, La Liga |
| Basketball | Pro League, Euro Cup |
| Tennis | Masters, Open Series |

Each tournament includes a `tournament_weight`.

**Note:** Category and tournament IDs are generated fresh per event using monotonic counters. Do **not** assume the same tournament name always has the same ID across events. If you want to group events by tournament, match on `tournament_name` (or `tournament_name` + `sport_id`), not `tournament_id`.

### Market Templates by Sport

**Soccer:**
| template_id | Market Name | Outcomes |
|---|---|---|
| 1 | 1X2 | Home (type 1), Draw (type 2), Away (type 3) |
| 2 | Total Over/Under 2.5 | Over 2.5 (type 11), Under 2.5 (type 12) |
| 3 | Both Teams To Score | Yes (type 21), No (type 22) |
| 4 | Double Chance | 1X (type 31), 12 (type 32), X2 (type 33) |

**Basketball:**
| template_id | Market Name | Outcomes |
|---|---|---|
| 5 | Winner | Home (type 41), Away (type 42) |
| 6 | Total Points O/U | Over 171.5 (type 51), Under 171.5 (type 52) |
| 7 | Handicap | Home -4.5 (type 61), Away +4.5 (type 62) |
| 8 | First Half Winner | Home (type 71), Away (type 72) |

**Tennis:**
| template_id | Market Name | Outcomes |
|---|---|---|
| 9 | Winner | Player 1 (type 81), Player 2 (type 82) |
| 10 | Set Winner | Player 1 (type 91), Player 2 (type 92) |
| 11 | Total Games O/U | Over 22.5 (type 101), Under 22.5 (type 102) |
| 12 | First Set Total Games O/U | Over 9.5 (type 111), Under 9.5 (type 112) |

Each event gets 3-6 randomly selected market templates from its sport.

---

## 10. Full Method Reference

| Method | Direction | Payload | Action |
|---|---|---|---|
| `connect.success` | Server → Client | `{ status }` | Handshake accepted |
| `ping` | Server → Client | `{ ts }` | Keep-alive heartbeat |
| `event.announce` | Server → Client | Full event + markets + outcomes | New event preview (store it) |
| `event.insert` | Server → Client | Full event + markets + outcomes | Create/overwrite event in local state |
| `event.update` | Server → Client | Event fields (markets=[] empty) | Merge into existing event, preserve markets |
| `event.set_prematch` | Server → Client | `{ event_id }` | Set status to prematch |
| `event.set_live` | Server → Client | `{ event_id, is_live: true }` | Set status to live |
| `event.set_finished` | Server → Client | `{ event_id, result_id, result_total, result_name }` | Set status to finished, process result |
| `event.set_canceled` | Server → Client | `{ event_id }` | Set status to canceled, void all markets |
| `event.remove` | Server → Client | `{ event_id }` | Delete event + its markets + outcomes |
| `market.insert` | Server → Client | Full market + outcomes | Add market to event |
| `market.update` | Server → Client | Full market + outcomes | Update market fields |
| `market.suspend` | Server → Client | `{ market_id }` | Mark market as suspended |
| `market.unsuspend` | Server → Client | `{ market_id }` | Mark market as active |
| `market.remove` | Server → Client | `{ market_id }` | Delete market + its outcomes |
| `outcome.insert` | Server → Client | Full outcome | Add outcome to market |
| `outcome.update` | Server → Client | Full outcome | Update outcome (usually odds change) |

---

## 11. Field Reference

### Event

| Field | Type | Description |
|---|---|---|
| `event_id` | number | Unique event identifier |
| `event_name` | string | e.g., "Lions vs Tigers" |
| `event_dt` | number | Unix timestamp (seconds) of scheduled start |
| `status_type` | string | `"prematch"`, `"live"`, `"finished"`, `"canceled"` |
| `is_live` | boolean | `true` when live, `false` otherwise |
| `broadcast_url` | null | Always null (reserved) |
| `score` | string | e.g., `"1:0"` -- only present during/after live |
| `sport` | object | `{ sport_id, sport_name, sport_weight }` |
| `category` | object | `{ category_id, category_name, country_id, category_weight }` |
| `tournament` | object | `{ tournament_id, tournament_name, tournament_weight }` |
| `participants` | array | See Participant below |
| `markets` | array | Included in `insert`/`announce`, empty in `update` |

### Participant

| Field | Type | Description |
|---|---|---|
| `participant_id` | number | Unique participant identifier |
| `participant_name` | string | Team or player name |
| `participant_type` | string | Always `"team"` |
| `participant_number` | number | `1` for home/first, `2` for away/second |

### Market

| Field | Type | Description |
|---|---|---|
| `market_id` | number | Unique market identifier |
| `event_id` | number | Parent event |
| `market_name` | string | e.g., "1X2", "Total Over/Under 2.5" |
| `market_template_id` | number | Identifies the market type |
| `market_order` | number | Display order within the event |
| `market_suspend` | string | `"yes"` or `"no"` |
| `result_type_id` | number | Used for settlement matching |
| `outcomes` | array | See Outcome below |

### Outcome

| Field | Type | Description |
|---|---|---|
| `outcome_id` | number | Unique outcome identifier |
| `market_id` | number | Parent market |
| `outcome_name` | string | e.g., "Lions", "Draw", "Over 2.5" |
| `outcome_coef` | number | Decimal odds coefficient (1.01 - 1000.00) |
| `outcome_type_id` | number | Identifies the outcome type for settlement |
| `outcome_visible` | string | `"yes"` or `"no"` |
| `participant_id` | number or undefined | Links to a participant (when applicable) |

---

## 12. Example: Reconstructing State from Scratch

Here is the typical message sequence you see after connecting and completing the handshake, assuming 2 active events exist:

```
← connect.success

  -- State replay for Event 3001 --
← event.insert          (event_id=3001, with markets + outcomes)
← market.insert          (market_id=5001)
← outcome.insert         (outcome_id=6001)
← outcome.insert         (outcome_id=6002)
← outcome.insert         (outcome_id=6003)
← market.insert          (market_id=5002)
← outcome.insert         (outcome_id=6004)
← outcome.insert         (outcome_id=6005)
← event.set_prematch     (event_id=3001)

  -- State replay for Event 3002 --
← event.insert          (event_id=3002, with markets + outcomes)
← market.insert          (market_id=5003)
← outcome.insert         (outcome_id=6006)
← outcome.insert         (outcome_id=6007)
← market.suspend          (market_id=5003)      ← market was already suspended
← event.set_live         (event_id=3002)
← event.update           (event_id=3002, score="1:0")

  -- Live stream begins --
← outcome.update         (outcome_id=6002, coef=3.30)
← outcome.update         (outcome_id=6001, coef=2.12)
← ping                   (ts=...)
← market.unsuspend       (market_id=5003)
← outcome.update         (outcome_id=6006, coef=1.85)
← event.set_live         (event_id=3001)         ← first event goes live
← outcome.update         (outcome_id=6003, coef=3.50)
← market.insert          (market_id=5004)        ← new market mid-event
← outcome.insert         (outcome_id=6008)
← outcome.insert         (outcome_id=6009)
← market.suspend         (market_id=5001)
← ...
← market.unsuspend       (market_id=5001)
← event.set_finished     (event_id=3002, result_id=41, result_name="Comets")
← event.update           (event_id=3002, status_type="finished")
← event.remove           (event_id=3002)         ← cleanup, some seconds later
← event.announce         (event_id=3003)          ← replacement event spawns
← event.insert           (event_id=3003, ...)
← ...
```

Process each line top-to-bottom, applying the rules in this guide, and your local state will always mirror the server.
