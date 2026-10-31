/**
 * Search defaults.
 *
 * Every default can be overridden per call by the tool arguments, and per user
 * with environment variables (for example in a local .env file):
 *
 *   TRAVEL_ORIGIN=LON                     home airport or city code, used when a call gives no origin
 *   TRAVEL_CURRENCY=GBP                   ISO currency code for prices
 *   TRAVEL_ADULTS=2                       travellers per search
 *   TRAVEL_DIRECT_ONLY=true               non-stop flights only
 *   TRAVEL_CHECKED_BAGS=true              add an estimated checked-bag cost to fares
 *   TRAVEL_MIN_STARS=3                    hotel star filter
 *   TRAVEL_MAX_STARS=4
 *   TRAVEL_REQUIRE_KITCHEN_OR_BREAKFAST=true
 *   TRAVEL_DEAL_DESTINATIONS=Rome,Paris   cities scanned by find_cheapest_destinations
 *   TRAVEL_VOICE=en-GB-RyanNeural         Edge TTS voice for the voice agent
 */
import dotenv from 'dotenv';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });
dotenv.config({ path: path.join(os.homedir(), '.gemini/antigravity/scratch/.env'), quiet: true });

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1' || v === 'yes';
}

function envNumber(name: string): number | undefined {
  const v = process.env[name]?.trim();
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function envList(name: string): string[] | undefined {
  const v = process.env[name]?.trim();
  if (!v) return undefined;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

export const DEFAULTS = {
  origin: process.env.TRAVEL_ORIGIN?.trim() || undefined,
  currency: (process.env.TRAVEL_CURRENCY?.trim() || 'USD').toUpperCase(),
  adults: envNumber('TRAVEL_ADULTS') ?? 1,
  directOnly: envBool('TRAVEL_DIRECT_ONLY', false),
  checkedBags: envBool('TRAVEL_CHECKED_BAGS', false),
  minStars: envNumber('TRAVEL_MIN_STARS'),
  maxStars: envNumber('TRAVEL_MAX_STARS'),
  requireKitchenOrBreakfast: envBool('TRAVEL_REQUIRE_KITCHEN_OR_BREAKFAST', false),
  dealDestinations: envList('TRAVEL_DEAL_DESTINATIONS') ?? [
    'Barcelona',
    'Rome',
    'Paris',
    'Amsterdam',
    'Lisbon',
    'Madrid',
    'Dublin',
    'Prague',
    'Berlin',
    'New York',
    'Miami',
    'Cancun'
  ],
  voice: process.env.TRAVEL_VOICE?.trim() || 'en-US-AriaNeural'
};

/** Metropolitan airport codes that Google search understands better as a city name. */
const METRO_CODES: Record<string, string> = {
  LON: 'London',
  NYC: 'New York',
  PAR: 'Paris',
  MIL: 'Milan',
  ROM: 'Rome',
  CHI: 'Chicago',
  WAS: 'Washington',
  TYO: 'Tokyo',
  OSA: 'Osaka',
  SEL: 'Seoul',
  STO: 'Stockholm',
  MOW: 'Moscow',
  BUE: 'Buenos Aires',
  SAO: 'Sao Paulo',
  RIO: 'Rio de Janeiro'
};

export function originForQuery(origin: string): string {
  return METRO_CODES[origin.trim().toUpperCase()] ?? origin;
}

/** The origin for a search: the caller's, else TRAVEL_ORIGIN, else an error. */
export function resolveOrigin(origin?: string): string {
  const o = origin?.trim() || DEFAULTS.origin;
  if (!o) {
    throw new Error('No origin given. Pass "origin" (e.g. "LHR", "NYC", "Lisbon") or set TRAVEL_ORIGIN.');
  }
  return o;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  GBP: '£',
  EUR: '€',
  JPY: '¥',
  CAD: 'CA$',
  AUD: 'A$',
  CHF: 'CHF ',
  BRL: 'R$'
};

export function formatMoney(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()];
  return symbol ? `${symbol}${amount}` : `${amount} ${currency.toUpperCase()}`;
}
