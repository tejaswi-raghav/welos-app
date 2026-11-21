import Anthropic from "@anthropic-ai/sdk";
import { sizeSystem, ruleAdvice, TIERS } from "../src/site/sizing.js";

// WELOS AI advisor. The deterministic engine owns every number; Claude explains
// the build for this specific site and suggests what to change or verify.
// Any failure (no key, timeout, refusal, bad output) returns the rule-based
// advice instead, so the page always has an answer.

const MODEL = "claude-opus-5-5";
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const hits = new Map();
const cache = new Map();

const SYSTEM = `You are the WELOS site advisor. WELOS is a modular rooftop system combining a solar canopy that doubles as a rain catchment, an optional vertical-axis wind turbine, LiFePO4 storage, rainwater treatment, optional AC-condensate recovery, automated panel cleaning, and an offline-first edge controller (WELOS OS).

You receive a site's climate and a build that a deterministic sizing engine has already produced, including each component's capacity, cost in AED and the threshold rules that selected it. Explain that build to a customer and an investor audience.

Rules:
- Never change, recompute or contradict the engine's numbers, sizes or prices. Quote them exactly when you use them.
- Tie every point to this site's actual climate values: why each subsystem is big, small, included or excluded here.
- Upgrades must be concrete, realistic actions for this site and tier. Do not invent products, certifications, subsidies, tariffs or regulations.
- Site questions are things to measure or confirm before installation.
- Be direct and specific. No hype, no filler, no emojis. Each text field is one to two sentences.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "reasons", "upgrades", "questions"],
  properties: {
    headline: { type: "string", description: "Under 12 words: the defining trait of this site's build." },
    summary: { type: "string", description: "Two sentences on what this build does for this site." },
    reasons: {
      type: "array",
      description: "Four entries: why solar, water, wind and cleaning are sized the way they are here.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["component", "text"],
        properties: { component: { type: "string" }, text: { type: "string" } },
      },
    },
    upgrades: {
      type: "array",
      description: "Up to three improvements for this site.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "text", "impact"],
        properties: {
          title: { type: "string" },
          text: { type: "string" },
          impact: { type: "string", enum: ["energy", "water", "cost", "resilience"] },
        },
      },
    },
    questions: { type: "array", description: "Two or three things to verify on site.", items: { type: "string" } },
  },
};

const finite = (value, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

function readBody(req) {
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const climate = body.climate || {};
  const inputs = body.inputs || {};
  const choices = {};
  for (const id of ["wind", "condensate"]) if (typeof body.choices?.[id] === "boolean") choices[id] = body.choices[id];
  return {
    place: String(body.place || "this site").replace(/[\u0000-\u001f<>]/g, "").slice(0, 120),
    tier: TIERS[body.tier] ? body.tier : "S",
    climate: {
      solarDailyKwhM2: finite(climate.solarDailyKwhM2, 0, 12),
      windMs: finite(climate.windMs, 0, 40),
      rainMmYear: finite(climate.rainMmYear, 0, 15000),
      humidityPct: finite(climate.humidityPct, 0, 100),
      tempC: finite(climate.tempC, -60, 60),
    },
    inputs: {
      roofM2: finite(inputs.roofM2, 1, 200000),
      loadKwhDay: finite(inputs.loadKwhDay, 0, 500000),
      waterLDay: finite(inputs.waterLDay, 0, 5000000),
    },
    choices,
  };
}

function compact(result, place) {
  const r = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
  return {
    site: place,
    tier: `${result.tier.id} · ${result.tier.name} (${result.tier.audience})`,
    climate: result.climate,
    inputs: result.site,
    components: result.components.map((p) => ({
      id: p.id, name: p.name, included: p.included, recommendedByEngine: p.recommended,
      capacity: p.capacity.text, spec: p.spec, output: p.output, costAed: p.costAed,
      rules: p.rules.map((x) => `${x.pass ? "PASS" : "FAIL"} ${x.test} → ${x.effect}`),
    })),
    totals: {
      totalAed: result.totals.totalAed, annualSavingsAed: r(result.totals.annualSavingsAed, 0),
      paybackYears: result.totals.paybackYears && r(result.totals.paybackYears),
      energyCoveragePct: r(result.totals.energyCoveragePct, 0), waterCoveragePct: r(result.totals.waterCoveragePct, 0),
      co2TonnesYear: r(result.totals.co2TonnesYear),
    },
  };
}

function rateLimited(req) {
  const ip = String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

function valid(advice) {
  return advice && typeof advice.headline === "string" && typeof advice.summary === "string"
    && Array.isArray(advice.reasons) && Array.isArray(advice.upgrades) && Array.isArray(advice.questions);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  let input;
  try {
    input = readBody(req);
  } catch {
    return res.status(400).json({ error: "Invalid JSON body." });
  }
  const result = sizeSystem(input.climate, input.tier, input.inputs, input.choices);
  const fallback = (reason) => res.status(200).json({ ...ruleAdvice(result, input.place), fallbackReason: reason });

  if (!process.env.ANTHROPIC_API_KEY) return fallback("not_configured");
  if (rateLimited(req)) return fallback("rate_limited");

  const payload = compact(result, input.place);
  const key = JSON.stringify(payload);
  if (cache.has(key)) return res.status(200).json(cache.get(key));

  try {
    const client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
    const message = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: `Site and engine output:\n${JSON.stringify(payload)}` }],
    });
    if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return fallback(message.stop_reason);
    const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const advice = JSON.parse(text);
    if (!valid(advice)) return fallback("invalid_output");
    const response = {
      source: "ai",
      headline: advice.headline,
      summary: advice.summary,
      reasons: advice.reasons.slice(0, 5),
      upgrades: advice.upgrades.slice(0, 3),
      questions: advice.questions.slice(0, 3),
    };
    if (cache.size > 200) cache.clear();
    cache.set(key, response);
    return res.status(200).json(response);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return fallback("auth");
    if (error instanceof Anthropic.RateLimitError) return fallback("upstream_rate_limit");
    if (error instanceof Anthropic.APIConnectionTimeoutError) return fallback("timeout");
    if (error instanceof Anthropic.APIError) return fallback(`upstream_${error.status ?? "error"}`);
    return fallback("error");
  }
}
