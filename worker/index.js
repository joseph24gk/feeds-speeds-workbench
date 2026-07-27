const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const streaming = url.searchParams.get("stream") === "1";
    try {
      if (request.method !== "POST") return json({ error: "POST required" }, 405);
      if (url.pathname === "/api/tool-lookup") return await toolLookup(request, env, ctx, streaming);
      if (url.pathname === "/api/curve-digitize") return await curveDigitize(request, env);
      if (url.pathname === "/api/machine-curves") return await machineCurves(request, env, ctx, streaming);
      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: err.message || "Worker error" }, 500);
    }
  },
};

/* With ?stream=1 the response is an SSE stream of {type:"progress",msg} events
   (real milestones surfaced from the provider's own stream: web searches
   starting/finishing, text being written, retry attempts) followed by a final
   {type:"result",data} or {type:"error",error}. Keeps the shop floor informed
   during 1–5 min lookups instead of a silent spinner. */
function sseResponse(ctx, runner) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const send = (obj) => writer.write(enc.encode("data: " + JSON.stringify(obj) + "\n\n")).catch(() => {});
  const heartbeat = setInterval(() => writer.write(enc.encode(": hb\n\n")).catch(() => {}), 10000);
  ctx.waitUntil((async () => {
    try {
      const result = await runner((msg) => send({ type: "progress", msg }));
      await send({ type: "result", data: result });
    } catch (err) {
      await send({ type: "error", error: err.message || "Worker error" });
    }
    clearInterval(heartbeat);
    try { await writer.close(); } catch { /* client already gone */ }
  })());
  return new Response(readable, {
    headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}

async function toolLookup(request, env, ctx, streaming) {
  const { brand, pn } = await request.json();
  if (!brand || !pn) return json({ error: "brand and pn are required" }, 400);
  const prompt = `Search the web for the cutting tool "${brand} ${pn}" (a milling cutter, drill, or tap part/order number from a tooling manufacturer).

Identify the tool and its manufacturer-published cutting data, from the manufacturer or official catalog/distributor data. Respond with ONLY a raw JSON object, no markdown fences, no preamble, matching exactly this schema:
{
 "found": true|false,
 "confidence": "high"|"medium"|"low",
 "tool": {
   "brand": string, "pn": string,
   "series": string (SHORT family/series name only, like "MaxiMet", "KenCut AL", "FIREX", "HEV" — no part numbers, no catalog designation codes, no flute counts),
   "name": string (fuller description incl. catalog designation if any),
   "type": "square_endmill"|"ball_endmill"|"chamfer_mill"|"drill"|"tap",
   "dia_in": number (max cutting diameter in inches; for taps use nominal thread major diameter),
   "flutes": number, "coating": string, "loc_in": number|null (length of cut, inches),
   "pitch_in": number|null (taps only: thread pitch in inches per rev — convert metric pitch: mm/25.4),
   "metric_callout": true|false (true if the tool is specified in metric, e.g. an 8.5mm drill or M10×1.5 tap),
   "included_angle_deg": number|null (chamfer mills only: full included angle, e.g. 90),
   "tip_dia_in": number|null (chamfer mills only: flat/tip diameter, 0 if pointed)
 },
 "cutting": [
   { "group": one of "N1","N2","N3","N4","P1","P2","P3","M1","M2","M3","K1","S1","S2","H1",
     "sfm_lo": number, "sfm_hi": number,
     "ipt_lo": number, "ipt_hi": number (feed per tooth in inches; for drills use feed per REV) }
 ],
 "sources": [array of source URLs],
 "notes": string (1-2 sentences: intended materials, anything important)
}

Group key: N=nonferrous (N1 wrought alum, N2 cast alum low-Si, N3 cast alum high-Si >12%, N4 brass/copper), P=steel (P1 low carbon/free-machining, P2 medium-carbon/alloy, P3 alloy pre-hard 28-38 HRC), M=stainless (M1 free-machining/303, M2 austenitic 304/316, M3 PH/duplex 17-4/2205), K1=cast iron, S1=titanium alloys, S2=nickel superalloys, H1=hardened steel 45-60 HRC.

Use inches internally: convert metric diameter, LOC, pitch, feed per tooth, and feed per rev into inches. Prefer manufacturer-published cutting data. Only include cutting groups the manufacturer actually publishes or clearly intends — do not interpolate or invent ranges for groups they don't rate the tool for. If you can identify the tool but not published cutting data, set found=true with an empty "cutting" array. If you cannot identify the tool at all, set found=false and leave the tool fields empty or null rather than filling in placeholder numbers.`;

  const run = async (onProgress) => parseJsonOutput(await modelJson(env, { prompt, useWebSearch: true, maxSearches: 6, effort: "low", onProgress }));
  if (streaming) return sseResponse(ctx, run);
  return json(await run());
}

async function curveDigitize(request, env) {
  const { filename, mimeType, fileData } = await request.json();
  if (!filename || !fileData) return json({ error: "filename and fileData are required" }, 400);
  const prompt = `This file contains a machine tool spindle power and/or torque curve (power or torque vs spindle RPM), likely from a machine manual or spec sheet (Haas, Tormach, DMG, etc.).

Digitize the curve. If multiple duty ratings are shown (S1/continuous vs S3/S6/intermittent, or 100% vs 30-minute), use the CONTINUOUS (S1 / 100% duty) curve — the conservative one. If only power OR only torque is shown, convert to horsepower:
HP = kW * 1.341
HP = torque_ftlb * RPM / 5252
HP = torque_Nm * RPM / 7121

Respond with ONLY a raw JSON object, no markdown fences, no preamble:
{
 "found": true|false,
 "points": [ { "rpm": number, "hp": number } ] (12 to 24 points spanning the full RPM range, denser where the curve bends — include the corner/base speed where power peaks),
 "peak_hp": number,
 "max_rpm": number,
 "notes": string (1 sentence: which curve you read, any assumptions)
}
If no recognizable power/torque curve exists in the file, set found=false with empty points.`;

  const text = await modelJson(env, {
    prompt,
    file: { filename, mimeType, fileData },
    effort: "medium", // reading a chart accurately needs a bit more than "low"
  });
  return json(parseJsonOutput(text));
}

async function machineCurves(request, env, ctx, streaming) {
  const { machine, maxRpm, notes } = await request.json();
  if (!machine) return json({ error: "machine is required" }, 400);
  const prompt = `Search the web for manufacturer-published spindle power and torque curve data for the machine tool "${machine}"${Number.isFinite(maxRpm) ? ` (max spindle speed about ${maxRpm} RPM)` : ""}${notes ? ` (owner's notes: ${notes})` : ""}.

Machine tool builders (Haas, Tormach, DMG Mori, Mazak, Okuma, Doosan/DN Solutions, Brother, Fadal, Hurco, etc.) publish spindle power/torque vs RPM charts in operator manuals, spec sheets, and brochures. Find the chart(s) for this exact machine and spindle option and digitize them.

Machines often have MULTIPLE curves — return each one as a separate entry:
- Duty ratings: S1 / continuous / 100%-duty vs S6 / S3 / 30-minute / 5-minute / peak ratings. Return the continuous curve AND the intermittent one when both are published, marked with "duty".
- Belt or gear ranges (e.g. Tormach low belt vs high belt, gearbox low/high): one curve per range, named for the range, with that range's own max RPM.
- Multiple spindles (e.g. a lathe's main spindle vs its live/driven tooling): one curve per spindle, named for the spindle.

Convert everything to horsepower:
HP = kW * 1.341
HP = torque_ftlb * RPM / 5252
HP = torque_Nm * RPM / 7121

Respond with ONLY a raw JSON object, no markdown fences, no preamble:
{
 "found": true|false,
 "machine": string (the exact machine / spindle configuration you matched),
 "curves": [
   { "label": string (short name, e.g. "S1 continuous", "30-min rating", "Low belt", "High belt", "Main spindle", "Live tooling"),
     "duty": "continuous"|"burst" (burst = any intermittent/peak rating: S6, S3, 30-minute, 5-minute…),
     "max_rpm": number|null (top RPM of THIS configuration if it differs from the machine's overall max — e.g. a low belt range — else null),
     "points": [ { "rpm": number, "hp": number } ] (8 to 24 points spanning this curve's RPM range, denser where it bends — include the corner/base speed where power peaks),
     "notes": string (1 sentence: which chart/line this came from) }
 ],
 "sources": [array of source URLs],
 "notes": string (1-2 sentences: what you found, caveats, which spindle option you assumed)
}

Ground every curve in published data: an actual curve chart, or published torque/power figures at stated RPMs (e.g. "75 ft-lb at 1400 RPM, 30 HP peak, 8100 RPM max"). If you can only find a few published anchor points, return just those points and say so in the curve's notes rather than inventing a smooth curve. Do NOT fabricate numbers for a machine you cannot find data for — set found=false with an empty curves array instead. If the machine was sold with multiple factory spindle options (e.g. 8100 vs 12000 RPM, standard vs high-torque), pick the option matching the stated max RPM and note the assumption; if none matches, return the standard option.`;

  const run = async (onProgress) => parseJsonOutput(await modelJson(env, { prompt, useWebSearch: true, maxTokens: 4000, maxSearches: 8, effort: "medium", onProgress }));
  if (streaming) return sseResponse(ctx, run);
  return json(await run());
}

/* ---------------- model transport ----------------
   Both providers are called with streaming enabled: web-search lookups can run
   90s+, and buffered (non-streaming) responses were getting killed by proxy
   timeouts (Cloudflare 524) whose plain-text error pages then crashed
   response.json(). Streaming keeps bytes flowing; retries cover the rest. */

async function modelJson(env, request) {
  const onProgress = request.onProgress || (() => {});
  const call = env.OPENAI_API_KEY ? () => openaiResponse(env, request)
    : env.ANTHROPIC_API_KEY ? () => anthropicResponse(env, request)
    : null;
  if (!call) throw new Error("Set OPENAI_API_KEY or ANTHROPIC_API_KEY as a Worker secret");
  return withRetry(call, 3, (attempt, tries) => onProgress(`Upstream hiccup — retrying from scratch (attempt ${attempt} of ${tries})…`));
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 529]);

async function withRetry(doCall, tries = 3, onRetry = () => {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await doCall();
    } catch (err) {
      lastErr = err;
      // TypeError = fetch network failure / stream cut mid-flight — retryable too
      if (!(err.retryable || err instanceof TypeError) || i === tries - 1) throw err;
      onRetry(i + 2, tries);
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
  throw lastErr;
}

/* translate raw provider stream events into human-readable shop-floor milestones */
function progressTracker(onProgress) {
  let searches = 0;
  let chars = 0;
  let lastCharsMsg = 0;
  return {
    searchStart() { searches++; onProgress(`Web search #${searches} running…`); },
    searchDone() { onProgress(`Web search #${searches} done — reading results…`); },
    reasoning() { onProgress(searches ? "Reasoning over what it found…" : "Reading the request…"); },
    text(delta) {
      chars += delta.length;
      if (chars - lastCharsMsg >= 400 || lastCharsMsg === 0) {
        lastCharsMsg = chars;
        onProgress(`Writing up the findings… (${chars.toLocaleString("en-US")} characters)`);
      }
    },
  };
}

function upstreamError(provider, status, bodyText) {
  let detail = String(bodyText || "").slice(0, 200).trim();
  try {
    const parsed = JSON.parse(bodyText);
    detail = parsed.error?.message || detail;
  } catch { /* plain-text error page (e.g. "error code: 524") — use the snippet */ }
  const err = new Error(`${provider} request failed (${status}${detail ? ": " + detail : ""})`);
  err.retryable = RETRYABLE_STATUS.has(status);
  return err;
}

async function readSse(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let obj;
        try { obj = JSON.parse(payload); } catch { continue; }
        onEvent(obj);
      }
    }
  }
}

async function openaiResponse(env, request) {
  const content = [];
  if (request.file) {
    const { filename, mimeType, fileData } = request.file;
    if (String(mimeType || "").startsWith("image/")) {
      content.push({ type: "input_image", image_url: `data:${mimeType || "image/png"};base64,${fileData}` });
    } else {
      content.push({ type: "input_file", filename, file_data: fileData });
    }
  }
  content.push({ type: "input_text", text: request.prompt });

  const body = {
    model: env.OPENAI_MODEL || "gpt-5.6",
    max_output_tokens: request.maxTokens || 1600,
    input: [{ role: "user", content }],
    stream: true,
    // reasoning tokens dominate cost on these models; low/medium is plenty for
    // structured extraction. Override globally with the OPENAI_EFFORT Worker var.
    reasoning: { effort: env.OPENAI_EFFORT || request.effort || "low" },
  };
  if (request.useWebSearch) {
    body.tools = [{ type: "web_search" }];
    body.tool_choice = "required";
    // hard cap on tool calls — one runaway lookup did 37 web searches; each costs money
    body.max_tool_calls = Number(env.SEARCH_MAX_USES) || request.maxSearches || 6;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw upstreamError("OpenAI", response.status, await response.text());

  const track = progressTracker(request.onProgress || (() => {}));
  let text = "";
  let failure = null;
  await readSse(response, (ev) => {
    if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") { text += ev.delta; track.text(ev.delta); }
    else if (ev.type === "response.output_item.added" && ev.item?.type === "web_search_call") track.searchStart();
    else if (ev.type === "response.web_search_call.completed") track.searchDone();
    else if (ev.type === "response.output_item.added" && ev.item?.type === "reasoning") track.reasoning();
    else if (ev.type === "response.failed") failure = ev.response?.error?.message || "response.failed";
    else if (ev.type === "error") failure = ev.message || ev.error?.message || "stream error";
  });
  if (failure) {
    const err = new Error(`OpenAI stream failed (${failure})`);
    err.retryable = true;
    throw err;
  }
  if (!text.trim()) {
    const err = new Error("OpenAI returned no text");
    err.retryable = true;
    throw err;
  }
  return text;
}

async function anthropicResponse(env, request) {
  const content = [];
  if (request.file) {
    const { filename, mimeType, fileData } = request.file;
    if (String(mimeType || "").startsWith("image/")) {
      content.push({ type: "image", source: { type: "base64", media_type: mimeType || "image/png", data: fileData } });
    } else {
      content.push({ type: "document", source: { type: "base64", media_type: mimeType || "application/pdf", data: fileData }, title: filename });
    }
  }
  content.push({ type: "text", text: request.prompt });

  const body = {
    model: env.ANTHROPIC_MODEL || "claude-opus-4-8",
    max_tokens: request.maxTokens || 1600,
    messages: [{ role: "user", content }],
    stream: true,
  };
  if (request.useWebSearch) {
    // max_uses hard-caps web searches (each costs money — one lookup ran 37)
    body.tools = [{ type: "web_search_20260209", name: "web_search", max_uses: Number(env.SEARCH_MAX_USES) || request.maxSearches || 6 }];
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw upstreamError("Anthropic", response.status, await response.text());

  const track = progressTracker(request.onProgress || (() => {}));
  let text = "";
  let failure = null;
  await readSse(response, (ev) => {
    if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") { text += ev.delta.text; track.text(ev.delta.text); }
    else if (ev.type === "content_block_start" && ev.content_block?.type === "server_tool_use") track.searchStart();
    else if (ev.type === "content_block_start" && ev.content_block?.type === "web_search_tool_result") track.searchDone();
    else if (ev.type === "error") failure = ev.error?.message || "stream error";
  });
  if (failure) {
    const err = new Error(`Anthropic stream failed (${failure})`);
    err.retryable = true;
    throw err;
  }
  if (!text.trim()) {
    const err = new Error("Anthropic returned no text");
    err.retryable = true;
    throw err;
  }
  return text;
}

function parseJsonOutput(text) {
  const clean = String(text || "").replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Model did not return JSON");
  return JSON.parse(clean.slice(start, end + 1));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
