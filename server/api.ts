// One handler for every /api/* route. Used by the Vite dev server and by the Netlify function wrapper.
import { createGemini } from './gemini';
import { HttpError, runInsight, runRead } from './pipeline';
import { createQlooClient, SAMPLE_BADGE } from './qloo';

type Env = Record<string, string | undefined>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function handleApi(req: Request, env: Env = process.env): Promise<Response> {
  const route = new URL(req.url).pathname.replace(/^\/(\.netlify\/functions\/)?api\/?/, '');
  const qloo = createQlooClient({ apiKey: env.QLOO_API_KEY, baseUrl: env.QLOO_BASE_URL });
  const gemini = createGemini(env);
  try {
    if (route === 'status' && req.method === 'GET') {
      return json(200, { dataSource: qloo.mode, badge: qloo.mode === 'sample' ? SAMPLE_BADGE : null, gemini: gemini.available });
    }
    if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return json(400, { error: 'Send JSON.' });
    if (route === 'read') return json(200, await runRead(body, gemini));
    if (route === 'insight') return json(200, await runInsight(body, { qloo, gemini, stay22Aid: env.STAY22_AID || 'newaddy' }));
    return json(404, { error: 'Not found.' });
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    // Never echo upstream details (they can include request URLs).
    console.error('api error', (e as Error).message);
    return json(500, { error: 'Something went wrong on our side. Try again.' });
  }
}
