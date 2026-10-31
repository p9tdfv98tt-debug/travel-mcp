# ✈️ Travel Agent & MCP (`travel-mcp`)

A dual-purpose autonomous **Voice & Terminal AI Travel Agent** and **Model Context Protocol (MCP)** server for discovering, comparing, and packaging low-price flights and hotels across **Skyscanner**, **Booking.com**, **Hotels.com**, **Expedia**, and **ITA Software Matrix**.

---

## 🎙️ Spoken Voice & Terminal Interaction

The AI Travel Agent now features **bidirectional voice conversation** right in your terminal:
1. **The Agent Talks to You**:
   - Uses Microsoft Edge Neural TTS (any voice, set with `TRAVEL_VOICE`) and plays aloud via macOS `afplay`.
   - Synthesizes natural, conversational spoken summaries while simultaneously printing full visual markdown tables, prices, and booking deep links to your terminal screen.
2. **You Talk Back**:
   - Press **[ENTER]** on an empty line (or type `/mic`) to activate your microphone.
   - Speak your request naturally into your microphone and press **[ENTER]** when done.
   - The agent transcribes your audio using Gemini multimodal transcription and immediately executes your travel plan!
   - You can also type text normally at any time.

---

## 📦 Installation

Requires Node.js 18+.

```bash
git clone https://github.com/p9tdfv98tt-debug/travel-mcp.git
cd travel-mcp
npm install
npm run build
```

Copy `.env.example` to `.env` and fill in what you need. The voice agent needs a Gemini key; the MCP server tools don't:

```bash
GEMINI_API_KEY=your-key        # or GOOGLE_API_KEY
TRAVEL_AGENT_MODEL=...         # optional, overrides the default Gemini model
```

Voice input on macOS uses a small Swift recorder. Build it once:

```bash
mkdir -p bin && swiftc src/agent/record.swift -o bin/macos-rec
```

---

## 🚀 Quickstart

### 1. Launch Voice & Terminal Session
```bash
npm run agent
```

### 2. Conversation Flow Example
```text
TravelAgent (type, or press ENTER to speak)> [PRESS ENTER]
🎙️ [RECORDING LIVE] Speak your request now into your microphone...
(Press [ENTER] when you are finished speaking)
[User speaks: "Find a 4-night trip from New York to Barcelona for 2 adults in November with breakfast" and hits ENTER]

⏳ Stopped recording. Transcribing your voice with Gemini...
🗣️ You (Voice): "Find a 4-night trip from New York to Barcelona for 2 adults in November with breakfast"

📊 Calculating package deal (flights + top hotels) for Barcelona...
✔ Package generated: Cheapest flight $812 total
✈️ Searching flights NYC ➔ Barcelona...
✔ Found 24 options
🏨 Searching hotels in Barcelona...
✔ Found 31 options

[Full Markdown Tables & 1-Click Booking Links Displayed on Screen]
🔊 Speaking recommendation...
[Agent speaks aloud: "I found a Barcelona trip with flights from JFK and a four-night stay with breakfast included for about 1,400 dollars total..."]
```

### 3. Interactive Commands
- **[ENTER] on empty line**: Start microphone recording to speak back
- `/mic` or `/speak`: Record voice query from microphone
- `/voice`: Toggle agent spoken voice output ON / OFF
- `/deals <dep> <ret>`: Quick scan of the cheapest destinations from your origin (e.g. `/deals 2026-11-05 2026-11-09`)
- `/reset`: Clear chat history and restart conversation context
- `/help`: Show command guide
- `/exit`: Quit the agent

### 4. Shell One-Shot Task
```bash
npm run agent -- "Find direct flights from London to Rome in November for 2 adults" --voice
```

---

## 🎯 Defaults & Personal Preferences

Out of the box the tools make no assumptions about who you are: prices in **USD**, **1 adult**, any number of stops, no hotel filters, and the origin must be given in each request. Anything you ask for in a request (origin, currency, travellers, direct only, star rating, kitchen or breakfast) overrides the defaults.

To set your own defaults, add any of these to your `.env` (see `.env.example`):

| Variable | Example | Effect |
| :--- | :--- | :--- |
| `TRAVEL_ORIGIN` | `LON` | Home airport or city code, used when a request doesn't name one. |
| `TRAVEL_CURRENCY` | `EUR` | Currency for all prices. |
| `TRAVEL_ADULTS` | `2` | Travellers per search. |
| `TRAVEL_DIRECT_ONLY` | `true` | Non-stop flights only. |
| `TRAVEL_CHECKED_BAGS` | `true` | Add an estimated checked-bag cost (1 per person, return) to fares. |
| `TRAVEL_MIN_STARS` / `TRAVEL_MAX_STARS` | `3` / `4` | Hotel star filter. |
| `TRAVEL_REQUIRE_KITCHEN_OR_BREAKFAST` | `true` | Only hotels with a kitchen or breakfast. |
| `TRAVEL_DEAL_DESTINATIONS` | `Rome,Paris,Lisbon` | Cities scanned by `find_cheapest_destinations`. |
| `TRAVEL_VOICE` | `en-GB-RyanNeural` | Voice for the voice agent. |

Every result comes with pre-populated booking links for Skyscanner, Booking.com, Hotels.com, Expedia, Google, and ITA Matrix / BookWithMatrix.

---

## 🛠️ Exposed MCP Tools

| Tool | Description |
| :--- | :--- |
| `search_flights` | Searches live return flights with schedules, airlines, prices and booking links. Filters for direct-only, cabin class, aircraft and duration; optional checked-bag estimate. |
| `search_hotels` | Searches live hotels with nightly and total prices. Optional star, kitchen/breakfast, review score, price and neighbourhood filters. |
| `compare_trip_deal` | Combines the cheapest flight with the best-priced hotels into a package estimate with a per-person breakdown. |
| `find_cheapest_destinations` | Scans a list of destinations for flights on given dates and ranks them by total price. |
| `generate_booking_links` | Generates pre-filled booking and checkout links across all providers. |
| `ita_matrix_power_search` | Generates ITA Software Matrix advanced routing strings and BookWithMatrix checkout links. |

---

## ⚙️ MCP Server Configuration

Add the server to your MCP client's config (Claude Code, Claude Desktop, Antigravity, etc.), pointing at the built `dist/index.js`:

```json
{
  "mcpServers": {
    "travel-mcp": {
      "command": "node",
      "args": ["/path/to/travel-mcp/dist/index.js"]
    }
  }
}
```

For Claude Code you can also run:

```bash
claude mcp add travel-mcp -- node /path/to/travel-mcp/dist/index.js
```
