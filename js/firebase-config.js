// Cole aqui a configuração do seu app Web do Firebase:
// Console do Firebase → Configurações do projeto → Seus apps → App da Web → "Config".
// Enquanto estiver com "COLE_AQUI", o app funciona em MODO LOCAL (dados só neste navegador).
export const firebaseConfig = {
  apiKey: "COLE_AQUI",
  authDomain: "SEU-PROJETO.firebaseapp.com",
  projectId: "SEU-PROJETO",
  storageBucket: "SEU-PROJETO.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000",
};

// Chave pública VAPID para notificações push (opcional, mas necessária para lembretes
// com o app fechado): Console → Configurações do projeto → Cloud Messaging →
// Configuração da Web → "Gerar par de chaves".
export const vapidKey = "";

export const isConfigured = !String(firebaseConfig.apiKey).startsWith("COLE");
