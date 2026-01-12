# FlipDish ChatGPT App

A ChatGPT App that enables food ordering from FlipDish restaurants directly within ChatGPT using the Model Context Protocol (MCP) and OpenAI Apps SDK.

## Features

- 🔍 **Search Menu** - Browse food items with an interactive carousel widget
- 🛒 **Basket Management** - Add, remove, and view items in your basket
- 💳 **Checkout** - Place orders with OTP verification
- 🎨 **Rich UI Widgets** - Visual product cards with images, prices, and descriptions

## Architecture

This app uses a two-server architecture (same as OpenAI's pizzaz example):

1. **MCP Server** (port 8000) - Handles tool calls and serves widget HTML
2. **Asset Server** (port 4444) - Serves widget CSS/JS files
3. **ngrok** - Tunnels MCP server to ChatGPT

## Prerequisites

- Node.js 18+
- ChatGPT Plus, Pro, Business, Enterprise, or Education account
- ngrok account (free tier works)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
FLIPDISH_APP_ID=your_app_id
FLIPDISH_STORE_ID=your_store_id
FLIPDISH_BEARER_TOKEN=your_bearer_token
PORT=8000
```

### 3. Build Widgets

```bash
npm run build:widgets
```

This compiles the React widgets into the `assets/` directory.

## Running the App

You need **THREE terminals** running simultaneously:

### Terminal 1: MCP Server

```bash
npm run dev
```

This starts the MCP server on **port 8000**.

### Terminal 2: Asset Server

```bash
npm run serve
```

This serves widget assets (CSS/JS) on **port 4444**.

### Terminal 3: ngrok Tunnel

```bash
ngrok http 8000
```

This creates a public URL for the MCP server.

**Copy the ngrok URL** (e.g., `https://abc123.ngrok-free.app`)

## Adding to ChatGPT

1. Open ChatGPT Settings
2. Go to **Apps & Connectors**
3. Click **Advanced settings**
4. Enable **Developer mode**
5. Click **Add MCP Connector**
6. Enter your ngrok URL with `/mcp` endpoint:
   ```
   https://your-ngrok-url.ngrok-free.app/mcp
   ```
7. Click **Add**

## Usage

Start a new chat in ChatGPT and try:

- **"Show me coffee"** - Search menu items
- **"Add a latte to my basket"** - Add items
- **"View my basket"** - See current order
- **"Checkout"** - Place order

## Available Tools

- `search_menu` - Search for menu items with visual carousel
- `add_to_basket` - Add items to basket
- `remove_from_basket` - Remove items from basket
- `update_basket_item` - Change item quantity
- `view_basket` - Display current basket
- `clear_basket` - Empty basket
- `checkout` - Submit order with OTP verification
- `send_otp` - Request verification code
- `verify_otp` - Validate phone number
- `get_restaurant_status` - Check if restaurant is open

## Development

### Build Widgets

```bash
npm run build:widgets
```

### Type Check

```bash
npm run build
```

### File Structure

```
AI-App/
├── src/
│   ├── server.ts          # MCP server implementation
│   ├── flipdish-client.ts # FlipDish API wrapper
│   ├── state.ts           # Session state management
│   └── widgets/
│       └── menu-carousel/ # React widget for menu display
├── assets/                # Built widget files (generated)
├── .env                   # Configuration (not in git)
└── package.json
```

## Troubleshooting

### Widgets Not Loading

**Error:** `GET http://localhost:4444/... net::ERR_CONNECTION_REFUSED`

**Fix:** Make sure the asset server is running (`npm run serve` in Terminal 2)

### ChatGPT Not Connecting

1. Check that all three services are running
2. Verify ngrok URL is correct with `/mcp` endpoint
3. Restart ChatGPT connector (remove and re-add)
4. Start a **new chat** (old chats keep old connections)

### Third-Party Cookie Issues

If widgets don't render in Chrome:

1. Go to `chrome://settings/cookies`
2. Add to allowed sites:
   - `[*.]openai.com`
   - `[*.]chatgpt.com`
3. Check "Including third-party cookies on this site"

## API Integration

This app connects to the FlipDish Server API at `https://flip-dish-wrapper.vercel.app/api`.

See `src/flipdish-client.ts` for API implementation.