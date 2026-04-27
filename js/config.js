/**
 * config.js — App configuration stored in localStorage
 * READ_TOKEN is safe to commit; WRITE_TOKEN is user-supplied only.
 */

const CONFIG_KEY = 'stock_tracker_config';

let _config = {
  gasUrl: 'https://script.google.com/macros/s/AKfycbxlezdHjp62m97RpoNKXCVUfk2pDPTGT9A2xc-iA_gisXk3sLdiKc5hahhMWMMp7B9c/exec',
  readToken: '',
  writeToken: ''
};

export function loadConfig() {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      _config = { ..._config, ...JSON.parse(stored) };
    }
  } catch (_) {
    // ignore parse errors
  }
}

export function saveConfig(partial) {
  _config = { ..._config, ...partial };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(_config));
}

export function getConfig() {
  return { ..._config };
}

export function isConfigured() {
  return Boolean(_config.gasUrl && _config.readToken);
}

export function canWrite() {
  return Boolean(_config.writeToken);
}
