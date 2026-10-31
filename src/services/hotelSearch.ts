import { HotelOption, HotelSearchParams } from '../types.js';
import {
  buildBookingComHotelUrl,
  buildHotelsComUrl,
  buildExpediaHotelUrl,
  buildGoogleHotelsUrl
} from './urlBuilder.js';
import { DEFAULTS } from '../config.js';

export function calculateNights(checkinDate: string, checkoutDate: string): number {
  const checkin = new Date(checkinDate);
  const checkout = new Date(checkoutDate);
  const diffTime = checkout.getTime() - checkin.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 1;
}

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

// Hostels and budget motels, excluded when a minimum of 3 stars or more is requested
function isBudgetOrHostel(name: string): boolean {
  const lower = name.toLowerCase();
  const budget = ['ymca', 'hostel', 'rodeway', 'motel 6', 'days inn', 'travelodge', 'econo lodge', 'super 8'];
  return budget.some((term) => lower.includes(term));
}

async function fetchGoogleHotelsHtml(query: string, currency: string): Promise<string> {
  const url = `https://www.google.com/travel/hotels?q=${encodeURIComponent(query)}&curr=${currency}&hl=en`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
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
  const adults = params.adults || DEFAULTS.adults;
  const rooms = params.rooms || 1;
  const currency = (params.currency || DEFAULTS.currency).toUpperCase();
  const minRating = params.minRating || 0;
  const maxPricePerNight = params.maxPricePerNight || Infinity;
  const minStarRating = params.minStarRating ?? DEFAULTS.minStars;
  const maxStarRating = params.maxStarRating ?? DEFAULTS.maxStars;
  const requireKitchenOrBreakfast = params.requireKitchenOrBreakfast ?? DEFAULTS.requireKitchenOrBreakfast;

  const nights = calculateNights(checkinDate, checkoutDate);

  const locationsToSearch: string[] =
    params.preferredLocations && params.preferredLocations.length > 0
      ? params.preferredLocations
      : [destination];

  // Extra query wording when filters are set, so Google returns more matching hotels
  const starWords =
    minStarRating !== undefined || maxStarRating !== undefined
      ? `${minStarRating ?? 1} to ${maxStarRating ?? 5} star `
      : '';
  const amenityWords = requireKitchenOrBreakfast ? ' with kitchen or breakfast' : '';

  const hotelMap = new Map<string, HotelOption>();

  for (const loc of locationsToSearch) {
    try {
      // Execute both a general search (to capture baseline studio/suite rates without keyword inflation)
      // and an amenity-targeted search
      const queries = [`hotels in ${loc} from ${checkinDate} to ${checkoutDate}`];
      if (starWords || amenityWords) {
        queries.push(`${starWords}hotels${amenityWords} in ${loc} from ${checkinDate} to ${checkoutDate}`);
      }

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

        // Extract prices, e.g. "Prices starting from £120, Hotel Name" / "from $1,050, ..." / "from CA$99, ..."
        const pRegex = /aria-label="Prices starting from\s+[^\d",]*([\d,]+)(?:\.\d+)?[^,"]*,\s*([^"]+)"/gi;
        let pMatch;

        while ((pMatch = pRegex.exec(html)) !== null) {
          const priceNight = parseInt(pMatch[1].replace(/,/g, ''), 10);
          const name = pMatch[2].trim().replace(/&amp;/g, '&');

          if (minStarRating !== undefined && minStarRating >= 3 && isBudgetOrHostel(name)) continue;
          if (priceNight > maxPricePerNight) continue;

          const rInfo = ratingMap.get(name);
          const userRating = rInfo?.score;
          if (minRating > 0 && (!userRating || userRating < minRating)) {
            continue;
          }

          const starRating = detectStarRating(name);
          if (minStarRating !== undefined && starRating < minStarRating) continue;
          if (maxStarRating !== undefined && starRating > maxStarRating) continue;

          const amenities = detectAmenities(name);
          if (requireKitchenOrBreakfast && amenities.length === 0) {
            continue;
          }

          const totalPrice = priceNight * nights;
          const hotelSearchTerm = `${name} ${loc}`;

          const existing = hotelMap.get(name);
          if (existing) {
            // Keep the lower price found across the search queries
            if (priceNight < existing.pricePerNight) {
              existing.pricePerNight = priceNight;
              existing.totalPrice = totalPrice;
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
              pricePerNight: priceNight,
              totalPrice: totalPrice,
              currency,
              bookingLinks: {
                bookingCom: buildBookingComHotelUrl(hotelSearchTerm, checkinDate, checkoutDate, adults, rooms, currency),
                hotelsCom: buildHotelsComUrl(hotelSearchTerm, checkinDate, checkoutDate, adults),
                expedia: buildExpediaHotelUrl(hotelSearchTerm, checkinDate, checkoutDate, adults),
                googleHotels: `https://www.google.com/travel/hotels?q=${encodeURIComponent(hotelSearchTerm + ` from ${checkinDate} to ${checkoutDate}`)}&curr=${currency}&hl=en`
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
  allHotels.sort((a, b) => a.pricePerNight - b.pricePerNight);

  return allHotels;
}
