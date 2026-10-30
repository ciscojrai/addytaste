// Thin Netlify wrapper around the same handler the dev server uses. Not deployed or linked from this repo yet.
import { handleApi } from '../../server/api';

export default async (req: Request) => handleApi(req, process.env as Record<string, string | undefined>);
export const config = { path: '/api/*' };
