#!/usr/bin/env node
import readline from 'readline';
import { TravelAgent } from './travelAgent.js';
import { speak, generateVerbalSummary, startVoiceRecording } from './voice.js';
import { DEFAULTS, formatMoney } from '../config.js';

const BANNER = `
========================================================================
✈️   TRAVEL AI AGENT — Real-Time Voice & Terminal Assistant
========================================================================
• Voice Output: Active (Microsoft Edge Neural Voice - ${DEFAULTS.voice})
• Microphone Input: Active (macOS AVFoundation Audio + Gemini Transcribe)
• Defaults: from ${DEFAULTS.origin ?? '(ask)'} | ${DEFAULTS.adults} adult${DEFAULTS.adults === 1 ? '' : 's'} | ${DEFAULTS.currency}${DEFAULTS.directOnly ? ' | direct only' : ''}
• Booking: Pre-populated 1-Click Deep Links (Skyscanner, Booking, Expedia, ITA)
========================================================================
`;

function formatToolCall(toolName: string, args: any): string {
  switch (toolName) {
    case 'search_flights':
      return `✈️  Searching flights ${args.origin ?? DEFAULTS.origin ?? ''} ➔ ${args.destination} (${args.departureDate} to ${args.returnDate})...`;
    case 'search_hotels':
      return `🏨 Searching hotels in ${args.destination} (${args.checkinDate} to ${args.checkoutDate})...`;
    case 'compare_trip_deal':
      return `📊 Calculating package deal (flights + top hotels) for ${args.destination} (${args.departureDate} to ${args.returnDate})...`;
    case 'find_cheapest_destinations':
      return `🌍 Scanning cheapest destinations from ${args.origin ?? DEFAULTS.origin ?? 'your origin'} (${args.departureDate} to ${args.returnDate})...`;
    case 'generate_booking_links':
      return `🔗 Generating 1-click booking links for ${args.destination}...`;
    case 'ita_matrix_power_search':
      return `⚡ Generating ITA Matrix routing codes for ${args.destination}...`;
    default:
      return `⚙️  Executing ${toolName}...`;
  }
}

async function runOneShot(prompt: string, enableVoice: boolean = false) {
  console.log(BANNER);
  console.log(`🎯 Goal: "${prompt}"\n`);

  const agent = new TravelAgent({
    callbacks: {
      onToolCall: (name, args) => {
        console.log(`\x1b[36m${formatToolCall(name, args)}\x1b[0m`);
      },
      onToolResult: (name, result) => {
        if (Array.isArray(result)) {
          console.log(`\x1b[32m✔ Found ${result.length} options from ${name}\x1b[0m`);
        } else if (result && result.cheapestFlight) {
          console.log(`\x1b[32m✔ Package generated: Cheapest flight ${formatMoney(result.cheapestFlight.totalPrice, result.currency)} total\x1b[0m`);
        } else {
          console.log(`\x1b[32m✔ Received data from ${name}\x1b[0m`);
        }
      }
    }
  });

  const startTime = Date.now();
  try {
    const answer = await agent.chat(prompt);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n========================================================================`);
    console.log(`📋 AGENT RECOMMENDATION (${duration}s)`);
    console.log(`========================================================================\n`);
    console.log(answer);
    console.log(`\n========================================================================\n`);

    if (enableVoice) {
      console.log('\x1b[35m🔊 Speaking recommendation aloud...\x1b[0m');
      const verbal = await generateVerbalSummary(agent.getAI(), answer);
      await speak(verbal);
    }
  } catch (err: any) {
    console.error(`\x1b[31mAgent Error: ${err?.message || err}\x1b[0m`);
    process.exit(1);
  }
}

async function runInteractive() {
  console.log(BANNER);
  console.log('🎙️  CONTINUOUS VOICE CALL ACTIVE:');
  console.log('   • Speak into your microphone and press [ENTER] when done speaking.');
  console.log('   • The agent will reply and speak back aloud through your speakers.');
  console.log('   • You can also type text and press [ENTER] at any time.');
  console.log('   • Type /voice to toggle voice on/off, or /exit to quit.\n');

  let voiceEnabled = true;
  let isProcessing = false;
  let activeRecordingSession: any = null;

  const agent = new TravelAgent({
    callbacks: {
      onToolCall: (name, args) => {
        console.log(`\x1b[36m${formatToolCall(name, args)}\x1b[0m`);
      },
      onToolResult: (name, result) => {
        if (Array.isArray(result)) {
          console.log(`\x1b[32m✔ Found ${result.length} options from ${name}\x1b[0m`);
        } else if (result && result.cheapestFlight) {
          console.log(`\x1b[32m✔ Package calculated: Flights from ${formatMoney(result.cheapestFlight.totalPrice, result.currency)} total\x1b[0m`);
        } else {
          console.log(`\x1b[32m✔ Received data from ${name}\x1b[0m`);
        }
      }
    }
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[33mTravelAgent (speak or type)>\x1b[0m '
  });

  function startLiveListening() {
    if (isProcessing) return;
    try {
      if (activeRecordingSession) {
        activeRecordingSession.cancel();
      }
      activeRecordingSession = startVoiceRecording();
    } catch (e: any) {
      console.error('Microphone setup warning:', e.message);
    }
    rl.prompt();
  }

  // Initial greeting
  const greeting = "Hello César! I am your AI travel agent. Where are you thinking of going, or what dates do you have in mind?";
  console.log(`\x1b[35m🔊 Agent:\x1b[0m "${greeting}"\n`);
  if (voiceEnabled) {
    speak(greeting).catch(() => {}).finally(() => {
      startLiveListening();
    });
  } else {
    startLiveListening();
  }

  async function processQuery(query: string) {
    isProcessing = true;
    console.log(`\n\x1b[34m[Processing]: "${query}"\x1b[0m\n`);

    try {
      const answer = await agent.chat(query);
      console.log(`\n${answer}\n`);

      if (voiceEnabled) {
        console.log('\x1b[35m🔊 Speaking response aloud through speakers...\x1b[0m');
        const verbal = await generateVerbalSummary(agent.getAI(), answer);
        console.log(`\x1b[35m[Spoken]:\x1b[0m "${verbal}"\n`);
        await speak(verbal);
      }
    } catch (err: any) {
      console.error(`\x1b[31mError: ${err?.message || err}\x1b[0m`);
    } finally {
      isProcessing = false;
      console.log('\x1b[32m🎙️  [LISTENING FOR YOUR REPLY] Speak into your mic, then press [ENTER] (or type):\x1b[0m');
      startLiveListening();
    }
  }

  rl.on('line', async (line) => {
    if (isProcessing) return;

    const trimmed = line.trim();

    // Command shortcuts
    if (trimmed.toLowerCase() === '/exit' || trimmed.toLowerCase() === 'exit') {
      if (activeRecordingSession) activeRecordingSession.cancel();
      console.log('Safe travels! 👋');
      if (voiceEnabled) await speak('Safe travels, goodbye!');
      process.exit(0);
    }

    if (trimmed.toLowerCase() === '/voice') {
      voiceEnabled = !voiceEnabled;
      console.log(`\x1b[35mVoice speech output is now ${voiceEnabled ? 'ENABLED (ON) 🔊' : 'DISABLED (OFF) 🔇'}\x1b[0m\n`);
      startLiveListening();
      return;
    }

    if (trimmed.toLowerCase() === '/reset') {
      agent.reset();
      console.log('\x1b[35mConversation reset. Starting fresh session.\x1b[0m\n');
      startLiveListening();
      return;
    }

    if (trimmed.toLowerCase() === '/help') {
      console.log(`
Available Commands & Shortcuts:
  [ENTER] on empty line  - Sends recorded microphone audio
  <typed message>        - Sends typed query
  /voice                 - Toggle agent spoken voice output ON/OFF
  /reset                 - Reset conversation history
  /deals <dep> <ret>     - Quick destination deal scan (e.g. /deals 2026-12-04 2026-12-07)
  /exit                  - Exit the Travel Agent
`);
      startLiveListening();
      return;
    }

    if (trimmed.startsWith('/deals')) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 3) {
        if (activeRecordingSession) activeRecordingSession.cancel();
        await processQuery(`Scan the cheapest destinations for return flights between ${parts[1]} and ${parts[2]}.`);
        return;
      }
    }

    // Check if user spoke (empty line) or typed text
    if (!trimmed) {
      // User hit Enter to finish speaking into microphone
      if (activeRecordingSession) {
        console.log('\x1b[36m⏳ Transcribing your speech with Gemini...\x1b[0m');
        try {
          const spokenText = await activeRecordingSession.stopAndTranscribe(agent.getAI());
          activeRecordingSession = null;

          if (!spokenText || spokenText.trim().length === 0) {
            console.log('\x1b[33m⚠️  No clear speech captured. Please speak closer to your microphone and press [ENTER], or type your query.\x1b[0m\n');
            startLiveListening();
            return;
          }

          console.log(`\x1b[32m🗣️  You (Voice): "${spokenText}"\x1b[0m`);
          await processQuery(spokenText);
          return;
        } catch (err: any) {
          console.error(`\x1b[31mTranscription error: ${err?.message || err}\x1b[0m`);
          startLiveListening();
          return;
        }
      } else {
        startLiveListening();
        return;
      }
    }

    // User typed text
    if (activeRecordingSession) {
      activeRecordingSession.cancel();
      activeRecordingSession = null;
    }
    await processQuery(trimmed);
  });

  rl.on('close', () => {
    if (activeRecordingSession) activeRecordingSession.cancel();
    console.log('\nGoodbye! ✈️');
    process.exit(0);
  });
}

// Main execution
const rawArgs = process.argv.slice(2);
const enableVoiceFlag = rawArgs.includes('--voice');
const filteredArgs = rawArgs.filter((a) => a !== '--voice').join(' ').trim();

if (filteredArgs.length > 0) {
  runOneShot(filteredArgs, enableVoiceFlag);
} else {
  runInteractive();
}
