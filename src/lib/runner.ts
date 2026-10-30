import { getInsight } from './api';
import { priorGifts, quotesText, runFor, runSig, type Chat, type ChatRun } from './chats';

const newRunId = () => `run${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Make one occasion's result from the chat's current chips, city and budget, excluding gifts already used in its other occasions. */
export async function fetchRun(chat: Chat, occasion: string, signal?: AbortSignal): Promise<ChatRun> {
  const group = occasion === 'white_elephant' ? chat.group : null;
  const runId = runFor(chat, occasion)?.runId ?? newRunId();
  const result = await getInsight(
    {
      occasion,
      group,
      city: chat.city.trim(),
      // Each chip quote is an exact piece of an earlier message; the server re-checks them against this joined text.
      text: quotesText(chat),
      likes: chat.likes.filter((t) => t.on).map((t) => t.taste),
      avoids: chat.avoids.filter((t) => t.on).map((t) => t.taste),
      runId,
      exclude: priorGifts(chat, occasion),
    },
    signal,
  );
  const image = chat.likes.some((t) => t.taste.source === 'image');
  return { runId, at: Date.now(), occasion, group, city: chat.city.trim(), sourceKind: image ? 'image' : 'text', result, sig: runSig(chat, occasion) };
}
