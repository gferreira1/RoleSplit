# 🍖 RoleSplit

App para organizar roles com os amigos e dividir contas sem estresse.

![RoleSplit](https://img.shields.io/badge/versão-1.0.0--MVP-10b981)
![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange)
![PWA](https://img.shields.io/badge/PWA-instalável-blue)

---

## ✨ Funcionalidades

### 🎯 MVP (v1.0)
- ✅ Criar role com título, data, vagas e capa
- ✅ Código único para cada role (ex: `X7K9`)
- ✅ Entrar em role por código ou link
- ✅ Lista de participantes em tempo real
- ✅ Adicionar gastos com divisão parcial
- ✅ Cálculo automático de saldos
- ✅ Algoritmo de "quem paga quem"
- ✅ Marcar acerto como pago
- ✅ Botão PIX com QR Code
- ✅ Convite via WhatsApp / link / compartilhar
- ✅ Sincronização em tempo real (Firebase)
- ✅ Instalável como app (PWA)

---

## 🚀 Como usar

1. Acesse: **[seu-usuario.github.io/rolesplit](https://seu-usuario.github.io/rolesplit)**
2. Defina seu nome
3. Crie um role ou entre com um código
4. Compartilhe o código com os amigos
5. Adicione os gastos durante o role
6. No final, o app calcula quem deve quem

---

## 📱 Telas

| # | Tela | Descrição |
|:---|:---|:---|
| 1 | Home | Lista de roles em destaque |
| 2 | Criar Role | Formulário de criação |
| 3 | Meus Roles | Roles que você participa |
| 4 | Perfil | Dados + entrar por código |
| 5 | Detalhes do Role | Modal com info + entrar/sair |
| 6 | Painel — Gastos | Adicionar e ver gastos |
| 7 | Painel — Acerto | Saldos + quem paga quem |
| 8 | Modal Adicionar Gasto | Formulário de gasto |

---

## 🛠️ Stack

- **Frontend:** HTML5 + CSS3 + JavaScript (ES Modules)
- **Backend:** Firebase Firestore (tempo real)
- **Auth:** Firebase Anonymous Auth
- **PWA:** manifest.json + service worker
- **Hospedagem:** GitHub Pages

---

## 🔧 Configuração Local

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/rolesplit.git
cd rolesplit