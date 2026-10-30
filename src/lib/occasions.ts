// Occasions, budgets and per-occasion settings. Used by the page and by the server.

export type OccasionId = 'mom_birthday' | 'summer_date' | 'anniversary' | 'white_elephant';
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
  /** Default name for the person's chat thread. */
  person: string;
  /** Thread suffix: "Mom, birthday". */
  suffix: string;
  /** Qloo filter.price_level.max for place results (1 to 4). */
  placePriceMax: number;
  placeLabel: string;
  giftLabel: string;
  backupLabel: string;
  readerHint: string;
  placeholder: string;
  example: string;
  exampleCity: string;
}

export const OCCASIONS: OccasionDef[] = [
  {
    id: 'mom_birthday',
    label: "Mom's birthday",
    person: 'Mom',
    suffix: 'birthday',
    placePriceMax: 3,
    placeLabel: 'Place for a birthday lunch or outing',
    giftLabel: 'Gift brand',
    backupLabel: 'Backup plan',
    readerHint: "The text or screenshot is what the reader's mom said about herself. Capture hobbies, brands, books, music, places and foods she likes, and anything she dislikes or already has too much of.",
    placeholder: 'Paste what she said she likes, or attach a screenshot.',
    example: "I'd be happy with anything for the garden. I love Fleetwood Mac and Dolly Parton records, and brunch somewhere with a patio. Please no more candles, I have a hundred.",
    exampleCity: 'New Orleans',
  },
  {
    id: 'summer_date',
    label: 'Summer date',
    person: 'Date',
    suffix: 'summer date',
    placePriceMax: 2,
    placeLabel: 'Place for the date',
    giftLabel: 'Small gift brand',
    backupLabel: 'Rain backup',
    readerHint: 'The text or screenshot is what a date said they like. Capture music, film, food, drink, places and activities they like or want to avoid.',
    placeholder: 'Paste what they said, or attach a screenshot.',
    example: 'I love live jazz and rooftop patios, and anything with oysters. I like Frank Ocean and Wes Anderson. Not into loud clubs or country music.',
    exampleCity: 'New Orleans',
  },
  {
    id: 'anniversary',
    label: 'Anniversary',
    person: 'Partner',
    suffix: 'anniversary',
    placePriceMax: 4,
    placeLabel: 'Place for dinner',
    giftLabel: 'Gift brand',
    backupLabel: 'Backup plan',
    readerHint: 'The text or screenshot is what the reader\'s partner said they like. Capture foods, places, music, films, brands and anything they want to avoid.',
    placeholder: 'Paste what your partner said, or attach a screenshot.',
    example: "Honestly a quiet dinner with good wine and a piano somewhere is perfect for me. I love Norah Jones and old Italian movies. No tasting menus that take three hours.",
    exampleCity: 'New Orleans',
  },
  {
    id: 'white_elephant',
    label: 'White Elephant',
    person: 'Swap',
    suffix: 'white elephant',
    placePriceMax: 2,
    placeLabel: 'Place to shop or celebrate',
    giftLabel: 'Gift brand',
    backupLabel: 'Backup plan',
    readerHint: 'The text or screenshot is a gift-swap invite or what someone in the swap said they like. Capture hobbies, brands, books, music, foods and anything they dislike, plus any price limit mentioned.',
    placeholder: 'Paste the invite or what they said, or attach a screenshot.',
    example: "I'm a huge coffee person and I run on espresso. I love Michael Lewis books and I listen to Sade on my commute. No alcohol, please.",
    exampleCity: 'New Orleans',
  },
];

export const occasionById = (id: string): OccasionDef | undefined => OCCASIONS.find((o) => o.id === id);

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
  return { def, group: null, budget: null, workSafe: false, key: def.id, placePriceMax: def.placePriceMax };
}

export function threadTitle(person: string, ctx: Pick<OccasionContext, 'def' | 'group'>): string {
  const p = person.trim() || ctx.def.person;
  if (ctx.def.id === 'white_elephant') return `${p}, ${ctx.def.suffix} (${GROUP_LABEL[ctx.group ?? 'work']})`;
  return `${p}, ${ctx.def.suffix}`;
}
