# ✈️ Travel Agent & MCP (`travel-mcp`)

A dual-purpose autonomous **Voice & Terminal AI Travel Agent** and **Model Context Protocol (MCP)** server for discovering, comparing, and packaging low-price flights and hotels across **Skyscanner**, **Booking.com**, **Hotels.com**, **Expedia**, and **ITA Software Matrix**.

---

## 🎙️ Spoken Voice & Terminal Interaction

The AI Travel Agent now features **bidirectional voice conversation** right in your terminal:
1. **The Agent Talks to You**:
   - Uses Microsoft Edge Neural TTS with a British voice (`en-GB-RyanNeural`) and plays aloud via macOS `afplay`.
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

Create a `.env` file for the voice agent (the MCP server tools don't need it):

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
[User speaks: "Find a 4-night trip to Barcelona for 2 adults in November with breakfast" and hits ENTER]

⏳ Stopped recording. Transcribing your voice with Gemini...
🗣️ You (Voice): "Find a 4-night trip to Barcelona for 2 adults in November with breakfast"

📊 Calculating package deal (flights + top hotels) for Barcelona...
✔ Package generated: Cheapest flight £82 total
✈️ Searching direct flights LON ➔ Barcelona...
✔ Found 24 options
🏨 Searching 3-4★ hotels in Barcelona...
✔ Found 31 options

[Full Markdown Tables & 1-Click Booking Links Displayed on Screen]
🔊 Speaking recommendation...
[Agent speaks aloud via speakers with British voice: "I have found a fantastic Barcelona trip featuring direct easyJet flights from London Gatwick and a four-night stay at Casa Gràcia with breakfast included for 254 pounds total..."]
```

### 3. Interactive Commands
- **[ENTER] on empty line**: Start microphone recording to speak back
- `/mic` or `/speak`: Record voice query from microphone
- `/voice`: Toggle agent spoken voice output ON / OFF
- `/deals <dep> <ret>`: Quick scan of the lowest European getaways from London (e.g. `/deals 2026-11-05 2026-11-09`)
- `/reset`: Clear chat history and restart conversation context
- `/help`: Show command guide
- `/exit`: Quit the agent

### 4. Shell One-Shot Task
```bash
npm run agent -- "Find direct flights to Rome in November for 2 adults" --voice
```

---

## 🎯 Core Design Principles & Defaults
Unless explicitly overridden in your prompt:
- **Strict Currency**: All airfares, hotel rates, and packages in **GBP (£)**.
- **Flight Route**: Always **direct non-stop return (round-trip)**.
- **Origin**: Default **London** (`LON` covering Heathrow `LHR`, Gatwick `LGW`, Stansted `STN`, Luton `LTN`, and London City `LCY`).
- **Passengers**: Default **2 adults** (1 hotel room, double occupancy).
- **Hotel Standards**: Strictly **3 or 4 stars** with either **kitchen/kitchenette** or **free breakfast** included.
- **Luggage Factoring**: Automatically calculates overhead cabin bags and 23kg checked bag estimates (£35–£70 per bag return).
- **Direct 1-Click Booking**: Real-time prices paired with pre-populated deep links for Skyscanner, Booking.com, Hotels.com, Expedia, and ITA Matrix / BookWithMatrix to complete bookings instantly.

---

## 🛠️ Exposed MCP Tools

| Tool | Description |
| :--- | :--- |
| `search_flights` | Searches live direct return flights from London for 2 people in GBP with schedules, airlines, and direct booking links. |
| `search_hotels` | Searches live hotel options in GBP for 2 adults enforcing 3–4★ and kitchen/breakfast amenities with per-night and total stay prices. |
| `compare_trip_deal` | Aggregates lowest direct flight + recommended hotels into a total package estimate for 2 people in GBP with per-person breakdown. |
| `find_cheapest_destinations` | Scans European destinations from London for direct return flights for 2 people on given dates and ranks them from lowest total GBP price. |
| `generate_booking_links` | Generates verified, pre-filtered 1-click booking/checkout links across all 5 providers. |
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
