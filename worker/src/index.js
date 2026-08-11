import { buildPushHTTPRequest } from "@pushforge/builder";

// Set as a Worker secret (Settings → Variables → Encrypt), never commit this.
// Format: the private key JWK printed by `npx @pushforge/builder vapid`
// e.g. env.VAPID_PRIVATE_KEY = '{"alg":"ES256","key_ops":["sign"],...}'

const REVIEW_URL = "https://search.google.com/local/writereview?placeid=ChIJmbIxPwCTIjkROpj1zTlqEcY";
const ONE_HOUR_MS = 60 * 60 * 1000;

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (url.pathname === "/schedule-review" && request.method === "POST") {
      try {
        const body = await request.json();
        const { subscription } = body;

        if (!subscription || !subscription.endpoint) {
          return new Response(JSON.stringify({ error: "Missing subscription" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
          });
        }

        const scheduledAt = Date.now() + ONE_HOUR_MS;
        const key = `review:${scheduledAt}:${crypto.randomUUID()}`;

        await env.REVIEW_KV.put(
          key,
          JSON.stringify({ subscription, scheduledAt, sent: false }),
          { expirationTtl: 60 * 60 * 6 } // auto-expire after 6h as a safety net
        );

        return new Response(JSON.stringify({ ok: true, scheduledAt }), {
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders(origin) });
  },

  // Cron-triggered: checks for due review reminders and sends them.
  async scheduled(event, env, ctx) {
    const now = Date.now();
    const list = await env.REVIEW_KV.list({ prefix: "review:" });

    for (const item of list.keys) {
      const raw = await env.REVIEW_KV.get(item.name);
      if (!raw) continue;

      const record = JSON.parse(raw);
      if (record.sent || record.scheduledAt > now) continue;

      try {
        const privateJWK = JSON.parse(env.VAPID_PRIVATE_KEY);
        const { endpoint, headers, body } = await buildPushHTTPRequest({
          privateJWK,
          subscription: record.subscription,
          message: {
            payload: {
              title: "How was your order? 🍕",
              body: "We'd love a quick review on Google — it takes 10 seconds!",
              icon: "https://bursa.pk/assets/icon-192.png",
              badge: "https://bursa.pk/assets/icon-192.png",
              data: { url: REVIEW_URL },
            },
            adminContact: "mailto:bursatld@gmail.com",
            options: { ttl: 3600, urgency: "normal" },
          },
        });

        const res = await fetch(endpoint, { method: "POST", headers, body });

        if (res.status === 404 || res.status === 410) {
          // Subscription expired/revoked — drop it, no retry.
          await env.REVIEW_KV.delete(item.name);
        } else if (res.ok) {
          await env.REVIEW_KV.delete(item.name);
        }
        // Any other error: leave it in KV, next cron tick will retry.
      } catch (err) {
        // Leave for retry on next tick.
      }
    }
  },
};
