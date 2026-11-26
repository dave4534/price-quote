import {createHmac, randomBytes, scryptSync, timingSafeEqual} from 'node:crypto';

const DAY = 86400000;
const COOKIE = 'qd_session';

const appPassword = () => process.env.APP_PASSWORD || '';
const apiKey = () => process.env.API_KEY || '';
const secret = () => process.env.SESSION_SECRET || `${appPassword()}:${apiKey()}`;

export function safeEqual(a, b) {
  const left = createHmac('sha256', 'cmp').update(String(a)).digest();
  const right = createHmac('sha256', 'cmp').update(String(b)).digest();
  return timingSafeEqual(left, right);
}

const sign = (value) => createHmac('sha256', secret()).update(value).digest('base64url');

export function checkPassword(password) {
  return Boolean(appPassword()) && safeEqual(password, appPassword());
}

export function sessionCookie(req, clear = false) {
  const expires = Date.now() + 30 * DAY;
  const value = clear ? '' : `${expires}.${sign(String(expires))}`;
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 30 * 86400}${secure}`;
}

/** Returns 'api', 'session' or null. Fails closed when no secret is configured. */
export function authKind(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return apiKey() && safeEqual(header.slice(7).trim(), apiKey()) ? 'api' : null;
  }
  if (!appPassword()) return null;
  const match = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!match) return null;
  const [expires, mac] = match[1].split('.');
  if (!mac || Number(expires) < Date.now() || !safeEqual(mac, sign(expires))) return null;
  return 'session';
}

export const randomToken = (bytes = 18) => randomBytes(bytes).toString('base64url');

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

export function verifyHash(password, stored) {
  const [salt, hash] = String(stored).split(':');
  return safeEqual(scryptSync(String(password), salt, 32).toString('hex'), hash);
}
