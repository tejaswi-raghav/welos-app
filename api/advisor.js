import Anthropic from "@anthropic-ai/sdk";
import { sizeSystem, ruleAdvice, ruleAnswer, PRESET_QUESTIONS, TIERS, PACKAGES } from "../src/site/sizing.js";

// WELOS AI advisor. The deterministic engine owns every number; an LLM explains
// the build for this specific site, suggests improvements and answers questions.
// Provider order: Groq (free tier, GROQ_API_KEY) → Claude (ANTHROPIC_API_KEY) →
// rule-based answers. Any failure falls through, so the page always has an answer.

const CLAUDE_MODEL = "claude-opus-5-5";
// Groq retires models over time, so several are tried in order; GROQ_MODEL wins if set.
const GROQ_MODELS = [process.env.GROQ_MODEL, "openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b", "llama-3.1-8b-instant"].filter(Boolean);
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 30;
const hits = new Map();
const cache = new Map();

const CONTEXT = `WELOS is a modular rooftop system combining a solar canopy that doubles as a rain catchment, an optional vertical-axis wind turbine, LiFePO4 storage, rainwater treatment, optional AC-condensate recovery, panel cleaning, and an offline-first edge controller (WELOS OS). It comes in three scales (S villa, M residential, L commercial) and three packages (Essential: lowest upfront cost; Recommended: sized to load and climate; Max: fills the roof).

You receive a site's climate and a build that a deterministic sizing engine has already produced, including each component's capacity, cost in AED, the threshold rules that selected it, and the price of the same site in each package.

Rules:
- Never change, recompute or contradict the engine's numbers, sizes or prices. Quote them exactly when you use them.
- Tie every point to this site's actual climate values.
- Be realistic. Do not invent products, certifications, subsidies, tariffs or regulations.
- Be direct and specific. No hype, no filler, no emojis.`;

const ADVICE_SYSTEM = `You are the WELOS site advisor. ${CONTEXT}
- Explain why each subsystem is big, small, included or excluded here. Each text field is one to two sentences.
- Upgrades are concrete actions for this site; if the build is expensive for the customer, one upgrade should name the cheaper package and its exact price.
- Site questions are things to measure or confirm before installation.`;

const ANSWER_SYSTEM = `You are the WELOS site advisor answering a customer's question about their configured build. ${CONTEXT}
- Answer in at most 90 words, in plain prose (no lists, no markdown).
- If the question is not about WELOS, this site, energy, water or the build, say briefly that you can only help with their WELOS build.`;

const ADVICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "reasons", "upgrades", "questions"],
  properties: {
    headline: { type: "string", description: "Under 12 words: the defining trait of this site's build." },
    summary: { type: "string", description: "Two sentences on what this build does for this site." },
    reasons: {
      type: "array",
      description: "Four entries: why solar, water, wind and cleaning are sized the way they are here.",
      items: { type: "object", additionalProperties: false, required: ["component", "text"], properties: { component: { type: "string" }, text: { type: "string" } } },
    },
    upgrades: {
      type: "array",
      description: "Up to three improvements for this site.",
      items: {
        type: "object", additionalProperties: false, required: ["title", "text", "impact"],
        properties: { title: { type: "string" }, text: { type: "string" }, impact: { type: "string", enum: ["energy", "water", "cost", "resilience"] } },
      },
    },
    questions: { type: "array", description: "Two or three things to verify on site.", items: { type: "string" } },
  },
};

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer"],
  properties: { answer: { type: "string", description: "The answer, at most 90 words." } },
};

const finite = (value, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};
const clean = (value, max) => String(value ?? "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, max);

function readBody(req) {
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const climate = body.climate || {};
  const inputs = body.inputs || {};
  const choices = {};
  for (const id of ["wind", "condensate"]) if (typeof body.choices?.[id] === "boolean") choices[id] = body.choices[id];
  const preset = PRESET_QUESTIONS.find((q) => q.id === body.preset);
  return {
    place: clean(body.place || "this site", 120),
    tier: TIERS[body.tier] ? body.tier : "S",
    packageId: PACKAGES[body.package] ? body.package : "recommended",
    question: clean(preset?.text || body.question, 300),
    preset: preset?.id,
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

function compact(result, input) {
  const r = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
  const packages = Object.fromEntries(Object.keys(PACKAGES).map((id) => {
    const alt = sizeSystem(input.climate, input.tier, input.inputs, input.choices, id);
    return [id, { totalAed: alt.totals.totalAed, energyCoveragePct: r(alt.totals.energyCoveragePct, 0), monthlyAed: r(alt.totals.monthlyAed, 0) }];
  }));
  return {
    site: input.place,
    tier: `${result.tier.id} · ${result.tier.name} (${result.tier.audience})`,
    package: `${result.package.name}: ${result.package.blurb}`,
    climate: result.climate,
    inputs: result.site,
    components: result.components.map((p) => ({
      id: p.id, name: p.name, included: p.included, recommendedByEngine: p.recommended,
      capacity: p.capacity.text, spec: p.spec, output: p.output, costAed: p.costAed,
      rules: p.rules.map((x) => `${x.pass ? "PASS" : "FAIL"} ${x.test} → ${x.effect}`),
    })),
    totals: {
      totalAed: result.totals.totalAed, annualSavingsAed: r(result.totals.annualSavingsAed, 0),
      monthlyFinanceAed: r(result.totals.monthlyAed, 0), monthlySavingsAed: r(result.totals.monthlySavingsAed, 0),
      paybackYears: result.totals.paybackYears && r(result.totals.paybackYears),
      energyCoveragePct: r(result.totals.energyCoveragePct, 0), waterCoveragePct: r(result.totals.waterCoveragePct, 0),
      co2TonnesYear: r(result.totals.co2TonnesYear),
    },
    samesiteByPackage: packages,
  };
}

function rateLimited(req) {
  const ip = String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

const validAdvice = (a) => a && typeof a.headline === "string" && typeof a.summary === "string"
  && Array.isArray(a.reasons) && Array.isArray(a.upgrades) && Array.isArray(a.questions);
const validAnswer = (a) => a && typeof a.answer === "string" && a.answer.trim().length > 0;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  let input;
  try {
    input = readBody(req);
  } catch {
    return res.status(400).json({ error: "Invalid JSON body." });
  }
  const result = sizeSystem(input.climate, input.tier, input.inputs, input.choices, input.packageId);
  const asking = input.question.length > 0;
  const fallback = (reason) => res.status(200).json(asking
    ? { source: "rules", answer: (input.preset && ruleAnswer(result, input.preset)) || null, fallbackReason: reason }
    : { ...ruleAdvice(result, input.place), fallbackReason: reason });

  if (!process.env.GROQ_API_KEY && !process.env.ANTHROPIC_API_KEY) return fallback("not_configured");
  if (rateLimited(req)) return fallback("rate_limited");

  const payload = compact(result, input);
  const system = asking ? ANSWER_SYSTEM : ADVICE_SYSTEM;
  const schema = asking ? ANSWER_SCHEMA : ADVICE_SCHEMA;
  const user = `Site and engine output:\n${JSON.stringify(payload)}${asking ? `\n\nCustomer question: ${input.question}` : ""}`;
  const key = user;
  if (cache.has(key)) return res.status(200).json(cache.get(key));

  const reasons = [];
  for (const [enabled, ask] of [[process.env.GROQ_API_KEY, askGroq], [process.env.ANTHROPIC_API_KEY, askClaude]]) {
    if (!enabled) continue;
    try {
      const out = await ask(system, schema, user);
      let response;
      if (asking) {
        if (!validAnswer(out)) { reasons.push("invalid_output"); continue; }
        response = { source: "ai", answer: String(out.answer).slice(0, 1200) };
      } else {
        if (!validAdvice(out)) { reasons.push("invalid_output"); continue; }
        response = {
          source: "ai",
          headline: String(out.headline),
          summary: String(out.summary),
          reasons: out.reasons.slice(0, 5).map((r) => ({ component: String(r.component ?? ""), text: String(r.text ?? "") })),
          upgrades: out.upgrades.slice(0, 3).map((u) => ({ title: String(u.title ?? ""), text: String(u.text ?? ""), impact: String(u.impact ?? "") })),
          questions: out.questions.slice(0, 3).map(String),
        };
      }
      if (cache.size > 300) cache.clear();
      cache.set(key, response);
      return res.status(200).json(response);
    } catch (error) {
      reasons.push(error.code || error.message || "error");
    }
  }
  return fallback(reasons.join(",") || "error");
}

async function askGroq(system, schema, user) {
  const deadline = Date.now() + 22_000;
  let lastError = Object.assign(new Error("groq_unavailable"), { code: "groq_unavailable" });
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
          { role: "system", content: `${system}\n\nReply with only a JSON object matching this JSON Schema:\n${JSON.stringify(schema)}` },
          { role: "user", content: user },
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
    try {
      return JSON.parse(data.choices?.[0]?.message?.content);
    } catch {
      lastError = Object.assign(new Error("groq_bad_json"), { code: "groq_bad_json" });
    }
  }
  throw lastError;
}

async function askClaude(system, schema, user) {
  const client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
  try {
    const message = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content: user }],
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
