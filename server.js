import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

dotenv.config();

const GHL_API_KEY = process.env.GHL_API_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;
const PORT = process.env.PORT || 3000;

if (!GHL_API_KEY || !GHL_LOCATION_ID) {
  console.error("❌ Missing GHL_API_KEY or GHL_LOCATION_ID in environment variables.");
  process.exit(1);
}

const ghl = axios.create({
  baseURL: "https://rest.gohighlevel.com/v1",
  headers: {
    Authorization: `Bearer ${GHL_API_KEY}`,
    "Content-Type": "application/json",
  },
});

const safe = async (fn) => {
  try {
    const result = await fn();
    return { success: true, data: result.data };
  } catch (err) {
    return { success: false, error: err?.response?.data?.message || err.message };
  }
};

const TOOLS = [
  { name: "ghl_search_contacts", description: "Search for contacts in GoHighLevel by name, email, or phone.", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] } },
  { name: "ghl_get_contact", description: "Get full details of a contact by their ID.", inputSchema: { type: "object", properties: { contactId: { type: "string" } }, required: ["contactId"] } },
  { name: "ghl_create_contact", description: "Create a new contact in GoHighLevel.", inputSchema: { type: "object", properties: { firstName: { type: "string" }, lastName: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, city: { type: "string" }, state: { type: "string" }, tags: { type: "array", items: { type: "string" } }, source: { type: "string" } } } },
  { name: "ghl_update_contact", description: "Update an existing contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, firstName: { type: "string" }, lastName: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["contactId"] } },
  { name: "ghl_delete_contact", description: "Delete a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" } }, required: ["contactId"] } },
  { name: "ghl_add_tags", description: "Add tags to a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["contactId", "tags"] } },
  { name: "ghl_remove_tags", description: "Remove tags from a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["contactId", "tags"] } },
  { name: "ghl_get_notes", description: "Get all notes for a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" } }, required: ["contactId"] } },
  { name: "ghl_create_note", description: "Create a note on a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, body: { type: "string" } }, required: ["contactId", "body"] } },
  { name: "ghl_get_tasks", description: "Get all tasks for a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" } }, required: ["contactId"] } },
  { name: "ghl_create_task", description: "Create a task for a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, title: { type: "string" }, body: { type: "string" }, dueDate: { type: "string" }, assignedTo: { type: "string" } }, required: ["contactId", "title", "dueDate"] } },
  { name: "ghl_update_task", description: "Update a task.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, taskId: { type: "string" }, title: { type: "string" }, completed: { type: "boolean" } }, required: ["contactId", "taskId"] } },
  { name: "ghl_list_pipelines", description: "List all pipelines in GHL.", inputSchema: { type: "object", properties: {} } },
  { name: "ghl_list_opportunities", description: "List opportunities in a pipeline.", inputSchema: { type: "object", properties: { pipelineId: { type: "string" }, status: { type: "string" }, limit: { type: "number" } }, required: ["pipelineId"] } },
  { name: "ghl_get_opportunity", description: "Get details of an opportunity.", inputSchema: { type: "object", properties: { opportunityId: { type: "string" } }, required: ["opportunityId"] } },
  { name: "ghl_create_opportunity", description: "Create a new opportunity/deal.", inputSchema: { type: "object", properties: { pipelineId: { type: "string" }, stageId: { type: "string" }, contactId: { type: "string" }, name: { type: "string" }, monetaryValue: { type: "number" }, status: { type: "string" } }, required: ["pipelineId", "stageId", "contactId", "name"] } },
  { name: "ghl_update_opportunity", description: "Update an opportunity stage, value, or status.", inputSchema: { type: "object", properties: { opportunityId: { type: "string" }, stageId: { type: "string" }, monetaryValue: { type: "number" }, status: { type: "string" }, name: { type: "string" } }, required: ["opportunityId"] } },
  { name: "ghl_delete_opportunity", description: "Delete an opportunity.", inputSchema: { type: "object", properties: { opportunityId: { type: "string" } }, required: ["opportunityId"] } },
  { name: "ghl_list_conversations", description: "List conversations.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, type: { type: "string" }, limit: { type: "number" }, unread: { type: "boolean" } } } },
  { name: "ghl_get_conversation", description: "Get a conversation and its messages.", inputSchema: { type: "object", properties: { conversationId: { type: "string" } }, required: ["conversationId"] } },
  { name: "ghl_send_sms", description: "Send an SMS to a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, message: { type: "string" } }, required: ["contactId", "message"] } },
  { name: "ghl_send_email", description: "Send an email to a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, fromName: { type: "string" }, fromEmail: { type: "string" } }, required: ["contactId", "subject", "body"] } },
  { name: "ghl_list_calendars", description: "List all calendars.", inputSchema: { type: "object", properties: {} } },
  { name: "ghl_list_appointments", description: "List appointments in a calendar.", inputSchema: { type: "object", properties: { calendarId: { type: "string" }, startTime: { type: "string" }, endTime: { type: "string" } }, required: ["calendarId"] } },
  { name: "ghl_create_appointment", description: "Book an appointment.", inputSchema: { type: "object", properties: { calendarId: { type: "string" }, contactId: { type: "string" }, startTime: { type: "string" }, title: { type: "string" }, appointmentStatus: { type: "string" } }, required: ["calendarId", "contactId", "startTime"] } },
  { name: "ghl_update_appointment", description: "Update an appointment.", inputSchema: { type: "object", properties: { appointmentId: { type: "string" }, startTime: { type: "string" }, appointmentStatus: { type: "string" } }, required: ["appointmentId"] } },
  { name: "ghl_list_forms", description: "List all forms.", inputSchema: { type: "object", properties: {} } },
  { name: "ghl_get_form_submissions", description: "Get form submissions.", inputSchema: { type: "object", properties: { formId: { type: "string" }, limit: { type: "number" } }, required: ["formId"] } },
  { name: "ghl_list_surveys", description: "List all surveys.", inputSchema: { type: "object", properties: {} } },
  { name: "ghl_list_campaigns", description: "List all campaigns.", inputSchema: { type: "object", properties: {} } },
  { name: "ghl_list_users", description: "List all users in the sub-account.", inputSchema: { type: "object", properties: {} } },
  { name: "ghl_get_user", description: "Get details of a user.", inputSchema: { type: "object", properties: { userId: { type: "string" } }, required: ["userId"] } },
  { name: "ghl_list_custom_values", description: "List all custom values/fields.", inputSchema: { type: "object", properties: {} } },
];

async function executeTool(name, args) {
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
    case "ghl_list_surveys": return safe(() => ghl.get("/surveys/", { params: { locationId: GHL_LOCATION_ID } }));
    case "ghl_list_campaigns": return safe(() => ghl.get("/campaigns/", { params: { locationId: GHL_LOCATION_ID } }));
    case "ghl_list_users": return safe(() => ghl.get("/users/", { params: { locationId: GHL_LOCATION_ID } }));
    case "ghl_get_user": return safe(() => ghl.get(`/users/${args.userId}`));
    case "ghl_list_custom_values": return safe(() => ghl.get("/custom-values/", { params: { locationId: GHL_LOCATION_ID } }));
    default: return { success: false, error: `Unknown tool: ${name}` };
  }
}

function createMCPServer() {
  const server = new Server(
    { name: "ghl-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => ({
    content: [{ type: "text", text: JSON.stringify(await executeTool(req.params.name, req.params.arguments || {}), null, 2) }],
  }));
  return server;
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok", service: "ghl-mcp-server" }));

// Streamable HTTP MCP endpoint at root — required for Claude.ai custom connectors
app.all("/", async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = createMCPServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("finish", () => server.close());
  } catch (err) {
    console.error("MCP error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ GHL MCP Server running on port ${PORT}`);
  console.log(`📡 MCP endpoint: http://localhost:${PORT}/`);
});
