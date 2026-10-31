import { FunctionDeclaration, Type } from '@google/genai';
import { searchFlights } from '../services/flightSearch.js';
import { searchHotels } from '../services/hotelSearch.js';
import { compareTripDeal, findCheapestDestinations } from '../services/dealFinder.js';
import { buildAllBookingLinks } from '../services/urlBuilder.js';
import { generateITAMatrixCommand } from '../services/itaMatrix.js';

export const travelToolDeclarations: FunctionDeclaration[] = [
  {
    name: 'search_flights',
    description:
      'Search real-time low-price direct return flights from London for 2 people in GBP (£). Returns airline options, schedule, flight duration, total price for 2 people, per-person price, and booking links.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        destination: {
          type: Type.STRING,
          description: 'Destination city or airport code (e.g., "Barcelona", "Rome", "Madeira", "FNC", "BCN")'
        },
        departureDate: {
          type: Type.STRING,
          description: 'Departure date in YYYY-MM-DD format'
        },
        returnDate: {
          type: Type.STRING,
          description: 'Return date in YYYY-MM-DD format'
        },
        origin: {
          type: Type.STRING,
          description: 'Departure city or airport code (Default: "LON" for London airports)'
        },
        passengers: {
          type: Type.NUMBER,
          description: 'Number of adult passengers (Default: 2)'
        },
        directOnly: {
          type: Type.BOOLEAN,
          description: 'Filter for direct non-stop flights only (Default: true)'
        },
        currency: {
          type: Type.STRING,
          description: 'Currency code (Default: "GBP")'
        }
      },
      required: ['destination', 'departureDate', 'returnDate']
    }
  },
  {
    name: 'search_hotels',
    description:
      'Search real-time hotel options in GBP (£) for 2 adults. Enforces 3 or 4 stars, kitchen/kitchenette or breakfast included. Returns property names, star ratings, amenities, review scores, nightly and total stay prices, and booking links.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        destination: {
          type: Type.STRING,
          description: 'Destination city or location (e.g., "New York", "Rome", "Barcelona", "Funchal")'
        },
        checkinDate: {
          type: Type.STRING,
          description: 'Check-in date in YYYY-MM-DD format'
        },
        checkoutDate: {
          type: Type.STRING,
          description: 'Check-out date in YYYY-MM-DD format'
        },
        adults: {
          type: Type.NUMBER,
          description: 'Number of adult guests (Default: 2)'
        },
        rooms: {
          type: Type.NUMBER,
          description: 'Number of rooms (Default: 1)'
        },
        currency: {
          type: Type.STRING,
          description: 'Currency code (Default: "GBP")'
        },
        minStarRating: {
          type: Type.NUMBER,
          description: 'Minimum star rating (Default: 3)'
        },
        maxStarRating: {
          type: Type.NUMBER,
          description: 'Maximum star rating (Default: 4)'
        },
        requireKitchenOrBreakfast: {
          type: Type.BOOLEAN,
          description: 'Require kitchen/kitchenette or breakfast included (Default: true)'
        },
        preferredLocations: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Preferred neighborhoods or districts'
        }
      },
      required: ['destination', 'checkinDate', 'checkoutDate']
    }
  },
  {
    name: 'compare_trip_deal',
    description:
      'Compare and aggregate direct non-stop return flights and top 3-4★ hotels into complete package deals for 2 people in GBP (£) with per-person breakdown and direct booking links.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        destination: {
          type: Type.STRING,
          description: 'Destination city or airport code (e.g., "New York", "Barcelona", "Madeira")'
        },
        departureDate: {
          type: Type.STRING,
          description: 'Departure date in YYYY-MM-DD format'
        },
        returnDate: {
          type: Type.STRING,
          description: 'Return date in YYYY-MM-DD format'
        },
        origin: {
          type: Type.STRING,
          description: 'Departure city or airport code (Default: "LON")'
        },
        passengers: {
          type: Type.NUMBER,
          description: 'Number of passengers (Default: 2)'
        },
        currency: {
          type: Type.STRING,
          description: 'Currency code (Default: "GBP")'
        },
        preferredLocations: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Preferred neighborhoods or districts'
        },
        minStarRating: {
          type: Type.NUMBER,
          description: 'Minimum star rating (Default: 3)'
        },
        maxStarRating: {
          type: Type.NUMBER,
          description: 'Maximum star rating (Default: 4)'
        },
        requireKitchenOrBreakfast: {
          type: Type.BOOLEAN,
          description: 'Require kitchen/kitchenette or breakfast included (Default: true)'
        }
      },
      required: ['destination', 'departureDate', 'returnDate']
    }
  },
  {
    name: 'find_cheapest_destinations',
    description:
      'Scan popular European destinations from London for direct return flights for 2 people on given dates and rank them by lowest total GBP price.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        departureDate: {
          type: Type.STRING,
          description: 'Departure date in YYYY-MM-DD format'
        },
        returnDate: {
          type: Type.STRING,
          description: 'Return date in YYYY-MM-DD format'
        },
        destinations: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Custom list of destination cities to scan'
        },
        origin: {
          type: Type.STRING,
          description: 'Departure city or airport code (Default: "LON")'
        },
        passengers: {
          type: Type.NUMBER,
          description: 'Number of adult passengers (Default: 2)'
        },
        currency: {
          type: Type.STRING,
          description: 'Currency code (Default: "GBP")'
        }
      },
      required: ['departureDate', 'returnDate']
    }
  },
  {
    name: 'generate_booking_links',
    description:
      'Generate pre-populated, verified 1-click booking links across Skyscanner, Booking.com, Hotels.com, Expedia, and ITA Matrix for 2 adults in GBP.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        destination: {
          type: Type.STRING,
          description: 'Destination city or airport code'
        },
        departureDate: {
          type: Type.STRING,
          description: 'Departure date in YYYY-MM-DD format'
        },
        returnDate: {
          type: Type.STRING,
          description: 'Return date in YYYY-MM-DD format'
        },
        origin: {
          type: Type.STRING,
          description: 'Departure city or airport code (Default: "LON")'
        },
        passengers: {
          type: Type.NUMBER,
          description: 'Number of passengers (Default: 2)'
        },
        currency: {
          type: Type.STRING,
          description: 'Currency code (Default: "GBP")'
        }
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
        origin: {
          type: Type.STRING,
          description: 'Origin airport code (Default: "LON")'
        },
        destination: {
          type: Type.STRING,
          description: 'Destination airport code (e.g., "BCN", "JFK", "FNC")'
        },
        departureDate: {
          type: Type.STRING,
          description: 'Departure date in YYYY-MM-DD format'
        },
        returnDate: {
          type: Type.STRING,
          description: 'Return date in YYYY-MM-DD format'
        },
        passengers: {
          type: Type.NUMBER,
          description: 'Number of passengers (Default: 2)'
        },
        currency: {
          type: Type.STRING,
          description: 'Currency code (Default: "GBP")'
        }
      },
      required: ['origin', 'destination', 'departureDate', 'returnDate']
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

  switch (toolName) {
    case 'search_flights':
      return await searchFlights({
        destination: args.destination,
        departureDate: depDate!,
        returnDate: retDate!,
        origin: args.origin || 'LON',
        passengers: args.passengers ?? 2,
        directOnly: args.directOnly ?? true,
        currency: args.currency || 'GBP'
      });

    case 'search_hotels':
      return await searchHotels({
        destination: args.destination,
        checkinDate: checkin!,
        checkoutDate: checkout!,
        adults: args.adults ?? 2,
        rooms: args.rooms ?? 1,
        currency: args.currency || 'GBP',
        minStarRating: args.minStarRating ?? 3,
        maxStarRating: args.maxStarRating ?? 4,
        requireKitchenOrBreakfast: args.requireKitchenOrBreakfast ?? true,
        preferredLocations: args.preferredLocations
      });

    case 'compare_trip_deal':
      return await compareTripDeal(
        args.destination,
        depDate!,
        retDate!,
        args.origin || 'LON',
        args.passengers ?? 2,
        args.currency || 'GBP',
        args.preferredLocations,
        args.minStarRating ?? 3,
        args.maxStarRating ?? 4,
        args.requireKitchenOrBreakfast ?? true
      );

    case 'find_cheapest_destinations':
      return await findCheapestDestinations(
        depDate!,
        retDate!,
        args.destinations,
        args.origin || 'LON',
        args.passengers ?? 2,
        args.currency || 'GBP'
      );

    case 'generate_booking_links':
      return buildAllBookingLinks(
        args.destination,
        depDate!,
        retDate!,
        args.origin || 'LON',
        args.passengers ?? 2,
        args.currency || 'GBP'
      );

    case 'ita_matrix_power_search':
      return generateITAMatrixCommand(
        args.origin || 'LON',
        args.destination,
        depDate!,
        retDate!,
        args.passengers ?? 2,
        args.currency || 'GBP'
      );

    default:
      throw new Error(`Unknown travel tool: ${toolName}`);
  }
}
