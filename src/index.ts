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

// Register tools list
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_flights',
        description:
          'Search real-time low-price return flights from London for 2 people with direct non-stop routing in GBP (£). DEFAULT: prices INCLUDE 1 checked bag per person (return) – totalPriceGbp = base fare + estimated checked-bag cost, ranked by that total. Only set checkedBags=false if the user explicitly says to ignore checked luggage this time. Returns airline options, schedule, duration, base fare, bag cost, fare family to book, total and per-person price, and booking links (Skyscanner, Google Flights, Expedia, ITA Matrix, Kayak with bag fees).',
        inputSchema: {
          type: 'object',
          properties: {
            destination: {
              type: 'string',
              description: 'Destination city or airport code (e.g., "Barcelona", "Rome", "Paris", "BCN", "FCO")'
            },
            departureDate: {
              type: 'string',
              description: 'Departure date in YYYY-MM-DD format'
            },
            returnDate: {
              type: 'string',
              description: 'Return date in YYYY-MM-DD format'
            },
            origin: {
              type: 'string',
              description: 'Departure city or airport code (Default: "LON" for all London airports: LHR, LGW, STN, LTN, LCY)',
              default: 'LON'
            },
            passengers: {
              type: 'number',
              description: 'Number of adult passengers (Default: 2)',
              default: 2
            },
            directOnly: {
              type: 'boolean',
              description: 'Filter for direct non-stop flights only (Default: true)',
              default: true
            },
            checkedBags: {
              type: 'boolean',
              description: 'Include 1 checked bag per passenger, both ways, in the price (Default: true). Set false ONLY when the user says to ignore checked luggage.',
              default: true
            },
            currency: {
              type: 'string',
              description: 'Currency code (Default: "GBP")',
              default: 'GBP'
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
          'Search real-time hotel options, ratings, and prices in GBP (£) for 2 adults (1 room). Enforces user preferences: 3 or 4 stars only, either kitchen/kitchenette or breakfast included, and location filters (Jersey City, Journal Square, Long Island City, or Manhattan for NYC area). Returns property names, location/neighborhood, star ratings, amenities, review scores, nightly prices, total stay prices, and pre-populated 1-click booking links for Booking.com, Hotels.com, Expedia, and Google Hotels.',
        inputSchema: {
          type: 'object',
          properties: {
            destination: {
              type: 'string',
              description: 'Destination city or location (e.g., "New York", "Rome", "Barcelona")'
            },
            checkinDate: {
              type: 'string',
              description: 'Check-in date in YYYY-MM-DD format'
            },
            checkoutDate: {
              type: 'string',
              description: 'Check-out date in YYYY-MM-DD format'
            },
            adults: {
              type: 'number',
              description: 'Number of adult guests (Default: 2)',
              default: 2
            },
            rooms: {
              type: 'number',
              description: 'Number of rooms (Default: 1)',
              default: 1
            },
            minStarRating: {
              type: 'number',
              description: 'Minimum star rating (Default: 3 for 3-4 star preference)',
              default: 3
            },
            maxStarRating: {
              type: 'number',
              description: 'Maximum star rating (Default: 4 for 3-4 star preference)',
              default: 4
            },
            requireKitchenOrBreakfast: {
              type: 'boolean',
              description: 'Require either kitchen/kitchenette or breakfast included (Default: true)',
              default: true
            },
            preferredLocations: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of allowed neighborhoods/cities (Default for NYC: ["Jersey City", "Journal Square", "Long Island City", "Manhattan"])'
            },
            minRating: {
              type: 'number',
              description: 'Minimum review score / rating out of 5 (e.g., 4.0)'
            },
            maxPricePerNight: {
              type: 'number',
              description: 'Maximum price per night in GBP (£)'
            },
            currency: {
              type: 'string',
              description: 'Currency code (Default: "GBP")',
              default: 'GBP'
            }
          },
          required: ['destination', 'checkinDate', 'checkoutDate']
        }
      },
      {
        name: 'compare_trip_deal',
        description:
          'Complete trip package aggregator for 2 adults from London. Combines the cheapest direct return flight with top-rated hotels matching preferences (3-4 stars, kitchen or breakfast, and preferred areas like Jersey City, Journal Square, Long Island City, or Manhattan), calculates total stay cost and per-person cost in GBP (£) – flight price INCLUDES 1 checked bag per person by default, and provides comprehensive 1-click booking links across Skyscanner, Booking.com, Hotels.com, and Expedia.',
        inputSchema: {
          type: 'object',
          properties: {
            destination: {
              type: 'string',
              description: 'Destination city or airport (e.g., "New York", "Rome", "Barcelona")'
            },
            departureDate: {
              type: 'string',
              description: 'Departure date in YYYY-MM-DD format'
            },
            returnDate: {
              type: 'string',
              description: 'Return date in YYYY-MM-DD format'
            },
            origin: {
              type: 'string',
              description: 'Departure city (Default: "LON")',
              default: 'LON'
            },
            passengers: {
              type: 'number',
              description: 'Number of adult passengers (Default: 2)',
              default: 2
            },
            minStarRating: {
              type: 'number',
              description: 'Minimum star rating (Default: 3)',
              default: 3
            },
            maxStarRating: {
              type: 'number',
              description: 'Maximum star rating (Default: 4)',
              default: 4
            },
            requireKitchenOrBreakfast: {
              type: 'boolean',
              description: 'Require either kitchen or breakfast included (Default: true)',
              default: true
            },
            preferredLocations: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of allowed neighborhoods/cities (Default for NYC: ["Jersey City", "Journal Square", "Long Island City", "Manhattan"])'
            },
            checkedBags: {
              type: 'boolean',
              description: 'Include 1 checked bag per passenger, both ways, in flight prices (Default: true). Set false ONLY when the user says to ignore checked luggage.',
              default: true
            },
            currency: {
              type: 'string',
              description: 'Currency code (Default: "GBP")',
              default: 'GBP'
            }
          },
          required: ['destination', 'departureDate', 'returnDate']
        }
      },
      {
        name: 'generate_booking_links',
        description:
          'Generate pre-populated, verified 1-click booking and checkout links across all 5 platforms (Skyscanner, Booking.com, Hotels.com, Expedia, and ITA Matrix / BookWithMatrix) with 2 adults, London return, direct-only flights, and GBP currency locked in.',
        inputSchema: {
          type: 'object',
          properties: {
            destination: {
              type: 'string',
              description: 'Destination city or airport code (e.g., "Barcelona", "Rome")'
            },
            departureDate: {
              type: 'string',
              description: 'Departure / Check-in date in YYYY-MM-DD format'
            },
            returnDate: {
              type: 'string',
              description: 'Return / Check-out date in YYYY-MM-DD format'
            },
            origin: {
              type: 'string',
              description: 'Departure city or airport code (Default: "LON")',
              default: 'LON'
            },
            passengers: {
              type: 'number',
              description: 'Number of passengers / guests (Default: 2)',
              default: 2
            },
            currency: {
              type: 'string',
              description: 'Currency code (Default: "GBP")',
              default: 'GBP'
            }
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
            destination: {
              type: 'string',
              description: 'Destination airport code or city (e.g., "Rome", "BCN")'
            },
            departureDate: {
              type: 'string',
              description: 'Outbound date in YYYY-MM-DD format'
            },
            returnDate: {
              type: 'string',
              description: 'Inbound date in YYYY-MM-DD format'
            },
            origin: {
              type: 'string',
              description: 'Origin airport code (Default: "LON")',
              default: 'LON'
            },
            passengers: {
              type: 'number',
              description: 'Number of adult passengers (Default: 2)',
              default: 2
            },
            currency: {
              type: 'string',
              description: 'Currency code (Default: "GBP")',
              default: 'GBP'
            },
            alliance: {
              type: 'string',
              enum: ['star-alliance', 'oneworld', 'skyteam'],
              description: 'Optional airline alliance filter'
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
            }
          },
          required: ['destination', 'departureDate', 'returnDate']
        }
      },
      {
        name: 'find_cheapest_destinations',
        description:
          'Scan top European holiday and weekend destinations from London for direct return flights for 2 people on given dates. Ranks destinations by lowest total price in GBP (£), including 1 checked bag per person by default.',
        inputSchema: {
          type: 'object',
          properties: {
            departureDate: {
              type: 'string',
              description: 'Departure date in YYYY-MM-DD format'
            },
            returnDate: {
              type: 'string',
              description: 'Return date in YYYY-MM-DD format'
            },
            destinations: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional custom list of destination cities to scan'
            },
            origin: {
              type: 'string',
              description: 'Origin city or code (Default: "LON")',
              default: 'LON'
            },
            passengers: {
              type: 'number',
              description: 'Number of adult passengers (Default: 2)',
              default: 2
            },
            checkedBags: {
              type: 'boolean',
              description: 'Include 1 checked bag per passenger, both ways, in flight prices (Default: true). Set false ONLY when the user says to ignore checked luggage.',
              default: true
            },
            currency: {
              type: 'string',
              description: 'Currency code (Default: "GBP")',
              default: 'GBP'
            }
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

  try {
    switch (name) {
      case 'search_flights': {
        const destination = String(args.destination);
        const departureDate = String(args.departureDate);
        const returnDate = String(args.returnDate);
        const origin = args.origin ? String(args.origin) : 'LON';
        const passengers = args.passengers ? Number(args.passengers) : 2;
        const directOnly = args.directOnly !== undefined ? Boolean(args.directOnly) : true;
        const currency = args.currency ? String(args.currency) : 'GBP';
        const checkedBags = args.checkedBags !== undefined ? Boolean(args.checkedBags) : true;
        const cabinClass = (args.cabinClass ? String(args.cabinClass) : 'economy') as any;
        const aircraftFilter = Array.isArray(args.aircraftFilter)
          ? (args.aircraftFilter as string[])
          : undefined;
        const minDurationHours =
          args.minDurationHours !== undefined ? Number(args.minDurationHours) : undefined;

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

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  searchCriteria: {
                    origin,
                    destination,
                    dates: `${departureDate} to ${returnDate}`,
                    passengers: `${passengers} Adults`,
                    cabinClass,
                    aircraftFilter: aircraftFilter || 'All',
                    minDurationHours: minDurationHours ? `${minDurationHours}h+` : 'None',
                    routing: directOnly ? 'Direct Non-Stop Only' : 'All',
                    luggage:
                      cabinClass === 'business' || cabinClass === 'first'
                        ? 'Business/First class allowance (2 x 32kg included in fare)'
                        : checkedBags
                        ? `${passengers} x checked bag (1 per person) INCLUDED in prices (estimated bag cost added to base fare)`
                        : 'Checked luggage IGNORED (base fares, likely hand luggage only)',
                    currency
                  },
                  totalFound: flights.length,
                  bestPriceGbp:
                    flights.length > 0
                      ? `£${flights[0].totalPriceGbp} total (£${flights[0].pricePerPersonGbp}/person)`
                      : 'None found',
                  flights
                },
                null,
                2
              )
            }
          ]
        };
      }

      case 'search_hotels': {
        const destination = String(args.destination);
        const checkinDate = String(args.checkinDate);
        const checkoutDate = String(args.checkoutDate);
        const adults = args.adults ? Number(args.adults) : 2;
        const rooms = args.rooms ? Number(args.rooms) : 1;
        const minStarRating = args.minStarRating !== undefined ? Number(args.minStarRating) : 3;
        const maxStarRating = args.maxStarRating !== undefined ? Number(args.maxStarRating) : 4;
        const requireKitchenOrBreakfast = args.requireKitchenOrBreakfast !== undefined ? Boolean(args.requireKitchenOrBreakfast) : true;
        const preferredLocations = Array.isArray(args.preferredLocations) ? (args.preferredLocations as string[]) : undefined;
        const minRating = args.minRating ? Number(args.minRating) : undefined;
        const maxPricePerNight = args.maxPricePerNight ? Number(args.maxPricePerNight) : undefined;
        const currency = args.currency ? String(args.currency) : 'GBP';

        const hotels = await searchHotels({
          destination,
          checkinDate,
          checkoutDate,
          adults,
          rooms,
          minStarRating,
          maxStarRating,
          requireKitchenOrBreakfast,
          preferredLocations,
          minRating,
          maxPricePerNight,
          currency
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  searchCriteria: {
                    destination,
                    checkinDate,
                    checkoutDate,
                    guests: `${adults} Adults, ${rooms} Room`,
                    currency
                  },
                  totalFound: hotels.length,
                  cheapestHotelGbp: hotels.length > 0 ? `£${hotels[0].pricePerNightGbp}/night (£${hotels[0].totalPriceGbp} total stay)` : 'None found',
                  hotels
                },
                null,
                2
              )
            }
          ]
        };
      }

      case 'compare_trip_deal': {
        const destination = String(args.destination);
        const departureDate = String(args.departureDate);
        const returnDate = String(args.returnDate);
        const origin = args.origin ? String(args.origin) : 'LON';
        const passengers = args.passengers ? Number(args.passengers) : 2;
        const currency = args.currency ? String(args.currency) : 'GBP';
        const minStarRating = args.minStarRating !== undefined ? Number(args.minStarRating) : 3;
        const maxStarRating = args.maxStarRating !== undefined ? Number(args.maxStarRating) : 4;
        const requireKitchenOrBreakfast = args.requireKitchenOrBreakfast !== undefined ? Boolean(args.requireKitchenOrBreakfast) : true;
        const preferredLocations = Array.isArray(args.preferredLocations) ? (args.preferredLocations as string[]) : undefined;
        const checkedBags = args.checkedBags !== undefined ? Boolean(args.checkedBags) : true;

        const deal = await compareTripDeal(
          destination,
          departureDate,
          returnDate,
          origin,
          passengers,
          currency,
          preferredLocations,
          minStarRating,
          maxStarRating,
          requireKitchenOrBreakfast,
          checkedBags
        );

        if (!deal) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: `No direct flight and hotel deals found for ${destination} on ${departureDate} to ${returnDate}` })
              }
            ]
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(deal, null, 2)
            }
          ]
        };
      }

      case 'generate_booking_links': {
        const destination = String(args.destination);
        const departureDate = String(args.departureDate);
        const returnDate = String(args.returnDate);
        const origin = args.origin ? String(args.origin) : 'LON';
        const passengers = args.passengers ? Number(args.passengers) : 2;
        const currency = args.currency ? String(args.currency) : 'GBP';

        const links = buildAllBookingLinks(
          destination,
          departureDate,
          returnDate,
          origin,
          passengers,
          currency
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(links, null, 2)
            }
          ]
        };
      }

      case 'ita_matrix_power_search': {
        const destination = String(args.destination);
        const departureDate = String(args.departureDate);
        const returnDate = String(args.returnDate);
        const origin = args.origin ? String(args.origin) : 'LON';
        const passengers = args.passengers ? Number(args.passengers) : 2;
        const currency = args.currency ? String(args.currency) : 'GBP';
        const alliance = args.alliance ? String(args.alliance) : undefined;
        const cabinClass = (args.cabinClass ? String(args.cabinClass) : 'economy') as any;
        const aircraftFilter = Array.isArray(args.aircraftFilter)
          ? (args.aircraftFilter as string[])
          : undefined;

        const cmd = generateITAMatrixCommand(
          destination,
          departureDate,
          returnDate,
          origin,
          passengers,
          currency,
          alliance,
          cabinClass,
          aircraftFilter
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(cmd, null, 2)
            }
          ]
        };
      }

      case 'find_cheapest_destinations': {
        const departureDate = String(args.departureDate);
        const returnDate = String(args.returnDate);
        const destinations = Array.isArray(args.destinations)
          ? (args.destinations as string[])
          : undefined;
        const origin = args.origin ? String(args.origin) : 'LON';
        const passengers = args.passengers ? Number(args.passengers) : 2;
        const currency = args.currency ? String(args.currency) : 'GBP';
        const checkedBags = args.checkedBags !== undefined ? Boolean(args.checkedBags) : true;

        const deals = await findCheapestDestinations(
          departureDate,
          returnDate,
          destinations,
          origin,
          passengers,
          currency,
          checkedBags
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  searchCriteria: {
                    origin,
                    dates: `${departureDate} to ${returnDate}`,
                    passengers: `${passengers} Adults`,
                    routing: 'Direct Non-Stop Only',
                    luggage: checkedBags ? '1 checked bag per person INCLUDED' : 'Checked luggage IGNORED',
                    currency
                  },
                  destinationsRankedByPrice: deals
                },
                null,
                2
              )
            }
          ]
        };
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
