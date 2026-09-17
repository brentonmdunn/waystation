import { json } from '@sveltejs/kit';
import { saveConfig, getConfig } from '$lib/config/config.js';
import { asObject, validateBranding } from '$lib/config/branding.js';
import { validateNightMode } from '$lib/config/night-mode.js';

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	return json(getConfig());
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Request body must be JSON' }, { status: 400 });
	}

	// A non-object body would normalize to `{}` and silently reset every setting.
	if (asObject(body) !== body) {
		return json({ error: 'Request body must be a JSON object' }, { status: 400 });
	}

	const errors = [...validateBranding(body.branding), ...validateNightMode(body)];
	if (errors.length) return json({ error: errors.join('; ') }, { status: 400 });

	saveConfig(body);
	return json({ success: true });
}
