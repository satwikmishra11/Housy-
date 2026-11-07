import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DIAGRAMS_DIR = path.resolve(process.cwd(), 'docs/assets/diagrams');
if (!fs.existsSync(DIAGRAMS_DIR)) {
  fs.mkdirSync(DIAGRAMS_DIR, { recursive: true });
}

const diagrams = {
  'architecture.png': `
graph TD
  subgraph Client_Layer["Client & Attribution Layer"]
    Portal["Property Portals (99acres/MagicBricks)"]
    Social["Social Media Ads (Meta/Instagram)"]
    QR["Physical Hoarding QR Codes / Calls"]
    Buyer["Home Buyer (Mobile Browser / Web)"]
    Staff["Sales Team (Execs & Sales Head)"]
  end

  subgraph Frontend_App["Vite + React 18 SPA (apps/web)"]
    Router["React Router v6"]
    ChatUI["Buyer Chat (i18n: EN, HI, GU)"]
    StaffUI["Staff Workspace (Today, Leads, Handoffs, Visits, Daily Review, Dashboard)"]
    TanStack["TanStack Query (Cache & State)"]
  end

  subgraph API_Layer["3-Tier Express API (apps/api)"]
    Routes["Zod Validated Routes (/api/*)"]
    AuthMW["Auth & Role Guards (JWT + CSRF Header + Magic Links)"]
    
    subgraph Services["Domain Services"]
      ChatSvc["Chat & Assistant Service"]
      VisitSvc["Visit & Slot Service (Row Locks)"]
      LeadSvc["Lead Ingest, Dedupe & Notes"]
      HandoffSvc["Handoff & Escalation Orchestrator"]
      ReportSvc["Analytics, Cohorts & SLA Engine"]
    end

    subgraph Adapters["Infrastructure & External Adapters"]
      LLMAdapter["LLM Provider (Claude / Gemini / Mock)"]
      Guardrails["Intent Pre-Filters & Grounding Pipeline"]
      OutboxWorker["Unified Master Runner (POST /run-jobs)"]
      ChannelMock["Channel Adapters (WhatsApp / SMS)"]
    end

    Repos["Repositories (pg Parameterized Queries)"]
  end

  subgraph DB_Layer["PostgreSQL 16 Relational Engine"]
    DB[(Neon / Local PostgreSQL)]
    T_Leads["leads, chat_sessions, touchpoints & lead_notes"]
    T_Slots["visit_slots & visit_bookings"]
    T_Facts["fact_entries & versions"]
    T_Handoffs["conversations, handoffs & handoff_events"]
    T_Outbox["outbox_messages & staff_notifications"]
    T_Audit["job_runs, audit_log & source_api_keys"]
  end

  Buyer --> Router
  Staff --> Router
  Portal --> Routes
  Social --> Routes
  QR --> Routes

  Router --> ChatUI
  Router --> StaffUI
  ChatUI --> TanStack
  StaffUI --> TanStack
  TanStack --> Routes

  Routes --> AuthMW
  AuthMW --> Services
  ChatSvc --> Guardrails
  Guardrails --> LLMAdapter
  VisitSvc --> Repos
  LeadSvc --> Repos
  HandoffSvc --> Repos
  ReportSvc --> Repos
  OutboxWorker --> ChannelMock
  OutboxWorker --> Repos
  Repos --> DB
`,

  'er-diagram.png': `
erDiagram
  PROJECTS ||--o{ FACT_ENTRIES : contains
  PROJECTS ||--o{ VISIT_SLOTS : schedules
  PROJECTS ||--o{ VISIT_BOOKINGS : hosts
  USERS ||--o{ VISIT_SLOTS : assigns
  USERS ||--o{ LEADS : owns
  USERS ||--o{ HANDOFFS : handles
  USERS ||--o{ LEAD_NOTES : authors

  CHAT_SESSIONS ||--o| CONVERSATIONS : initiates
  CHAT_SESSIONS ||--o| LEADS : promotes_to
  LEADS ||--o{ LEAD_TOUCHPOINTS : logs
  LEADS ||--o{ CONSENTS : records
  LEADS ||--o{ CONVERSATIONS : associates
  LEADS ||--o{ VISIT_BOOKINGS : books
  LEADS ||--o{ HANDOFFS : escalates
  LEADS ||--o{ LEAD_NOTES : stores

  CONVERSATIONS ||--o{ CHAT_MESSAGES : holds
  CONVERSATIONS ||--o| HANDOFFS : triggers
  HANDOFFS ||--o{ HANDOFF_EVENTS : records
  VISIT_BOOKINGS ||--o{ REMINDERS : triggers
  VISIT_BOOKINGS ||--o{ OUTBOX_MESSAGES : enqueues

  PROJECTS {
    uuid id PK
    string name
    string rera_number
    string address
    jsonb bhk_types
  }

  USERS {
    uuid id PK
    string email UK
    string role "sales_head | executive"
    string full_name
    string phone_e164
    boolean is_active
  }

  LEADS {
    uuid id PK
    string public_id UK
    string phone_e164 "UK where not null"
    string email
    string full_name
    string status
    string first_touch_source
    uuid assigned_to FK
    uuid possible_duplicate_of FK
    boolean consent_granted
    timestamptz opted_out_at
  }

  VISIT_SLOTS {
    uuid id PK
    uuid project_id FK
    uuid executive_id FK
    timestamptz starts_at
    timestamptz ends_at
    string status "open | booked | blocked"
  }

  VISIT_BOOKINGS {
    uuid id PK
    uuid slot_id FK "UK"
    uuid lead_id FK
    string status "confirmed | visited | no_show | cancelled"
    string idempotency_key UK
    timestamptz booked_at
  }

  FACT_ENTRIES {
    uuid id PK
    uuid project_id FK
    string category
    string question
    text answer
    integer version
    boolean is_active
  }
`,

  'seq-chat-booking.png': `
sequenceDiagram
  autonumber
  actor Buyer as Home Buyer (Mobile)
  participant UI as BuyerChatPage (Web)
  participant API as Express API (/api/chat)
  participant GR as Guardrails Pipeline
  participant LLM as LLM Provider
  participant VS as VisitService
  participant DB as PostgreSQL (ACID)

  Buyer->>UI: Opens /chat?src=portal
  UI->>API: POST /api/chat/start
  API->>DB: Create anonymous session & lead
  API-->>UI: Session token (HMAC-SHA256)

  Buyer->>UI: "2 BHK फ्लैट देखना है, विज़िट बुक करें"
  UI->>API: POST /api/chat/message
  API->>GR: Pre-Filter (Regex, Hindi intent, Price checks)
  GR->>LLM: Formatted prompt + Fact Sheet context
  LLM-->>GR: Tool call: collect_contact
  GR-->>API: Emit action: collect_contact
  API-->>UI: Render DPDP Contact & Consent Form

  Buyer->>UI: Enters Name, Phone & Checks Consent
  UI->>API: POST /api/chat/contact (affirmative consent)
  API->>DB: Store consent record & link phone_e164
  API-->>UI: Fetch open slot chips

  Buyer->>UI: Selects Slot (Sat 11:00 AM) & Clicks Confirm
  UI->>API: POST /api/projects/:id/book (idempotencyKey)
  API->>VS: bookVisit(leadId, slotTime)
  rect rgb(240, 248, 255)
    VS->>DB: BEGIN TRANSACTION
    VS->>DB: SELECT * FROM visit_slots WHERE starts_at = $1 FOR UPDATE SKIP LOCKED
    VS->>DB: UPDATE visit_slots SET status = 'booked'
    VS->>DB: INSERT INTO visit_bookings (slot_id, lead_id, status='confirmed')
    VS->>DB: INSERT INTO outbox_messages (visit_confirmation template)
    VS->>DB: COMMIT TRANSACTION
  end
  VS-->>API: Booking confirmed + signed magic link
  API-->>UI: Confirmation Card + Google Maps Pin
  UI-->>Buyer: "Visit Confirmed! Location: Near SG Highway"
`,

  'seq-ingest-dedupe.png': `
sequenceDiagram
  autonumber
  actor Portal as Property Portal / Meta Webhook
  participant API as Ingest Route (/api/ingest/lead)
  participant Auth as API Key Verification
  participant Svc as LeadIngestService
  participant DB as PostgreSQL (ACID)

  Portal->>API: POST /api/ingest/lead (X-Source-Key: Bearer <key>)
  API->>Auth: SHA-256 Hash check against source_api_keys
  Auth-->>API: Key Verified (source: property_portal)

  API->>Svc: ingestLead(payload)
  rect rgb(245, 245, 245)
    Svc->>DB: BEGIN TRANSACTION
    Svc->>DB: SELECT id FROM lead_touchpoints WHERE source=$1 AND external_id=$2
    alt Idempotent Duplicate
      Svc-->>API: HTTP 200 { outcome: 'idempotent', leadId }
    else New Touchpoint
      Svc->>DB: SELECT id, status, assigned_to FROM leads WHERE phone_e164 = $phone
      alt Exact Match on Phone
        Svc->>DB: INSERT INTO lead_touchpoints (lead_id, source, raw_payload)
        Svc->>DB: UPDATE leads SET last_activity_at = NOW()
        Svc-->>API: HTTP 200 { outcome: 'merged_touchpoint', leadId }
      else Match on Email or Fuzzy Name
        Svc->>DB: INSERT INTO leads (status='new', possible_duplicate_of=existingId)
        Svc->>DB: INSERT INTO lead_touchpoints
        Svc-->>API: HTTP 201 { outcome: 'flagged_duplicate', leadId }
      else Fresh Unseen Lead
        Svc->>DB: INSERT INTO leads (status='new', first_touch_source=source)
        Svc->>DB: INSERT INTO lead_touchpoints
        Svc-->>API: HTTP 201 { outcome: 'created', leadId }
      end
    end
    Svc->>DB: COMMIT TRANSACTION
  end
`,

  'seq-reminder-worker.png': `
sequenceDiagram
  autonumber
  participant Cron as Internal Cron / Scheduler
  participant Worker as Reminder Background Worker
  participant Svc as ReminderService
  participant DB as PostgreSQL
  participant Outbox as Channel Outbox Dispatcher
  actor Buyer as Buyer WhatsApp / SMS

  Cron->>Worker: Trigger POST /api/internal/run-reminders
  Worker->>Svc: processPendingReminders()
  
  rect rgb(240, 255, 240)
    Svc->>DB: BEGIN TRANSACTION
    Svc->>DB: SELECT * FROM reminders WHERE scheduled_for <= NOW() AND status='pending' FOR UPDATE SKIP LOCKED
    
    loop For each due reminder
      Svc->>DB: SELECT consent_status, opted_out_at FROM leads WHERE id = lead_id
      alt canContact == false (Opted out or No Consent)
        Svc->>DB: UPDATE reminders SET status = 'cancelled', reason = 'opted_out'
      else canContact == true
        Svc->>DB: INSERT INTO outbox_messages (channel='whatsapp', template=reminder_type, rera_number)
        Svc->>DB: UPDATE reminders SET status = 'dispatched', sent_at = NOW()
      end
    end
    Svc->>DB: COMMIT TRANSACTION
  end

  Worker->>Outbox: dispatchOutbox()
  rect rgb(255, 250, 240)
    Outbox->>DB: SELECT * FROM outbox_messages WHERE status='pending' FOR UPDATE SKIP LOCKED
    Outbox->>Buyer: Dispatch approved template with RERA Reg PR/GJ/...
    Outbox->>DB: UPDATE outbox_messages SET status='delivered', delivered_at=NOW()
  end
`,

  'seq-handoff.png': `
sequenceDiagram
  autonumber
  actor Buyer as Home Buyer
  participant Chat as Buyer Chat / Webhook
  participant API as Express API (/api/chat)
  participant Handoff as HandoffService
  participant LLM as LLM Summarizer
  participant DB as PostgreSQL
  actor Exec as Assigned Sales Executive

  Buyer->>Chat: "मुझे किसी इंसान से बात करनी है" (or Price Ask)
  Chat->>API: POST /api/chat/message
  API->>Handoff: triggerHandoff(conversationId, reason='buyer_requested')
  
  rect rgb(248, 250, 252)
    Handoff->>DB: SELECT * FROM leads WHERE id = lead_id
    Handoff->>DB: Determine Executive (booked executive or lowest load)
    Handoff->>LLM: Generate structured consultation summary (JSON schema)
    alt LLM Success
      LLM-->>Handoff: { budget, wants, timeline, urgency, buyerMood, summary }
    else LLM Timeout or Failure
      Handoff-->>Handoff: Deterministic fallback summary from profile
    end
    Handoff->>DB: INSERT INTO handoffs (conversation_id, assigned_to, summary, status='new')
    Handoff->>DB: UPDATE conversations SET flagged=true, flag_reason='buyer_requested'
    Handoff->>DB: UPDATE leads SET assigned_to = executive_id, status = 'engaged'
  end

  Handoff-->>API: Handoff created
  API-->>Chat: Localized reassurance message ("Harshil/Amit will reach out shortly")
  Exec->>DB: Polls /handoffs or receives realtime escalation
  Exec->>Exec: Reviews AI summary, tags & full conversation transcript
  Exec->>DB: PATCH /api/handoffs/:id/accept
`,

  'guardrails-pipeline.png': `
graph TD
  UserMsg["Incoming Buyer Message (Text / Language)"] --> PreFilter{"Layer 1: Deterministic Pre-Filters"}
  
  PreFilter -->|"Price / Discount / Deal Request"| PriceIntercept["Policy Intercept: Never quote final prices; Offer Site Visit"]
  PreFilter -->|"Prompt Injection / Jailbreak attempt"| InjIntercept["Defend Injection: Block system leakage; Enforce scope"]
  PreFilter -->|"STOP / Unsubscribe / Opt-Out"| OptOutIntercept["DPDP Opt-Out: Set opted_out_at = NOW(); Cancel pending reminders"]
  PreFilter -->|"Explicit Human Request"| HumanEscalate["Human Escalation: Flag conversation; Notify Sales Executive"]
  PreFilter -->|"Legitimate Inquiry"| GroundingCtx["Layer 2: Grounding & Fact Injection"]

  GroundingCtx --> ActiveFacts["Inject Project Fact Sheet (RERA, Pricing Ranges, Carpet Areas, Amenities)"]
  ActiveFacts --> LLM["Layer 3: LLM Reasoning (Strict JSON / Tool Call)"]
  
  LLM --> PostCheck{"Layer 4: Post-Verification Guardrails"}
  PostCheck -->|"Emitted tool: book_visit / collect_contact"| ValidateTool["Schema Verification: Validate Phone / Slot timestamps"]
  PostCheck -->|"Ungrounded Numeric Claim / Unlisted Amenity"| FallbackOut["Safe Fallback: 'Our team will confirm'; Log in unanswered_questions"]
  PostCheck -->|"Grounding Verified"| SafeAnswer["Layer 5: Client Presentation (Asia/Kolkata Timezone + Verified Templates)"]

  ValidateTool --> SafeAnswer
  PriceIntercept --> SafeAnswer
  InjIntercept --> SafeAnswer
  OptOutIntercept --> SafeAnswer
  HumanEscalate --> SafeAnswer
  FallbackOut --> SafeAnswer
`
};

async function renderDiagrams() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });

  for (const [filename, mermaidCode] of Object.entries(diagrams)) {
    const html = [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '  <meta charset="utf-8">',
      '  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>',
      '  <style>',
      '    body {',
      '      margin: 0;',
      '      padding: 40px;',
      '      background: #ffffff;',
      '      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '      display: flex;',
      '      justify-content: center;',
      '      align-items: center;',
      '    }',
      '    #diagram {',
      '      max-width: 1200px;',
      '      width: 100%;',
      '    }',
      '  </style>',
      '</head>',
      '<body>',
      '  <div id="diagram" class="mermaid">',
      mermaidCode,
      '  </div>',
      '  <script>',
      '    mermaid.initialize({',
      '      startOnLoad: true,',
      '      theme: "neutral",',
      '      themeVariables: {',
      '        fontFamily: "-apple-system, BlinkMacSystemFont, \\"Segoe UI\\", Roboto, sans-serif",',
      '        primaryColor: "#f1f5f9",',
      '        primaryBorderColor: "#0f172a",',
      '        primaryTextColor: "#0f172a",',
      '        lineColor: "#475569",',
      '        secondaryColor: "#f8fafc",',
      '        tertiaryColor: "#ffffff"',
      '      }',
      '    });',
      '  </script>',
      '</body>',
      '</html>'
    ].join('\n');

    await page.setContent(html);
    await page.waitForSelector('.mermaid svg', { timeout: 15000 });
    const element = await page.locator('#diagram');
    const outputPath = path.join(DIAGRAMS_DIR, filename);
    await element.screenshot({ path: outputPath });
    console.info(`Rendered ${filename} successfully.`);
  }

  await browser.close();
}

renderDiagrams().catch((err) => {
  console.error('Failed to render diagrams:', err);
  process.exit(1);
});
