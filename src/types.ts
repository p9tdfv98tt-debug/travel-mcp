export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';

export interface FlightSearchParams {
  destination: string;           // Destination city or airport code (e.g., "BCN", "Barcelona", "Rome", "FCO")
  departureDate: string;         // YYYY-MM-DD
  returnDate: string;            // YYYY-MM-DD
  origin?: string;               // Default: "LON" (London all airports: LHR, LGW, STN, LTN, LCY)
  passengers?: number;           // Default: 2 (enforces 2 adults)
  directOnly?: boolean;          // Default: true (direct non-stop only)
  currency?: string;             // Default: "GBP"
  checkedBags?: boolean;         // Default: true (1 checked bag per passenger, return). Only false when user says to ignore checked luggage.
  cabinClass?: CabinClass;       // Default: "economy"
  aircraftFilter?: string[];     // Filter for aircraft types, e.g. ["A350", "A380", "777", "787"]
  minDurationHours?: number;     // Filter for minimum flight duration in hours, e.g. 8
}

export interface BaggageInfo {
  checkedBagsIncluded: boolean;
  allowance: string;
  fareToBook: string;
  estimatedBagCostTotalGbp: number;
  estimatedBagCostPerPersonGbp: number;
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
  totalPriceGbp: number;         // Includes checked bags when checkedBags=true
  pricePerPersonGbp: number;     // Includes checked bags when checkedBags=true
  baseFareTotalGbp?: number;     // Raw fare from search (usually hand luggage only)
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
  adults?: number;               // Default: 2
  rooms?: number;                // Default: 1
  currency?: string;             // Default: "GBP"
  minRating?: number;            // e.g. 4.0
  maxPricePerNight?: number;     // in GBP
  minStarRating?: number;        // Default: 3 (Always 3 or 4 stars)
  maxStarRating?: number;        // Default: 4 (Always 3 or 4 stars)
  requireKitchenOrBreakfast?: boolean; // Default: true (either kitchen or breakfast included)
  preferredLocations?: string[]; // e.g. ['Jersey City', 'Journal Square', 'Long Island City', 'Manhattan']
}

export interface HotelOption {
  name: string;
  location?: string;
  starRating?: number;
  userRating?: number;
  ratingText?: string;
  amenities?: string[];         // e.g. ["Breakfast included", "Kitchenette"]
  pricePerNightGbp: number;
  totalPriceGbp: number;
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
  totalPackagePriceGbp: number;
  packagePricePerPersonGbp: number;
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
