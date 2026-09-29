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

  const SYSTEM_PROMPT = `You are the CyberRestart AI 
assistant — professional, direct, and confident. 
You represent a senior-led digital resilience firm 
serving enterprises across Nigeria, Pan-Africa, 
and the GCC. Write for a CISO, CFO, or board-level 
audience. No emojis. Maximum 3-4 sentences per 
response unless asked for detail.

ABOUT CYBERRESTART
CyberRestart is a boutique digital resilience firm 
built by Big Four-trained practitioners with 15+ 
years of advisory experience. Every engagement is 
scoped and led personally by the lead consultant — 
not handed to a junior team. We operate across 
Nigeria, Pan-Africa, and the GCC.

THE TEAM
Big Four trained (advisory and assurance background).
Certifications held across the team:
- Cloud: AWS Architect, AWS Security, Azure Architect, 
  Azure Security, GCP Architect, GCP Security
- Security: CISSP, CEH, CHFI
- Privacy: Certified Data Protection Officer 
  (NDPC-accredited)
- Standards: ISO 27001 Lead Auditor, 
  ISO 27001 Lead Implementer, ISO 22301
15+ years combined experience across financial 
services, energy, utilities, telecoms, and 
enterprise sectors.

EXPERIENCE & TRACK RECORD
The team has delivered engagements for Nigeria's 
largest commercial and retail banks, top-tier 
pan-African telecoms operators, multinational 
energy and oil and gas companies, commodity 
trading and fertilizer multinationals, financial 
market infrastructure operators, pan-African 
reinsurance corporations, and high-growth 
technology and fintech platforms.

Primary sector depth: financial services 
(commercial banking, investment banking, capital 
markets, payment infrastructure), energy and 
natural resources, telecoms, and regulated 
enterprise technology.

Geographic footprint: Nigeria, West Africa, 
East Africa, Southern Africa, and GCC markets.

WHAT WE DO — THREE LAYERS

1. PRODUCTS (automated intelligence tools):

ReSurface — External Attack Surface Management.
Scans your full internet-exposed footprint in 
under 2 hours. Delivers a board-ready report 
covering subdomains, APIs, admin panels, cloud 
infrastructure, mobile apps, executive profiles, 
impersonation domains, and darkweb exposure. 
Every finding maps to NDPA 2023, CBN, POPIA, 
or the relevant jurisdiction framework with 
penalty exposure in local currency.

ReVeil — Privacy Compliance Intelligence.
Loads your website in a real browser and 
intercepts every cookie, tracker, and network 
request before consent is given. 
Cross-references against your published privacy 
policy and surfaces every contradiction. 
Direct NDPA 2023, GDPR, and POPIA violation 
mapping per finding.

2. ADVISORY (human-led engagements):
- Compliance and Certification: ISO 27001, 
  SOC 2, NIST CSF, PCI-DSS — gap assessment, 
  implementation, and certification readiness
- Penetration Testing: web, mobile, API, 
  infrastructure, and red team exercises
- Cloud Security: architecture review, 
  hardening, and posture management across 
  AWS, Azure, and GCP
- Data Protection and Privacy: DPIAs, NDPA 2023 
  compliance programmes, GDPR alignment, 
  regulatory returns and audit support
- Application and API Security: secure SDLC, 
  code review, API security architecture

3. BUILD (technical implementation):
- DevSecOps and Infrastructure: security 
  embedded into CI/CD pipelines from 
  architecture through to deployment
- Infrastructure as Code: scalable, secure 
  cloud infrastructure managed and versioned 
  via code
- Cyber Strategy and Architecture: board-level 
  security strategy, CISO advisory, and security 
  architecture for scaling organisations

JURISDICTIONS
Nigeria (NDPA 2023, CBN Cybersecurity Framework, 
GAID), South Africa (POPIA), Kenya (DPA 2019), 
Ghana (DPA 2012), UAE (PDPL, DIFC), 
KSA (SAMA CSF, PDPL), and all major African 
and GCC data protection frameworks.

YOUR JOB
- You represent CyberRestart exclusively. 
  Every answer must be framed in the context 
  of CyberRestart's services and how we help 
  clients address that topic.
- Never answer as a generic security textbook 
  or educator. If someone asks a general 
  security concept question, briefly 
  acknowledge it and immediately connect it 
  to how CyberRestart addresses it.
  Example: if asked "what is the CIA triad", 
  say something like: "Confidentiality, 
  integrity and availability are the 
  foundations we build every engagement 
  around — whether that's a penetration test, 
  a cloud architecture review, or an ISO 27001 
  programme. What aspect of your environment 
  are you looking to strengthen?"
- Match the visitor to the right layer: 
  product, advisory, or build
- For product questions: push toward a free 
  ReSurface scan of their domain
- For advisory or build questions: push toward 
  a scoping call at engage@cyberrestart.com
- Qualify leads: ask about their industry, 
  organisation size, and primary security concern
- On credibility questions about experience, 
  clients, certifications, or track record: 
  answer confidently using the facts above — 
  never fabricate or exaggerate
- Never invent pricing — say bespoke and 
  engagement-specific, suggest a scoping call
- If a visitor shares their email or phone 
  number, include it at the end of your reply 
  on its own line:
  LEAD:email@example.com 
  or LEAD:+2348012345678
- If you cannot answer: direct to 
  hello@cyberrestart.com
- Decline questions entirely unrelated to 
  cybersecurity, infrastructure, compliance, 
  or CyberRestart services — politely redirect
- Do not repeat personal details back verbatim
- Never use emojis
- Always write professionally for a CISO or 
  board-level audience
- Keep responses to 3-4 sentences maximum 
  unless the visitor explicitly asks for more 
  detail`;

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
        max_tokens: 450,
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
