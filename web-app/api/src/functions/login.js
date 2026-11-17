const { app } = require('@azure/functions');
const { verifyToken, authCookie } = require('../shared/auth');

app.http('login', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'login',
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Invalid JSON body.' } };
    }
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!password) {
      return { status: 400, jsonBody: { error: 'Password is required.' } };
    }

    const tokenUrl = process.env.FUNCTION_APP_TOKEN_URL;
    if (!tokenUrl) {
      context.error('FUNCTION_APP_TOKEN_URL is not configured.');
      return { status: 500, jsonBody: { error: 'Server is not configured.' } };
    }

    let response;
    try {
      response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.FUNCTION_APP_KEY && { 'x-functions-key': process.env.FUNCTION_APP_KEY }),
        },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      context.error(`Token service unreachable: ${err.message}`);
      return { status: 502, jsonBody: { error: 'Authentication service unavailable.' } };
    }

    if (response.status === 401 || response.status === 400) {
      return { status: 401, jsonBody: { error: 'Invalid password.' } };
    }
    if (!response.ok) {
      context.error(`Token service returned ${response.status}.`);
      return { status: 502, jsonBody: { error: 'Authentication service error.' } };
    }

    const { token } = await response.json();
    const payload = verifyToken(token);
    if (!payload) {
      context.error('Token returned by the function app failed validation.');
      return { status: 502, jsonBody: { error: 'Received an invalid token.' } };
    }

    const maxAge = Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
    return {
      status: 200,
      jsonBody: { authenticated: true, expiresAt: new Date(payload.exp * 1000).toISOString() },
      cookies: [authCookie(token, maxAge)],
    };
  },
});
