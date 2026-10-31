import { BaggageInfo, FlightOption } from '../types.js';

/**
 * Checked-baggage pricing.
 *
 * With `checkedBags: true` (or TRAVEL_CHECKED_BAGS=true), every fare includes an
 * estimate for 1 x 23kg checked bag PER PASSENGER (return).
 *
 * Google Flights' server-rendered results show the cheapest (usually "basic" /
 * hand-luggage-only) fare and expose no reliable baggage data, so we add a
 * per-airline estimate of what it costs to get a checked bag – either the
 * bag fee, or the upgrade to the cheapest fare family that includes one.
 * Figures are GBP, per passenger, for the full RETURN trip, and are converted to
 * the search currency with the approximate rates below.
 */
interface AirlineBagRule {
  match: RegExp;
  shortHaul: number;            // per passenger, return, GBP
  longHaul: number;             // per passenger, return, GBP
  fareToBook: string;           // fare family / add-on to choose at checkout
}

const AIRLINE_BAG_RULES: AirlineBagRule[] = [
  { match: /virgin/i, shortHaul: 70, longHaul: 120, fareToBook: 'Economy Classic (1 x 23kg included)' },
  { match: /delta/i, shortHaul: 70, longHaul: 120, fareToBook: 'Main Cabin (1 x 23kg included on transatlantic)' },
  { match: /british airways/i, shortHaul: 50, longHaul: 120, fareToBook: 'Economy Standard / Euro Traveller with bag (1 x 23kg)' },
  { match: /american/i, shortHaul: 70, longHaul: 120, fareToBook: 'Main Cabin (1 x 23kg included on transatlantic)' },
  { match: /united/i, shortHaul: 70, longHaul: 120, fareToBook: 'Standard Economy (1 x 23kg included on transatlantic)' },
  { match: /jetblue/i, shortHaul: 100, longHaul: 110, fareToBook: 'Blue Plus (1 checked bag included)' },
  { match: /aer lingus/i, shortHaul: 60, longHaul: 110, fareToBook: 'Smart / Plus fare (1 x 23kg)' },
  { match: /norse/i, shortHaul: 90, longHaul: 90, fareToBook: 'Economy Classic (1 x 23kg)' },
  { match: /easyjet/i, shortHaul: 90, longHaul: 90, fareToBook: 'Add 23kg hold bag per person, both directions' },
  { match: /ryanair/i, shortHaul: 85, longHaul: 85, fareToBook: 'Add 20kg check-in bag per person, both directions' },
  { match: /wizz/i, shortHaul: 85, longHaul: 85, fareToBook: 'Add 20kg/32kg checked bag per person, both directions' },
  { match: /jet2/i, shortHaul: 70, longHaul: 70, fareToBook: 'Add 22kg hold bag per person, both directions' },
  { match: /vueling/i, shortHaul: 60, longHaul: 60, fareToBook: 'Optima fare or add 23kg bag' },
  { match: /\btap\b|tap air/i, shortHaul: 60, longHaul: 120, fareToBook: 'Classic fare (1 x 23kg)' },
  { match: /iberia/i, shortHaul: 60, longHaul: 120, fareToBook: 'Standard / Comfort fare (1 x 23kg)' },
  { match: /lufthansa|swiss|austrian|brussels/i, shortHaul: 60, longHaul: 120, fareToBook: 'Classic fare (1 x 23kg)' },
  { match: /klm|air france/i, shortHaul: 60, longHaul: 120, fareToBook: 'Standard fare (1 x 23kg)' },
  { match: /ita airways/i, shortHaul: 60, longHaul: 120, fareToBook: 'Classic fare (1 x 23kg)' }
];

// Approximate units of each currency per 1 GBP. Bag costs are rough estimates
// anyway; for currencies not listed no bag cost is added to the fare.
const GBP_RATES: Record<string, number> = {
  GBP: 1,
  USD: 1.3,
  EUR: 1.17,
  CAD: 1.8,
  AUD: 2,
  CHF: 1.1,
  JPY: 195,
  BRL: 7.2,
  SEK: 13.8,
  NOK: 14,
  DKK: 8.7
};

function fromGbp(amountGbp: number, currency: string): number | undefined {
  const rate = GBP_RATES[currency.toUpperCase()];
  return rate ? Math.round(amountGbp * rate) : undefined;
}

const DEFAULT_SHORT_HAUL = 75;
const DEFAULT_LONG_HAUL = 120;
const LONG_HAUL_MIN_HOURS = 6;

/** Parse "8 hrs 5 mins" / "2 hrs" / "45 mins" into hours. */
export function parseDurationHours(duration: string): number {
  const h = duration.match(/(\d+)\s*hr/i);
  const m = duration.match(/(\d+)\s*min/i);
  return (h ? parseInt(h[1], 10) : 0) + (m ? parseInt(m[1], 10) / 60 : 0);
}

export function estimateCheckedBagCost(
  airline: string,
  duration: string,
  passengers: number,
  currency: string = 'GBP'
): BaggageInfo {
  const longHaul = parseDurationHours(duration) >= LONG_HAUL_MIN_HOURS;
  const rule = AIRLINE_BAG_RULES.find((r) => r.match.test(airline));
  const perPersonGbp = rule
    ? longHaul ? rule.longHaul : rule.shortHaul
    : longHaul ? DEFAULT_LONG_HAUL : DEFAULT_SHORT_HAUL;
  const converted = fromGbp(perPersonGbp, currency);
  const perPerson = converted ?? 0;
  const currencyNote = converted === undefined ? ` No bag estimate available in ${currency}; add the fee at checkout.` : '';

  return {
    checkedBagsIncluded: true,
    allowance: `${passengers} x checked bag (1 per person, ~23kg), outbound + return`,
    fareToBook: rule ? rule.fareToBook : 'Choose the cheapest fare that includes 1 checked bag per person',
    estimatedBagCostTotal: perPerson * passengers,
    estimatedBagCostPerPerson: perPerson,
    isEstimate: true,
    note: rule
      ? `Base fare is likely hand-luggage only. Bag cost is an estimate for ${airline} (${longHaul ? 'long-haul' : 'short-haul'}); confirm at checkout.${currencyNote}`
      : `Airline not in baggage table – generic ${longHaul ? 'long-haul' : 'short-haul'} estimate used; confirm at checkout.${currencyNote}`
  };
}

/**
 * Apply the checked-bag policy to a list of flights.
 * - checkedBags=true: totalPrice becomes base fare + estimated bags, re-sorted.
 * - checkedBags=false: base fare kept, flagged as hand luggage only.
 */
export function applyBaggagePolicy(
  flights: FlightOption[],
  passengers: number,
  checkedBags: boolean,
  currency: string = 'GBP'
): FlightOption[] {
  const updated = flights.map((f) => {
    const baseFareTotal = f.baseFareTotal ?? f.totalPrice;
    if (f.cabinClass === 'business' || f.cabinClass === 'first') {
      return {
        ...f,
        baseFareTotal,
        totalPrice: baseFareTotal,
        pricePerPerson: Math.round(baseFareTotal / passengers),
        baggage: {
          checkedBagsIncluded: true,
          allowance: `${passengers * 2} x checked bags (${passengers} x 2 bags, ~32kg each) INCLUDED with ${f.cabinClass === 'business' ? 'Business' : 'First'} Class`,
          fareToBook: `${f.cabinClass === 'business' ? 'Business' : 'First'} Class (Full baggage allowance included)`,
          estimatedBagCostTotal: 0,
          estimatedBagCostPerPerson: 0,
          isEstimate: false,
          note: `Checked baggage is included in all standard ${f.cabinClass === 'business' ? 'Business' : 'First'} Class fares.`
        }
      };
    }
    if (!checkedBags) {
      return {
        ...f,
        baseFareTotal,
        totalPrice: baseFareTotal,
        pricePerPerson: Math.round(baseFareTotal / passengers),
        baggage: {
          checkedBagsIncluded: false,
          allowance: 'Checked luggage ignored for this search (fare shown is likely hand luggage only)',
          fareToBook: 'Cheapest available fare',
          estimatedBagCostTotal: 0,
          estimatedBagCostPerPerson: 0,
          isEstimate: false,
          note: 'Checked luggage not included in this search.'
        }
      };
    }
    const baggage = estimateCheckedBagCost(f.airline, f.duration, passengers, currency);
    const total = baseFareTotal + baggage.estimatedBagCostTotal;
    return {
      ...f,
      baseFareTotal,
      totalPrice: total,
      pricePerPerson: Math.round(total / passengers),
      baggage
    };
  });

  updated.sort((a, b) => a.totalPrice - b.totalPrice);
  return updated;
}
