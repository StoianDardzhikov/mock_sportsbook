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

    const renderEvent = (event) => {
      const statusClass = esc(event.status_type);
      const score = event.score ? '<span class="pill">Score ' + esc(event.score) + '</span>' : "";
      const startsAt = new Date(event.event_dt * 1000).toLocaleString();
      const markets = event.markets.map((market) => (
        '<div class="market">' +
          '<h3>' + esc(market.market_name) + ' ' + (market.market_suspend === "yes" ? '<span class="pill">Suspended</span>' : "") + '</h3>' +
          market.outcomes.map((outcome) => (
            '<div class="outcome">' +
              '<span>' + esc(outcome.outcome_name) + '</span>' +
              '<strong>' + esc(outcome.outcome_coef) + '</strong>' +
            '</div>'
          )).join("") +
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
            '<div class="markets">' + (markets || '<div class="empty">No markets</div>') + '</div>' +
          '</div>' +
        '</section>'
      );
    };

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

export const createControlServer = ({ simulator, getConnectedClients }) => createServer((request, response) => {
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

  notFound(response);
});
