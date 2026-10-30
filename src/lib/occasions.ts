// Occasions, budgets and per-occasion settings. Used by the page and by the server.

export type OccasionId = 'mothers_day' | 'birthday' | 'holidays' | 'anniversary' | 'date_night' | 'valentines' | 'fathers_day' | 'white_elephant';
export type Group = 'work' | 'friends' | 'family';

export const BUDGETS: Record<Group, { min: number; max: number }> = {
  work: { min: 20, max: 30 },
  friends: { min: 25, max: 40 },
  family: { min: 25, max: 50 },
};

export const GROUP_LABEL: Record<Group, string> = { work: 'Work', friends: 'Friends', family: 'Family' };

export interface OccasionDef {
  id: OccasionId;
  label: string;
  /** Qloo filter.price_level.max for place results (1 to 4). */
  placePriceMax: number;
  placeLabel: string;
  giftLabel: string;
  backupLabel: string;
  /** Which sample data set to use when there is no Qloo key. */
  sampleKey: string;
}

export const OCCASIONS: OccasionDef[] = [
  { id: 'mothers_day', label: "Mother's Day", placePriceMax: 3, placeLabel: "Place for a Mother's Day brunch", giftLabel: 'Gift brand', backupLabel: 'Backup plan', sampleKey: 'mom_birthday' },
  { id: 'birthday', label: 'Birthday', placePriceMax: 3, placeLabel: 'Place for a birthday outing', giftLabel: 'Gift brand', backupLabel: 'Backup plan', sampleKey: 'mom_birthday' },
  { id: 'holidays', label: 'Holidays / Christmas', placePriceMax: 3, placeLabel: 'Place for a holiday outing', giftLabel: 'Gift brand', backupLabel: 'Backup plan', sampleKey: 'we-family' },
  { id: 'anniversary', label: 'Anniversary', placePriceMax: 4, placeLabel: 'Place for dinner', giftLabel: 'Gift brand', backupLabel: 'Backup plan', sampleKey: 'anniversary' },
  { id: 'date_night', label: 'Date night', placePriceMax: 2, placeLabel: 'Place for the date', giftLabel: 'Small gift brand', backupLabel: 'Rain backup', sampleKey: 'summer_date' },
  { id: 'valentines', label: "Valentine's", placePriceMax: 3, placeLabel: "Place for Valentine's dinner", giftLabel: 'Gift brand', backupLabel: 'Backup plan', sampleKey: 'anniversary' },
  { id: 'fathers_day', label: "Father's Day", placePriceMax: 3, placeLabel: "Place for a Father's Day lunch", giftLabel: 'Gift brand', backupLabel: 'Backup plan', sampleKey: 'we-family' },
  { id: 'white_elephant', label: 'White Elephant', placePriceMax: 2, placeLabel: 'Place to shop or celebrate', giftLabel: 'Gift brand', backupLabel: 'Backup plan', sampleKey: 'we-work' },
];

export const occasionById = (id: string): OccasionDef | undefined => OCCASIONS.find((o) => o.id === id);

/** Old (v1) occasion ids, for migrating saved chats. */
export const LEGACY_OCCASION: Record<string, OccasionId> = { mom_birthday: 'birthday', summer_date: 'date_night', anniversary: 'anniversary', white_elephant: 'white_elephant' };

export interface OccasionContext {
  def: OccasionDef;
  group: Group | null;
  budget: { min: number; max: number; label: string } | null;
  workSafe: boolean;
  /** Key used to pick per-occasion sample data. */
  key: string;
  placePriceMax: number;
}

export function resolveOccasion(id: string, group?: string | null): OccasionContext | null {
  const def = occasionById(id);
  if (!def) return null;
  if (def.id === 'white_elephant') {
    if (group !== 'work' && group !== 'friends' && group !== 'family') return null;
    const b = BUDGETS[group];
    return {
      def,
      group,
      budget: { ...b, label: `$${b.min}\u2013$${b.max}` },
      workSafe: group === 'work',
      key: `we-${group}`,
      placePriceMax: group === 'family' ? 3 : 2,
    };
  }
  return { def, group: null, budget: null, workSafe: false, key: def.sampleKey, placePriceMax: def.placePriceMax };
}

/** What the Taste Reader is told about the source text or screenshot. It never guesses who the chat is about. */
export function readerHint(label: string): string {
  return `The text or screenshot is what someone said about themselves, or what a person shares about someone, while planning ${label}. Capture hobbies, brands, books, music, places and foods they like, and anything they dislike or already have too much of.`;
}

const GIFT_EXAMPLE = "I'd be happy with anything for the garden. I love Fleetwood Mac and Dolly Parton records, and brunch somewhere with a patio. Please no more candles, I have a hundred.";
const DATE_EXAMPLE = 'I love live jazz and rooftop patios, and anything with oysters. I like Frank Ocean and Wes Anderson. Not into loud clubs or country music.';
const HOME_EXAMPLE = "I live on coffee and I'm always reading something by Michael Lewis. I put Sade on in the car. Please no more neckties.";
/** An example paste for the occasion. Examples are neutral: they name no relation. */
export function exampleFor(occasion: string): string {
  if (['date_night', 'anniversary', 'valentines'].includes(occasion)) return DATE_EXAMPLE;
  if (['holidays', 'fathers_day', 'white_elephant'].includes(occasion)) return HOME_EXAMPLE;
  return GIFT_EXAMPLE;
}
