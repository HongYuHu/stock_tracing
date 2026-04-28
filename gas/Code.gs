/**
 * Code.gs — Main dispatcher for GET and POST requests
 *
 * Setup (Script Properties):
 *   SHEET_ID        — Google Sheet ID
 *   READ_TOKEN      — Public read token (safe to commit)
 *   WRITE_TOKEN     — Private write token (user enters in app settings)
 *   ALLOWED_ORIGINS — Comma-separated list, e.g. https://yourname.github.io,http://localhost:5500
 *
 * Note: GAS ContentService does not support custom response headers.
 * CORS is handled automatically when the Web App is deployed with
 * "Execute as: Me" and "Who has access: Anyone".
 */

function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function handleRequest(e, method) {
  try {
    let params, token, action;

    if (method === 'GET') {
      params = e.parameter || {};
      token = params.token || '';
      action = params.action || '';
    } else {
      const raw = e.postData ? e.postData.contents : '{}';
      try { params = JSON.parse(raw); } catch (_) { params = {}; }
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

    if (!isRead && !isWrite) {
      return jsonOut(errResponse(400, 'unknown action: ' + action));
    }

    if (isRead && !validateReadToken(token)) {
      return jsonOut(errResponse(401, 'invalid token'));
    }
    if (isWrite) {
      if (!validateWriteToken(token)) {
        return jsonOut(errResponse(401, 'invalid write token'));
      }
      if (!checkRateLimit(token)) {
        return jsonOut(errResponse(429, 'rate limit exceeded'));
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
        result = aiGet(params.date, params.symbol, params.limit ? Number(params.limit) : 200);
        break;

      case 'price.proxy':
        result = priceProxy(params.symbol);
        break;

      case 'bootstrap': {
        // Limit historical data to reduce payload size
        const d = new Date();
        d.setMonth(d.getMonth() - 12);
        const fromDate = d.toISOString().split('T')[0];
        result = {
          holdings: holdingsList(),
          assets: assetsList(),
          networth: networthList(fromDate, ''),
          ai: aiGet('', '', 50)
        };
        break;
      }

      // ── WRITE ─────────────────────────────────────────────────────────
      case 'holdings.create':
        result = holdingsCreate(params);
        break;

      case 'holdings.update':
        result = holdingsUpdate(params);
        if (!result) return jsonOut(errResponse(404, 'holding not found'));
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
    }

    return jsonOut(okResponse(result));
  } catch (err) {
    return jsonOut(errResponse(500, err.message));
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
