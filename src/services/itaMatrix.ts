import { CabinClass, ITAMatrixCommand } from '../types.js';
import { buildGoogleFlightsUrl } from './urlBuilder.js';
import { originForQuery } from '../config.js';

export function generateITAMatrixCommand(
  destination: string,
  departureDate: string,
  returnDate: string,
  origin: string,
  passengers: number = 1,
  currency: string = 'USD',
  alliance?: string, // 'star-alliance' | 'oneworld' | 'skyteam'
  cabinClass: CabinClass = 'economy',
  aircraftFilter?: string[],
  directOnly: boolean = false
): ITAMatrixCommand {
  // Routing commands for ITA Matrix: "N:" restricts to nonstop flights
  let outboundRouting = directOnly ? 'N:' : '';
  let inboundRouting = directOnly ? 'N:' : '';

  if (alliance) {
    outboundRouting = `alliance ${alliance}`;
    inboundRouting = `alliance ${alliance}`;
  }

  const addRouting = (code: string) => {
    outboundRouting = outboundRouting ? `${outboundRouting} / ${code}` : code;
    inboundRouting = inboundRouting ? `${inboundRouting} / ${code}` : code;
  };

  // Cabin class fare codes
  if (cabinClass === 'business') {
    addRouting('f bc=J|bc=C|bc=D|bc=I|bc=R');
  } else if (cabinClass === 'first') {
    addRouting('f bc=F|bc=A');
  } else if (cabinClass === 'premium_economy') {
    addRouting('f bc=W|bc=E|bc=T');
  }

  // Aircraft filter codes
  if (aircraftFilter && aircraftFilter.length > 0) {
    const codes: string[] = [];
    for (const a of aircraftFilter) {
      const lower = a.toLowerCase();
      if (lower.includes('350')) codes.push('t:359', 't:351');
      else if (lower.includes('380')) codes.push('t:388');
      else if (lower.includes('777')) codes.push('t:77W', 't:772', 't:773', 't:77L');
      else if (lower.includes('787')) codes.push('t:788', 't:789', 't:78X', 't:781');
      else codes.push(`t:${a}`);
    }
    const acStr = codes.join(' ');
    addRouting(`aircraft ${acStr}`);
  }

  const extensionCodes = directOnly ? 'maxconnect 0' : ''; // 0 connections = direct only

  const instructions = [
    `1. Go to ITA Software Matrix: https://matrix.itasoftware.com/search`,
    `2. Set Origin to '${origin}'`,
    `3. Set Destination to '${destination}'`,
    `4. Outbound date: ${departureDate}, Inbound date: ${returnDate} (Round trip)`,
    `5. Cabin class: ${cabinClass === 'business' ? 'Business Class' : cabinClass}`,
    `6. In 'Routing Codes', enter: '${outboundRouting || '(leave empty)'}'`,
    `7. In 'Extension Codes', enter: '${extensionCodes || '(leave empty)'}'`,
    `8. Set Passengers to ${passengers} Adult(s) and Currency to '${currency}'`,
    `9. Once you click Search and find your desired itinerary, copy the itinerary and paste it into BookWithMatrix (https://bookwithmatrix.com/) to buy the ticket at the exact ITA Matrix fare code price!`
  ].join('\n');

  return {
    queryUrl: 'https://matrix.itasoftware.com/search',
    bookWithMatrixUrl: 'https://bookwithmatrix.com/',
    googleFlightsEquivalentUrl: buildGoogleFlightsUrl(originForQuery(origin), destination, departureDate, returnDate, passengers, directOnly, currency, cabinClass),
    origin,
    destination,
    dates: {
      outbound: departureDate,
      inbound: returnDate
    },
    passengers,
    currency,
    routingCommands: {
      outboundRouting,
      inboundRouting,
      extensionCodes
    },
    instructions
  };
}
