// Módulos avançados — demos prontas para APIs reais depois
function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const HINTS = [
  { keys: ['buraco', 'asfalto', 'tapa', 'cratera', 'pavimento', 'tapa-buraco', 'tapa buraco'], cat: 'buraco', urgencia: 'alta' },
  { keys: ['lamp', 'poste', 'luz', 'apagad', 'ilumina'], cat: 'lampada', urgencia: 'media' },
  { keys: ['lixo', 'entulho', 'saco', 'cacamba'], cat: 'lixo', urgencia: 'media' },
  { keys: ['arvore', 'poda', 'galho'], cat: 'poda', urgencia: 'baixa' },
  { keys: ['calcada', 'passeio', 'meio-fio', 'meiofio'], cat: 'calcada', urgencia: 'media' },
  { keys: ['placa', 'sinal', 'semaforo'], cat: 'sinalizacao', urgencia: 'media' },
  { keys: ['agua', 'alag', 'esgoto', 'enchente', 'bueiro'], cat: 'esgoto', urgencia: 'alta' },
];

function inferCategoriaFromText(texto) {
  const blob = `${texto || ''}`.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  let best = { cat: null, score: 0, urgencia: 'media' };
  for (const h of HINTS) {
    let score = 0;
    for (const k of h.keys) {
      const kk = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (blob.includes(kk)) score += 0.35;
    }
    if (score > best.score) best = { cat: h.cat, score, urgencia: h.urgencia };
  }
  return best.cat ? best : null;
}

/** Plano de serviço ilustrativo por categoria (demo — parece IA já integrada). */
const PLANOS_OBRA = {
  buraco: {
    tipo: 'Buraco em via pública (asfalto)',
    material: 'Massa asfáltica a frio (ou quente, conforme padrão da prefeitura)',
    quantidade: '40–60 kg (cerca de 2 a 3 latas de 20 kg)',
    tempoMedio: '1 h 30 min a 2 h',
    equipe: '2 a 3 pessoas + veículo leve',
    ferramentas: [
      'Pá e enxada',
      'Vassoura de aço',
      'Soquete / compactador manual',
      'Cones e sinalização de via',
      'Luvas e EPI',
      'Carrinho de mão',
    ],
    observacao: 'Limpar bordas, remover material solto, preencher em camadas e compactar.',
  },
  lampada: {
    tipo: 'Lâmpada / iluminação pública apagada',
    material: 'Lâmpada LED pública compatível + reator (se necessário)',
    quantidade: '1 unidade (confirmar modelo do poste no local)',
    tempoMedio: '40 min a 1 h 15 min',
    equipe: '2 pessoas + cesto/escada',
    ferramentas: [
      'Escada ou cesta aérea',
      'Multímetro',
      'Chaves de eletricista',
      'EPI isolante',
      'Cones de sinalização',
    ],
    observacao: 'Desligar circuito se possível; verificar se o problema é lâmpada ou rede.',
  },
  lixo: {
    tipo: 'Acúmulo de lixo / entulho',
    material: 'Sacos reforçados / caçamba (se volume alto)',
    quantidade: 'Conforme volume aparente na foto (estimado 1–3 m³)',
    tempoMedio: '45 min a 1 h 30 min',
    equipe: '2 a 3 pessoas + caminhão/caçamba',
    ferramentas: ['Pá e enxada', 'Vassoura', 'Sacos e luvas', 'Carrinho de mão', 'EPI'],
    observacao: 'Separar reciclável quando possível; registrar volume retirado.',
  },
  poda: {
    tipo: 'Poda / galhos em via ou calçada',
    material: 'Cordas e fitas de isolamento',
    quantidade: 'Kit de poda padrão da equipe',
    tempoMedio: '1 h a 2 h 30 min',
    equipe: '2 a 3 pessoas',
    ferramentas: [
      'Serrote / motosserra (se autorizado)',
      'Tesoura de poda',
      'Escada',
      'Cordas',
      'EPI e cones',
    ],
    observacao: 'Avaliar risco elétrico próximo a fiação antes de cortar.',
  },
  calcada: {
    tipo: 'Calçada / passeio danificado',
    material: 'Cimento, areia e brita (ou placa pré-moldada)',
    quantidade: 'Saco de cimento 50 kg + areia/brita conforme área',
    tempoMedio: '2 h a 4 h',
    equipe: '2 a 3 pessoas',
    ferramentas: [
      'Pá, enxada e colher de pedreiro',
      'Nível e régua',
      'Carrinho de mão',
      'Cones e isolamento',
      'EPI',
    ],
    observacao: 'Medir área no local; ajustar quantidade de material.',
  },
  sinalizacao: {
    tipo: 'Sinalização / placa danificada',
    material: 'Placa de trânsito + parafusos/abraçadeiras',
    quantidade: '1 placa (modelo conforme código da via)',
    tempoMedio: '45 min a 1 h 30 min',
    equipe: '2 pessoas',
    ferramentas: ['Chaves e soquetes', 'Furadeira (se necessário)', 'Escada', 'Cones', 'EPI'],
    observacao: 'Confirmar modelo oficial da placa antes de substituir.',
  },
  esgoto: {
    tipo: 'Esgoto / alagamento / bueiro',
    material: 'Areia, brita e grade/tampa (se houver)',
    quantidade: 'Conforme inspeção in loco',
    tempoMedio: '1 h 30 min a 3 h',
    equipe: '2 a 4 pessoas',
    ferramentas: [
      'Pá e enxada',
      'Gancho de bueiro',
      'Mangueira / bomba (se necessário)',
      'Cones e isolamento',
      'EPI',
    ],
    observacao: 'Prioridade alta se houver risco a pedestres ou trânsito.',
  },
  outros: {
    tipo: 'Ocorrência urbana (análise genérica)',
    material: 'A definir após inspeção',
    quantidade: 'A medir no local',
    tempoMedio: '1 h a 2 h (estimativa inicial)',
    equipe: '2 pessoas',
    ferramentas: ['Kit básico de campo', 'Cones', 'EPI', 'Câmera/celular para registro'],
    observacao: 'Equipe deve validar tipo e material antes de executar.',
  },
};

function planoObraPara(cat) {
  return PLANOS_OBRA[cat] || PLANOS_OBRA.outros;
}

function analisarFoto({ foto, texto, categorias }) {
  const blob = `${texto || ''}`.toLowerCase();
  const sizeHint = typeof foto === 'string' ? foto.length : 0;
  let best = { cat: 'outros', score: 0.35, urgencia: 'media' };

  const inferred = inferCategoriaFromText(texto);
  if (inferred) {
    best = { cat: inferred.cat, score: Math.min(0.97, 0.6 + inferred.score), urgencia: inferred.urgencia };
  } else {
    for (const h of HINTS) {
      let score = 0;
      for (const k of h.keys) if (blob.includes(k)) score += 0.28;
      if (score > best.score) {
        best = { cat: h.cat, score: Math.min(0.97, 0.55 + score), urgencia: h.urgencia };
      }
    }
  }

  // Sem texto: se tem foto, prioriza buraco (caso mais comum da demo) em vez de sortear "outros"
  if (!blob.trim() && sizeHint > 500) {
    best = { cat: 'buraco', score: 0.7, urgencia: 'alta' };
  }

  const catObj = (categorias || []).find((c) => c.id === best.cat);
  const label = catObj?.label || best.cat;
  const conf = Math.round(best.score * 100);
  const plano = planoObraPara(best.cat);

  return {
    categoria: best.cat,
    label,
    secretaria: catObj?.secretaria || 'ouvidoria',
    confianca: conf,
    urgencia: best.urgencia,
    tags: [label, best.urgencia === 'alta' ? 'prioritário' : 'rotina'],
    descricaoSugerida:
      `Identificação automática (${conf}%): possível ${label.toLowerCase()}. ` +
      `Validar com a equipe de campo antes do fechamento.`,
    planoObra: {
      ...plano,
      confianca: conf,
      categoria: best.cat,
      label,
    },
    modelo: 'municipio-vision-demo-v1',
    aviso: 'Análise assistida — validar no local antes de executar.',
  };
}

/** Parecer demo da foto do depois (secretaria avaliando serviço do campo). */
function analisarAprovacao({ fotoAntes, fotoDepois, texto, titulo }) {
  const temAntes = !!(fotoAntes && String(fotoAntes).length > 8);
  const temDepois = !!(fotoDepois && String(fotoDepois).length > 8);
  const blob = `${titulo || ''} ${texto || ''}`.toLowerCase();

  let parecer = 'ok';
  let confianca = 78;
  const pontos = [];

  if (!temDepois) {
    parecer = 'revisar';
    confianca = 40;
    pontos.push('Não encontrei a foto do depois para comparar.');
  } else {
    pontos.push('Foto do depois recebida do campo.');
    if (temAntes) pontos.push('Há registro do antes para comparar o serviço.');
    else pontos.push('Sem foto do antes — avalie só pelo depois e pela descrição.');
    if (/buraco|asfalto|tapa/.test(blob)) {
      pontos.push('O serviço parece alinhado a tapa-buraco / recuperação de via.');
      confianca = 86;
    }
    pontos.push('Área aparenta tratada; confira se a compactação e a sinalização ficaram ok.');
  }

  const recomendacao =
    parecer === 'ok'
      ? 'Pelo que vejo, pode aprovar e finalizar — se algo no local não bater, devolva ao campo.'
      : 'Sugiro não aprovar ainda — peça ajuste ou nova foto ao campo.';

  return {
    parecer,
    confianca,
    label: parecer === 'ok' ? 'Serviço aparenta concluído' : 'Revisar antes de aprovar',
    pontos,
    recomendacao,
    modelo: 'municipio-aprovacao-demo-v1',
    aviso: 'Sugestão da assistente — a decisão final é da secretaria.',
  };
}

function roteirizar({ origem, pontos, max = 12 }) {
  const left = pontos.filter((p) => p.lat != null && p.lng != null).slice(0, max);
  const route = [];
  let current = { lat: origem.lat, lng: origem.lng };
  let totalKm = 0;

  while (left.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < left.length; i++) {
      const d = haversineKm(current, left[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = left.splice(bestIdx, 1)[0];
    totalKm += bestDist;
    route.push({
      ...next,
      distanciaKm: Math.round(bestDist * 100) / 100,
      ordem: route.length + 1,
      etaMin: Math.round((bestDist / 25) * 60),
    });
    current = next;
  }

  return {
    rota: route,
    totalKm: Math.round(totalKm * 100) / 100,
    tempoEstimadoMin: route.reduce((s, r) => s + r.etaMin, 0) + route.length * 15,
    algoritmo: 'nearest-neighbor por secretaria',
  };
}

function assistenteSecretaria({ mensagem, chamados, secretaria, cidade }) {
  const q = (mensagem || '').toLowerCase();
  const fila = (chamados || []).filter((c) => !secretaria || c.secretaria === secretaria);
  const abertos = fila.filter((c) => c.status === 'aberto' || c.status === 'em_analise' || c.status === 'novo');
  const urgentes = abertos.filter((c) => c.prioridade === 'alta' || c.prioridade === 'urgente');

  if (q.includes('prioriz') || q.includes('urgente') || q.includes('primeiro')) {
    const top = (urgentes.length ? urgentes : abertos)
      .slice(0, 5)
      .map((c) => `${c.id} · ${c.titulo} · ${c.bairro}`)
      .join('\n') || 'Nenhum chamado pendente.';
    return { reply: `Priorização sugerida (${cidade}):\n${top}` };
  }

  if (q.includes('parecer') || q.includes('relatório') || q.includes('relatorio')) {
    const c = abertos[0];
    if (!c) return { reply: 'Não há chamado aberto para parecer.' };
    const p = gerarParecer(c, cidade);
    return { reply: p.resumo, parecer: p };
  }

  if (q.includes('whatsapp') || q.includes('avisar')) {
    return { reply: 'Use WhatsApp no chamado ou o módulo /whatsapp.html para avisar o cidadão.' };
  }

  if (q.includes('rota') || q.includes('campo')) {
    return { reply: `${abertos.length} na fila. Abra /equipes.html para a rota do dia.` };
  }

  return {
    reply:
      `Assistente da secretaria: ${abertos.length} abertos, ${urgentes.length} urgentes. ` +
      `Peça: priorizar, gerar parecer, rota ou WhatsApp.`,
  };
}

/** Assistente do Gabinete — resumos para o prefeito/prefeita. */
function assistenteGabinete({
  opcao,
  chamados = [],
  obras = [],
  metricas = {},
  cidade = 'Município',
  cargo = 'prefeito',
  iluminacaoPainel = null,
  obrasPainel = null,
}) {
  const pend = chamados.filter((c) =>
    !['concluido', 'cancelado'].includes(c.status)
  );
  const criticos = pend.filter((c) =>
    c.prioridade === 'alta' || c.prioridade === 'urgente' || c.status === 'aguardando_aprovacao'
  );
  const aguardAprov = pend.filter((c) => c.status === 'aguardando_aprovacao');
  const saude = pend.filter((c) => c.secretaria === 'saude');
  const eventos = pend.filter((c) => c.secretaria === 'eventos');
  const iluminacao = pend.filter((c) => c.secretaria === 'iluminacao');
  const obrasFila = pend.filter((c) => c.secretaria === 'obras');
  const cidadeFila = pend.filter((c) =>
    !['saude', 'eventos', 'iluminacao', 'obras'].includes(c.secretaria)
  );
  const obrasAndamento = obras.filter((o) => o.status === 'em_andamento' || o.status === 'andamento');
  const obrasAtrasadas = obras.filter((o) => o.status === 'atrasada');
  const obrasOk = obras.filter((o) => o.status === 'concluida' || o.status === 'concluido');
  const tratamento = cargo === 'prefeita' ? 'Senhora prefeita' : 'Senhor prefeito';
  const ilu = iluminacaoPainel || null;
  const iluT = ilu?.totais || {};
  const obr = obrasPainel || null;
  const obrT = obr?.totais || {};

  const topBairros = {};
  cidadeFila.forEach((c) => {
    const b = c.bairro || 'Sem bairro';
    topBairros[b] = (topBairros[b] || 0) + 1;
  });
  const bairrosRank = Object.entries(topBairros)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([b, n]) => `${b} (${n})`)
    .join(', ') || 'sem concentração clara';

  const concluidos = chamados.filter((c) => c.status === 'concluido').length;
  const emExecucao = pend.filter((c) =>
    ['em_execucao', 'encaminhado', 'em_analise', 'aguardando_material'].includes(c.status)
  ).length;
  const novos = pend.filter((c) => c.status === 'novo' || c.status === 'aberto').length;

  if (opcao === 'plataforma' || opcao === 'geral') {
    const nota =
      (metricas.taxaResolucao >= 70 ? 'boa' :
        metricas.taxaResolucao >= 40 ? 'regular' : 'preocupante');
    return {
      titulo: 'Análise geral da cidade na plataforma',
      reply:
        `${tratamento}, analisei ${cidade} de modo geral na plataforma.\n\n` +
        `Visão geral: ${chamados.length} chamado(s) no histórico · ${pend.length} ainda abertos · ${concluidos} concluídos · resolução ${metricas.taxaResolucao ?? '—'}% (${nota}).\n\n` +
        `Operação agora: ${novos} novo(s) · ${emExecucao} em tratamento · ${aguardAprov.length} aguardando aprovação da foto do campo · ${criticos.length} crítico(s).\n\n` +
        `Por eixo: Cidade ${cidadeFila.length} · Obras ${obrasFila.length} · Iluminação ${iluminacao.length} · Saúde ${saude.length} · Eventos ${eventos.length}.\n` +
        `Obras transparentes: ${obrasOk.length} concluída(s), ${obrasAndamento.length} em andamento, ${obrasAtrasadas.length} atrasada(s).\n` +
        `Bairros com mais demanda: ${bairrosRank}.\n\n` +
        `Leitura: a plataforma mostra onde a gestão precisa olhar primeiro — use as abas Cidade, Obras, Iluminação, Saúde e Eventos para decidir, priorizar e cobrar.`,
    };
  }

  if (opcao === 'cidade') {
    return {
      titulo: 'Situação da cidade hoje',
      reply:
        `${tratamento}, em ${cidade} há ${pend.length} pendência(s) no sistema. ` +
        `Nos serviços urbanos (limpeza/trânsito): ${cidadeFila.length} abertas. Obras: ${obrasFila.length}. ` +
        `Taxa de resolução geral: ${metricas.taxaResolucao ?? '—'}%. ` +
        `Bairros com mais demanda: ${bairrosRank}. ` +
        (aguardAprov.length
          ? `${aguardAprov.length} serviço(s) do campo aguardam sua secretaria aprovar a foto do depois.`
          : 'Nenhum serviço aguardando aprovação de foto neste momento.'),
    };
  }

  if (opcao === 'projetos') {
    const quente = (obr?.pontosQuentes || []).find((p) => p.status !== 'concluido');
    return {
      titulo: 'Projetos e obras',
      reply:
        `${tratamento}, no painel de obras transparentes: ${obras.length} obra(s) cadastrada(s) — ` +
        `${obrasOk.length} concluída(s), ${obrasAndamento.length} em andamento, ${obrasAtrasadas.length} atrasada(s). ` +
        (obrasAtrasadas.length
          ? `Atenção: ${obrasAtrasadas.slice(0, 3).map((o) => o.nome || o.titulo || o.id).join('; ')}. `
          : 'Nenhuma obra marcada como atrasada agora. ') +
        (obr
          ? `Operação do dia: ${obrT.pontosAbertos ?? 0} ponto(s) quente(s), ${obrT.equipesEmCampo ?? 0} equipe(s) em campo, frota ${obrT.frotaLivre ?? 0}/${obrT.frotaTotal ?? 0}. `
          : '') +
        (quente ? `Ponto quente agora: ${quente.titulo} (${quente.bairro}). ` : '') +
        `Abra a aba Obras do Gabinete para acompanhar e cobrar.`,
    };
  }

  if (opcao === 'reunioes') {
    return {
      titulo: 'Reuniões e agenda',
      reply:
        `${tratamento}, no eixo de Eventos há ${eventos.length} pendência(s) de estrutura/agenda. ` +
        `Sugestão de pauta para hoje: 1) revisar fila crítica da cidade (${criticos.length} itens); ` +
        `2) cobrar secretarias com SLA estourado; ` +
        `3) conferir eventos próximos e pendências de apoio. ` +
        `Use a aba Eventos do gabinete para ver a agenda e determinar prazo.`,
    };
  }

  if (opcao === 'priorizar') {
    const top = criticos.slice(0, 5).map((c) =>
      `${c.protocolo || c.id} · ${c.titulo} · ${c.bairro || '—'} (${c.secretaria || '—'})`
    );
    return {
      titulo: 'O que priorizar agora',
      reply:
        `${tratamento}, eu priorizaria nesta ordem:\n` +
        (top.length ? top.map((t, i) => `${i + 1}. ${t}`).join('\n') : '1. Nenhuma crítica aberta — foque em acompanhar resolução.') +
        `\nTambém vale cobrar as ${aguardAprov.length} foto(s) do campo ainda sem aprovação da secretaria.`,
    };
  }

  if (opcao === 'saude') {
    return {
      titulo: 'Saúde em resumo',
      reply:
        `${tratamento}, na Saúde há ${saude.length} ocorrência(s)/pendência(s) no sistema. ` +
        `Abra a aba Saúde do gabinete para ver fila, plantão e visitas surpresa. ` +
        `Se quiser pressão imediata, use Cobrar na unidade com alerta.`,
    };
  }

  if (opcao === 'iluminacao') {
    const alertas = (ilu?.alertas || []).length;
    return {
      titulo: 'Iluminação em resumo',
      reply:
        `${tratamento}, na Iluminação Pública: ` +
        `${iluT.apagados ?? '—'} poste(s) apagado(s), ${iluT.emReparo ?? 0} em reparo, ${iluT.semEnergia ?? 0} sem energia · ` +
        `rota da noite com ${iluT.rotaPendentes ?? 0} ponto(s) · frota ${iluT.frotaLivre ?? 0}/${iluT.frotaTotal ?? 0} livre · ` +
        `${iluT.estoqueBaixo ?? 0} item(ns) de estoque baixo · ${iluminacao.length || iluT.chamadosAbertos || 0} chamado(s) aberto(s)` +
        (alertas ? ` · ${alertas} alerta(s) operacional(is)` : '') +
        `. Abra a aba Iluminação do Gabinete para acompanhar (somente visualização) e cobrar a secretaria.`,
    };
  }

  if (opcao === 'obras') {
    const alertas = (obr?.alertas || []).length;
    const quente = (obr?.pontosQuentes || []).find((p) => p.status !== 'concluido');
    return {
      titulo: 'Obras em resumo',
      reply:
        `${tratamento}, na Secretaria de Obras: ` +
        `${obrT.pontosAbertos ?? '—'} ponto(s) quente(s), ${obrT.pontosAlta ?? 0} alta prioridade · ` +
        `rota com ${obrT.rotaPendentes ?? 0} · equipes em campo ${obrT.equipesEmCampo ?? 0} · ` +
        `frota ${obrT.frotaLivre ?? 0}/${obrT.frotaTotal ?? 0} · materiais baixos ${obrT.materiaisBaixos ?? 0} · ` +
        `obras atrasadas ${obrT.obrasAtrasadas ?? obrasAtrasadas.length} · ${obrasFila.length || obrT.osAbertas || 0} chamado(s)` +
        (quente ? ` · foco: ${quente.titulo}` : '') +
        (alertas ? ` · ${alertas} alerta(s)` : '') +
        `. Abra a aba Obras do Gabinete para acompanhar (somente visualização) e cobrar a secretaria.`,
    };
  }

  return {
    titulo: 'Como posso ajudar',
    reply:
      `${tratamento}, posso falar sobre a cidade hoje, projetos/obras, reuniões/agenda, prioridades, saúde, iluminação ou obras. Escolha uma opção.`,
  };
}

function gerarParecer(chamado, cidade) {
  const dias = Math.max(
    0,
    Math.round((Date.now() - new Date(chamado.criadoEm).getTime()) / 86400000)
  );
  const corpo = `PARECER TÉCNICO AUTOMÁTICO
Prefeitura de ${cidade || 'Município'}
Protocolo: ${chamado.protocolo} (${chamado.id})

1. IDENTIFICAÇÃO
Categoria: ${chamado.titulo}
Secretaria: ${chamado.secretaria}
Bairro: ${chamado.bairro}
Endereço: ${chamado.endereco || '—'}
Prioridade: ${chamado.prioridade} | Status: ${chamado.status} | Dias: ${dias}

2. RELATO
${chamado.descricao || '—'}
Solicitante: ${chamado.cidadao?.nome || '—'} · ${chamado.cidadao?.telefone || '—'}

3. RECOMENDAÇÃO
- Inspeção in loco; registro fotográfico antes/depois; atualizar status no sistema.

4. CONCLUSÃO
Gerado em ${new Date().toLocaleString('pt-BR')}. Sujeito à validação técnica.`;

  return {
    titulo: `Parecer ${chamado.protocolo}`,
    resumo: `Parecer ${chamado.protocolo} (${chamado.titulo}, ${chamado.bairro}) — ${dias}d aberto.`,
    corpo,
    geradoEm: new Date().toISOString(),
  };
}

function mensagemWhatsApp(chamado, cidade, tipo = 'status') {
  const nome = chamado.cidadao?.nome || 'cidadão';
  let texto;
  if (tipo === 'abertura') {
    texto = `Olá, ${nome}! Chamado registrado na Prefeitura de ${cidade}. Protocolo *${chamado.protocolo}* (${chamado.titulo}).`;
  } else if (tipo === 'conclusao') {
    texto = `Olá, ${nome}! Seu chamado *${chamado.protocolo}* foi *concluído*. Obrigado por colaborar com ${cidade}.`;
  } else {
    texto = `Atualização ${cidade}: protocolo *${chamado.protocolo}* → *${String(chamado.status).replace(/_/g, ' ')}*.`;
  }
  const tel = String(chamado.cidadao?.telefone || '').replace(/\D/g, '');
  const phone = tel.length >= 10 ? `55${tel}` : '';
  const link = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/?text=${encodeURIComponent(texto)}`;
  return { texto, link, telefone: phone || null };
}

module.exports = {
  analisarFoto,
  analisarAprovacao,
  inferCategoriaFromText,
  roteirizar,
  assistenteSecretaria,
  assistenteGabinete,
  gerarParecer,
  mensagemWhatsApp,
  haversineKm,
};
