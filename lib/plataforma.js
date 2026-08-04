/**
 * CidadeHub / Bacabal Inteligente — núcleo da plataforma modular
 */
const STATUS = [
  { id: 'novo', label: 'Novo', cor: '#2163e8', pendente: true },
  { id: 'em_analise', label: 'Em análise', cor: '#c99700', pendente: true },
  { id: 'encaminhado', label: 'Encaminhado', cor: '#8e44ad', pendente: true },
  { id: 'em_execucao', label: 'Em execução', cor: '#f7c32e', pendente: true },
  { id: 'aguardando_material', label: 'Aguardando material', cor: '#e67e22', pendente: true },
  { id: 'concluido', label: 'Concluído', cor: '#0cbc87', pendente: false },
  { id: 'cancelado', label: 'Cancelado', cor: '#e74c3c', pendente: false },
];

const STATUS_LEGACY = {
  aberto: 'novo',
  em_andamento: 'em_execucao',
};

const PRIORIDADES = [
  { id: 'baixa', label: 'Baixa', peso: 1, slaHoras: 120 },
  { id: 'media', label: 'Média', peso: 2, slaHoras: 72 },
  { id: 'alta', label: 'Alta', peso: 3, slaHoras: 24 },
  { id: 'urgente', label: 'Urgente', peso: 4, slaHoras: 8 },
];

const EIXOS = [
  { id: 'cidade', nome: 'Cidade', desc: 'Obras, limpeza, iluminação, trânsito' },
  { id: 'saude', nome: 'Saúde', desc: 'Hospital, UBS, atendimento, visita surpresa' },
  { id: 'eventos', nome: 'Eventos', desc: 'Agenda, estrutura, segurança, público' },
];

const EIXO_SECRETARIAS = {
  cidade: ['obras', 'iluminacao', 'limpeza', 'meio_ambiente', 'transito', 'defesa_civil', 'ouvidoria'],
  saude: ['saude'],
  eventos: ['eventos'],
};

function eixoDoChamado(c, categorias = []) {
  if (c.eixo) return c.eixo;
  const cat = categorias.find(x => x.id === c.categoria);
  if (cat?.eixo) return cat.eixo;
  for (const [eixo, secs] of Object.entries(EIXO_SECRETARIAS)) {
    if (secs.includes(c.secretaria)) return eixo;
  }
  return 'cidade';
}

const MODULOS = [
  { id: 'dashboard', nome: 'Dashboard', path: '/dashboard.html', grupo: 'core', desc: 'KPIs, mapa e últimos chamados' },
  { id: 'chamados', nome: 'Gestão de Chamados', path: '/chamados.html', grupo: 'core', desc: 'Abrir, editar, status e histórico' },
  { id: 'mapa', nome: 'Mapa Inteligente', path: '/mapa.html', grupo: 'core', desc: 'Filtros, calor e rotas' },
  { id: 'secretarias', nome: 'Secretarias', path: '/secretaria.html', grupo: 'core', desc: 'Painel por secretaria' },
  { id: 'equipes', nome: 'App das Equipes', path: '/equipes.html', grupo: 'core', desc: 'OS, foto antes/depois, GPS' },
  { id: 'cadastro', nome: 'Cadastros', path: '/cadastro.html', grupo: 'gestao', desc: 'Usuários, bairros, frota…' },
  { id: 'prefeito', nome: 'Painel do Prefeito', path: '/prefeito.html', grupo: 'gestao', desc: 'Indicadores e produtividade' },
  { id: 'ia', nome: 'Inteligência Artificial', path: '/ia.html', grupo: 'gestao', desc: 'Foto, duplicidade, PDF, chat' },
  { id: 'transparencia', nome: 'Transparência', path: '/transparencia.html', grupo: 'gestao', desc: 'Obras, gastos e prazos' },
  { id: 'relatorios', nome: 'Relatórios', path: '/relatorios.html', grupo: 'gestao', desc: 'PDF, Excel, CSV, SLA' },
  { id: 'notificacoes', nome: 'Notificações', path: '/notificacoes.html', grupo: 'gestao', desc: 'WhatsApp, SMS, e-mail, push' },
  { id: 'config', nome: 'Configurações', path: '/config.html', grupo: 'admin', desc: 'Brasão, cores, API, LGPD' },
  { id: 'admin', nome: 'Administração', path: '/admin-sistema.html', grupo: 'admin', desc: 'Permissões, logs, auditoria' },
  { id: 'cidadao', nome: 'Portal do Cidadão', path: '/cidadao.html', grupo: 'cidadao', desc: 'Protocolo, histórico, avaliação' },
  { id: 'extras', nome: 'Módulos extras', path: '/extras.html', grupo: 'extras', desc: 'Drones, BI, estoque, Defesa Civil…' },
];

function normalizeStatus(s) {
  if (!s) return 'novo';
  return STATUS_LEGACY[s] || s;
}

function statusMeta(id) {
  const n = normalizeStatus(id);
  return STATUS.find(x => x.id === n) || { id: n, label: n, cor: '#888', pendente: true };
}

function isPendente(status) {
  return !!statusMeta(status).pendente;
}

function normalizeChamado(c) {
  if (!c) return c;
  const status = normalizeStatus(c.status);
  return {
    ...c,
    status,
    prioridade: c.prioridade || 'media',
    anexos: c.anexos || (c.foto ? [{ tipo: 'foto', url: c.foto, em: c.criadoEm }] : []),
    comentarios: c.comentarios || [],
    assinatura: c.assinatura || null,
    avaliacao: c.avaliacao || null,
    equipeId: c.equipeId || null,
    ordemServico: c.ordemServico || null,
    custo: c.custo || 0,
    materiais: c.materiais || [],
    horasTrabalhadas: c.horasTrabalhadas || 0,
    fotoAntes: c.fotoAntes || null,
    fotoDepois: c.fotoDepois || null,
    historico: (c.historico || []).map(h => ({ ...h, status: normalizeStatus(h.status) })),
  };
}

function haversineM(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function detectarDuplicidade(chamados, candidato, raioM = 80) {
  const list = (chamados || []).map(normalizeChamado).filter(c =>
    isPendente(c.status) &&
    c.categoria === candidato.categoria &&
    c.lat != null && candidato.lat != null
  );
  const dups = [];
  for (const c of list) {
    if (candidato.id && c.id === candidato.id) continue;
    const d = haversineM(
      { lat: Number(c.lat), lng: Number(c.lng) },
      { lat: Number(candidato.lat), lng: Number(candidato.lng) }
    );
    if (d <= raioM) dups.push({ ...c, distanciaM: Math.round(d) });
  }
  return dups.sort((a, b) => a.distanciaM - b.distanciaM).slice(0, 5);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function metricsFull(slug, readTenant) {
  const chamados = readTenant(slug, 'chamados.json', []).map(normalizeChamado);
  const obras = readTenant(slug, 'obras.json', []);
  const secretarias = readTenant(slug, 'secretarias.json', []);
  const equipes = readTenant(slug, 'equipes.json', []);
  const hoje = startOfToday();

  const porStatus = {};
  const porSecretaria = {};
  const porBairro = {};
  const porPrioridade = {};
  const porMes = {};
  let resolvidos = 0;
  let tempoTotal = 0;
  let custoTotal = 0;
  let hojeCount = 0;
  let pendentes = 0;
  let emExecucao = 0;
  let concluidos = 0;
  let cancelados = 0;
  let slaEstourado = 0;

  for (const c of chamados) {
    porStatus[c.status] = (porStatus[c.status] || 0) + 1;
    porSecretaria[c.secretaria] = (porSecretaria[c.secretaria] || 0) + 1;
    porBairro[c.bairro] = (porBairro[c.bairro] || 0) + 1;
    porPrioridade[c.prioridade] = (porPrioridade[c.prioridade] || 0) + 1;
    custoTotal += Number(c.custo || 0);

    const mes = (c.criadoEm || '').slice(0, 7);
    if (mes) porMes[mes] = (porMes[mes] || 0) + 1;

    if (new Date(c.criadoEm) >= hoje) hojeCount++;
    if (isPendente(c.status)) pendentes++;
    if (c.status === 'em_execucao') emExecucao++;
    if (c.status === 'concluido') {
      concluidos++;
      resolvidos++;
      const t = new Date(c.atualizadoEm) - new Date(c.criadoEm);
      if (t > 0) tempoTotal += t;
    }
    if (c.status === 'cancelado') cancelados++;

    const pri = PRIORIDADES.find(p => p.id === c.prioridade) || PRIORIDADES[1];
    const horas = (Date.now() - new Date(c.criadoEm)) / 3600000;
    if (isPendente(c.status) && horas > pri.slaHoras) slaEstourado++;
  }

  const rankingEquipes = equipes.map(eq => {
    const meus = chamados.filter(c => c.equipeId === eq.id);
    const ok = meus.filter(c => c.status === 'concluido').length;
    return {
      id: eq.id,
      nome: eq.nome,
      secretaria: eq.secretaria,
      total: meus.length,
      concluidos: ok,
      produtividade: meus.length ? Math.round((ok / meus.length) * 100) : 0,
    };
  }).sort((a, b) => b.concluidos - a.concluidos || b.produtividade - a.produtividade);

  const rankingBairros = Object.entries(porBairro)
    .map(([bairro, total]) => ({ bairro, total }))
    .sort((a, b) => b.total - a.total);

  const diasMedio = resolvidos
    ? Math.round((tempoTotal / resolvidos) / (1000 * 60 * 60 * 24) * 10) / 10
    : 0;

  const ultimos = [...chamados]
    .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
    .slice(0, 12)
    .map(c => ({
      id: c.id, protocolo: c.protocolo, titulo: c.titulo, status: c.status,
      bairro: c.bairro, secretaria: c.secretaria, prioridade: c.prioridade,
      criadoEm: c.criadoEm, lat: c.lat, lng: c.lng,
    }));

  return {
    total: chamados.length,
    hoje: hojeCount,
    pendentes,
    emExecucao,
    concluidos,
    cancelados,
    porStatus,
    porSecretaria,
    porBairro,
    porPrioridade,
    porMes,
    tempoMedioDias: diasMedio,
    taxaResolucao: chamados.length ? Math.round((concluidos / chamados.length) * 100) : 0,
    slaEstourado,
    custoTotal,
    rankingEquipes,
    rankingBairros,
    ultimos,
    statusCatalogo: STATUS,
    prioridades: PRIORIDADES,
    obras: {
      total: obras.length,
      concluidas: obras.filter(o => o.status === 'concluida').length,
      andamento: obras.filter(o => o.status === 'em_andamento').length,
      atrasadas: obras.filter(o => o.status === 'atrasada').length,
      valorTotal: obras.reduce((s, o) => s + Number(o.valor || 0), 0),
    },
    secretarias,
    heatmap: chamados.map(c => ({
      id: c.id, lat: c.lat, lng: c.lng, status: c.status, categoria: c.categoria,
      bairro: c.bairro, secretaria: c.secretaria, prioridade: c.prioridade,
      titulo: c.titulo, protocolo: c.protocolo, criadoEm: c.criadoEm,
    })),
  };
}

function toCSV(rows, headers) {
  const esc = (v) => {
    const s = String(v ?? '');
    if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(';')];
  for (const r of rows) lines.push(headers.map(h => esc(r[h])).join(';'));
  return '\uFEFF' + lines.join('\n');
}

function gerarPDFTexto({ titulo, cidade, linhas }) {
  const body = [
    titulo,
    cidade || '',
    `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
    ''.padEnd(48, '='),
    ...linhas,
    ''.padEnd(48, '='),
    'CidadeHub · documento demonstrativo (texto/PDF)',
  ].join('\n');
  return {
    nome: `${titulo.replace(/\s+/g, '_').toLowerCase()}.txt`,
    mime: 'text/plain; charset=utf-8',
    conteudo: body,
  };
}

function resumirOcorrencias(chamados) {
  const list = (chamados || []).map(normalizeChamado);
  const pend = list.filter(c => isPendente(c.status));
  const topBairro = {};
  const topCat = {};
  for (const c of pend) {
    topBairro[c.bairro] = (topBairro[c.bairro] || 0) + 1;
    topCat[c.titulo || c.categoria] = (topCat[c.titulo || c.categoria] || 0) + 1;
  }
  const b = Object.entries(topBairro).sort((a, b) => b[1] - a[1])[0];
  const t = Object.entries(topCat).sort((a, b) => b[1] - a[1])[0];
  return {
    total: list.length,
    pendentes: pend.length,
    resumo:
      `Há ${pend.length} chamados pendentes de ${list.length} no total. ` +
      (b ? `Bairro crítico: ${b[0]} (${b[1]}). ` : '') +
      (t ? `Tipo mais frequente: ${t[0]} (${t[1]}). ` : '') +
      `Priorize urgentes e itens com SLA estourado.`,
  };
}

const EXTRAS = [
  { id: 'cameras', nome: 'Câmeras da cidade', icon: '📹', status: 'roadmap', desc: 'Integração com CFTV municipal' },
  { id: 'saude_gabinete', nome: 'Saúde no Gabinete', icon: '🏥', status: 'demo', desc: 'Hospital, UBS, visita surpresa' },
  { id: 'eventos_cidade', nome: 'Eventos da cidade', icon: '🎪', status: 'demo', desc: 'Agenda, estrutura e segurança' },
  { id: 'drones', nome: 'Fiscalização com drones', icon: '🚁', status: 'roadmap', desc: 'Missões aéreas e laudos' },
  { id: 'ia_imagens', nome: 'IA análise de imagens', icon: '🤖', status: 'demo', desc: 'Classificação por foto (ativo)' },
  { id: 'mapa3d', nome: 'Mapa 3D da cidade', icon: '🗺️', status: 'roadmap', desc: 'Visualização 3D urbana' },
  { id: 'rastreamento', nome: 'Rastreamento de equipes', icon: '🚛', status: 'demo', desc: 'Posição em tempo real (demo)' },
  { id: 'bi', nome: 'Business Intelligence', icon: '📊', status: 'demo', desc: 'Indicadores e evolução mensal' },
  { id: 'whatsapp_bot', nome: 'Chatbot WhatsApp', icon: '📱', status: 'demo', desc: 'Atendimento via wa.me' },
  { id: 'assinatura', nome: 'Assinatura eletrônica', icon: '📄', status: 'demo', desc: 'Assinatura no protocolo' },
  { id: 'portal_transp', nome: 'Portal da transparência', icon: '🏛️', status: 'demo', desc: 'Obras e gastos públicos' },
  { id: 'estoque', nome: 'Estoque de materiais', icon: '📦', status: 'demo', desc: 'Controle por secretaria' },
  { id: 'custos', nome: 'Custos por serviço', icon: '💰', status: 'demo', desc: 'Custo e produtividade' },
  { id: 'alertas', nome: 'Alertas automáticos', icon: '🔔', status: 'demo', desc: 'Atraso e conclusão' },
  { id: 'defesa_civil', nome: 'Defesa Civil', icon: '🌧️', status: 'demo', desc: 'Alagamentos e riscos' },
  { id: 'transito', nome: 'Gestão de trânsito', icon: '🚦', status: 'demo', desc: 'Sinalização e fluxos' },
  { id: 'iluminacao', nome: 'Iluminação pública', icon: '💡', status: 'demo', desc: 'Postes e QR' },
  { id: 'arborizacao', nome: 'Arborização', icon: '🌳', status: 'demo', desc: 'Poda e árvores' },
  { id: 'lixo', nome: 'Coleta de lixo', icon: '🚮', status: 'demo', desc: 'Limpeza urbana' },
];

module.exports = {
  STATUS,
  STATUS_LEGACY,
  PRIORIDADES,
  MODULOS,
  EXTRAS,
  EIXOS,
  EIXO_SECRETARIAS,
  eixoDoChamado,
  normalizeStatus,
  statusMeta,
  isPendente,
  normalizeChamado,
  detectarDuplicidade,
  metricsFull,
  toCSV,
  gerarPDFTexto,
  resumirOcorrencias,
  haversineM,
};
