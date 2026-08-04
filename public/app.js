const CIDADE_PADRAO = 'bacabal';

function getCidade() {
  const params = new URLSearchParams(location.search);
  const slug = params.get('cidade') || localStorage.getItem('ch_cidade') || CIDADE_PADRAO;
  if (!localStorage.getItem('ch_cidade')) localStorage.setItem('ch_cidade', slug);
  return slug;
}

function setCidade(slug) {
  localStorage.setItem('ch_cidade', slug || CIDADE_PADRAO);
}

function withCidade(path) {
  const slug = getCidade();
  if (!slug) return path;
  const sep = path.includes('?') ? '&' : '?';
  return path + sep + 'cidade=' + encodeURIComponent(slug);
}

function cityLink(href) {
  const slug = getCidade();
  if (!slug) return href;
  if (href.includes('?')) return href + '&cidade=' + encodeURIComponent(slug);
  return href + '?cidade=' + encodeURIComponent(slug);
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const token = localStorage.getItem('bi_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  const slug = getCidade();
  if (slug) headers['X-Cidade'] = slug;

  const url = path.startsWith('/api/') ? withCidade(path) : path;
  const res = await fetch(url, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function statusLabel(s) {
  return ({
    novo: 'Novo',
    aberto: 'Novo',
    em_analise: 'Em análise',
    encaminhado: 'Encaminhado',
    em_execucao: 'Em execução',
    em_andamento: 'Em execução',
    aguardando_material: 'Aguardando material',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
  })[s] || s;
}

function badge(status) {
  const s = ({ aberto: 'novo', em_andamento: 'em_execucao' })[status] || status;
  return `<span class="badge badge-${s}">${statusLabel(status)}</span>`;
}

function prioridadeLabel(p) {
  return ({ baixa: 'Baixa', media: 'Média', alta: 'Alta' })[p] || p || 'Média';
}

function timelineHtml(historico) {
  if (!historico?.length) return '<p class="muted">Sem histórico.</p>';
  return `<div class="timeline">${historico.map(h => `
    <div class="timeline-item">
      <div class="timeline-dot badge-${h.status || 'aberto'}"></div>
      <div>
        <strong>${statusLabel(h.status)}</strong>
        <div class="meta">${fmtDate(h.em)}${h.por ? ' · ' + h.por : ''}</div>
        <div class="muted">${h.nota || ''}</div>
      </div>
    </div>
  `).join('')}</div>`;
}

function saveMeuProtocolo(protocolo) {
  const key = 'bi_protocolos_' + getCidade();
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  if (!list.includes(protocolo)) list.unshift(protocolo);
  localStorage.setItem(key, JSON.stringify(list.slice(0, 12)));
}

function meusProtocolos() {
  return JSON.parse(localStorage.getItem('bi_protocolos_' + getCidade()) || '[]');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado: ' + text);
  } catch {
    toast(text);
  }
}

function money(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function applyTheme(tema) {
  if (!tema) return;
  const root = document.documentElement;
  if (tema.primaria) {
    root.style.setProperty('--brand', tema.primaria);
    root.style.setProperty('--royal-mid', tema.primaria);
  }
  if (tema.secundaria) {
    root.style.setProperty('--brand-dim', tema.secundaria);
    root.style.setProperty('--royal', tema.secundaria);
  }
}

async function loadCityBrand() {
  const slug = getCidade();
  if (!slug) return null;
  try {
    const cfg = await api('/api/config');
    applyTheme(cfg.tema);
    return cfg;
  } catch {
    return null;
  }
}

function requireCidade() {
  setCidade(getCidade() || CIDADE_PADRAO);
  return true;
}

function topbar(active, cfg) {
  const nome = cfg?.produto || 'Bacabal Inteligente';
  const sub = `${cfg?.cidade || 'Bacabal'} · ${cfg?.uf || 'MA'}`;

  const links = [
    ['/', 'Início'],
    [cityLink('/demo.html'), 'Demo'],
    [cityLink('/modulos.html'), 'Módulos'],
    [cityLink('/dashboard.html'), 'Dashboard'],
    [cityLink('/chamados.html'), 'Chamados'],
    [cityLink('/cidadao.html'), 'Cidadão'],
    [cityLink('/secretaria.html'), 'Secretarias'],
    [cityLink('/prefeito.html'), 'Gabinete'],
    [cityLink('/login.html'), 'Login'],
  ];

  return `
  <div class="topbar">
    <a class="brand" href="/">
      <div class="brand-mark"><img src="/assets/logo-prefeitura.png" alt="Brasão de Bacabal" /></div>
      <div>
        <strong>${nome}</strong>
        <span>${sub}</span>
      </div>
    </a>
    <nav class="nav">
      ${links.map(([href, label]) =>
        `<a href="${href}" class="${active === label ? 'active' : ''}">${label}</a>`
      ).join('')}
    </nav>
  </div>`;
}

function downloadText(nome, conteudo, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([conteudo], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}

function statusOptions(selected) {
  const all = [
    ['novo', 'Novo'],
    ['em_analise', 'Em análise'],
    ['encaminhado', 'Encaminhado'],
    ['em_execucao', 'Em execução'],
    ['aguardando_material', 'Aguardando material'],
    ['concluido', 'Concluído'],
    ['cancelado', 'Cancelado'],
  ];
  return all.map(([v, l]) =>
    `<option value="${v}" ${selected === v ? 'selected' : ''}>${l}</option>`
  ).join('');
}
