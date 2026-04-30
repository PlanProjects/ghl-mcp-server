import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const GHL_API_KEY = process.env.GHL_API_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;
const PORT = process.env.PORT || 3000;
const MCP_VERSION = "2025-03-26";
const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `http://localhost:${PORT}`;

if (!GHL_API_KEY || !GHL_LOCATION_ID) {
  console.error("❌ Missing GHL_API_KEY or GHL_LOCATION_ID");
  process.exit(1);
}

const ghl = axios.create({
  baseURL: "https://rest.gohighlevel.com/v1",
  headers: { Authorization: `Bearer ${GHL_API_KEY}`, "Content-Type": "application/json" },
});

const safe = async (fn) => {
  try { const r = await fn(); return { success: true, data: r.data }; }
  catch (e) { return { success: false, error: e?.response?.data?.message || e.message }; }
};

const TOOLS = [
  { name: "ghl_search_contacts", description: "Search GHL contacts by name, email, or phone.", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] } },
  { name: "ghl_get_contact", description: "Get a contact by ID.", inputSchema: { type: "object", properties: { contactId: { type: "string" } }, required: ["contactId"] } },
  { name: "ghl_create_contact", description: "Create a new contact.", inputSchema: { type: "object", properties: { firstName: { type: "string" }, lastName: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, city: { type: "string" }, state: { type: "string" }, tags: { type: "array", items: { type: "string" } }, source: { type: "string" } } } },
  { name: "ghl_update_contact", description: "Update a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, firstName: { type: "string" }, lastName: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["contactId"] } },
  { name: "ghl_delete_contact", description: "Delete a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" } }, required: ["contactId"] } },
  { name: "ghl_add_tags", description: "Add tags to a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["contactId", "tags"] } },
  { name: "ghl_remove_tags", description: "Remove tags from a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["contactId", "tags"] } },
  { name: "ghl_get_notes", description: "Get notes for a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" } }, required: ["contactId"] } },
  { name: "ghl_create_note", description: "Create a note on a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, body: { type: "string" } }, required: ["contactId", "body"] } },
  { name: "ghl_get_tasks", description: "Get tasks for a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" } }, required: ["contactId"] } },
  { name: "ghl_create_task", description: "Create a task for a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, title: { type: "string" }, body: { type: "string" }, dueDate: { type: "string" }, assignedTo: { type: "string" } }, required: ["contactId", "title", "dueDate"] } },
  { name: "ghl_update_task", description: "Update a task.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, taskId: { type: "string" }, title: { type: "string" }, completed: { type: "boolean" } }, required: ["contactId", "taskId"] } },
  { name: "ghl_list_pipelines", description: "List all GHL pipelines.", inputSchema: { type: "object", properties: {} } },
  { name: "ghl_list_opportunities", description: "List opportunities in a pipeline.", inputSchema: { type: "object", properties: { pipelineId: { type: "string" }, status: { type: "string" }, limit: { type: "number" } }, required: ["pipelineId"] } },
  { name: "ghl_get_opportunity", description: "Get an opportunity by ID.", inputSchema: { type: "object", properties: { opportunityId: { type: "string" } }, required: ["opportunityId"] } },
  { name: "ghl_create_opportunity", description: "Create a new opportunity.", inputSchema: { type: "object", properties: { pipelineId: { type: "string" }, stageId: { type: "string" }, contactId: { type: "string" }, name: { type: "string" }, monetaryValue: { type: "number" }, status: { type: "string" } }, required: ["pipelineId", "stageId", "contactId", "name"] } },
  { name: "ghl_update_opportunity", description: "Update an opportunity.", inputSchema: { type: "object", properties: { opportunityId: { type: "string" }, stageId: { type: "string" }, monetaryValue: { type: "number" }, status: { type: "string" }, name: { type: "string" } }, required: ["opportunityId"] } },
  { name: "ghl_delete_opportunity", description: "Delete an opportunity.", inputSchema: { type: "object", properties: { opportunityId: { type: "string" } }, required: ["opportunityId"] } },
  { name: "ghl_list_conversations", description: "List conversations.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, type: { type: "string" }, limit: { type: "number" }, unread: { type: "boolean" } } } },
  { name: "ghl_get_conversation", description: "Get a conversation by ID.", inputSchema: { type: "object", properties: { conversationId: { type: "string" } }, required: ["conversationId"] } },
  { name: "ghl_send_sms", description: "Send an SMS to a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, message: { type: "string" } }, required: ["contactId", "message"] } },
  { name: "ghl_send_email", description: "Send an email to a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, fromName: { type: "string" }, fromEmail: { type: "string" } }, required: ["contactId", "subject", "body"] } },
  { name: "ghl_list_calendars", description: "List all calendars.", inputSchema: { type: "object", properties: {} } },
  { name: "ghl_list_appointments", description: "List appointments.", inputSchema: { type: "object", properties: { calendarId: { type: "string" }, startTime: { type: "string" }, endTime: { type: "string" } }, required: ["calendarId"] } },
  { name: "ghl_create_appointment", description: "Book an appointment.", inputSchema: { type: "object", properties: { calendarId: { type: "string" }, contactId: { type: "string" }, startTime: { type: "string" }, title: { type: "string" }, appointmentStatus: { type: "string" } }, required: ["calendarId", "contactId", "startTime"] } },
  { name: "ghl_update_appointment", description: "Update an appointment.", inputSchema: { type: "object", properties: { appointmentId: { type: "string" }, startTime: { type: "string" }, appointmentStatus: { type: "string" } }, required: ["appointmentId"] } },
  { name: "ghl_list_forms", description: "List all forms.", inputSchema: { type: "object", properties: {} } },
  { name: "ghl_get_form_submissions", description: "Get form submissions.", inputSchema: { type: "object", properties: { formId: { type: "string" }, limit: { type: "number" } }, required: ["formId"] } },
  { name: "ghl_list_campaigns", description: "List all campaigns.", inputSchema: { type: "object", properties: {} } },
  { name: "ghl_list_users", description: "List all users.", inputSchema: { type: "object", properties: {} } },
  { name: "ghl_list_custom_values", description: "List custom values/fields.", inputSchema: { type: "object", properties: {} } },
];

async function callTool(name, args = {}) {
  switch (name) {
    case "ghl_search_contacts": return safe(() => ghl.get("/contacts/", { params: { locationId: GHL_LOCATION_ID, query: args.query, limit: args.limit || 20 } }));
    case "ghl_get_contact": return safe(() => ghl.get(`/contacts/${args.contactId}`));
    case "ghl_create_contact": return safe(() => ghl.post("/contacts/", { ...args, locationId: GHL_LOCATION_ID }));
    case "ghl_update_contact": return safe(() => ghl.put(`/contacts/${args.contactId}`, args));
    case "ghl_delete_contact": return safe(() => ghl.delete(`/contacts/${args.contactId}`));
    case "ghl_add_tags": return safe(() => ghl.post(`/contacts/${args.contactId}/tags`, { tags: args.tags }));
    case "ghl_remove_tags": return safe(() => ghl.delete(`/contacts/${args.contactId}/tags`, { data: { tags: args.tags } }));
    case "ghl_get_notes": return safe(() => ghl.get(`/contacts/${args.contactId}/notes`));
    case "ghl_create_note": return safe(() => ghl.post(`/contacts/${args.contactId}/notes`, { body: args.body }));
    case "ghl_get_tasks": return safe(() => ghl.get(`/contacts/${args.contactId}/tasks`));
    case "ghl_create_task": return safe(() => ghl.post(`/contacts/${args.contactId}/tasks`, { title: args.title, body: args.body, dueDate: args.dueDate, assignedTo: args.assignedTo, completed: false }));
    case "ghl_update_task": return safe(() => ghl.put(`/contacts/${args.contactId}/tasks/${args.taskId}`, args));
    case "ghl_list_pipelines": return safe(() => ghl.get("/pipelines/", { params: { locationId: GHL_LOCATION_ID } }));
    case "ghl_list_opportunities": return safe(() => ghl.get(`/pipelines/${args.pipelineId}/opportunities`, { params: { locationId: GHL_LOCATION_ID, status: args.status, limit: args.limit || 20 } }));
    case "ghl_get_opportunity": return safe(() => ghl.get(`/pipelines/opportunities/${args.opportunityId}`));
    case "ghl_create_opportunity": return safe(() => ghl.post("/pipelines/opportunities/", { ...args, locationId: GHL_LOCATION_ID }));
    case "ghl_update_opportunity": return safe(() => ghl.put(`/pipelines/opportunities/${args.opportunityId}`, args));
    case "ghl_delete_opportunity": return safe(() => ghl.delete(`/pipelines/opportunities/${args.opportunityId}`));
    case "ghl_list_conversations": return safe(() => ghl.get("/conversations/search", { params: { locationId: GHL_LOCATION_ID, contactId: args.contactId, type: args.type, limit: args.limit || 20, unread: args.unread } }));
    case "ghl_get_conversation": return safe(() => ghl.get(`/conversations/${args.conversationId}`));
    case "ghl_send_sms": return safe(() => ghl.post("/conversations/messages", { type: "SMS", contactId: args.contactId, message: args.message }));
    case "ghl_send_email": return safe(() => ghl.post("/conversations/messages", { type: "Email", contactId: args.contactId, subject: args.subject, body: args.body, fromName: args.fromName, fromEmail: args.fromEmail }));
    case "ghl_list_calendars": return safe(() => ghl.get("/calendars/", { params: { locationId: GHL_LOCATION_ID } }));
    case "ghl_list_appointments": return safe(() => ghl.get("/appointments/", { params: { locationId: GHL_LOCATION_ID, calendarId: args.calendarId, startTime: args.startTime, endTime: args.endTime } }));
    case "ghl_create_appointment": return safe(() => ghl.post("/appointments/", { ...args, locationId: GHL_LOCATION_ID }));
    case "ghl_update_appointment": return safe(() => ghl.put(`/appointments/${args.appointmentId}`, args));
    case "ghl_list_forms": return safe(() => ghl.get("/forms/", { params: { locationId: GHL_LOCATION_ID } }));
    case "ghl_get_form_submissions": return safe(() => ghl.get("/forms/submissions", { params: { locationId: GHL_LOCATION_ID, formId: args.formId, limit: args.limit || 20 } }));
    case "ghl_list_campaigns": return safe(() => ghl.get("/campaigns/", { params: { locationId: GHL_LOCATION_ID } }));
    case "ghl_list_users": return safe(() => ghl.get("/users/", { params: { locationId: GHL_LOCATION_ID } }));
    case "ghl_list_custom_values": return safe(() => ghl.get("/custom-values/", { params: { locationId: GHL_LOCATION_ID } }));
    default: return { success: false, error: `Unknown tool: ${name}` };
  }
}

async function handleMCP(body) {
  const { id, method, params } = body;
  if (method === "initialize") {
    return { jsonrpc: "2.0", id, result: { protocolVersion: MCP_VERSION, serverInfo: { name: "ghl-mcp-server", version: "1.0.0" }, capabilities: { tools: {} } } };
  }
  if (method === "notifications/initialized") return null;
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  if (method === "tools/call") {
    const result = await callTool(params.name, params.arguments || {});
    return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } };
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

// ── Send response: SSE or JSON depending on Accept header ────────────────────
function sendResponse(req, res, data) {
  const accept = req.headers["accept"] || "";
  if (accept.includes("text/event-stream")) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (data !== null) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
    res.end();
  } else {
    if (data === null) {
      res.status(202).end();
    } else {
      res.setHeader("Content-Type", "application/json");
      res.status(200).json(data);
    }
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", service: "ghl-mcp-server", version: "1.0.0" }));

// ── OAuth discovery endpoints (no-auth server) ────────────────────────────────
app.get("/.well-known/oauth-protected-resource", (req, res) => {
  res.json({ resource: BASE_URL, bearer_methods_supported: [] });
});

app.get("/.well-known/oauth-authorization-server", (req, res) => {
  res.json({
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/authorize`,
    token_endpoint: `${BASE_URL}/token`,
    registration_endpoint: `${BASE_URL}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
  });
});

// Dynamic client registration (accepts any client, returns dummy tokens)
app.post("/register", (req, res) => {
  const clientId = `ghl-client-${Date.now()}`;
  res.status(201).json({
    client_id: clientId,
    client_secret: "not-used",
    client_id_issued_at: Math.floor(Date.now() / 1000),
    grant_types: ["authorization_code"],
    redirect_uris: req.body?.redirect_uris || [],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  });
});

app.get("/authorize", (req, res) => {
  const { redirect_uri, state, code_challenge } = req.query;
  const code = `auth-code-${Date.now()}`;
  const url = new URL(redirect_uri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  res.redirect(url.toString());
});

app.post("/token", (req, res) => {
  res.json({
    access_token: `ghl-token-${Date.now()}`,
    token_type: "Bearer",
    expires_in: 86400,
    scope: "mcp",
  });
});

// ── MCP protocol discovery via HEAD ──────────────────────────────────────────
app.head("/", (req, res) => {
  res.setHeader("MCP-Protocol-Version", MCP_VERSION);
  res.status(200).end();
});

// ── MCP JSON-RPC endpoint ─────────────────────────────────────────────────────
app.post("/", async (req, res) => {
  try {
    console.log(`MCP [${req.body?.method}] Accept: ${req.headers["accept"]}`);
    const response = await handleMCP(req.body);
    sendResponse(req, res, response);
  } catch (err) {
    console.error("MCP error:", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", id: req.body?.id || null, error: { code: -32603, message: "Internal error" } });
    }
  }
});

app.listen(PORT, () => {
  console.log(`✅ GHL MCP Server running on port ${PORT}`);
  console.log(`📡 MCP endpoint: ${BASE_URL}/`);
});
