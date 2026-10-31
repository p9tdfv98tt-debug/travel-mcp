# `travel-mcp` — Technical Specification & Architecture Reference

**Package:** `travel-mcp` (`v1.0.0`)  
**Entry Points:**
- **MCP Server (`stdio`):** `dist/index.js` (compiled from `src/index.ts`)
- **Voice & Terminal Agent CLI:** `dist/agent/cli.js` (compiled from `src/agent/cli.ts`)

---

## 1. System Overview

`travel-mcp` is a dual-mode TypeScript/Node.js (`ES2022` / `NodeNext` ESM) system providing zero-API-key live flight and hotel search, airline checked-baggage total cost modeling, multi-platform 1-click booking deep-link generation, and ITA Matrix advanced routing synthesis:

1. **Model Context Protocol (MCP) Server:** Exposes 6 lazy-loaded tools over `StdioServerTransport` (`@modelcontextprotocol/sdk` `^1.6.1`), usable from any MCP client (Claude Code, Claude Desktop, Antigravity, etc.).
2. **Standalone Bidirectional Voice & Terminal Agent:** Interactive and one-shot CLI (`npm run agent`) using `@google/genai` (`^2.22.0`), native macOS `AVFoundation` microphone capture (`src/agent/record.swift` → `bin/macos-rec`), Gemini multimodal speech-to-text, and Microsoft Edge Neural TTS (`node-edge-tts`, voice set by `TRAVEL_VOICE`) played via `afplay`.

> [!NOTE]
> The MCP server performs live server-side rendered (SSR) HTML scraping against Google Travel (`google.com/travel/flights` and `google.com/travel/hotels`) using native Node.js `fetch` and regex extraction. It requires **no external API keys** when invoked as an MCP server; `GEMINI_API_KEY` / `GOOGLE_API_KEY` is only required when running the standalone `travel-agent` CLI.

---

## 2. Architecture & Execution Flow

```mermaid
flowchart TD
    subgraph Clients["Client Interfaces"]
        AGY["MCP Client (Claude, Antigravity, ...)"]
        CLI["Terminal & Voice CLI (src/agent/cli.ts)"]
    end

    subgraph VoiceIO["macOS Native Audio Pipeline"]
        MIC["AVFoundation Recorder (bin/macos-rec)"]
        STT["Gemini Multimodal STT (audio/m4a)"]
        TTS["EdgeTTS (TRAVEL_VOICE) + afplay / say"]
    end

    subgraph Core["Entry & Orchestration"]
        MCP["MCP Stdio Server (src/index.ts)"]
        AGT["TravelAgent Loop (src/agent/travelAgent.ts)"]
        TOOLS["Gemini Tool Adapter (src/agent/tools.ts)"]
    end

    subgraph Services["Domain Service Layer (src/services/)"]
        DEAL["Deal Aggregator (dealFinder.ts)"]
        FLT["Flight Scraper (flightSearch.ts)"]
        BAG["Baggage Pricing Engine (baggage.ts)"]
        HTL["Hotel Scraper & Classifier (hotelSearch.ts)"]
        URL["Deep-Link Builder (urlBuilder.ts)"]
        ITA["ITA Matrix Synthesizer (itaMatrix.ts)"]
    end

    subgraph Upstream["External Targets"]
        GF["Google Flights SSR HTML"]
        GH["Google Hotels SSR HTML"]
        OTAS["1-Click Deep Links (Skyscanner, Booking, Hotels.com, Expedia, Kayak, BookWithMatrix)"]
    end

    AGY <-->|"JSON-RPC over stdio"| MCP
    CLI --> MIC --> STT --> AGT
    AGT --> TTS
    AGT --> TOOLS

    MCP --> FLT & HTL & DEAL & URL & ITA
    TOOLS --> FLT & HTL & DEAL & URL & ITA

    DEAL -->|"Promise.all"| FLT & HTL
    FLT -->|"fetch + aria-label / segment regex"| GF
    FLT --> BAG
    FLT --> URL
    HTL -->|"dual-query fetch + aria-label regex"| GH
    HTL --> URL
    ITA --> URL
    URL -.->|"Pre-populated URLs"| OTAS
```

### Package Aggregation Sequence (`compare_trip_deal`)

```mermaid
sequenceDiagram
    participant C as MCP Client
    participant S as src/index.ts
    participant D as dealFinder.ts
    participant F as flightSearch.ts
    participant B as baggage.ts
    participant H as hotelSearch.ts

    C->>S: CallTool("compare_trip_deal", args)
    S->>D: compareTripDeal(destination, dates, ...)
    par Parallel Live Scraping
        D->>F: searchFlights({ directOnly, checkedBags })
        F->>F: Fetch Google Flights HTML (nonstop + all-stops when directOnly)
        F->>F: Parse aria-labels + correlate aircraft/flight numbers
        F->>B: applyBaggagePolicy(flights, passengers, checkedBags)
        B-->>F: Bag-inclusive FlightOption[] sorted ascending
        F-->>D: FlightOption[]
    and
        D->>H: searchHotels({ minStarRating, maxStarRating, ... })
        H->>H: Query destination (or preferredLocations), plus a filtered query when filters are set
        H->>H: Apply star / kitchen-or-breakfast / price filters
        H-->>D: HotelOption[] sorted by nightly price
    end
    D-->>S: TripDeal (cheapestFlight + top 5 hotels + totalPackagePrice)
    S-->>C: JSON Text Content
```

---

## 3. Repository Structure & Module Map

```text
travel-mcp/
├── package.json              # ESM package manifest, scripts, dependencies
├── tsconfig.json             # TypeScript config (ES2022, NodeNext, strict)
├── README.md                 # Quickstart & user guide
├── TECHNICAL.md              # Technical specification & architecture reference
├── bin/
│   └── macos-rec             # Compiled macOS binary of record.swift
├── dist/                     # Compiled JS + .d.ts declarations (active MCP target)
└── src/
    ├── index.ts              # MCP Server entry point & 6 tool handlers
    ├── config.ts             # Search defaults (TRAVEL_* env vars), origin & currency helpers
    ├── types.ts              # Shared TypeScript interfaces & types
    ├── services/
    │   ├── flightSearch.ts   # Google Flights SSR scraper & segment correlator
    │   ├── baggage.ts        # Per-airline checked-bag fee rules & fare-family engine
    │   ├── hotelSearch.ts    # Google Hotels SSR scraper, brand/amenity heuristics
    │   ├── dealFinder.ts     # Trip package combiner & multi-city deal scanner
    │   ├── urlBuilder.ts     # Deep-link builders for 7 booking platforms
    │   └── itaMatrix.ts      # ITA Matrix routing/fare-basis/aircraft code generator
    └── agent/
        ├── index.ts          # Barrel exports for programmatic agent usage
        ├── cli.ts            # Interactive voice/REPL & one-shot CLI runner
        ├── travelAgent.ts    # GoogleGenAI chat wrapper with 429/503 model failover
        ├── tools.ts          # @google/genai FunctionDeclarations & future-date guard
        ├── prompts.ts        # Dynamic temporal system prompt generator
        ├── voice.ts          # EdgeTTS/afplay output & recorder/Gemini STT bridge
        └── record.swift      # Native AVAudioRecorder 16kHz mono AAC capture
```

| Module | Key Exports | Responsibility |
| :--- | :--- | :--- |
| `src/index.ts` | `Server` (`stdio`) | Registers `ListToolsRequestSchema` and `CallToolRequestSchema` for all 6 MCP tools. |
| `src/config.ts` | `DEFAULTS`, `resolveOrigin`, `originForQuery`, `formatMoney` | Loads `.env`, exposes the search defaults, maps metro codes (`LON`, `NYC`, ...) to city names for Google queries. |
| `src/types.ts` | `FlightSearchParams`, `FlightOption`, `BaggageInfo`, `HotelSearchParams`, `HotelOption`, `TripDeal`, `ITAMatrixCommand` | Canonical data contracts across MCP handlers, scrapers, and CLI agent. |
| `src/services/flightSearch.ts` | `searchFlights` | Scrapes Google Flights SSR HTML, correlates equipment/flight numbers, filters routing/aircraft/duration, attaches booking links & baggage policy. |
| `src/services/baggage.ts` | `applyBaggagePolicy`, `estimateCheckedBagCost`, `parseDurationHours` | Models short-haul vs. long-haul return checked-bag fees across 18 airline groups and re-ranks flights by bag-inclusive price. |
| `src/services/hotelSearch.ts` | `searchHotels`, `calculateNights` | Scrapes Google Hotels SSR HTML for the destination or given neighbourhoods, applies optional star, amenity, rating and price filters. |
| `src/services/dealFinder.ts` | `compareTripDeal`, `findCheapestDestinations` | Combines cheapest flight + top 5 hotels into a package deal; scans `TRAVEL_DEAL_DESTINATIONS` (or a built-in list of 12 cities) concurrently for lowest airfare. |
| `src/services/urlBuilder.ts` | `buildAllBookingLinks` + 7 platform builders | Formats dates (`YYMMDD`, `DD/MM/YYYY`, `YYYY-MM-DD`) and query parameters into pre-filtered checkout links. |
| `src/services/itaMatrix.ts` | `generateITAMatrixCommand` | Generates ITA Matrix routing codes (`N:`, `alliance`, `/ f bc=...`, `/ aircraft t:...`) and `maxconnect 0` extension codes when `directOnly`. |

---

## 4. MCP Tool Reference

All tools return an MCP `CallToolResult` containing a single `text` block with pretty-printed JSON (`JSON.stringify(..., null, 2)`). On unhandled exceptions, the handler returns `{ isError: true, content: [{ type: 'text', text: 'Error executing tool ...' }] }`.

Defaults below are the built-in values; each can be changed with the `TRAVEL_*` environment variables in section 7.

### 4.1 `search_flights`

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `destination` | `string` | Yes | — | Destination city or IATA code (e.g., `"Barcelona"`, `"JFK"`). |
| `departureDate` | `string` | Yes | — | Outbound date (`YYYY-MM-DD`). |
| `returnDate` | `string` | Yes | — | Inbound date (`YYYY-MM-DD`). |
| `origin` | `string` | If no `TRAVEL_ORIGIN` | `TRAVEL_ORIGIN` | Origin city or IATA code. Metro codes (`LON`, `NYC`, `PAR`, ...) expand to the city name in Google Flights queries. |
| `passengers` | `number` | No | `1` | Adult passenger count. |
| `directOnly` | `boolean` | No | `false` | Restrict results to direct non-stop flights. |
| `checkedBags` | `boolean` | No | `false` | Add an estimated 1 checked bag (~23kg) per passenger return to `totalPrice` and sort by bag-inclusive total. |
| `currency` | `string` | No | `"USD"` | ISO currency code. |
| `cabinClass` | `string` | No | `"economy"` | Enum: `"economy"` \| `"premium_economy"` \| `"business"` \| `"first"`. |
| `aircraftFilter` | `string[]` | No | `undefined` | Case-insensitive substring filter against detected equipment (e.g., `["A350", "A380", "777", "787"]`). |
| `minDurationHours` | `number` | No | `undefined` | Minimum flight duration in hours (e.g., `8` for long-haul `8h+`). |

### 4.2 `search_hotels`

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `destination` | `string` | Yes | — | Destination city or district. |
| `checkinDate` | `string` | Yes | — | Check-in date (`YYYY-MM-DD`). |
| `checkoutDate` | `string` | Yes | — | Check-out date (`YYYY-MM-DD`). |
| `adults` | `number` | No | `1` | Number of adult guests. |
| `rooms` | `number` | No | `1` | Number of rooms. |
| `minStarRating` | `number` | No | no limit | Minimum inferred star rating. |
| `maxStarRating` | `number` | No | no limit | Maximum inferred star rating. |
| `requireKitchenOrBreakfast` | `boolean` | No | `false` | Require kitchen/kitchenette or breakfast amenity. |
| `preferredLocations` | `string[]` | No | `undefined` | Neighbourhoods to query instead of the whole destination. |
| `minRating` | `number` | No | `undefined` | Minimum Google user review score out of `5.0` (e.g., `4.0`). |
| `maxPricePerNight` | `number` | No | `undefined` | Nightly price cap in the search currency. |
| `currency` | `string` | No | `"USD"` | ISO currency code. |

### 4.3 `compare_trip_deal`
- Executes `searchFlights` and `searchHotels` concurrently via `Promise.all`, with the same flight and hotel parameters as above.
- Computes `totalPackagePrice = cheapestFlight.totalPrice + topHotels[0].totalPrice` (or flight-only if `hotels` is empty; returns `{ error: ... }` if no flights are found).
- Returns `TripDeal` containing `cheapestFlight`, up to 5 `recommendedHotels`, total & per-person prices, and 7 platform booking URLs.

### 4.4 `find_cheapest_destinations`
- Concurrently runs `searchFlights` across `destinations` (defaults to `TRAVEL_DEAL_DESTINATIONS`, or the built-in list in `src/config.ts`).
- Returns `DestinationDeal[]` sorted ascending by `totalFlightPrice`.

### 4.5 `generate_booking_links`
- Synchronous URL generator returning `MultiPlatformBookingLinks` (`flights`: Skyscanner, Expedia, Google Flights, ITA Matrix, BookWithMatrix; `hotels`: Booking.com, Hotels.com, Expedia, Google Hotels).

### 4.6 `ita_matrix_power_search`
- Accepts `destination`, `departureDate`, `returnDate`, `origin`, `passengers`, `directOnly`, `currency`, optional `alliance` (`"star-alliance"` \| `"oneworld"` \| `"skyteam"`), `cabinClass`, and `aircraftFilter`.
- Synthesizes ITA Matrix routing & extension codes plus step-by-step BookWithMatrix instructions.

---

## 5. Scraping, Pricing & Heuristic Engines

### 5.1 Google Flights SSR Scraper (`src/services/flightSearch.ts`)
1. **Query Construction (`buildQueryUrl`):**
   Builds natural-language Google Flights URLs:
   `https://www.google.com/travel/flights?q=<encoded>&curr=<currency>&hl=en`
   where `<encoded>` is `"[<cabinClass> flights to | Flights to ]<destination> from <originQuery> on <departureDate> through <returnDate> <passengers> adults [nonstop]"`.
2. **Dual-Fetch Coverage:** When `directOnly === true`, `searchFlights` fetches **both** the `nonstop` query URL and the unrestricted query URL via `Promise.allSettled`, then filters for `f.isDirect` in memory to maximize SSR recall.
3. **Dual-Pass HTML Extraction (`fetchAndParse`):**
   - **Pass 1 — Equipment & Flight Number Extraction (`extractFlightSegments`):** Scans inline serialized protobuf/JSON arrays in Google's `<script>` payload matching aircraft name, 2-char carrier code, flight number, airline name, origin/dest 3-letter IATA codes, `[hour, min]` tuples, and segment minutes.
   - **Pass 2 — Accessibility Label Fare Extraction:** Matches `aria-label="From <amount> <currency name> round trip total.…Select flight"` (any currency, e.g. "British pounds", "US dollars", "euros") to extract the round-trip total price, airline, origin/destination airport names, departure/arrival times, total duration, and non-stop status (`non-stop` / `nonstop`).
   - **Segment Correlation:** Joins each `aria-label` flight summary with Pass 1 segments by exact `depTime` or case-insensitive `airline` substring match.
4. **Deduplication:** Deduplicates by key `${airline}-${departureTime}-${isDirect}`, retaining the lowest `rawPrice`.

### 5.2 Checked-Baggage Cost Engine (`src/services/baggage.ts`)
Because Google Flights SSR displays unbundled basic-economy / hand-luggage fares, `applyBaggagePolicy` adjusts pricing according to three modes:
- **Premium Cabins (`business` or `first`):** Adds no bag cost (`isEstimate: false`), annotating `2 x 32kg` bags per passenger included in the fare.
- **Hand-Luggage Mode (`checkedBags: false`, the default):** Preserves `baseFareTotal` with `estimatedBagCostTotal: 0`.
- **Bag-Inclusive Mode (`checkedBags: true`):** Classifies flights with `parseDurationHours(duration) >= 6` (`LONG_HAUL_MIN_HOURS`) as **long-haul** and `< 6h` as **short-haul**, adds `perPerson * passengers` to `baseFareTotal`, and **re-sorts** all options ascending by the new `totalPrice`.

| Airline Pattern (`AIRLINE_BAG_RULES`) | Short-Haul (`<6h`) | Long-Haul (`>=6h`) | Recommended Fare Family / Add-On |
| :--- | :---: | :---: | :--- |
| Virgin Atlantic (`/virgin/i`) | £70 | £120 | Economy Classic (1 x 23kg included) |
| Delta (`/delta/i`) | £70 | £120 | Main Cabin (1 x 23kg included on transatlantic) |
| British Airways (`/british airways/i`) | £50 | £120 | Economy Standard / Euro Traveller with bag (1 x 23kg) |
| American Airlines (`/american/i`) | £70 | £120 | Main Cabin (1 x 23kg included on transatlantic) |
| United (`/united/i`) | £70 | £120 | Standard Economy (1 x 23kg included on transatlantic) |
| JetBlue (`/jetblue/i`) | £100 | £110 | Blue Plus (1 checked bag included) |
| Aer Lingus (`/aer lingus/i`) | £60 | £110 | Smart / Plus fare (1 x 23kg) |
| Norse Atlantic (`/norse/i`) | £90 | £90 | Economy Classic (1 x 23kg) |
| easyJet (`/easyjet/i`) | £90 | £90 | Add 23kg hold bag per person, both directions |
| Ryanair (`/ryanair/i`) | £85 | £85 | Add 20kg check-in bag per person, both directions |
| Wizz Air (`/wizz/i`) | £85 | £85 | Add 20kg/32kg checked bag per person, both directions |
| Jet2 (`/jet2/i`) | £70 | £70 | Add 22kg hold bag per person, both directions |
| Vueling (`/vueling/i`) | £60 | £60 | Optima fare or add 23kg bag |
| TAP Air Portugal (`/\btap\b\|tap air/i`) | £60 | £120 | Classic fare (1 x 23kg) |
| Iberia (`/iberia/i`) | £60 | £120 | Standard / Comfort fare (1 x 23kg) |
| Lufthansa Group (`/lufthansa\|swiss\|austrian\|brussels/i`) | £60 | £120 | Classic fare (1 x 23kg) |
| Air France / KLM (`/klm\|air france/i`) | £60 | £120 | Standard fare (1 x 23kg) |
| ITA Airways (`/ita airways/i`) | £60 | £120 | Classic fare (1 x 23kg) |
| **Fallback Default** (unmatched carrier) | **£75** | **£120** | Cheapest fare that includes 1 checked bag per person |

*(All figures above are GBP **per passenger, round-trip**, converted to the search currency with approximate rates in `GBP_RATES`. For currencies without a rate, no bag cost is added and the note says so.)*

### 5.3 Google Hotels Scraper & Brand Heuristics (`src/services/hotelSearch.ts`)
- **Locations:** Searches the destination, or each entry of `preferredLocations` when given.
- **Dual Query:** For each location, runs `"hotels in <loc> from <in> to <out>"`, plus a filtered query (e.g. `"3 to 4 star hotels with kitchen or breakfast in <loc> ..."`) when star or amenity filters are set, keeping the **lower** nightly rate per hotel. Prices are parsed from `aria-label="Prices starting from <symbol><amount>, <name>"` in any currency.
- **Quality & Amenity Classification:**
  - **Budget Properties (`isBudgetOrHostel`):** When `minStarRating >= 3`, rejects names matching `ymca`, `hostel`, `rodeway`, `motel 6`, `days inn`, `travelodge`, `econo lodge`, `super 8`.
  - **Star Inference (`detectStarRating`):** Assigns `4★` to `Hyatt Regency`, `DoubleTree`, `Canopy`, `Aloft`, `Crowne Plaza`, `Westin`, `Marriott`, and full-service `Hilton` (excluding `Hampton` and `Garden Inn`); assigns `3★` otherwise.
  - **Amenity Inference (`detectAmenities`):** Flags `"Kitchen / Kitchenette"` (`suites`, `residence inn`, `homewood`, `home2`, `towneplace`, `sonesta simply`, `candlewood`, `staybridge`, `apart`, `kitchen`, `sonder`, `hyatt house`) and `"Breakfast included"` (`holiday inn express`, `hampton`, `hyatt house`, `hyatt place`, `fairfield`, `residence inn`, `homewood`, `home2`, `towneplace`, `springhill`, `comfort inn`, `quality suites`, `ramada`, `wingate`, `breakfast`).

### 5.4 Deep-Link Formats & ITA Matrix Codes (`src/services/urlBuilder.ts`, `src/services/itaMatrix.ts`)
- **Skyscanner:** `https://www.skyscanner.net/transport/flights/{orig}/{dest}/{YYMMDD_out}/{YYMMDD_in}/?adultsv2={pax}&cabinclass={cabin}&rtn=1&preferdirects={bool}&currency={curr}`
- **Kayak (IATA-only, Bag-Fee Filter):** Built only when `origin` and `destination` match `/^[A-Z]{3}$/`. Appends `&fs=stops=0;bfc=1;cabin={e|p|b|f}` (stops and bags only when requested) so Kayak displays bag-inclusive fares.
- **Expedia Flights:** Uses `DD/MM/YYYYTANYT` leg timestamps and `options=cabinclass:{cabin},nstop:1`.
- **Booking.com / Hotels.com / Expedia Hotels / Google Hotels:** Pre-populates `YYYY-MM-DD` check-in/out dates, adult count, room count, and currency.
- **ITA Matrix Routing Codes:**
  - Direct-only code: `N:` with extension `maxconnect 0` (only when `directOnly`); alliance filter: `alliance star-alliance|oneworld|skyteam`.
  - Fare basis classes: Business `/ f bc=J|bc=C|bc=D|bc=I|bc=R`, First `/ f bc=F|bc=A`, Premium Economy `/ f bc=W|bc=E|bc=T`.
  - Aircraft equipment translation: `350` → `t:359 t:351`, `380` → `t:388`, `777` → `t:77W t:772 t:773 t:77L`, `787` → `t:788 t:789 t:78X t:781`.

---

## 6. Standalone Voice & CLI Agent Architecture

Located under `src/agent/`:
- **LLM Orchestration (`TravelAgent`):**
  - Default model: `process.env.TRAVEL_AGENT_MODEL || 'gemini-3.6-flash'` (`temperature: 0.2`, `MAX_TOOL_LOOPS = 5`).
  - Loads `.env` from CWD, package root, and `~/.gemini/antigravity/scratch/.env` (`GEMINI_API_KEY` or `GOOGLE_API_KEY`).
  - **Multi-Model Resilient Failover (`sendWithRetry`):** Intercepts HTTP `429` (`RESOURCE_EXHAUSTED`), `500`, and `503` (`UNAVAILABLE`), parses server `retryDelay` hints, migrates existing chat history to a backup model (`['gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest']`), and retries up to 3 times.
- **Temporal Guardrails:**
  - `getTravelAgentSystemPrompt()` injects the live ISO date at session startup.
  - `ensureFutureDate()` automatically rolls forward any tool call date whose year or month/day lies in the past.
- **Bidirectional Audio (`src/agent/voice.ts`, `src/agent/record.swift`):**
  - **Capture:** Spawns compiled `bin/macos-rec` (or `/usr/bin/swift src/agent/record.swift`), recording `16kHz` mono MPEG-4 AAC to `/tmp/travel_user_voice.m4a` until newline on `stdin` or a 30s timeout.
  - **Transcription:** Base64-encodes `.m4a` payloads (`>= 2000` bytes) to `gemini-3.6-flash` (`mimeType: 'audio/m4a'`).
  - **Speech Synthesis:** Summarizes full Markdown tables into 2–3 spoken sentences via `gemini-3.6-flash`, renders MP3 to `/tmp/travel_speech.mp3` via `EdgeTTS` (`TRAVEL_VOICE`, `rate: '+5%'`), plays via `/usr/bin/afplay`, and falls back to macOS `/usr/bin/say -v Daniel` offline.

---

## 7. Configuration, Build & Operations

### Search Defaults (`src/config.ts`)

Set in a `.env` file (current directory, package root, or `~/.gemini/antigravity/scratch/.env`) or the environment. See `.env.example`.

| Variable | Built-in default | Effect |
| :--- | :--- | :--- |
| `TRAVEL_ORIGIN` | none (origin required per call) | Home airport or city code. |
| `TRAVEL_CURRENCY` | `USD` | Currency for all prices. |
| `TRAVEL_ADULTS` | `1` | Travellers per search. |
| `TRAVEL_DIRECT_ONLY` | `false` | Non-stop flights only. |
| `TRAVEL_CHECKED_BAGS` | `false` | Add estimated checked-bag cost. |
| `TRAVEL_MIN_STARS` / `TRAVEL_MAX_STARS` | no limit | Hotel star filter. |
| `TRAVEL_REQUIRE_KITCHEN_OR_BREAKFAST` | `false` | Hotel amenity filter. |
| `TRAVEL_DEAL_DESTINATIONS` | 12 popular cities | Comma-separated list for `find_cheapest_destinations`. |
| `TRAVEL_VOICE` | `en-US-AriaNeural` | Edge TTS voice for the voice agent. |

### MCP Client Registration
```json
{
  "mcpServers": {
    "travel-mcp": {
      "command": "node",
      "args": [
        "/path/to/travel-mcp/dist/index.js"
      ]
    }
  }
}
```

### NPM Scripts (`package.json`)
| Script | Command | Purpose |
| :--- | :--- | :--- |
| `npm run build` | `tsc` | Compiles `src/**/*.ts` → `dist/` (must be run after editing `src/` for MCP changes to take effect). |
| `npm start` | `node dist/index.js` | Launches compiled MCP server on `stdio`. |
| `npm run dev` | `tsx src/index.ts` | Runs TypeScript MCP server directly in dev mode. |
| `npm run agent` | `tsx src/agent/cli.ts` | Starts interactive bidirectional Voice & Terminal Travel Agent (`-- "prompt" --voice` for one-shot). |
| `npm run agent:dist` | `node dist/agent/cli.js` | Runs compiled standalone CLI agent. |

---

## 8. Known Technical Caveats & Maintenance Notes

1. **Scraper fragility:** Both scrapers depend on Google's server-rendered `aria-label` text in English (`hl=en`). Changes to Google's markup will return `0` parsed results until the regexes are updated.
2. **CLI Agent vs. MCP Schema Drift (`src/agent/tools.ts`):** `cabinClass`, `aircraftFilter` and `minDurationHours` on `search_flights`, and `alliance`, `cabinClass`, `aircraftFilter` on `ita_matrix_power_search`, are exposed by the MCP server but not yet by the standalone CLI agent's `travelToolDeclarations`.
3. **Heuristic hotel classification:** Star ratings and kitchen/breakfast amenities are inferred from hotel brand names, not from per-property data, so `requireKitchenOrBreakfast` and star filters are approximate.
4. **Unused Dependencies:** `cheerio` (`^1.0.0`) and `zod` (`^3.24.2`) are listed in `package.json`, though all current HTML extraction and MCP input schemas use native RegExp and raw JSON Schema objects respectively.
