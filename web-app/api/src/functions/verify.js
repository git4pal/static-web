const { app } = require('@azure/functions');
const { COOKIE_NAME, verifyToken, getCookie, authCookie } = require('../shared/auth');

app.http('verify', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'verify',
  handler: async (request) => {
    const payload = verifyToken(getCookie(request, COOKIE_NAME));
    if (!payload) {
      return {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
        jsonBody: { authenticated: false },
        cookies: [authCookie('', 0)],
      };
    }
    return {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { authenticated: true, expiresAt: new Date(payload.exp * 1000).toISOString() },
    };
  },
});
