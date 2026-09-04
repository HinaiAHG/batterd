// ============================================================
//  analyze-receipt — Supabase Edge Function
//  Reads a receipt image with Claude (Anthropic) vision and
//  returns { amount, date, category, merchant, currency }.
//
//  The Anthropic API key lives ONLY here, as a Supabase secret:
//     supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//  It is never sent to the browser.
// ============================================================

// Cheap model — receipt reading is a simple task, so Haiku is far
// cheaper than Opus and works well. Change back to "claude-opus-5"
// if you ever want maximum accuracy.
const MODEL = "claude-haiku-4-5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

  let payload: {
    image?: string;
    media_type?: string;
    categories?: { id: string; name: string }[];
    today?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const { image, media_type = "image/jpeg", categories = [], today } = payload;
  if (!image) return json({ error: "missing image" }, 400);

  const catList = categories.length
    ? categories.map((c) => `${c.id} = ${c.name}`).join("\n")
    : "other = Other";
  // "" lets the model leave the category blank when it can't tell.
  const catIds = ["", ...(categories.length ? categories.map((c) => c.id) : ["other"])];

  const prompt =
    `هذه صورة إيصال/فاتورة مشتريات لمزرعة. اقرأها واستخرج المعلومات التالية.\n` +
    `مهم جداً: إذا لم تستطع تحديد قيمة حقل بثقة، اتركه فارغاً — لا تخمّن.\n` +
    `- amount: المبلغ الإجمالي النهائي المدفوع (رقم فقط). إن لم يظهر، أعد 0.\n` +
    `- date: تاريخ الإيصال بصيغة YYYY-MM-DD. إن لم يظهر تاريخ، أعد "" (سلسلة فارغة).\n` +
    `- category: اختر أنسب فئة من القائمة التالية وأعد المُعرّف (id) فقط، أو "" إن لم تتضح:\n${catList}\n` +
    `- merchant: اسم المتجر أو المورّد (نص قصير، أو "" إن لم يظهر).\n` +
    `- currency: رمز أو اسم العملة إن ظهر (أو "" إن لم يظهر).\n` +
    `الإيصال قد يكون بالعربية أو الإنجليزية.`;

  const anthropicBody = {
    model: MODEL,
    max_tokens: 1024,
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            amount: { type: "number" },
            date: { type: "string" },
            category: { type: "string", enum: catIds },
            merchant: { type: "string" },
            currency: { type: "string" },
          },
          required: ["amount", "date", "category", "merchant", "currency"],
        },
      },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type, data: image },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  };

  let resp: Response;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });
  } catch (e) {
    return json({ error: "network error calling Anthropic: " + e }, 502);
  }

  if (!resp.ok) {
    const detail = await resp.text();
    return json({ error: "Anthropic error", status: resp.status, detail }, 502);
  }

  const data = await resp.json();

  if (data.stop_reason === "refusal") {
    return json({ error: "refused", detail: data.stop_details }, 422);
  }

  const textBlock = (data.content ?? []).find((b: any) => b.type === "text");
  if (!textBlock) return json({ error: "no content returned" }, 502);

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return json({ error: "could not parse model output", raw: textBlock.text }, 502);
  }

  return json({ result: parsed });
});
