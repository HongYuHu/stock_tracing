/**
 * Code.gs — Main dispatcher for GET and POST requests
 *
 * Setup (Script Properties):
 *   SHEET_ID        — Google Sheet ID
 *   READ_TOKEN      — Public read token (safe to commit)
 *   WRITE_TOKEN     — Private write token (user enters in app settings)
 *   ALLOWED_ORIGINS — Comma-separated list, e.g. https://yourname.github.io,http://localhost:5500
 *   GH_TOKEN        — (migration only) GitHub personal access token
 *   GH_REPO         — (migration only) owner/repo
 */

function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function handleRequest(e, method) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  try {
    let params, token, action;

    if (method === 'GET') {
      params = e.parameter || {};
      token = params.token || '';
      action = params.action || '';
    } else {
      const raw = e.postData ? e.postData.contents : '{}';
      params = JSON.parse(raw);
      token = params.token || '';
      action = params.action || '';
    }

    // Route by action
    const isRead = [
      'holdings.list', 'realized.list', 'networth.list',
      'assets.list', 'ai.get', 'bootstrap', 'price.proxy'
    ].includes(action);

    const isWrite = [
      'holdings.create', 'holdings.update', 'holdings.delete', 'holdings.sell',
      'networth.snapshot', 'assets.upsert', 'assets.delete', 'ai.save'
    ].includes(action);

    if (isRead && !validateReadToken(token)) {
      return jsonOut(errResponse(401, 'invalid token'), headers);
    }
    if (isWrite) {
      if (!validateWriteToken(token)) {
        return jsonOut(errResponse(401, 'invalid write token'), headers);
      }
      if (!checkRateLimit(token)) {
        return jsonOut(errResponse(429, 'rate limit exceeded'), headers);
      }
    }

    let result;
    switch (action) {
      // ── READ ──────────────────────────────────────────────────────────
      case 'holdings.list':
        result = holdingsList();
        break;

      case 'realized.list':
        result = realizedList(params.from, params.to);
        break;

      case 'networth.list':
        result = networthList(params.from, params.to);
        break;

      case 'assets.list':
        result = assetsList();
        break;

      case 'ai.get':
        result = aiGet(params.date, params.symbol);
        break;

      case 'price.proxy':
        result = priceProxy(params.symbol);
        break;

      case 'bootstrap':
        result = {
          holdings: holdingsList(),
          assets: assetsList(),
          networth: networthList(),
          ai: aiGet()
        };
        break;

      // ── WRITE ─────────────────────────────────────────────────────────
      case 'holdings.create':
        result = holdingsCreate(params);
        break;

      case 'holdings.update':
        result = holdingsUpdate(params);
        if (!result) return jsonOut(errResponse(404, 'holding not found'), headers);
        break;

      case 'holdings.delete':
        result = holdingsDelete(params);
        break;

      case 'holdings.sell':
        result = holdingsSell(params);
        break;

      case 'networth.snapshot':
        result = networthSnapshot(params);
        break;

      case 'assets.upsert':
        result = assetsUpsert(params);
        break;

      case 'assets.delete':
        result = assetsDelete(params);
        break;

      case 'ai.save':
        result = aiSave(params);
        break;

      default:
        return jsonOut(errResponse(400, 'unknown action: ' + action), headers);
    }

    return jsonOut(okResponse(result), headers);
  } catch (err) {
    return jsonOut(errResponse(500, err.message), headers);
  }
}

function jsonOut(obj, extraHeaders) {
  const output = ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}
