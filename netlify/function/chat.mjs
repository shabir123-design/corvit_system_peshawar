// Netlify Function: POST /.netlify/functions/chat
// Body: { query, conversation_id, user }
// The Dify API key stays on the server (process.env.DIFY_API_KEY) and never reaches the browser.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed. Use POST." });
  }

  const apiKey = process.env.DIFY_API_KEY;
  if (!apiKey) {
    return json(500, {
      error: "DIFY_API_KEY is missing. Add it in Netlify > Site settings > Environment variables, then redeploy.",
    });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const query = typeof payload?.query === "string" ? payload.query.trim() : "";
  if (!query) {
    return json(400, { error: "The 'query' field is required." });
  }

  const baseUrl = (process.env.DIFY_BASE_URL || "https://dify.ai").replace(/\/+$/, "");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(`${baseUrl}/chat-messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: {},
        query,
        response_mode: "blocking",
        conversation_id: payload.conversation_id || "",
        user: payload.user || "corvit-student",
      }),
      signal: controller.signal,
    });

    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }

    if (!res.ok) {
      return json(res.status, {
        error: data?.message || `Dify returned an error (HTTP ${res.status}).`,
        code: data?.code || null,
      });
    }
    if (!data) {
      return json(502, { error: "Dify returned a response that is not valid JSON. Check DIFY_BASE_URL." });
    }

    return json(200, {
      answer: data.answer || "",
      conversation_id: data.conversation_id || payload.conversation_id || "",
      message_id: data.message_id || null,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      return json(504, { error: "Dify took too long to reply. Please try again." });
    }
    return json(502, { error: "Could not reach Dify. Check DIFY_BASE_URL and your connection." });
  } finally {
    clearTimeout(timer);
  }
};
