import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { initializeFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js'; 

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });

// Dados extraídos do Calendário da Prefeitura (Novembro e Dezembro)
const listaEventos = [
  // NOVEMBRO
  { id: "evt-nov-01-holywins", nome: "Holywins", data: 1793512800000, local: "P. Getúlio Vargas" },
  { id: "evt-nov-01-glowrun", nome: "2ª Glow Night Run", data: 1793516400000, local: "Autódromo" },
  { id: "evt-nov-01-exu", nome: "Encontro do Povo de Exú", data: 1793523600000, local: "Parque de Rodeios" },
  { id: "evt-nov-03-gaucho", nome: "Gaúcho Trail 2026 - Hero Era", data: 1793703600000, local: "Autódromo" },
  { id: "evt-nov-06-rodeio", nome: "Rodeio PTG Estampa do Rio Grande", data: 1793943600000, local: "Parque de Rodeios" },
  { id: "evt-nov-06-livro", nome: "36ª Feira do Livro", data: 1793962800000, local: "P. Getúlio Vargas" },
  { id: "evt-nov-07-motos", nome: "SMR Arrancadas de Motos", data: 1794032400000, local: "Autódromo" },
  { id: "evt-nov-07-jesus", nome: "Marcha de Jesus", data: 1794054000000, local: "Poliesportivo" },
  { id: "evt-nov-07-lanternas", nome: "6ª Noite das Lanternas Flutuantes", data: 1794067200000, local: "Sítio Thomas Ecke" },
  { id: "evt-nov-08-maratona", nome: "8ª Maratona de Santa Cruz do Sul", data: 1794133200000, local: "Frente ao Pórtico" },
  { id: "evt-nov-08-headhead", nome: "Head to Head - Eisstocksport", data: 1794160800000, local: "25 de Julho" },
  { id: "evt-nov-13-veterancar", nome: "VeteranCar e Encontro Sul-Brasileiros Carros", data: 1794583200000, local: "Parque da Oktoberfest" },
  { id: "evt-nov-14-trackday", nome: "Track Day Carlos Barcelos", data: 1794666000000, local: "Autódromo" },
  { id: "evt-nov-15-seasc", nome: "1ª Corrida SEASC", data: 1794747600000, local: "A definir" },
  { id: "evt-nov-15-unicruz", nome: "Unicruz Running 2026", data: 1794747600000, local: "Lago Dourado" },
  { id: "evt-nov-19-enart", nome: "ENART", data: 1795098000000, local: "Parque da Oktoberfest" },
  { id: "evt-nov-28-parrilha", nome: "Parrilha dos Vales", data: 1795870800000, local: "Parque da Oktoberfest" },
  { id: "evt-nov-28-levatudo", nome: "Leva Tudo de Arrancada", data: 1795863600000, local: "Autódromo" },
  { id: "evt-nov-28-aura", nome: "Aura Golden Run", data: 1795896000000, local: "Lago Dourado" },

  // DEZEMBRO
  { id: "evt-dez-01-christkind", nome: "Christkindfest", data: 1796137200000, local: "Centro" },
  { id: "evt-dez-04-truck", nome: "Fórmula Truck", data: 1796389200000, local: "Autódromo" },
  { id: "evt-dez-06-pia", nome: "Piá Sports Natação 500m/1.5Km/5K", data: 1796562000000, local: "Lago Dourado" },
  { id: "evt-dez-12-motos", nome: "SMR Arrancadas de Motos", data: 1797075600000, local: "Autódromo" },
  { id: "evt-dez-12-natal", nome: "2º Natal Solidário", data: 1797096000000, local: "Parque da Oktoberfest" },
  { id: "evt-dez-18-patinacao", nome: "Encerramento 2026 - Insignia Patinação", data: 1797616800000, local: "Parque da Oktoberfest" },
  { id: "evt-dez-19-racha", nome: "Racha de Natal APPASC", data: 1797680400000, local: "Autódromo" },
  { id: "evt-dez-20-triathlon", nome: "Triathlon Super Triplo", data: 1797776400000, local: "Lago Dourado" },
  { id: "evt-dez-27-rebaixados", nome: "Encontro de Rebaixados e Som", data: 1798376400000, local: "Autódromo" },
  { id: "evt-dez-31-anonovo", nome: "Ano Novo da Noite das Lanternas", data: 1798768800000, local: "Sítio Thomas Ecke" }
];

async function subirParaFirebase() {
  const log = document.getElementById('log');
  
  for (const ev of listaEventos) {
    const docData = {
      nome: ev.nome,
      data: ev.data,
      local: ev.local,
      cidade: "Santa Cruz do Sul - RS",
      imagem: "img/default.jpg", // Usa a imagem padrão do seu app
      admin: "Prefeitura de Santa Cruz", // Define o criador
      adminEmail: "turismo@santacruz.rs.gov.br",
      tipo: "evento-cidade", // O app usa isso para diferenciar
      privado: false,
      vagas: 9999,
      participantes: [],
      gastos: [],
      acertosPagos: [],
      criadoEm: Date.now()
    };

    try {
      await setDoc(doc(db, "eventosCidade", ev.id), docData);
      log.innerHTML += `<li style="color: #10b981;">✅ ${ev.nome} - Salvo!</li>`;
    } catch (error) {
      log.innerHTML += `<li style="color: #ef4444;">❌ Erro em ${ev.nome}: ${error.message}</li>`;
    }
  }
  
  log.innerHTML += `<h3 style="color: #3b82f6;">🎉 Importação Concluída!</h3>`;
}

// Executa
subirParaFirebase();