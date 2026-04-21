import { createServer } from "node:http";
import { URL } from "node:url";

const json = (response, statusCode, payload) => {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
};

const html = (response, statusCode, payload) => {
  response.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
  response.end(payload);
};

const readJsonBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const notFound = (response) => json(response, 404, { error: "not_found" });

const renderDashboard = () => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mock Sportsbook Dashboard</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1020;
      --panel: #11182d;
      --panel-alt: #18223f;
      --border: #273457;
      --text: #e7ecff;
      --muted: #9fb0df;
      --good: #2ecc71;
      --warn: #f39c12;
      --bad: #e74c3c;
      --accent: #7c9cff;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, Segoe UI, Arial, sans-serif;
      background: linear-gradient(180deg, #0a0f1d 0%, #0f1730 100%);
      color: var(--text);
    }

    .page {
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px;
    }

    h1, h2, h3, p { margin: 0; }

    .hero {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: end;
      margin-bottom: 24px;
    }

    .hero p { color: var(--muted); margin-top: 8px; }

    .meta {
      text-align: right;
      color: var(--muted);
      font-size: 14px;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }

    .card, .event-card {
      background: rgba(17, 24, 45, 0.94);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
    }

    .card {
      padding: 16px;
      min-height: 96px;
    }

    .label {
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 10px;
    }

    .value {
      font-size: 32px;
      font-weight: 700;
    }

    .content {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 20px;
    }

    .panel {
      background: rgba(12, 18, 34, 0.88);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 16px;
    }

    .panel h2 {
      margin-bottom: 12px;
      font-size: 18px;
    }

    .feed {
      display: grid;
      gap: 14px;
    }

    .event-card {
      overflow: hidden;
    }

    .event-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 16px;
      border-bottom: 1px solid var(--border);
      background: linear-gradient(90deg, rgba(124, 156, 255, 0.10), rgba(124, 156, 255, 0.02));
    }

    .event-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: rgba(24, 34, 63, 0.9);
      color: var(--muted);
      font-size: 12px;
    }

    .pill.live { color: #08120b; background: var(--good); border-color: transparent; }
    .pill.prematch { color: #1a1303; background: var(--warn); border-color: transparent; }
    .pill.finished, .pill.canceled { color: white; background: var(--bad); border-color: transparent; }

    .event-body {
      padding: 16px;
      display: grid;
      gap: 14px;
    }

     .event-details {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.95fr);
      gap: 14px;
      align-items: start;
    }

    .markets {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px;
    }

    .market {
      background: var(--panel-alt);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px;
    }

    .market h3 {
      font-size: 14px;
      margin-bottom: 10px;
    }

    .market-head {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: start;
      margin-bottom: 10px;
    }

    .market-meta, .outcome-meta {
      color: var(--muted);
      font-size: 12px;
    }

    .outcome {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 6px 0;
      border-top: 1px solid rgba(159, 176, 223, 0.08);
      color: var(--muted);
      font-size: 14px;
    }

    .outcome:first-of-type { border-top: 0; }

    .outcome-main {
      display: grid;
      gap: 3px;
    }

    .settlement {
      background: rgba(17, 24, 45, 0.62);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px;
      display: grid;
      gap: 12px;
    }

    .settlement-grid {
      display: grid;
      gap: 10px;
    }

    .settlement-row {
      display: grid;
      gap: 6px;
    }

    label {
      font-size: 13px;
      color: var(--muted);
    }

    select, button {
      width: 100%;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: #0f1730;
      color: var(--text);
      padding: 10px 12px;
      font: inherit;
    }

    button {
      cursor: pointer;
      background: linear-gradient(180deg, #7c9cff, #5b76d6);
      border-color: transparent;
      font-weight: 600;
    }

    button:disabled {
      cursor: wait;
      opacity: 0.7;
    }

    .settlement-status {
      min-height: 18px;
      color: var(--muted);
      font-size: 13px;
    }

    .settlement-status.error { color: #ff9b9b; }
    .settlement-status.success { color: #9ef0b8; }

    .empty {
      padding: 24px;
      text-align: center;
      color: var(--muted);
      border: 1px dashed var(--border);
      border-radius: 16px;
      background: rgba(17, 24, 45, 0.5);
    }

    .small {
      color: var(--muted);
      font-size: 13px;
    }

    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 12px;
      color: var(--muted);
    }

    @media (max-width: 900px) {
      .hero, .content { grid-template-columns: 1fr; display: grid; }
      .meta { text-align: left; }
      .event-details { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="hero">
      <div>
        <h1>Mock Sportsbook Dashboard</h1>
        <p>Live view of the current in-memory simulator state.</p>
      </div>
      <div class="meta">
        <div id="refresh-status">Refreshing...</div>
        <div id="last-updated">-</div>
      </div>
    </div>

    <div class="stats" id="stats"></div>

    <div class="content">
      <div class="panel">
        <h2>Service Snapshot</h2>
        <pre id="snapshot-meta">Loading...</pre>
      </div>
      <div>
        <div class="panel" style="margin-bottom: 14px;">
          <h2>Active Events</h2>
          <div class="small">Auto-refreshes every 2 seconds.</div>
        </div>
        <div class="feed" id="events"></div>
      </div>
    </div>
  </div>

  <script>
    const statsNode = document.getElementById("stats");
    const eventsNode = document.getElementById("events");
    const snapshotMetaNode = document.getElementById("snapshot-meta");
    const refreshStatusNode = document.getElementById("refresh-status");
    const lastUpdatedNode = document.getElementById("last-updated");
    const settlementState = new Map();

    const statCard = (label, value) => (
      '<div class="card">' +
        '<div class="label">' + esc(label) + '</div>' +
        '<div class="value">' + esc(value) + '</div>' +
      '</div>'
    );

    const esc = (value) => String(value ?? "").replace(/[&<>\"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '\"': "&quot;"
    }[char]));

    const getEventSelections = (event) => {
      const existing = settlementState.get(event.event_id) ?? {};
      const next = {};
      for (const market of event.markets) {
        const selectedOutcomeId = existing[market.market_id];
        if (market.outcomes.some((outcome) => outcome.outcome_id === selectedOutcomeId)) {
          next[market.market_id] = selectedOutcomeId;
        }
      }
      settlementState.set(event.event_id, next);
      return next;
    };

    const renderOutcomeOption = (outcome, selectedOutcomeId) => (
      '<option value="' + esc(outcome.outcome_id) + '"' + (outcome.outcome_id === selectedOutcomeId ? ' selected' : '') + '>' +
        esc(outcome.outcome_name) + ' (#' + esc(outcome.outcome_id) + ', type ' + esc(outcome.outcome_type_id) + ', ' + esc(outcome.outcome_coef) + ')' +
      '</option>'
    );

    const renderEvent = (event) => {
      const statusClass = esc(event.status_type);
      const score = event.score ? '<span class="pill">Score ' + esc(event.score) + '</span>' : "";
      const startsAt = new Date(event.event_dt * 1000).toLocaleString();
      const selections = getEventSelections(event);
      const markets = event.markets.map((market) => (
        '<div class="market">' +
          '<div class="market-head">' +
            '<div>' +
              '<h3>' + esc(market.market_name) + '</h3>' +
              '<div class="market-meta">Market #' + esc(market.market_id) + ' • Template ' + esc(market.market_template_id) + ' • Result type ' + esc(market.result_type_id) + '</div>' +
            '</div>' +
            (market.market_suspend === "yes" ? '<span class="pill">Suspended</span>' : '') +
          '</div>' +
          market.outcomes.map((outcome) => (
            '<div class="outcome">' +
              '<div class="outcome-main">' +
                '<span>' + esc(outcome.outcome_name) + '</span>' +
                '<div class="outcome-meta">Outcome #' + esc(outcome.outcome_id) + ' • Type ' + esc(outcome.outcome_type_id) + (outcome.participant_id ? ' • Participant #' + esc(outcome.participant_id) : '') + '</div>' +
              '</div>' +
              '<strong>' + esc(outcome.outcome_coef) + '</strong>' +
            '</div>'
          )).join("") +
        '</div>'
      )).join("");
      const settlementControls = event.markets.map((market) => (
        '<div class="settlement-row">' +
          '<label for="settle-' + esc(event.event_id) + '-' + esc(market.market_id) + '">' + esc(market.market_name) + ' (#' + esc(market.market_id) + ')</label>' +
          '<select id="settle-' + esc(event.event_id) + '-' + esc(market.market_id) + '" data-event-id="' + esc(event.event_id) + '" data-market-id="' + esc(market.market_id) + '">' +
            '<option value="">Choose winner</option>' +
            market.outcomes.map((outcome) => renderOutcomeOption(outcome, selections[market.market_id])).join("") +
          '</select>' +
        '</div>'
      )).join("");

      return (
        '<section class="event-card">' +
          '<div class="event-head">' +
            '<div>' +
              '<h2>' + esc(event.event_name) + '</h2>' +
              '<div class="event-meta">' +
                '<span class="pill ' + statusClass + '">' + esc(event.status_type) + '</span>' +
                score +
                '<span class="pill">' + esc(event.sport.sport_name) + '</span>' +
                '<span class="pill">' + esc(event.category.category_name) + '</span>' +
                '<span class="pill">' + esc(event.tournament.tournament_name) + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="small">Starts ' + esc(startsAt) + '</div>' +
          '</div>' +
          '<div class="event-body">' +
            '<div class="small">Event #' + esc(event.event_id) + ' • Participants: ' + event.participants.map((participant) => esc(participant.participant_name)).join(' vs ') + '</div>' +
            '<div class="event-details">' +
              '<div class="markets">' + (markets || '<div class="empty">No markets</div>') + '</div>' +
              '<form class="settlement" data-event-id="' + esc(event.event_id) + '">' +
                '<div>' +
                  '<h3>Force Settle</h3>' +
                  '<div class="small">Pick a winner for each market, then settle the event immediately.</div>' +
                '</div>' +
                '<div class="settlement-grid">' + settlementControls + '</div>' +
                '<button type="submit">Settle Event</button>' +
                '<div class="settlement-status" id="settlement-status-' + esc(event.event_id) + '"></div>' +
              '</form>' +
            '</div>' +
          '</div>' +
        '</section>'
      );
    };

    const updateSelection = (eventId, marketId, outcomeId) => {
      const selections = settlementState.get(eventId) ?? {};
      if (outcomeId) {
        selections[marketId] = Number(outcomeId);
      } else {
        delete selections[marketId];
      }
      settlementState.set(eventId, selections);
    };

    const setSettlementStatus = (eventId, message, tone) => {
      const node = document.getElementById('settlement-status-' + eventId);
      if (!node) {
        return;
      }
      node.textContent = message;
      node.className = 'settlement-status' + (tone ? ' ' + tone : '');
    };

    const settleEvent = async (eventId, submitter) => {
      const selections = settlementState.get(eventId) ?? {};
      const eventCard = submitter.closest('.event-card');
      const marketCount = eventCard ? eventCard.querySelectorAll('select[data-market-id]').length : 0;
      if (Object.keys(selections).length !== marketCount) {
        setSettlementStatus(eventId, 'Choose a winner for every market first.', 'error');
        return;
      }

      submitter.disabled = true;
      setSettlementStatus(eventId, 'Settling event...', '');

      try {
        const response = await fetch('/scenario/settle/' + eventId, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ winners: selections })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || 'settlement_failed');
        }
        settlementState.delete(eventId);
        setSettlementStatus(eventId, 'Event settled.', 'success');
        await refresh();
      } catch (error) {
        setSettlementStatus(eventId, String(error.message || error), 'error');
      } finally {
        submitter.disabled = false;
      }
    };

    eventsNode.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement) || !target.dataset.eventId || !target.dataset.marketId) {
        return;
      }
      updateSelection(Number(target.dataset.eventId), Number(target.dataset.marketId), target.value);
    });

    eventsNode.addEventListener('submit', (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.dataset.eventId) {
        return;
      }
      event.preventDefault();
      const submitter = form.querySelector('button[type="submit"]');
      if (!(submitter instanceof HTMLButtonElement)) {
        return;
      }
      settleEvent(Number(form.dataset.eventId), submitter);
    });

    const render = (health, state) => {
      statsNode.innerHTML = [
        statCard("Connected Clients", health.connectedClients),
        statCard("Active Events", health.activeEvents),
        statCard("Suspended Markets", state.suspendedMarkets.length),
        statCard("Last Tick", state.lastTickAt ? new Date(state.lastTickAt).toLocaleTimeString() : "-")
      ].join("");

      snapshotMetaNode.textContent = JSON.stringify({
        status: health.status,
        connectedClients: health.connectedClients,
        activeEvents: health.activeEvents,
        suspendedMarkets: state.suspendedMarkets,
        lastTickAt: state.lastTickAt
      }, null, 2);

      if (state.activeEvents.length === 0) {
        eventsNode.innerHTML = '<div class="empty">No active events right now.</div>';
        return;
      }

      eventsNode.innerHTML = state.activeEvents.map(renderEvent).join("");
    };

    const refresh = async () => {
      try {
        const [healthResponse, stateResponse] = await Promise.all([
          fetch("/health"),
          fetch("/state")
        ]);
        const [health, state] = await Promise.all([
          healthResponse.json(),
          stateResponse.json()
        ]);
        render(health, state);
        refreshStatusNode.textContent = "Connected";
        lastUpdatedNode.textContent = 'Last updated ' + new Date().toLocaleTimeString();
      } catch (error) {
        refreshStatusNode.textContent = "Refresh failed";
        lastUpdatedNode.textContent = String(error);
      }
    };

    refresh();
    setInterval(refresh, 2000);
  </script>
</body>
</html>`;

export const createControlServer = ({ simulator, getConnectedClients }) => createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");

  if (method === "GET" && url.pathname === "/dashboard") {
    html(response, 200, renderDashboard());
    return;
  }

  if (method === "GET" && url.pathname === "/health") {
    const snapshot = simulator.getSnapshot();
    json(response, 200, {
      status: "ok",
      connectedClients: getConnectedClients(),
      activeEvents: snapshot.activeEvents.length
    });
    return;
  }

  if (method === "GET" && url.pathname === "/state") {
    json(response, 200, simulator.getSnapshot());
    return;
  }

  if (method === "POST" && url.pathname === "/scenario/spawn") {
    const count = Number.parseInt(url.searchParams.get("count") ?? "1", 10) || 1;
    json(response, 200, { spawned: simulator.spawnEvents(count).map((event) => event.event_id) });
    return;
  }

  const eventFinish = url.pathname.match(/^\/scenario\/finish\/(\d+)$/);
  if (method === "POST" && eventFinish) {
    const ok = simulator.finishEvent(Number.parseInt(eventFinish[1], 10));
    json(response, ok ? 200 : 404, { ok });
    return;
  }

  const eventCancel = url.pathname.match(/^\/scenario\/cancel\/(\d+)$/);
  if (method === "POST" && eventCancel) {
    const ok = simulator.cancelEvent(Number.parseInt(eventCancel[1], 10));
    json(response, ok ? 200 : 404, { ok });
    return;
  }

  const suspend = url.pathname.match(/^\/scenario\/suspend\/(\d+)$/);
  if (method === "POST" && suspend) {
    const ok = simulator.suspendMarket(Number.parseInt(suspend[1], 10));
    json(response, ok ? 200 : 404, { ok });
    return;
  }

  const unsuspend = url.pathname.match(/^\/scenario\/unsuspend\/(\d+)$/);
  if (method === "POST" && unsuspend) {
    const ok = simulator.unsuspendMarket(Number.parseInt(unsuspend[1], 10));
    json(response, ok ? 200 : 404, { ok });
    return;
  }

    const odds = url.pathname.match(/^\/scenario\/odds\/(\d+)$/);
    if (method === "POST" && odds) {
      const coef = Number.parseFloat(url.searchParams.get("coef") ?? "");
      const ok = Number.isFinite(coef) && simulator.setOutcomeOdds(Number.parseInt(odds[1], 10), coef);
      json(response, ok ? 200 : 404, { ok });
      return;
    }

    const settle = url.pathname.match(/^\/scenario\/settle\/(\d+)$/);
    if (method === "POST" && settle) {
      try {
        const body = await readJsonBody(request);
        const ok = simulator.settleEvent(Number.parseInt(settle[1], 10), body.winners);
        json(response, ok ? 200 : 404, ok ? { ok } : { ok, error: "invalid_settlement" });
      } catch {
        json(response, 400, { ok: false, error: "invalid_json" });
      }
      return;
    }

  notFound(response);
});
