import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { initializeFirestore, doc, setDoc, getDoc, onSnapshot, collection, updateDoc, arrayUnion, arrayRemove }
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getAuth, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, EmailAuthProvider, reauthenticateWithCredential, deleteUser, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
const auth = getAuth(app);

const IMG_FALLBACK = 'img/default.jpg';

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

// Variáveis de Filtro (Declaradas APENAS UMA VEZ aqui)
let termoBusca = '';
let filtroCidadeAtual = 'todas';
let filtroLocalAtual = 'todos';

// ============ HELPERS ============
function imagemValida(url) {
  if (!url || typeof url !== 'string' || url.trim() === '') return IMG_FALLBACK;
  return url;
}

function toast(msg, erro = false) {
  const t = document.getElementById('toast');
  t.innerText = msg;
  t.className = 'toast ativo' + (erro ? ' erro' : '');
  setTimeout(() => t.classList.remove('ativo'), 2800);
}

function formatarReal(v) { return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function formatarData(ts) { if (!ts) return ''; return new Date(Number(ts)).toLocaleDateString('pt-BR'); }
function formatarDataLong(ts) { if (!ts) return ''; return new Date(Number(ts)).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }

function gerarCodigo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function normalizarEmail(e) { return (e || '').toLowerCase().trim(); }

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

// ============ INIT / AUTH STATE ============
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

function escutarRolesFirebase() {
  onSnapshot(collection(db, "roles"), (snapshotRoles) => {
    todosOsRoles = [];
    snapshotRoles.forEach(d => todosOsRoles.push({ id: d.id, ...d.data() }));

    const inicioHoje = new Date();
    inicioHoje.setHours(0, 0, 0, 0);
    const inicioHojeTimestamp = inicioHoje.getTime();

    const rolesPublicos = todosOsRoles.filter(r => {
      const publico = (r.privado === false || r.privado === undefined);
      if (!publico) return false;
      if (!r.data) return true;
      return Number(r.data) >= inicioHojeTimestamp;
    });

    onSnapshot(collection(db, "eventosCidade"), (snapshotEventos) => {
      const eventosCidade = [];
      snapshotEventos.forEach(d => {
        const ev = { id: d.id, ...d.data() };
        if (!ev.data || Number(ev.data) >= inicioHojeTimestamp) {
          eventosCidade.push(ev);
        }
      });

      roles = [...eventosCidade, ...rolesPublicos];
      roles.sort((a, b) => Number(a.data) - Number(b.data));

      aplicarFiltros(); // Chama a função de filtro

      if (document.getElementById('tela-meus').classList.contains('ativa')) renderizarMeusRoles();
      if (roleSelecionadoId) abrirModalDetalhes(roleSelecionadoId);
      if (rolePainelAberto) renderizarPainel();
    });
  }, (err) => {
    console.error("Erro ao escutar roles:", err);
  });
}

// ============ LÓGICA DE FILTROS E BUSCA (DINÂMICA) ============
window.abrirModalFiltros = function() {
  const selectCidade = document.getElementById('filtroCidadeSelect');
  
  // Limpa o select antes de preencher
  selectCidade.innerHTML = '';

  // Extrai cidades únicas do Firebase (da variável global 'roles')
  const cidadesSet = new Set();
  
  // Se a lista global 'roles' estiver vazia, tenta usar 'todosOsRoles'
  const listaBase = (typeof roles !== 'undefined' && roles.length > 0) ? roles : todosOsRoles;

  if (listaBase && listaBase.length > 0) {
    listaBase.forEach(r => {
      let cid = r.cidade;
      
      // Se for role de amigo e não tiver cidade, define Santa Cruz como padrão
      if (!cid && r.tipo !== 'evento-cidade') cid = 'Santa Cruz do Sul'; 
      
      if (cid) {
        // Limpa o nome: tira o " - RS", tira espaços extras e deixa a primeira letra maiúscula
        let nomeLimpo = cid.replace(/- RS/gi, '').trim();
        nomeLimpo = nomeLimpo.charAt(0).toUpperCase() + nomeLimpo.slice(1).toLowerCase();
        
        // Padroniza Santa Cruz para não duplicar
        if (nomeLimpo.toLowerCase().includes('santa cruz')) {
          nomeLimpo = 'Santa Cruz do Sul';
        }
        
        cidadesSet.add(nomeLimpo);
      }
    });
  }

  // Monta as opções no select
  let opcoesHTML = `<option value="todas">Todas as cidades</option>`;
  
  if (cidadesSet.size === 0) {
    opcoesHTML = `<option value="todas">Nenhum evento encontrado</option>`;
  } else {
    Array.from(cidadesSet).sort().forEach(cidade => {
      opcoesHTML += `<option value="${cidade.toLowerCase()}">${cidade} - RS</option>`;
    });
  }
  
  selectCidade.innerHTML = opcoesHTML;
  selectCidade.value = filtroCidadeAtual;

  // Chama a função que preenche o select de locais baseado na cidade selecionada
  atualizarLocaisPorCidade(); 
  
  // Abre o modal
  document.getElementById('modalFiltros').classList.add('ativo');
};
window.atualizarLocaisPorCidade = function() {
  const cidadeSelecionada = document.getElementById('filtroCidadeSelect').value;
  const selectLocal = document.getElementById('filtroLocalSelect');
  
  const locaisSet = new Set();
  roles.forEach(item => {
    const cidadeItem = (item.cidade || (item.tipo !== 'evento-cidade' ? 'santa cruz do sul' : '')).toLowerCase();
    if (cidadeSelecionada === 'todas' || cidadeItem.includes(cidadeSelecionada)) {
      if (item.tipo === 'evento-cidade' && item.local) {
        locaisSet.add(item.local.trim());
      }
    }
  });

  let opcoesHTML = `<option value="todos">🗺️ Todos os locais</option>`;
  Array.from(locaisSet).sort().forEach(local => {
    opcoesHTML += `<option value="${local.toLowerCase()}">📍 ${local}</option>`;
  });
  
  selectLocal.innerHTML = opcoesHTML;
  selectLocal.value = filtroLocalAtual; // Mantém o que estava selecionado se ainda existir
};

window.fecharModalFiltros = function() {
  document.getElementById('modalFiltros').classList.remove('ativo');
};

window.salvarFiltros = function() {
  filtroCidadeAtual = document.getElementById('filtroCidadeSelect').value;
  filtroLocalAtual = document.getElementById('filtroLocalSelect').value; // Pega do select
  fecharModalFiltros();
  aplicarFiltros();
};

window.limparFiltros = function() {
  const inputBusca = document.getElementById('inputBusca');
  if (inputBusca) inputBusca.value = '';
  termoBusca = '';
  filtroCidadeAtual = 'todas';
  filtroLocalAtual = 'todos';
  fecharModalFiltros();
  aplicarFiltros();
};

window.aplicarFiltros = function() {
  const inputBusca = document.getElementById('inputBusca');
  termoBusca = inputBusca ? inputBusca.value.toLowerCase() : '';

  if (!termoBusca && filtroCidadeAtual === 'todas' && filtroLocalAtual === 'todos') {
    renderizarEventos(roles);
    return;
  }

  const filtrados = roles.filter(item => {
    const isEvento = item.tipo === 'evento-cidade';
    const nomeMatch = (item.nome || '').toLowerCase().includes(termoBusca);
    
    // Filtro de Cidade
    let cidadeMatch = true;
    if (filtroCidadeAtual !== 'todas') {
      const cidadeDoItem = (item.cidade || (isEvento ? '' : 'santa cruz do sul')).toLowerCase();
      cidadeMatch = cidadeDoItem.includes(filtroCidadeAtual);
    }

    // Filtro de Local
    let localMatch = true;
    if (filtroLocalAtual !== 'todos') {
      if (!isEvento) return false; // Roles não têm local fixo
      const localDoEvento = (item.local || '').toLowerCase();
      localMatch = localDoEvento.includes(filtroLocalAtual);
    }

    return nomeMatch && cidadeMatch && localMatch;
  });

  filtrados.sort((a, b) => Number(a.data) - Number(b.data));
  renderizarEventos(filtrados);
};

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
window.pedirLogin = function(acaoPendente) {
  acaoPendentePosLogin = acaoPendente || null;
  document.getElementById('modalLogin').classList.add('ativo');
};

window.trocarModalAuth = function(qual) {
  document.getElementById('modalLogin').classList.remove('ativo');
  document.getElementById('modalCadastro').classList.remove('ativo');
  if (qual === 'cadastro') document.getElementById('modalCadastro').classList.add('ativo');
  else document.getElementById('modalLogin').classList.add('ativo');
};

window.fecharModalAuth = function() {
  // 1. Fecha os modais
  document.getElementById('modalLogin').classList.remove('ativo');
  document.getElementById('modalCadastro').classList.remove('ativo');
  
  // 2. Limpa a ação pendente (para não tentar fazer nada depois)
  acaoPendentePosLogin = null;
  
  // 3. FORÇA o retorno para a Home
  irAba('home');
};
window.fazerLogin = async function() {
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
};

window.fazerCadastro = async function() {
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
};

window.fazerLogout = async function() {
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
};

function executarAcao(acao) {
  if (acao === 'criar') irAba('criar');
  else if (acao === 'meus') irAba('meus');
  else if (acao && typeof acao === 'object' && acao.tipo === 'entrar') {
    entrarNoRole(acao.roleId);
  }
}

// ============ PERFIL ============
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

window.abrirCadastro = function() {
  document.getElementById('modalLogin').classList.remove('ativo');
  document.getElementById('modalCadastro').classList.add('ativo');
};

window.abrirModalNome = function(edicao) {
  const atual = usuarioAtual || '';
  const nome = prompt(edicao ? 'Digite o novo nome:' : 'Como você quer ser chamado?', atual);
  if (nome && nome.trim()) {
    usuarioAtual = nome.trim();
    localStorage.setItem('rolesplit_usuario', usuarioAtual);
    const user = auth.currentUser;
    if (user && !user.isAnonymous) updateProfile(user, { displayName: usuarioAtual }).catch(()=>{});
    atualizarPerfilUI();
    atualizarMenuLateral();
    toast('✅ Nome atualizado!');
  }
};

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
  
  if (listaParaRenderizar.length === 0) {
    destaqueContainer.innerHTML = '<div class="empty">Nenhum evento ou role encontrado.</div>';
    gridEventos.innerHTML = '';
    return;
  }

  const principal = listaParaRenderizar[0];
  const isEventoPrincipal = principal.tipo === 'evento-cidade';

  destaqueContainer.innerHTML = `
    <div class="card-destaque" data-id="${principal.id}">
      <div class="capa" style="background-image: url('${imagemValida(principal.imagem)}')">
        <div class="badge-tipo">${isEventoPrincipal ? '🎪 Evento' : '🎯 ' + (principal.codigo || 'Role')}</div>
      </div>
      <div class="conteudo">
        <div class="titulo">${principal.nome}</div>
        <div class="data">📅 ${formatarData(principal.data)}</div>
        <div class="local">${isEventoPrincipal ? '📍 ' + (principal.local || 'A definir') : '👥 ' + (principal.participantes || []).length + '/' + principal.vagas + ' participantes'}</div>
      </div>
    </div>
  `;

  gridEventos.innerHTML = listaParaRenderizar.slice(1).map(r => {
    const isEvento = r.tipo === 'evento-cidade';
    return `
      <div class="card-mini" data-id="${r.id}">
        <div class="capa" style="background-image: url('${imagemValida(r.imagem)}')">
          ${isEvento ? '<div style="position:absolute; top:8px; right:8px; background:#3b82f6; color:#fff; font-size:10px; font-weight:800; padding:2px 6px; border-radius:4px;">🎪 EVENTO</div>' : ''}
        </div>
        <div class="conteudo">
          <div class="titulo">${r.nome}</div>
          <div class="data">📅 ${formatarData(r.data)}</div>
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.card-destaque, .card-mini').forEach(el => {
    el.onclick = () => { abrirModalDetalhes(el.dataset.id); };
  });
}

// ============ MODAL DETALHES ============
window.abrirModalDetalhes = function(id) {
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
  document.getElementById('detalhesAdmin').innerText = `Por ${r.admin || 'Desconhecido'}${ehAdmin ? ' (você 👑)' : ''}`;
  document.getElementById('detalhesDataHora').innerText = formatarDataLong(r.data);
  document.getElementById('detalhesLocal').innerText = r.local || 'Não informado';
  document.getElementById('detalhesCidade').innerText = r.cidade || 'Não informada';
  
  document.getElementById('detalhesCodigo').innerText = isEvento ? 'EVENTO OFICIAL' : (r.codigo || '---');
  document.getElementById('detalhesVagasTexto').innerText = isEvento ? 'Evento Aberto' : `${parts.length} / ${vagas}`;
  document.getElementById('detalhesBarraFill').style.width = isEvento ? '100%' : pct + '%';

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
    secaoCustos = `
      <div style="background:#0f172a; padding:14px; border-radius:14px; margin-bottom:16px; text-align:center;">
        <div style="font-size:13px; color:#64748b;">Este é um evento oficial da cidade e não possui controle de gastos.</div>
      </div>
    `;
  } else if (total > 0) {
    secaoCustos += `
      <div style="background:#0f172a; padding:14px; border-radius:14px; margin-bottom:16px;">
        <h3 style="font-size:14px; color:#f1f5f9; margin-bottom:10px;">💰 Resumo de Custos</h3>
        <div class="resumo-grid">
          <div class="resumo-item"><div class="label">Total</div><div class="valor total">${formatarReal(total)}</div></div>
          <div class="resumo-item"><div class="label">Pessoas</div><div class="valor pessoas">${parts.length}</div></div>
          <div class="resumo-item" style="grid-column: span 2;"><div class="label">Cota por Pessoa</div><div class="valor cota">${formatarReal(cota)}</div></div>
        </div>
      </div>
    `;
    secaoCustos += `
      <div style="background:#0f172a; padding:14px; border-radius:14px; margin-bottom:16px;">
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
      </div>
    `;
    const saldos = calcularSaldos(r);
    const acertos = calcularAcertos(saldos);
    if (acertos.length > 0) {
      secaoCustos += `
        <div style="background:#0f172a; padding:14px; border-radius:14px; margin-bottom:16px;">
          <h3 style="font-size:14px; color:#f1f5f9; margin-bottom:10px;">🤝 Acertos</h3>
          ${acertos.map(a => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; font-size:13px;">
              <span style="color:#94a3b8;">${a.de} → ${a.para}</span>
              <span style="color:#3b82f6; font-weight:800;">${formatarReal(a.valor)}</span>
            </div>
          `).join('')}
        </div>
      `;
    }
  } else {
    secaoCustos = `
      <div style="background:#0f172a; padding:14px; border-radius:14px; margin-bottom:16px; text-align:center;">
        <div style="font-size:13px; color:#64748b;">Nenhum gasto registrado ainda.</div>
      </div>
    `;
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
    rodape.innerHTML = `
      <div style="display:flex; gap:10px;">
        <button class="btn btn-primary" style="flex:1;" onclick="acessarPainel('${r.id}')">👀 Ver Painel</button>
        <button class="btn btn-danger" style="width:auto;" onclick="sairDoRole('${r.id}')">❌ Sair</button>
      </div>
    `;
  } else if (jaVai && !ehAdmin) {
    rodape.innerHTML = `<button class="btn btn-danger" onclick="sairDoRole('${r.id}')">❌ Sair do Role</button>`;
  } else {
    rodape.innerHTML = `<button class="btn btn-primary" onclick="entrarNoRole('${r.id}')">✋ Entrar no Role</button>`;
  }
  
  document.getElementById('modalDetalhes').classList.add('ativo');
};

window.fecharModalDetalhes = function() {
  roleSelecionadoId = null;
  document.getElementById('modalDetalhes').classList.remove('ativo');
};

window.entrarNoRole = async function(id) {
  if (!usuarioLogado) { pedirLogin({ tipo: 'entrar', roleId: id }); return; }
  try {
    await updateDoc(doc(db, "roles", id), { 
      participantes: arrayUnion(usuarioAtual),
      participantesEmails: arrayUnion(usuarioEmail)
    });
    toast('✅ Você entrou no role!');
  } catch (e) { toast('Erro: ' + e.message, true); }
};

window.sairDoRole = async function(id) {
  if (!confirm('Sair do role?')) return;
  try {
    await updateDoc(doc(db, "roles", id), { 
      participantes: arrayRemove(usuarioAtual),
      participantesEmails: arrayRemove(usuarioEmail)
    });
    toast('Você saiu do role.');
    fecharModalDetalhes();
  } catch (e) { toast('Erro: ' + e.message, true); }
};

// ============ PAINEL ============
window.acessarPainel = function(id) {
  const r = todosOsRoles.find(x => x.id == id);
  if (!r) return;
  if (!ehAdminDoRole(r)) { toast('Só o admin pode ver o painel', true); return; }
  
  rolePainelAberto = id;
  fecharModalDetalhes();
  document.getElementById('roleTituloPainel').innerText = r.nome;
  document.getElementById('roleSubtituloPainel').innerText = `📅 ${formatarData(r.data)}${r.local ? ' • 📍 ' + r.local : ''}${r.cidade ? ' • 🗺️ ' + r.cidade : ''}`;
  document.getElementById('roleCodigoTopo').innerText = `CÓD: ${r.codigo}`;
  document.getElementById('codigoPainelPessoas').innerText = r.codigo;
  document.querySelectorAll('#tela-painel .aba').forEach((a, i) => { if (i === 0) a.classList.add('ativa'); else a.classList.remove('ativa'); });
  document.getElementById('aba-painel-gastos').style.display = 'block';
  document.getElementById('aba-painel-acerto').style.display = 'none';
  document.getElementById('aba-painel-pessoas').style.display = 'none';
  renderizarPainel();
  irAba('painel');
};

window.trocarAbaPainel = function(aba, event) {
  document.querySelectorAll('#tela-painel .aba').forEach(a => a.classList.remove('ativa'));
  if (event) event.target.classList.add('ativa');
  document.getElementById('aba-painel-gastos').style.display = aba === 'gastos' ? 'block' : 'none';
  document.getElementById('aba-painel-acerto').style.display = aba === 'acerto' ? 'block' : 'none';
  document.getElementById('aba-painel-pessoas').style.display = aba === 'pessoas' ? 'block' : 'none';
};

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

window.removerGasto = async function(gastoId) {
  if (!confirm('Remover este gasto?')) return;
  const r = todosOsRoles.find(x => x.id == rolePainelAberto);
  const novosGastos = (r.gastos || []).filter(g => g.id != gastoId);
  try { await updateDoc(doc(db, "roles", rolePainelAberto), { gastos: novosGastos }); toast('Gasto removido.'); }
  catch (e) { toast('Erro: ' + e.message, true); }
};

window.marcarPago = async function(de, para, valor) {
  const novoAcerto = { de, para, valor, data: Date.now() };
  try {
    await updateDoc(doc(db, "roles", rolePainelAberto), { acertosPagos: arrayUnion(novoAcerto) });
    toast(`✅ ${de} pagou ${formatarReal(valor)} para ${para}`);
  } catch (e) { toast('Erro: ' + e.message, true); }
};

window.adicionarParticipanteManual = async function() {
  const nome = document.getElementById('novoParticipanteManual').value.trim();
  if (!nome) return;
  try {
    await updateDoc(doc(db, "roles", rolePainelAberto), { participantes: arrayUnion(nome) });
    document.getElementById('novoParticipanteManual').value = '';
    toast('✅ Adicionado!');
  } catch (e) { toast('Erro: ' + e.message, true); }
};

window.removerParticipante = async function(nome) {
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
};

// ============ GASTOS ============
window.abrirModalGasto = function() {
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
};

window.fecharModalGasto = function() { document.getElementById('modalGasto').classList.remove('ativo'); };

window.marcarTodosGasto = function(m) {
  document.querySelectorAll('#gastoCheckParticipantes input[type="checkbox"]').forEach(cb => {
    cb.checked = m;
    const l = cb.closest('.check-item');
    if (m) l.classList.add('ativo'); else l.classList.remove('ativo');
  });
};

window.salvarGasto = async function() {
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
};

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
  
  if (!usuarioLogado) {
    c.innerHTML = '<div class="empty">🔐 Faça login pra ver seus roles.</div>';
    return;
  }

  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);
  const inicioHojeTimestamp = inicioHoje.getTime();

  const meus = todosOsRoles.filter(r => {
    if (!ehParticipanteDoRole(r)) return false;
    if (!r.data) return true;
    return Number(r.data) >= inicioHojeTimestamp;
  });

  meus.sort((a, b) => Number(a.data) - Number(b.data));
  
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
let ehPrivado = true;
window.togglePrivacidade = function() {
  ehPrivado = !ehPrivado;
  const t = document.getElementById('togglePrivado');
  const d = document.getElementById('toggleDesc');
  const titulo = t.querySelector('.titulo');
  if (ehPrivado) { t.classList.add('ativo'); titulo.innerHTML = '🔒 Evento Privado'; d.innerText = 'Só quem tem o código pode entrar'; }
  else { t.classList.remove('ativo'); titulo.innerHTML = '🌎 Evento Público'; d.innerText = 'Aparece para todos no app'; }
};

function atualizarPreview() {
  const sel = document.getElementById('novoImagemSelect');
  const preview = document.getElementById('previewImagem');
  if (sel && preview) preview.style.backgroundImage = `url('${sel.value}')`;
}

document.getElementById('formCriarRole').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!usuarioLogado) { pedirLogin('criar'); return; }
  const codigo = gerarCodigo();
  const imagem = document.getElementById('novoImagemSelect').value;
  const novo = {
    codigo,
    nome: document.getElementById('novoTitulo').value,
    data: new Date(document.getElementById('novoData').value).getTime(),
    vagas: parseInt(document.getElementById('novoVagas').value),
    imagem: imagem,
    local: document.getElementById('novoLocal').value || '',
    cidade: document.getElementById('novoCidade').value || '',
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
    ehPrivado = true;
    document.getElementById('togglePrivado').classList.add('ativo');
    document.querySelector('#togglePrivado .titulo').innerHTML = '🔒 Evento Privado';
    document.getElementById('toggleDesc').innerText = 'Só quem tem o código pode entrar';
    atualizarPreview();
    irAba('home');
  } catch (err) { toast('Erro: ' + err.message, true); }
});

window.entrarComCodigo = async function() {
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
};

// ============ CONVITE ============
function gerarLinkConvite() { return `${window.location.origin}${window.location.pathname}?join=${rolePainelAberto}`; }

function gerarMensagemConvite() {
  const r = todosOsRoles.find(x => x.id == rolePainelAberto);
  return `🍖 *${r.nome}*\n\nVocê foi convidado!\n\n🔑 Código: *${r.codigo}*\n🔗 Link: ${gerarLinkConvite()}\n\nEntre no app e use o código para participar.\n\n_RoleSplit_`;
}

window.compartilharWhatsApp = function() { window.open('https://wa.me/?text=' + encodeURIComponent(gerarMensagemConvite()), '_blank'); };
window.compartilharNativo = function() { if (navigator.share) navigator.share({ title: 'Convite RoleSplit', text: gerarMensagemConvite() }); else copiarLink(); };
window.copiarLink = function() {
  const link = gerarLinkConvite();
  navigator.clipboard.writeText(link).then(() => toast('✅ Link copiado!')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = link; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    toast('✅ Link copiado!');
  });
};

window.copiarResumoWhatsApp = function() {
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
};

// ============ EXCLUIR CONTA ============
window.abrirModalExcluir = function() {
  const meusRolesAdmin = todosOsRoles.filter(r => ehAdminDoRole(r) && ehParticipanteDoRole(r));
  document.getElementById('avisoTransferir').style.display = meusRolesAdmin.length > 0 ? 'block' : 'none';
  document.getElementById('excluirSenha').value = '';
  document.getElementById('modalExcluir').classList.add('ativo');
};

window.fecharModalExcluir = function() {
  document.getElementById('modalExcluir').classList.remove('ativo');
};

window.confirmarExclusao = async function() {
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
};

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

window.fecharModalTransferir = function() {
  document.getElementById('modalTransferir').classList.remove('ativo');
};

window.confirmarTransferencia = async function() {
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
};

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

// ============ VALIDAÇÃO DE SENHA ============
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
  if (!senha) {
    containerForca.style.display = 'none';
    containerReq.style.display = 'none';
    return;
  }
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

setTimeout(() => {
  const input = document.getElementById('cadSenha');
  if (input) input.addEventListener('input', atualizarForcaSenha);
}, 500);

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

// ============ INIT ============
setTimeout(() => {
  atualizarPreview();
  const sel = document.getElementById('novoImagemSelect');
  if (sel) sel.addEventListener('change', atualizarPreview);
}, 3000);

setTimeout(verificarConviteURL, 2500);