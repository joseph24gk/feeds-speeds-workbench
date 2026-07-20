const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    try {
      if (request.method !== "POST") return json({ error: "POST required" }, 405);
      if (url.pathname === "/api/tool-lookup") return await toolLookup(request, env);
      if (url.pathname === "/api/curve-digitize") return await curveDigitize(request, env);
      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: err.message || "Worker error" }, 500);
    }
  },
};

async function toolLookup(request, env) {
  const { brand, pn } = await request.json();
  if (!brand || !pn) return json({ error: "brand and pn are required" }, 400);
  const prompt = `Search the web for the cutting tool "${brand} ${pn}" from its manufacturer or official catalog/distributor data.

Return ONLY a raw JSON object matching this schema:
{
 "found": true|false,
 "confidence": "high"|"medium"|"low",
 "tool": {
   "brand": string,
   "pn": string,
   "series": string,
   "name": string,
   "type": "square_endmill"|"ball_endmill"|"chamfer_mill"|"drill"|"tap",
   "dia_in": number,
   "flutes": number,
   "coating": string,
   "loc_in": number|null,
   "pitch_in": number|null,
   "metric_callout": true|false,
   "included_angle_deg": number|null,
   "tip_dia_in": number|null
 },
 "cutting": [
   { "group": "N1"|"N2"|"N3"|"N4"|"P1"|"P2"|"P3"|"M1"|"M2"|"M3"|"K1"|"S1"|"S2"|"H1",
     "sfm_lo": number, "sfm_hi": number,
     "ipt_lo": number, "ipt_hi": number }
 ],
 "sources": [string],
 "notes": string
}

Use inches internally. Convert metric diameter, LOC, pitch, feed per tooth, and feed per rev into inches. Prefer manufacturer-published cutting data. If the exact tool is identified but cutting ranges are unavailable, set found true and cutting to an empty array.`;

  const data = await modelJson(env, {
    prompt,
    useWebSearch: true,
  });
  return json(parseJsonOutput(data));
}

async function curveDigitize(request, env) {
  const { filename, mimeType, fileData } = await request.json();
  if (!filename || !fileData) return json({ error: "filename and fileData are required" }, 400);
  const prompt = `Digitize this machine spindle power or torque curve.

If multiple curves are shown, use the continuous/S1/100% duty curve. Convert to horsepower if the chart is kW, ft-lb, or Nm using:
HP = kW * 1.341
HP = torque_ftlb * RPM / 5252
HP = torque_Nm * RPM / 7121

Return ONLY a raw JSON object:
{
 "found": true|false,
 "points": [ { "rpm": number, "hp": number } ],
 "peak_hp": number,
 "max_rpm": number,
 "notes": string
}

Use 12 to 24 points spanning the curve, denser near bends and base speed.`;

  const data = await modelJson(env, {
    prompt,
    file: { filename, mimeType, fileData },
  });
  return json(parseJsonOutput(data));
}

async function modelJson(env, request) {
  if (env.OPENAI_API_KEY) return openaiResponse(env, request);
  if (env.ANTHROPIC_API_KEY) return anthropicResponse(env, request);
  throw new Error("Set OPENAI_API_KEY or ANTHROPIC_API_KEY as a Worker secret");
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
    max_output_tokens: 1600,
    input: [{ role: "user", content }],
  };
  if (request.useWebSearch) {
    body.tools = [{ type: "web_search" }];
    body.tool_choice = "required";
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `OpenAI request failed (${response.status})`);
  return data;
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
    max_tokens: 1600,
    messages: [{ role: "user", content }],
  };
  if (request.useWebSearch) {
    body.tools = [{ type: "web_search_20260209", name: "web_search" }];
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
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Anthropic request failed (${response.status})`);
  return data;
}

function parseJsonOutput(data) {
  const text = data.output_text || flattenOutputText(data.output) || flattenAnthropicText(data.content);
  const clean = String(text || "").replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Model did not return JSON");
  return JSON.parse(clean.slice(start, end + 1));
}

function flattenOutputText(output) {
  return (output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text" || part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function flattenAnthropicText(content) {
  return (content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
