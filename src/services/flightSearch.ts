import { CabinClass, FlightOption, FlightSearchParams } from '../types.js';
import {
  buildSkyscannerFlightUrl,
  buildExpediaFlightUrl,
  buildKayakFlightUrl,
  buildGoogleFlightsUrl
} from './urlBuilder.js';
import { applyBaggagePolicy, parseDurationHours } from './baggage.js';

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-GB,en;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

interface FlightSegment {
  aircraft: string;
  flightNumber: string;
  airline: string;
  origin: string;
  depTime: string;
  dest: string;
  arrTime: string;
  durationMins: number;
}

interface RawFlight {
  airline: string;
  flightNumber?: string;
  aircraft?: string;
  originAirport: string;
  destinationAirport: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  durationHours: number;
  isDirect: boolean;
  rawPrice: number;
}

function buildQueryUrl(
  destination: string,
  originQuery: string,
  departureDate: string,
  returnDate: string,
  passengers: number,
  nonstop: boolean,
  currency: string,
  cabinClass: CabinClass = 'economy'
): string {
  const cabinPrefix =
    cabinClass && cabinClass !== 'economy'
      ? `${cabinClass.replace(/_/g, ' ')} flights to `
      : 'Flights to ';
  const queryStr = `${cabinPrefix}${destination} from ${originQuery} on ${departureDate} through ${returnDate} ${passengers} adults ${nonstop ? 'nonstop' : ''}`.trim();
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(queryStr)}&curr=${currency}&hl=en-GB`;
}

function extractFlightSegments(html: string): FlightSegment[] {
  const pattern =
    /3,\"([^\"]+)\",.*?\[\"([A-Z0-9]{2})\",\"([0-9]+)\",null,\"([^\"]+)\"\].*?\"([A-Z]{3})\",\[\d+,\d+,\d+\],\[(\d+)(?:,(\d+))?\],\"([A-Z]{3})\",\[\d+,\d+,\d+\],\[(\d+)(?:,(\d+))?\],(\d+)/g;
  const segments: FlightSegment[] = [];
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(html)) !== null) {
    const depH = m[6].padStart(2, '0');
    const depM = (m[7] || '0').padStart(2, '0');
    const arrH = m[9].padStart(2, '0');
    const arrM = (m[10] || '0').padStart(2, '0');
    segments.push({
      aircraft: m[1].trim(),
      flightNumber: `${m[2]}${m[3]}`,
      airline: m[4].trim(),
      origin: m[5].trim(),
      depTime: `${depH}:${depM}`,
      dest: m[8].trim(),
      arrTime: `${arrH}:${arrM}`,
      durationMins: parseInt(m[11], 10)
    });
  }

  return segments;
}

async function fetchAndParse(
  url: string,
  originQuery: string,
  destination: string
): Promise<RawFlight[]> {
  const res = await fetch(url, { headers: REQUEST_HEADERS });
  if (!res.ok) {
    throw new Error(`Flight search request failed with status ${res.status}`);
  }
  const html = await res.text();
  const segments = extractFlightSegments(html);
  const out: RawFlight[] = [];

  // Primary parser using rich accessibility labels
  const ariaRegex =
    /aria-label="From\s+([\d,]+)\s+British pounds round trip total\..*?Select flight"/gi;
  let match;

  while ((match = ariaRegex.exec(html)) !== null) {
    const fullLabel = match[0];
    const priceMatch = fullLabel.match(/From\s+([\d,]+)\s+British pounds/i);
    const airlineMatch = fullLabel.match(/(?:flight with|with)\s+([A-Za-z0-9\s&]+?)\.\s+Leaves/i);
    const leavesMatch = fullLabel.match(/Leaves\s+([A-Za-z0-9.\s]+Airport)\s+at\s+([0-9:]+)/i);
    const arrivesMatch = fullLabel.match(/arrives at\s+([A-Za-z0-9.\s]+Airport)\s+at\s+([0-9:]+)/i);
    const durationMatch = fullLabel.match(/Total duration\s+([0-9\sA-Za-z]+?)\./i);
    const lower = fullLabel.toLowerCase();

    const airline = airlineMatch ? airlineMatch[1].trim() : 'Airline';
    const departureTime = leavesMatch ? leavesMatch[2].trim() : '';
    const durationStr = durationMatch ? durationMatch[1].trim() : '';
    const durationHours = parseDurationHours(durationStr);

    // Correlate with extracted flight segment equipment
    const matchedSeg = segments.find(
      (s) =>
        s.depTime === departureTime ||
        (airline && s.airline.toLowerCase().includes(airline.toLowerCase())) ||
        (airline && airline.toLowerCase().includes(s.airline.toLowerCase()))
    );

    out.push({
      airline,
      flightNumber: matchedSeg?.flightNumber,
      aircraft: matchedSeg?.aircraft,
      originAirport: leavesMatch ? leavesMatch[1].trim() : `${originQuery} Airport`,
      departureTime,
      destinationAirport: arrivesMatch ? arrivesMatch[1].trim() : `${destination} Airport`,
      arrivalTime: arrivesMatch ? arrivesMatch[2].trim() : '',
      duration: durationStr,
      durationHours,
      isDirect: lower.includes('non-stop') || lower.includes('nonstop'),
      rawPrice: priceMatch ? parseInt(priceMatch[1].replace(/,/g, ''), 10) : 0
    });
  }
  return out;
}

export async function searchFlights(params: FlightSearchParams): Promise<FlightOption[]> {
  const origin = params.origin || 'LON';
  const destination = params.destination.trim();
  const departureDate = params.departureDate;
  const returnDate = params.returnDate;
  const passengers = params.passengers || 2;
  const directOnly = params.directOnly !== undefined ? params.directOnly : true;
  const currency = params.currency || 'GBP';
  const checkedBags = params.checkedBags !== undefined ? params.checkedBags : true;
  const cabinClass: CabinClass = params.cabinClass || 'economy';
  const aircraftFilter = params.aircraftFilter?.map((a) => a.toLowerCase().trim());
  const minDurationHours = params.minDurationHours;

  // Origin display for search query
  const originQuery = origin === 'LON' ? 'London' : origin;
  const url = buildQueryUrl(
    destination,
    originQuery,
    departureDate,
    returnDate,
    passengers,
    directOnly,
    currency,
    cabinClass
  );

  const urls = directOnly
    ? [
        url,
        buildQueryUrl(
          destination,
          originQuery,
          departureDate,
          returnDate,
          passengers,
          false,
          currency,
          cabinClass
        )
      ]
    : [url];

  try {
    const results = await Promise.allSettled(
      urls.map((u) => fetchAndParse(u, originQuery, destination))
    );
    const raw = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    if (raw.length === 0 && results.every((r) => r.status === 'rejected')) {
      throw (results[0] as PromiseRejectedResult).reason;
    }

    // De-duplicate by airline + departure time, keeping the cheapest fare
    const best = new Map<string, RawFlight>();
    for (const f of raw) {
      if (directOnly && !f.isDirect) continue;
      if (!f.rawPrice) continue;

      // Filter by duration if minDurationHours specified
      if (minDurationHours !== undefined && f.durationHours < minDurationHours) {
        continue;
      }

      // Filter by aircraft if aircraftFilter specified
      if (aircraftFilter && aircraftFilter.length > 0) {
        if (!f.aircraft) {
          // If aircraft is not detected yet, check if airline/route is known or keep only if aircraft matches
          continue;
        }
        const acLower = f.aircraft.toLowerCase();
        const matchesAircraft = aircraftFilter.some((af) => acLower.includes(af));
        if (!matchesAircraft) continue;
      }

      const key = `${f.airline}-${f.departureTime}-${f.isDirect}`;
      const existing = best.get(key);
      if (!existing || f.rawPrice < existing.rawPrice) best.set(key, f);
    }

    const bookingLinks = {
      skyscanner: buildSkyscannerFlightUrl(
        origin,
        destination,
        departureDate,
        returnDate,
        passengers,
        directOnly,
        currency,
        cabinClass
      ),
      googleFlightsIta: buildGoogleFlightsUrl(
        originQuery,
        destination,
        departureDate,
        returnDate,
        passengers,
        directOnly,
        currency,
        cabinClass
      ),
      expedia: buildExpediaFlightUrl(
        origin,
        destination,
        departureDate,
        returnDate,
        passengers,
        directOnly,
        cabinClass
      ),
      itaMatrixSearch: 'https://matrix.itasoftware.com/search',
      kayakWithBags: buildKayakFlightUrl(
        origin,
        destination,
        departureDate,
        returnDate,
        passengers,
        directOnly,
        checkedBags,
        cabinClass
      )
    };

    const flightOptions: FlightOption[] = [...best.values()].map((f) => {
      const summaryPrefix = f.flightNumber ? `${f.airline} (${f.flightNumber})` : f.airline;
      const aircraftInfo = f.aircraft ? ` [${f.aircraft}]` : '';
      return {
        airline: f.airline,
        flightNumber: f.flightNumber,
        aircraft: f.aircraft,
        cabinClass,
        flightSummary: `${summaryPrefix}${aircraftInfo}: ${f.originAirport} (${f.departureTime}) ➔ ${f.destinationAirport} (${f.arrivalTime}), ${f.duration}`,
        originAirport: f.originAirport,
        destinationAirport: f.destinationAirport,
        departureTime: f.departureTime,
        arrivalTime: f.arrivalTime,
        duration: f.duration,
        durationHours: f.durationHours,
        isDirect: f.isDirect,
        baseFareTotalGbp: f.rawPrice,
        totalPriceGbp: f.rawPrice,
        pricePerPersonGbp: Math.round(f.rawPrice / passengers),
        currency: 'GBP',
        bookingLinks
      };
    });

    // Adds checked-bag cost (if enabled) and sorts cheapest first
    return applyBaggagePolicy(flightOptions, passengers, checkedBags);
  } catch (error) {
    console.error('Error during flight search:', error);
    return [];
  }
}
