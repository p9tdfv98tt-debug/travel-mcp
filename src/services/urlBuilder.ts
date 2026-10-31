import { MultiPlatformBookingLinks, CabinClass } from '../types.js';
import { originForQuery } from '../config.js';

export function formatDateYYMMDD(dateStr: string): string {
  // Convert YYYY-MM-DD -> YYMMDD
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[0].slice(2)}${parts[1]}${parts[2]}`;
  }
  return dateStr.replace(/-/g, '').slice(2);
}

export function formatDateDDMMYYYY(dateStr: string): string {
  // Convert YYYY-MM-DD -> DD/MM/YYYY
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export function buildSkyscannerFlightUrl(
  origin: string,
  destination: string,
  departureDate: string,
  returnDate: string,
  passengers: number = 1,
  directOnly: boolean = false,
  currency: string = 'USD',
  cabinClass: CabinClass = 'economy'
): string {
  const orig = origin.toLowerCase();
  const dest = destination.toLowerCase().trim();
  const outDate = formatDateYYMMDD(departureDate);
  const inDate = formatDateYYMMDD(returnDate);

  const directParam = directOnly ? 'preferdirects=true' : 'preferdirects=false';
  const skyscannerCabin = cabinClass === 'premium_economy' ? 'premiumeconomy' : cabinClass;
  return `https://www.skyscanner.net/transport/flights/${orig}/${dest}/${outDate}/${inDate}/?adultsv2=${passengers}&cabinclass=${skyscannerCabin}&rtn=1&${directParam}&currency=${currency}`;
}

export function buildGoogleFlightsUrl(
  origin: string,
  destination: string,
  departureDate: string,
  returnDate: string,
  passengers: number = 1,
  directOnly: boolean = false,
  currency: string = 'USD',
  cabinClass: CabinClass = 'economy'
): string {
  const stopsQuery = directOnly ? 'nonstop' : '';
  const prefix = cabinClass && cabinClass !== 'economy' ? `${cabinClass.replace(/_/g, ' ')} flights to ` : 'Flights to ';
  const q = `${prefix}${destination} from ${origin} on ${departureDate} through ${returnDate} ${passengers} adults ${stopsQuery}`.trim();
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=${currency}&hl=en`;
}

/**
 * Kayak search URL with the baggage-fee filter applied (bfc = checked bags per traveller),
 * so displayed prices include checked-bag fees. Only built for IATA codes (e.g. LON, JFK).
 */
export function buildKayakFlightUrl(
  origin: string,
  destination: string,
  departureDate: string,
  returnDate: string,
  passengers: number = 1,
  directOnly: boolean = false,
  checkedBags: boolean = false,
  cabinClass: CabinClass = 'economy'
): string | undefined {
  const dest = destination.trim().toUpperCase();
  const orig = origin.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(dest) || !/^[A-Z]{3}$/.test(orig)) return undefined;
  const cabinCode = cabinClass === 'business' ? 'b' : cabinClass === 'first' ? 'f' : cabinClass === 'premium_economy' ? 'p' : 'e';
  const filters = [directOnly ? 'stops=0' : '', checkedBags ? 'bfc=1' : '', `cabin=${cabinCode}`].filter(Boolean).join(';');
  const fs = filters ? `&fs=${filters}` : '';
  return `https://www.kayak.com/flights/${orig}-${dest}/${departureDate}/${returnDate}/${passengers}adults?sort=price_a${fs}`;
}

export function buildExpediaFlightUrl(
  origin: string,
  destination: string,
  departureDate: string,
  returnDate: string,
  passengers: number = 1,
  directOnly: boolean = false,
  cabinClass: CabinClass = 'economy'
): string {
  const depFormatted = formatDateDDMMYYYY(departureDate);
  const retFormatted = formatDateDDMMYYYY(returnDate);
  const stopOption = directOnly ? ',nstop:1' : '';
  const expediaCabin = cabinClass === 'premium_economy' ? 'premium' : cabinClass;

  return `https://www.expedia.com/Flights-Search?flight-type=on&mode=search&trip=roundtrip&leg1=from:${origin},to:${destination},departure:${depFormatted}TANYT&leg2=from:${destination},to:${origin},departure:${retFormatted}TANYT&passengers=adults:${passengers},children:0,seniors:0,infantinlap:Y&options=cabinclass:${expediaCabin}${stopOption}`;
}

export function buildBookingComHotelUrl(
  destination: string,
  checkinDate: string,
  checkoutDate: string,
  adults: number = 1,
  rooms: number = 1,
  currency: string = 'USD'
): string {
  return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(destination)}&checkin=${checkinDate}&checkout=${checkoutDate}&group_adults=${adults}&no_rooms=${rooms}&selected_currency=${currency}`;
}

export function buildHotelsComUrl(
  destination: string,
  checkinDate: string,
  checkoutDate: string,
  adults: number = 1
): string {
  return `https://www.hotels.com/Hotel-Search?destination=${encodeURIComponent(destination)}&startDate=${checkinDate}&endDate=${checkoutDate}&adults=${adults}`;
}

export function buildExpediaHotelUrl(
  destination: string,
  checkinDate: string,
  checkoutDate: string,
  adults: number = 1
): string {
  return `https://www.expedia.com/Hotel-Search?destination=${encodeURIComponent(destination)}&startDate=${checkinDate}&endDate=${checkoutDate}&adults=${adults}`;
}

export function buildGoogleHotelsUrl(
  destination: string,
  checkinDate: string,
  checkoutDate: string,
  adults: number = 1,
  currency: string = 'USD'
): string {
  const q = `Hotels in ${destination} from ${checkinDate} to ${checkoutDate} ${adults} adults`;
  return `https://www.google.com/travel/hotels?q=${encodeURIComponent(q)}&curr=${currency}&hl=en`;
}

export function buildAllBookingLinks(
  destination: string,
  departureDate: string,
  returnDate: string,
  origin: string,
  passengers: number = 1,
  currency: string = 'USD',
  directOnly: boolean = false
): MultiPlatformBookingLinks {
  return {
    destination,
    departureDate,
    returnDate,
    passengers,
    currency,
    flights: {
      skyscanner: buildSkyscannerFlightUrl(origin, destination, departureDate, returnDate, passengers, directOnly, currency),
      expedia: buildExpediaFlightUrl(origin, destination, departureDate, returnDate, passengers, directOnly),
      googleFlightsIta: buildGoogleFlightsUrl(originForQuery(origin), destination, departureDate, returnDate, passengers, directOnly, currency),
      itaMatrix: 'https://matrix.itasoftware.com/',
      bookWithMatrix: 'https://bookwithmatrix.com/'
    },
    hotels: {
      bookingCom: buildBookingComHotelUrl(destination, departureDate, returnDate, passengers, 1, currency),
      hotelsCom: buildHotelsComUrl(destination, departureDate, returnDate, passengers),
      expedia: buildExpediaHotelUrl(destination, departureDate, returnDate, passengers),
      googleHotels: buildGoogleHotelsUrl(destination, departureDate, returnDate, passengers, currency)
    }
  };
}
