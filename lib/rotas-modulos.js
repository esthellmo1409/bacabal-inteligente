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

  // —— Chat Gabinete ↔ responsáveis das secretarias ——
  const CONTATOS_GABINETE = {
    saude: { id: 'saude', nome: 'Ana Bezerra', cargo: 'Secretaria de Saúde' },
    obras: { id: 'obras', nome: 'Marcos Vieira', cargo: 'Secretaria de Obras' },
    iluminacao: { id: 'iluminacao', nome: 'Patrícia Nunes', cargo: 'Iluminação Pública' },
    limpeza: { id: 'limpeza', nome: 'José Amaral', cargo: 'Limpeza Urbana' },
    meio_ambiente: { id: 'meio_ambiente', nome: 'Helena Costa', cargo: 'Meio Ambiente' },
    transito: { id: 'transito', nome: 'Rafael Souza', cargo: 'Trânsito' },
    defesa_civil: { id: 'defesa_civil', nome: 'Bruno Rocha', cargo: 'Defesa Civil' },
    ouvidoria: { id: 'ouvidoria', nome: 'Camila Dias', cargo: 'Ouvidoria' },
    eventos: { id: 'eventos', nome: 'Luísa Freitas', cargo: 'Cultura e Eventos' },
  };

  const CHAT_SEED_VERSION = 5;

  function horasAtras(h) {
    return new Date(Date.now() - h * 3600 * 1000).toISOString();
  }

  function seedThreadMensagens(_slug, _contato) {
    // Conversas limpas: histórico só começa quando o Gabinete manda a 1ª mensagem
    return [];
  }

  function respostaFluxoChat(secretaria, texto, gabineteNome, ctx = {}) {
    const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const contato = CONTATOS_GABINETE[secretaria];
    const nomeCurto = contato?.nome?.split(' ')[0] || 'Equipe';
    const hora = new Date().getHours();
    const saudacaoVolta = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    const temSaudacao = /\bbom dia\b/.test(t) || /\bboa tarde\b/.test(t) || /\bboa noite\b/.test(t) || /\bola\b/.test(t);
    const tratamento = gabineteNome.includes('Prefeita') ? 'senhora' : 'senhor';
    const out = [];

    if (temSaudacao) out.push(`${saudacaoVolta}, ${tratamento}!`);

    // —— Saúde: responde com dados reais do painel ——
    if (secretaria === 'saude') {
      const painel = ctx.saude || null;
      const unidades = painel?.unidades || [];
      const pickUnidade = () => {
        if (/hospital/.test(t)) {
          return unidades.find((u) => /hospital/i.test(u.nome) || u.tipo === 'hospital') || unidades[0];
        }
        if (/sao jose|são josé|ubs 2|ubs2/.test(t)) {
          return unidades.find((u) => /jos[eé]/i.test(u.nome)) || unidades.find((u) => u.id === 'US-UBS2');
        }
        if (/ubs centro|ubs 1|ubs1/.test(t)) {
          return unidades.find((u) => /centro/i.test(u.nome)) || unidades.find((u) => u.id === 'US-UBS1');
        }
        if (/ubs/.test(t)) return unidades.find((u) => u.tipo === 'ubs') || unidades[1] || unidades[0];
        return unidades.find((u) => /hospital/i.test(u.nome) || u.tipo === 'hospital') || unidades[0];
      };
      const u = pickUnidade();
      const med = u?.plantao?.profissional;
      const fila = u?.naFila ?? 0;
      const espera = u?.tempoMedioMin ?? 0;
      const okFila = fila < 20 && espera < 90;
      const statusPlantao = u?.plantao?.status;
      const perguntaPlantao = /plant[aã]o|medico|doutor|dra\.|dr\./.test(t);
      const perguntaAtend = /atendimento|fila|espera|como esta|como est[aá]|situacao|situação|hoje/.test(t);
      const perguntaEscala = /escala|turno|manha|tarde|noite/.test(t);

      if (perguntaPlantao || perguntaAtend || perguntaEscala || /hospital|ubs/.test(t)) {
        if (perguntaPlantao || (!perguntaEscala && u)) {
          if (med && statusPlantao === 'ativo') {
            out.push(`No ${u.nome} o plantão agora é o ${med}.`);
          } else if (med) {
            out.push(`No ${u.nome} está previsto ${med}, mas o plantão ainda não confirmou check-in.`);
          } else {
            out.push(`No ${u?.nome || 'unidade'} ainda não tem médico de plantão confirmado.`);
          }
        }
        if (perguntaAtend || /hospital|ubs|fila|espera/.test(t)) {
          if (okFila && med && statusPlantao === 'ativo') {
            out.push(`Atendimento hoje está dentro dos conformes: fila com ${fila} pessoas e espera média de ${espera} min.`);
          } else if (u) {
            out.push(`Atendimento no ${u.nome}: fila ${fila}, espera ~${espera} min${u.critico ? ' — está em alerta, já estou cobrando a unidade' : ''}.`);
          }
        }
        if (perguntaEscala && u?.escala?.length) {
          const slots = u.escala.map((s) => {
            const lab = s.turno === 'manha' ? 'manhã' : s.turno === 'tarde' ? 'tarde' : 'noite';
            return `${lab}: ${s.profissional || 'vago'}`;
          }).join(' · ');
          out.push(`Escala do dia — ${slots}.`);
        }
        if (!out.length || (out.length === 1 && temSaudacao)) {
          const hosp = unidades.find((x) => x.tipo === 'hospital') || unidades[0];
          if (hosp?.plantao?.profissional) {
            out.push(`Hospital: plantão ${hosp.plantao.profissional}, fila ${hosp.naFila}, espera ${hosp.tempoMedioMin} min.`);
            out.push(hosp.critico ? 'Tem alerta — estou acompanhando de perto.' : 'Por enquanto está dentro dos conformes.');
          }
        }
        if (out.length) return out;
      }

      if (temSaudacao) {
        const hosp = unidades.find((x) => x.tipo === 'hospital') || unidades[0];
        if (hosp?.plantao?.profissional) {
          out.push(`No hospital hoje está o ${hosp.plantao.profissional} de plantão.`);
          out.push(hosp.critico
            ? `Fila em ${hosp.naFila} — ainda não está 100% nos conformes, mas estou no painel.`
            : `Fila ${hosp.naFila} e espera ${hosp.tempoMedioMin} min — dentro dos conformes.`);
          out.push('Quer que eu olhe alguma UBS também?');
          return out;
        }
        out.push('Estou no painel da Saúde. Pode perguntar plantão, fila ou escala de qualquer unidade.');
        return out;
      }
    }

    // —— Obras: fluxo do buraco (ex.: Djalma) ——
    if (secretaria === 'obras') {
      const falaDjalma = /djalma/.test(t);
      const cobraAtraso = /nao chegou|nao foi|ninguem|ninguém|o que houve|atras|parado|ainda nao|ainda não|vi aqui/.test(t);
      const pedePrazo = /prazo|quando|hora|hoje|conclu/.test(t);
      const pedeFoto = /foto|antes|depois|check-?in|chegou|no local/.test(t);

      if (falaDjalma || (/buraco/.test(t) && cobraAtraso) || (cobraAtraso && /buraco|rua|obra/.test(t))) {
        if (temSaudacao) out.push('Bom dia — já abri o protocolo da Djalma aqui.');
        out.push('Senhor, sobre o buraco da Djalma: a equipe não chegou de manhã porque o caminhão de brita atrasou na base.');
        out.push('Já realoquei a EQ-OBR-01 — estão saindo agora. Chegada prevista em cerca de 40 minutos.');
        out.push('Assim que fizerem check-in no local eu te confirmo por aqui e mando a foto.');
        return out;
      }
      if (falaDjalma && pedePrazo) {
        out.push('Na Djalma o prazo é concluir ainda hoje, no máximo até 16h, com material no local.');
        out.push('Qualquer imprevisto eu te falo na hora.');
        return out;
      }
      if (falaDjalma && pedeFoto) {
        out.push('Pode deixar. Foto do antes e do depois da Djalma assim que a equipe chegar.');
        out.push('Te aviso no check-in.');
        return out;
      }
      if (/buraco|obra|asfalto|rua|prazo|como esta|como est[aá]|hoje/.test(t) || temSaudacao) {
        if (temSaudacao && !/buraco|obra|rua|prazo|djalma/.test(t)) {
          out.push('Obras no painel. O ponto quente agora é o buraco da Djalma — equipe realocada.');
          out.push('Quer que eu te passe o status da Djalma ou de outra rua?');
          return out;
        }
        if (/buraco/.test(t)) {
          out.push('O buraco prioritário em aberto é o da Djalma.');
          out.push('Equipe saindo agora com brita. Quer que eu priorize outro ponto também?');
          return out;
        }
        out.push('Equipe de campo em deslocamento.');
        out.push('Me diga a rua (ex.: Djalma) que eu te passo o que houve e o prazo.');
        return out;
      }
    }
    if (secretaria === 'iluminacao') {
      if (/poste|luz|apagad|como esta|hoje/.test(t) || temSaudacao) {
        out.push('Iluminação: 12 postes abertos; priorizei avenida e praça.');
        out.push('Caminhão sobe às 14h. A praça deve ficar 100% ainda hoje.');
        return out;
      }
    }
    if (secretaria === 'limpeza') {
      if (/lixo|limpeza|coleta|varri|como esta|hoje/.test(t) || temSaudacao) {
        out.push('Limpeza: dois pontos de acúmulo no São José — caminhão já liberado.');
        out.push('Priorizei antes do pico. Te confirmo status até 15h.');
        return out;
      }
    }
    if (secretaria === 'eventos') {
      if (/evento|estrutura|som|agenda|como esta|hoje/.test(t) || temSaudacao) {
        out.push('Evento do fim de semana: estrutura e som ok.');
        out.push('Falta só fechar limpeza pós-evento com a Limpeza Urbana — já alinhei.');
        return out;
      }
    }
    if (secretaria === 'transito' && (temSaudacao || /semaforo|semáforo|sinal|fluxo|hoje/.test(t))) {
      out.push('Semáforo da avenida restabelecido. Fluxo normal nesta manhã.');
      out.push('Qualquer falha nova eu te aviso na hora.');
      return out;
    }
    if (secretaria === 'defesa_civil' && (temSaudacao || /alag|esgoto|risco|hoje/.test(t))) {
      out.push('Um ponto de esgoto no bairro baixo — equipe em deslocamento.');
      out.push('Se precisar de Obras eu aciono e te atualizo.');
      return out;
    }
    if (secretaria === 'meio_ambiente' && (temSaudacao || /arvore|árvore|poda|hoje/.test(t))) {
      out.push('Tem uma árvore no Centro com galho rachado — poda antecipada para hoje.');
      out.push('Te confirmo horário da equipe.');
      return out;
    }
    if (secretaria === 'ouvidoria' && (temSaudacao || /reclam|protocolo|hoje/.test(t))) {
      out.push('Reclamação recorrente hoje: demora de retorno em protocolos.');
      out.push('Já cobrei as secretarias. Te mando o consolidado às 17h.');
      return out;
    }

    if (/cobra|urgente|agora|na hora|priorid/.test(t)) {
      return [
        `Recebido, ${tratamento}. Vou tratar como prioridade agora.`,
        'Te atualizo por aqui assim que avançar.',
      ];
    }
    if (/obrigad|valeu|ok|combinado|perfeito|entendi|certo/.test(t)) {
      return [`Combinado. Qualquer coisa, ${nomeCurto} segue no painel.`];
    }

    // fallback ainda no tom de conversa operacional
    const fallback = {
      saude: [
        'Deixa eu olhar no painel…',
        'Me diga a unidade (Hospital, UBS Centro ou UBS São José) que eu te passo plantão e fila na hora.',
      ],
      obras: ['Certo. Me passa a rua ou o protocolo que eu te digo o prazo da equipe.'],
      iluminacao: ['Ok. Me diga o bairro ou o poste que eu priorizo na rota de hoje.'],
      limpeza: ['Entendido. Qual bairro você quer que a equipe priorize agora?'],
      meio_ambiente: ['Recebido. É poda, árvore com risco ou limpeza de área verde?'],
      transito: ['Certo. Semáforo, sinalização ou fluxo — me diga qual ponto.'],
      defesa_civil: ['Ok. Me passa o endereço da ocorrência crítica que eu acompanho.'],
      ouvidoria: ['Recebido. Qual protocolo ou reclamação você quer que eu cobre?'],
      eventos: ['Certo. Agenda, estrutura, som ou limpeza pós-evento?'],
    };
    return fallback[secretaria] || ['Recebido. Já estou no painel e te retorno.'];
  }

  function ensureGabineteChat(slug) {
    let data = readTenant(slug, 'gabinete-chat.json', null);
    const precisaSeed = !data || !Array.isArray(data.threads) || data.seedVersion !== CHAT_SEED_VERSION;
    if (precisaSeed) {
      data = {
        seedVersion: CHAT_SEED_VERSION,
        atualizadoEm: new Date().toISOString(),
        threads: Object.values(CONTATOS_GABINETE).map((c) => ({
          secretaria: c.id,
          contato: c,
          mensagens: seedThreadMensagens(slug, c),
        })),
      };
      writeTenant(slug, 'gabinete-chat.json', data);
    }
    return data;
  }

  if (pathname === '/api/gabinete/chat' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const data = ensureGabineteChat(slug);
    const sec = url.searchParams.get('secretaria');
    if (sec) {
      const thread = data.threads.find((t) => t.secretaria === sec) || null;
      return sendJSON(res, 200, { contatos: Object.values(CONTATOS_GABINETE), thread });
    }
    return sendJSON(res, 200, {
      contatos: Object.values(CONTATOS_GABINETE),
      threads: data.threads,
      atualizadoEm: data.atualizadoEm,
    });
  }

  if (pathname === '/api/gabinete/chat' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const body = await readBody(req);
    const secretaria = body.secretaria;
    const texto = String(body.texto || '').trim();
    if (!secretaria || !CONTATOS_GABINETE[secretaria]) {
      return sendJSON(res, 400, { error: 'Secretaria inválida' });
    }
    if (!texto) return sendJSON(res, 400, { error: 'Digite uma mensagem' });
    const de = body.de === 'secretaria' ? 'secretaria' : 'gabinete';
    const data = ensureGabineteChat(slug);
    let thread = data.threads.find((t) => t.secretaria === secretaria);
    if (!thread) {
      thread = {
        secretaria,
        contato: CONTATOS_GABINETE[secretaria],
        mensagens: [],
      };
      data.threads.push(thread);
    }
    const contato = CONTATOS_GABINETE[secretaria];
    const agora = new Date().toISOString();
    const cfg = readTenant(slug, 'config.json', {});
    const gabineteNome = (cfg.prefeita || slug === 'bomlugar') ? 'Gabinete da Prefeita' : 'Gabinete do Prefeito';
    const msg = {
      id: `MSG-${Date.now()}`,
      de,
      autor: de === 'gabinete' ? gabineteNome : contato.nome,
      texto: texto.slice(0, 500),
      criadoEm: agora,
    };
    thread.mensagens.push(msg);
    // Conversa operacional (dados reais na Saúde) — base até chat ao vivo
    if (de === 'gabinete' && body.autoAck !== false) {
      let saudeCtx = null;
      if (secretaria === 'saude') {
        try { saudeCtx = painelSaudeHoje(slug); } catch (_) { saudeCtx = null; }
      }
      const respostas = respostaFluxoChat(secretaria, texto, gabineteNome, { saude: saudeCtx });
      respostas.forEach((linha, i) => {
        thread.mensagens.push({
          id: `MSG-${Date.now()}-r${i}`,
          de: 'secretaria',
          autor: contato.nome,
          texto: linha,
          criadoEm: new Date(Date.now() + 500 + i * 650).toISOString(),
          fluxo: true,
        });
      });
    }
    thread.contato = contato;
    data.atualizadoEm = agora;
    writeTenant(slug, 'gabinete-chat.json', data);
    pushLog(ctx, slug, 'gabinete.chat', `${de} → ${secretaria}: ${texto.slice(0, 60)}`);
    return sendJSON(res, 200, { ok: true, thread, contatos: Object.values(CONTATOS_GABINETE) });
  }

  // —— Saúde: painel do dia + plantão + escala + fila + histórico ——
  const DEMO_SAUDE_DIA = {
    'US-HOSP': { naFila: 28, atendidosHoje: 94, tempoMedioMin: 110, metaAtendimentos: 120 },
    'US-UBS1': { naFila: 9, atendidosHoje: 41, tempoMedioMin: 38, metaAtendimentos: 60 },
    'US-UBS2': { naFila: 14, atendidosHoje: 22, tempoMedioMin: 55, metaAtendimentos: 50 },
  };

  const DEMO_ESCALA = {
    'US-HOSP': [
      { turno: 'manha', profissional: 'Dr. Allisson Carvalho', especialidade: 'Clínica geral', status: 'confirmado' },
      { turno: 'tarde', profissional: 'Dra. Marina Costa', especialidade: 'Pediatria', status: 'confirmado' },
      { turno: 'noite', profissional: 'Dr. Paulo Mendes', especialidade: 'Plantão hospitalar', status: 'previsto' },
    ],
    'US-UBS1': [
      { turno: 'manha', profissional: 'Dra. Ana Paula', especialidade: 'Clínica geral', status: 'confirmado' },
      { turno: 'tarde', profissional: 'Dr. Ricardo Alves', especialidade: 'Clínica geral', status: 'confirmado' },
      { turno: 'noite', profissional: null, especialidade: 'Plantão UBS', status: 'vago' },
    ],
    'US-UBS2': [
      { turno: 'manha', profissional: 'Dra. Juliana Rocha', especialidade: 'Clínica geral', status: 'previsto' },
      { turno: 'tarde', profissional: null, especialidade: 'Clínica geral', status: 'vago' },
      { turno: 'noite', profissional: null, especialidade: 'Plantão UBS', status: 'vago' },
    ],
  };

  function ensureEscalaHoje(slug, unidades, hoje) {
    let list = readTenant(slug, 'escalas-saude.json', []);
    if (!Array.isArray(list)) list = [];
    let day = list.find((d) => d.data === hoje);
    if (!day) {
      const itens = [];
      unidades.forEach((u) => {
        const demo = DEMO_ESCALA[u.id] || [
          { turno: 'manha', profissional: null, especialidade: 'Clínica geral', status: 'vago' },
          { turno: 'tarde', profissional: null, especialidade: 'Clínica geral', status: 'vago' },
          { turno: 'noite', profissional: null, especialidade: 'Plantão', status: 'vago' },
        ];
        demo.forEach((slot, i) => {
          itens.push({
            id: `ESC-${u.id}-${hoje}-${slot.turno}`,
            unidadeId: u.id,
            turno: slot.turno,
            profissional: slot.profissional,
            especialidade: slot.especialidade,
            status: slot.status,
            ordem: i,
          });
        });
      });
      day = { data: hoje, atualizadoEm: new Date().toISOString(), itens };
      list = list.filter((d) => d.data !== hoje);
      list.unshift(day);
      list = list.slice(0, 45);
      writeTenant(slug, 'escalas-saude.json', list);
    }
    return day;
  }

  const CHECKLIST_SAUDE_ITENS = [
    { id: 'medico', label: 'Médico de plantão presente' },
    { id: 'limpeza', label: 'Limpeza e higienização ok' },
    { id: 'energia', label: 'Energia elétrica ok' },
    { id: 'agua', label: 'Água disponível' },
    { id: 'insumos', label: 'Insumos básicos ok' },
    { id: 'remocao', label: 'Remoção / ambulância alinhada' },
  ];

  function ensureSaudeExtras(slug, unidades, hoje) {
    let ambulancias = readTenant(slug, 'saude-ambulancias.json', null);
    if (!Array.isArray(ambulancias) || !ambulancias.length) {
      ambulancias = [
        { id: 'AMB-01', placa: 'NMA-1A23', status: 'disponivel', motorista: 'Carlos Mendes', base: 'Hospital', atualizadoEm: new Date().toISOString() },
        { id: 'AMB-02', placa: 'NMA-2B45', status: 'em_uso', motorista: 'Fernanda Lima', base: 'Hospital', atualizadoEm: new Date().toISOString() },
        { id: 'AMB-03', placa: 'NMA-3C67', status: 'oficina', motorista: '—', base: 'Garagem', atualizadoEm: new Date().toISOString() },
      ];
      writeTenant(slug, 'saude-ambulancias.json', ambulancias);
    }

    let leitos = readTenant(slug, 'saude-leitos.json', null);
    if (!Array.isArray(leitos) || !leitos.length) {
      leitos = [
        { id: 'LEITO-UTI', nome: 'UTI', total: 8, ocupados: 6 },
        { id: 'LEITO-ENF', nome: 'Enfermaria adulto', total: 40, ocupados: 31 },
        { id: 'LEITO-PED', nome: 'Pediatria', total: 12, ocupados: 7 },
        { id: 'LEITO-OBS', nome: 'Observação / pronto-socorro', total: 10, ocupados: 9 },
      ];
      writeTenant(slug, 'saude-leitos.json', leitos);
    }

    let farmacia = readTenant(slug, 'saude-farmacia.json', null);
    if (!Array.isArray(farmacia) || !farmacia.length) {
      const nomeU = Object.fromEntries((unidades || []).map((u) => [u.id, u.nome]));
      farmacia = [
        { id: 'MED-01', nome: 'Soro fisiológico 0,9%', unidadeId: 'US-HOSP', unidadeNome: nomeU['US-HOSP'] || 'Hospital', estoque: 'baixo', observacao: 'Reposição pedida' },
        { id: 'MED-02', nome: 'Dipirona ampola', unidadeId: 'US-UBS1', unidadeNome: nomeU['US-UBS1'] || 'UBS Centro', estoque: 'ok', observacao: '' },
        { id: 'MED-03', nome: 'Oxigênio medicinal', unidadeId: 'US-HOSP', unidadeNome: nomeU['US-HOSP'] || 'Hospital', estoque: 'ok', observacao: '' },
        { id: 'MED-04', nome: 'Luvas procedimento', unidadeId: 'US-UBS2', unidadeNome: nomeU['US-UBS2'] || 'UBS', estoque: 'critico', observacao: 'Estoque crítico' },
        { id: 'MED-05', nome: 'Vacina influenza (campanha)', unidadeId: 'US-UBS1', unidadeNome: nomeU['US-UBS1'] || 'UBS Centro', estoque: 'ok', observacao: 'Campanha ativa' },
      ];
      writeTenant(slug, 'saude-farmacia.json', farmacia);
    }

    let checkAll = readTenant(slug, 'saude-checklist.json', []);
    if (!Array.isArray(checkAll)) checkAll = [];
    let dayChecks = checkAll.filter((c) => c.data === hoje);
    if (!dayChecks.length && Array.isArray(unidades)) {
      dayChecks = unidades.map((u) => ({
        id: `CHK-${u.id}-${hoje}`,
        data: hoje,
        unidadeId: u.id,
        unidadeNome: u.nome,
        itens: CHECKLIST_SAUDE_ITENS.map((it) => ({
          id: it.id,
          label: it.label,
          ok: u.id === 'US-UBS2' ? (it.id !== 'medico' && it.id !== 'insumos') : true,
        })),
        atualizadoEm: new Date().toISOString(),
      }));
      checkAll = checkAll.filter((c) => c.data !== hoje).concat(dayChecks);
      writeTenant(slug, 'saude-checklist.json', checkAll.slice(-90));
    }

    return { ambulancias, leitos, farmacia, checklist: dayChecks };
  }

  function painelSaudeHoje(slug) {
    const hoje = new Date().toISOString().slice(0, 10);
    const unidades = readTenant(slug, 'unidades-saude.json', []);
    let diario = readTenant(slug, 'saude-hoje.json', null);
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
    if (!Array.isArray(plantoes)) plantoes = [];
    const agoraIso = new Date().toISOString();
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
    // Mantém histórico (não apaga dias anteriores)
    writeTenant(slug, 'plantoes.json', plantoes);

    const escalaDia = ensureEscalaHoje(slug, unidades, hoje);
    const agora = Date.now();
    const CHECKIN_MAX_MS = 3 * 60 * 60 * 1000;

    const painel = unidades.map(u => {
      const d = diario.unidades[u.id] || { naFila: 0, atendidosHoje: 0, tempoMedioMin: 0, metaAtendimentos: 50 };
      const plantao = plantoes.find(p => p.unidadeId === u.id && p.data === hoje) || null;
      let plantaoStatus = plantao?.status || 'sem_confirmacao';
      let alertaPlantao = plantaoStatus === 'sem_confirmacao' || plantaoStatus === 'encerrado';
      if (plantao?.ultimoCheckIn && plantaoStatus === 'ativo') {
        const gap = agora - new Date(plantao.ultimoCheckIn).getTime();
        if (gap > CHECKIN_MAX_MS) {
          plantaoStatus = 'checkin_atrasado';
          alertaPlantao = true;
        }
      }
      const escalaUnidade = (escalaDia.itens || []).filter((i) => i.unidadeId === u.id);
      const escalaVaga = escalaUnidade.some((i) => i.status === 'vago' || !i.profissional);
      const alertaFila = (d.naFila || 0) >= 20 || (d.tempoMedioMin || 0) >= 90;
      const alertas = [];
      if (alertaPlantao) {
        alertas.push(plantaoStatus === 'checkin_atrasado'
          ? 'Plantão sem check-in recente'
          : plantaoStatus === 'encerrado'
            ? 'Plantão encerrado — sem cobertura ativa'
            : 'Plantão sem confirmação');
      }
      if (alertaFila) alertas.push('Fila / espera elevada');
      if (escalaVaga) alertas.push('Escala com turno vago');
      return {
        ...u,
        ...d,
        escala: escalaUnidade,
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

    const totais = {
      naFila: painel.reduce((s, u) => s + (u.naFila || 0), 0),
      atendidosHoje: painel.reduce((s, u) => s + (u.atendidosHoje || 0), 0),
      tempoMedioMin: painel.length
        ? Math.round(painel.reduce((s, u) => s + (u.tempoMedioMin || 0), 0) / painel.length)
        : 0,
      unidadesCriticas: painel.filter(u => u.critico).length,
      plantoesOk: painel.filter(u => u.plantao && !u.alertas.some(a => /Plantão/i.test(a))).length,
      plantoesTotal: painel.length,
      reclamacoesAbertas: reclamacoesAbertas.length,
      avaliacoesBaixas: chamadosSaude.filter(c => (c.avaliacao?.nota || 5) <= 2).length,
      metaOk: painel.filter(u => (u.atendidosHoje || 0) >= (u.metaAtendimentos || 0)).length,
      turnosVagos: (escalaDia.itens || []).filter((i) => i.status === 'vago' || !i.profissional).length,
    };

    const alertas = [];
    painel.forEach((u) => {
      (u.alertas || []).forEach((msg) => {
        alertas.push({
          unidadeId: u.id,
          unidade: u.nome,
          tipo: /Plantão/i.test(msg) ? 'plantao' : /Fila/i.test(msg) ? 'fila' : 'escala',
          nivel: u.critico ? 'alto' : 'medio',
          mensagem: msg,
        });
      });
    });

    // Histórico resumido (últimos 7 dias com registro)
    const datas = [...new Set(plantoes.map((p) => p.data).filter(Boolean))].sort().reverse().slice(0, 7);
    const historico = datas.map((data) => {
      const doDia = plantoes.filter((p) => p.data === data);
      const ok = doDia.filter((p) => p.status === 'ativo' || p.status === 'encerrado').length;
      return {
        data,
        unidades: doDia.length,
        cobertos: ok,
        faltas: doDia.filter((p) => !p.profissional || p.status === 'sem_confirmacao').length,
        profissionais: doDia.filter((p) => p.profissional).map((p) => ({
          unidadeId: p.unidadeId,
          profissional: p.profissional,
          cargo: p.cargo,
          status: p.status,
        })),
      };
    });

    let avisos = readTenant(slug, 'saude-avisos.json', []);
    if (!Array.isArray(avisos)) avisos = [];
    const avisosHoje = avisos
      .filter((a) => String(a.criadoEm || '').slice(0, 10) === hoje || a.ativo !== false)
      .slice(0, 20);

    // status operacional por unidade (preenchido pela Secretaria)
    const statusMap = diario.statusUnidades || {};
    painel.forEach((u) => {
      u.statusOperacional = statusMap[u.id] || {
        situacao: u.critico ? 'atencao' : 'normal',
        insumos: 'ok',
        ambulancia: u.tipo === 'hospital' ? 'disponivel' : 'n/a',
        observacao: '',
      };
    });

    const extras = ensureSaudeExtras(slug, unidades, hoje);
    const checklistCriticos = extras.checklist.filter((c) => (c.itens || []).some((i) => i.ok === false));
    const farmBaixo = extras.farmacia.filter((f) => f.estoque === 'baixo' || f.estoque === 'critico');
    const ambIndisp = extras.ambulancias.filter((a) => a.status === 'indisponivel' || a.status === 'oficina');
    const leitosCheios = extras.leitos.filter((l) => l.total > 0 && (l.ocupados / l.total) >= 0.9);

    totais.ambulanciasDisponiveis = extras.ambulancias.filter((a) => a.status === 'disponivel').length;
    totais.ambulanciasTotal = extras.ambulancias.length;
    totais.leitosOcupacaoPct = extras.leitos.length
      ? Math.round((extras.leitos.reduce((s, l) => s + (l.ocupados || 0), 0)
        / Math.max(1, extras.leitos.reduce((s, l) => s + (l.total || 0), 0))) * 100)
      : 0;
    totais.farmaciaAlertas = farmBaixo.length;
    totais.checklistPendentes = checklistCriticos.length;

    farmBaixo.forEach((f) => {
      alertas.push({
        unidadeId: f.unidadeId || null,
        unidade: f.unidadeNome || 'Farmácia',
        tipo: 'farmacia',
        nivel: f.estoque === 'critico' ? 'alto' : 'medio',
        mensagem: `${f.nome}: estoque ${f.estoque}`,
      });
    });
    ambIndisp.forEach((a) => {
      alertas.push({
        unidadeId: null,
        unidade: a.placa || a.id,
        tipo: 'ambulancia',
        nivel: 'alto',
        mensagem: `Ambulância ${a.placa} — ${a.status}`,
      });
    });
    leitosCheios.forEach((l) => {
      alertas.push({
        unidadeId: 'US-HOSP',
        unidade: l.nome,
        tipo: 'leito',
        nivel: 'alto',
        mensagem: `Leitos ${l.nome} em ${Math.round((l.ocupados / l.total) * 100)}%`,
      });
    });

    return {
      data: hoje,
      atualizadoEm: diario.atualizadoEm,
      totais,
      unidades: painel,
      escala: escalaDia,
      alertas,
      historico,
      avisos: avisosHoje,
      ambulancias: extras.ambulancias,
      leitos: extras.leitos,
      farmacia: extras.farmacia,
      checklist: extras.checklist,
      checklistItensModelo: CHECKLIST_SAUDE_ITENS,
      reclamacoes: reclamacoesAbertas.slice(0, 12).map(c => ({
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

  if (pathname === '/api/saude/historico' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const painel = painelSaudeHoje(slug);
    return sendJSON(res, 200, {
      historico: painel.historico,
      plantoes: readTenant(slug, 'plantoes.json', [])
        .filter((p) => p.data)
        .sort((a, b) => String(b.data).localeCompare(String(a.data)))
        .slice(0, 60),
    });
  }

  if (pathname === '/api/saude/escala' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const body = await readBody(req);
    const hoje = new Date().toISOString().slice(0, 10);
    const unidades = readTenant(slug, 'unidades-saude.json', []);
    if (!unidades.find((u) => u.id === body.unidadeId)) {
      return sendJSON(res, 400, { error: 'Unidade inválida' });
    }
    const turno = body.turno || 'manha';
    if (!['manha', 'tarde', 'noite'].includes(turno)) {
      return sendJSON(res, 400, { error: 'Turno inválido' });
    }
    let list = readTenant(slug, 'escalas-saude.json', []);
    if (!Array.isArray(list)) list = [];
    ensureEscalaHoje(slug, unidades, hoje);
    list = readTenant(slug, 'escalas-saude.json', []);
    const day = list.find((d) => d.data === hoje);
    if (!day) return sendJSON(res, 500, { error: 'Escala indisponível' });
    let item = day.itens.find((i) => i.unidadeId === body.unidadeId && i.turno === turno);
    if (!item) {
      item = {
        id: `ESC-${body.unidadeId}-${hoje}-${turno}`,
        unidadeId: body.unidadeId,
        turno,
        profissional: null,
        especialidade: 'Clínica geral',
        status: 'vago',
        ordem: turno === 'manha' ? 0 : turno === 'tarde' ? 1 : 2,
      };
      day.itens.push(item);
    }
    if (body.profissional != null) item.profissional = String(body.profissional).trim() || null;
    if (body.especialidade) item.especialidade = body.especialidade;
    if (body.status) item.status = body.status;
    else if (item.profissional) item.status = item.status === 'vago' ? 'previsto' : item.status;
    else item.status = 'vago';
    day.atualizadoEm = new Date().toISOString();
    writeTenant(slug, 'escalas-saude.json', list);
    pushLog(ctx, slug, 'saude.escala', `${item.unidadeId} ${item.turno} ${item.profissional || 'vago'}`);
    return sendJSON(res, 200, { ok: true, item, painel: painelSaudeHoje(slug) });
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
      if (body.cargo) p.cargo = body.cargo;
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
      diario = { data: hoje, atualizadoEm: new Date().toISOString(), unidades: {}, demoPitch: true };
    }
    const u = diario.unidades[body.unidadeId] || {
      naFila: 0, atendidosHoje: 0, tempoMedioMin: 40, metaAtendimentos: 50,
    };
    if (body.naFila != null) u.naFila = Math.max(0, Number(body.naFila));
    if (body.atendidosHoje != null) u.atendidosHoje = Math.max(0, Number(body.atendidosHoje));
    if (body.tempoMedioMin != null) u.tempoMedioMin = Math.max(0, Number(body.tempoMedioMin));
    if (body.deltaFila != null) u.naFila = Math.max(0, (u.naFila || 0) + Number(body.deltaFila));
    if (body.atender) {
      const n = Number(body.atender) || 1;
      u.atendidosHoje = (u.atendidosHoje || 0) + n;
      u.naFila = Math.max(0, (u.naFila || 0) - n);
    }
    diario.unidades[body.unidadeId] = u;
    diario.atualizadoEm = new Date().toISOString();
    writeTenant(slug, 'saude-hoje.json', diario);
    pushLog(ctx, slug, 'saude.movimento', `${body.unidadeId} fila=${u.naFila}`);
    return sendJSON(res, 200, painelSaudeHoje(slug));
  }

  if (pathname === '/api/saude/status' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const body = await readBody(req);
    const hoje = new Date().toISOString().slice(0, 10);
    const unidades = readTenant(slug, 'unidades-saude.json', []);
    if (!unidades.find((u) => u.id === body.unidadeId)) {
      return sendJSON(res, 400, { error: 'Unidade inválida' });
    }
    let diario = readTenant(slug, 'saude-hoje.json', { data: hoje, unidades: {} });
    if (diario.data !== hoje) {
      diario = { data: hoje, atualizadoEm: new Date().toISOString(), unidades: {}, demoPitch: true, statusUnidades: {} };
    }
    if (!diario.statusUnidades) diario.statusUnidades = {};
    diario.statusUnidades[body.unidadeId] = {
      situacao: body.situacao || 'normal',
      insumos: body.insumos || 'ok',
      ambulancia: body.ambulancia || 'n/a',
      observacao: String(body.observacao || '').trim().slice(0, 280),
      atualizadoEm: new Date().toISOString(),
    };
    diario.atualizadoEm = new Date().toISOString();
    writeTenant(slug, 'saude-hoje.json', diario);
    pushLog(ctx, slug, 'saude.status', `${body.unidadeId} ${body.situacao || 'normal'}`);
    return sendJSON(res, 200, painelSaudeHoje(slug));
  }

  if (pathname === '/api/saude/aviso' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const body = await readBody(req);
    const texto = String(body.texto || '').trim();
    if (!texto) return sendJSON(res, 400, { error: 'Informe o aviso' });
    const unidades = readTenant(slug, 'unidades-saude.json', []);
    const unidade = body.unidadeId ? unidades.find((u) => u.id === body.unidadeId) : null;
    let avisos = readTenant(slug, 'saude-avisos.json', []);
    if (!Array.isArray(avisos)) avisos = [];
    const item = {
      id: `AV-${Date.now()}`,
      unidadeId: unidade?.id || null,
      unidade: unidade?.nome || 'Rede municipal',
      nivel: body.nivel || 'info',
      texto: texto.slice(0, 400),
      ativo: true,
      criadoEm: new Date().toISOString(),
      autor: 'Secretaria de Saúde',
    };
    avisos.unshift(item);
    writeTenant(slug, 'saude-avisos.json', avisos.slice(0, 80));
    pushLog(ctx, slug, 'saude.aviso', item.texto.slice(0, 80));
    return sendJSON(res, 200, { ok: true, aviso: item, painel: painelSaudeHoje(slug) });
  }

  if (pathname === '/api/saude/ambulancia' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const body = await readBody(req);
    const unidades = readTenant(slug, 'unidades-saude.json', []);
    const hoje = new Date().toISOString().slice(0, 10);
    ensureSaudeExtras(slug, unidades, hoje);
    let list = readTenant(slug, 'saude-ambulancias.json', []);
    const idx = list.findIndex((a) => a.id === body.id);
    if (idx < 0) return sendJSON(res, 404, { error: 'Ambulância não encontrada' });
    if (body.status) list[idx].status = body.status;
    if (body.motorista != null) list[idx].motorista = String(body.motorista).trim();
    if (body.base != null) list[idx].base = String(body.base).trim();
    list[idx].atualizadoEm = new Date().toISOString();
    writeTenant(slug, 'saude-ambulancias.json', list);
    pushLog(ctx, slug, 'saude.ambulancia', `${list[idx].placa} ${list[idx].status}`);
    return sendJSON(res, 200, painelSaudeHoje(slug));
  }

  if (pathname === '/api/saude/leitos' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const body = await readBody(req);
    const unidades = readTenant(slug, 'unidades-saude.json', []);
    const hoje = new Date().toISOString().slice(0, 10);
    ensureSaudeExtras(slug, unidades, hoje);
    let list = readTenant(slug, 'saude-leitos.json', []);
    const idx = list.findIndex((l) => l.id === body.id);
    if (idx < 0) return sendJSON(res, 404, { error: 'Tipo de leito não encontrado' });
    if (body.total != null) list[idx].total = Math.max(0, Number(body.total) || 0);
    if (body.ocupados != null) list[idx].ocupados = Math.max(0, Math.min(list[idx].total, Number(body.ocupados) || 0));
    writeTenant(slug, 'saude-leitos.json', list);
    pushLog(ctx, slug, 'saude.leitos', `${list[idx].nome} ${list[idx].ocupados}/${list[idx].total}`);
    return sendJSON(res, 200, painelSaudeHoje(slug));
  }

  if (pathname === '/api/saude/farmacia' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const body = await readBody(req);
    const unidades = readTenant(slug, 'unidades-saude.json', []);
    const hoje = new Date().toISOString().slice(0, 10);
    ensureSaudeExtras(slug, unidades, hoje);
    let list = readTenant(slug, 'saude-farmacia.json', []);
    const idx = list.findIndex((f) => f.id === body.id);
    if (idx < 0) return sendJSON(res, 404, { error: 'Item não encontrado' });
    if (body.estoque) list[idx].estoque = body.estoque;
    if (body.observacao != null) list[idx].observacao = String(body.observacao).trim().slice(0, 200);
    if (body.nome) list[idx].nome = String(body.nome).trim();
    writeTenant(slug, 'saude-farmacia.json', list);
    pushLog(ctx, slug, 'saude.farmacia', `${list[idx].nome} ${list[idx].estoque}`);
    return sendJSON(res, 200, painelSaudeHoje(slug));
  }

  if (pathname === '/api/saude/checklist' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const body = await readBody(req);
    const hoje = new Date().toISOString().slice(0, 10);
    const unidades = readTenant(slug, 'unidades-saude.json', []);
    ensureSaudeExtras(slug, unidades, hoje);
    let checkAll = readTenant(slug, 'saude-checklist.json', []);
    const idx = checkAll.findIndex((c) => c.data === hoje && c.unidadeId === body.unidadeId);
    if (idx < 0) return sendJSON(res, 404, { error: 'Checklist da unidade não encontrado' });
    const itens = Array.isArray(body.itens) ? body.itens : [];
    checkAll[idx].itens = (checkAll[idx].itens || []).map((it) => {
      const found = itens.find((x) => x.id === it.id);
      return found ? { ...it, ok: !!found.ok } : it;
    });
    checkAll[idx].atualizadoEm = new Date().toISOString();
    writeTenant(slug, 'saude-checklist.json', checkAll);
    pushLog(ctx, slug, 'saude.checklist', body.unidadeId);
    return sendJSON(res, 200, painelSaudeHoje(slug));
  }

  if (pathname === '/api/saude/relatorio-dia' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return true;
    const p = painelSaudeHoje(slug);
    const t = p.totais || {};
    const texto = [
      `Resumo do dia ${p.data}: fila ${t.naFila}, plantões ${t.plantoesOk}/${t.plantoesTotal},`,
      `leitos ${t.leitosOcupacaoPct}% ocupados, ambulâncias ${t.ambulanciasDisponiveis}/${t.ambulanciasTotal} livres,`,
      `farmácia com ${t.farmaciaAlertas} alerta(s), checklist com ${t.checklistPendentes} unidade(s) pendente(s).`,
      `${(p.alertas || []).length} alerta(s) ativos.`,
    ].join(' ');
    let avisos = readTenant(slug, 'saude-avisos.json', []);
    if (!Array.isArray(avisos)) avisos = [];
    const item = {
      id: `AV-REL-${Date.now()}`,
      unidadeId: null,
      unidade: 'Rede municipal',
      nivel: (p.alertas || []).length ? 'atencao' : 'info',
      texto: texto.slice(0, 400),
      ativo: true,
      criadoEm: new Date().toISOString(),
      autor: 'Secretaria de Saúde',
      tipo: 'relatorio',
    };
    avisos.unshift(item);
    writeTenant(slug, 'saude-avisos.json', avisos.slice(0, 80));
    pushLog(ctx, slug, 'saude.relatorio', texto.slice(0, 80));
    return sendJSON(res, 200, { ok: true, aviso: item, painel: painelSaudeHoje(slug) });
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
      const MAX_FOTOS = 5;
      const url = body.url || body.foto;
      if (!url || String(url).length < 8) {
        return sendJSON(res, 400, { error: 'Foto inválida' });
      }
      const tipo = body.tipo || 'foto';
      const agora = new Date().toISOString();
      c.anexos = c.anexos || [];
      c.fotosAntes = Array.isArray(c.fotosAntes) ? c.fotosAntes.slice() : [];
      c.fotosDepois = Array.isArray(c.fotosDepois) ? c.fotosDepois.slice() : [];

      if (tipo === 'antes' || tipo === 'foto') {
        if (c.fotosAntes.length >= MAX_FOTOS) {
          return sendJSON(res, 400, { error: `Máximo de ${MAX_FOTOS} fotos do problema` });
        }
        c.fotosAntes.push(url);
        c.anexos.push({ tipo: tipo === 'antes' ? 'antes' : 'foto', url, em: agora, por: currentUser(req)?.nome || 'cidadao' });
      } else if (tipo === 'depois' || tipo === 'foto_depois') {
        if (c.fotosDepois.length >= MAX_FOTOS) {
          return sendJSON(res, 400, { error: `Máximo de ${MAX_FOTOS} fotos do depois` });
        }
        c.fotosDepois.push(url);
        c.anexos.push({ tipo: 'depois', url, em: agora, por: currentUser(req)?.nome || 'campo' });
      } else {
        c.anexos.push({ tipo, url, em: agora, por: currentUser(req)?.nome || 'cidadao' });
      }

      // Capa = primeira foto de cada fase
      c.fotoAntes = c.fotosAntes[0] || c.fotoAntes || null;
      c.fotoDepois = c.fotosDepois[0] || c.fotoDepois || null;
      c.foto = c.fotoAntes || c.foto || null;
      c.atualizadoEm = agora;
      list[idx] = normalizeChamado(c);
      writeTenant(slug, 'chamados.json', list);
      return sendJSON(res, 200, list[idx]);
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
        if (!body.fotoDepois && !c.fotoDepois && !(c.fotosDepois && c.fotosDepois.length)) {
          return sendJSON(res, 400, { error: 'Envie a foto DEPOIS para enviar à secretaria' });
        }
        // Campo NÃO finaliza sozinho — secretaria avalia a foto e aprova
        c.status = 'aguardando_aprovacao';
        c.ordemServico = { ...(c.ordemServico || {}), status: 'aguardando_aprovacao', enviadaEm: now };
        c.fotosDepois = Array.isArray(c.fotosDepois) ? c.fotosDepois.slice() : [];
        if (body.fotoDepois && !c.fotosDepois.includes(body.fotoDepois)) {
          c.fotosDepois.unshift(body.fotoDepois);
        }
        c.fotosDepois = c.fotosDepois.slice(0, 5);
        c.fotoDepois = c.fotosDepois[0] || body.fotoDepois || c.fotoDepois;
        if (!c.fotoAntes && c.foto) c.fotoAntes = c.foto;
        if (body.custo) c.custo = Number(body.custo);
        const nFotos = c.fotosDepois.length;
        c.historico.push({
          em: now,
          status: 'aguardando_aprovacao',
          nota: nFotos > 1
            ? `Campo enviou ${nFotos} fotos do depois — aguardando aprovação da secretaria`
            : 'Campo enviou foto do depois — aguardando aprovação da secretaria',
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
      list[idx] = normalizeChamado(c);
      writeTenant(slug, 'chamados.json', list);
      return sendJSON(res, 200, list[idx]);
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
