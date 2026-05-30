/**
 * mailchimp-subscriber-count.js
 * Cloudflare Worker — returns the active subscriber count for the
 * CharlestonHacks Mailchimp audience.
 *
 * Deploy to Cloudflare Workers and set one environment secret:
 *   MAILCHIMP_API_KEY  — your full Mailchimp API key (e.g. abc123...-us12)
 *
 * The API key never appears in source code; it lives only in the
 * Cloudflare Worker secrets vault.
 *
 * Response: { "subscribers": 1436 }
 */

const DATACENTER  = 'us12';
const AUDIENCE_ID = '3b95e0177a';

export default {
  async fetch(request, env) {
    // CORS — allow requests from the CharlestonHacks domain
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://charlestonhacks.com',
      'Access-Control-Allow-Methods': 'GET',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = `https://${DATACENTER}.api.mailchimp.com/3.0/lists/${AUDIENCE_ID}?fields=stats.member_count`;

      const resp = await fetch(url, {
        headers: {
          // Mailchimp basic auth: any string + API key
          Authorization: `Basic ${btoa(`anystring:${env.MAILCHIMP_API_KEY}`)}`,
        },
      });

      if (!resp.ok) {
        return new Response(
          JSON.stringify({ error: `Mailchimp returned ${resp.status}` }),
          { status: 502, headers: corsHeaders }
        );
      }

      const data = await resp.json();
      const subscribers = data?.stats?.member_count ?? null;

      return new Response(
        JSON.stringify({ subscribers }),
        { status: 200, headers: corsHeaders }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: corsHeaders }
      );
    }
  },
};
