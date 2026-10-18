import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { initializeFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js'; 

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });

const eventosFinais = [
  // --- OUTUBRO ---
  { id: "evt-out-20-cinema", nome: "9ª Mostra SESC de Cinema", data: new Date('2026-10-20T19:00:00').getTime(), local: "Auditório dos Sindicatos", imagem: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=600&q=80" },
  
  { id: "evt-out-23-lixo", nome: "Semana do Lixo Zero", data: new Date('2026-10-23T09:00:00').getTime(), local: "UNISC", imagem: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=600&q=80" },
  
  { id: "evt-out-24-caravana", nome: "3ª Caravana Conecta SBOT-RS", data: new Date('2026-10-24T08:00:00').getTime(), local: "UNISC", imagem: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=600&q=80" },
  
  { id: "evt-out-24-ciclismo", nome: "24ª Copa Santa Cruz de Ciclismo", data: new Date('2026-10-24T08:00:00').getTime(), local: "Autódromo", imagem: "https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?auto=format&fit=crop&w=600&q=80" },
  
  { id: "evt-out-24-rosa", nome: "Caminhando Juntos - Outubro Rosa", data: new Date('2026-10-24T16:00:00').getTime(), local: "Lago Dourado", imagem: "https://images.unsplash.com/photo-1579728180211-40e338b7a4e4?auto=format&fit=crop&w=600&q=80" },
  
  { id: "evt-out-27-happy", nome: "Happy Hour Outubro Rosa", data: new Date('2026-10-27T18:00:00').getTime(), local: "Shopping Santa Cruz", imagem: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=600&q=80" },
  
  { id: "evt-out-31-halloween", nome: "Halloween em Santa Cruz", data: new Date('2026-10-31T19:00:00').getTime(), local: "Praça da Bandeira", imagem: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=600&q=80" },

  // A Oktoberfest (Foto de chopp, festa alemã de verdade)
  { id: "evt-out-24-oktober", nome: "41ª Oktoberfest de Santa Cruz", data: new Date('2026-10-24T11:00:00').getTime(), local: "Parque da Oktoberfest", imagem: "https://images.unsplash.com/photo-1518176258152-180792f49a1e?auto=format&fit=crop&w=600&q=80" },

  // --- NOVEMBRO E DEZEMBRO ---
  { id: "evt-nov-01-holywins", nome: "Holywins", data: new Date('2026-11-01T18:00:00').getTime(), local: "P. Getúlio Vargas", imagem: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80" },
  
  { id: "evt-nov-06-livro", nome: "36ª Feira do Livro", data: new Date('2026-11-06T10:00:00').getTime(), local: "P. Getúlio Vargas", imagem: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=600&q=80" },
  
  { id: "evt-nov-07-lanternas", nome: "6ª Noite das Lanternas", data: new Date('2026-11-07T19:00:00').getTime(), local: "Sítio Thomas Ecke", imagem: "https://images.unsplash.com/photo-1519219788971-8d9797e0928e?auto=format&fit=crop&w=600&q=80" },
  
  { id: "evt-nov-13-veterancar", nome: "VeteranCar", data: new Date('2026-11-13T10:00:00').getTime(), local: "Parque da Oktoberfest", imagem: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80" },
  
  { id: "evt-nov-19-enart", nome: "ENART", data: new Date('2026-11-19T10:00:00').getTime(), local: "Parque da Oktoberfest", imagem: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80" },
  
  { id: "evt-nov-28-parrilha", nome: "Parrilha dos Vales", data: new Date('2026-11-28T11:00:00').getTime(), local: "Parque da Oktoberfest", imagem: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=600&q=80" },
  
  { id: "evt-dez-01-christkind", nome: "Christkindfest", data: new Date('2026-12-01T19:00:00').getTime(), local: "Centro", imagem: "https://images.unsplash.com/photo-1543589077-47d81606c1bf?auto=format&fit=crop&w=600&q=80" },
  
  { id: "evt-dez-12-natal", nome: "2º Natal Solidário", data: new Date('2026-12-12T19:00:00').getTime(), local: "Parque da Oktoberfest", imagem: "https://images.unsplash.com/photo-1512389142860-9c449e58a543?auto=format&fit=crop&w=600&q=80" },

  // --- JANEIRO 2027 ---
  { id: "evt-jan-24-aircooled", nome: "2º Air Cooled (Fuscas)", data: new Date('2027-01-24T08:00:00').getTime(), local: "Praça da Bandeira", imagem: "https://images.unsplash.com/photo-1583101724124-355cb514dd6b?auto=format&fit=crop&w=600&q=80" }
];

async function salvarEventos() {
  console.log("Atualizando eventos com fotos reais...");
  
  for (const ev of eventosFinais) {
    const docData = {
      nome: ev.nome,
      data: ev.data,
      local: ev.local,
      cidade: "Santa Cruz do Sul - RS",
      imagem: ev.imagem, 
      admin: " Site Prefeitura de Santa Cruz",
      adminEmail: "turismo@santacruz.rs.gov.br",
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
      console.error(`❌ Erro em ${ev.nome}:`, error);
    }
  }
  console.log("🎉 Fim!");
}

salvarEventos();