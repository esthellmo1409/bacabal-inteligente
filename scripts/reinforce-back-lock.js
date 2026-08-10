/**
 * Reforça trava do Voltar em todas as páginas ops/admin.
 * Uso: node scripts/reinforce-back-lock.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const VER = 'ops-back-all1';

const OPS_PAGES = [
  'prefeito.html',
  'obras-ops.html',
  'saude.html',
  'iluminacao.html',
  'equipes.html',
  'secretaria.html',
  'acessos.html',
  'admin-sistema.html',
  'whatsapp.html',
  'admin.html',
  'dashboard.html',
  'chamados.html',
  'config.html',
  'relatorios.html',
  'notificacoes.html',
  'ia.html',
  'cadastro.html',
  'modulos.html',
  'extras.html',
  'poste.html',
  'plantao.html',
];

const HEAD_SNIPPET = `  <script>
    window.BI_OPS_LOCK = true;
  </script>
`;

const AFTER_APP_SNIPPET = `  <script>
    window.BI_OPS_LOCK = true;
    if (typeof opsTravarVoltar === 'function') opsTravarVoltar({ force: true });
  </script>
`;

function ensureHeadLock(html) {
  if (/<head[^>]*>[\s\S]*?BI_OPS_LOCK[\s\S]*?<\/head>/i.test(html)) return html;
  return html.replace(/<head([^>]*)>/i, `<head$1>\n${HEAD_SNIPPET}`);
}

function bumpAndArm(html) {
  let s = html;
  // bump qualquer app.js
  if (/src="\/app\.js(\?v=[^"]*)?"/.test(s)) {
    s = s.replace(/src="\/app\.js(\?v=[^"]*)?"/g, `src="/app.js?v=${VER}"`);
  } else {
    // sem app.js — adiciona antes de </body>
    s = s.replace(/<\/body>/i, `  <script src="/app.js?v=${VER}"></script>\n${AFTER_APP_SNIPPET}\n</body>`);
    return s;
  }

  // Remove snippets antigos de armamento logo após app.js (evita duplicar)
  s = s.replace(
    /(<script src="\/app\.js\?v=[^"]+"><\/script>)\s*<script>\s*window\.BI_OPS_LOCK\s*=\s*true;\s*(?:if\s*\(typeof opsTravarVoltar[\s\S]*?<\/script>)?/g,
    `$1\n${AFTER_APP_SNIPPET}`
  );

  if (!s.includes(`opsTravarVoltar({ force: true })`) && !s.includes('opsTravarVoltar({force:true})')) {
    s = s.replace(
      /<script src="\/app\.js\?v=[^"]+"><\/script>/,
      `<script src="/app.js?v=${VER}"></script>\n${AFTER_APP_SNIPPET}`
    );
  }

  return s;
}

// ─── Fortalecer app.js ───
const appPath = path.join(PUB, 'app.js');
let app = fs.readFileSync(appPath, 'utf8');

const NEW_LOCK = `
function logout() {
  _opsBackLock.allowLeave = true;
  opsLiberarVoltar();
  clearAllSessions();
  location.href = cityLink('/login.html');
}

/** Sair da área administrativa — único caminho para sair da página travada. */
function logoutOps(dest) {
  _opsBackLock.allowLeave = true;
  opsLiberarVoltar();
  clearAllSessions();
  location.href = cityLink(dest || '/login.html');
}

/**
 * Trava saída da página (todas as áreas ops/admin).
 * Só libera ao clicar em Sair (logoutOps / logout).
 */
const _opsBackLock = {
  on: false,
  allowLeave: false,
  handler: null,
  clickHandler: null,
  pageShowHandler: null,
  unloadHandler: null,
  pulse: null,
  msg: 'Para sair, clique em Sair no topo',
  patchedHistory: false,
};

function opsLiberarVoltar() {
  _opsBackLock.on = false;
  if (_opsBackLock.handler) {
    window.removeEventListener('popstate', _opsBackLock.handler);
    _opsBackLock.handler = null;
  }
  if (_opsBackLock.clickHandler) {
    document.removeEventListener('click', _opsBackLock.clickHandler, true);
    _opsBackLock.clickHandler = null;
  }
  if (_opsBackLock.pageShowHandler) {
    window.removeEventListener('pageshow', _opsBackLock.pageShowHandler);
    _opsBackLock.pageShowHandler = null;
  }
  if (_opsBackLock.unloadHandler) {
    window.removeEventListener('beforeunload', _opsBackLock.unloadHandler);
    _opsBackLock.unloadHandler = null;
  }
  if (_opsBackLock.pulse) {
    clearInterval(_opsBackLock.pulse);
    _opsBackLock.pulse = null;
  }
}

function opsPushBackLock(n) {
  const times = Math.max(1, n || 1);
  for (let i = 0; i < times; i++) {
    try {
      history.pushState({ biOpsLock: 1, t: Date.now(), i }, '', location.href);
    } catch (_) { /* ok */ }
  }
}

function opsPatchHistoryApi() {
  if (_opsBackLock.patchedHistory) return;
  _opsBackLock.patchedHistory = true;
  const origBack = history.back.bind(history);
  const origGo = history.go.bind(history);
  history.back = function () {
    if (_opsBackLock.on && !_opsBackLock.allowLeave) {
      opsPushBackLock(12);
      if (typeof toast === 'function') toast(_opsBackLock.msg);
      return;
    }
    return origBack();
  };
  history.go = function (delta) {
    if (_opsBackLock.on && !_opsBackLock.allowLeave && typeof delta === 'number' && delta < 0) {
      opsPushBackLock(12);
      if (typeof toast === 'function') toast(_opsBackLock.msg);
      return;
    }
    return origGo(delta);
  };
}

function opsTravarVoltar(opts = {}) {
  if (window.BI_ALLOW_BACK) return;
  if (opts.msg) _opsBackLock.msg = opts.msg;
  _opsBackLock.allowLeave = false;
  opsPatchHistoryApi();

  // Já ativo: reforça (force empurra mais estados)
  if (_opsBackLock.on) {
    opsPushBackLock(opts.force ? 15 : 6);
    return;
  }
  _opsBackLock.on = true;

  // Pilha grossa — Voltar várias vezes ainda fica nesta página
  opsPushBackLock(25);

  _opsBackLock.handler = () => {
    if (!_opsBackLock.on || _opsBackLock.allowLeave) return;
    opsPushBackLock(15);
    if (typeof toast === 'function') toast(_opsBackLock.msg);
  };
  window.addEventListener('popstate', _opsBackLock.handler);

  _opsBackLock.pageShowHandler = (e) => {
    if (!_opsBackLock.on || _opsBackLock.allowLeave) return;
    opsPushBackLock(e && e.persisted ? 15 : 8);
  };
  window.addEventListener('pageshow', _opsBackLock.pageShowHandler);

  // Confirmação nativa ao tentar sair (alguns browsers no Voltar)
  _opsBackLock.unloadHandler = (e) => {
    if (!_opsBackLock.on || _opsBackLock.allowLeave) return;
    e.preventDefault();
    e.returnValue = '';
    return '';
  };
  window.addEventListener('beforeunload', _opsBackLock.unloadHandler);

  // Pulso rápido: mantém o topo do histórico nesta URL
  _opsBackLock.pulse = setInterval(() => {
    if (!_opsBackLock.on || _opsBackLock.allowLeave) return;
    if (!history.state || !history.state.biOpsLock) opsPushBackLock(8);
    else opsPushBackLock(1);
  }, 700);

  _opsBackLock.clickHandler = (e) => {
    if (!_opsBackLock.on || _opsBackLock.allowLeave) return;
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    if (a.classList.contains('nav-logout') || /^\\s*sair\\s*$/i.test((a.textContent || '').trim())) return;
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    let url;
    try { url = new URL(href, location.href); } catch (_) { return; }
    if (url.pathname === location.pathname) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof toast === 'function') toast(_opsBackLock.msg);
  };
  document.addEventListener('click', _opsBackLock.clickHandler, true);
}

/** Só Sair libera a trava — não use para navegar sem logout. */
function opsGoto(href) {
  if (typeof toast === 'function') toast(_opsBackLock.msg || 'Para sair, clique em Sair no topo');
}

// Liga a trava cedo em qualquer página ops
(function opsBackLockBoot() {
  function arm() {
    if (window.BI_ALLOW_BACK) return;
    if (window.BI_OPS_LOCK || window.BI_AUTH_SLOT) opsTravarVoltar({ force: true });
  }
  arm();
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
    else arm();
    window.addEventListener('load', () => arm());
  }
})();
`;

// Substitui bloco do logout até o boot da trava (antes do alarme ops)
const start = app.indexOf('function logout() {');
const endMarker = '/* ── Alarme ops:';
const end = app.indexOf(endMarker);
if (start < 0 || end < 0) {
  console.error('Não achei bloco logout/trava em app.js');
  process.exit(1);
}
app = app.slice(0, start) + NEW_LOCK.trim() + '\n\n' + app.slice(end);
fs.writeFileSync(appPath, app, 'utf8');
console.log('app.js lock reforçado');

for (const name of OPS_PAGES) {
  const fp = path.join(PUB, name);
  if (!fs.existsSync(fp)) {
    console.warn('skip missing', name);
    continue;
  }
  let html = fs.readFileSync(fp, 'utf8');
  html = ensureHeadLock(html);
  html = bumpAndArm(html);
  fs.writeFileSync(fp, html, 'utf8');
  console.log('ok', name);
}

console.log('done', VER);
