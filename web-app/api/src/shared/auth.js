const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'auth_token';

function getConfig() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET is missing or shorter than 32 bytes.');
  }
  return {
    secret,
    issuer: process.env.JWT_ISSUER || 'auth-function-app',
    audience: process.env.JWT_AUDIENCE || 'static-web-app',
  };
}

/** Returns the decoded payload when the token is valid, otherwise null. */
function verifyToken(token) {
  if (!token) return null;
  const { secret, issuer, audience } = getConfig();
  try {
    return jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience });
  } catch {
    return null;
  }
}

function getCookie(request, name) {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1 && part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function authCookie(value, maxAgeSeconds) {
  return {
    name: COOKIE_NAME,
    value,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: maxAgeSeconds,
  };
}

module.exports = { COOKIE_NAME, verifyToken, getCookie, authCookie };
