import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTravelAgentSystemPrompt } from './prompts.js';
import { travelToolDeclarations, executeTravelTool } from './tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from current directory or parent directory
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.join(os.homedir(), '.gemini/antigravity/scratch/.env') });

export interface AgentCallbacks {
  onToolCall?: (toolName: string, args: any) => void;
  onToolResult?: (toolName: string, result: any) => void;
  onThought?: (thought: string) => void;
}

export interface TravelAgentOptions {
  apiKey?: string;
  model?: string;
  callbacks?: AgentCallbacks;
}

const BACKUP_MODELS = ['gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

export class TravelAgent {
  private ai: GoogleGenAI;
  private modelName: string;
  private chatSession: any;
  private callbacks: AgentCallbacks;

  constructor(options: TravelAgentOptions = {}) {
    const apiKey =
      options.apiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY or GOOGLE_API_KEY environment variable is required to run the Travel Agent.'
      );
    }

    this.ai = new GoogleGenAI({ apiKey });
    this.modelName = options.model || process.env.TRAVEL_AGENT_MODEL || 'gemini-3.6-flash';
    this.callbacks = options.callbacks || {};

    this.initChatSession();
  }

  private initChatSession(history?: any[]) {
    this.chatSession = this.ai.chats.create({
      model: this.modelName,
      history: history || [],
      config: {
        systemInstruction: getTravelAgentSystemPrompt(),
        temperature: 0.2,
        tools: [
          {
            functionDeclarations: travelToolDeclarations
          }
        ]
      }
    });
  }

  public getAI(): GoogleGenAI {
    return this.ai;
  }

  public reset() {
    this.initChatSession();
  }

  public setCallbacks(callbacks: AgentCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Wrapper around chat.sendMessage that gracefully handles 429 quota exhaustion and 503 spikes
   * with automatic backoff and seamless multi-model fallback.
   */
  private async sendWithRetry(params: any, retriesLeft = 3): Promise<any> {
    try {
      return await this.chatSession.sendMessage(params);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isRateLimit =
        errMsg.includes('429') ||
        errMsg.includes('RESOURCE_EXHAUSTED') ||
        errMsg.includes('Quota exceeded') ||
        err?.status === 429;
      const isTemporary =
        errMsg.includes('503') ||
        errMsg.includes('UNAVAILABLE') ||
        errMsg.includes('high demand') ||
        errMsg.includes('500') ||
        errMsg.includes('INTERNAL') ||
        err?.status === 503 ||
        err?.status === 500;

      if ((isRateLimit || isTemporary) && retriesLeft > 0) {
        // Try switching to a backup model if available
        const nextModel = BACKUP_MODELS.find((m) => m !== this.modelName) || 'gemini-3.1-flash-lite';
        console.log(
          `\n\x1b[33m🔄 Temporary provider constraint on ${this.modelName}. Switching to ${nextModel}...\x1b[0m`
        );

        let currentHistory: any[] = [];
        try {
          currentHistory = this.chatSession.getHistory ? this.chatSession.getHistory() : [];
        } catch {
          // Ignore
        }

        this.modelName = nextModel;
        this.initChatSession(currentHistory);

        let delaySec = isRateLimit ? 10 : 3;
        const delayMatch =
          errMsg.match(/retry in\s+([\d\.]+)\s*s/i) ||
          errMsg.match(/retryDelay["']?:\s*["']?(\d+)/i);
        if (delayMatch) {
          delaySec = Math.ceil(parseFloat(delayMatch[1])) + 1;
        }

        console.log(
          `\x1b[33m⏳ Pausing ${delaySec}s before resuming (${retriesLeft} retries remaining)...\x1b[0m`
        );
        await new Promise((r) => setTimeout(r, delaySec * 1000));
        return await this.sendWithRetry(params, retriesLeft - 1);
      }

      throw err;
    }
  }

  public async chat(userMessage: string): Promise<string> {
    let response = await this.sendWithRetry({
      message: userMessage
    });

    let loopCount = 0;
    const MAX_TOOL_LOOPS = 5;

    while (response.functionCalls && response.functionCalls.length > 0 && loopCount < MAX_TOOL_LOOPS) {
      loopCount++;
      const toolResults: Array<{ name: string; response: any; id?: string }> = [];

      for (const fnCall of response.functionCalls) {
        const toolName = fnCall.name;
        const toolArgs = fnCall.args || {};
        const callId = fnCall.id;

        if (this.callbacks.onToolCall) {
          this.callbacks.onToolCall(toolName, toolArgs);
        }

        let resultData: any;
        try {
          resultData = await executeTravelTool(toolName, toolArgs);
        } catch (err: any) {
          resultData = { error: err?.message || 'Tool execution failed' };
        }

        if (this.callbacks.onToolResult) {
          this.callbacks.onToolResult(toolName, resultData);
        }

        const formattedResponse = Array.isArray(resultData)
          ? { results: resultData }
          : typeof resultData === 'object' && resultData !== null
            ? resultData
            : { result: resultData };

        toolResults.push({
          name: toolName,
          response: formattedResponse,
          id: callId
        });
      }

      const functionResponses = toolResults.map((tr) => ({
        functionResponse: {
          name: tr.name,
          response: tr.response,
          id: tr.id
        }
      }));

      response = await this.sendWithRetry({
        message: functionResponses
      });
    }

    return response.text || 'I analyzed your travel request but could not generate a response. Please refine your query.';
  }
}
