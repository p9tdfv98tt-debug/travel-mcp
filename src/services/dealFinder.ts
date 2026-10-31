import { FlightOption, TripDeal } from '../types.js';
import { searchFlights } from './flightSearch.js';
import { calculateNights, searchHotels } from './hotelSearch.js';
import {
  buildSkyscannerFlightUrl,
  buildExpediaFlightUrl,
  buildGoogleFlightsUrl,
  buildBookingComHotelUrl,
  buildHotelsComUrl,
  buildExpediaHotelUrl
} from './urlBuilder.js';
import { DEFAULTS, originForQuery, resolveOrigin } from '../config.js';

export async function compareTripDeal(
  destination: string,
  departureDate: string,
  returnDate: string,
  originArg?: string,
  passengers: number = DEFAULTS.adults,
  currency: string = DEFAULTS.currency,
  preferredLocations?: string[],
  minStarRating: number | undefined = DEFAULTS.minStars,
  maxStarRating: number | undefined = DEFAULTS.maxStars,
  requireKitchenOrBreakfast: boolean = DEFAULTS.requireKitchenOrBreakfast,
  checkedBags: boolean = DEFAULTS.checkedBags,
  directOnly: boolean = DEFAULTS.directOnly
): Promise<TripDeal | null> {
  const origin = resolveOrigin(originArg);
  const nights = calculateNights(departureDate, returnDate);

  // Search flights and hotels in parallel
  const [flights, hotels] = await Promise.all([
    searchFlights({
      destination,
      departureDate,
      returnDate,
      origin,
      passengers,
      directOnly,
      currency,
      checkedBags
    }),
    searchHotels({
      destination,
      checkinDate: departureDate,
      checkoutDate: returnDate,
      adults: passengers,
      rooms: 1,
      currency,
      minStarRating,
      maxStarRating,
      requireKitchenOrBreakfast,
      preferredLocations
    })
  ]);

  if (flights.length === 0) {
    return null;
  }

  const cheapestFlight = flights[0];
  const topHotels = hotels.slice(0, 5);
  const baselineHotelPrice = topHotels.length > 0 ? topHotels[0].totalPrice : 0;
  const totalPackagePrice = cheapestFlight.totalPrice + baselineHotelPrice;
  const packagePricePerPerson = Math.round(totalPackagePrice / passengers);

  const originQuery = originForQuery(origin);

  return {
    destination,
    departureDate,
    returnDate,
    nights,
    passengers,
    currency,
    checkedBagsIncluded: checkedBags,
    cheapestFlight,
    recommendedHotels: topHotels,
    totalPackagePrice,
    packagePricePerPerson,
    bookingLinks: {
      skyscannerFlights: buildSkyscannerFlightUrl(origin, destination, departureDate, returnDate, passengers, directOnly, currency),
      expediaFlights: buildExpediaFlightUrl(origin, destination, departureDate, returnDate, passengers, directOnly),
      googleFlightsIta: buildGoogleFlightsUrl(originQuery, destination, departureDate, returnDate, passengers, directOnly, currency),
      bookingHotels: buildBookingComHotelUrl(destination, departureDate, returnDate, passengers, 1, currency),
      hotelsCom: buildHotelsComUrl(destination, departureDate, returnDate, passengers),
      expediaHotels: buildExpediaHotelUrl(destination, departureDate, returnDate, passengers),
      itaMatrix: 'https://matrix.itasoftware.com/search'
    }
  };
}

export interface DestinationDeal {
  destination: string;
  cheapestFlight: FlightOption;
  totalFlightPrice: number;
  flightPricePerPerson: number;
}

export async function findCheapestDestinations(
  departureDate: string,
  returnDate: string,
  destinations: string[] = DEFAULTS.dealDestinations,
  originArg?: string,
  passengers: number = DEFAULTS.adults,
  currency: string = DEFAULTS.currency,
  checkedBags: boolean = DEFAULTS.checkedBags,
  directOnly: boolean = DEFAULTS.directOnly
): Promise<DestinationDeal[]> {
  const origin = resolveOrigin(originArg);
  const tasks = destinations.map(async (dest) => {
    try {
      const flights = await searchFlights({
        destination: dest,
        departureDate,
        returnDate,
        origin,
        passengers,
        directOnly,
        currency,
        checkedBags
      });

      if (flights.length > 0) {
        const cheapest = flights[0];
        return {
          destination: dest,
          cheapestFlight: cheapest,
          totalFlightPrice: cheapest.totalPrice,
          flightPricePerPerson: cheapest.pricePerPerson
        };
      }
    } catch {
      // Ignore failures on individual destinations
    }
    return null;
  });

  const results = await Promise.all(tasks);
  const valid = results.filter((r): r is DestinationDeal => r !== null);
  valid.sort((a, b) => a.totalFlightPrice - b.totalFlightPrice);
  return valid;
}
