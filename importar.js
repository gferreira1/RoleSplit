import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { initializeFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js'; 

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });

const novosEventos = [
  // --- RIO PARDO ---
  { 
    id: "evt-out-24-riopardo", 
    nome: "Rio Pardo Fest (Clima de Oktoberfest)", 
    data: new Date('2026-10-24T22:00:00').getTime(), 
    local: "Passo da Areia", 
    cidade: "Rio Pardo - RS",
    imagem: "https://images.unsplash.com/photo-1518176258152-180792f49a1e?auto=format&fit=crop&w=600&q=80",
    admin: "Organização Rio Pardo Fest"
  },

  // --- TAQUARI ---
  { 
    id: "evt-nov-01-pagode", 
    nome: "Pagode + do Feriado", 
    data: new Date('2026-11-01T20:00:00').getTime(), 
    local: "Clube Taquari", 
    cidade: "Taquari - RS",
    imagem: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80",
    admin: "Organização do Evento"
  },
  { 
    id: "evt-nov-08-bailejota", 
    nome: "Baile do Jota (Show com MC J Mito)", 
    data: new Date('2026-11-08T22:00:00').getTime(), 
    local: "Clube Taquari", 
    cidade: "Taquari - RS",
    imagem: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80",
    admin: "Organização do Evento"
  },

  // --- SANTA CRUZ DO SUL ---
  { 
    id: "evt-dez-02-futsal", 
    nome: "Campeonato Municipal de Futsal 2026", 
    data: new Date('2026-12-02T19:30:00').getTime(), 
    local: "Ginásio Paulo César de Castro", 
    cidade: "Santa Cruz do Sul - RS",
    imagem: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80",
    admin: "Prefeitura de Santa Cruz"
  }
];

async function salvarEventos() {
  console.log("Adicionando eventos de Rio Pardo, Taquari e Futsal...");
  
  for (const ev of novosEventos) {
    const docData = {
      nome: ev.nome,
      data: ev.data,
      local: ev.local,
      cidade: ev.cidade,
      imagem: ev.imagem, 
      admin: ev.admin,
      adminEmail: "turismo@cidade.rs.gov.br",
      tipo: "evento-cidade",
      fixo: true,
      privado: false,
      vagas: 9999,
      participantes: [],
      gastos: [],
      acertosPagos: [],
      criadoEm: Date.now()
    };

    try {
      await setDoc(doc(db, "eventosCidade", ev.id), docData);
      console.log(`✅ Salvo: ${ev.nome} (${ev.cidade})`);
    } catch (error) {
      console.error(`❌ Erro em ${ev.nome}:`, error.message);
    }
  }
  console.log("🎉 Fim da importação!");
}

salvarEventos();