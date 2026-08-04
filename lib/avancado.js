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
  { keys: ['buraco', 'asfalto', 'tapa', 'cratera', 'pavimento'], cat: 'buraco', urgencia: 'alta' },
  { keys: ['lamp', 'poste', 'luz', 'apagad', 'ilumina'], cat: 'lampada', urgencia: 'media' },
  { keys: ['lixo', 'entulho', 'saco', 'cacamba'], cat: 'lixo', urgencia: 'media' },
  { keys: ['arvore', 'poda', 'galho'], cat: 'poda', urgencia: 'baixa' },
  { keys: ['calcada', 'passeio', 'meio-fio'], cat: 'calcada', urgencia: 'media' },
  { keys: ['placa', 'sinal', 'semaforo'], cat: 'sinalizacao', urgencia: 'media' },
  { keys: ['agua', 'alag', 'esgoto', 'enchente', 'bueiro'], cat: 'esgoto', urgencia: 'alta' },
];

function analisarFoto({ foto, texto, categorias }) {
  const blob = `${texto || ''}`.toLowerCase();
  const sizeHint = typeof foto === 'string' ? foto.length : 0;
  let best = { cat: 'outros', score: 0.35, urgencia: 'media' };

  for (const h of HINTS) {
    let score = 0;
    for (const k of h.keys) if (blob.includes(k)) score += 0.28;
    if (score > best.score) {
      best = { cat: h.cat, score: Math.min(0.97, 0.55 + score), urgencia: h.urgencia };
    }
  }

  if (!blob.trim() && sizeHint > 500) {
    const h = HINTS[sizeHint % HINTS.length];
    best = { cat: h.cat, score: 0.62 + ((sizeHint % 30) / 100), urgencia: h.urgencia };
  }

  const catObj = (categorias || []).find((c) => c.id === best.cat);
  const label = catObj?.label || best.cat;
  const conf = Math.round(best.score * 100);

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
    modelo: 'municipio-vision-demo-v1',
    aviso: 'Demo local — em produção usa modelo de visão (cloud/edge).',
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
  const abertos = fila.filter((c) => c.status === 'aberto' || c.status === 'em_analise');
  const urgentes = abertos.filter((c) => c.prioridade === 'alta');

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
  roteirizar,
  assistenteSecretaria,
  gerarParecer,
  mensagemWhatsApp,
  haversineKm,
};
