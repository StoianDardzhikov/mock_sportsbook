# Mock Sportsbook Provider

Standalone Node.js service that emulates a Betinvest-style sportsbook feed over raw TCP plus a tiny HTTP control surface for manual testing.

## Run

```bash
npm install
npm run start
```

Development mode:

```bash
npm run dev
```

Smoke test:

```bash
npm test
```

## Aggregator Wiring

Point the VLR Game Aggregator at this mock with:

```properties
betinvest.host=localhost
betinvest.port=7887
betinvest.app_key=anything
```

The mock accepts any `app_key` and replies with `connect.success` after the TCP handshake.

## Configuration

```bash
MOCK_TCP_PORT=7887
MOCK_HTTP_PORT=7888
MOCK_TARGET_EVENT_COUNT=5
MOCK_EVENT_LIFETIME_MIN_SECONDS=240
MOCK_EVENT_LIFETIME_MAX_SECONDS=300
MOCK_TICK_INTERVAL_MS=1000
MOCK_CANCEL_PROBABILITY=0.07
MOCK_SEED=
```

## HTTP Control Surface

- `GET /health`
- `GET /state`
- `POST /scenario/spawn?count=3`
- `POST /scenario/finish/:eventId`
- `POST /scenario/cancel/:eventId`
- `POST /scenario/suspend/:marketId`
- `POST /scenario/unsuspend/:marketId`
- `POST /scenario/odds/:outcomeId?coef=2.30`

## Emitted Methods

Every TCP message is one JSON object per line.

- `connect.success`
```json
{ "method": "connect.success", "data": { "status": "ok" } }
```

- `ping`
```json
{ "method": "ping", "data": { "ts": 1710000000000 } }
```

- `event.announce`
- `event.insert`
- `event.update`
- `event.set_prematch`
- `event.set_live`
- `event.set_finished`
- `event.set_canceled`
- `event.remove`
- `market.insert`
- `market.suspend`
- `market.unsuspend`
- `market.remove`
- `outcome.insert`
- `outcome.update`

Example `event.insert`:

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

Example `outcome.update`:

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

Example `event.set_finished`:

```json
{
  "method": "event.set_finished",
  "data": {
    "event_id": 3001,
    "result_id": 1,
    "result_total": 2,
    "result_name": "Lions"
  }
}
```
# mock_sportsbook
