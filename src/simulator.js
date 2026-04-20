import { randomUUID } from "node:crypto";
import { catalog } from "./catalog.js";

class Rng {
  #state;

  constructor(seed) {
    this.#state = seed && Number.isFinite(seed) ? seed >>> 0 : this.hash(randomUUID());
  }

  next() {
    this.#state = (1664525 * this.#state + 1013904223) >>> 0;
    return this.#state / 0xffffffff;
  }

  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick(items) {
    return items[this.int(0, items.length - 1)];
  }

  shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = this.int(0, index);
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  hash(value) {
    let hash = 2166136261;
    for (const char of value) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
}

const snapToLadder = (value) => {
  const clamped = Math.min(1000, Math.max(1.01, value));
  const steps = [
    [2, 0.01],
    [3, 0.02],
    [4, 0.05],
    [6, 0.1],
    [10, 0.2],
    [20, 0.5],
    [50, 1],
    [100, 2],
    [1000, 5]
  ];

  for (const [max, step] of steps) {
    if (clamped <= max) {
      return Number((Math.round(clamped / step) * step).toFixed(2));
    }
  }

  return 1000;
};

export class Simulator {
  constructor(config, hooks) {
    this.config = config;
    this.hooks = hooks;
    this.rng = new Rng(config.seed);
    this.events = new Map();
    this.markets = new Map();
    this.outcomes = new Map();
    this.suspendedMarkets = new Set();
    this.catalogCounters = { category: 1000, tournament: 2000, event: 3000, participant: 4000, market: 5000, outcome: 6000 };
    this.maintainerIntervalMs = 2_000;
    this.maintainer = undefined;
    this.lastTickAt = null;
  }

  start() {
    this.ensureTargetEvents();
    this.maintainer = setInterval(() => this.ensureTargetEvents(), this.maintainerIntervalMs);
  }

  stop() {
    if (this.maintainer) {
      clearInterval(this.maintainer);
    }
    for (const runtime of this.events.values()) {
      this.clearEventTimers(runtime);
    }
    this.events.clear();
    this.markets.clear();
    this.outcomes.clear();
    this.suspendedMarkets.clear();
  }

  getSnapshot() {
    return {
      activeEvents: [...this.events.values()].map((runtime) => runtime.event),
      suspendedMarkets: [...this.suspendedMarkets.values()].sort((left, right) => left - right),
      connectedClients: this.hooks.getConnectedClients(),
      lastTickAt: this.lastTickAt
    };
  }

  spawnEvents(count) {
    return Array.from({ length: Math.max(0, count) }, () => this.createEvent());
  }

  finishEvent(eventId) {
    const runtime = this.events.get(eventId);
    if (!runtime || runtime.status === "finished" || runtime.status === "canceled") {
      return false;
    }
    this.finishRuntime(runtime, false);
    return true;
  }

  cancelEvent(eventId) {
    const runtime = this.events.get(eventId);
    if (!runtime || runtime.status === "finished" || runtime.status === "canceled") {
      return false;
    }
    this.cancelRuntime(runtime);
    return true;
  }

  suspendMarket(marketId) {
    const market = this.markets.get(marketId);
    if (!market) {
      return false;
    }
    this.setMarketSuspended(market, true);
    return true;
  }

  unsuspendMarket(marketId) {
    const market = this.markets.get(marketId);
    if (!market) {
      return false;
    }
    this.setMarketSuspended(market, false);
    return true;
  }

  setOutcomeOdds(outcomeId, coef) {
    const outcome = this.outcomes.get(outcomeId);
    if (!outcome) {
      return false;
    }
    outcome.outcome_coef = snapToLadder(coef);
    this.emit("outcome.update", { ...outcome });
    return true;
  }

  ensureTargetEvents() {
    const deficit = this.config.targetEventCount - this.events.size;
    if (deficit <= 0) {
      return;
    }
    this.spawnEvents(deficit);
  }

  createEvent() {
    const sport = this.rng.pick(catalog);
    const category = this.rng.pick(sport.categories);
    const tournament = this.rng.pick(sport.tournaments);
    const participants = this.createParticipants(sport);
    const eventId = this.nextId("event");
    const now = Date.now();
    const prematchSeconds = this.rng.int(30, 60);
    const lifetimeSeconds = this.rng.int(this.config.eventLifetimeMinSeconds, this.config.eventLifetimeMaxSeconds);
    const marketTemplates = this.rng.shuffle(sport.marketTemplates).slice(0, this.rng.int(3, Math.min(6, sport.marketTemplates.length)));
    const event = {
      event_id: eventId,
      event_name: `${participants[0].participant_name} vs ${participants[1].participant_name}`,
      event_dt: Math.floor((now + prematchSeconds * 1000) / 1000),
      status_type: "prematch",
      is_live: false,
      broadcast_url: null,
      sport: sport.sport,
      category: {
        category_id: this.nextId("category"),
        category_name: category.category_name,
        country_id: category.country_id,
        category_weight: category.category_weight
      },
      tournament: {
        tournament_id: this.nextId("tournament"),
        tournament_name: tournament.tournament_name,
        tournament_weight: tournament.tournament_weight
      },
      participants,
      markets: []
    };

    event.markets = marketTemplates.map((template, index) => this.createMarket(event, template, index + 1));
    const runtime = {
      event,
      createdAt: now,
      goLiveAt: now + prematchSeconds * 1000,
      finishAt: now + lifetimeSeconds * 1000,
      status: "prematch",
      startedLive: false
    };

    this.events.set(eventId, runtime);
    this.emit("event.announce", this.cloneEvent(event, true));
    this.emit("event.insert", this.cloneEvent(event, true));
    for (const market of event.markets) {
      this.emit("market.insert", this.cloneMarket(market));
      for (const outcome of market.outcomes) {
        this.emit("outcome.insert", { ...outcome });
      }
    }
    this.emit("event.set_prematch", { event_id: event.event_id });

    runtime.updateTimer = setTimeout(() => this.runEventLoop(runtime), this.rng.int(1_000, 2_000));
    runtime.finishTimer = setTimeout(() => this.finishOrCancel(runtime), Math.max(1, runtime.finishAt - now));
    return event;
  }

  createParticipants(sport) {
    const names = this.rng.shuffle(sport.participants).slice(0, 2);
    return names.map((name, index) => ({
      participant_id: this.nextId("participant"),
      participant_name: name,
      participant_type: "team",
      participant_number: index + 1
    }));
  }

  createMarket(event, template, order) {
    const marketId = this.nextId("market");
    const market = {
      market_id: marketId,
      event_id: event.event_id,
      market_name: template.name,
      market_template_id: template.templateId,
      market_order: order,
      market_suspend: "no",
      result_type_id: template.resultTypeId,
      outcomes: []
    };
    market.outcomes = this.createOutcomes(event, market, template);
    this.markets.set(marketId, market);
    return market;
  }

  createOutcomes(event, market, template) {
    const base = template.outcomes.length === 3 ? this.makeThreeWayOdds() : this.makeTwoWayOdds();
    return template.outcomes.map((templateOutcome, index) => {
      const participantId = typeof templateOutcome.participantIndex === "number"
        ? event.participants[templateOutcome.participantIndex]?.participant_id
        : undefined;
      const participantName = typeof templateOutcome.participantIndex === "number"
        ? event.participants[templateOutcome.participantIndex]?.participant_name
        : undefined;
      const outcome = {
        outcome_id: this.nextId("outcome"),
        market_id: market.market_id,
        outcome_name: participantName ?? templateOutcome.name,
        outcome_coef: base[index] ?? 2,
        outcome_type_id: templateOutcome.outcomeTypeId,
        outcome_visible: "yes",
        participant_id: participantId
      };
      this.outcomes.set(outcome.outcome_id, outcome);
      return outcome;
    });
  }

  makeTwoWayOdds() {
    const favorite = 1.45 + this.rng.next() * 1.25;
    const other = 1 / (this.randomOverround(1.04, 1.07) - 1 / favorite);
    return [snapToLadder(favorite), snapToLadder(other)];
  }

  makeThreeWayOdds() {
    const target = this.randomOverround(1.05, 1.08);
    const favorite = 1.9 + this.rng.next() * 1.2;
    const draw = 2.9 + this.rng.next() * 0.9;
    const inverse = Math.max(0.25, target - (1 / favorite + 1 / draw));
    const underdog = 1 / inverse;
    return [snapToLadder(favorite), snapToLadder(draw), snapToLadder(underdog)];
  }

  randomOverround(min, max) {
    return min + (max - min) * this.rng.next();
  }

  runEventLoop(runtime) {
    if (!this.events.has(runtime.event.event_id) || runtime.status === "finished" || runtime.status === "canceled") {
      return;
    }

    const now = Date.now();
    if (!runtime.startedLive && now >= runtime.goLiveAt) {
      runtime.startedLive = true;
      runtime.status = "live";
      runtime.event.status_type = "live";
      runtime.event.is_live = true;
      this.emit("event.set_live", { event_id: runtime.event.event_id, is_live: true });
      runtime.event.score = this.initialScore(runtime.event.sport.sport_name);
      this.emit("event.update", this.cloneEvent(runtime.event, false));
      this.scheduleSuspension(runtime);
      this.insertMidEventMarket(runtime);
    }

    if (runtime.status === "prematch") {
      this.updateOdds(runtime, this.rng.int(1, 2));
    } else if (runtime.status === "live") {
      this.updateOdds(runtime, this.rng.int(1, 4));
      if (this.rng.next() < 0.35) {
        runtime.event.score = this.nextScore(runtime.event.sport.sport_name, runtime.event.score);
        this.emit("event.update", this.cloneEvent(runtime.event, false));
      }
      if (this.rng.next() < 0.12) {
        this.insertMidEventMarket(runtime);
      }
    }

    this.lastTickAt = new Date().toISOString();
    const base = this.config.tickIntervalMs;
    runtime.updateTimer = setTimeout(
      () => this.runEventLoop(runtime),
      runtime.status === "live"
        ? this.rng.int(Math.max(250, Math.floor(base * 0.5)), Math.max(500, base * 2))
        : this.rng.int(Math.max(500, base), Math.max(1_000, base * 3))
    );
  }

  updateOdds(runtime, count) {
    const available = runtime.event.markets.filter((market) => market.market_suspend === "no").flatMap((market) => market.outcomes);
    for (const outcome of this.rng.shuffle(available).slice(0, Math.min(count, available.length))) {
      outcome.outcome_coef = this.adjustOutcomeCoef(runtime, outcome);
      this.emit("outcome.update", { ...outcome });
    }
  }

  adjustOutcomeCoef(runtime, outcome) {
    const market = this.markets.get(outcome.market_id);
    if (!market) {
      return outcome.outcome_coef;
    }

    if (market.market_name === "1X2") {
      const drifted = market.outcomes.map((entry) => snapToLadder(entry.outcome_coef * (0.97 + this.rng.next() * 0.06)));
      const overround = this.randomOverround(1.05, 1.08);
      const inverseSum = drifted.reduce((sum, price) => sum + 1 / price, 0);
      const scaled = drifted.map((price) => snapToLadder(price * (inverseSum / overround)));
      market.outcomes.forEach((entry, index) => {
        entry.outcome_coef = scaled[index] ?? entry.outcome_coef;
      });
      return market.outcomes.find((entry) => entry.outcome_id === outcome.outcome_id)?.outcome_coef ?? outcome.outcome_coef;
    }

    const factor = 0.95 + this.rng.next() * 0.1;
    return snapToLadder(outcome.outcome_coef * factor);
  }

  scheduleSuspension(runtime) {
    if (runtime.status !== "live") {
      return;
    }

    runtime.suspendTimer = setTimeout(() => {
      if (runtime.status !== "live") {
        return;
      }
      const markets = this.rng.shuffle(runtime.event.markets).slice(0, this.rng.next() < 0.2 ? 2 : 1);
      for (const market of markets) {
        this.setMarketSuspended(market, true);
        setTimeout(() => this.setMarketSuspended(market, false), this.rng.int(3_000, 10_000));
      }
      this.scheduleSuspension(runtime);
    }, this.rng.int(10_000, 30_000));
  }

  setMarketSuspended(market, suspended) {
    market.market_suspend = suspended ? "yes" : "no";
    if (suspended) {
      this.suspendedMarkets.add(market.market_id);
      this.emit("market.suspend", { market_id: market.market_id });
    } else {
      this.suspendedMarkets.delete(market.market_id);
      this.emit("market.unsuspend", { market_id: market.market_id });
    }
    this.emit("market.update", this.cloneMarket(market));
  }

  insertMidEventMarket(runtime) {
    const sport = catalog.find((entry) => entry.sport.sport_id === runtime.event.sport.sport_id);
    if (!sport) {
      return;
    }

    const existingTemplateIds = new Set(runtime.event.markets.map((market) => market.market_template_id));
    const candidate = this.rng.shuffle(sport.marketTemplates).find((template) => !existingTemplateIds.has(template.templateId));
    if (!candidate) {
      return;
    }

    const market = this.createMarket(runtime.event, candidate, runtime.event.markets.length + 1);
    runtime.event.markets.push(market);
    this.emit("market.insert", this.cloneMarket(market));
    for (const outcome of market.outcomes) {
      this.emit("outcome.insert", { ...outcome });
    }
  }

  finishOrCancel(runtime) {
    if (this.rng.next() < this.config.cancelProbability) {
      this.cancelRuntime(runtime);
      return;
    }
    this.finishRuntime(runtime, false);
  }

  finishRuntime(runtime, forceCleanup) {
    if (!this.events.has(runtime.event.event_id)) {
      return;
    }
    runtime.status = "finished";
    runtime.event.status_type = "finished";
    runtime.event.is_live = false;
    this.clearEventTimers(runtime);
    const winner = this.pickWinner(runtime);
    this.emit("event.set_finished", {
      event_id: runtime.event.event_id,
      result_id: winner.outcome_type_id,
      result_total: this.rng.int(0, runtime.event.sport.sport_name === "Basketball" ? 220 : 4),
      result_name: winner.outcome_name
    });
    this.emit("event.update", this.cloneEvent(runtime.event, false));
    this.scheduleCleanup(runtime, forceCleanup);
  }

  cancelRuntime(runtime) {
    if (!this.events.has(runtime.event.event_id)) {
      return;
    }
    runtime.status = "canceled";
    runtime.event.status_type = "canceled";
    runtime.event.is_live = false;
    this.clearEventTimers(runtime);
    this.emit("event.set_canceled", { event_id: runtime.event.event_id });
    this.emit("event.update", this.cloneEvent(runtime.event, false));
    this.scheduleCleanup(runtime, false);
  }

  pickWinner(runtime) {
    const market = runtime.event.markets.find((entry) => entry.outcomes.length >= 2) ?? runtime.event.markets[0];
    const weights = market.outcomes.map((outcome) => 1 / outcome.outcome_coef);
    const total = weights.reduce((sum, value) => sum + value, 0);
    let cursor = this.rng.next() * total;
    for (let index = 0; index < market.outcomes.length; index += 1) {
      cursor -= weights[index] ?? 0;
      if (cursor <= 0) {
        return market.outcomes[index];
      }
    }
    return market.outcomes[0];
  }

  scheduleCleanup(runtime, immediate) {
    runtime.cleanupTimer = setTimeout(() => {
      if (this.events.delete(runtime.event.event_id)) {
        this.emit("event.remove", { event_id: runtime.event.event_id });
      }
      for (const market of runtime.event.markets) {
        this.suspendedMarkets.delete(market.market_id);
        this.emit("market.remove", { market_id: market.market_id });
        this.markets.delete(market.market_id);
        for (const outcome of market.outcomes) {
          this.outcomes.delete(outcome.outcome_id);
        }
      }
    }, immediate ? 250 : this.rng.int(5_000, 15_000));
  }

  clearEventTimers(runtime) {
    if (runtime.updateTimer) {
      clearTimeout(runtime.updateTimer);
    }
    if (runtime.suspendTimer) {
      clearTimeout(runtime.suspendTimer);
    }
    if (runtime.finishTimer) {
      clearTimeout(runtime.finishTimer);
    }
  }

  emit(method, data) {
    this.lastTickAt = new Date().toISOString();
    this.hooks.emit({ method, data });
  }

  cloneEvent(event, includeMarkets) {
    return {
      ...event,
      participants: event.participants.map((participant) => ({ ...participant })),
      markets: includeMarkets ? event.markets.map((market) => this.cloneMarket(market)) : []
    };
  }

  cloneMarket(market) {
    return {
      ...market,
      outcomes: market.outcomes.map((outcome) => ({ ...outcome }))
    };
  }

  initialScore(sportName) {
    if (sportName === "Basketball") {
      return `${this.rng.int(18, 30)}:${this.rng.int(18, 30)}`;
    }
    return `${this.rng.int(0, 1)}:${this.rng.int(0, 1)}`;
  }

  nextScore(sportName, current) {
    const [leftRaw = "0", rightRaw = "0"] = (current ?? "0:0").split(":");
    const left = Number.parseInt(leftRaw, 10) || 0;
    const right = Number.parseInt(rightRaw, 10) || 0;
    if (sportName === "Tennis") {
      return `${left + this.rng.int(0, 1)}:${right + this.rng.int(0, 1)}`;
    }
    const side = this.rng.next() < 0.5 ? 0 : 1;
    return side === 0 ? `${left + 1}:${right}` : `${left}:${right + 1}`;
  }

  nextId(type) {
    this.catalogCounters[type] += 1;
    return this.catalogCounters[type];
  }
}
