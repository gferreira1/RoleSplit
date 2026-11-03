import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { initializeFirestore, doc, setDoc, getDoc, getDocs, deleteDoc, onSnapshot, collection, updateDoc, arrayUnion, arrayRemove }
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getAuth, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, EmailAuthProvider, reauthenticateWithCredential, deleteUser, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
const auth = getAuth(app);

const IMG_FALLBACK = 'img/default.jpg';

// ============================================================
// TIPOS E REFINAMENTOS (cascata)
// ============================================================
const TIPOS = {
  Festa:      { emoji: '🎉', refinamentos: ['Pagode', 'Sertanejo', 'Rock', 'Funk', 'Eletrônico', 'Ao vivo'] },
  Churrasco:  { emoji: '🍖', refinamentos: ['Laje', 'Piscina', 'Parcão', 'Casa'] },
  Aventura:   { emoji: '🥾', refinamentos: ['Cachoeiras', 'Trilhas', 'Camping', 'Rapel', 'Escalada'] },
  Praia:      { emoji: '🏖️', refinamentos: ['Mar', 'Rio', 'Lagoa'] },
  Esporte:    { emoji: '⚽', refinamentos: ['Futebol', 'Vôlei', 'Corrida', 'Ciclismo'] },
  Outro:      { emoji: '📦', refinamentos: [] },
};

// ============================================================
// NORMALIZADORES DE DATA (A PROVA DE FALHAS)
// ============================================================
function paraTimestamp(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return valor;
  
  const str = String(valor).trim();
  
  // Se for timestamp em string (ex: "1796162400000")
  const comoNum = Number(str);
  if (!isNaN(comoNum) && str.length >= 10) return comoNum;
  
  // Tenta formato ISO ou BR (ex: "2024-11-01" ou "01/11/2024")
  let d = new Date(str);
  if (!isNaN(d.getTime())) return d.getTime();
  
  // Tenta DD/MM/YYYY manualmente (caso o navegador falhe)
  const br = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return 0;
}

function ehFuturo(dataDoItem) {
  const ts = paraTimestamp(dataDoItem);
  if (!ts) return false; 
  
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  
  return ts >= hoje.getTime();
}

// ============================================================
// IBGE — Estados e Cidades da Região Sul (com cache)
// ============================================================
const IBGE_BASE = 'https://servicodados.ibge.gov.br/api/v1/localidades';
const CACHE_ESTADOS = 'ibge_estados_v1';
const CACHE_CIDADES_PREFIX = 'ibge_cidades_v1_';
const CACHE_TTL = 1000 * 60 * 60 * 24 * 30;

function _cacheValido(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return false;
  try { return (Date.now() - JSON.parse(raw).ts) < CACHE_TTL; } catch { return false; }
}

async function buscarEstadosSul() {
  if (_cacheValido(CACHE_ESTADOS)) return JSON.parse(localStorage.getItem(CACHE_ESTADOS)).data;
  const res = await fetch(`${IBGE_BASE}/regioes/4/estados`);
  const todos = await res.json();
  const estados = todos.map(e => ({ sigla: e.sigla, nome: e.nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  localStorage.setItem(CACHE_ESTADOS, JSON.stringify({ ts: Date.now(), data: estados }));
  return estados;
}

async function buscarCidadesSul(uf) {
  const key = CACHE_CIDADES_PREFIX + uf;
  if (_cacheValido(key)) return JSON.parse(localStorage.getItem(key)).data;
  const res = await fetch(`${IBGE_BASE}/estados/${uf}/municipios`);
  const cidades = (await res.json()).map(c => c.nome).sort((a, b) => a.localeCompare(b));
  localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: cidades }));
  return cidades;
}

function normalizarCidade(c) {
  if (!c) return '';
  return String(c)
    .replace(/\s*-\s*RS$/i, '')
    .replace(/\s*-\s*SC$/i, '')
    .replace(/\s*-\s*PR$/i, '')
    .trim()
    .toLowerCase();
}

function extrairSiglaEstado(item) {
  if (item.estado) return String(item.estado).toUpperCase();
  const c = item.cidade || '';
  const m = c.match(/-\s*(RS|SC|PR)\s*$/i);
  if (m) return m[1].toUpperCase();
  return '';
}

// ============ ESTADO GLOBAL ============
let usuarioAtual = localStorage.getItem('rolesplit_usuario') || '';
let usuarioEmail = '';
let usuarioLogado = false;
let todosOsRoles = [];
let roles = [];
let roleSelecionadoId = null;
let rolePainelAberto = null;
let acaoPendentePosLogin = null;
let senhaReauth = '';
let excluirEmAndamento = false;

let perfilPublicoEmail = '';

// Filtros
let termoBusca = '';
let filtroEstadoAtual = 'todos';
let filtroCidadeAtual = 'todas';
let filtroLocalAtual = 'todos';
let filtroTipoAtual = 'todos';
let filtroRefinamentoAtual = 'todos';

// Formulário
let tipoSelecionado = null;
let refinamentoSelecionado = null;
let ehPrivado = true;

// ============ HELPERS ============
function imagemValida(url) {
  if (!url || typeof url !== 'string' || url.trim() === '') return IMG_FALLBACK;
  return url;
}

function toast(msg, erro = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.innerText = msg;
  t.className = 'toast ativo' + (erro ? ' erro' : '');
  setTimeout(() => t.classList.remove('ativo'), 2800);
}

function formatarReal(v) { return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function formatarData(ts) { 
  const t = paraTimestamp(ts);
  if (!t) return 'Data não informada';
  return new Date(t).toLocaleDateString('pt-BR'); 
}
function formatarDataLong(ts) { 
  const t = paraTimestamp(ts);
  if (!t) return 'Data não informada';
  return new Date(t).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); 
}

function gerarCodigo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function normalizarEmail(e) { return (e || '').toLowerCase().trim(); }

function getDeviceId() {
  let id = localStorage.getItem('deviceId');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('deviceId', id);
  }
  return id;
}

// ============ MENU LATERAL ============
window.toggleMenu = function() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && overlay) {
    sidebar.classList.toggle('ativo');
    overlay.classList.toggle('ativo');
  }
};

function atualizarMenuLateral() {
  const avatar = document.getElementById('menuAvatar');
  const nome = document.getElementById('menuNome');
  const email = document.getElementById('menuEmail');
  const btnLogout = document.getElementById('btnMenuLogout');
  const botoesVisitante = document.getElementById('menuBotoesVisitante');

  if (!avatar || !nome || !email) return;

  if (usuarioLogado) {
    avatar.innerText = (usuarioAtual || '?')[0].toUpperCase();
    avatar.style.background = '#3b82f6';
    nome.innerText = usuarioAtual;
    email.innerText = usuarioEmail;
    if (botoesVisitante) botoesVisitante.style.display = 'none';
    if (btnLogout) btnLogout.style.display = 'block';
  } else {
    avatar.innerText = '?';
    avatar.style.background = '#475569';
    nome.innerText = 'Visitante';
    email.innerText = 'Acesse para criar roles';
    if (botoesVisitante) botoesVisitante.style.display = 'flex';
    if (btnLogout) btnLogout.style.display = 'none';
  }
}

// ============ PERMISSÕES ============
function ehAdminDoRole(r) {
  if (!r) return false;
  const emailLogado = normalizarEmail(usuarioEmail);
  if (r.adminEmail && emailLogado && normalizarEmail(r.adminEmail) === emailLogado) return true;
  if (r.admin === usuarioAtual) return true;
  if (r.admin && usuarioAtual && r.admin.toLowerCase() === usuarioAtual.toLowerCase()) return true;
  return false;
}

function ehParticipanteDoRole(r) {
  if (!r) return false;
  const emailLogado = normalizarEmail(usuarioEmail);
  if (r.participantesEmails && emailLogado && r.participantesEmails.map(normalizarEmail).includes(emailLogado)) return true;
  if ((r.participantes || []).includes(usuarioAtual)) return true;
  return false;
}

// ============ AUTH STATE ============
onAuthStateChanged(auth, (user) => {
  if (user && !user.isAnonymous) {
    usuarioLogado = true;
    usuarioEmail = user.email || '';
    if (user.displayName) {
      usuarioAtual = user.displayName;
      localStorage.setItem('rolesplit_usuario', usuarioAtual);
    }
    document.getElementById('loadingOverlay').style.display = 'none';
    atualizarPerfilUI();
    atualizarMenuLateral();
    escutarRolesFirebase();
    if (acaoPendentePosLogin) {
      const acao = acaoPendentePosLogin;
      acaoPendentePosLogin = null;
      setTimeout(() => executarAcao(acao), 300);
    }
  } else if (user && user.isAnonymous) {
    document.getElementById('loadingOverlay').style.display = 'none';
    escutarRolesFirebase();
    atualizarPerfilUI();
    atualizarMenuLateral();
  } else {
    signInAnonymously(auth).then(() => {
      usuarioLogado = false;
      document.getElementById('loadingOverlay').style.display = 'none';
      atualizarPerfilUI();
      atualizarMenuLateral();
      escutarRolesFirebase();
    }).catch(err => {
      console.error("Erro auth:", err);
      document.getElementById('loadingText').innerHTML =
        '<b style="color:#ef4444;">❌ ERRO DE CONEXÃO</b><br><br>' +
        '<span style="font-size:12px;">' + err.code + '</span>';
      const sp = document.getElementById('loadingSpinner');
      if (sp) sp.style.display = 'none';
    });
  }
});

// ============ ESCUTA FIREBASE (BLINDADA) ============
function escutarRolesFirebase() {
  onSnapshot(collection(db, "roles"), (snapshotRoles) => {
    todosOsRoles = [];
    snapshotRoles.forEach(d => todosOsRoles.push({ id: d.id, ...d.data() }));

    // 1. Filtra os roles normais (privados e públicos)
    const rolesPublicos = todosOsRoles.filter(r => {
      const publico = (r.privado === false || r.privado === undefined);
      if (!publico) return false;
      
      // Se for evento fixo (ex: ponto turístico), aparece sempre
      if (r.fixo === true) return true;
      
      // Se não tem data, aparece
      if (!r.data) return true;
      
      // Se tem data, só aparece se for hoje ou no futuro
      return ehFuturo(r.data);
    });

    // 2. Filtra os eventos da cidade
    onSnapshot(collection(db, "eventosCidade"), (snapshotEventos) => {
      const eventosCidade = [];
      snapshotEventos.forEach(d => {
        const ev = { id: d.id, ...d.data() };
        
        // REGRA: SÓ APARECE SE FOR FUTURO. AQUI NÃO TEM DESCULPA DE "FIXO".
        // Se por acaso o banco tiver eventos antigos com 'fixo: true', eles vão cair aqui.
        if (ehFuturo(ev.data)) {
          eventosCidade.push(ev);
        }
      });

      // Junta tudo
      roles = [...eventosCidade, ...rolesPublicos];
      
      // Ordena do mais próximo para o mais distante
      roles.sort((a, b) => {
        return paraTimestamp(a.data) - paraTimestamp(b.data);
      });

      aplicarFiltros();

      if (document.getElementById('tela-meus').classList.contains('ativa')) renderizarMeusRoles();
      if (roleSelecionadoId) abrirModalDetalhes(roleSelecionadoId);
      if (rolePainelAberto) renderizarPainel();
    });
  }, (err) => {
    console.error("Erro ao escutar roles:", err);
  });
}

// ============ FILTROS ============
function abrirModalFiltros() {
  const selEstado = document.getElementById('filtroEstadoSelect');
  if (selEstado) {
    selEstado.innerHTML = `<option value="todos">Todos</option>
      <option value="RS">RS</option><option value="SC">SC</option><option value="PR">PR</option>`;
    selEstado.value = filtroEstadoAtual;
  }

  const selTipo = document.getElementById('filtroTipoSelect');
  if (selTipo) {
    selTipo.innerHTML = '<option value="todos">Todos os tipos</option>' +
      Object.keys(TIPOS).map(t => `<option value="${t}">${TIPOS[t].emoji} ${t}</option>`).join('');
    selTipo.value = filtroTipoAtual;
  }

  atualizarFiltroCidades();
  atualizarFiltroRefinamentos();

  document.getElementById('modalFiltros').classList.add('ativo');

  buscarEstadosSul().then(estados => {
    if (!selEstado || !estados || estados.length === 0) return;
    const atual = selEstado.value;
    selEstado.innerHTML = '<option value="todos">Todos</option>' +
      estados.map(e => `<option value="${e.sigla}">${e.nome}</option>`).join('');
    selEstado.value = atual;
  }).catch(() => {});
}

function atualizarFiltroCidades() {
  const uf = document.getElementById('filtroEstadoSelect')?.value || 'todos';
  filtroEstadoAtual = uf;

  const selCidade = document.getElementById('filtroCidadeSelect');
  const selLocal = document.getElementById('filtroLocalSelect');
  if (!selCidade) return;
  if (selLocal) selLocal.innerHTML = '<option value="todos">Todos os locais</option>';

  if (uf === 'todos') {
    selCidade.innerHTML = '<option value="todas">Todas</option>';
    filtroCidadeAtual = 'todas';
    return;
  }

  const cidadesSet = new Set();
  roles.forEach(item => {
    const sigla = extrairSiglaEstado(item);
    if (sigla === uf) {
      const cid = normalizarCidade(item.cidade);
      if (cid) {
        const original = String(item.cidade).replace(/\s*-\s*(RS|SC|PR)\s*$/i, '').trim();
        if (original) cidadesSet.add(original);
      }
    }
  });

  let html = '<option value="todas">Todas</option>';
  Array.from(cidadesSet).sort((a, b) => a.localeCompare(b)).forEach(c => {
    html += `<option value="${c}">${c}</option>`;
  });
  selCidade.innerHTML = html;
  selCidade.value = filtroCidadeAtual;
  if (![...selCidade.options].some(o => o.value === filtroCidadeAtual)) {
    selCidade.value = 'todas';
    filtroCidadeAtual = 'todas';
  }

  buscarCidadesSul(uf).then(cidades => {
    if (!cidades || cidades.length === 0) return;
    const atual = selCidade.value;
    let html2 = '<option value="todas">Todas</option>';
    cidades.forEach(c => { html2 += `<option value="${c}">${c}</option>`; });
    selCidade.innerHTML = html2;
    selCidade.value = atual;
    if (![...selCidade.options].some(o => o.value === atual)) {
      selCidade.value = 'todas';
      filtroCidadeAtual = 'todas';
    }
  }).catch(() => {});
}

function atualizarLocaisPorCidade() {
  const cidade = document.getElementById('filtroCidadeSelect')?.value || 'todas';
  filtroCidadeAtual = cidade;

  const selLocal = document.getElementById('filtroLocalSelect');
  if (!selLocal) return;

  const locaisSet = new Set();
  roles.forEach(item => {
    if (item.tipo !== 'evento-cidade' && !item.local) return;
    const cidItem = normalizarCidade(item.cidade);
    if (cidade === 'todas' || cidItem === normalizarCidade(cidade)) {
      if (item.local) locaisSet.add(item.local.trim());
    }
  });

  let html = '<option value="todos">🗺️ Todos os locais</option>';
  Array.from(locaisSet).sort((a, b) => a.localeCompare(b)).forEach(l => {
    html += `<option value="${l.toLowerCase()}">📍 ${l}</option>`;
  });
  selLocal.innerHTML = html;
  selLocal.value = filtroLocalAtual;
  if (![...selLocal.options].some(o => o.value === filtroLocalAtual)) {
    selLocal.value = 'todos';
    filtroLocalAtual = 'todos';
  }
}

function atualizarFiltroRefinamentos() {
  const tipo = document.getElementById('filtroTipoSelect')?.value || 'todos';
  filtroTipoAtual = tipo;

  const grupo = document.getElementById('grupoFiltroRefinamento');
  const sel = document.getElementById('filtroRefinamentoSelect');
  if (!grupo || !sel) return;

  const refinamentos = TIPOS[tipo]?.refinamentos || [];
  if (tipo === 'todos' || refinamentos.length === 0) {
    grupo.hidden = true;
    sel.innerHTML = '<option value="todos">Todos</option>';
    filtroRefinamentoAtual = 'todos';
    return;
  }

  grupo.hidden = false;
  sel.innerHTML = '<option value="todos">Todos</option>' +
    refinamentos.map(r => `<option value="${r}">${r}</option>`).join('');
  sel.value = filtroRefinamentoAtual;
  if (![...sel.options].some(o => o.value === filtroRefinamentoAtual)) {
    sel.value = 'todos';
    filtroRefinamentoAtual = 'todos';
  }
}

window.toggleTagFiltro = function () { /* legado */ };

function fecharModalFiltros() {
  document.getElementById('modalFiltros').classList.remove('ativo');
}

function salvarFiltros() {
  filtroEstadoAtual = document.getElementById('filtroEstadoSelect')?.value || 'todos';
  filtroCidadeAtual = document.getElementById('filtroCidadeSelect')?.value || 'todas';
  filtroLocalAtual = document.getElementById('filtroLocalSelect')?.value || 'todos';
  filtroTipoAtual = document.getElementById('filtroTipoSelect')?.value || 'todos';
  filtroRefinamentoAtual = document.getElementById('filtroRefinamentoSelect')?.value || 'todos';

  fecharModalFiltros();
  aplicarFiltros();
}

function limparFiltros() {
  const inputBusca = document.getElementById('inputBusca');
  if (inputBusca) inputBusca.value = '';
  termoBusca = '';
  filtroEstadoAtual = 'todos';
  filtroCidadeAtual = 'todas';
  filtroLocalAtual = 'todos';
  filtroTipoAtual = 'todos';
  filtroRefinamentoAtual = 'todos';

  fecharModalFiltros();
  aplicarFiltros();
}

function aplicarFiltros() {
  const inputBusca = document.getElementById('inputBusca');
  termoBusca = inputBusca ? inputBusca.value.toLowerCase().trim() : '';

  const semFiltros = !termoBusca &&
    filtroEstadoAtual === 'todos' &&
    filtroCidadeAtual === 'todas' &&
    filtroLocalAtual === 'todos' &&
    filtroTipoAtual === 'todos' &&
    filtroRefinamentoAtual === 'todos';

  if (semFiltros) { renderizarEventos(roles); return; }

  const filtrados = roles.filter(item => {
    const nomeMatch = !termoBusca || (item.nome || '').toLowerCase().includes(termoBusca);

    let estadoMatch = true;
    if (filtroEstadoAtual !== 'todos') {
      estadoMatch = extrairSiglaEstado(item) === filtroEstadoAtual;
    }

    let cidadeMatch = true;
    if (filtroCidadeAtual !== 'todas') {
      cidadeMatch = normalizarCidade(item.cidade) === normalizarCidade(filtroCidadeAtual);
    }

    let localMatch = true;
    if (filtroLocalAtual !== 'todos') {
      localMatch = (item.local || '').toLowerCase().includes(filtroLocalAtual);
    }

    let tipoMatch = true;
    if (filtroTipoAtual !== 'todos') {
      if (item.tipo === 'evento-cidade') {
        tipoMatch = false;
      } else {
        tipoMatch = item.tipoRole === filtroTipoAtual;
      }
    }

    let refinoMatch = true;
    if (filtroRefinamentoAtual !== 'todos') {
      refinoMatch = item.refinamento === filtroRefinamentoAtual;
    }

    return nomeMatch && estadoMatch && cidadeMatch && localMatch && tipoMatch && refinoMatch;
  });

  filtrados.sort((a, b) => paraTimestamp(a.data) - paraTimestamp(b.data));
  renderizarEventos(filtrados);
}

// ============ NAVEGAÇÃO ============
window.irAba = function(aba) {
  document.querySelectorAll('.tela').forEach(t => t.classList.remove('ativa'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('ativo'));
  if (aba === 'home') { document.getElementById('tela-home').classList.add('ativa'); document.getElementById('navHome').classList.add('ativo'); }
  else if (aba === 'criar') {
    if (!usuarioLogado) { pedirLogin('criar'); return; }
    document.getElementById('tela-criar').classList.add('ativa');
    document.getElementById('navCriar').classList.add('ativo');
  }
  else if (aba === 'meus') { document.getElementById('tela-meus').classList.add('ativa'); document.getElementById('navMeus').classList.add('ativo'); renderizarMeusRoles(); }
  else if (aba === 'perfil') { document.getElementById('tela-perfil').classList.add('ativa'); document.getElementById('navPerfil').classList.add('ativo'); atualizarStats(); }
  else if (aba === 'painel') { document.getElementById('tela-painel').classList.add('ativa'); }
  window.scrollTo(0, 0);
};

// ============ AUTH ============
function pedirLogin(acaoPendente) {
  acaoPendentePosLogin = acaoPendente || null;
  document.getElementById('modalLogin').classList.add('ativo');
}

function trocarModalAuth(qual) {
  document.getElementById('modalLogin').classList.remove('ativo');
  document.getElementById('modalCadastro').classList.remove('ativo');
  if (qual === 'cadastro') document.getElementById('modalCadastro').classList.add('ativo');
  else document.getElementById('modalLogin').classList.add('ativo');
}

function fecharModalAuth() {
  document.getElementById('modalLogin').classList.remove('ativo');
  document.getElementById('modalCadastro').classList.remove('ativo');

  if (acaoPendentePosLogin && acaoPendentePosLogin.tipo === 'seguir') {
    acaoPendentePosLogin = null;
    toast('Login cancelado. Explore à vontade!');
  } else {
    acaoPendentePosLogin = null;
    irAba('home');
  }
}

function fazerLogin() {
  return (async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const senha = document.getElementById('loginSenha').value;
    if (!email || !senha) { toast('Preencha email e senha', true); return; }
    try {
      toast('Entrando...');
      await signInWithEmailAndPassword(auth, email, senha);
      document.getElementById('loginEmail').value = '';
      document.getElementById('loginSenha').value = '';
      document.getElementById('modalLogin').classList.remove('ativo');
      toast('✅ Bem-vindo de volta!');
    } catch (err) {
      let msg = 'Erro ao entrar.';
      if (err.code === 'auth/user-not-found') msg = 'Email não cadastrado.';
      else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') msg = 'Senha incorreta.';
      else if (err.code === 'auth/invalid-email') msg = 'Email inválido.';
      else if (err.code === 'auth/too-many-requests') msg = 'Muitas tentativas. Tente mais tarde.';
      toast(msg, true);
    }
  })();
}

function fazerCadastro() {
  return (async () => {
    const nome = document.getElementById('cadNome').value.trim();
    const sobrenome = document.getElementById('cadSobrenome').value.trim();
    const email = document.getElementById('cadEmail').value.trim();
    const senha = document.getElementById('cadSenha').value;

    if (!nome || nome.length < 2) { toast('Digite seu nome (mín. 2 letras)', true); return; }
    if (!sobrenome || sobrenome.length < 2) { toast('Digite seu sobrenome (mín. 2 letras)', true); return; }
    if (!email || !email.includes('@')) { toast('Digite um email válido', true); return; }

    const v = validarSenha(senha);
    if (!v.valida) {
      if (!v.min8) { toast('Senha precisa ter 8+ caracteres', true); return; }
      if (!v.letra) { toast('Senha precisa ter pelo menos 1 letra', true); return; }
      if (!v.numero) { toast('Senha precisa ter pelo menos 1 número', true); return; }
    }

    const nomeCompleto = nome + ' ' + sobrenome;

    try {
      toast('Criando conta...');
      const cred = await createUserWithEmailAndPassword(auth, email, senha);
      await updateProfile(cred.user, { displayName: nomeCompleto });
      usuarioAtual = nomeCompleto;
      usuarioEmail = email;
      localStorage.setItem('rolesplit_usuario', nomeCompleto);
      await setDoc(doc(db, "usuarios", email), { nome: nomeCompleto, seguidores: [], seguindo: [] });

      document.getElementById('cadNome').value = '';
      document.getElementById('cadSobrenome').value = '';
      document.getElementById('cadEmail').value = '';
      document.getElementById('cadSenha').value = '';
      const f = document.getElementById('forcaSenha'); if (f) f.style.display = 'none';
      const rq = document.getElementById('senhaReq'); if (rq) rq.style.display = 'none';
      document.getElementById('modalCadastro').classList.remove('ativo');
      atualizarMenuLateral();
      toast('✅ Conta criada! Bem-vindo, ' + nome + '!');
    } catch (err) {
      let msg = 'Erro ao criar conta.';
      if (err.code === 'auth/email-already-in-use') msg = 'Email já cadastrado. Faça login.';
      else if (err.code === 'auth/weak-password') msg = 'Senha muito fraca.';
      else if (err.code === 'auth/invalid-email') msg = 'Email inválido.';
      toast(msg, true);
    }
  })();
}

function fazerLogout() {
  return (async () => {
    if (!confirm('Sair da conta?')) return;
    try {
      await signOut(auth);
      localStorage.removeItem('rolesplit_usuario');
      usuarioAtual = '';
      usuarioEmail = '';
      usuarioLogado = false;
      atualizarMenuLateral();
      toast('Você saiu.');
      setTimeout(() => location.reload(), 800);
    } catch (e) { toast('Erro: ' + e.message, true); }
  })();
}

function executarAcao(acao) {
  if (acao === 'criar') irAba('criar');
  else if (acao === 'meus') irAba('meus');
  else if (acao && typeof acao === 'object') {
    if (acao.tipo === 'entrar') entrarNoRole(acao.roleId);
    else if (acao.tipo === 'seguir') {
      abrirPerfilPublico(acao.email, acao.nome).then(() => toggleSeguir());
    }
  }
}

// ============ PERFIL PÚBLICO ============
function abrirPerfilAdmin() {
  const r = todosOsRoles.find(x => x.id == roleSelecionadoId) || roles.find(x => x.id == roleSelecionadoId);
  if (r && r.adminEmail) {
    fecharModalDetalhes();
    abrirPerfilPublico(r.adminEmail, r.admin);
  } else {
    toast('Esse usuário não tem perfil público.', true);
  }
}

function abrirPerfilPublico(email, nome) {
  return (async () => {
    perfilPublicoEmail = email;
    document.getElementById('pubPerfilNome').innerText = nome;
    document.getElementById('pubPerfilEmail').innerText = email;
    document.getElementById('pubPerfilAvatar').innerText = nome.charAt(0).toUpperCase();

    try {
      const snap = await getDoc(doc(db, "usuarios", email));
      let dados = { seguidores: [], seguindo: [] };
      if (snap.exists()) dados = snap.data();
      else await setDoc(doc(db, "usuarios", email), { nome, seguidores: [], seguindo: [] });

      document.getElementById('pubPerfilSeguidores').innerText = (dados.seguidores || []).length;
      document.getElementById('pubPerfilSeguindo').innerText = (dados.seguindo || []).length;

      const euSigo = (dados.seguidores || []).includes(usuarioEmail);
      atualizarBotaoSeguir(euSigo);

      const rolesDaPessoa = todosOsRoles.filter(r => r.adminEmail === email || (r.participantesEmails || []).includes(email));
      document.getElementById('pubPerfilRoles').innerText = rolesDaPessoa.length;

      const lista = document.getElementById('pubPerfilRolesLista');
      if (rolesDaPessoa.length === 0) {
        lista.innerHTML = '<div class="empty" style="padding: 20px;">Nenhum role público no momento.</div>';
      } else {
        lista.innerHTML = rolesDaPessoa.map(r => `
          <div class="card-mini" style="margin-bottom: 8px;" onclick="fecharPerfilPublico(); abrirModalDetalhes('${r.id}')">
            <div class="conteudo" style="padding: 10px;">
              <div class="titulo">${r.nome}</div>
              <div class="data">📅 ${formatarData(r.data)}</div>
            </div>
          </div>
        `).join('');
      }

      document.getElementById('modalPerfilPublico').classList.add('ativo');
    } catch (error) {
      console.error("Erro ao carregar perfil:", error);
      toast('Erro ao carregar perfil.', true);
    }
  })();
}

function fecharPerfilPublico() {
  document.getElementById('modalPerfilPublico').classList.remove('ativo');
}

function atualizarBotaoSeguir(euSigo) {
  const btn = document.getElementById('btnSeguir');
  if (!btn) return;
  if (euSigo) {
    btn.innerText = '✅ Seguindo';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-secondary');
  } else {
    btn.innerText = '➕ Seguir';
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-primary');
  }
}

function toggleSeguir() {
  return (async () => {
    if (!usuarioLogado) { pedirLogin({ tipo: 'seguir', email: perfilPublicoEmail, nome: document.getElementById('pubPerfilNome').innerText }); return; }
    if (perfilPublicoEmail === usuarioEmail) { toast('Você não pode seguir a si mesmo!', true); return; }

    const btn = document.getElementById('btnSeguir');
    const euSigo = btn.innerText.includes('Seguindo');

    const refMeu = doc(db, "usuarios", usuarioEmail);
    const refDele = doc(db, "usuarios", perfilPublicoEmail);

    try {
      const meuSnap = await getDoc(refMeu);
      if (!meuSnap.exists()) await setDoc(refMeu, { nome: usuarioAtual, seguidores: [], seguindo: [] });

      if (euSigo) {
        await updateDoc(refMeu, { seguindo: arrayRemove(perfilPublicoEmail) });
        await updateDoc(refDele, { seguidores: arrayRemove(usuarioEmail) });
        toast('Você deixou de seguir.');
        atualizarBotaoSeguir(false);
      } else {
        await updateDoc(refMeu, { seguindo: arrayUnion(perfilPublicoEmail) });
        await updateDoc(refDele, { seguidores: arrayUnion(usuarioEmail) });
        toast('✅ Agora você segue essa pessoa!');
        atualizarBotaoSeguir(true);
      }

      const snapAtualizado = await getDoc(refDele);
      if (snapAtualizado.exists()) {
        document.getElementById('pubPerfilSeguidores').innerText = (snapAtualizado.data().seguidores || []).length;
      }
    } catch (e) {
      toast('Erro ao seguir: ' + e.message, true);
    }
  })();
}

// ============ PERFIL (MEU) ============
function atualizarPerfilUI() {
  const c = document.getElementById('perfilConteudo');
  if (!c) return;

  if (usuarioLogado) {
    c.innerHTML = `
      <div class="card" style="text-align:center;">
        <div class="perfil-avatar">${(usuarioAtual || '?')[0].toUpperCase()}</div>
        <h3 style="font-size:20px; font-weight:800;">${usuarioAtual}</h3>
        <p style="font-size:12px; color:#94a3b8; margin-top:2px;">${usuarioEmail}</p>
        <button class="btn btn-secondary" style="margin-top:16px;" onclick="abrirModalNome(true)">✏️ Trocar Nome</button>
        <button class="btn btn-secondary" style="margin-top:8px;" onclick="fazerLogout()">🚪 Sair</button>
      </div>
      <div class="card">
        <h2>🔑 Entrar em Role por Código</h2>
        <div class="input-group">
          <input type="text" id="inputCodigoEntrar" placeholder="Ex: X7K9" maxlength="6" style="text-transform:uppercase; text-align:center; font-size:20px; letter-spacing:4px; font-weight:800;">
        </div>
        <button class="btn btn-primary" onclick="entrarComCodigo()">🎯 Acessar Role</button>
      </div>
      <div class="card">
        <h2>📊 Estatísticas</h2>
        <div id="statsPerfil" style="font-size:14px; color:#94a3b8;">Carregando...</div>
      </div>
      <div class="card card-vermelho">
        <h2>⚠️ Zona Perigosa</h2>
        <p style="font-size:13px; color:#94a3b8; margin-bottom:12px;">Isso apaga sua conta e todos os dados permanentemente.</p>
        <button class="btn btn-vermelho" onclick="abrirModalExcluir()">🗑️ Excluir Conta</button>
      </div>
    `;
    atualizarStats();
  } else {
    c.innerHTML = `
      <div class="card" style="text-align:center;">
        <div class="perfil-avatar">?</div>
        <h3 style="font-size:20px; font-weight:800;">Você não está logado</h3>
        <p style="font-size:12px; color:#94a3b8; margin-top:2px;">Faça login pra criar roles e participar</p>
        <button class="btn btn-primary" style="margin-top:16px;" onclick="pedirLogin(null)">🔐 Entrar</button>
        <button class="btn btn-secondary" style="margin-top:8px;" onclick="abrirCadastro()">✨ Criar Conta</button>
      </div>
      <div class="card">
        <h2>🔑 Entrar em Role por Código</h2>
        <div class="input-group">
          <input type="text" id="inputCodigoEntrar" placeholder="Ex: X7K9" maxlength="6" style="text-transform:uppercase; text-align:center; font-size:20px; letter-spacing:4px; font-weight:800;">
        </div>
        <button class="btn btn-primary" onclick="entrarComCodigo()">🎯 Acessar Role</button>
      </div>
    `;
  }
}

function abrirCadastro() {
  document.getElementById('modalLogin').classList.remove('ativo');
  document.getElementById('modalCadastro').classList.add('ativo');
}

function abrirModalNome(edicao) {
  const atual = usuarioAtual || '';
  const nome = prompt(edicao ? 'Digite o novo nome:' : 'Como você quer ser chamado?', atual);
  if (nome && nome.trim()) {
    usuarioAtual = nome.trim();
    localStorage.setItem('rolesplit_usuario', usuarioAtual);
    const user = auth.currentUser;
    if (user && !user.isAnonymous) updateProfile(user, { displayName: usuarioAtual }).catch(() => {});
    atualizarPerfilUI();
    atualizarMenuLateral();
    toast('✅ Nome atualizado!');
  }
}

function atualizarStats() {
  const el = document.getElementById('statsPerfil');
  if (!el) return;
  const meus = todosOsRoles.filter(r => ehParticipanteDoRole(r));
  let total = 0;
  meus.forEach(r => {
    const s = calcularSaldos(r);
    const meu = s.find(x => x.nome === usuarioAtual);
    if (meu) total += meu.deve;
  });
  el.innerHTML = `
    <div style="display:flex; justify-content:space-between; padding:8px 0;">
      <span>🎉 Roles participando:</span><strong style="color:#10b981;">${meus.length}</strong>
    </div>
    <div style="display:flex; justify-content:space-between; padding:8px 0;">
      <span>💰 Total gasto em roles:</span><strong style="color:#f59e0b;">${formatarReal(total)}</strong>
    </div>
  `;
}

// ============ HOME ============
function renderizarEventos(listaParaRenderizar = roles) {
  const destaqueContainer = document.getElementById('destaqueContainer');
  const gridEventos = document.getElementById('gridEventos');
  if (!destaqueContainer || !gridEventos) return;

  if (listaParaRenderizar.length === 0) {
    destaqueContainer.innerHTML = '<div class="empty" style="text-align:center; padding:40px 20px; color:#64748b;">Nenhum evento ou role encontrado.</div>';
    gridEventos.innerHTML = '';
    return;
  }

  const principal = listaParaRenderizar[0];
  const isEventoPrincipal = principal.tipo === 'evento-cidade';
  const tipoInfoPrinc = principal.tipoRole ? `${TIPOS[principal.tipoRole]?.emoji || ''} ${principal.tipoRole}${principal.refinamento ? ` · ${principal.refinamento}` : ''}` : '';
  const cidadePrincipal = principal.cidade ? String(principal.cidade).replace(/\s*-\s*(RS|SC|PR)\s*$/i, '').trim() : '';

  destaqueContainer.innerHTML = `
    <div class="card-destaque" data-id="${principal.id}">
      <div class="capa" style="background-image: url('${imagemValida(principal.imagem)}')">
        <div class="badge-tipo">${isEventoPrincipal ? '🎪 Evento' : '🎯 ' + (principal.codigo || 'Role')}</div>
      </div>
      <div class="conteudo">
        <div class="titulo">${principal.nome}</div>
        <div class="data">📅 ${formatarData(principal.data)}</div>
        <div class="local">${isEventoPrincipal ? '📍 ' + (principal.local || 'A definir') : '👥 ' + (principal.participantes || []).length + '/' + (principal.vagas || 9999) + ' participantes'}</div>
        ${tipoInfoPrinc ? `<div style="font-size:11px; color:#94a3b8; margin-top:2px;">${tipoInfoPrinc}</div>` : ''}
        ${cidadePrincipal ? `<div style="font-size:11px; color:#64748b;">📍 ${cidadePrincipal}</div>` : ''}
      </div>
    </div>
  `;

  gridEventos.innerHTML = listaParaRenderizar.slice(1).map(r => {
    const isEvento = r.tipo === 'evento-cidade';
    const tipoInfo = r.tipoRole ? `${TIPOS[r.tipoRole]?.emoji || ''} ${r.tipoRole}${r.refinamento ? ` · ${r.refinamento}` : ''}` : '';
    const cidade = r.cidade ? String(r.cidade).replace(/\s*-\s*(RS|SC|PR)\s*$/i, '').trim() : '';
    return `
      <div class="card-mini" data-id="${r.id}">
        <div class="capa" style="background-image: url('${imagemValida(r.imagem)}')">
          ${isEvento ? '<div style="position:absolute; top:8px; right:8px; background:#3b82f6; color:#fff; font-size:10px; font-weight:800; padding:2px 6px; border-radius:4px;">🎪 EVENTO</div>' : ''}
        </div>
        <div class="conteudo">
          <div class="titulo">${r.nome}</div>
          <div class="data">📅 ${formatarData(r.data)}</div>
          ${tipoInfo ? `<div style="font-size:11px; color:#94a3b8; margin-top:2px;">${tipoInfo}</div>` : ''}
          ${cidade ? `<div style="font-size:11px; color:#64748b;">📍 ${cidade}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.card-destaque, .card-mini').forEach(el => {
    el.onclick = () => { abrirModalDetalhes(el.dataset.id); };
  });
}

// ============ MODAL DETALHES ============
function abrirModalDetalhes(id) {
  roleSelecionadoId = id;

  let r = todosOsRoles.find(x => x.id == id);
  if (!r) r = roles.find(x => x.id == id);
  if (!r) return;

  const isEvento = r.tipo === 'evento-cidade';
  const parts = r.participantes || [];
  const jaVai = ehParticipanteDoRole(r);
  const ehAdmin = ehAdminDoRole(r);
  const vagas = r.vagas || 9999;
  const pct = Math.min(100, (parts.length / vagas) * 100);

  document.getElementById('detalhesBanner').style.backgroundImage = `url('${imagemValida(r.imagem)}')`;
  document.getElementById('detalhesTitulo').innerText = r.nome;
  document.getElementById('detalhesAdminNome').innerText = `${r.admin || 'Desconhecido'}${ehAdmin ? ' (você 👑)' : ''}`;

  const txtDesc = document.getElementById('detalhesDescricao');
  if (r.descricao && r.descricao.trim() !== '') {
    txtDesc.innerText = `"${r.descricao}"`;
    txtDesc.style.display = 'block';
  } else {
    txtDesc.style.display = 'none';
  }

  document.getElementById('detalhesDataHora').innerText = formatarDataLong(r.data);
  document.getElementById('detalhesLocal').innerText = r.local || 'Não informado';
  document.getElementById('detalhesCidade').innerText = r.cidade ? String(r.cidade).replace(/\s*-\s*(RS|SC|PR)\s*$/i, '').trim() : 'Não informada';
  document.getElementById('detalhesCodigo').innerText = isEvento ? 'EVENTO OFICIAL' : (r.codigo || '---');
  document.getElementById('detalhesVagasTexto').innerText = isEvento ? 'Evento Aberto' : `${parts.length} / ${vagas}`;
  document.getElementById('detalhesBarraFill').style.width = isEvento ? '100%' : pct + '%';

  const divTags = document.getElementById('detalhesTags');
  const tagsMostrar = [];
  if (r.tipoRole) tagsMostrar.push(`${TIPOS[r.tipoRole]?.emoji || ''} ${r.tipoRole}`);
  if (r.refinamento) tagsMostrar.push(r.refinamento);
  const sigla = extrairSiglaEstado(r);
  if (sigla) tagsMostrar.push(sigla);
  if (r.tags && r.tags.length > 0) tagsMostrar.push(...r.tags);

  if (tagsMostrar.length > 0) {
    divTags.innerHTML = tagsMostrar.map(t => `<span style="background: rgba(16,185,129,0.2); color: #10b981; font-size: 11px; font-weight: 800; padding: 4px 8px; border-radius: 6px;">${t}</span>`).join('');
  } else {
    divTags.innerHTML = '';
  }

  const av = document.getElementById('detalhesAvatares');
  let htmlAv = parts.slice(0, 6).map(n => {
    const letra = (n && n.length > 0) ? n[0].toUpperCase() : '?';
    return `<div class="avatar-item">${letra}</div>`;
  }).join('');
  if (parts.length > 6) htmlAv += `<div class="avatar-item" style="background:#10b981;">+${parts.length - 6}</div>`;
  av.innerHTML = htmlAv || '<span style="font-size:12px; color:#64748b;">Nenhum participante.</span>';

  const gastos = r.gastos || [];
  const total = gastos.reduce((a, g) => a + Number(g.valor), 0);
  const cota = parts.length > 0 ? total / parts.length : 0;

  let secaoCustos = '';
  if (isEvento) {
    secaoCustos = `<div style="background:#0f172a; padding:14px; border-radius:14px; margin-bottom:16px; text-align:center;">
      <div style="font-size:13px; color:#64748b;">Este é um evento oficial da cidade e não possui controle de gastos.</div>
    </div>`;
  } else if (total > 0) {
    secaoCustos += `<div style="background:#0f172a; padding:14px; border-radius:14px; margin-bottom:16px;">
      <h3 style="font-size:14px; color:#f1f5f9; margin-bottom:10px;">💰 Resumo de Custos</h3>
      <div class="resumo-grid">
        <div class="resumo-item"><div class="label">Total</div><div class="valor total">${formatarReal(total)}</div></div>
        <div class="resumo-item"><div class="label">Pessoas</div><div class="valor pessoas">${parts.length}</div></div>
        <div class="resumo-item" style="grid-column: span 2;"><div class="label">Cota por Pessoa</div><div class="valor cota">${formatarReal(cota)}</div></div>
      </div>
    </div>`;
    secaoCustos += `<div style="background:#0f172a; padding:14px; border-radius:14px; margin-bottom:16px;">
      <h3 style="font-size:14px; color:#f1f5f9; margin-bottom:10px;">📋 Gastos (${gastos.length})</h3>
      ${gastos.map(g => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid rgba(51,65,85,0.4); font-size:13px;">
          <div>
            <div style="color:#e2e8f0; font-weight:700;">${g.descricao}</div>
            <div style="color:#64748b; font-size:11px;">Pago por ${g.pagador}</div>
          </div>
          <div style="color:#10b981; font-weight:800;">${formatarReal(g.valor)}</div>
        </div>
      `).join('')}
    </div>`;
    const saldos = calcularSaldos(r);
    const acertos = calcularAcertos(saldos);
    if (acertos.length > 0) {
      secaoCustos += `<div style="background:#0f172a; padding:14px; border-radius:14px; margin-bottom:16px;">
        <h3 style="font-size:14px; color:#f1f5f9; margin-bottom:10px;">🤝 Acertos</h3>
        ${acertos.map(a => `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; font-size:13px;">
          <span style="color:#94a3b8;">${a.de} → ${a.para}</span>
          <span style="color:#3b82f6; font-weight:800;">${formatarReal(a.valor)}</span>
        </div>`).join('')}
      </div>`;
    }
  } else {
    secaoCustos = `<div style="background:#0f172a; padding:14px; border-radius:14px; margin-bottom:16px; text-align:center;">
      <div style="font-size:13px; color:#64748b;">Nenhum gasto registrado ainda.</div>
    </div>`;
  }

  const bodyContent = document.querySelector('#modalDetalhes .body-content');
  const secaoAntiga = document.getElementById('secaoCustos');
  if (secaoAntiga) secaoAntiga.remove();
  const divCustos = document.createElement('div');
  divCustos.id = 'secaoCustos';
  divCustos.innerHTML = secaoCustos;
  const cardParticipantes = bodyContent.querySelector('div[style*="background:#0f172a"]:last-child');
  if (cardParticipantes) bodyContent.insertBefore(divCustos, cardParticipantes);
  else bodyContent.appendChild(divCustos);

  const rodape = document.getElementById('detalhesRodapeBotao');

  if (isEvento) {
    rodape.innerHTML = `<button class="btn btn-secondary" onclick="fecharModalDetalhes()">Fechar</button>`;
  } else if (jaVai && ehAdmin) {
    rodape.innerHTML = `<div style="display:flex; gap:10px;">
      <button class="btn btn-primary" style="flex:1;" onclick="acessarPainel('${r.id}')">👀 Ver Painel</button>
      <button class="btn btn-danger" style="width:auto;" onclick="sairDoRole('${r.id}')">❌ Sair</button>
    </div>`;
  } else if (jaVai && !ehAdmin) {
    rodape.innerHTML = `<button class="btn btn-danger" onclick="sairDoRole('${r.id}')">❌ Sair do Rolê</button>`;
  } else if (parts.length >= vagas) {
    rodape.innerHTML = `<button class="btn btn-secondary" disabled>😢 Lotado</button>`;
  } else if (!usuarioLogado) {
    rodape.innerHTML = `<div style="display:flex; gap:8px;">
      <button class="btn btn-primary" style="flex:1;" onclick="abrirModalConfirmar()">🙋 Vou participar</button>
      <button class="btn btn-secondary" style="width:auto;" onclick="entrarNoRole('${r.id}')">🔐 Login</button>
    </div>`;
  } else {
    rodape.innerHTML = `<button class="btn btn-primary" onclick="entrarNoRole('${r.id}')">✋ Entrar no Rolê</button>`;
  }

  document.getElementById('modalDetalhes').classList.add('ativo');
}

function fecharModalDetalhes() {
  roleSelecionadoId = null;
  document.getElementById('modalDetalhes').classList.remove('ativo');
}

function entrarNoRole(id) {
  return (async () => {
    if (!usuarioLogado) { pedirLogin({ tipo: 'entrar', roleId: id }); return; }
    try {
      await updateDoc(doc(db, "roles", id), {
        participantes: arrayUnion(usuarioAtual),
        participantesEmails: arrayUnion(usuarioEmail)
      });
      toast('✅ Você entrou no role!');
    } catch (e) { toast('Erro: ' + e.message, true); }
  })();
}

function sairDoRole(id) {
  return (async () => {
    if (!confirm('Sair do role?')) return;
    try {
      await updateDoc(doc(db, "roles", id), {
        participantes: arrayRemove(usuarioAtual),
        participantesEmails: arrayRemove(usuarioEmail)
      });
      toast('Você saiu do role.');
      fecharModalDetalhes();
    } catch (e) { toast('Erro: ' + e.message, true); }
  })();
}

// ============ CONFIRMAR PRESENÇA SEM CADASTRO ============
function abrirModalConfirmar() {
  const id = roleSelecionadoId;
  if (!id) return;

  if (usuarioLogado) { entrarNoRole(id); return; }

  if (localStorage.getItem(`presenca_${id}`)) {
    toast('Você já confirmou presença neste rolê ✅');
    return;
  }

  document.getElementById('presencaNome').value = '';
  document.getElementById('presencaObs').value = '';
  document.getElementById('modalConfirmarPresenca').classList.add('ativo');
  setTimeout(() => document.getElementById('presencaNome')?.focus(), 100);
}

function fecharModalConfirmar() {
  document.getElementById('modalConfirmarPresenca').classList.remove('ativo');
}

function confirmarPresencaAnonima() {
  return (async () => {
    const nome = document.getElementById('presencaNome').value.trim();
    const obs = document.getElementById('presencaObs').value.trim();
    const roleId = roleSelecionadoId;

    if (!nome || nome.length < 2) { toast('Digite seu nome (mín. 2 letras)', true); return; }
    if (!roleId) { toast('Rolê não encontrado', true); return; }
    if (localStorage.getItem(`presenca_${roleId}`)) { toast('Você já confirmou presença', true); return; }

    try {
      const snap = await getDoc(doc(db, "roles", roleId));
      if (!snap.exists()) { toast('Rolê não existe mais', true); return; }
      const r = snap.data();
      const parts = r.participantes || [];

      if (parts.length >= (r.vagas || 9999)) { toast('Rolê lotado', true); return; }
      if (parts.includes(nome)) { toast('Já tem alguém com esse nome no rolê', true); return; }

      await updateDoc(doc(db, "roles", roleId), {
        participantes: arrayUnion(nome),
        participantesEmails: arrayUnion('anon_' + getDeviceId())
      });

      localStorage.setItem(`presenca_${roleId}`, JSON.stringify({ nome, obs, em: Date.now() }));
      fecharModalConfirmar();
      toast(`Pronto, ${nome}! Presença confirmada 🎉`);

      setTimeout(() => convidarCadastroPosPresenca(nome), 1500);
    } catch (e) {
      console.error(e);
      toast('Erro ao confirmar. Tente de novo.', true);
    }
  })();
}

function convidarCadastroPosPresenca(nome) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay center ativo';
  const nomeSafe = nome.replace(/[<>&"']/g, '');
  modal.innerHTML = `
    <div class="modal-auth" style="max-width: 360px;">
      <button class="btn-fechar" onclick="this.closest('.modal-overlay').remove()">✕</button>
      <div class="emoji">✨</div>
      <h2>Boa, ${nomeSafe}!</h2>
      <p class="sub">Quer criar seu próprio rolê e dividir os gastos?</p>
      <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove(); abrirCadastro();">Criar conta grátis</button>
      <span class="link" onclick="this.closest('.modal-overlay').remove()" style="color:#94a3b8;">Depois</span>
    </div>
  `;
  document.body.appendChild(modal);
}

// ============ PAINEL ============
function acessarPainel(id) {
  const r = todosOsRoles.find(x => x.id == id);
  if (!r) return;
  if (!ehAdminDoRole(r)) { toast('Só o admin pode ver o painel', true); return; }

  rolePainelAberto = id;
  fecharModalDetalhes();
  document.getElementById('roleTituloPainel').innerText = r.nome;
  const cid = r.cidade ? String(r.cidade).replace(/\s*-\s*(RS|SC|PR)\s*$/i, '').trim() : '';
  document.getElementById('roleSubtituloPainel').innerText = `📅 ${formatarData(r.data)}${r.local ? ' • 📍 ' + r.local : ''}${cid ? ' • 🗺️ ' + cid : ''}`;
  document.getElementById('roleCodigoTopo').innerText = `CÓD: ${r.codigo}`;
  document.getElementById('codigoPainelPessoas').innerText = r.codigo;
  document.querySelectorAll('#tela-painel .aba').forEach((a, i) => { if (i === 0) a.classList.add('ativa'); else a.classList.remove('ativa'); });
  document.getElementById('aba-painel-gastos').style.display = 'block';
  document.getElementById('aba-painel-acerto').style.display = 'none';
  document.getElementById('aba-painel-pessoas').style.display = 'none';
  renderizarPainel();
  irAba('painel');
}

function trocarAbaPainel(aba, event) {
  document.querySelectorAll('#tela-painel .aba').forEach(a => a.classList.remove('ativa'));
  if (event) event.target.classList.add('ativa');
  document.getElementById('aba-painel-gastos').style.display = aba === 'gastos' ? 'block' : 'none';
  document.getElementById('aba-painel-acerto').style.display = aba === 'acerto' ? 'block' : 'none';
  document.getElementById('aba-painel-pessoas').style.display = aba === 'pessoas' ? 'block' : 'none';
}

function renderizarPainel() {
  const r = todosOsRoles.find(x => x.id == rolePainelAberto);
  if (!r) return;
  const gastos = r.gastos || [];
  const parts = r.participantes || [];
  const total = gastos.reduce((a, g) => a + Number(g.valor), 0);
  const cota = parts.length > 0 ? total / parts.length : 0;
  document.getElementById('totalGasto').innerText = formatarReal(total);
  document.getElementById('totalPessoas').innerText = parts.length;
  document.getElementById('cotaPessoa').innerText = formatarReal(cota);
  document.getElementById('contadorPessoas').innerText = parts.length;
  const lg = document.getElementById('listaGastos');
  if (gastos.length === 0) lg.innerHTML = '<div class="empty">Nenhum gasto ainda.</div>';
  else lg.innerHTML = gastos.map(g => `
    <div class="item-gasto">
      <div class="info">
        <div class="desc">${g.descricao} <span style="font-size:10px; color:#94a3b8;">[${g.categoria}]</span></div>
        <div class="quem">💳 ${g.pagador} • 👥 ${g.participantes.length} pessoa(s)</div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="valor">${formatarReal(g.valor)}</span>
        <button class="btn-del" onclick="removerGasto('${g.id}')">✕</button>
      </div>
    </div>
  `).join('');
  const saldos = calcularSaldos(r);
  const ls = document.getElementById('listaSaldos');
  if (gastos.length === 0) ls.innerHTML = '<div class="empty">Adicione gastos para ver os saldos.</div>';
  else {
    saldos.sort((a, b) => b.saldo - a.saldo);
    ls.innerHTML = saldos.map(s => {
      let c, t;
      if (s.saldo > 0.01) { c = 'saldo-receber'; t = `✅ Recebe ${formatarReal(s.saldo)}`; }
      else if (s.saldo < -0.01) { c = 'saldo-pagar'; t = `❌ Deve ${formatarReal(Math.abs(s.saldo))}`; }
      else { c = 'saldo-ok'; t = '⚖️ Quite'; }
      return `<div class="item-saldo ${c}"><span>${s.nome}</span><span>${t}</span></div>`;
    }).join('');
  }
  const acertos = calcularAcertos(saldos);
  const la = document.getElementById('listaAcertos');
  if (acertos.length === 0) la.innerHTML = '<div class="empty">' + (gastos.length === 0 ? 'Adicione gastos.' : 'Ninguém deve nada! 🎉') + '</div>';
  else la.innerHTML = acertos.map(a => `
    <div class="item-acerto">
      <div>
        <div style="font-weight:800; color:#fff;">${a.de} → ${a.para}</div>
        <div style="font-size:11px; color:#94a3b8;">Marcar como pago quando acertar</div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:900; color:#3b82f6;">${formatarReal(a.valor)}</div>
        <button class="btn btn-primary btn-sm" style="margin-top:4px;" onclick="marcarPago('${a.de}','${a.para}',${a.valor})">✅ Pago</button>
      </div>
    </div>
  `).join('');
  const lp = document.getElementById('listaParticipantesPainel');
  lp.innerHTML = parts.map(p => `
    <div class="item-saldo saldo-ok" style="justify-content:space-between;">
      <span>${p} ${p === r.admin ? '👑' : ''}</span>
      ${p !== r.admin ? `<button class="btn btn-danger btn-sm" onclick="removerParticipante('${p}')">✕</button>` : ''}
    </div>
  `).join('') || '<div class="empty">Sem participantes.</div>';
}

function removerGasto(gastoId) {
  return (async () => {
    if (!confirm('Remover este gasto?')) return;
    const r = todosOsRoles.find(x => x.id == rolePainelAberto);
    const novosGastos = (r.gastos || []).filter(g => g.id != gastoId);
    try { await updateDoc(doc(db, "roles", rolePainelAberto), { gastos: novosGastos }); toast('Gasto removido.'); }
    catch (e) { toast('Erro: ' + e.message, true); }
  })();
}

function marcarPago(de, para, valor) {
  return (async () => {
    const novoAcerto = { de, para, valor, data: Date.now() };
    try {
      await updateDoc(doc(db, "roles", rolePainelAberto), { acertosPagos: arrayUnion(novoAcerto) });
      toast(`✅ ${de} pagou ${formatarReal(valor)} para ${para}`);
    } catch (e) { toast('Erro: ' + e.message, true); }
  })();
}

function adicionarParticipanteManual() {
  return (async () => {
    const nome = document.getElementById('novoParticipanteManual').value.trim();
    if (!nome) return;
    try {
      await updateDoc(doc(db, "roles", rolePainelAberto), { participantes: arrayUnion(nome) });
      document.getElementById('novoParticipanteManual').value = '';
      toast('✅ Adicionado!');
    } catch (e) { toast('Erro: ' + e.message, true); }
  })();
}

function removerParticipante(nome) {
  return (async () => {
    if (!confirm(`Remover ${nome}?`)) return;
    try {
      const r = todosOsRoles.find(x => x.id == rolePainelAberto);
      const idx = (r.participantes || []).indexOf(nome);
      const emailRemover = (r.participantesEmails || [])[idx];
      const update = { participantes: arrayRemove(nome) };
      if (emailRemover) update.participantesEmails = arrayRemove(emailRemover);
      await updateDoc(doc(db, "roles", rolePainelAberto), update);
      toast('Removido.');
    } catch (e) { toast('Erro: ' + e.message, true); }
  })();
}

// ============ GASTOS ============
function abrirModalGasto() {
  const r = todosOsRoles.find(x => x.id == rolePainelAberto);
  if (!r) return;
  document.getElementById('gastoPagador').innerHTML = (r.participantes || []).map(p => `<option value="${p}">${p}</option>`).join('');
  const cc = document.getElementById('gastoCheckParticipantes');
  cc.innerHTML = (r.participantes || []).map(p => `
    <label class="check-item ativo">
      <input type="checkbox" value="${p}" checked>
      <span>${p}</span>
    </label>
  `).join('');
  cc.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', e => {
      const l = e.target.closest('.check-item');
      if (e.target.checked) l.classList.add('ativo'); else l.classList.remove('ativo');
    });
  });
  document.getElementById('gastoDescricao').value = '';
  document.getElementById('gastoValor').value = '';
  document.getElementById('modalGasto').classList.add('ativo');
}

function fecharModalGasto() { document.getElementById('modalGasto').classList.remove('ativo'); }

function marcarTodosGasto(m) {
  document.querySelectorAll('#gastoCheckParticipantes input[type="checkbox"]').forEach(cb => {
    cb.checked = m;
    const l = cb.closest('.check-item');
    if (m) l.classList.add('ativo'); else l.classList.remove('ativo');
  });
}

function salvarGasto() {
  return (async () => {
    const r = todosOsRoles.find(x => x.id == rolePainelAberto);
    if (!r) return;
    const descricao = document.getElementById('gastoDescricao').value.trim();
    const valor = parseFloat(document.getElementById('gastoValor').value);
    const categoria = document.getElementById('gastoCategoria').value;
    const pagador = document.getElementById('gastoPagador').value;
    const sel = [];
    document.querySelectorAll('#gastoCheckParticipantes input[type="checkbox"]:checked').forEach(cb => sel.push(cb.value));
    if (!descricao || !valor || valor <= 0) { toast('Preencha descrição e valor!', true); return; }
    if (sel.length === 0) { toast('Selecione 1+ participante!', true); return; }
    const novoGasto = { id: Date.now().toString(), descricao, valor, categoria, pagador, participantes: sel, criadoPor: usuarioAtual, data: Date.now() };
    try {
      await updateDoc(doc(db, "roles", rolePainelAberto), { gastos: arrayUnion(novoGasto) });
      toast('✅ Gasto adicionado!');
      fecharModalGasto();
    } catch (e) { toast('Erro: ' + e.message, true); }
  })();
}

function calcularSaldos(r) {
  const s = {};
  (r.participantes || []).forEach(p => s[p] = { pago: 0, deve: 0 });
  (r.gastos || []).forEach(g => {
    if (s[g.pagador]) s[g.pagador].pago += Number(g.valor);
    const vpp = Number(g.valor) / g.participantes.length;
    g.participantes.forEach(p => { if (s[p]) s[p].deve += vpp; });
  });
  return Object.entries(s).map(([nome, d]) => ({ nome, pago: d.pago, deve: d.deve, saldo: d.pago - d.deve }));
}

function calcularAcertos(saldos) {
  const c = saldos.filter(s => s.saldo > 0.01).map(s => ({ ...s })).sort((a, b) => b.saldo - a.saldo);
  const d = saldos.filter(s => s.saldo < -0.01).map(s => ({ ...s, saldo: -s.saldo })).sort((a, b) => b.saldo - a.saldo);
  const ac = [];
  let i = 0, j = 0;
  while (i < c.length && j < d.length) {
    const cc = c[i], dd = d[j];
    const v = Math.min(cc.saldo, dd.saldo);
    if (v > 0.01) ac.push({ de: dd.nome, para: cc.nome, valor: v });
    cc.saldo -= v; dd.saldo -= v;
    if (cc.saldo < 0.01) i++;
    if (dd.saldo < 0.01) j++;
  }
  return ac;
}

// ============ MEUS ROLES ============
function renderizarMeusRoles() {
  const c = document.getElementById('listaMeusRoles');
  if (!c) return;

  if (!usuarioLogado) {
    c.innerHTML = '<div class="empty">🔐 Faça login pra ver seus roles.</div>';
    return;
  }

  const meus = todosOsRoles.filter(r => {
    if (!ehParticipanteDoRole(r)) return false;
    if (!r.data) return true;
    return ehFuturo(r.data);
  });

  meus.sort((a, b) => paraTimestamp(a.data) - paraTimestamp(b.data));

  if (meus.length === 0) {
    c.innerHTML = '<div class="empty">Você ainda não participa de nenhum role futuro.<br><br>Os roles passados ficam no histórico.</div>';
    return;
  }

  c.innerHTML = meus.map(r => `
    <div class="card" style="display:flex; gap:12px; align-items:center; cursor:pointer;" onclick="abrirModalDetalhes('${r.id}')">
      <img src="${imagemValida(r.imagem)}" style="width:64px; height:64px; border-radius:12px; object-fit:cover;">
      <div style="flex:1;">
        <div style="font-weight:800; font-size:15px; color:#fff;">${r.nome} ${r.privado ? '🔒' : ''} ${ehAdminDoRole(r) ? '👑' : ''}</div>
        <div style="font-size:12px; color:#93c5fd; margin-top:2px;">📅 ${formatarData(r.data)}</div>
        <span style="font-size:10px; background:rgba(16,185,129,0.2); color:#10b981; font-weight:800; padding:2px 8px; border-radius:6px; margin-top:4px; display:inline-block;">Participando ✅</span>
      </div>
    </div>
  `).join('');
}

// ============ CRIAR ROLE ============
function togglePrivacidade() {
  ehPrivado = !ehPrivado;
  const t = document.getElementById('togglePrivado');
  const d = document.getElementById('toggleDesc');
  const titulo = t.querySelector('.titulo');
  const inp = document.getElementById('inputPrivacidade');
  if (inp) inp.checked = ehPrivado;
  if (ehPrivado) {
    t.classList.add('ativo');
    titulo.innerHTML = '🔒 Rolê Privado';
    d.innerText = 'Só quem tem o link pode entrar';
  } else {
    t.classList.remove('ativo');
    titulo.innerHTML = '🌎 Rolê Público';
    d.innerText = 'Aparece para todos no app';
  }
}

function atualizarPreview() {
  const sel = document.getElementById('novoImagemSelect');
  const preview = document.getElementById('previewImagem');
  if (sel && preview) preview.src = sel.value || IMG_FALLBACK;
}

// ============ FORM CRIAR — cascata IBGE ============
async function inicializarFormCriar() {
  const sel = document.getElementById('novoEstado');
  if (!sel) return;
  try {
    const estados = await buscarEstadosSul();
    sel.innerHTML = '<option value="">Selecione...</option>' +
      estados.map(e => `<option value="${e.sigla}">${e.nome}</option>`).join('');
  } catch (err) {
    console.error('Erro IBGE estados:', err);
    sel.innerHTML = `<option value="">Selecione...</option>
      <option value="RS">RS</option><option value="SC">SC</option><option value="PR">PR</option>`;
  }
}

async function atualizarCidades() {
  const uf = document.getElementById('novoEstado')?.value;
  const dl = document.getElementById('listaCidades');
  const input = document.getElementById('novoCidade');
  if (!dl || !input) return;
  dl.innerHTML = '';
  input.value = '';
  if (!uf) return;
  try {
    const cidades = await buscarCidadesSul(uf);
    dl.innerHTML = cidades.map(c => `<option value="${c}"></option>`).join('');
  } catch (err) {
    console.error('Erro IBGE cidades:', err);
  }
}

function inicializarChipsTipo() {
  document.querySelectorAll('.chip-tipo[data-tipo]').forEach(btn => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip-tipo[data-tipo]').forEach(b => b.classList.remove('selecionado'));
      btn.classList.add('selecionado');
      tipoSelecionado = btn.dataset.tipo;
      refinamentoSelecionado = null;
      renderizarRefinamentos(tipoSelecionado);
    });
  });
}

function renderizarRefinamentos(tipo) {
  const grupo = document.getElementById('grupoRefinamento');
  const container = document.getElementById('chipsRefinamento');
  const label = document.getElementById('labelRefinamento');
  if (!grupo || !container) return;

  const refinamentos = TIPOS[tipo]?.refinamentos || [];
  container.innerHTML = '';
  refinamentoSelecionado = null;

  if (refinamentos.length === 0) { grupo.hidden = true; return; }

  grupo.hidden = false;
  label.textContent = `Qual o estilo de ${tipo}? (opcional)`;
  refinamentos.forEach(r => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip-tipo';
    b.textContent = r;
    b.addEventListener('click', () => {
      const jaSel = b.classList.contains('selecionado');
      container.querySelectorAll('.chip-tipo').forEach(x => x.classList.remove('selecionado'));
      if (!jaSel) { b.classList.add('selecionado'); refinamentoSelecionado = r; }
      else { refinamentoSelecionado = null; }
    });
    container.appendChild(b);
  });
}

// ============ SUBMIT form criar ============
document.getElementById('formCriarRole').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!usuarioLogado) { pedirLogin('criar'); return; }

  const titulo = document.getElementById('novoTitulo').value.trim();
  const dataStr = document.getElementById('novoData').value;
  const vagas = parseInt(document.getElementById('novoVagas').value, 10);
  const estado = document.getElementById('novoEstado')?.value || '';
  const cidade = document.getElementById('novoCidade')?.value.trim() || '';
  const local = document.getElementById('novoLocal').value.trim();
  const descricao = document.getElementById('novaDescricao')?.value.trim() || '';
  const imagem = document.getElementById('novoImagemSelect').value;

  if (!titulo || titulo.length < 3) { toast('Título muito curto', true); return; }
  if (!dataStr) { toast('Escolha uma data', true); return; }
  if (!vagas || vagas < 2) { toast('Mínimo 2 vagas', true); return; }
  if (!estado) { toast('Escolha o estado', true); return; }
  if (!cidade) { toast('Escolha a cidade', true); return; }
  if (!tipoSelecionado) { toast('Escolha o tipo de rolê', true); return; }

  const codigo = gerarCodigo();
  const novo = {
    codigo,
    nome: titulo,
    data: new Date(dataStr).getTime(),
    vagas,
    imagem,
    descricao,
    local,
    estado,
    cidade,
    tipoRole: tipoSelecionado,
    refinamento: refinamentoSelecionado || null,
    tags: [],
    admin: usuarioAtual,
    adminEmail: usuarioEmail,
    participantes: [usuarioAtual],
    participantesEmails: [usuarioEmail],
    gastos: [],
    acertosPagos: [],
    privado: ehPrivado,
    criadoEm: Date.now()
  };
  try {
    await setDoc(doc(db, "roles", codigo), novo);
    toast(`✅ Role criado! Código: ${codigo}`);
    e.target.reset();
    document.getElementById('novoVagas').value = '10';
    tipoSelecionado = null;
    refinamentoSelecionado = null;
    document.querySelectorAll('.chip-tipo').forEach(b => b.classList.remove('selecionado'));
    document.getElementById('grupoRefinamento').hidden = true;
    ehPrivado = true;
    document.getElementById('togglePrivado').classList.add('ativo');
    document.querySelector('#togglePrivado .titulo').innerHTML = '🔒 Rolê Privado';
    document.getElementById('toggleDesc').innerText = 'Só quem tem o link pode entrar';
    const inpPriv = document.getElementById('inputPrivacidade');
    if (inpPriv) inpPriv.checked = true;
    atualizarPreview();
    irAba('home');
  } catch (err) {
    toast('Erro: ' + err.message, true);
  }
});

function entrarComCodigo() {
  return (async () => {
    const cod = document.getElementById('inputCodigoEntrar').value.trim().toUpperCase();
    if (!cod) return;
    try {
      const snap = await getDoc(doc(db, "roles", cod));
      if (snap.exists()) {
        document.getElementById('inputCodigoEntrar').value = '';
        const roleData = { id: snap.id, ...snap.data() };
        if (!todosOsRoles.find(r => r.id === cod)) todosOsRoles.push(roleData);
        abrirModalDetalhes(cod);
      } else { toast('Role não encontrado com esse código!', true); }
    } catch (e) { toast('Erro: ' + e.message, true); }
  })();
}

// ============ CONVITE ============
function gerarLinkConvite() { return `${window.location.origin}${window.location.pathname}?join=${rolePainelAberto}`; }

function gerarMensagemConvite() {
  const r = todosOsRoles.find(x => x.id == rolePainelAberto);
  const tipoLinha = r.tipoRole ? `\n${TIPOS[r.tipoRole]?.emoji || ''} ${r.tipoRole}${r.refinamento ? ` · ${r.refinamento}` : ''}` : '';
  return `${TIPOS[r.tipoRole]?.emoji || '🍖'} *${r.nome}*${tipoLinha}\n\n📅 ${formatarData(r.data)}\n📍 ${r.local || 'a definir'}, ${r.cidade || ''}\n\n🔑 Código: *${r.codigo}*\n🔗 Link: ${gerarLinkConvite()}\n\n_Entre no app e use o código para participar._\n\n_RoleSplit_`;
}

function compartilharWhatsApp() { window.open('https://wa.me/?text=' + encodeURIComponent(gerarMensagemConvite()), '_blank'); }
function compartilharNativo() { if (navigator.share) navigator.share({ title: 'Convite RoleSplit', text: gerarMensagemConvite() }); else copiarLink(); }
function copiarLink() {
  const link = gerarLinkConvite();
  navigator.clipboard.writeText(link).then(() => toast('✅ Link copiado!')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = link; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    toast('✅ Link copiado!');
  });
}

function copiarResumoWhatsApp() {
  const r = todosOsRoles.find(x => x.id == rolePainelAberto);
  const g = r.gastos || [];
  const total = g.reduce((a, x) => a + Number(x.valor), 0);
  const s = calcularSaldos(r);
  const a = calcularAcertos(s);
  let t = `🍖 *${r.nome}*\n━━━━━━━━━━━━━━\n\n💰 Total: ${formatarReal(total)}\n👥 Pessoas: ${r.participantes.length}\n\n📋 *GASTOS:*\n`;
  g.forEach(x => { t += `• ${x.descricao} - ${formatarReal(x.valor)} (${x.pagador})\n`; });
  t += `\n💸 *SALDOS:*\n`;
  s.sort((a, b) => b.saldo - a.saldo).forEach(x => {
    if (x.saldo > 0.01) t += `✅ ${x.nome}: Recebe ${formatarReal(x.saldo)}\n`;
    else if (x.saldo < -0.01) t += `❌ ${x.nome}: Deve ${formatarReal(Math.abs(x.saldo))}\n`;
    else t += `⚖️ ${x.nome}: Quite\n`;
  });
  if (a.length > 0) { t += `\n🤝 *ACERTOS:*\n`; a.forEach(x => { t += `• ${x.de} → ${x.para}: ${formatarReal(x.valor)}\n`; }); }
  t += `\n_Gerado por RoleSplit 🍖_`;
  navigator.clipboard.writeText(t).then(() => toast('✅ Resumo copiado!'));
}

// ============ EXCLUIR CONTA ============
function abrirModalExcluir() {
  const meusRolesAdmin = todosOsRoles.filter(r => ehAdminDoRole(r) && ehParticipanteDoRole(r));
  document.getElementById('avisoTransferir').style.display = meusRolesAdmin.length > 0 ? 'block' : 'none';
  document.getElementById('excluirSenha').value = '';
  document.getElementById('modalExcluir').classList.add('ativo');
}

function fecharModalExcluir() {
  document.getElementById('modalExcluir').classList.remove('ativo');
}

function confirmarExclusao() {
  return (async () => {
    if (excluirEmAndamento) return;
    const senha = document.getElementById('excluirSenha').value;
    if (!senha) { toast('Digite sua senha', true); return; }
    const meusRolesAdmin = todosOsRoles.filter(r => ehAdminDoRole(r) && ehParticipanteDoRole(r));
    if (meusRolesAdmin.length > 0) {
      senhaReauth = senha;
      document.getElementById('modalExcluir').classList.remove('ativo');
      abrirModalTransferir(meusRolesAdmin);
      return;
    }
    await executarExclusao(senha);
  })();
}

function abrirModalTransferir(rolesAdmin) {
  const lista = document.getElementById('listaTransferir');
  if (rolesAdmin.length === 0) {
    lista.innerHTML = '<p class="empty">Você não é admin de nenhum role.</p>';
  } else {
    lista.innerHTML = rolesAdmin.map(r => `
      <div class="input-group">
        <label>${r.nome}</label>
        <select data-role="${r.id}">
          <option value="">— Escolha novo admin —</option>
          ${(r.participantes || []).filter(p => p !== usuarioAtual).map(p => `<option value="${p}">${p}</option>`).join('')}
        </select>
      </div>
    `).join('');
  }
  document.getElementById('modalTransferir').classList.add('ativo');
}

function fecharModalTransferir() {
  document.getElementById('modalTransferir').classList.remove('ativo');
}

function confirmarTransferencia() {
  return (async () => {
    const selects = document.querySelectorAll('#listaTransferir select');
    const mapa = {};
    let faltou = false;
    selects.forEach(s => {
      const roleId = s.dataset.role;
      const valor = s.value;
      if (!valor) faltou = true;
      mapa[roleId] = valor;
    });
    if (faltou) { toast('Escolha um novo admin pra cada role', true); return; }
    try {
      for (const [roleId, novoAdmin] of Object.entries(mapa)) {
        await updateDoc(doc(db, "roles", roleId), { admin: novoAdmin });
      }
      document.getElementById('modalTransferir').classList.remove('ativo');
      toast('✅ Roles transferidos!');
      await executarExclusao(senhaReauth);
    } catch (e) { toast('Erro: ' + e.message, true); }
  })();
}

async function executarExclusao(senha) {
  excluirEmAndamento = true;
  try {
    toast('Excluindo...');
    const user = auth.currentUser;
    if (!user) throw new Error('Não logado');
    const cred = EmailAuthProvider.credential(user.email, senha);
    await reauthenticateWithCredential(user, cred);
    for (const r of todosOsRoles) {
      if (ehParticipanteDoRole(r)) {
        try {
          const idx = (r.participantes || []).indexOf(usuarioAtual);
          const emailRemover = (r.participantesEmails || [])[idx];
          const update = { participantes: arrayRemove(usuarioAtual) };
          if (emailRemover) update.participantesEmails = arrayRemove(emailRemover);
          await updateDoc(doc(db, "roles", r.id), update);
        } catch (e) { console.warn('Erro removendo de role:', e); }
      }
    }
    try { await deleteDoc(doc(db, "usuarios", usuarioEmail)); }
    catch (e) { console.warn('Erro removendo perfil:', e); }

    await deleteUser(user);
    localStorage.clear();
    toast('✅ Conta excluída.');
    setTimeout(() => location.reload(), 1000);
  } catch (err) {
    console.error('Erro excluindo:', err);
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') toast('Senha incorreta.', true);
    else if (err.code === 'auth/requires-recent-login') toast('Faça login novamente antes de excluir.', true);
    else toast('Erro: ' + err.message, true);
  } finally {
    excluirEmAndamento = false;
  }
}

// ============ SENHA ============
function validarSenha(senha) {
  return {
    min8: senha.length >= 8,
    letra: /[a-zA-Z]/.test(senha),
    numero: /[0-9]/.test(senha),
    valida: senha.length >= 8 && /[a-zA-Z]/.test(senha) && /[0-9]/.test(senha)
  };
}

function atualizarForcaSenha() {
  const senha = document.getElementById('cadSenha').value;
  const containerForca = document.getElementById('forcaSenha');
  const containerReq = document.getElementById('senhaReq');
  const fill = document.getElementById('forcaFill');
  const label = document.getElementById('forcaLabel');
  if (!senha) { containerForca.style.display = 'none'; containerReq.style.display = 'none'; return; }
  containerForca.style.display = 'block';
  containerReq.style.display = 'block';
  const v = validarSenha(senha);
  const qtd = [v.min8, v.letra, v.numero].filter(Boolean).length;
  fill.classList.remove('fraca', 'media', 'forte');
  label.classList.remove('fraca', 'media', 'forte');
  if (qtd <= 1) { fill.classList.add('fraca'); label.classList.add('fraca'); label.innerText = 'Senha fraca'; }
  else if (qtd === 2) { fill.classList.add('media'); label.classList.add('media'); label.innerText = 'Senha média'; }
  else { fill.classList.add('forte'); label.classList.add('forte'); label.innerText = 'Senha forte'; }
  document.querySelectorAll('#senhaReq .req').forEach(req => {
    const tipo = req.dataset.req;
    const icone = req.querySelector('.icone-req');
    if (v[tipo]) { req.classList.add('atendido'); icone.innerText = '✅'; }
    else { req.classList.remove('atendido'); icone.innerText = '⭕'; }
  });
}

// ============ CONVITE URL ============
function verificarConviteURL() {
  const params = new URLSearchParams(window.location.search);
  const join = params.get('join');
  if (join) {
    setTimeout(async () => {
      const cod = join.toUpperCase();
      try {
        const snap = await getDoc(doc(db, "roles", cod));
        if (snap.exists()) {
          const roleData = { id: snap.id, ...snap.data() };
          if (!todosOsRoles.find(r => r.id === cod)) todosOsRoles.push(roleData);
          abrirModalDetalhes(cod);
        } else { toast('Role não encontrado.', true); }
      } catch (e) { toast('Erro ao abrir convite.', true); }
      window.history.replaceState({}, '', window.location.pathname);
    }, 1500);
  }
}

// ============================================================
// EXPOR FUNÇÕES PARA O ESCOPO GLOBAL
// ============================================================
window.toggleMenu = window.toggleMenu || toggleMenu;
window.irAba = irAba;
window.pedirLogin = pedirLogin;
window.trocarModalAuth = trocarModalAuth;
window.fecharModalAuth = fecharModalAuth;
window.fazerLogin = fazerLogin;
window.fazerCadastro = fazerCadastro;
window.fazerLogout = fazerLogout;
window.abrirCadastro = abrirCadastro;
window.abrirModalNome = abrirModalNome;
window.abrirPerfilAdmin = abrirPerfilAdmin;
window.abrirPerfilPublico = abrirPerfilPublico;
window.fecharPerfilPublico = fecharPerfilPublico;
window.toggleSeguir = toggleSeguir;

window.abrirModalFiltros = abrirModalFiltros;
window.atualizarFiltroCidades = atualizarFiltroCidades;
window.atualizarLocaisPorCidade = atualizarLocaisPorCidade;
window.atualizarFiltroRefinamentos = atualizarFiltroRefinamentos;
window.toggleTagFiltro = toggleTagFiltro;
window.fecharModalFiltros = fecharModalFiltros;
window.salvarFiltros = salvarFiltros;
window.limparFiltros = limparFiltros;
window.aplicarFiltros = aplicarFiltros;

window.abrirModalDetalhes = abrirModalDetalhes;
window.fecharModalDetalhes = fecharModalDetalhes;
window.entrarNoRole = entrarNoRole;
window.sairDoRole = sairDoRole;

window.abrirModalConfirmar = abrirModalConfirmar;
window.fecharModalConfirmar = fecharModalConfirmar;
window.confirmarPresencaAnonima = confirmarPresencaAnonima;

window.acessarPainel = acessarPainel;
window.trocarAbaPainel = trocarAbaPainel;
window.removerGasto = removerGasto;
window.marcarPago = marcarPago;
window.adicionarParticipanteManual = adicionarParticipanteManual;
window.removerParticipante = removerParticipante;

window.abrirModalGasto = abrirModalGasto;
window.fecharModalGasto = fecharModalGasto;
window.marcarTodosGasto = marcarTodosGasto;
window.salvarGasto = salvarGasto;

window.togglePrivacidade = togglePrivacidade;
window.atualizarPreview = atualizarPreview;
window.atualizarCidades = atualizarCidades;

window.entrarComCodigo = entrarComCodigo;
window.compartilharWhatsApp = compartilharWhatsApp;
window.compartilharNativo = compartilharNativo;
window.copiarLink = copiarLink;
window.copiarResumoWhatsApp = copiarResumoWhatsApp;

window.abrirModalExcluir = abrirModalExcluir;
window.fecharModalExcluir = fecharModalExcluir;
window.confirmarExclusao = confirmarExclusao;
window.fecharModalTransferir = fecharModalTransferir;
window.confirmarTransferencia = confirmarTransferencia;

// ============ INIT ============
setTimeout(() => {
  atualizarPreview();
  const sel = document.getElementById('novoImagemSelect');
  if (sel) sel.addEventListener('change', atualizarPreview);
  const inputSenha = document.getElementById('cadSenha');
  if (inputSenha) inputSenha.addEventListener('input', atualizarForcaSenha);
}, 800);

setTimeout(verificarConviteURL, 2500);

setTimeout(async () => {
  await inicializarFormCriar();
  inicializarChipsTipo();
}, 1500);