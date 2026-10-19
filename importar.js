import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { initializeFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js'; 

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });

const eventosVenancio = [
  { 
    id: "evt-out-30-bonihonz", 
    nome: "Show De Boni e Henz – Brasil Regional", 
    data: new Date('2026-10-30T20:00:00').getTime(), 
    local: "Sociedade de Leituras", 
    imagem: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80"
  },
  { 
    id: "evt-nov-07-enart", 
    nome: "Encontro dos 36 Finalistas do ENART 2026", 
    data: new Date('2026-11-07T10:00:00').getTime(), 
    local: "Venâncio Aires", 
    imagem: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80"
  },
  { 
    id: "evt-nov-19-balonismo", 
    nome: "7º Festival de Balonismo", 
    data: new Date('2026-11-19T10:00:00').getTime(), 
    local: "Parque Municipal do Chimarrão", 
    imagem: "https://images.unsplash.com/photo-1507608616759-54f48f0af0ee?auto=format&fit=crop&w=600&q=80"
  },
  { 
    id: "evt-nov-26-livro", 
    nome: "27ª Feira do Livro de Venâncio Aires", 
    data: new Date('2026-11-26T10:00:00').getTime(), 
    local: "Centro de Venâncio Aires", 
    imagem: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=600&q=80"
  },
  { 
    id: "evt-nov-28-vinhedos", 
    nome: "Passeio Vale dos Vinhedos – Especial de Natal", 
    data: new Date('2026-11-28T09:00:00').getTime(), 
    local: "Saída: Venâncio Aires", 
    imagem: "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=600&q=80"
  },
  { 
    id: "evt-dez-04-natal", 
    nome: "Natal Brilha Venâncio", 
    data: new Date('2026-12-04T19:00:00').getTime(), 
    local: "Venâncio Aires", 
    imagem: "https://images.unsplash.com/photo-1512389142860-9c449e58a543?auto=format&fit=crop&w=600&q=80"
  },
  { 
    id: "evt-jan-15-saosebastiao", 
    nome: "151ª Festa de São Sebastião Mártir", 
    data: new Date('2027-01-15T19:00:00').getTime(), 
    local: "Igreja Matriz e Pavilhão de Eventos", 
    imagem: "https://images.unsplash.com/photo-1519817650390-64a93db51149?auto=format&fit=crop&w=600&q=80"
  }
];

async function salvarEventos() {
  console.log("Adicionando eventos de Venâncio Aires...");
  
  for (const ev of eventosVenancio) {
    const docData = {
      nome: ev.nome,
      data: ev.data,
      local: ev.local,
      cidade: "Venâncio Aires - RS",
      imagem: ev.imagem, 
      admin: "Prefeitura de Venâncio Aires",
      adminEmail: "turismo@venancioaires.rs.gov.br",
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
      console.log(`✅ Salvo: ${ev.nome}`);
    } catch (error) {
      console.error(`❌ Erro em ${ev.nome}:`, error.message);
    }
  }
  console.log("🎉 Fim da importação!");
}

salvarEventos();