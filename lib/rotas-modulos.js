/**
 * Rotas dos módulos 1–15 + extras
 * Retorna true se tratou a requisição.
 */
const {
  STATUS,
  PRIORIDADES,
  MODULOS,
  EXTRAS,
  EIXOS,
  eixoDoChamado,
  normalizeStatus,
  normalizeChamado,
  isPendente,
  detectarDuplicidade,
  metricsFull,
  toCSV,
  gerarPDFTexto,
  resumirOcorrencias,
  statusMeta,
} = require('./plataforma');

function pushLog(ctx, slug, acao, detalhe) {
  const logs = ctx.readTenant(slug, 'logs.json', []);
  logs.unshift({
    em: new Date().toISOString(),
    acao,
    detalhe,
    por: ctx.currentUser(ctx.req)?.nome || 'anon',
  });
  ctx.writeTenant(slug, 'logs.json', logs.slice(0, 500));
}

function pushNotif(ctx, slug, n) {
  const list = ctx.readTenant(slug, 'notificacoes.json', []);
  list.unshift({
    id: 'N-' + Date.now(),
    em: new Date().toISOString(),
    lida: false,
    ...n,
  });
  ctx.writeTenant(slug, 'notificacoes.json', list.slice(0, 300));
}

function requireStaff(ctx, res, papeis = ['admin', 'prefeito', 'secretaria', 'campo']) {
  const u = ctx.currentUser(ctx.req);
  if (!u || !papeis.includes(u.papel)) {
    const precisa = papeis.includes('secretaria') && !papeis.includes('campo')
      ? 'Não autorizado — entre como secretaria (obras / obras123). Login de campo não aprova.'
      : 'Não autorizado';
    ctx.sendJSON(res, 401, { error: !u ? 'Não autorizado — faça login de novo' : precisa });
    return null;
  }
  return u;
}

function crudList(ctx, slug, file, fallback = []) {
  return ctx.readTenant(slug, file, fallback);
}

function crudSave(ctx, slug, file, data) {
  ctx.writeTenant(slug, file, data);
}

async function handleModulos(ctx) {
  const { req, res, pathname, url, sendJSON, readBody, requireTenant, readTenant, writeTenant, currentUser } = ctx;

  if (pathname === '/api/modulos' && req.method === 'GET') {
    return sendJSON(res, 200, { modulos: MODULOS, extras: EXTRAS, status: STATUS, prioridades: PRIORIDADES });
  }

  // Prepara cenário vivo para pitch de 5 minutos
  if (pathname === '/api/demo/preparar' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const cfg = readTenant(slug, 'config.json', {});
    const cats = readTenant(slug, 'categorias.json', []);
    const equipes = readTenant(slug, 'equipes.json', []);
    const chamados = readTenant(slug, 'chamados.json', []);
    const now = new Date().toISOString();
    const year = new Date().getFullYear();
    const prefix = slug.slice(0, 3).toUpperCase();

    const cenarios = [
      {
        categoria: 'buraco',
        bairro: 'Centro',
        descricao: 'Buraco grande na Av. Getúlio Vargas, em frente ao nº 210 — risco para motos.',
        prioridade: 'alta',
        lat: (cfg.lat || -4.2917) + 0.004,
        lng: (cfg.lng || -44.7917) - 0.003,
      },
      {
        categoria: 'lampada',
        bairro: 'São José',
        descricao: 'Poste apagado há 3 noites na Rua das Flores — pedestres sem iluminação.',
        prioridade: 'urgente',
        lat: (cfg.lat || -4.2917) - 0.006,
        lng: (cfg.lng || -44.7917) + 0.005,
      },
      {
        categoria: 'lixo',
        bairro: 'Mutirão',
        descricao: 'Entulho acumulado na esquina — solicitação de remoção.',
        prioridade: 'media',
        lat: (cfg.lat || -4.2917) + 0.008,
        lng: (cfg.lng || -44.7917) + 0.002,
      },
    ];

    const criados = [];
    for (const s of cenarios) {
      const cat = cats.find(c => c.id === s.categoria) || cats[0];
      if (!cat) continue;
      const n = 1000 + chamados.length + criados.length + 1;
      const eq = equipes.find(e => e.secretaria === cat.secretaria) || equipes[0];
      const c = normalizeChamado({
        id: `${prefix}-${n}`,
        protocolo: `${year}${n}`,
        categoria: cat.id,
        secretaria: cat.secretaria,
        titulo: cat.label,
        descricao: s.descricao,
        bairro: s.bairro,
        endereco: s.bairro + ' — ponto de demonstração',
        lat: s.lat,
        lng: s.lng,
        status: 'novo',
        prioridade: s.prioridade,
        cidadao: { nome: 'Cidadão Demo', telefone: '(99) 98100-0000', email: '' },
        foto: null,
        anexos: [],
        equipeId: eq?.id || null,
        historico: [{ em: now, status: 'novo', nota: 'Chamado de demonstração (pitch)' }],
        criadoEm: now,
        atualizadoEm: now,
        demo: true,
      });
      chamados.push(c);
      criados.push(c);
    }
    writeTenant(slug, 'chamados.json', chamados);
    pushLog(ctx, slug, 'demo.preparar', `${criados.length} chamados de pitch`);
    return sendJSON(res, 201, {
      ok: true,
      criados: criados.map(c => ({
        id: c.id,
        protocolo: c.protocolo,
        titulo: c.titulo,
        secretaria: c.secretaria,
        bairro: c.bairro,
      })),
      roteiro: {
        cidadao: `/cidadao.html?cidade=${slug}&protocolo=${criados[0]?.protocolo || ''}`,
        secretaria: `/secretaria.html?cidade=${slug}`,
        gabinete: `/prefeito.html?cidade=${slug}`,
        mapa: `/mapa.html?cidade=${slug}`,
        loginObras: { usuario: 'obras', senha: 'obras123' },
      },
    });
  }

  if (pathname === '/api/metricas' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    return sendJSON(res, 200, metricsFull(slug, readTenant));
  }

  if (pathname === '/api/dashboard' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    return sendJSON(res, 200, metricsFull(slug, readTenant));
  }

  // Decisões do Gabinete / Prefeito
  if (pathname === '/api/gabinete/fila' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const eixo = url.searchParams.get('eixo') || 'cidade';
    const list = readTenant(slug, 'chamados.json', []).map(normalizeChamado);
    const categorias = readTenant(slug, 'categorias.json', []);
    const secretarias = readTenant(slug, 'secretarias.json', []);
    const nomes = Object.fromEntries(secretarias.map(s => [s.id, s.nome]));
    const agora = Date.now();

    const filtrados = list.filter(c => {
      if (!isPendente(c.status)) return false;
      return eixoDoChamado(c, categorias) === eixo;
    });

    const fila = filtrados
      .map(c => {
        const pri = PRIORIDADES.find(p => p.id === c.prioridade) || PRIORIDADES[1];
        const horas = (agora - new Date(c.criadoEm).getTime()) / 3600000;
        const slaEstourado = horas > pri.slaHoras;
        let score = (pri.peso || 1) * 10;
        if (slaEstourado) score += 40;
        if (c.destaqueGabinete) score += 25;
        if (c.prioridade === 'urgente') score += 20;
        return {
          id: c.id,
          protocolo: c.protocolo,
          titulo: c.titulo,
          bairro: c.bairro,
          status: c.status,
          prioridade: c.prioridade,
          secretaria: c.secretaria,
          secretariaNome: nomes[c.secretaria] || c.secretaria,
          criadoEm: c.criadoEm,
          slaEstourado,
          horasAberto: Math.round(horas),
          destaqueGabinete: !!c.destaqueGabinete,
          prazoGabinete: c.prazoGabinete || null,
          cobrancas: c.cobrancas || [],
          eixo: eixoDoChamado(c, categorias),
          unidadeId: c.unidadeId || null,
          eventoId: c.eventoId || null,
          avaliacao: c.avaliacao || null,
          foto: c.foto || null,
          fotoAntes: c.fotoAntes || c.foto || null,
          fotoDepois: c.fotoDepois || null,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    const decisoesPendentes = readTenant(slug, 'decisoes-gabinete.json', [])
      .filter(d => !d.eixo || d.eixo === eixo);

    const agenda = eixo === 'eventos' ? readTenant(slug, 'eventos-agenda.json', []) : [];
    const unidades = eixo === 'saude' ? readTenant(slug, 'unidades-saude.json', []) : [];

    return sendJSON(res, 200, {
      eixo,
      eixos: EIXOS,
      fila,
      decisoes: decisoesPendentes.slice(0, 30),
      agenda,
      unidades,
      resumo: {
        criticos: fila.filter(f => f.slaEstourado || f.prioridade === 'urgente').length,
        destacados: fila.filter(f => f.destaqueGabinete).length,
        totalPendentes: filtrados.length,
        avaliacaoBaixa: filtrados.filter(c => (c.avaliacao?.nota || 5) <= 2).length,
        eventosProximos: agenda.filter(e => e.status !== 'cancelado').length,
        unidades: unidades.length,
      },
    });
  }

  if (pathname === '/api/gabinete/visita-surpresa' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const body = await readBody(req);
    const unidades = readTenant(slug, 'unidades-saude.json', []);
    const unidade = unidades.find(u => u.id === body.unidadeId) || unidades[0];
    if (!unidade) return sendJSON(res, 400, { error: 'Cadastre unidades de saúde' });

    const now = new Date().toISOString();
    const chamados = readTenant(slug, 'chamados.json', []);
    const n = 1000 + chamados.length + 1;
    const prefix = slug.slice(0, 3).toUpperCase();
    const checklist = body.checklist || {
      atendimentoOk: body.atendimentoOk !== false,
      filaOk: body.filaOk !== false,
      limpezaOk: body.limpezaOk !== false,
      medicoPresente: body.medicoPresente !== false,
      salaEsperaOk: body.salaEsperaOk !== false,
      medicamentoOk: body.medicamentoOk !== false,
      observacao: body.observacao || '',
    };

    const problemas = [];
    if (checklist.atendimentoOk === false) problemas.push('atendimento');
    if (checklist.filaOk === false) problemas.push('fila');
    if (checklist.limpezaOk === false) problemas.push('limpeza');
    if (checklist.medicoPresente === false) problemas.push('médico/equipe');
    if (checklist.salaEsperaOk === false) problemas.push('sala de espera');
    if (checklist.medicamentoOk === false) problemas.push('medicamento/insumo');

    const checklistTxt = [
      `atendimento=${checklist.atendimentoOk}`,
      `fila=${checklist.filaOk}`,
      `limpeza=${checklist.limpezaOk}`,
      `equipe=${checklist.medicoPresente}`,
      `sala=${checklist.salaEsperaOk}`,
      `insumos=${checklist.medicamentoOk}`,
    ].join(', ');

    const chamado = normalizeChamado({
      id: `${prefix}-${n}`,
      protocolo: `${new Date().getFullYear()}${n}`,
      categoria: 'visita_surpresa',
      secretaria: 'saude',
      eixo: 'saude',
      titulo: `Visita surpresa · ${unidade.nome}`,
      descricao: `Visita surpresa do Gabinete em ${unidade.nome}. Checklist: ${checklistTxt}. ${checklist.observacao || ''}`.trim(),
      bairro: unidade.bairro || 'Centro',
      endereco: unidade.nome,
      lat: unidade.lat,
      lng: unidade.lng,
      status: problemas.length ? 'encaminhado' : 'concluido',
      prioridade: problemas.length ? 'urgente' : 'media',
      destaqueGabinete: true,
      unidadeId: unidade.id,
      visitaSurpresa: { em: now, checklist, por: 'Gabinete do Prefeito' },
      cidadao: { nome: 'Gabinete do Prefeito', telefone: '' },
      historico: [{
        em: now,
        status: problemas.length ? 'encaminhado' : 'concluido',
        nota: problemas.length
          ? `Visita surpresa: pendências (${problemas.join(', ')}) — cobrança automática à Saúde`
          : 'Visita surpresa: unidade ok',
        por: 'Gabinete do Prefeito',
      }],
      criadoEm: now,
      atualizadoEm: now,
    });
    chamados.push(chamado);
    writeTenant(slug, 'chamados.json', chamados);

    if (problemas.length) {
      pushNotif(ctx, slug, {
        canal: 'whatsapp',
        tipo: 'visita_surpresa',
        titulo: `Visita surpresa · ${unidade.nome}`,
        destino: 'saude',
        mensagem: chamado.descricao,
        chamadoId: chamado.id,
      });
    }

    const decisoes = readTenant(slug, 'decisoes-gabinete.json', []);
    decisoes.unshift({
      em: now, acao: 'visita_surpresa', eixo: 'saude', por: 'Gabinete do Prefeito',
      protocolo: chamado.protocolo, detalhe: `${unidade.nome}: ${problemas.length ? problemas.join(', ') : 'OK'}`,
    });
    writeTenant(slug, 'decisoes-gabinete.json', decisoes.slice(0, 100));

    return sendJSON(res, 201, { ok: true, chamado, unidade, problemas });
  }

  if (pathname === '/api/eventos' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    return sendJSON(res, 200, readTenant(slug, 'eventos-agenda.json', []));
  }

  // —— Saúde: painel do dia + check-in de plantão ——
  const DEMO_SAUDE_DIA = {
    'US-HOSP': { naFila: 28, atendidosHoje: 94, tempoMedioMin: 110, metaAtendimentos: 120 },
    'US-UBS1': { naFila: 9, atendidosHoje: 41, tempoMedioMin: 38, metaAtendimentos: 60 },
    'US-UBS2': { naFila: 14, atendidosHoje: 22, tempoMedioMin: 55, metaAtendimentos: 50 },
  };

  function painelSaudeHoje(slug) {
    const hoje = new Date().toISOString().slice(0, 10);
    const unidades = readTenant(slug, 'unidades-saude.json', []);
    let diario = readTenant(slug, 'saude-hoje.json', null);
    // Mantém cenário de pitch (demoPitch) ao virar o dia — não zera fila/espera
    if (!diario || diario.data !== hoje) {
      const useDemo = !diario || diario.demoPitch !== false;
      diario = {
        data: hoje,
        demoPitch: true,
        atualizadoEm: new Date().toISOString(),
        unidades: Object.fromEntries(unidades.map(u => [u.id, useDemo
          ? { ...(DEMO_SAUDE_DIA[u.id] || { naFila: 8, atendidosHoje: 30, tempoMedioMin: 45, metaAtendimentos: 50 }) }
          : { naFila: 0, atendidosHoje: 0, tempoMedioMin: 0, metaAtendimentos: 50 },
        ])),
      };
      writeTenant(slug, 'saude-hoje.json', diario);
    }

    let plantoes = readTenant(slug, 'plantoes.json', []);
    const agoraIso = new Date().toISOString();
    // Garante 1 slot por unidade no dia (demo: hosp+ubs1 ativos, ubs2 sem confirmação)
    for (const u of unidades) {
      if (!plantoes.find(p => p.unidadeId === u.id && p.data === hoje)) {
        const isCriticoDemo = u.id === 'US-UBS2';
        plantoes.push({
          id: `PL-${u.id}-${hoje}`,
          unidadeId: u.id,
          data: hoje,
          profissional: isCriticoDemo ? null : (u.id === 'US-HOSP' ? 'Dr. Allisson Carvalho' : 'Dra. Ana Paula'),
          cargo: u.tipo === 'hospital' ? 'Plantão hospitalar' : 'Clínica geral',
          iniciadoEm: isCriticoDemo ? null : agoraIso,
          ultimoCheckIn: isCriticoDemo ? null : agoraIso,
          status: isCriticoDemo ? 'sem_confirmacao' : 'ativo',
        });
      }
    }
    plantoes = plantoes.filter(p => p.data === hoje || !p.data);
    writeTenant(slug, 'plantoes.json', plantoes);

    const agora = Date.now();
    const CHECKIN_MAX_MS = 3 * 60 * 60 * 1000; // 3h sem check-in = alerta

    const painel = unidades.map(u => {
      const d = diario.unidades[u.id] || { naFila: 0, atendidosHoje: 0, tempoMedioMin: 0, metaAtendimentos: 50 };
      const plantao = plantoes.find(p => p.unidadeId === u.id) || null;
      let plantaoStatus = plantao?.status || 'sem_confirmacao';
      let alertaPlantao = plantaoStatus === 'sem_confirmacao';
      if (plantao?.ultimoCheckIn) {
        const gap = agora - new Date(plantao.ultimoCheckIn).getTime();
        if (gap > CHECKIN_MAX_MS) {
          plantaoStatus = 'checkin_atrasado';
          alertaPlantao = true;
        }
      }
      const alertaFila = (d.naFila || 0) >= 20 || (d.tempoMedioMin || 0) >= 90;
      const alertas = [];
      if (alertaPlantao) alertas.push(plantaoStatus === 'checkin_atrasado' ? 'Plantão sem check-in recente' : 'Plantão sem confirmação');
      if (alertaFila) alertas.push('Fila / espera elevada');
      return {
        ...u,
        ...d,
        plantao: plantao ? {
          ...plantao,
          status: plantaoStatus,
          minutosDesdeCheckIn: plantao.ultimoCheckIn
            ? Math.round((agora - new Date(plantao.ultimoCheckIn).getTime()) / 60000)
            : null,
        } : null,
        alertas,
        critico: alertas.length > 0,
      };
    });

    const chamadosSaude = readTenant(slug, 'chamados.json', [])
      .map(normalizeChamado)
      .filter(c => c.secretaria === 'saude' || c.eixo === 'saude');
    const reclamacoesAbertas = chamadosSaude.filter(c =>
      isPendente(c.status) && c.categoria !== 'visita_surpresa'
    );
    const avaliacoesBaixas = chamadosSaude.filter(c => (c.avaliacao?.nota || 5) <= 2);

    const totais = {
      naFila: painel.reduce((s, u) => s + (u.naFila || 0), 0),
      atendidosHoje: painel.reduce((s, u) => s + (u.atendidosHoje || 0), 0),
      tempoMedioMin: painel.length
        ? Math.round(painel.reduce((s, u) => s + (u.tempoMedioMin || 0), 0) / painel.length)
        : 0,
      unidadesCriticas: painel.filter(u => u.critico).length,
      plantoesOk: painel.filter(u => u.plantao && !u.alertas.some(a => a.includes('Plantão'))).length,
      plantoesTotal: painel.length,
      reclamacoesAbertas: reclamacoesAbertas.length,
      avaliacoesBaixas: avaliacoesBaixas.length,
      metaOk: painel.filter(u => (u.atendidosHoje || 0) >= (u.metaAtendimentos || 0)).length,
    };

    return {
      data: hoje,
      atualizadoEm: diario.atualizadoEm,
      totais,
      unidades: painel,
      reclamacoes: reclamacoesAbertas.slice(0, 8).map(c => ({
        id: c.id,
        protocolo: c.protocolo,
        titulo: c.titulo,
        categoria: c.categoria,
        bairro: c.bairro,
        status: c.status,
        prioridade: c.prioridade,
        unidadeId: c.unidadeId || null,
        avaliacao: c.avaliacao || null,
        criadoEm: c.criadoEm,
      })),
    };
  }

  if (pathname === '/api/saude/hoje' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    return sendJSON(res, 200, painelSaudeHoje(slug));
  }

  if (pathname === '/api/saude/plantao' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const body = await readBody(req);
    const hoje = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const unidades = readTenant(slug, 'unidades-saude.json', []);
    const unidade = unidades.find(u => u.id === body.unidadeId);
    if (!unidade) return sendJSON(res, 400, { error: 'Unidade inválida' });

    let plantoes = readTenant(slug, 'plantoes.json', []);
    let idx = plantoes.findIndex(p => p.unidadeId === body.unidadeId && p.data === hoje);
    if (idx < 0) {
      plantoes.push({
        id: `PL-${body.unidadeId}-${hoje}`,
        unidadeId: body.unidadeId,
        data: hoje,
        profissional: null,
        cargo: 'Plantão',
        iniciadoEm: null,
        ultimoCheckIn: null,
        status: 'sem_confirmacao',
      });
      idx = plantoes.length - 1;
    }

    const acao = body.acao || 'checkin';
    const p = plantoes[idx];
    if (acao === 'iniciar' || (!p.iniciadoEm && acao === 'checkin')) {
      p.profissional = body.profissional || p.profissional || 'Profissional de plantão';
      p.cargo = body.cargo || p.cargo || 'Plantão';
      p.iniciadoEm = p.iniciadoEm || now;
      p.ultimoCheckIn = now;
      p.status = 'ativo';
    } else if (acao === 'checkin') {
      p.ultimoCheckIn = now;
      p.status = 'ativo';
      if (body.profissional) p.profissional = body.profissional;
    } else if (acao === 'encerrar') {
      p.status = 'encerrado';
      p.ultimoCheckIn = now;
      p.encerradoEm = now;
    } else {
      return sendJSON(res, 400, { error: 'Ação inválida', validas: ['iniciar', 'checkin', 'encerrar'] });
    }
    plantoes[idx] = p;
    writeTenant(slug, 'plantoes.json', plantoes);
    pushLog(ctx, slug, 'saude.plantao', `${acao} ${unidade.id} ${p.profissional || ''}`);
    return sendJSON(res, 200, { ok: true, plantao: p, painel: painelSaudeHoje(slug) });
  }

  if (pathname === '/api/saude/movimento' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const body = await readBody(req);
    const hoje = new Date().toISOString().slice(0, 10);
    let diario = readTenant(slug, 'saude-hoje.json', { data: hoje, unidades: {} });
    if (diario.data !== hoje) {
      diario = { data: hoje, atualizadoEm: new Date().toISOString(), unidades: {} };
    }
    const u = diario.unidades[body.unidadeId] || {
      naFila: 0, atendidosHoje: 0, tempoMedioMin: 40, metaAtendimentos: 50,
    };
    if (body.naFila != null) u.naFila = Number(body.naFila);
    if (body.atendidosHoje != null) u.atendidosHoje = Number(body.atendidosHoje);
    if (body.tempoMedioMin != null) u.tempoMedioMin = Number(body.tempoMedioMin);
    if (body.atender) {
      u.atendidosHoje = (u.atendidosHoje || 0) + Number(body.atender);
      u.naFila = Math.max(0, (u.naFila || 0) - Number(body.atender));
    }
    diario.unidades[body.unidadeId] = u;
    diario.atualizadoEm = new Date().toISOString();
    writeTenant(slug, 'saude-hoje.json', diario);
    return sendJSON(res, 200, painelSaudeHoje(slug));
  }

  if (pathname === '/api/gabinete/decidir' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    let user = currentUser(req);
    if (!user || !['admin', 'prefeito', 'platform'].includes(user.papel)) {
      user = { nome: 'Gabinete do Prefeito', papel: 'prefeito', id: 'prefeito' };
    }

    const body = await readBody(req);
    const acao = body.acao;
    const now = new Date().toISOString();
    const chamados = readTenant(slug, 'chamados.json', []);
    const idx = chamados.findIndex(c => c.id === body.chamadoId || c.protocolo === body.chamadoId);
    if (idx < 0 && acao !== 'destacar_bairro') {
      return sendJSON(res, 404, { error: 'Chamado não encontrado' });
    }

    if (acao === 'destacar_bairro') {
      const bairro = body.bairro;
      if (!bairro) return sendJSON(res, 400, { error: 'Informe o bairro' });
      let n = 0;
      for (let i = 0; i < chamados.length; i++) {
        const x = normalizeChamado(chamados[i]);
        if (x.bairro === bairro && isPendente(x.status)) {
          x.destaqueGabinete = true;
          x.historico.push({
            em: now, status: x.status,
            nota: `Bairro ${bairro} destacado como prioridade do Gabinete`,
            por: user.nome,
          });
          chamados[i] = x;
          n++;
        }
      }
      writeTenant(slug, 'chamados.json', chamados);
      const decisoesB = readTenant(slug, 'decisoes-gabinete.json', []);
      decisoesB.unshift({ em: now, acao, por: user.nome, detalhe: `Bairro ${bairro}: ${n} chamados`, bairro });
      writeTenant(slug, 'decisoes-gabinete.json', decisoesB.slice(0, 100));
      pushLog(ctx, slug, 'gabinete.decidir', `destacar_bairro ${bairro}`);
      return sendJSON(res, 200, { ok: true, mensagem: `${n} chamados do bairro ${bairro} destacados` });
    }

    const c = normalizeChamado(chamados[idx]);
    let mensagem = '';

    if (acao === 'priorizar') {
      c.prioridade = 'urgente';
      c.destaqueGabinete = true;
      c.alertaGabineteAtivo = true;
      c.cienteGabineteEm = null;
      c.historico.push({
        em: now, status: c.status,
        nota: 'PRIORIDADE DO GABINETE: marcado como urgente pelo prefeito',
        por: user.nome,
      });
      mensagem = `Protocolo ${c.protocolo} priorizado como urgente`;
    } else if (acao === 'cobrar') {
      const texto = body.nota || 'Cobrança do Gabinete: solicitar andamento imediato à secretaria.';
      c.cobrancas = c.cobrancas || [];
      c.cobrancas.push({ em: now, por: user.nome, texto, cienteEm: null });
      c.alertaGabineteAtivo = true;
      c.cienteGabineteEm = null;
      if (c.status === 'novo') c.status = 'encaminhado';
      c.historico.push({ em: now, status: c.status, nota: texto, por: user.nome });
      pushNotif(ctx, slug, {
        canal: 'email',
        tipo: 'cobranca_gabinete',
        titulo: `Cobrança Gabinete · ${c.protocolo}`,
        destino: c.secretaria,
        mensagem: texto,
        chamadoId: c.id,
      });
      mensagem = `Cobrança enviada à secretaria (${c.secretaria})`;
    } else if (acao === 'determinar_prazo') {
      const prazo = body.prazo || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      c.prazoGabinete = prazo;
      c.alertaGabineteAtivo = true;
      c.cienteGabineteEm = null;
      c.historico.push({
        em: now, status: c.status,
        nota: `Prazo determinado pelo Gabinete: ${prazo}`,
        por: user.nome,
      });
      mensagem = `Prazo ${prazo} definido para ${c.protocolo}`;
    } else if (acao === 'autorizar_execucao') {
      c.status = 'em_execucao';
      c.destaqueGabinete = true;
      c.alertaGabineteAtivo = true;
      c.cienteGabineteEm = null;
      c.historico.push({
        em: now, status: 'em_execucao',
        nota: 'Gabinete autorizou execução imediata / reforço de equipe',
        por: user.nome,
      });
      mensagem = `Execução autorizada para ${c.protocolo}`;
    } else {
      return sendJSON(res, 400, {
        error: 'Ação inválida',
        validas: ['priorizar', 'cobrar', 'determinar_prazo', 'autorizar_execucao', 'destacar_bairro'],
      });
    }

    c.atualizadoEm = now;
    chamados[idx] = c;
    writeTenant(slug, 'chamados.json', chamados);

    const decisoes = readTenant(slug, 'decisoes-gabinete.json', []);
    decisoes.unshift({
      em: now, acao, por: user.nome, chamadoId: c.id, protocolo: c.protocolo, detalhe: mensagem,
      eixo: c.eixo || body.eixo || 'cidade',
    });
    writeTenant(slug, 'decisoes-gabinete.json', decisoes.slice(0, 100));
    pushLog(ctx, slug, 'gabinete.decidir', `${acao} ${c.protocolo}`);

    return sendJSON(res, 200, { ok: true, mensagem, chamado: c });
  }

  // —— Cadastros genéricos ——
  const cadastroMap = {
    usuarios: 'usuarios.json',
    secretarias: 'secretarias.json',
    equipes: 'equipes.json',
    veiculos: 'veiculos.json',
    equipamentos: 'equipamentos.json',
    bairros: 'bairros.json',
    ruas: 'ruas.json',
    categorias: 'categorias.json',
    prioridades: 'prioridades.json',
    materiais: 'materiais.json',
    perfis: 'perfis.json',
  };

  const cadMatch = pathname.match(/^\/api\/cadastro\/([a-z]+)$/);
  if (cadMatch) {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const key = cadMatch[1];
    const file = cadastroMap[key];
    if (!file) return sendJSON(res, 404, { error: 'Cadastro inválido' });

    if (req.method === 'GET') {
      if (key === 'usuarios') {
        const gate = requireStaff(ctx, res, ['admin', 'prefeito', 'platform']);
        if (!gate) return true;
      }
      let list = crudList(ctx, slug, file, []);
      if (key === 'usuarios') {
        list = list.map(({ senha, ...u }) => u);
      }
      return sendJSON(res, 200, list);
    }

    const staff = requireStaff(ctx, res, key === 'usuarios' ? ['admin', 'prefeito', 'platform'] : ['admin', 'platform']);
    if (!staff) return true;

    if (req.method === 'POST') {
      const body = await readBody(req);
      const list = crudList(ctx, slug, file, []);
      const item = { id: body.id || `${key.slice(0, 3).toUpperCase()}-${Date.now()}`, ...body };
      if (key === 'usuarios' && item.ativo === undefined) item.ativo = true;
      list.push(item);
      crudSave(ctx, slug, file, list);
      pushLog(ctx, slug, 'cadastro.create', `${key} ${item.id}`);
      return sendJSON(res, 201, key === 'usuarios' ? (({ senha, ...u }) => u)(item) : item);
    }

    if (req.method === 'PUT') {
      const body = await readBody(req);
      const list = crudList(ctx, slug, file, []);
      const idx = list.findIndex(x => x.id === body.id);
      if (idx < 0) return sendJSON(res, 404, { error: 'Não encontrado' });
      const prev = list[idx];
      const next = { ...prev, ...body };
      if (key === 'usuarios' && (body.senha === '' || body.senha == null)) {
        next.senha = prev.senha;
      }
      list[idx] = next;
      crudSave(ctx, slug, file, list);
      pushLog(ctx, slug, 'cadastro.update', `${key} ${body.id}`);
      const out = key === 'usuarios' ? (({ senha, ...u }) => u)(list[idx]) : list[idx];
      return sendJSON(res, 200, out);
    }

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id');
      let list = crudList(ctx, slug, file, []);
      list = list.filter(x => x.id !== id);
      crudSave(ctx, slug, file, list);
      pushLog(ctx, slug, 'cadastro.delete', `${key} ${id}`);
      return sendJSON(res, 200, { ok: true });
    }
  }

  // —— Chamado detalhado / ações ——
  const chMatch = pathname.match(/^\/api\/chamados\/([^/]+)(?:\/([a-z]+))?$/);
  if (chMatch && chMatch[1] !== undefined) {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const id = decodeURIComponent(chMatch[1]);
    const action = chMatch[2];

    // Skip if this is handled as plain PATCH without action — server.js also has PATCH
    // We handle GET one, POST actions here

    if (req.method === 'GET' && !action) {
      const list = readTenant(slug, 'chamados.json', []).map(normalizeChamado);
      const c = list.find(x => x.id === id || x.protocolo === id);
      if (!c) return sendJSON(res, 404, { error: 'Chamado não encontrado' });
      return sendJSON(res, 200, c);
    }

    if (action === 'comentario' && req.method === 'POST') {
      const user = requireStaff(ctx, res);
      if (!user) return true;
      const body = await readBody(req);
      const list = readTenant(slug, 'chamados.json', []);
      const idx = list.findIndex(x => x.id === id || x.protocolo === id);
      if (idx < 0) return sendJSON(res, 404, { error: 'Chamado não encontrado' });
      const c = normalizeChamado(list[idx]);
      c.comentarios = c.comentarios || [];
      c.comentarios.push({
        em: new Date().toISOString(),
        texto: body.texto || '',
        por: user.nome,
        interno: body.interno !== false,
      });
      c.atualizadoEm = new Date().toISOString();
      list[idx] = c;
      writeTenant(slug, 'chamados.json', list);
      return sendJSON(res, 200, c);
    }

    if (action === 'ciencia' && req.method === 'POST') {
      const user = requireStaff(ctx, res, ['admin', 'secretaria', 'campo']);
      if (!user) return true;
      const list = readTenant(slug, 'chamados.json', []);
      const idx = list.findIndex(x => x.id === id || x.protocolo === id);
      if (idx < 0) return sendJSON(res, 404, { error: 'Chamado não encontrado' });
      const c = normalizeChamado(list[idx]);
      if (user.papel === 'secretaria' && user.secretaria && c.secretaria !== user.secretaria) {
        return sendJSON(res, 403, { error: 'Chamado de outra secretaria' });
      }
      const now = new Date().toISOString();
      c.cobrancas = (c.cobrancas || []).map(x => ({
        ...x,
        cienteEm: x.cienteEm || now,
        cientePor: x.cientePor || user.nome,
      }));
      c.alertaGabineteAtivo = false;
      c.cienteGabineteEm = now;
      c.historico = c.historico || [];
      c.historico.push({
        em: now,
        status: c.status,
        nota: 'Secretaria confirmou ciência do alerta do Gabinete',
        por: user.nome,
      });
      c.atualizadoEm = now;
      list[idx] = c;
      writeTenant(slug, 'chamados.json', list);
      pushLog(ctx, slug, 'secretaria.ciencia', `${c.protocolo} por ${user.nome}`);
      return sendJSON(res, 200, c);
    }

    if (action === 'aprovacao' && req.method === 'POST') {
      const user = requireStaff(ctx, res, ['admin', 'secretaria', 'prefeito']);
      if (!user) return true;
      const body = await readBody(req);
      const list = readTenant(slug, 'chamados.json', []);
      const idx = list.findIndex(x => x.id === id || x.protocolo === id);
      if (idx < 0) return sendJSON(res, 404, { error: 'Chamado não encontrado' });
      const c = normalizeChamado(list[idx]);
      if (user.papel === 'secretaria' && user.secretaria && c.secretaria !== user.secretaria) {
        return sendJSON(res, 403, { error: 'Chamado de outra secretaria' });
      }
      const aprovado = body.aprovado !== false && body.aprovado !== 'false';
      // Já finalizado: não dá erro no segundo clique
      if (aprovado && c.status === 'concluido') {
        return sendJSON(res, 200, c);
      }
      if (!aprovado && c.status === 'em_execucao' && c.aprovacaoSecretaria && c.aprovacaoSecretaria.aprovado === false) {
        return sendJSON(res, 200, c);
      }
      if (!c.fotoDepois) {
        return sendJSON(res, 400, { error: 'Sem foto do depois para avaliar' });
      }
      if (c.status !== 'aguardando_aprovacao' && aprovado) {
        // Permite aprovar mesmo se status mudou, desde que tenha foto depois
      } else if (c.status !== 'aguardando_aprovacao' && !aprovado) {
        return sendJSON(res, 400, { error: 'Este chamado não está aguardando aprovação' });
      }
      const now = new Date().toISOString();
      if (aprovado) {
        c.status = 'concluido';
        c.ordemServico = { ...(c.ordemServico || {}), status: 'encerrada', aprovadaEm: now, aprovadaPor: user.nome };
        c.aprovacaoSecretaria = { aprovado: true, em: now, por: user.nome, nota: body.nota || 'Foto do depois aprovada' };
        c.historico.push({
          em: now,
          status: 'concluido',
          nota: body.nota || 'Secretaria aprovou a foto do depois e finalizou o chamado',
          por: user.nome,
        });
        pushNotif(ctx, slug, {
          canal: 'whatsapp',
          tipo: 'conclusao',
          titulo: `Protocolo ${c.protocolo} concluído — veja o antes e depois`,
          destino: c.cidadao?.telefone || '',
          chamadoId: c.id,
        });
      } else {
        c.status = 'em_execucao';
        c.ordemServico = { ...(c.ordemServico || {}), status: 'devolvida', devolvidaEm: now };
        c.aprovacaoSecretaria = { aprovado: false, em: now, por: user.nome, nota: body.nota || 'Foto não aprovada' };
        c.historico.push({
          em: now,
          status: 'em_execucao',
          nota: body.nota
            ? `Secretaria NÃO aprovou: ${body.nota}`
            : 'Secretaria não aprovou a foto — devolvido ao campo para refazer',
          por: user.nome,
        });
        pushNotif(ctx, slug, {
          canal: 'email',
          tipo: 'devolucao_campo',
          titulo: `OS devolvida · ${c.protocolo}`,
          destino: 'campo',
          mensagem: body.nota || 'Refazer serviço / nova foto do depois',
          chamadoId: c.id,
        });
      }
      c.atualizadoEm = now;
      list[idx] = c;
      writeTenant(slug, 'chamados.json', list);
      pushLog(ctx, slug, 'secretaria.aprovacao', `${aprovado ? 'aprovou' : 'devolveu'} ${c.protocolo}`);
      return sendJSON(res, 200, c);
    }

    if (action === 'anexo' && req.method === 'POST') {
      const body = await readBody(req);
      const list = readTenant(slug, 'chamados.json', []);
      const idx = list.findIndex(x => x.id === id || x.protocolo === id);
      if (idx < 0) return sendJSON(res, 404, { error: 'Chamado não encontrado' });
      const c = normalizeChamado(list[idx]);
      c.anexos = c.anexos || [];
      c.anexos.push({
        tipo: body.tipo || 'foto',
        url: body.url || body.foto,
        em: new Date().toISOString(),
        por: currentUser(req)?.nome || 'cidadao',
      });
      if (body.foto && !c.foto) c.foto = body.foto;
      if (body.tipo === 'antes') c.fotoAntes = body.url || body.foto;
      if (body.tipo === 'depois') c.fotoDepois = body.url || body.foto;
      c.atualizadoEm = new Date().toISOString();
      list[idx] = c;
      writeTenant(slug, 'chamados.json', list);
      return sendJSON(res, 200, c);
    }

    if (action === 'assinar' && req.method === 'POST') {
      const user = requireStaff(ctx, res);
      if (!user) return true;
      const body = await readBody(req);
      const list = readTenant(slug, 'chamados.json', []);
      const idx = list.findIndex(x => x.id === id || x.protocolo === id);
      if (idx < 0) return sendJSON(res, 404, { error: 'Chamado não encontrado' });
      const c = normalizeChamado(list[idx]);
      c.assinatura = {
        por: user.nome,
        em: new Date().toISOString(),
        hash: Buffer.from(`${c.id}|${user.nome}|${Date.now()}`).toString('base64').slice(0, 24),
        cargo: body.cargo || user.papel,
      };
      c.historico.push({ em: c.assinatura.em, status: c.status, nota: 'Assinatura digital registrada', por: user.nome });
      list[idx] = c;
      writeTenant(slug, 'chamados.json', list);
      return sendJSON(res, 200, c);
    }

    if (action === 'avaliar' && req.method === 'POST') {
      const body = await readBody(req);
      const list = readTenant(slug, 'chamados.json', []);
      const idx = list.findIndex(x => x.id === id || x.protocolo === id);
      if (idx < 0) return sendJSON(res, 404, { error: 'Chamado não encontrado' });
      const c = normalizeChamado(list[idx]);
      c.avaliacao = {
        nota: Number(body.nota) || 5,
        comentario: body.comentario || '',
        em: new Date().toISOString(),
      };
      list[idx] = c;
      writeTenant(slug, 'chamados.json', list);
      return sendJSON(res, 200, c);
    }

    if (action === 'protocolo' && req.method === 'GET') {
      const list = readTenant(slug, 'chamados.json', []).map(normalizeChamado);
      const c = list.find(x => x.id === id || x.protocolo === id);
      if (!c) return sendJSON(res, 404, { error: 'Chamado não encontrado' });
      const cfg = readTenant(slug, 'config.json', {});
      const pdf = gerarPDFTexto({
        titulo: `Protocolo ${c.protocolo}`,
        cidade: cfg.cidade,
        linhas: [
          `ID: ${c.id}`,
          `Status: ${statusMeta(c.status).label}`,
          `Tipo: ${c.titulo}`,
          `Bairro: ${c.bairro}`,
          `Endereço: ${c.endereco || '—'}`,
          `Prioridade: ${c.prioridade}`,
          `Cidadão: ${c.cidadao?.nome || '—'}`,
          `Telefone: ${c.cidadao?.telefone || '—'}`,
          `Descrição: ${c.descricao}`,
          '',
          'Histórico:',
          ...(c.historico || []).map(h => `- ${h.em} | ${h.status} | ${h.nota}`),
          c.assinatura ? `\nAssinatura: ${c.assinatura.por} (${c.assinatura.hash})` : '',
        ],
      });
      return sendJSON(res, 200, pdf);
    }

    if (action === 'os' && req.method === 'POST') {
      const user = requireStaff(ctx, res, ['admin', 'secretaria', 'campo']);
      if (!user) return true;
      const body = await readBody(req);
      const list = readTenant(slug, 'chamados.json', []);
      const idx = list.findIndex(x => x.id === id || x.protocolo === id);
      if (idx < 0) return sendJSON(res, 404, { error: 'Chamado não encontrado' });
      const c = normalizeChamado(list[idx]);
      const now = new Date().toISOString();
      const acao = body.acao;

      if (acao === 'aceitar') {
        c.ordemServico = { ...(c.ordemServico || {}), status: 'aceita', aceitaEm: now, por: user.nome };
        c.status = 'em_execucao';
        c.equipeId = body.equipeId || user.equipeId || c.equipeId;
        c.historico.push({ em: now, status: 'em_execucao', nota: 'OS aceita pela equipe', por: user.nome });
      } else if (acao === 'material') {
        c.materiais = c.materiais || [];
        c.materiais.push({ nome: body.nome, qtd: body.qtd || 1, em: now });
        c.historico.push({ em: now, status: c.status, nota: `Material: ${body.nome} x${body.qtd || 1}`, por: user.nome });
      } else if (acao === 'horas') {
        c.horasTrabalhadas = Number(body.horas) || 0;
        c.historico.push({ em: now, status: c.status, nota: `Horas: ${c.horasTrabalhadas}h`, por: user.nome });
      } else if (acao === 'encerrar') {
        if (!body.fotoDepois && !c.fotoDepois) {
          return sendJSON(res, 400, { error: 'Envie a foto DEPOIS para enviar à secretaria' });
        }
        // Campo NÃO finaliza sozinho — secretaria avalia a foto e aprova
        c.status = 'aguardando_aprovacao';
        c.ordemServico = { ...(c.ordemServico || {}), status: 'aguardando_aprovacao', enviadaEm: now };
        if (body.fotoDepois) c.fotoDepois = body.fotoDepois;
        if (!c.fotoAntes && c.foto) c.fotoAntes = c.foto;
        if (body.custo) c.custo = Number(body.custo);
        c.historico.push({
          em: now,
          status: 'aguardando_aprovacao',
          nota: 'Campo enviou foto do depois — aguardando aprovação da secretaria',
          por: user.nome,
        });
        pushNotif(ctx, slug, {
          canal: 'email',
          tipo: 'aprovacao_secretaria',
          titulo: `Avaliar serviço · ${c.protocolo}`,
          destino: c.secretaria,
          mensagem: 'Equipe de campo enviou a foto do depois. Aprove ou devolva.',
          chamadoId: c.id,
        });
      } else if (acao === 'atribuir') {
        c.equipeId = body.equipeId;
        c.status = normalizeStatus(body.status || 'encaminhado');
        c.historico.push({ em: now, status: c.status, nota: `Encaminhado à equipe ${body.equipeId}`, por: user.nome });
      }
      c.atualizadoEm = now;
      list[idx] = c;
      writeTenant(slug, 'chamados.json', list);
      return sendJSON(res, 200, c);
    }
  }

  // Duplicidade
  if (pathname === '/api/ia/duplicidade' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const body = await readBody(req);
    const chamados = readTenant(slug, 'chamados.json', []);
    const dups = detectarDuplicidade(chamados, body);
    return sendJSON(res, 200, { duplicatas: dups, risco: dups.length ? 'alto' : 'baixo' });
  }

  if (pathname === '/api/ia/resumo' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    return sendJSON(res, 200, resumirOcorrencias(readTenant(slug, 'chamados.json', [])));
  }

  if (pathname === '/api/ia/relatorio' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const cfg = readTenant(slug, 'config.json', {});
    const m = metricsFull(slug, readTenant);
    const pdf = gerarPDFTexto({
      titulo: 'Relatório inteligente da cidade',
      cidade: cfg.cidade,
      linhas: [
        `Total: ${m.total}`,
        `Hoje: ${m.hoje}`,
        `Pendentes: ${m.pendentes}`,
        `Concluídos: ${m.concluidos}`,
        `Tempo médio: ${m.tempoMedioDias} dias`,
        `SLA estourado: ${m.slaEstourado}`,
        `Custo serviços: R$ ${m.custoTotal}`,
        '',
        'Top bairros:',
        ...m.rankingBairros.slice(0, 8).map(b => `- ${b.bairro}: ${b.total}`),
        '',
        'Ranking equipes:',
        ...m.rankingEquipes.slice(0, 8).map(e => `- ${e.nome}: ${e.concluidos} concl. (${e.produtividade}%)`),
      ],
    });
    return sendJSON(res, 200, pdf);
  }

  // Relatórios export
  if (pathname === '/api/relatorios/export' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const tipo = url.searchParams.get('tipo') || 'chamados';
    const formato = url.searchParams.get('formato') || 'csv';
    const cfg = readTenant(slug, 'config.json', {});
    const chamados = readTenant(slug, 'chamados.json', []).map(normalizeChamado);
    const m = metricsFull(slug, readTenant);

    if (formato === 'csv' || formato === 'excel') {
      let rows = [];
      let headers = [];
      if (tipo === 'bairro') {
        headers = ['bairro', 'total'];
        rows = m.rankingBairros;
      } else if (tipo === 'secretaria') {
        headers = ['secretaria', 'total'];
        rows = Object.entries(m.porSecretaria).map(([secretaria, total]) => ({ secretaria, total }));
      } else if (tipo === 'equipes') {
        headers = ['nome', 'secretaria', 'total', 'concluidos', 'produtividade'];
        rows = m.rankingEquipes;
      } else if (tipo === 'sla') {
        headers = ['protocolo', 'prioridade', 'status', 'bairro', 'criadoEm'];
        rows = chamados.filter(c => isPendente(c.status)).map(c => ({
          protocolo: c.protocolo, prioridade: c.prioridade, status: c.status,
          bairro: c.bairro, criadoEm: c.criadoEm,
        }));
      } else {
        headers = ['protocolo', 'titulo', 'status', 'prioridade', 'secretaria', 'bairro', 'criadoEm'];
        rows = chamados.map(c => ({
          protocolo: c.protocolo, titulo: c.titulo, status: c.status,
          prioridade: c.prioridade, secretaria: c.secretaria, bairro: c.bairro, criadoEm: c.criadoEm,
        }));
      }
      const csv = toCSV(rows, headers);
      return sendJSON(res, 200, {
        nome: `relatorio_${tipo}.${formato === 'excel' ? 'csv' : 'csv'}`,
        mime: 'text/csv; charset=utf-8',
        conteudo: csv,
        nota: formato === 'excel' ? 'CSV compatível com Excel (separador ;)' : null,
      });
    }

    const pdf = gerarPDFTexto({
      titulo: `Relatório ${tipo}`,
      cidade: cfg.cidade,
      linhas: [
        `Total chamados: ${m.total}`,
        `Pendentes: ${m.pendentes}`,
        `Tempo médio: ${m.tempoMedioDias} dias`,
        `Taxa resolução: ${m.taxaResolucao}%`,
        `SLA estourado: ${m.slaEstourado}`,
      ],
    });
    return sendJSON(res, 200, pdf);
  }

  // Notificações
  if (pathname === '/api/notificacoes' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    return sendJSON(res, 200, readTenant(slug, 'notificacoes.json', []));
  }

  if (pathname === '/api/notificacoes' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const body = await readBody(req);
    pushNotif(ctx, slug, {
      canal: body.canal || 'email',
      tipo: body.tipo || 'aviso',
      titulo: body.titulo || 'Notificação',
      destino: body.destino || '',
      mensagem: body.mensagem || '',
      chamadoId: body.chamadoId || null,
    });
    return sendJSON(res, 201, { ok: true });
  }

  if (pathname === '/api/notificacoes/canais' && req.method === 'GET') {
    return sendJSON(res, 200, [
      { id: 'whatsapp', nome: 'WhatsApp', ativo: true, modo: 'wa.me demo' },
      { id: 'sms', nome: 'SMS', ativo: true, modo: 'simulador' },
      { id: 'push', nome: 'Push', ativo: true, modo: 'simulador' },
      { id: 'email', nome: 'E-mail', ativo: true, modo: 'simulador' },
    ]);
  }

  // Logs / auditoria
  if (pathname === '/api/logs' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const user = requireStaff(ctx, res, ['admin', 'prefeito', 'platform']);
    if (!user && currentUser(req)?.papel !== 'platform') {
      if (!['admin', 'prefeito', 'platform'].includes(currentUser(req)?.papel)) return true;
    }
    return sendJSON(res, 200, readTenant(slug, 'logs.json', []));
  }

  if (pathname === '/api/backup' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const user = requireStaff(ctx, res, ['admin']);
    if (!user) return true;
    const snapshot = {
      em: new Date().toISOString(),
      por: user.nome,
      arquivos: ['chamados', 'obras', 'usuarios', 'config', 'equipes', 'materiais'],
    };
    const backups = readTenant(slug, 'backups.json', []);
    backups.unshift(snapshot);
    writeTenant(slug, 'backups.json', backups.slice(0, 20));
    pushLog(ctx, slug, 'backup', 'Backup manual gerado');
    return sendJSON(res, 200, snapshot);
  }

  // Rastreamento equipes
  if (pathname === '/api/rastreamento' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    return sendJSON(res, 200, readTenant(slug, 'rastreamento.json', []));
  }

  if (pathname === '/api/rastreamento' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const body = await readBody(req);
    const list = readTenant(slug, 'rastreamento.json', []);
    const idx = list.findIndex(x => x.equipeId === body.equipeId);
    const point = {
      equipeId: body.equipeId,
      lat: Number(body.lat),
      lng: Number(body.lng),
      atualizadoEm: new Date().toISOString(),
    };
    if (idx >= 0) list[idx] = point; else list.push(point);
    writeTenant(slug, 'rastreamento.json', list);
    return sendJSON(res, 200, point);
  }

  // Transparência
  if (pathname === '/api/transparencia' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const obras = readTenant(slug, 'obras.json', []);
    const m = metricsFull(slug, readTenant);
    return sendJSON(res, 200, {
      obras,
      gastos: {
        obras: obras.reduce((s, o) => s + Number(o.gastoExecutado || 0), 0),
        servicos: m.custoTotal,
        total: obras.reduce((s, o) => s + Number(o.gastoExecutado || 0), 0) + m.custoTotal,
      },
      empresas: [...new Set(obras.map(o => o.empresa).filter(Boolean))],
    });
  }

  // Config expandida
  if (pathname === '/api/config/full' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const cfg = readTenant(slug, 'config.json', {});
    return sendJSON(res, 200, {
      ...cfg,
      modulos: MODULOS,
      extras: EXTRAS,
      status: STATUS,
      prioridades: readTenant(slug, 'prioridades.json', PRIORIDADES),
    });
  }

  return false;
}

function migrateTenant(slug, readTenant, writeTenant, fs, path, TENANTS_DIR) {
  const dir = path.join(TENANTS_DIR, slug);
  if (!fs.existsSync(dir)) return;

  // Normalize statuses
  const chamados = readTenant(slug, 'chamados.json', []);
  let changed = false;
  const next = chamados.map(c => {
    const n = normalizeChamado(c);
    if (n.status !== c.status) changed = true;
    return n;
  });
  if (changed) writeTenant(slug, 'chamados.json', next);

  const defaults = {
    'equipes.json': [],
    'veiculos.json': [],
    'equipamentos.json': [],
    'materiais.json': [],
    'ruas.json': [],
    'bairros.json': [],
    'prioridades.json': PRIORIDADES,
    'perfis.json': [],
    'notificacoes.json': [],
    'logs.json': [],
    'rastreamento.json': [],
    'backups.json': [],
  };

  for (const [file, fallback] of Object.entries(defaults)) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) {
      writeTenant(slug, file, fallback);
    }
  }

  // Merge missing categorias from seed defaults if few
  const cats = readTenant(slug, 'categorias.json', []);
  if (cats.length < 10) {
    const { DEFAULT_CATEGORIAS } = require('../scripts/seed.js');
    const ids = new Set(cats.map(c => c.id));
    for (const c of DEFAULT_CATEGORIAS) {
      if (!ids.has(c.id)) cats.push(c);
    }
    writeTenant(slug, 'categorias.json', cats);
  }
}

module.exports = { handleModulos, migrateTenant };
