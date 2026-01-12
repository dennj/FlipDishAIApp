import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  type CallToolRequest,
  type ListToolsRequest,
  type ListResourcesRequest,
  type ReadResourceRequest,
  type Tool,
  type Resource,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import fs from "node:fs";
import * as flipdish from "./flipdish-client.js";
import * as state from "./state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, "..", "assets");

// Load built widget HTML from assets directory (served by asset server on port 4444)
function loadBuiltWidget(widgetName: string): string {
  const htmlPath = path.join(ASSETS_DIR, "src", "widgets", widgetName, "index.html");
  if (fs.existsSync(htmlPath)) {
    return fs.readFileSync(htmlPath, "utf-8");
  }
  throw new Error(`Widget HTML not found: ${htmlPath}`);
}

const MENU_CAROUSEL_HTML = loadBuiltWidget("menu-carousel");
const LOGIN_HTML = loadBuiltWidget("login");
const BASKET_HTML = loadBuiltWidget("basket");

// Load environment variables
// Debug: Log environment variables
console.log('🔍 Environment variables loaded:');
console.log('  FLIPDISH_APP_ID:', process.env.FLIPDISH_APP_ID);
console.log('  FLIPDISH_STORE_ID:', process.env.FLIPDISH_STORE_ID);
console.log('  PORT:', process.env.PORT);

// Initialize FlipDish client
flipdish.setConfig({
  appId: process.env.FLIPDISH_APP_ID,
  storeId: parseInt(process.env.FLIPDISH_STORE_ID),
  bearerToken: process.env.FLIPDISH_BEARER_TOKEN,
  serverUrl: 'https://flip-dish-wrapper.vercel.app',
});

// Widget configuration
const WIDGET_URI = "ui://widgets/menu-carousel";
const LOGIN_WIDGET_URI = "ui://widgets/login";
const BASKET_WIDGET_URI = "ui://widgets/basket";

const WIDGET_META = {
  "openai/outputTemplate": WIDGET_URI,
  "openai/widgetAccessible": true,
  "openai/allowToolCall": true,
};

const LOGIN_META = {
  "openai/outputTemplate": LOGIN_WIDGET_URI,
  "openai/widgetAccessible": true,
  "openai/allowToolCall": true,
};

const BASKET_META = {
  "openai/outputTemplate": BASKET_WIDGET_URI,
  "openai/widgetAccessible": true,
  "openai/allowToolCall": true,
};

// Tool definitions
const tools: Tool[] = [
  {
    name: "search_menu",
    description: "Search the FlipDish menu for food items",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (e.g., 'burger', 'pizza')",
        },
      },
      required: ["query"],
    },
    _meta: WIDGET_META,
  },
  {
    name: "add_to_basket",
    description: "Add a menu item to the basket",
    inputSchema: {
      type: "object",
      properties: {
        menuItemId: {
          type: "number",
          description: "The menu item ID from search results",
        },
        quantity: {
          type: "number",
          description: "Quantity to add (default: 1)",
        },
        menuItemOptionSetItems: {
          type: "array",
          items: {
            type: "number"
          },
          description: "List of selected option IDs (optional)",
        }
      },
      required: ["menuItemId"],
    },
  },
  {
    name: "view_basket",
    description: "View the current basket contents",
    inputSchema: {
      type: "object",
      properties: {},
    },
    _meta: BASKET_META,
  },
  {
    name: "remove_from_basket",
    description: "Remove an item from the basket",
    inputSchema: {
      type: "object",
      properties: {
        menuItemId: {
          type: "number",
          description: "The menu item ID to remove",
        },
        quantity: {
          type: "number",
          description: "Quantity to remove (default: 1)",
        },
      },
      required: ["menuItemId"],
    },
    _meta: BASKET_META,
  },
  {
    name: "clear_basket",
    description: "Clear all items from the basket",
    inputSchema: {
      type: "object",
      properties: {},
    },
    _meta: BASKET_META,
  },
  {
    name: "submit_order",
    description: "Submit the order (requires authentication)",
    inputSchema: {
      type: "object",
      properties: {
        paymentAccountId: {
          type: "number",
          description: "Payment account ID (optional)",
        },
      },
    },
    // NOTE: No _meta here - widget is chosen dynamically based on auth state
    // If not authenticated, returns LOGIN_META; if authenticated, returns success
  },
  {
    name: "send_otp",
    description: "Send OTP to phone number for authentication (widget use only)",
    inputSchema: {
      type: "object",
      properties: {
        phoneNumber: {
          type: "string",
          description: "Phone number to send OTP to",
        },
      },
      required: ["phoneNumber"],
    },
    _meta: LOGIN_META,
  },
  {
    name: "verify_otp",
    description: "Verify OTP code for authentication (widget use only)",
    inputSchema: {
      type: "object",
      properties: {
        phoneNumber: {
          type: "string",
          description: "Phone number used for OTP",
        },
        code: {
          type: "string",
          description: "OTP code received",
        },
      },
      required: ["phoneNumber", "code"],
    },
    _meta: LOGIN_META,
  },
];

// Tool input parsers
const searchMenuSchema = z.object({
  query: z.string(),
});

const addToBasketSchema = z.object({
  menuItemId: z.number(),
  quantity: z.number().optional(),
  menuItemOptionSetItems: z.array(z.number()).optional(),
});

const removeFromBasketSchema = z.object({
  menuItemId: z.number(),
  quantity: z.number().optional(),
});

const submitOrderSchema = z.object({
  paymentAccountId: z.number().optional(),
});

const sendOtpSchema = z.object({
  phoneNumber: z.string(),
});

const verifyOtpSchema = z.object({
  phoneNumber: z.string(),
  code: z.string(),
});

// Ensure session is initialized
// NOTE: Creates GUEST sessions (no auth token) because wrapper's updateBasket
// only works for guest sessions. Auth is handled separately for submit_order.
async function ensureSession(): Promise<string> {
  let chatId = state.getChatId();

  if (!chatId) {
    console.log("🔧 Initializing new FlipDish session (guest mode)...");
    // Don't pass auth token - creates guest session for basket operations
    const result = await flipdish.createSession();
    chatId = result.chatId;
    state.setChatId(chatId);
    console.log(`✅ Guest session created: ${chatId}`);
  }

  return chatId;
}

// Execute tool implementation
async function executeToolInternal(name: string, args: any): Promise<any> {
  const chatId = await ensureSession();
  const token = state.getAuthToken();

  console.log(`🔧 Executing: ${name}`);
  console.log(`   ChatID: ${chatId}`);
  console.log(`   Args:`, args);

  switch (name) {
    case "search_menu": {
      const { query } = searchMenuSchema.parse(args);
      const items = await flipdish.searchMenu(chatId, query, token || undefined);

      console.log(`📊 Search completed: ${items.length} items found`);

      // Store search results for validation
      state.setSearchResults(items);

      const response = {
        content: [
          {
            type: "text",
            text: `Found ${items.length} menu items`,
          },
        ],
        structuredContent: {
          items,
        },
        _meta: {
          "openai/outputTemplate": WIDGET_URI,
          "openai/toolInvocation/invoking": "Searching menu...",
          "openai/toolInvocation/invoked": `Found ${items.length} items`,
        },
      };

      console.log('✅ Returning search_menu response with _meta:', JSON.stringify(response._meta, null, 2));
      return response;
    }

    case "add_to_basket": {
      const { menuItemId, quantity = 1, menuItemOptionSetItems } = addToBasketSchema.parse(args);

      // Validate against search results
      const searchResults = state.getSearchResults();
      if (searchResults.length > 0) {
        const validIds = searchResults.map((item: any) => item.menuItemId);
        if (!validIds.includes(menuItemId)) {
          throw new Error(`Invalid menuItemId. Valid IDs: ${validIds.join(", ")}`);
        }
      }

      // Note: updateBasket works for guest sessions
      // Authenticated basket updates would need wrapper server support
      await flipdish.updateBasket(
        chatId,
        {
          addMenuItems: [{
            menuItemId,
            quantity,
            menuItemOptionSetItems,
          }],
        },
        token || undefined
      );

      const basket = await flipdish.getBasket(chatId, token || undefined);

      // Find the item we just added to get its name for better context
      const addedItem = basket.basketMenuItems?.find((item: any) => item.menuItemId === menuItemId);
      const itemName = addedItem ? addedItem.name : "item";

      return {
        content: [
          {
            type: "text",
            text: `Added ${quantity}x ${itemName} to basket`,
          },
        ],
        structuredContent: {
          basket,
          action: "add",
          menuItemId,
          quantity,
          itemName,
        },
      };
    }

    case "view_basket": {
      const basket = await flipdish.getBasket(chatId, token || undefined);
      const items = basket.basketMenuItems || [];
      const total = basket.totalPrice || 0;

      return {
        content: [
          {
            type: "text",
            text: `Basket contains ${items.length} items (€${total.toFixed(2)})`,
          },
        ],
        structuredContent: {
          basket,
        },
        _meta: {
          "openai/outputTemplate": BASKET_WIDGET_URI,
          "openai/toolInvocation/invoking": "Loading basket...",
          "openai/toolInvocation/invoked": `${items.length} items in basket`,
        },
      };
    }

    case "remove_from_basket": {
      const { menuItemId, quantity = 1 } = removeFromBasketSchema.parse(args);

      // Note: updateBasket works for guest sessions
      // Authenticated basket updates would need wrapper server support
      await flipdish.updateBasket(
        chatId,
        {
          removeMenuItems: [{
            menuItemId,
            quantity,
          }],
        },
        token || undefined
      );

      const basket = await flipdish.getBasket(chatId, token || undefined);

      return {
        content: [
          {
            type: "text",
            text: `Removed ${quantity}x item from basket`,
          },
        ],
        structuredContent: {
          basket,
          action: "remove",
        },
        _meta: {
          "openai/outputTemplate": BASKET_WIDGET_URI,
        },
      };
    }

    case "clear_basket": {
      await flipdish.clearBasket(chatId, token || undefined);

      return {
        content: [
          {
            type: "text",
            text: "Basket cleared",
          },
        ],
        structuredContent: {
          basket: { basketMenuItems: [], totalPrice: 0 },
        },
      };
    }

    case "submit_order": {
      if (!token) {
        console.log('⚠️ No token found. Triggering authentication widget.');
        const authResponse = {
          content: [
            {
              type: "text",
              text: "Please authenticate to continue.",
            },
          ],
          _meta: {
            "openai/outputTemplate": LOGIN_WIDGET_URI,
            "openai/toolInvocation/invoking": "Authentication required...",
            "openai/toolInvocation/invoked": "Please login to continue",
            "openai/widgetAccessible": true
          },
          structuredContent: {
            error: "authentication_required",
            message: "Authentication widget opened. Please log in using the form."
          }
        };
        return authResponse;
      }

      const { paymentAccountId } = submitOrderSchema.parse(args);
      const result = await flipdish.submitOrder(chatId, token, paymentAccountId);

      if (!result.success) {
        console.error('❌ Order submission failed:', result.error);
        throw new Error(result.error || "Order submission failed");
      }

      return {
        content: [
          {
            type: "text",
            text: result.leadTimePrompt || `Order placed! Order ID: ${result.orderId}`,
          },
        ],
        structuredContent: {
          success: true,
          orderId: result.orderId,
          leadTimePrompt: result.leadTimePrompt,
        },
      };
    }

    case "send_otp": {
      const { phoneNumber } = sendOtpSchema.parse(args);
      const result = await flipdish.sendOTP(phoneNumber);

      if (!result.success) {
        throw new Error(result.error || "Failed to send OTP");
      }

      return {
        content: [
          {
            type: "text",
            text: `OTP sent to ${phoneNumber}`,
          },
        ],
        _meta: {
          "openai/outputTemplate": LOGIN_WIDGET_URI,
        }
      };
    }

    case "verify_otp": {
      const { phoneNumber, code } = verifyOtpSchema.parse(args);
      const result = await flipdish.verifyOTP(phoneNumber, code, chatId);

      if (!result.success || !result.token) {
        throw new Error(result.error || "OTP verification failed");
      }

      // Store auth token
      state.setAuthToken(result.token, phoneNumber);

      return {
        content: [
          {
            type: "text",
            text: "Authentication successful!",
          },
        ],
        structuredContent: {
          authenticated: true,
          phoneNumber,
        },
        _meta: {
          "openai/outputTemplate": LOGIN_WIDGET_URI,
        }
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Wrapper to handle session expiration retries
async function executeTool(name: string, args: any): Promise<any> {
  try {
    return await executeToolInternal(name, args);
  } catch (error: any) {
    // Check for session expiration / context not found
    // "Call context not found" is specific to Flipdish Invalid Session ID
    if (error.message && error.message.includes("Call context not found")) {
      console.log("♻️ Session expired (Call context not found), refreshing session...");
      // Clear current chatID to force new session creation
      state.setChatId(''); // Empty string will prompt ensureSession to create new

      // Retry the tool execution once
      return await executeToolInternal(name, args);
    }
    // Re-throw if not a session error
    throw error;
  }
}

function createFlipDishServer(): Server {
  const server = new Server(
    {
      name: "flipdish",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Resource handlers for widget HTML
  const resources: Resource[] = [
    {
      uri: WIDGET_URI,
      name: "Menu Carousel Widget",
      description: "Interactive menu carousel widget markup",
      mimeType: "text/html+skybridge",
      _meta: WIDGET_META,
    },
    {
      uri: LOGIN_WIDGET_URI,
      name: "Login Widget",
      description: "User authentication widget",
      mimeType: "text/html+skybridge",
      _meta: LOGIN_META,
    },
    {
      uri: BASKET_WIDGET_URI,
      name: "Basket Widget",
      description: "Shopping basket widget with checkout",
      mimeType: "text/html+skybridge",
      _meta: BASKET_META,
    },
  ];

  server.setRequestHandler(
    ListResourcesRequestSchema,
    async (_request: ListResourcesRequest) => ({
      resources,
    })
  );

  server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request: ReadResourceRequest) => {

      if (request.params.uri === WIDGET_URI) {
        console.log(`✅ Serving Menu Widget: ${WIDGET_URI}`);
        return {
          contents: [
            {
              uri: WIDGET_URI,
              mimeType: "text/html+skybridge",
              text: MENU_CAROUSEL_HTML,
              _meta: WIDGET_META,
            },
          ],
        };
      }

      if (request.params.uri === LOGIN_WIDGET_URI) {
        console.log(`✅ Serving Login Widget: ${LOGIN_WIDGET_URI}`);
        return {
          contents: [
            {
              uri: LOGIN_WIDGET_URI,
              mimeType: "text/html+skybridge",
              text: LOGIN_HTML,
              _meta: LOGIN_META,
            },
          ],
        };
      }

      if (request.params.uri === BASKET_WIDGET_URI) {
        console.log(`✅ Serving Basket Widget: ${BASKET_WIDGET_URI}`);
        return {
          contents: [
            {
              uri: BASKET_WIDGET_URI,
              mimeType: "text/html+skybridge",
              text: BASKET_HTML,
              _meta: BASKET_META,
            },
          ],
        };
      }


      throw new Error(`Unknown resource: ${request.params.uri}`);
    }
  );

  server.setRequestHandler(
    ListToolsRequestSchema,
    async (_request: ListToolsRequest) => {
      console.log('📋 ListTools request received. Returning', tools.length, 'tools:', tools.map(t => t.name));
      return { tools };
    }
  );

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      console.log(`\n🔧 CallTool request received:`);
      console.log(`   Tool: ${request.params.name}`);
      console.log(`   Args: ${JSON.stringify(request.params.arguments)}`);
      try {
        const result = await executeTool(
          request.params.name,
          request.params.arguments ?? {}
        );
        console.log(`✅ Tool ${request.params.name} executed successfully`);
        return result;
      } catch (error: any) {
        console.error(`❌ Tool execution failed:`, error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

type SessionRecord = {
  server: Server;
  transport: SSEServerTransport;
};

const sessions = new Map<string, SessionRecord>();

const ssePath = "/mcp";
const postPath = "/mcp/messages";

async function handleSseRequest(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const server = createFlipDishServer();
  const transport = new SSEServerTransport(postPath, res);
  const sessionId = transport.sessionId;

  sessions.set(sessionId, { server, transport });

  transport.onclose = async () => {
    sessions.delete(sessionId);
    await server.close();
  };

  transport.onerror = (error) => {
    console.error("SSE transport error", error);
  };

  try {
    await server.connect(transport);
  } catch (error) {
    sessions.delete(sessionId);
    console.error("Failed to start SSE session", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to establish SSE connection");
    }
  }
}

async function handlePostMessage(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    res.writeHead(400).end("Missing sessionId query parameter");
    return;
  }

  const session = sessions.get(sessionId);

  if (!session) {
    res.writeHead(404).end("Unknown session");
    return;
  }

  try {
    await session.transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("Failed to process message", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to process message");
    }
  }
}

const portEnv = Number(process.env.PORT ?? 8000);
const port = Number.isFinite(portEnv) ? portEnv : 8000;

const httpServer = createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.writeHead(400).end("Missing URL");
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

    if (
      req.method === "OPTIONS" &&
      (url.pathname === ssePath || url.pathname === postPath)
    ) {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === ssePath) {
      await handleSseRequest(res);
      return;
    }

    if (req.method === "POST" && url.pathname === postPath) {
      await handlePostMessage(req, res, url);
      return;
    }

    res.writeHead(404).end("Not Found");
  }
);

httpServer.on("clientError", (err: Error, socket) => {
  console.error("HTTP client error", err);
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

httpServer.listen(port, () => {
  console.log(`🍔 FlipDish MCP server listening on http://localhost:${port}`);
  console.log(`  SSE stream: GET http://localhost:${port}${ssePath}`);
  console.log(
    `  Message post endpoint: POST http://localhost:${port}${postPath}?sessionId=...`
  );
});
