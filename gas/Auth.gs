/**
 * Auth.gs — Token validation and rate limiting
 */

const SCRIPT_PROPS = PropertiesService.getScriptProperties();

function getReadToken() {
  return SCRIPT_PROPS.getProperty('READ_TOKEN') || '';
}

function getWriteToken() {
  return SCRIPT_PROPS.getProperty('WRITE_TOKEN') || '';
}

function getAllowedOrigins() {
  const raw = SCRIPT_PROPS.getProperty('ALLOWED_ORIGINS') || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Validate token for read operations.
 * Returns true if token matches READ_TOKEN or WRITE_TOKEN.
 */
function validateReadToken(token) {
  if (!token) return false;
  return token === getReadToken() || token === getWriteToken();
}

/**
 * Validate token for write operations.
 * Only WRITE_TOKEN is accepted.
 */
function validateWriteToken(token) {
  if (!token) return false;
  return token === getWriteToken();
}

/**
 * Rate limit writes: max 30 per minute per token.
 * Returns true if within limit, false if exceeded.
 */
function checkRateLimit(token) {
  const cache = CacheService.getScriptCache();
  const key = 'rl_' + Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    token + Math.floor(Date.now() / 60000)
  ).map(b => (b & 0xFF).toString(16).padStart(2, '0')).join('');

  const current = parseInt(cache.get(key) || '0', 10);
  if (current >= 30) return false;
  cache.put(key, String(current + 1), 60);
  return true;
}

/**
 * Build a standardized error response object.
 */
function errResponse(code, message) {
  return { ok: false, data: null, error: message, code: code };
}

/**
 * Build a standardized success response object.
 */
function okResponse(data, meta) {
  return { ok: true, data: data, error: null, meta: meta || { ts: new Date().toISOString() } };
}
