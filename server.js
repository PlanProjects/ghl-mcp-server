import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
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

// ── GHL API Client ──────────────────────────────────────────────────────────
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
    return {
      success: false,
      error: err?.response?.data?.message || err.message,
    };
  }
};

// ── Tool Definitions ────────────────────────────────────────────────────────
const TOOLS = [
  // ── CONTACTS ──
  {
    name: "ghl_search_contacts",
    description: "Search for contacts in GoHighLevel by name, email, or phone.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name, email, or phone to search" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: ["query"],
    },
  },
  {
    name: "ghl_get_contact",
    description: "Get full details of a contact by their ID.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "GHL Contact ID" },
      },
      required: ["contactId"],
    },
  },
  {
    name: "ghl_create_contact",
    description: "Create a new contact in GoHighLevel.",
    inputSchema: {
      type: "object",
      properties: {
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        address1: { type: "string" },
        city: { type: "string" },
        state: { type: "string" },
        postalCode: { type: "string" },
        tags: { type: "array", items: { type: "string" }, description: "Array of tag strings" },
        source: { type: "string", description: "Lead source" },
        customField: { type: "object", description: "Custom field key-value pairs" },
      },
    },
  },
  {
    name: "ghl_update_contact",
    description: "Update an existing contact's details.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        customField: { type: "object" },
      },
      required: ["contactId"],
    },
  },
  {
    name: "ghl_delete_contact",
    description: "Delete a contact from GoHighLevel.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
      },
      required: ["contactId"],
    },
  },
  {
    name: "ghl_add_tags",
    description: "Add tags to a contact.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["contactId", "tags"],
    },
  },
  {
    name: "ghl_remove_tags",
    description: "Remove tags from a contact.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["contactId", "tags"],
    },
  },

  // ── NOTES ──
  {
    name: "ghl_get_notes",
    description: "Get all notes for a contact.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
      },
      required: ["contactId"],
    },
  },
  {
    name: "ghl_create_note",
    description: "Create a note on a contact.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        body: { type: "string", description: "Note content" },
        userId: { type: "string", description: "User ID to assign note to (optional)" },
      },
      required: ["contactId", "body"],
    },
  },

  // ── TASKS ──
  {
    name: "ghl_get_tasks",
    description: "Get all tasks for a contact.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
      },
      required: ["contactId"],
    },
  },
  {
    name: "ghl_create_task",
    description: "Create a task for a contact.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        dueDate: { type: "string", description: "ISO date string e.g. 2025-06-01T10:00:00Z" },
        assignedTo: { type: "string", description: "User ID to assign task to" },
      },
      required: ["contactId", "title", "dueDate"],
    },
  },
  {
    name: "ghl_update_task",
    description: "Update a task (title, body, dueDate, completed status).",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        taskId: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        dueDate: { type: "string" },
        completed: { type: "boolean" },
      },
      required: ["contactId", "taskId"],
    },
  },

  // ── PIPELINES & OPPORTUNITIES ──
  {
    name: "ghl_list_pipelines",
    description: "List all pipelines in the GHL account.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ghl_list_opportunities",
    description: "List opportunities/deals in a pipeline, optionally filtered by stage or contact.",
    inputSchema: {
      type: "object",
      properties: {
        pipelineId: { type: "string" },
        stageId: { type: "string", description: "Filter by specific stage ID" },
        contactId: { type: "string", description: "Filter by contact" },
        status: { type: "string", enum: ["open", "won", "lost", "abandoned"], description: "Filter by status" },
        limit: { type: "number" },
      },
      required: ["pipelineId"],
    },
  },
  {
    name: "ghl_get_opportunity",
    description: "Get full details of a specific opportunity/deal.",
    inputSchema: {
      type: "object",
      properties: {
        opportunityId: { type: "string" },
      },
      required: ["opportunityId"],
    },
  },
  {
    name: "ghl_create_opportunity",
    description: "Create a new opportunity/deal in a pipeline.",
    inputSchema: {
      type: "object",
      properties: {
        pipelineId: { type: "string" },
        stageId: { type: "string" },
        contactId: { type: "string" },
        name: { type: "string", description: "Opportunity name/title" },
        monetaryValue: { type: "number" },
        assignedTo: { type: "string", description: "User ID" },
        status: { type: "string", enum: ["open", "won", "lost", "abandoned"] },
      },
      required: ["pipelineId", "stageId", "contactId", "name"],
    },
  },
  {
    name: "ghl_update_opportunity",
    description: "Update an opportunity — move stage, change value, update status.",
    inputSchema: {
      type: "object",
      properties: {
        opportunityId: { type: "string" },
        stageId: { type: "string" },
        monetaryValue: { type: "number" },
        status: { type: "string", enum: ["open", "won", "lost", "abandoned"] },
        name: { type: "string" },
        assignedTo: { type: "string" },
      },
      required: ["opportunityId"],
    },
  },
  {
    name: "ghl_delete_opportunity",
    description: "Delete an opportunity from the pipeline.",
    inputSchema: {
      type: "object",
      properties: {
        opportunityId: { type: "string" },
      },
      required: ["opportunityId"],
    },
  },

  // ── CONVERSATIONS & MESSAGING ──
  {
    name: "ghl_list_conversations",
    description: "List conversations, optionally filtered by contact or type.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        type: { type: "string", enum: ["SMS", "Email", "GMB", "FB", "IG", "Live_Chat"], description: "Conversation type" },
        limit: { type: "number" },
        starred: { type: "boolean" },
        unread: { type: "boolean" },
      },
    },
  },
  {
    name: "ghl_get_conversation",
    description: "Get a conversation and its messages by conversation ID.",
    inputSchema: {
      type: "object",
      properties: {
        conversationId: { type: "string" },
      },
      required: ["conversationId"],
    },
  },
  {
    name: "ghl_send_sms",
    description: "Send an SMS message to a contact.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        message: { type: "string" },
        fromNumber: { type: "string", description: "Your GHL phone number (optional, uses default)" },
      },
      required: ["contactId", "message"],
    },
  },
  {
    name: "ghl_send_email",
    description: "Send an email to a contact.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        subject: { type: "string" },
        body: { type: "string", description: "HTML or plain text email body" },
        fromName: { type: "string" },
        fromEmail: { type: "string" },
        replyToEmail: { type: "string" },
        attachments: { type: "array", items: { type: "string" }, description: "Array of attachment URLs" },
      },
      required: ["contactId", "subject", "body"],
    },
  },

  // ── CALENDARS & APPOINTMENTS ──
  {
    name: "ghl_list_calendars",
    description: "List all calendars in the GHL account.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ghl_list_appointments",
    description: "List appointments in a calendar for a date range.",
    inputSchema: {
      type: "object",
      properties: {
        calendarId: { type: "string" },
        startTime: { type: "string", description: "Start date ISO string" },
        endTime: { type: "string", description: "End date ISO string" },
      },
      required: ["calendarId"],
    },
  },
  {
    name: "ghl_create_appointment",
    description: "Book an appointment for a contact.",
    inputSchema: {
      type: "object",
      properties: {
        calendarId: { type: "string" },
        contactId: { type: "string" },
        startTime: { type: "string", description: "ISO datetime e.g. 2025-06-01T10:00:00+10:00" },
        endTime: { type: "string" },
        title: { type: "string" },
        appointmentStatus: { type: "string", enum: ["new", "confirmed", "cancelled", "showed", "noshow", "invalid"] },
        assignedUserId: { type: "string" },
      },
      required: ["calendarId", "contactId", "startTime"],
    },
  },
  {
    name: "ghl_update_appointment",
    description: "Update or reschedule an appointment.",
    inputSchema: {
      type: "object",
      properties: {
        appointmentId: { type: "string" },
        startTime: { type: "string" },
        endTime: { type: "string" },
        title: { type: "string" },
        appointmentStatus: { type: "string", enum: ["new", "confirmed", "cancelled", "showed", "noshow", "invalid"] },
      },
      required: ["appointmentId"],
    },
  },

  // ── FORMS & SURVEYS ──
  {
    name: "ghl_list_forms",
    description: "List all forms in the account.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ghl_get_form_submissions",
    description: "Get submissions for a specific form.",
    inputSchema: {
      type: "object",
      properties: {
        formId: { type: "string" },
        startAt: { type: "number", description: "Pagination start index" },
        limit: { type: "number" },
      },
      required: ["formId"],
    },
  },
  {
    name: "ghl_list_surveys",
    description: "List all surveys in the account.",
    inputSchema: { type: "object", properties: {} },
  },

  // ── CAMPAIGNS ──
  {
    name: "ghl_list_campaigns",
    description: "List all campaigns in the GHL account.",
    inputSchema: { type: "object", properties: {} },
  },

  // ── USERS ──
  {
    name: "ghl_list_users",
    description: "List all users in the GHL sub-account.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ghl_get_user",
    description: "Get details of a specific user.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string" },
      },
      required: ["userId"],
    },
  },

  // ── CUSTOM VALUES ──
  {
    name: "ghl_list_custom_values",
    description: "List all custom values/fields in the account.",
    inputSchema: { type: "object", properties: {} },
  },
];

// ── Tool Execution ───────────────────────────────────────────────────────────
async function executeTool(name, args) {
  switch (name) {
    // CONTACTS
    case "ghl_search_contacts":
      return safe(() => ghl.get("/contacts/", { params: { locationId: GHL_LOCATION_ID, query: args.query, limit: args.limit || 20 } }));
    case "ghl_get_contact":
      return safe(() => ghl.get(`/contacts/${args.contactId}`));
    case "ghl_create_contact":
      return safe(() => ghl.post("/contacts/", { ...args, locationId: GHL_LOCATION_ID }));
    case "ghl_update_contact":
      return safe(() => ghl.put(`/contacts/${args.contactId}`, args));
    case "ghl_delete_contact":
      return safe(() => ghl.delete(`/contacts/${args.contactId}`));
    case "ghl_add_tags":
      return safe(() => ghl.post(`/contacts/${args.contactId}/tags`, { tags: args.tags }));
    case "ghl_remove_tags":
      return safe(() => ghl.delete(`/contacts/${args.contactId}/tags`, { data: { tags: args.tags } }));

    // NOTES
    case "ghl_get_notes":
      return safe(() => ghl.get(`/contacts/${args.contactId}/notes`));
    case "ghl_create_note":
      return safe(() => ghl.post(`/contacts/${args.contactId}/notes`, { body: args.body, userId: args.userId }));

    // TASKS
    case "ghl_get_tasks":
      return safe(() => ghl.get(`/contacts/${args.contactId}/tasks`));
    case "ghl_create_task":
      return safe(() => ghl.post(`/contacts/${args.contactId}/tasks`, { title: args.title, body: args.body, dueDate: args.dueDate, assignedTo: args.assignedTo, completed: false }));
    case "ghl_update_task":
      return safe(() => ghl.put(`/contacts/${args.contactId}/tasks/${args.taskId}`, args));

    // PIPELINES
    case "ghl_list_pipelines":
      return safe(() => ghl.get("/pipelines/", { params: { locationId: GHL_LOCATION_ID } }));
    case "ghl_list_opportunities":
      return safe(() => ghl.get(`/pipelines/${args.pipelineId}/opportunities`, {
        params: { locationId: GHL_LOCATION_ID, stageId: args.stageId, contactId: args.contactId, status: args.status, limit: args.limit || 20 },
      }));
    case "ghl_get_opportunity":
      return safe(() => ghl.get(`/pipelines/opportunities/${args.opportunityId}`));
    case "ghl_create_opportunity":
      return safe(() => ghl.post("/pipelines/opportunities/", { ...args, locationId: GHL_LOCATION_ID }));
    case "ghl_update_opportunity":
      return safe(() => ghl.put(`/pipelines/opportunities/${args.opportunityId}`, args));
    case "ghl_delete_opportunity":
      return safe(() => ghl.delete(`/pipelines/opportunities/${args.opportunityId}`));

    // CONVERSATIONS
    case "ghl_list_conversations":
      return safe(() => ghl.get("/conversations/search", {
        params: { locationId: GHL_LOCATION_ID, contactId: args.contactId, type: args.type, limit: args.limit || 20, starred: args.starred, unread: args.unread },
      }));
    case "ghl_get_conversation":
      return safe(() => ghl.get(`/conversations/${args.conversationId}`));
    case "ghl_send_sms":
      return safe(() => ghl.post("/conversations/messages", {
        type: "SMS", contactId: args.contactId, message: args.message, fromNumber: args.fromNumber,
      }));
    case "ghl_send_email":
      return safe(() => ghl.post("/conversations/messages", {
        type: "Email", contactId: args.contactId, subject: args.subject, body: args.body,
        fromName: args.fromName, fromEmail: args.fromEmail, replyToEmail: args.replyToEmail, attachments: args.attachments,
      }));

    // CALENDARS
    case "ghl_list_calendars":
      return safe(() => ghl.get("/calendars/", { params: { locationId: GHL_LOCATION_ID } }));
    case "ghl_list_appointments":
      return safe(() => ghl.get("/appointments/", { params: { locationId: GHL_LOCATION_ID, calendarId: args.calendarId, startTime: args.startTime, endTime: args.endTime } }));
    case "ghl_create_appointment":
      return safe(() => ghl.post("/appointments/", { ...args, locationId: GHL_LOCATION_ID }));
    case "ghl_update_appointment":
      return safe(() => ghl.put(`/appointments/${args.appointmentId}`, args));

    // FORMS & SURVEYS
    case "ghl_list_forms":
      return safe(() => ghl.get("/forms/", { params: { locationId: GHL_LOCATION_ID } }));
    case "ghl_get_form_submissions":
      return safe(() => ghl.get(`/forms/submissions`, { params: { locationId: GHL_LOCATION_ID, formId: args.formId, startAt: args.startAt || 0, limit: args.limit || 20 } }));
    case "ghl_list_surveys":
      return safe(() => ghl.get("/surveys/", { params: { locationId: GHL_LOCATION_ID } }));

    // CAMPAIGNS
    case "ghl_list_campaigns":
      return safe(() => ghl.get("/campaigns/", { params: { locationId: GHL_LOCATION_ID } }));

    // USERS
    case "ghl_list_users":
      return safe(() => ghl.get("/users/", { params: { locationId: GHL_LOCATION_ID } }));
    case "ghl_get_user":
      return safe(() => ghl.get(`/users/${args.userId}`));

    // CUSTOM VALUES
    case "ghl_list_custom_values":
      return safe(() => ghl.get("/custom-values/", { params: { locationId: GHL_LOCATION_ID } }));

    default:
      return { success: false, error: `Unknown tool: ${name}` };
  }
}

// ── MCP Server Setup ─────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

const transports = {};

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  const server = new Server(
    { name: "ghl-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await executeTool(request.params.name, request.params.arguments || {});
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  });

  transports[transport.sessionId] = transport;
  res.on("close", () => delete transports[transport.sessionId]);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).json({ error: "Invalid session ID" });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok", service: "ghl-mcp-server" }));

app.listen(PORT, () => {
  console.log(`✅ GHL MCP Server running on port ${PORT}`);
  console.log(`📡 SSE endpoint: http://localhost:${PORT}/sse`);
});
