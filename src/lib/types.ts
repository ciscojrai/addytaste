// Shared by the browser and the server functions.

export type Category = 'artist' | 'movie' | 'person' | 'tv_show' | 'place' | 'food' | 'brand' | 'book' | 'activity' | 'other';

export interface Taste {
  id: string;
  item: string;
  category: Category;
  /** Text sources: an exact substring of what was pasted. Image sources: a short reading of the screenshot. */
  quote: string;
  source: 'text' | 'image';
}

export type CardKind = 'place' | 'gift' | 'backup';

export interface ResultCard {
  kind: CardKind;
  /** Short label, e.g. "Place", "Gift brand", "Backup plan". */
  label: string;
  name: string;
  tags: string[];
  /** The concrete thing to do or buy (a gift item, a table, a movie night in). */
  idea: string;
  why: string;
  because: string;
  quote: string;
  quoteSource: 'text' | 'image';
  address?: string;
  lat?: number;
  lon?: number;
  /** Plain Stay22 deep link, place cards only. */
  stay22?: string;
  sample: boolean;
}

export interface InferenceSegment {
  text: string;
  /** Present only when the phrase is backed by a tag or name Qloo returned. */
  tag?: string;
}

export interface Pin {
  name: string;
  lat: number;
  lon: number;
  primary: boolean;
  sample: boolean;
}

export interface InsightResult {
  runId: string;
  occasion: string;
  group: string | null;
  city: string;
  budget: { min: number; max: number; label: string } | null;
  workSafe: boolean;
  dataSource: 'live' | 'sample';
  inference: { segments: InferenceSegment[]; legend: string[]; writtenBy: string; tags: string[]; viaTagCall: boolean };
  cards: ResultCard[];
  pins: Pin[];
  filteredOut: { name: string; because: string }[];
  fallback: boolean;
}

export interface ReadResult {
  likes: Taste[];
  avoids: Taste[];
  dropped: number;
  sourceKind: 'text' | 'image';
}
