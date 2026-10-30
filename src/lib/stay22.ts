// Plain Stay22 Allez deep link (https://dev.stay22.com/docs/allez/parameters): /allez/roam?aid=<AID>&address=<place and city>.
// The affiliate id is configurable; the spec docs name "newaddy" as the main app's id.
export function stay22Link(placeName: string, city: string, aid = 'newaddy'): string {
  const address = [placeName, city].map((s) => s.trim()).filter(Boolean).join(', ');
  const q = new URLSearchParams({ aid, address, campaign: 'addytaste' });
  return `https://www.stay22.com/allez/roam?${q.toString().replace(/\+/g, '%20')}`;
}
