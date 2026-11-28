// Loads the compiled game rules (js/data.js + js/engine.js + js/profile.js + js/share.js + js/worldboss.js + js/chat.js) into a fresh Node sandbox.
// The engine calls a few UI hooks (toast, onLeak, onVictory, ...); they are stubbed here and recorded in E.log.
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function fakeStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  };
}

/**
 * Returns a proxy: E.name evaluates `name` inside the sandbox, so E.game, E.TD, E.placeTower(...) all work.
 * Pass { storage: false } to simulate blocked localStorage, or { storageObj } to share storage between sandboxes.
 */
function loadEngine(opts = {}) {
  const log = [];
  const ctx = { btoa, atob, escape, unescape,
    console, log,
    Sound: { play() {} },
    toast: (msg, kind) => log.push({ ev: 'toast', msg, kind }),
    onLeak: n => log.push({ ev: 'leak', n }),
    onBoss: () => log.push({ ev: 'boss' }),
    onLevelUp: (lv, before) => log.push({ ev: 'level', lv, before }),
    onTowerLevel: (type, lv) => log.push({ ev: 'towerlevel', type, lv }),
    onVictory: () => log.push({ ev: 'victory' }),
  };
  if (opts.storage !== false) ctx.localStorage = opts.storageObj || fakeStorage();
  Object.assign(ctx, { setTimeout: () => 0, clearTimeout: () => {}, URL });
  vm.createContext(ctx);
  const code = ['data.js', 'heroes.js', 'engine.js', 'profile.js', 'share.js', 'worldboss.js', 'chat.js'].map(f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n;\n')
    // same behaviour as ui.js onGameOver, minus the DOM
    + '\n;function onGameOver() { if (game.wb) { wbEnd(false); return; } game.over = true; game.inRound = false; saveRecord(); submitRun(); clearRun(); log.push({ ev: "gameover" }); }';
  vm.runInContext(code, ctx, { filename: 'engine-bundle.js' });
  const run = expr => vm.runInContext(expr, ctx);
  return new Proxy({ run, ctx, log }, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key !== 'string' || key === 'then') return undefined; // 'then': so E can be returned from async functions
      return run(key);
    },
  });
}

module.exports = { loadEngine, fakeStorage };
