import Anthropic from "@anthropic-ai/sdk";
import { sizeSystem, ruleAdvice, TIERS } from "../src/site/sizing.js";

// WELOS AI advisor. The deterministic engine owns every number; an LLM explains
// the build for this specific site and suggests what to change or verify.
// Provider order: Groq (free tier, GROQ_API_KEY) → Claude (ANTHROPIC_API_KEY) →
// rule-based advice. Any failure falls through, so the page always has an answer.

const CLAUDE_MODEL = "claude-opus-5-5";
// Groq retires models over time, so several are tried in order; GROQ_MODEL wins if set.
const GROQ_MODELS = [process.env.GROQ_MODEL, "openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b", "llama-3.1-8b-instant"].filter(Boolean);
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
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

  if (!process.env.GROQ_API_KEY && !process.env.ANTHROPIC_API_KEY) return fallback("not_configured");
  if (rateLimited(req)) return fallback("rate_limited");

  const payload = compact(result, input.place);
  const key = JSON.stringify(payload);
  if (cache.has(key)) return res.status(200).json(cache.get(key));

  const reasons = [];
  for (const [enabled, ask] of [[process.env.GROQ_API_KEY, askGroq], [process.env.ANTHROPIC_API_KEY, askClaude]]) {
    if (!enabled) continue;
    try {
      const advice = await ask(payload);
      if (!valid(advice)) { reasons.push("invalid_output"); continue; }
      const response = {
        source: "ai",
        headline: String(advice.headline),
        summary: String(advice.summary),
        reasons: advice.reasons.slice(0, 5).map((r) => ({ component: String(r.component ?? ""), text: String(r.text ?? "") })),
        upgrades: advice.upgrades.slice(0, 3).map((u) => ({ title: String(u.title ?? ""), text: String(u.text ?? ""), impact: String(u.impact ?? "") })),
        questions: advice.questions.slice(0, 3).map(String),
      };
      if (cache.size > 200) cache.clear();
      cache.set(key, response);
      return res.status(200).json(response);
    } catch (error) {
      reasons.push(error.code || error.message || "error");
    }
  }
  return fallback(reasons.join(",") || "error");
}

async function askGroq(payload) {
  const deadline = Date.now() + 22_000;
  let lastError = new Error("groq_unavailable");
  for (const model of GROQ_MODELS) {
    const remaining = deadline - Date.now();
    if (remaining < 2_000) break;
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_completion_tokens: 2048,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${SYSTEM}\n\nReply with only a JSON object matching this JSON Schema:\n${JSON.stringify(SCHEMA)}` },
          { role: "user", content: `Site and engine output:\n${JSON.stringify(payload)}` },
        ],
      }),
      signal: AbortSignal.timeout(Math.min(remaining, 15_000)),
    }).catch((error) => ({ ok: false, status: 0, error }));
    if (!response.ok) {
      lastError = Object.assign(new Error(`groq_${response.status}`), { code: `groq_${response.status}` });
      // Auth and rate-limit errors won't improve with another model.
      if (response.status === 401 || response.status === 403 || response.status === 429) throw lastError;
      continue; // retired model (404/400), overload (5xx) or timeout: try the next model
    }
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    try {
      return JSON.parse(text);
    } catch {
      lastError = Object.assign(new Error("groq_bad_json"), { code: "groq_bad_json" });
    }
  }
  throw lastError;
}

async function askClaude(payload) {
  const client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
  try {
    const message = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: `Site and engine output:\n${JSON.stringify(payload)}` }],
    });
    if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") throw Object.assign(new Error(message.stop_reason), { code: `claude_${message.stop_reason}` });
    return JSON.parse(message.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
  } catch (error) {
    if (error.code) throw error;
    const code = error instanceof Anthropic.AuthenticationError ? "claude_auth"
      : error instanceof Anthropic.RateLimitError ? "claude_rate_limit"
        : error instanceof Anthropic.APIConnectionTimeoutError ? "claude_timeout"
          : error instanceof Anthropic.APIError ? `claude_${error.status ?? "error"}` : "claude_error";
    throw Object.assign(new Error(code), { code });
  }
}
