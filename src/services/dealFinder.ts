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

export async function compareTripDeal(
  destination: string,
  departureDate: string,
  returnDate: string,
  origin: string = 'LON',
  passengers: number = 2,
  currency: string = 'GBP',
  preferredLocations?: string[],
  minStarRating: number = 3,
  maxStarRating: number = 4,
  requireKitchenOrBreakfast: boolean = true,
  checkedBags: boolean = true
): Promise<TripDeal | null> {
  const nights = calculateNights(departureDate, returnDate);

  // Search flights and hotels in parallel
  const [flights, hotels] = await Promise.all([
    searchFlights({
      destination,
      departureDate,
      returnDate,
      origin,
      passengers,
      directOnly: true,
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
  const baselineHotelPrice = topHotels.length > 0 ? topHotels[0].totalPriceGbp : 0;
  const totalPackagePriceGbp = cheapestFlight.totalPriceGbp + baselineHotelPrice;
  const packagePricePerPersonGbp = Math.round(totalPackagePriceGbp / passengers);

  const originQuery = origin === 'LON' ? 'London' : origin;

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
    totalPackagePriceGbp,
    packagePricePerPersonGbp,
    bookingLinks: {
      skyscannerFlights: buildSkyscannerFlightUrl(origin, destination, departureDate, returnDate, passengers, true, currency),
      expediaFlights: buildExpediaFlightUrl(origin, destination, departureDate, returnDate, passengers, true),
      googleFlightsIta: buildGoogleFlightsUrl(originQuery, destination, departureDate, returnDate, passengers, true, currency),
      bookingHotels: buildBookingComHotelUrl(destination, departureDate, returnDate, passengers, 1, currency),
      hotelsCom: buildHotelsComUrl(destination, departureDate, returnDate, passengers),
      expediaHotels: buildExpediaHotelUrl(destination, departureDate, returnDate, passengers),
      itaMatrix: 'https://matrix.itasoftware.com/search'
    }
  };
}

const DEFAULT_POPULAR_DESTINATIONS = [
  'Barcelona',
  'Rome',
  'Amsterdam',
  'Dublin',
  'Madrid',
  'Paris',
  'Lisbon',
  'Milan',
  'Prague',
  'Berlin',
  'Venice',
  'Faro'
];

export interface DestinationDeal {
  destination: string;
  cheapestFlight: FlightOption;
  totalFlightPriceGbp: number;
  flightPricePerPersonGbp: number;
}

export async function findCheapestDestinations(
  departureDate: string,
  returnDate: string,
  destinations: string[] = DEFAULT_POPULAR_DESTINATIONS,
  origin: string = 'LON',
  passengers: number = 2,
  currency: string = 'GBP',
  checkedBags: boolean = true
): Promise<DestinationDeal[]> {
  const tasks = destinations.map(async (dest) => {
    try {
      const flights = await searchFlights({
        destination: dest,
        departureDate,
        returnDate,
        origin,
        passengers,
        directOnly: true,
        currency,
        checkedBags
      });

      if (flights.length > 0) {
        const cheapest = flights[0];
        return {
          destination: dest,
          cheapestFlight: cheapest,
          totalFlightPriceGbp: cheapest.totalPriceGbp,
          flightPricePerPersonGbp: cheapest.pricePerPersonGbp
        };
      }
    } catch {
      // Ignore failures on individual destinations
    }
    return null;
  });

  const results = await Promise.all(tasks);
  const valid = results.filter((r): r is DestinationDeal => r !== null);
  valid.sort((a, b) => a.totalFlightPriceGbp - b.totalFlightPriceGbp);
  return valid;
}
