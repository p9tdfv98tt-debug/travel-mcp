import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EdgeTTS } from 'node-edge-tts';
import { GoogleGenAI } from '@google/genai';
import { DEFAULTS } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMP_AUDIO_PATH = '/tmp/travel_speech.mp3';
const TEMP_USER_REC_PATH = '/tmp/travel_user_voice.m4a';
const RECORDER_BIN = path.resolve(__dirname, '../../bin/macos-rec');
const RECORDER_SWIFT = path.resolve(__dirname, 'record.swift');

/**
 * Strips markdown symbols, asterisks, tables, and URLs for clean, natural speech.
 */
function cleanTextForSpeech(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/[*_#`~|]/g, '')
    .replace(/\|.*\|/g, '')
    .replace(/-{3,}/g, '')
    .replace(/✈️|🏨|📊|🌍|🔗|⚡|✔|🎯|💡|📋|🧳|🎙️|🗣️|🔊/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generates a short, natural verbal summary (2-3 sentences) suitable for spoken audio.
 */
export async function generateVerbalSummary(ai: GoogleGenAI, fullMarkdown: string): Promise<string> {
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `You are a friendly AI travel agent speaking out loud to the user over terminal audio.
Summarize the key flight, hotel, and total package cost in 2 to 3 natural, enthusiastic spoken sentences, using the currency in the details.
Do not use markdown, emojis, bullet points, or URLs.
Keep it punchy, clear, and easy to understand when spoken aloud.

Travel Details:
${fullMarkdown}`
            }
          ]
        }
      ]
    });

    const summary = res.text?.trim();
    return summary && summary.length > 10 ? cleanTextForSpeech(summary) : cleanTextForSpeech(fullMarkdown.slice(0, 300));
  } catch {
    return cleanTextForSpeech(fullMarkdown.slice(0, 300));
  }
}

/**
 * Speaks text out loud through macOS speakers using Neural EdgeTTS or macOS say.
 */
export async function speak(text: string, voice: string = DEFAULTS.voice): Promise<void> {
  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return;

  try {
    const tts = new EdgeTTS({
      voice,
      lang: voice.split('-').slice(0, 2).join('-'),
      rate: '+5%'
    });

    await tts.ttsPromise(cleaned, TEMP_AUDIO_PATH);

    // Play using native macOS afplay
    await new Promise<void>((resolve, reject) => {
      const child = spawn('/usr/bin/afplay', [TEMP_AUDIO_PATH]);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`afplay exited with code ${code}`));
      });
      child.on('error', reject);
    });
  } catch {
    // Fallback to macOS native say command
    await new Promise<void>((resolve) => {
      const child = spawn('/usr/bin/say', ['-v', 'Daniel', cleaned]);
      child.on('close', () => resolve());
      child.on('error', () => {
        const fallback = spawn('/usr/bin/say', [cleaned]);
        fallback.on('close', () => resolve());
        fallback.on('error', () => resolve());
      });
    });
  }
}

export interface VoiceRecordingSession {
  stopAndTranscribe: (ai: GoogleGenAI) => Promise<string>;
  cancel: () => void;
}

/**
 * Starts recording from the microphone in the background.
 * Returns an object with stopAndTranscribe() to finish recording and return text.
 */
export function startVoiceRecording(onReady?: () => void): VoiceRecordingSession {
  // Use compiled binary if present, else run with swift interpreter
  const useBinary = fs.existsSync(RECORDER_BIN);
  const recorderCmd = useBinary ? RECORDER_BIN : '/usr/bin/swift';
  const recorderArgs = useBinary ? [TEMP_USER_REC_PATH] : [RECORDER_SWIFT, TEMP_USER_REC_PATH];

  const recorderProcess: ChildProcess = spawn(recorderCmd, recorderArgs, {
    stdio: ['pipe', 'pipe', 'inherit']
  });

  let hasStarted = false;

  recorderProcess.stdout?.on('data', (data) => {
    const str = data.toString();
    if (str.includes('RECORDING_STARTED') && !hasStarted) {
      hasStarted = true;
      if (onReady) onReady();
    }
  });

  let finishedPromise = new Promise<void>((resolve, reject) => {
    recorderProcess.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Recorder process exited with code ${code}`));
    });
    recorderProcess.on('error', reject);
  });

  return {
    stopAndTranscribe: async (ai: GoogleGenAI): Promise<string> => {
      // Send newline to stop recorder
      try {
        recorderProcess.stdin?.write('\n');
      } catch {
        // Ignore
      }

      await finishedPromise;

      if (!fs.existsSync(TEMP_USER_REC_PATH)) {
        return '';
      }

      const audioBytes = fs.readFileSync(TEMP_USER_REC_PATH);
      if (audioBytes.length < 2000) {
        return '';
      }

      // Transcribe with Gemini
      const res = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: audioBytes.toString('base64'),
                  mimeType: 'audio/m4a'
                }
              },
              {
                text: 'Transcribe the spoken words in this audio precisely. Return ONLY the transcribed text. Do not add quotes, markdown, explanations, or commentary. If the audio is silent or unintelligible noise, reply with an empty string.'
              }
            ]
          }
        ]
      });

      return res.text?.trim() || '';
    },
    cancel: () => {
      try {
        recorderProcess.kill();
      } catch {
        // Ignore
      }
    }
  };
}
