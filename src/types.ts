export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';

export interface FlightSearchParams {
  destination: string;           // Destination city or airport code (e.g., "BCN", "Barcelona", "Rome", "FCO")
  departureDate: string;         // YYYY-MM-DD
  returnDate: string;            // YYYY-MM-DD
  origin?: string;               // Default: TRAVEL_ORIGIN (required if unset)
  passengers?: number;           // Default: TRAVEL_ADULTS or 1
  directOnly?: boolean;          // Default: TRAVEL_DIRECT_ONLY or false
  currency?: string;             // Default: TRAVEL_CURRENCY or "USD"
  checkedBags?: boolean;         // Default: TRAVEL_CHECKED_BAGS or false (adds an estimated 1 checked bag per passenger, return)
  cabinClass?: CabinClass;       // Default: "economy"
  aircraftFilter?: string[];     // Filter for aircraft types, e.g. ["A350", "A380", "777", "787"]
  minDurationHours?: number;     // Filter for minimum flight duration in hours, e.g. 8
}

export interface BaggageInfo {
  checkedBagsIncluded: boolean;
  allowance: string;
  fareToBook: string;
  estimatedBagCostTotal: number;
  estimatedBagCostPerPerson: number;
  isEstimate: boolean;
  note: string;
}

export interface FlightOption {
  airline: string;
  flightNumber?: string;
  aircraft?: string;
  cabinClass?: CabinClass;
  flightSummary: string;
  originAirport: string;
  destinationAirport: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  durationHours?: number;
  isDirect: boolean;
  totalPrice: number;            // Includes checked bags when checkedBags=true
  pricePerPerson: number;        // Includes checked bags when checkedBags=true
  baseFareTotal?: number;        // Raw fare from search (usually hand luggage only)
  baggage?: BaggageInfo;
  currency: string;
  bookingLinks: {
    skyscanner: string;
    googleFlightsIta: string;
    expedia: string;
    itaMatrixSearch: string;
    kayakWithBags?: string;      // Kayak search with checked-bag fees added into displayed prices
  };
}

export interface HotelSearchParams {
  destination: string;           // City name or area
  checkinDate: string;           // YYYY-MM-DD
  checkoutDate: string;          // YYYY-MM-DD
  adults?: number;               // Default: TRAVEL_ADULTS or 1
  rooms?: number;                // Default: 1
  currency?: string;             // Default: TRAVEL_CURRENCY or "USD"
  minRating?: number;            // e.g. 4.0
  maxPricePerNight?: number;     // in the search currency
  minStarRating?: number;        // Default: TRAVEL_MIN_STARS or no limit
  maxStarRating?: number;        // Default: TRAVEL_MAX_STARS or no limit
  requireKitchenOrBreakfast?: boolean; // Default: TRAVEL_REQUIRE_KITCHEN_OR_BREAKFAST or false
  preferredLocations?: string[]; // Neighbourhoods to search instead of the whole destination, e.g. ['Shoreditch', 'Soho']
}

export interface HotelOption {
  name: string;
  location?: string;
  starRating?: number;
  userRating?: number;
  ratingText?: string;
  amenities?: string[];         // e.g. ["Breakfast included", "Kitchenette"]
  pricePerNight: number;
  totalPrice: number;
  currency: string;
  bookingLinks: {
    bookingCom: string;
    hotelsCom: string;
    expedia: string;
    googleHotels: string;
  };
}

export interface TripDeal {
  destination: string;
  departureDate: string;
  returnDate: string;
  nights: number;
  passengers: number;
  currency: string;
  checkedBagsIncluded: boolean;
  cheapestFlight: FlightOption;
  recommendedHotels: HotelOption[];
  totalPackagePrice: number;
  packagePricePerPerson: number;
  bookingLinks: {
    skyscannerFlights: string;
    expediaFlights: string;
    googleFlightsIta: string;
    bookingHotels: string;
    hotelsCom: string;
    expediaHotels: string;
    itaMatrix: string;
  };
}

export interface MultiPlatformBookingLinks {
  destination: string;
  departureDate: string;
  returnDate: string;
  passengers: number;
  currency: string;
  flights: {
    skyscanner: string;
    expedia: string;
    googleFlightsIta: string;
    itaMatrix: string;
    bookWithMatrix: string;
  };
  hotels: {
    bookingCom: string;
    hotelsCom: string;
    expedia: string;
    googleHotels: string;
  };
}

export interface ITAMatrixCommand {
  queryUrl: string;
  bookWithMatrixUrl: string;
  googleFlightsEquivalentUrl: string;
  origin: string;
  destination: string;
  dates: {
    outbound: string;
    inbound: string;
  };
  passengers: number;
  currency: string;
  routingCommands: {
    outboundRouting: string;
    inboundRouting: string;
    extensionCodes: string;
  };
  instructions: string;
}
