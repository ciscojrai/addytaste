// Thin Netlify wrapper around the same handler the dev server uses. Serves /api/* on Netlify.
import { handleApi } from '../../server/api';

export default async (req: Request) => handleApi(req, process.env as Record<string, string | undefined>);
export const config = { path: '/api/*' };
