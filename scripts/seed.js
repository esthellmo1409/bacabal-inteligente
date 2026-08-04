// Seed multi-tenant — CidadeHub (plataforma) + municípios demo
const fs = require('fs');
const path = require('path');

// Respeita DATA_DIR (volume Railway em /data); fallback = ./data do projeto
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const TENANTS_DIR = path.join(DATA_DIR, 'tenants');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

const DEFAULT_CATEGORIAS = [
  // Obras
  { id: 'buraco', label: 'Tapa-buraco', secretaria: 'obras', icon: '🕳️' },
  { id: 'pavimentacao', label: 'Pavimentação', secretaria: 'obras', icon: '🛣️' },
  { id: 'meio_fio', label: 'Meio-fio', secretaria: 'obras', icon: '🧱' },
  { id: 'galerias', label: 'Galerias / drenagem', secretaria: 'obras', icon: '🕳️' },
  { id: 'calcada', label: 'Calçada danificada', secretaria: 'obras', icon: '🧱' },
  // Iluminação
  { id: 'poste_apagado', label: 'Poste apagado', secretaria: 'iluminacao', icon: '💡' },
  { id: 'lampada', label: 'Troca de lâmpada', secretaria: 'iluminacao', icon: '💡' },
  { id: 'curto_circuito', label: 'Curto circuito', secretaria: 'iluminacao', icon: '⚡' },
  // Meio ambiente / limpeza
  { id: 'poda', label: 'Poda', secretaria: 'meio_ambiente', icon: '🌳' },
  { id: 'arvore_caida', label: 'Árvore caída', secretaria: 'meio_ambiente', icon: '🌳' },
  { id: 'limpeza_verde', label: 'Limpeza de área verde', secretaria: 'meio_ambiente', icon: '🌿' },
  { id: 'lixo', label: 'Lixo / Entulho', secretaria: 'limpeza', icon: '🗑️' },
  // Trânsito / Defesa / Ouvidoria
  { id: 'sinalizacao', label: 'Sinalização', secretaria: 'transito', icon: '🚦' },
  { id: 'esgoto', label: 'Esgoto / Alagamento', secretaria: 'defesa_civil', icon: '💧' },
  { id: 'outros', label: 'Outros', secretaria: 'ouvidoria', icon: '📋' },
];

const DEFAULT_SECRETARIAS = [
  { id: 'obras', nome: 'Secretaria de Obras', cor: '#e67e22', categorias: ['buraco', 'pavimentacao', 'meio_fio', 'galerias', 'calcada'] },
  { id: 'iluminacao', nome: 'Iluminação Pública', cor: '#f1c40f', categorias: ['poste_apagado', 'lampada', 'curto_circuito'] },
  { id: 'limpeza', nome: 'Limpeza Urbana', cor: '#27ae60', categorias: ['lixo'] },
  { id: 'meio_ambiente', nome: 'Meio Ambiente', cor: '#16a085', categorias: ['poda', 'arvore_caida', 'limpeza_verde'] },
  { id: 'transito', nome: 'Trânsito', cor: '#2980b9', categorias: ['sinalizacao'] },
  { id: 'defesa_civil', nome: 'Defesa Civil', cor: '#c0392b', categorias: ['esgoto'] },
  { id: 'ouvidoria', nome: 'Ouvidoria', cor: '#8e44ad', categorias: ['outros'] },
];

const DEFAULT_PRIORIDADES = [
  { id: 'baixa', label: 'Baixa', peso: 1, slaHoras: 120 },
  { id: 'media', label: 'Média', peso: 2, slaHoras: 72 },
  { id: 'alta', label: 'Alta', peso: 3, slaHoras: 24 },
  { id: 'urgente', label: 'Urgente', peso: 4, slaHoras: 8 },
];

function rand(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function slugify(text) {
  return String(text)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

function gerarChamados(cfg, categorias, bairros, prefix, count, equipes) {
  const statuses = ['novo', 'em_analise', 'encaminhado', 'em_execucao', 'aguardando_material', 'concluido', 'cancelado'];
  const weights = [0.18, 0.14, 0.12, 0.18, 0.08, 0.25, 0.05];
  const chamados = [];
  for (let i = 1; i <= count; i++) {
    const cat = pick(categorias);
    const roll = Math.random();
    let acc = 0;
    let status = 'novo';
    for (let s = 0; s < statuses.length; s++) {
      acc += weights[s];
      if (roll < acc) { status = statuses[s]; break; }
    }

    const created = daysAgo(Math.floor(rand(0, 45)));
    const updated = status === 'novo' ? created : daysAgo(Math.floor(rand(0, 10)));
    const n = 1000 + i;
    const eq = equipes.length ? pick(equipes.filter(e => e.secretaria === cat.secretaria).concat(equipes[0])) : null;

    chamados.push({
      id: `${prefix}-${n}`,
      protocolo: `${new Date().getFullYear()}${n}`,
      categoria: cat.id,
      secretaria: cat.secretaria,
      titulo: cat.label,
      descricao: `Solicitação de ${cat.label.toLowerCase()} registrada pelo cidadão.`,
      bairro: pick(bairros),
      endereco: `Rua Exemplo, ${Math.floor(rand(10, 900))}`,
      rua: `Rua Exemplo`,
      lat: cfg.lat + rand(-0.04, 0.04),
      lng: cfg.lng + rand(-0.04, 0.04),
      status,
      prioridade: pick(['baixa', 'media', 'alta', 'urgente']),
      cidadao: {
        nome: pick(['Maria Silva', 'João Santos', 'Ana Costa', 'Pedro Lima', 'Lucia Ferreira']),
        telefone: '(99) 9' + String(Math.floor(rand(1000, 9999))) + '-' + String(Math.floor(rand(1000, 9999))),
        email: '',
      },
      foto: null,
      fotoAntes: null,
      fotoDepois: null,
      anexos: [],
      comentarios: [],
      assinatura: null,
      avaliacao: status === 'concluido' && Math.random() > 0.6 ? {
        nota: pick([3, 4, 5]),
        comentario: 'Atendimento ok',
        em: updated,
      } : null,
      equipeId: eq?.id || null,
      ordemServico: eq ? {
        status: status === 'concluido' ? 'encerrada' : (status === 'em_execucao' ? 'aceita' : 'aberta'),
        aceitaEm: status === 'em_execucao' || status === 'concluido' ? updated : null,
      } : null,
      custo: status === 'concluido' ? Math.floor(rand(80, 2500)) : 0,
      materiais: [],
      horasTrabalhadas: status === 'concluido' ? Math.round(rand(1, 8) * 10) / 10 : 0,
      posteId: null,
      historico: [
        { em: created, status: 'novo', nota: 'Chamado aberto pelo cidadão' },
        ...(status !== 'novo' ? [{ em: updated, status, nota: `Atualizado para ${status}`, por: 'Sistema' }] : []),
      ],
      criadoEm: created,
      atualizadoEm: updated,
    });
  }
  return chamados;
}

function criarCadastros(m, secretarias) {
  const equipes = [
    { id: 'EQ-OBR-01', nome: 'Equipe Tapa-buraco 01', secretaria: 'obras', lider: 'Carlos Mendes', membros: 4, ativo: true },
    { id: 'EQ-OBR-02', nome: 'Equipe Pavimentação', secretaria: 'obras', lider: 'Roberto Alves', membros: 6, ativo: true },
    { id: 'EQ-ILU-01', nome: 'Equipe Iluminação Norte', secretaria: 'iluminacao', lider: 'Paulo Souza', membros: 3, ativo: true },
    { id: 'EQ-LIM-01', nome: 'Equipe Limpeza Centro', secretaria: 'limpeza', lider: 'Fernanda Dias', membros: 5, ativo: true },
    { id: 'EQ-AMB-01', nome: 'Equipe Arborização', secretaria: 'meio_ambiente', lider: 'Juliana Rocha', membros: 3, ativo: true },
  ];

  const veiculos = [
    { id: 'VEI-01', placa: 'BAC1A23', tipo: 'Caminhão', secretaria: 'obras', equipeId: 'EQ-OBR-01', status: 'disponivel' },
    { id: 'VEI-02', placa: 'BAC2B45', tipo: 'Cesta aérea', secretaria: 'iluminacao', equipeId: 'EQ-ILU-01', status: 'em_uso' },
    { id: 'VEI-03', placa: 'BAC3C67', tipo: 'Compactador', secretaria: 'limpeza', equipeId: 'EQ-LIM-01', status: 'disponivel' },
  ];

  const equipamentos = [
    { id: 'EQP-01', nome: 'Roçadeira', secretaria: 'meio_ambiente', status: 'ok' },
    { id: 'EQP-02', nome: 'Gerador portátil', secretaria: 'iluminacao', status: 'ok' },
    { id: 'EQP-03', nome: 'Placa vibratória', secretaria: 'obras', status: 'manutencao' },
  ];

  const materiais = [
    { id: 'MAT-01', nome: 'Asfalto frio (kg)', estoque: 1200, minimo: 300, secretaria: 'obras', custoUnitario: 4.5 },
    { id: 'MAT-02', nome: 'Lâmpada LED 100W', estoque: 85, minimo: 40, secretaria: 'iluminacao', custoUnitario: 68 },
    { id: 'MAT-03', nome: 'Saco de lixo 200L', estoque: 400, minimo: 100, secretaria: 'limpeza', custoUnitario: 1.2 },
  ];

  const ruas = (m.bairros || []).flatMap((b, i) => [
    { id: `RUA-${i + 1}A`, nome: `Av. Principal — ${b}`, bairro: b },
    { id: `RUA-${i + 1}B`, nome: `Rua das Flores — ${b}`, bairro: b },
  ]);

  const bairros = (m.bairros || []).map((nome, i) => ({
    id: `BR-${String(i + 1).padStart(2, '0')}`,
    nome,
    populacaoEstimada: Math.floor(rand(2000, 18000)),
  }));

  const perfis = [
    { id: 'admin', nome: 'Administrador', permissoes: ['*'] },
    { id: 'prefeito', nome: 'Gabinete', permissoes: ['dashboard', 'relatorios', 'transparencia', 'chamados.ler'] },
    { id: 'secretaria', nome: 'Secretaria', permissoes: ['chamados', 'equipes', 'mapa', 'ia'] },
    { id: 'campo', nome: 'Equipe de campo', permissoes: ['equipes', 'chamados.atualizar'] },
    { id: 'cidadao', nome: 'Cidadão', permissoes: ['cidadao'] },
  ];

  return { equipes, veiculos, equipamentos, materiais, ruas, bairros, perfis };
}

function criarTenant(m) {
  const dir = path.join(TENANTS_DIR, m.slug);
  ensureDir(dir);

  const config = {
    slug: m.slug,
    cidade: m.nome,
    uf: m.uf,
    produto: m.produto || `${m.nome} Conecta`,
    versao: '3.0.0',
    lat: m.lat,
    lng: m.lng,
    zoom: 13,
    tema: m.tema,
    logo: m.logo || null,
    brasao: m.logo || '/brasao.svg',
    bairros: m.bairros,
    horarioFuncionamento: 'Seg–Sex 08:00–17:00',
    lgpd: {
      baseLegal: 'Execução de políticas públicas',
      retencaoDias: 1825,
      dpo: 'dpo@prefeitura.local',
    },
    api: { versao: 'v1', webhookUrl: '' },
    backup: { automatico: true, hora: '02:00' },
    modulosAtivos: [
      'dashboard', 'chamados', 'mapa', 'secretarias', 'equipes', 'cadastro',
      'prefeito', 'ia', 'transparencia', 'relatorios', 'notificacoes', 'config',
      'admin', 'cidadao', 'extras',
    ],
  };

  const secretarias = JSON.parse(JSON.stringify(DEFAULT_SECRETARIAS));
  const categorias = JSON.parse(JSON.stringify(DEFAULT_CATEGORIAS));
  const prefix = m.slug.slice(0, 3).toUpperCase();
  const cad = criarCadastros(m, secretarias);

  const usuarios = [
    { id: 'admin', nome: 'Administrador Municipal', senha: 'admin123', papel: 'admin', secretaria: null, perfil: 'admin' },
    { id: 'prefeito', nome: 'Gabinete do Prefeito', senha: 'prefeito123', papel: 'prefeito', secretaria: null, perfil: 'prefeito' },
    { id: 'obras', nome: 'Equipe Obras', senha: 'obras123', papel: 'secretaria', secretaria: 'obras', perfil: 'secretaria' },
    { id: 'iluminacao', nome: 'Equipe Iluminação', senha: 'luz123', papel: 'secretaria', secretaria: 'iluminacao', perfil: 'secretaria' },
    { id: 'limpeza', nome: 'Equipe Limpeza', senha: 'limpo123', papel: 'secretaria', secretaria: 'limpeza', perfil: 'secretaria' },
    { id: 'campo', nome: 'Operador de Campo', senha: 'campo123', papel: 'campo', secretaria: 'obras', perfil: 'campo', equipeId: 'EQ-OBR-01' },
  ];

  const obras = (m.obras || []).map((o, i) => ({
    id: `OBR-${String(i + 1).padStart(3, '0')}`,
    ...o,
    lat: o.lat ?? m.lat + rand(-0.02, 0.02),
    lng: o.lng ?? m.lng + rand(-0.02, 0.02),
    fotos: [],
    downloads: [],
    empresa: o.empresa,
    gastoExecutado: Math.round((o.valor || 0) * ((o.percentual || 0) / 100)),
  }));

  const chamados = gerarChamados(config, categorias, m.bairros, prefix, m.seedChamados || 24, cad.equipes);

  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config, null, 2));
  fs.writeFileSync(path.join(dir, 'secretarias.json'), JSON.stringify(secretarias, null, 2));
  fs.writeFileSync(path.join(dir, 'categorias.json'), JSON.stringify(categorias, null, 2));
  fs.writeFileSync(path.join(dir, 'usuarios.json'), JSON.stringify(usuarios, null, 2));
  fs.writeFileSync(path.join(dir, 'chamados.json'), JSON.stringify(chamados, null, 2));
  fs.writeFileSync(path.join(dir, 'obras.json'), JSON.stringify(obras, null, 2));
  fs.writeFileSync(path.join(dir, 'equipes.json'), JSON.stringify(cad.equipes, null, 2));
  fs.writeFileSync(path.join(dir, 'veiculos.json'), JSON.stringify(cad.veiculos, null, 2));
  fs.writeFileSync(path.join(dir, 'equipamentos.json'), JSON.stringify(cad.equipamentos, null, 2));
  fs.writeFileSync(path.join(dir, 'materiais.json'), JSON.stringify(cad.materiais, null, 2));
  fs.writeFileSync(path.join(dir, 'ruas.json'), JSON.stringify(cad.ruas, null, 2));
  fs.writeFileSync(path.join(dir, 'bairros.json'), JSON.stringify(cad.bairros, null, 2));
  fs.writeFileSync(path.join(dir, 'prioridades.json'), JSON.stringify(DEFAULT_PRIORIDADES, null, 2));
  fs.writeFileSync(path.join(dir, 'perfis.json'), JSON.stringify(cad.perfis, null, 2));
  fs.writeFileSync(path.join(dir, 'notificacoes.json'), JSON.stringify([], null, 2));
  fs.writeFileSync(path.join(dir, 'logs.json'), JSON.stringify([{
    em: new Date().toISOString(),
    acao: 'seed',
    detalhe: 'Tenant criado',
    por: 'sistema',
  }], null, 2));
  fs.writeFileSync(path.join(dir, 'rastreamento.json'), JSON.stringify(
    cad.equipes.map(e => ({
      equipeId: e.id,
      lat: m.lat + rand(-0.02, 0.02),
      lng: m.lng + rand(-0.02, 0.02),
      atualizadoEm: new Date().toISOString(),
    })),
    null, 2
  ));

  return m.slug;
}

function runSeed() {
  ensureDir(DATA_DIR);
  ensureDir(TENANTS_DIR);

  const municipios = [
    {
      slug: 'bacabal',
      nome: 'Bacabal',
      uf: 'MA',
      produto: 'Bacabal Conecta',
      lat: -4.2917,
      lng: -44.7917,
      tema: { primaria: '#FF8000', secundaria: '#398A21', fundo: '#f7f8f9' },
      logo: '/assets/logo-prefeitura.png',
      bairros: ['Centro', 'Bacabalzinho', 'Areal', 'Mutirão', 'São José', 'Vila Nova', 'Planalto', 'Povoado Alto Alegre', 'São Francisco', 'Pedreiras', 'Conjunto Habitacional', 'Alto do Bode'],
      seedChamados: 48,
      obras: [
        { nome: 'Pavimentação Av. Getúlio Vargas', status: 'em_andamento', percentual: 62, valor: 1850000, empresa: 'Construtora Maranhão Ltda', prazo: '2026-11-30', bairro: 'Centro' },
        { nome: 'Reforma da Praça da Matriz', status: 'concluida', percentual: 100, valor: 420000, empresa: 'Obras & Cia', prazo: '2026-06-15', bairro: 'Centro' },
        { nome: 'Drenagem Bairro Mutirão', status: 'atrasada', percentual: 35, valor: 980000, empresa: 'InfraMA Engenharia', prazo: '2026-07-01', bairro: 'Mutirão' },
        { nome: 'Iluminação LED — São José', status: 'em_andamento', percentual: 48, valor: 310000, empresa: 'Luz Urbana SA', prazo: '2026-10-20', bairro: 'São José' },
      ],
      ativo: true,
      criadoEm: new Date().toISOString(),
    },
    {
      slug: 'imperatriz',
      nome: 'Imperatriz',
      uf: 'MA',
      produto: 'Imperatriz Conecta',
      lat: -5.5265,
      lng: -47.4917,
      tema: { primaria: '#5bb8e8', secundaria: '#1a6f9a', fundo: '#0a1620' },
      logo: null,
      bairros: ['Centro', 'Bacuri', 'Nova Imperatriz', 'Parque Sanharó', 'Beira Rio', 'Bom Sucesso'],
      seedChamados: 20,
      obras: [
        { nome: 'Revitalização Orla', status: 'em_andamento', percentual: 40, valor: 3200000, empresa: 'Tocantins Construções', prazo: '2027-03-01', bairro: 'Beira Rio' },
        { nome: 'UBS Parque Sanharó', status: 'concluida', percentual: 100, valor: 890000, empresa: 'Saúde Obra Ltda', prazo: '2026-05-10', bairro: 'Parque Sanharó' },
      ],
      ativo: true,
      criadoEm: new Date().toISOString(),
    },
  ];

  municipios.forEach(criarTenant);

  fs.writeFileSync(path.join(DATA_DIR, 'municipios.json'), JSON.stringify(
    municipios.map(({ seedChamados, obras, ...pub }) => pub),
    null, 2
  ));

  fs.writeFileSync(path.join(DATA_DIR, 'platform.json'), JSON.stringify({
    produto: 'CidadeHub',
    tagline: 'Cidade inteligente modular para qualquer prefeitura',
    versao: '3.0.0',
    usuarios: [
      { id: 'super', nome: 'Super Admin', senha: 'super123', papel: 'platform' },
    ],
  }, null, 2));

  console.log('Seed OK — tenants:', municipios.map(m => m.slug).join(', '));
}

module.exports = {
  runSeed, slugify, criarTenant,
  DEFAULT_CATEGORIAS, DEFAULT_SECRETARIAS, DEFAULT_PRIORIDADES,
};

if (require.main === module) runSeed();
