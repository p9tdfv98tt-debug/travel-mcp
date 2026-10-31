import { FunctionDeclaration, Type } from '@google/genai';
import { searchFlights } from '../services/flightSearch.js';
import { searchHotels } from '../services/hotelSearch.js';
import { compareTripDeal, findCheapestDestinations } from '../services/dealFinder.js';
import { buildAllBookingLinks } from '../services/urlBuilder.js';
import { generateITAMatrixCommand } from '../services/itaMatrix.js';
import { DEFAULTS, resolveOrigin } from '../config.js';

const p = {
  destination: { type: Type.STRING, description: 'Destination city or airport code (e.g., "Barcelona", "Tokyo", "BCN", "JFK")' },
  departureDate: { type: Type.STRING, description: 'Departure date in YYYY-MM-DD format' },
  returnDate: { type: Type.STRING, description: 'Return date in YYYY-MM-DD format' },
  origin: {
    type: Type.STRING,
    description: DEFAULTS.origin
      ? `Departure city or airport code (Default: "${DEFAULTS.origin}")`
      : 'Departure city or airport code (required; ask the user if unknown)'
  },
  passengers: { type: Type.NUMBER, description: `Number of adult travellers (Default: ${DEFAULTS.adults})` },
  directOnly: { type: Type.BOOLEAN, description: `Non-stop flights only (Default: ${DEFAULTS.directOnly})` },
  checkedBags: {
    type: Type.BOOLEAN,
    description: `Add an estimated cost for 1 checked bag per passenger, both ways (Default: ${DEFAULTS.checkedBags})`
  },
  currency: { type: Type.STRING, description: `ISO currency code (Default: "${DEFAULTS.currency}")` },
  minStarRating: { type: Type.NUMBER, description: `Minimum hotel star rating (Default: ${DEFAULTS.minStars ?? 'no limit'})` },
  maxStarRating: { type: Type.NUMBER, description: `Maximum hotel star rating (Default: ${DEFAULTS.maxStars ?? 'no limit'})` },
  requireKitchenOrBreakfast: {
    type: Type.BOOLEAN,
    description: `Only hotels with a kitchen/kitchenette or breakfast (Default: ${DEFAULTS.requireKitchenOrBreakfast})`
  },
  preferredLocations: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Neighbourhoods or districts to search' }
};

export const travelToolDeclarations: FunctionDeclaration[] = [
  {
    name: 'search_flights',
    description:
      'Search real-time low-price return flights. Returns airline options, schedule, flight duration, total and per-person price, and booking links.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        destination: p.destination,
        departureDate: p.departureDate,
        returnDate: p.returnDate,
        origin: p.origin,
        passengers: p.passengers,
        directOnly: p.directOnly,
        checkedBags: p.checkedBags,
        currency: p.currency
      },
      required: ['destination', 'departureDate', 'returnDate']
    }
  },
  {
    name: 'search_hotels',
    description:
      'Search real-time hotel options with optional star, amenity and neighbourhood filters. Returns property names, star ratings, amenities, review scores, nightly and total stay prices, and booking links.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        destination: p.destination,
        checkinDate: { type: Type.STRING, description: 'Check-in date in YYYY-MM-DD format' },
        checkoutDate: { type: Type.STRING, description: 'Check-out date in YYYY-MM-DD format' },
        adults: { type: Type.NUMBER, description: `Number of adult guests (Default: ${DEFAULTS.adults})` },
        rooms: { type: Type.NUMBER, description: 'Number of rooms (Default: 1)' },
        currency: p.currency,
        minStarRating: p.minStarRating,
        maxStarRating: p.maxStarRating,
        requireKitchenOrBreakfast: p.requireKitchenOrBreakfast,
        preferredLocations: p.preferredLocations
      },
      required: ['destination', 'checkinDate', 'checkoutDate']
    }
  },
  {
    name: 'compare_trip_deal',
    description:
      'Combine the cheapest matching return flight with the best-priced hotels into a package estimate with per-person breakdown and booking links.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        destination: p.destination,
        departureDate: p.departureDate,
        returnDate: p.returnDate,
        origin: p.origin,
        passengers: p.passengers,
        directOnly: p.directOnly,
        checkedBags: p.checkedBags,
        currency: p.currency,
        preferredLocations: p.preferredLocations,
        minStarRating: p.minStarRating,
        maxStarRating: p.maxStarRating,
        requireKitchenOrBreakfast: p.requireKitchenOrBreakfast
      },
      required: ['destination', 'departureDate', 'returnDate']
    }
  },
  {
    name: 'find_cheapest_destinations',
    description: `Scan destinations for return flights on given dates and rank them by lowest total price. Without a list, scans: ${DEFAULTS.dealDestinations.join(', ')}.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        departureDate: p.departureDate,
        returnDate: p.returnDate,
        destinations: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Destination cities to scan' },
        origin: p.origin,
        passengers: p.passengers,
        directOnly: p.directOnly,
        checkedBags: p.checkedBags,
        currency: p.currency
      },
      required: ['departureDate', 'returnDate']
    }
  },
  {
    name: 'generate_booking_links',
    description:
      'Generate pre-populated booking links across Skyscanner, Booking.com, Hotels.com, Expedia, Google, and ITA Matrix.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        destination: p.destination,
        departureDate: p.departureDate,
        returnDate: p.returnDate,
        origin: p.origin,
        passengers: p.passengers,
        directOnly: p.directOnly,
        currency: p.currency
      },
      required: ['destination', 'departureDate', 'returnDate']
    }
  },
  {
    name: 'ita_matrix_power_search',
    description:
      'Generate ITA Software Matrix advanced routing syntax (non-stop codes, carrier filtering) and direct BookWithMatrix conversion link.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        origin: p.origin,
        destination: p.destination,
        departureDate: p.departureDate,
        returnDate: p.returnDate,
        passengers: p.passengers,
        directOnly: p.directOnly,
        currency: p.currency
      },
      required: ['destination', 'departureDate', 'returnDate']
    }
  }
];

function ensureFutureDate(dateStr: string): string {
  if (!dateStr) return dateStr;
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const currentYear = today.getFullYear();

  const parts = dateStr.trim().split('-');
  if (parts.length === 3) {
    let year = parseInt(parts[0], 10);
    if (isNaN(year) || year < currentYear) {
      year = currentYear;
    }
    let candidate = `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    if (candidate < todayStr) {
      candidate = `${year + 1}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    return candidate;
  }
  return dateStr;
}

export async function executeTravelTool(toolName: string, args: any): Promise<any> {
  const depDate = args.departureDate ? ensureFutureDate(args.departureDate) : undefined;
  const retDate = args.returnDate ? ensureFutureDate(args.returnDate) : undefined;
  const checkin = args.checkinDate ? ensureFutureDate(args.checkinDate) : undefined;
  const checkout = args.checkoutDate ? ensureFutureDate(args.checkoutDate) : undefined;
  const passengers = args.passengers ?? DEFAULTS.adults;
  const currency = args.currency || DEFAULTS.currency;
  const directOnly = args.directOnly ?? DEFAULTS.directOnly;
  const checkedBags = args.checkedBags ?? DEFAULTS.checkedBags;

  switch (toolName) {
    case 'search_flights':
      return await searchFlights({
        destination: args.destination,
        departureDate: depDate!,
        returnDate: retDate!,
        origin: resolveOrigin(args.origin),
        passengers,
        directOnly,
        checkedBags,
        currency
      });

    case 'search_hotels':
      return await searchHotels({
        destination: args.destination,
        checkinDate: checkin!,
        checkoutDate: checkout!,
        adults: args.adults ?? DEFAULTS.adults,
        rooms: args.rooms ?? 1,
        currency,
        minStarRating: args.minStarRating,
        maxStarRating: args.maxStarRating,
        requireKitchenOrBreakfast: args.requireKitchenOrBreakfast,
        preferredLocations: args.preferredLocations
      });

    case 'compare_trip_deal':
      return await compareTripDeal(
        args.destination,
        depDate!,
        retDate!,
        args.origin,
        passengers,
        currency,
        args.preferredLocations,
        args.minStarRating ?? DEFAULTS.minStars,
        args.maxStarRating ?? DEFAULTS.maxStars,
        args.requireKitchenOrBreakfast ?? DEFAULTS.requireKitchenOrBreakfast,
        checkedBags,
        directOnly
      );

    case 'find_cheapest_destinations':
      return await findCheapestDestinations(
        depDate!,
        retDate!,
        args.destinations,
        args.origin,
        passengers,
        currency,
        checkedBags,
        directOnly
      );

    case 'generate_booking_links':
      return buildAllBookingLinks(
        args.destination,
        depDate!,
        retDate!,
        resolveOrigin(args.origin),
        passengers,
        currency,
        directOnly
      );

    case 'ita_matrix_power_search':
      return generateITAMatrixCommand(
        args.destination,
        depDate!,
        retDate!,
        resolveOrigin(args.origin),
        passengers,
        currency,
        undefined,
        'economy',
        undefined,
        directOnly
      );

    default:
      throw new Error(`Unknown travel tool: ${toolName}`);
  }
}
