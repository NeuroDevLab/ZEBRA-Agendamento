(() => {
  'use strict';

  const CFG = window.ZEBRA_CONFIG || {};
  const MAX_POR_DIA = 2;
  const DIAS_FUTURO = 365;
  const AQUARIOS = Array.from({ length: 10 }, (_, i) => `R${i + 1}`);
  const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const LS = { tokens: 'zebra.tokens', nome: 'zebra.nome', lab: 'zebra.lab', demo: 'zebra.demo' };

  // ---------- Datas (sempre como texto AAAA-MM-DD, no fuso local) ----------
  const pad = n => String(n).padStart(2, '0');
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDias = (s, n) => { const d = fromISO(s); d.setDate(d.getDate() + n); return toISO(d); };
  const hoje = () => toISO(new Date());
  const amanha = () => addDias(hoje(), 1);
  const montagemDe = postura => addDias(postura, -1);
  const fmtData = s => { const d = fromISO(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const fmtLonga = s => `${DIAS[fromISO(s).getDay()]}, ${fmtData(s)}`;
  const fmtCurta = s => { const d = fromISO(s); return `${DIAS_CURTOS[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
  const fimDeSemana = s => [0, 6].includes(fromISO(s).getDay());

  // ---------- localStorage (tolerante a falhas) ----------
  const lsGet = (k, padrao) => { try { const v = localStorage.getItem(k); return v === null ? padrao : JSON.parse(v); } catch { return padrao; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };

  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    }));

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Backend ----------
  const usarSupabase = Boolean(CFG.supabaseUrl && CFG.supabaseKey);

  async function rpc(fn, body) {
    const resp = await fetch(`${CFG.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: CFG.supabaseKey,
        Authorization: `Bearer ${CFG.supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const texto = await resp.text();
    let dados = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch { dados = texto; }
    if (!resp.ok) throw new Error((dados && dados.message) || `Erro ${resp.status} ao falar com o servidor.`);
    return dados;
  }

  const apiSupabase = {
    listar: (inicio, fim) => rpc('listar_agendamentos', { p_inicio: inicio, p_fim: fim }),
    agendar: a => rpc('agendar', {
      p_pesquisador: a.pesquisador, p_laboratorio: a.laboratorio || null,
      p_aquario: a.aquario, p_data_postura: a.data_postura,
    }),
    cancelar: (id, token) => rpc('cancelar_agendamento', { p_id: id, p_token: token }),
  };

  // Mesmas regras do servidor (supabase/setup.sql), mas guardando no navegador.
  const apiDemo = {
    async listar(inicio, fim) {
      return lsGet(LS.demo, [])
        .filter(a => a.data_postura >= inicio && a.data_postura <= fim)
        .map(({ token, ...publico }) => publico);
    },
    async agendar(a) {
      validar(a);
      const todos = lsGet(LS.demo, []);
      const doDia = todos.filter(x => x.data_postura === a.data_postura);
      if (doDia.some(x => x.aquario === a.aquario)) throw new Error(`O aquário ${a.aquario} já está reservado para esta data de postura.`);
      if (doDia.length >= MAX_POR_DIA) throw new Error('Esta data de postura já tem 2 agendamentos (capacidade máxima de casais).');
      const novo = {
        id: uuid(), token: uuid(),
        pesquisador: a.pesquisador.trim(), laboratorio: (a.laboratorio || '').trim() || null,
        aquario: a.aquario, data_postura: a.data_postura, data_montagem: montagemDe(a.data_postura),
        criado_em: new Date().toISOString(),
      };
      todos.push(novo);
      lsSet(LS.demo, todos);
      return { id: novo.id, token: novo.token, data_montagem: novo.data_montagem };
    },
    async cancelar(id, token) {
      const todos = lsGet(LS.demo, []);
      const resto = todos.filter(x => !(x.id === id && x.token === token));
      lsSet(LS.demo, resto);
      return resto.length < todos.length;
    },
  };

  const api = usarSupabase ? apiSupabase : apiDemo;

  function validar(a) {
    const nome = (a.pesquisador || '').trim();
    if (nome.length < 2) throw new Error('Informe o nome do pesquisador.');
    if (!a.data_postura) throw new Error('Escolha a data da postura.');
    if (a.data_postura < amanha()) throw new Error('A data da postura deve ser a partir de amanhã (os casais são montados no dia anterior).');
    if (a.data_postura > addDias(hoje(), DIAS_FUTURO)) throw new Error('A data da postura está muito distante (máximo de 1 ano).');
    if (!AQUARIOS.includes(a.aquario)) throw new Error('Escolha um aquário matriz (R1 a R10).');
  }

  // ---------- Estado ----------
  const $ = id => document.getElementById(id);
  const el = {
    form: $('form'), nome: $('nome'), lab: $('lab'), data: $('data'), info: $('info-data'),
    aquarios: $('aquarios'), btn: $('btn-agendar'), msg: $('msg'), montagem: $('montagem'),
    cal: $('calendario'), calMes: $('cal-mes'), mesAnt: $('mes-ant'), mesProx: $('mes-prox'),
    lista: $('lista'), status: $('status-conexao'), atualizar: $('btn-atualizar'), demo: $('banner-demo'),
  };

  const estado = {
    agendamentos: [],
    mes: (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })(),
    carregando: false,
  };

  const doDia = data => estado.agendamentos.filter(a => a.data_postura === data);
  const meusTokens = () => lsGet(LS.tokens, {});

  async function carregar() {
    if (estado.carregando) return;
    estado.carregando = true;
    const m = estado.mes;
    const inicioMes = toISO(m);
    const fimMes = toISO(new Date(m.getFullYear(), m.getMonth() + 1, 0));
    const inicio = [inicioMes, addDias(hoje(), -1)].sort()[0];
    const fim = [fimMes, addDias(hoje(), 120)].sort()[1];
    try {
      const lista = await api.listar(inicio, fim);
      estado.agendamentos = (lista || []).sort((a, b) =>
        a.data_postura.localeCompare(b.data_postura) || (a.criado_em || '').localeCompare(b.criado_em || ''));
      const agora = new Date();
      el.status.textContent = `${usarSupabase ? 'Conectado' : 'Modo demonstração'} · atualizado às ${pad(agora.getHours())}:${pad(agora.getMinutes())}`;
    } catch (e) {
      el.status.textContent = `Não foi possível carregar os agendamentos: ${e.message}`;
    } finally {
      estado.carregando = false;
      renderizar();
    }
  }

  // ---------- Renderização ----------
  function renderizar() {
    renderAquarios();
    renderInfoData();
    renderCalendario();
    renderMontagem();
    renderLista();
  }

  function renderAquarios() {
    const data = el.data.value;
    const ocupados = new Map(doDia(data).map(a => [a.aquario, a]));
    const lotado = data && ocupados.size >= MAX_POR_DIA;
    const atual = el.form.querySelector('input[name="aquario"]:checked')?.value;
    el.aquarios.innerHTML = AQUARIOS.map(r => {
      const dono = ocupados.get(r);
      const desabilitado = Boolean(dono) || lotado;
      const marcado = !desabilitado && r === atual;
      return `<label class="aquario" title="${dono ? `Reservado por ${esc(dono.pesquisador)}` : `Aquário ${r}`}">
        <input type="radio" name="aquario" value="${r}"${desabilitado ? ' disabled' : ''}${marcado ? ' checked' : ''}>
        <span>${r}${dono ? '<small>reservado</small>' : ''}</span>
      </label>`;
    }).join('');
  }

  function renderInfoData() {
    const data = el.data.value;
    if (!data) { el.info.innerHTML = ''; el.btn.disabled = false; return; }
    const linhas = [];
    if (data < amanha()) {
      linhas.push(`<div class="linha erro">A postura deve ser a partir de amanhã (${fmtData(amanha())}).</div>`);
    } else {
      const montagem = montagemDe(data);
      linhas.push(`<div class="linha">Os casais serão montados em <strong>${fmtLonga(montagem)}</strong> para a postura de ${fmtLonga(data)}.</div>`);
      const n = doDia(data).length;
      const livres = MAX_POR_DIA - n;
      linhas.push(livres > 0
        ? `<div class="linha">${livres === 1 ? '<strong>1 vaga disponível</strong>' : `<strong>${livres} vagas disponíveis</strong>`} de ${MAX_POR_DIA} nesta data.</div>`
        : `<div class="linha erro"><strong>Data lotada:</strong> já existem ${MAX_POR_DIA} agendamentos. Escolha outra data.</div>`);
      if (fimDeSemana(montagem)) {
        linhas.push(`<div class="linha aviso">Atenção: a montagem cai em um ${DIAS[fromISO(montagem).getDay()]}. Confirme com a equipe do biotério.</div>`);
      }
    }
    el.info.innerHTML = linhas.join('');
    el.btn.disabled = data < amanha() || doDia(data).length >= MAX_POR_DIA;
  }

  function renderCalendario() {
    const m = estado.mes;
    const nomeMes = MESES[m.getMonth()];
    el.calMes.textContent = `${nomeMes[0].toUpperCase()}${nomeMes.slice(1)} de ${m.getFullYear()}`;
    const primeiro = new Date(m.getFullYear(), m.getMonth(), 1);
    const diasNoMes = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const minimo = amanha(), maximo = addDias(hoje(), DIAS_FUTURO), hj = hoje(), sel = el.data.value;
    const celulas = DIAS_CURTOS.map(d => `<div class="cal-sem" role="columnheader">${d}</div>`);
    for (let i = 0; i < primeiro.getDay(); i++) celulas.push('<button class="dia fora" type="button" disabled tabindex="-1" aria-hidden="true"></button>');
    for (let dia = 1; dia <= diasNoMes; dia++) {
      const iso = toISO(new Date(m.getFullYear(), m.getMonth(), dia));
      const n = doDia(iso).length;
      const classe = n === 0 ? 'livre' : n < MAX_POR_DIA ? 'parcial' : 'lotado';
      const fora = iso < minimo || iso > maximo;
      const pontos = fora ? '' : `<span class="vagas">${Array.from({ length: MAX_POR_DIA }, (_, i) => `<i class="${i < n ? 'ocupada' : ''}"></i>`).join('')}</span>`;
      const rotulo = `${fmtLonga(iso)}: ${n} de ${MAX_POR_DIA} agendamentos`;
      celulas.push(`<button type="button" class="dia ${classe}${iso === hj ? ' hoje' : ''}${iso === sel ? ' sel' : ''}" data-dia="${iso}"
        ${fora ? 'disabled' : ''} aria-label="${rotulo}" title="${rotulo}" aria-pressed="${iso === sel}">${dia}${pontos}</button>`);
    }
    el.cal.innerHTML = celulas.join('');
    const mesAtual = new Date(); mesAtual.setDate(1);
    el.mesAnt.disabled = m.getFullYear() * 12 + m.getMonth() <= mesAtual.getFullYear() * 12 + mesAtual.getMonth();
  }

  function itemHtml(a, opcoes = {}) {
    const meu = meusTokens()[a.id];
    const detalhe = [a.laboratorio, opcoes.detalhe].filter(Boolean).map(esc).join(' · ');
    return `<div class="item">
      <span class="tag">${esc(a.aquario)}</span>
      <span class="quem"><strong>${esc(a.pesquisador)}</strong>${detalhe ? `<small>${detalhe}</small>` : ''}</span>
      ${meu && opcoes.cancelavel ? `<button class="link" type="button" data-cancelar="${esc(a.id)}">Cancelar</button>` : ''}
    </div>`;
  }

  function renderMontagem() {
    const blocos = [[hoje(), 'Hoje'], [amanha(), 'Amanhã']].map(([dia, titulo]) => {
      const itens = estado.agendamentos.filter(a => (a.data_montagem || montagemDe(a.data_postura)) === dia);
      return `<div class="bloco">
        <h3>${titulo} <small>· ${fmtLonga(dia)}</small></h3>
        ${itens.length
          ? itens.map(a => itemHtml(a, { detalhe: `postura em ${fmtCurta(a.data_postura)}` })).join('')
          : '<p class="vazio">Nenhum casal para montar.</p>'}
      </div>`;
    });
    el.montagem.innerHTML = blocos.join('');
  }

  function renderLista() {
    const futuros = estado.agendamentos.filter(a => a.data_postura >= hoje());
    if (!futuros.length) { el.lista.innerHTML = '<p class="vazio">Nenhum agendamento futuro.</p>'; return; }
    const datas = [...new Set(futuros.map(a => a.data_postura))];
    el.lista.innerHTML = datas.map(d => {
      const itens = futuros.filter(a => a.data_postura === d);
      const vagas = Array.from({ length: MAX_POR_DIA - itens.length },
        () => '<div class="item livre"><span class="tag">—</span><span class="quem">Vaga disponível</span></div>');
      return `<div class="bloco">
        <h3>Postura ${fmtCurta(d)} <small>· montagem ${fmtCurta(montagemDe(d))}</small></h3>
        ${itens.map(a => itemHtml(a, { cancelavel: true })).join('')}${vagas.join('')}
      </div>`;
    }).join('');
  }

  function mostrarMsg(texto, tipo) {
    el.msg.className = `msg ${tipo || ''}`;
    el.msg.innerHTML = texto;
  }

  // ---------- Ações ----------
  el.form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const agendamento = {
      pesquisador: el.nome.value.trim(),
      laboratorio: el.lab.value.trim(),
      aquario: el.form.querySelector('input[name="aquario"]:checked')?.value,
      data_postura: el.data.value,
    };
    try {
      validar(agendamento);
    } catch (e) {
      mostrarMsg(esc(e.message), 'erro');
      return;
    }
    el.btn.disabled = true;
    mostrarMsg('Enviando…');
    try {
      const r = await api.agendar(agendamento);
      const tokens = meusTokens();
      tokens[r.id] = r.token;
      lsSet(LS.tokens, tokens);
      lsSet(LS.nome, agendamento.pesquisador);
      lsSet(LS.lab, agendamento.laboratorio);
      mostrarMsg(`<strong>Agendado!</strong> Aquário ${esc(agendamento.aquario)} · casais montados em <strong>${fmtLonga(montagemDe(agendamento.data_postura))}</strong> · postura em ${fmtLonga(agendamento.data_postura)}.`, 'ok');
      el.form.querySelectorAll('input[name="aquario"]').forEach(i => { i.checked = false; });
    } catch (e) {
      mostrarMsg(esc(e.message), 'erro');
    }
    await carregar();
  });

  el.data.addEventListener('change', () => {
    const d = el.data.value;
    if (d) estado.mes = new Date(fromISO(d).getFullYear(), fromISO(d).getMonth(), 1);
    mostrarMsg('');
    carregar();
  });

  el.cal.addEventListener('click', ev => {
    const botao = ev.target.closest('[data-dia]');
    if (!botao || botao.disabled) return;
    el.data.value = botao.dataset.dia;
    mostrarMsg('');
    renderizar();
    if (window.matchMedia('(max-width: 860px)').matches) el.data.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  el.mesAnt.addEventListener('click', () => { estado.mes = new Date(estado.mes.getFullYear(), estado.mes.getMonth() - 1, 1); carregar(); });
  el.mesProx.addEventListener('click', () => { estado.mes = new Date(estado.mes.getFullYear(), estado.mes.getMonth() + 1, 1); carregar(); });

  document.addEventListener('click', async ev => {
    const botao = ev.target.closest('[data-cancelar]');
    if (!botao) return;
    const id = botao.dataset.cancelar;
    const a = estado.agendamentos.find(x => x.id === id);
    if (!a || !confirm(`Cancelar o agendamento de ${a.pesquisador} (aquário ${a.aquario}, postura em ${fmtData(a.data_postura)})?`)) return;
    try {
      const tokens = meusTokens();
      const ok = await api.cancelar(id, tokens[id]);
      if (!ok) throw new Error('Não foi possível cancelar (o agendamento pode já ter sido removido).');
      delete tokens[id];
      lsSet(LS.tokens, tokens);
      mostrarMsg('Agendamento cancelado.', 'ok');
    } catch (e) {
      mostrarMsg(esc(e.message), 'erro');
    }
    carregar();
  });

  el.atualizar.addEventListener('click', carregar);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) carregar(); });
  setInterval(() => { if (!document.hidden) carregar(); }, 60000);

  // ---------- Início ----------
  el.demo.hidden = usarSupabase;
  el.nome.value = lsGet(LS.nome, '');
  el.lab.value = lsGet(LS.lab, '');
  el.data.min = amanha();
  el.data.max = addDias(hoje(), DIAS_FUTURO);
  carregar();
})();
