// netlify/functions/ask.js
//
// Powers both the hero "Ask our CyberAI" input and the floating chat widget.
// The API key lives only here, as a Netlify environment variable — never in
// any file the browser can see.
//
// Setup:
//   1. Get a key at console.groq.com → API Keys → Create API Key (starts with gsk_)
//   2. In Netlify: Site settings → Environment variables → add GROQ_API_KEY
//   3. Deploy — Netlify auto-detects this folder as a serverless function.
//   4. Site settings → Forms → Form notifications → add an email notification
//      for the "chat-lead" form (same as scoping-call / free-checkup) pointing
//      to ops@cyberrestart.com. This is what makes in-chat lead capture below
//      actually reach an inbox — without it, leads are still logged in Netlify's
//      Forms dashboard, just not emailed.
//
// Update this if your domain changes — used below to block direct calls to
// this endpoint from outside your own site (e.g. a script on another page).
const ALLOWED_ORIGINS = [
  "https://cyberrestart.com",
  "https://www.cyberrestart.com",
  "https://chic-crumble-008e20.netlify.app"
];

const MAX_MESSAGE_LENGTH = 1000; // characters — plenty for a real question, not for abuse
const MAX_HISTORY_MESSAGES = 10;  // matches the cap the page applies client-side
const MAX_HISTORY_ENTRY_LENGTH = 2000; // characters per history entry (assistant replies run longer)

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  // Block requests that aren't coming from your own site. This stops someone
  // from finding the function URL and hammering it directly from elsewhere —
  // it's not bulletproof (headers can be spoofed by a determined attacker),
  // but it stops the casual/scripted abuse that would otherwise run up your bill.
  const origin = event.headers.origin || event.headers.referer || "";
  const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
  if (!isAllowed) {
    return { statusCode: 403, body: "Forbidden" };
  }

  let message, history;
  try {
    ({ message, history } = JSON.parse(event.body));
  } catch (err) {
    return { statusCode: 400, body: "Invalid request body" };
  }

  if (!message || typeof message !== "string" || !message.trim()) {
    return { statusCode: 400, body: "Missing message" };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reply: "That message is a bit long for this chat — could you shorten it, or use the contact form below for anything detailed?" })
    };
  }

  const SYSTEM_PROMPT = `You are the CyberRestart AI assistant. CyberRestart is a digital resilience company serving enterprises in Nigeria, Pan-Africa, and the GCC.

Our products:
- ReSurface: External Attack Surface Management. Scans an organisation's full internet exposure in under 2 hours. Delivers a board-ready report with attack chains, regulatory penalty mapping, and a prioritised remediation roadmap.
- ReVeil: Privacy Compliance Intelligence. Real browser interception showing exactly what trackers and cookies fire before consent, cross-referenced against the published privacy policy.
- DeclaredIQ: Security Posture Verification. Cross-references published security claims against independent scan observations.

Jurisdictions covered: Nigeria (NDPA 2023, CBN), South Africa (POPIA), Kenya, Ghana, UAE (PDPL), KSA (SAMA, PDPL), and all major African data protection frameworks.

Your job:
- Answer questions about CyberRestart services clearly and confidently
- Help visitors understand which product fits their need
- Qualify leads: ask about their industry, size, and primary concern
- Push qualified leads toward the free assessment: I can arrange a free ReSurface scan of your domain — under 2 hours, full board-ready report.
- Never invent pricing — say pricing is bespoke and suggest a scoping call
- Keep responses to 2-3 sentences unless asked for detail
- If unsure: intel@cyberrestart.com

If a visitor shares their email address or phone number, include it at the end of your reply in this exact format on its own line:
LEAD:email@example.com or LEAD:+2348012345678

Decline to answer questions unrelated to cybersecurity or CyberRestart's services. Do not repeat personal details the visitor shared back to them verbatim.`;

  // History comes from the browser, so it's untrusted: keep only user/assistant
  // turns with string content (never a client-supplied "system" message), trimmed
  // and capped. The page already includes the current message as the last entry;
  // only append it when it's missing (e.g. the hero input, which sends no history).
  const conversationHistory = (Array.isArray(history) ? history : [])
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_HISTORY_ENTRY_LENGTH) }));
  const last = conversationHistory[conversationHistory.length - 1];
  if (!last || last.role !== "user" || last.content !== message) {
    conversationHistory.push({ role: "user", content: message });
  }

  // Abort the upstream call before Netlify's 10s function limit kills us,
  // so the visitor gets the friendly error reply below instead of a raw 502.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      signal: controller.signal,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        max_tokens: 300,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...conversationHistory
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      clearTimeout(timeout);
      console.error("Groq API error:", response.status, errText);
      return {
        statusCode: 502,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reply: "Sorry, I'm having trouble right now — please use the contact form and a consultant will follow up directly." })
      };
    }

    const data = await response.json();
    clearTimeout(timeout);
    const fullText = data.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";

    // Split out any LEAD:<email or phone> lines, and forward only the visible
    // reply to the visitor.
    const leadLines = fullText.match(/^\s*LEAD:\s*\S.*$/gm) || [];
    const reply = fullText.replace(/^\s*LEAD:\s*\S.*$/gm, "").trim();
    if (leadLines.length) {
      const lead = { email: "", phone: "" };
      for (const line of leadLines) {
        const value = line.replace(/^\s*LEAD:\s*/, "").trim();
        if (!lead.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) lead.email = value;
        else if (!lead.phone && /^\+?[\d\s()-]{7,}$/.test(value)) lead.phone = value;
      }
      if (lead.email || lead.phone) {
        // Submit to the hidden "chat-lead" Netlify form so it flows through
        // the same notification pipeline as the other contact forms —
        // no separate email service needed.
        const siteUrl = `https://${event.headers.host}/`;
        const body = new URLSearchParams({
          "form-name": "chat-lead",
          name: "",
          email: lead.email,
          phone: lead.phone,
          company: "",
          interest: "",
          "original-message": message
        }).toString();

        await fetch(siteUrl, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body
        }).catch(err => console.error("Lead form submission failed:", err));
      } else {
        console.error("Unrecognised LEAD line(s):", leadLines);
      }
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reply })
    };
  } catch (err) {
    clearTimeout(timeout);
    console.error(err.name === "AbortError" ? "Groq API timed out after 9000ms" : "Function error:", err);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reply: "Sorry, something went wrong — please use the contact form and a consultant will follow up directly." })
    };
  }
};
