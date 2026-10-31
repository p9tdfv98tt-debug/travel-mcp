import { HotelOption, HotelSearchParams } from '../types.js';
import {
  buildBookingComHotelUrl,
  buildHotelsComUrl,
  buildExpediaHotelUrl,
  buildGoogleHotelsUrl
} from './urlBuilder.js';

export function calculateNights(checkinDate: string, checkoutDate: string): number {
  const checkin = new Date(checkinDate);
  const checkout = new Date(checkoutDate);
  const diffTime = checkout.getTime() - checkin.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 1;
}

const DEFAULT_NYC_LOCATIONS = [
  'Jersey City',
  'Journal Square',
  'Long Island City',
  'Manhattan'
];

// Identify amenities (kitchen/breakfast) from hotel name and branding
function detectAmenities(name: string): string[] {
  const lower = name.toLowerCase();
  const amenities: string[] = [];

  const hasKitchen =
    lower.includes('suites') ||
    lower.includes('residence inn') ||
    lower.includes('homewood') ||
    lower.includes('home2') ||
    lower.includes('towneplace') ||
    lower.includes('sonesta simply') ||
    lower.includes('candlewood') ||
    lower.includes('staybridge') ||
    lower.includes('apart') ||
    lower.includes('kitchen') ||
    lower.includes('sonder') ||
    lower.includes('hyatt house');

  const hasBreakfast =
    lower.includes('holiday inn express') ||
    lower.includes('hampton') ||
    lower.includes('hyatt house') ||
    lower.includes('hyatt place') ||
    lower.includes('fairfield') ||
    lower.includes('residence inn') ||
    lower.includes('homewood') ||
    lower.includes('home2') ||
    lower.includes('towneplace') ||
    lower.includes('springhill') ||
    lower.includes('comfort inn') ||
    lower.includes('quality suites') ||
    lower.includes('ramada') ||
    lower.includes('wingate') ||
    lower.includes('breakfast');

  if (hasKitchen) amenities.push('Kitchen / Kitchenette');
  if (hasBreakfast) amenities.push('Breakfast included');
  if (amenities.length === 0) {
    // Default fallback when query specifically requested kitchen or breakfast
    amenities.push('Kitchen or Breakfast available');
  }

  return amenities;
}

// Estimate star rating (3★ vs 4★) and filter out 1-2 star hostels/budget motels
function detectStarRating(name: string): number {
  const lower = name.toLowerCase();

  // 4-star brands
  if (
    lower.includes('hyatt regency') ||
    lower.includes('doubletree') ||
    lower.includes('canopy') ||
    lower.includes('aloft') ||
    lower.includes('crowne plaza') ||
    lower.includes('westin') ||
    lower.includes('marriott') ||
    lower.includes('hilton') && !lower.includes('hampton') && !lower.includes('garden inn')
  ) {
    return 4;
  }

  // 3-star standard brands
  return 3;
}

function isDisqualifiedBudgetOrHostel(name: string): boolean {
  const lower = name.toLowerCase();
  const disqualified = [
    'ymca',
    'hostel',
    'eurohostel',
    'rodeway',
    'motel 6',
    'days inn',
    'travelodge',
    'econo lodge',
    'super 8',
    'haiban',
    'bowery',
    'q4 hotel',
    'the local ny',
    'voyage hotel',
    'shefah',
    'canal loft'
  ];
  return disqualified.some((term) => lower.includes(term));
}

function isOutlyingLocation(name: string, preferredLocations?: string[]): boolean {
  const lower = name.toLowerCase();
  // If user specifically requested Jersey City, Journal Square, LIC, or Manhattan,
  // filter out highway suburbs like North Bergen, Secaucus, Fort Lee, or Bronx
  const unwantedSuburbs = ['north bergen', 'secaucus', 'fort lee', 'bronx'];
  return unwantedSuburbs.some((suburb) => lower.includes(suburb));
}

async function fetchGoogleHotelsHtml(query: string, currency: string): Promise<string> {
  const url = `https://www.google.com/travel/hotels?q=${encodeURIComponent(query)}&curr=${currency}&hl=en-GB`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'en-GB,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  if (!res.ok) {
    throw new Error(`Hotel search request failed with status ${res.status}`);
  }

  return res.text();
}

export async function searchHotels(params: HotelSearchParams): Promise<HotelOption[]> {
  const destination = params.destination.trim();
  const checkinDate = params.checkinDate;
  const checkoutDate = params.checkoutDate;
  const adults = params.adults || 2;
  const rooms = params.rooms || 1;
  const currency = params.currency || 'GBP';
  const minRating = params.minRating || 0;
  const maxPricePerNight = params.maxPricePerNight || Infinity;
  const minStarRating = params.minStarRating !== undefined ? params.minStarRating : 3;
  const maxStarRating = params.maxStarRating !== undefined ? params.maxStarRating : 4;
  const requireKitchenOrBreakfast = params.requireKitchenOrBreakfast !== false;

  const nights = calculateNights(checkinDate, checkoutDate);

  // Check if searching New York area or has custom preferred locations
  const isNycArea =
    destination.toLowerCase().includes('new york') ||
    destination.toLowerCase().includes('nyc') ||
    destination.toLowerCase().includes('jfk') ||
    destination.toLowerCase().includes('ewr') ||
    destination.toLowerCase().includes('jersey city') ||
    destination.toLowerCase().includes('manhattan') ||
    destination.toLowerCase().includes('long island city');

  const locationsToSearch: string[] =
    params.preferredLocations && params.preferredLocations.length > 0
      ? params.preferredLocations
      : isNycArea
      ? DEFAULT_NYC_LOCATIONS
      : [destination];

  const hotelMap = new Map<string, HotelOption>();

  for (const loc of locationsToSearch) {
    try {
      // Execute both a general search (to capture baseline studio/suite rates without keyword inflation)
      // and an amenity-targeted search
      const queries = [
        `hotels in ${loc} from ${checkinDate} to ${checkoutDate}`,
        `3 or 4 star hotels with kitchen or breakfast in ${loc} from ${checkinDate} to ${checkoutDate}`
      ];

      for (const q of queries) {
        const html = await fetchGoogleHotelsHtml(q, currency);

        // Extract reviews/ratings
        const ratingMap = new Map<string, { score: number; reviews: number }>();
        const rRegex = /aria-label="([0-9.]+)\s+out of 5 stars from\s+([0-9,]+)\s+reviews,\s+([^"]+)"/gi;
        let rMatch;
        while ((rMatch = rRegex.exec(html)) !== null) {
          const score = parseFloat(rMatch[1]);
          const reviews = parseInt(rMatch[2].replace(/,/g, ''), 10);
          const name = rMatch[3].trim().replace(/&amp;/g, '&');
          ratingMap.set(name, { score, reviews });
        }

        // Extract prices
        const pRegex = /aria-label="Prices starting from\s+£([\d,]+),\s*([^"]+)"/gi;
        let pMatch;

        while ((pMatch = pRegex.exec(html)) !== null) {
          const priceNight = parseInt(pMatch[1].replace(/,/g, ''), 10);
          const name = pMatch[2].trim().replace(/&amp;/g, '&');

          if (isDisqualifiedBudgetOrHostel(name)) continue;
          if (isNycArea && isOutlyingLocation(name, params.preferredLocations)) continue;
          if (priceNight > maxPricePerNight) continue;

          const rInfo = ratingMap.get(name);
          const userRating = rInfo?.score;
          if (minRating > 0 && (!userRating || userRating < minRating)) {
            continue;
          }

          const starRating = detectStarRating(name);
          if (starRating < minStarRating || starRating > maxStarRating) {
            continue;
          }

          const amenities = detectAmenities(name);
          if (requireKitchenOrBreakfast && amenities.length === 0) {
            continue;
          }

          const totalPrice = priceNight * nights;
          const hotelSearchTerm = `${name} ${loc}`;

          const existing = hotelMap.get(name);
          if (existing) {
            // Keep the lower price found across the search queries
            if (priceNight < existing.pricePerNightGbp) {
              existing.pricePerNightGbp = priceNight;
              existing.totalPriceGbp = totalPrice;
            }
            // Merge amenities
            if (!existing.amenities) existing.amenities = [];
            for (const a of amenities) {
              if (!existing.amenities.includes(a)) {
                existing.amenities.push(a);
              }
            }
          } else {
            hotelMap.set(name, {
              name,
              location: loc,
              starRating,
              userRating,
              ratingText: rInfo ? `${rInfo.score}★ (${rInfo.reviews} reviews)` : undefined,
              amenities,
              pricePerNightGbp: priceNight,
              totalPriceGbp: totalPrice,
              currency: 'GBP',
              bookingLinks: {
                bookingCom: buildBookingComHotelUrl(hotelSearchTerm, checkinDate, checkoutDate, adults, rooms, currency),
                hotelsCom: buildHotelsComUrl(hotelSearchTerm, checkinDate, checkoutDate, adults),
                expedia: buildExpediaHotelUrl(hotelSearchTerm, checkinDate, checkoutDate, adults),
                googleHotels: `https://www.google.com/travel/hotels?q=${encodeURIComponent(hotelSearchTerm + ` from ${checkinDate} to ${checkoutDate}`)}&curr=${currency}&hl=en-GB`
              }
            });
          }
        }
      }
    } catch (err) {
      console.error(`Error searching hotels in ${loc}:`, err);
    }
  }

  const allHotels = Array.from(hotelMap.values());
  // Sort by price ascending
  allHotels.sort((a, b) => a.pricePerNightGbp - b.pricePerNightGbp);

  return allHotels;
}
