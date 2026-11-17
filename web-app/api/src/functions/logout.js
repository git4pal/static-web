const { app } = require('@azure/functions');
const { authCookie } = require('../shared/auth');

app.http('logout', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'logout',
  handler: async () => ({
    status: 200,
    jsonBody: { authenticated: false },
    cookies: [authCookie('', 0)],
  }),
});
