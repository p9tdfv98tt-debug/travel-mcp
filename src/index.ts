#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { searchFlights } from './services/flightSearch.js';
import { searchHotels } from './services/hotelSearch.js';
import { compareTripDeal, findCheapestDestinations } from './services/dealFinder.js';
import { buildAllBookingLinks } from './services/urlBuilder.js';
import { generateITAMatrixCommand } from './services/itaMatrix.js';
import { DEFAULTS, formatMoney, resolveOrigin } from './config.js';

const server = new Server(
  {
    name: 'travel-mcp',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

const originDescription = DEFAULTS.origin
  ? `Departure city or airport code, e.g. "LHR", "NYC", "Lisbon" (Default: "${DEFAULTS.origin}")`
  : 'Departure city or airport code, e.g. "LHR", "NYC", "Lisbon" (required)';

// Schema fragments shared by several tools
const schema = {
  destination: {
    type: 'string',
    description: 'Destination city or airport code (e.g., "Barcelona", "Tokyo", "BCN", "JFK")'
  },
  departureDate: { type: 'string', description: 'Departure / check-in date in YYYY-MM-DD format' },
  returnDate: { type: 'string', description: 'Return / check-out date in YYYY-MM-DD format' },
  origin: { type: 'string', description: originDescription },
  passengers: {
    type: 'number',
    description: `Number of adult travellers (Default: ${DEFAULTS.adults})`,
    default: DEFAULTS.adults
  },
  directOnly: {
    type: 'boolean',
    description: `Non-stop flights only (Default: ${DEFAULTS.directOnly})`,
    default: DEFAULTS.directOnly
  },
  checkedBags: {
    type: 'boolean',
    description: `Add an estimated cost for 1 checked bag per passenger, both ways, to flight prices (Default: ${DEFAULTS.checkedBags})`,
    default: DEFAULTS.checkedBags
  },
  currency: {
    type: 'string',
    description: `ISO currency code for prices, e.g. "USD", "EUR", "GBP" (Default: "${DEFAULTS.currency}")`,
    default: DEFAULTS.currency
  },
  cabinClass: {
    type: 'string',
    enum: ['economy', 'premium_economy', 'business', 'first'],
    description: 'Cabin class (Default: "economy")',
    default: 'economy'
  },
  aircraftFilter: {
    type: 'array',
    items: { type: 'string' },
    description: 'Filter for specific aircraft models, e.g. ["A350", "A380", "777", "787"]'
  },
  minStarRating: {
    type: 'number',
    description: `Minimum hotel star rating${DEFAULTS.minStars !== undefined ? ` (Default: ${DEFAULTS.minStars})` : ' (Default: no limit)'}`
  },
  maxStarRating: {
    type: 'number',
    description: `Maximum hotel star rating${DEFAULTS.maxStars !== undefined ? ` (Default: ${DEFAULTS.maxStars})` : ' (Default: no limit)'}`
  },
  requireKitchenOrBreakfast: {
    type: 'boolean',
    description: `Only hotels with a kitchen/kitchenette or breakfast included (Default: ${DEFAULTS.requireKitchenOrBreakfast})`,
    default: DEFAULTS.requireKitchenOrBreakfast
  },
  preferredLocations: {
    type: 'array',
    items: { type: 'string' },
    description: 'Neighbourhoods or areas to search instead of the whole destination, e.g. ["Shoreditch", "Soho"]'
  }
};

const str = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : String(v));
const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));
const bool = (v: unknown) => (v === undefined || v === null ? undefined : Boolean(v));

// Register tools list
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_flights',
        description:
          'Search real-time low-price return flights. Returns airline options, schedule, duration, base fare, optional checked-bag estimate and fare family to book, total and per-person price, and booking links (Skyscanner, Google Flights, Expedia, ITA Matrix, Kayak with bag fees).',
        inputSchema: {
          type: 'object',
          properties: {
            destination: schema.destination,
            departureDate: schema.departureDate,
            returnDate: schema.returnDate,
            origin: schema.origin,
            passengers: schema.passengers,
            directOnly: schema.directOnly,
            checkedBags: schema.checkedBags,
            currency: schema.currency,
            cabinClass: schema.cabinClass,
            aircraftFilter: schema.aircraftFilter,
            minDurationHours: {
              type: 'number',
              description: 'Minimum flight duration in hours (e.g. 8 for flights 8h or longer)'
            }
          },
          required: ['destination', 'departureDate', 'returnDate']
        }
      },
      {
        name: 'search_hotels',
        description:
          'Search real-time hotel options, ratings, and prices. Optional filters for star rating, kitchen or breakfast, review score, price and neighbourhood. Returns property names, location, star ratings, amenities, review scores, nightly and total prices, and booking links for Booking.com, Hotels.com, Expedia, and Google Hotels.',
        inputSchema: {
          type: 'object',
          properties: {
            destination: schema.destination,
            checkinDate: { type: 'string', description: 'Check-in date in YYYY-MM-DD format' },
            checkoutDate: { type: 'string', description: 'Check-out date in YYYY-MM-DD format' },
            adults: { ...schema.passengers, description: `Number of adult guests (Default: ${DEFAULTS.adults})` },
            rooms: { type: 'number', description: 'Number of rooms (Default: 1)', default: 1 },
            minStarRating: schema.minStarRating,
            maxStarRating: schema.maxStarRating,
            requireKitchenOrBreakfast: schema.requireKitchenOrBreakfast,
            preferredLocations: schema.preferredLocations,
            minRating: { type: 'number', description: 'Minimum review score out of 5 (e.g., 4.0)' },
            maxPricePerNight: { type: 'number', description: 'Maximum price per night, in the search currency' },
            currency: schema.currency
          },
          required: ['destination', 'checkinDate', 'checkoutDate']
        }
      },
      {
        name: 'compare_trip_deal',
        description:
          'Trip package aggregator: combines the cheapest matching return flight with the best-priced hotels for the same dates into a total package estimate with a per-person breakdown and booking links.',
        inputSchema: {
          type: 'object',
          properties: {
            destination: schema.destination,
            departureDate: schema.departureDate,
            returnDate: schema.returnDate,
            origin: schema.origin,
            passengers: schema.passengers,
            directOnly: schema.directOnly,
            minStarRating: schema.minStarRating,
            maxStarRating: schema.maxStarRating,
            requireKitchenOrBreakfast: schema.requireKitchenOrBreakfast,
            preferredLocations: schema.preferredLocations,
            checkedBags: schema.checkedBags,
            currency: schema.currency
          },
          required: ['destination', 'departureDate', 'returnDate']
        }
      },
      {
        name: 'generate_booking_links',
        description:
          'Generate pre-populated booking and checkout links across Skyscanner, Booking.com, Hotels.com, Expedia, Google, and ITA Matrix / BookWithMatrix for the given trip.',
        inputSchema: {
          type: 'object',
          properties: {
            destination: schema.destination,
            departureDate: schema.departureDate,
            returnDate: schema.returnDate,
            origin: schema.origin,
            passengers: schema.passengers,
            directOnly: schema.directOnly,
            currency: schema.currency
          },
          required: ['destination', 'departureDate', 'returnDate']
        }
      },
      {
        name: 'ita_matrix_power_search',
        description:
          "Generate power flight search commands and routing codes for Google's ITA Software Matrix (matrix.itasoftware.com), plus BookWithMatrix and Google Flights conversion links for direct booking at the exact fare code price.",
        inputSchema: {
          type: 'object',
          properties: {
            destination: schema.destination,
            departureDate: { type: 'string', description: 'Outbound date in YYYY-MM-DD format' },
            returnDate: { type: 'string', description: 'Inbound date in YYYY-MM-DD format' },
            origin: schema.origin,
            passengers: schema.passengers,
            directOnly: schema.directOnly,
            currency: schema.currency,
            alliance: {
              type: 'string',
              enum: ['star-alliance', 'oneworld', 'skyteam'],
              description: 'Optional airline alliance filter'
            },
            cabinClass: schema.cabinClass,
            aircraftFilter: schema.aircraftFilter
          },
          required: ['destination', 'departureDate', 'returnDate']
        }
      },
      {
        name: 'find_cheapest_destinations',
        description: `Scan a list of destinations for return flights on given dates and rank them by lowest total price. Without a list, scans: ${DEFAULTS.dealDestinations.join(', ')}.`,
        inputSchema: {
          type: 'object',
          properties: {
            departureDate: schema.departureDate,
            returnDate: schema.returnDate,
            destinations: {
              type: 'array',
              items: { type: 'string' },
              description: 'Destination cities to scan'
            },
            origin: schema.origin,
            passengers: schema.passengers,
            directOnly: schema.directOnly,
            checkedBags: schema.checkedBags,
            currency: schema.currency
          },
          required: ['departureDate', 'returnDate']
        }
      }
    ]
  };
});

// Handle tool executions
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const json = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });

  try {
    switch (name) {
      case 'search_flights': {
        const destination = String(args.destination);
        const departureDate = String(args.departureDate);
        const returnDate = String(args.returnDate);
        const origin = resolveOrigin(str(args.origin));
        const passengers = num(args.passengers) ?? DEFAULTS.adults;
        const directOnly = bool(args.directOnly) ?? DEFAULTS.directOnly;
        const currency = (str(args.currency) ?? DEFAULTS.currency).toUpperCase();
        const checkedBags = bool(args.checkedBags) ?? DEFAULTS.checkedBags;
        const cabinClass = (str(args.cabinClass) ?? 'economy') as any;
        const aircraftFilter = Array.isArray(args.aircraftFilter)
          ? (args.aircraftFilter as string[])
          : undefined;
        const minDurationHours = num(args.minDurationHours);

        const flights = await searchFlights({
          destination,
          departureDate,
          returnDate,
          origin,
          passengers,
          directOnly,
          currency,
          checkedBags,
          cabinClass,
          aircraftFilter,
          minDurationHours
        });

        return json({
          searchCriteria: {
            origin,
            destination,
            dates: `${departureDate} to ${returnDate}`,
            passengers: `${passengers} Adult${passengers === 1 ? '' : 's'}`,
            cabinClass,
            aircraftFilter: aircraftFilter || 'All',
            minDurationHours: minDurationHours ? `${minDurationHours}h+` : 'None',
            routing: directOnly ? 'Direct Non-Stop Only' : 'All',
            luggage:
              cabinClass === 'business' || cabinClass === 'first'
                ? 'Business/First class allowance (2 x 32kg included in fare)'
                : checkedBags
                ? `${passengers} x checked bag (1 per person) INCLUDED in prices (estimated bag cost added to base fare)`
                : 'Checked luggage not included (base fares, likely hand luggage only)',
            currency
          },
          totalFound: flights.length,
          bestPrice:
            flights.length > 0
              ? `${formatMoney(flights[0].totalPrice, currency)} total (${formatMoney(flights[0].pricePerPerson, currency)}/person)`
              : 'None found',
          flights
        });
      }

      case 'search_hotels': {
        const destination = String(args.destination);
        const checkinDate = String(args.checkinDate);
        const checkoutDate = String(args.checkoutDate);
        const adults = num(args.adults) ?? DEFAULTS.adults;
        const rooms = num(args.rooms) ?? 1;
        const currency = (str(args.currency) ?? DEFAULTS.currency).toUpperCase();

        const hotels = await searchHotels({
          destination,
          checkinDate,
          checkoutDate,
          adults,
          rooms,
          minStarRating: num(args.minStarRating),
          maxStarRating: num(args.maxStarRating),
          requireKitchenOrBreakfast: bool(args.requireKitchenOrBreakfast),
          preferredLocations: Array.isArray(args.preferredLocations) ? (args.preferredLocations as string[]) : undefined,
          minRating: num(args.minRating),
          maxPricePerNight: num(args.maxPricePerNight),
          currency
        });

        return json({
          searchCriteria: {
            destination,
            checkinDate,
            checkoutDate,
            guests: `${adults} Adult${adults === 1 ? '' : 's'}, ${rooms} Room${rooms === 1 ? '' : 's'}`,
            currency
          },
          totalFound: hotels.length,
          cheapestHotel:
            hotels.length > 0
              ? `${formatMoney(hotels[0].pricePerNight, currency)}/night (${formatMoney(hotels[0].totalPrice, currency)} total stay)`
              : 'None found',
          hotels
        });
      }

      case 'compare_trip_deal': {
        const destination = String(args.destination);
        const departureDate = String(args.departureDate);
        const returnDate = String(args.returnDate);

        const deal = await compareTripDeal(
          destination,
          departureDate,
          returnDate,
          str(args.origin),
          num(args.passengers) ?? DEFAULTS.adults,
          (str(args.currency) ?? DEFAULTS.currency).toUpperCase(),
          Array.isArray(args.preferredLocations) ? (args.preferredLocations as string[]) : undefined,
          num(args.minStarRating) ?? DEFAULTS.minStars,
          num(args.maxStarRating) ?? DEFAULTS.maxStars,
          bool(args.requireKitchenOrBreakfast) ?? DEFAULTS.requireKitchenOrBreakfast,
          bool(args.checkedBags) ?? DEFAULTS.checkedBags,
          bool(args.directOnly) ?? DEFAULTS.directOnly
        );

        if (!deal) {
          return json({ error: `No flight and hotel deals found for ${destination} on ${departureDate} to ${returnDate}` });
        }
        return json(deal);
      }

      case 'generate_booking_links': {
        const links = buildAllBookingLinks(
          String(args.destination),
          String(args.departureDate),
          String(args.returnDate),
          resolveOrigin(str(args.origin)),
          num(args.passengers) ?? DEFAULTS.adults,
          (str(args.currency) ?? DEFAULTS.currency).toUpperCase(),
          bool(args.directOnly) ?? DEFAULTS.directOnly
        );
        return json(links);
      }

      case 'ita_matrix_power_search': {
        const aircraftFilter = Array.isArray(args.aircraftFilter)
          ? (args.aircraftFilter as string[])
          : undefined;

        const cmd = generateITAMatrixCommand(
          String(args.destination),
          String(args.departureDate),
          String(args.returnDate),
          resolveOrigin(str(args.origin)),
          num(args.passengers) ?? DEFAULTS.adults,
          (str(args.currency) ?? DEFAULTS.currency).toUpperCase(),
          str(args.alliance),
          (str(args.cabinClass) ?? 'economy') as any,
          aircraftFilter,
          bool(args.directOnly) ?? DEFAULTS.directOnly
        );
        return json(cmd);
      }

      case 'find_cheapest_destinations': {
        const departureDate = String(args.departureDate);
        const returnDate = String(args.returnDate);
        const origin = resolveOrigin(str(args.origin));
        const passengers = num(args.passengers) ?? DEFAULTS.adults;
        const currency = (str(args.currency) ?? DEFAULTS.currency).toUpperCase();
        const checkedBags = bool(args.checkedBags) ?? DEFAULTS.checkedBags;
        const directOnly = bool(args.directOnly) ?? DEFAULTS.directOnly;

        const deals = await findCheapestDestinations(
          departureDate,
          returnDate,
          Array.isArray(args.destinations) ? (args.destinations as string[]) : undefined,
          origin,
          passengers,
          currency,
          checkedBags,
          directOnly
        );

        return json({
          searchCriteria: {
            origin,
            dates: `${departureDate} to ${returnDate}`,
            passengers: `${passengers} Adult${passengers === 1 ? '' : 's'}`,
            routing: directOnly ? 'Direct Non-Stop Only' : 'All',
            luggage: checkedBags ? '1 checked bag per person INCLUDED' : 'Checked luggage not included',
            currency
          },
          destinationsRankedByPrice: deals
        });
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error executing tool ${name}: ${error?.message || String(error)}`
        }
      ],
      isError: true
    };
  }
});

// Start the server using stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Travel MCP Server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error in main():', err);
  process.exit(1);
});
