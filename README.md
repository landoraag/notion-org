# Minhas Aulas

App/site (PWA) para organizar as aulas que você precisa dar: agenda do dia com horários, calendário mensal, aulas semanais recorrentes, **lembretes** (pop-up + notificação no celular) e **check-in** ("você deu a aula?").

- **Front-end:** HTML + CSS + JavaScript puro (sem build). Instalável no celular (PWA).
- **Login:** Firebase Authentication (Google).
- **Dados:** Cloud Firestore, por usuário (`users/{uid}/lessons`), com cache offline.
- **Lembretes com o app fechado:** Firebase Cloud Messaging + uma Cloud Function agendada.
- **Hospedagem:** Firebase Hosting, com deploy automático pelo GitHub Actions.

Sem configurar o Firebase, o app abre em **modo local** (dados só no navegador) — bom para testar.

## Testar localmente

```bash
python3 -m http.server 8000   # ou: npx serve .
# abra http://localhost:8000
```

## Configurar o Firebase (uma vez)

1. Em <https://console.firebase.google.com> crie um projeto.
2. **Authentication → Sign-in method →** ative **Google**. Em *Settings → Authorized domains*, confira que o domínio do site está na lista.
3. **Firestore Database →** criar banco (modo produção, região `southamerica-east1`).
4. **Configurações do projeto → Seus apps → Web (`</>`)** → copie o objeto `firebaseConfig` para `js/firebase-config.js`.
5. **Configurações do projeto → Cloud Messaging → Configuração da Web → Gerar par de chaves** → cole a chave pública em `vapidKey` no mesmo arquivo.
6. Copie `.firebaserc.example` para `.firebaserc` e troque `SEU-PROJETO` pelo ID do projeto.

## Publicar

**Manual**
```bash
npm i -g firebase-tools
firebase login
npm install --prefix functions
firebase deploy            # hosting + regras do Firestore + função de lembretes
```
> A função de lembretes (push com app fechado) exige o plano **Blaze**. Para um uso pessoal o consumo costuma ficar dentro da cota gratuita. Sem ela, o app ainda avisa (pop-up e notificação) enquanto estiver aberto. Para publicar só o site: `firebase deploy --only hosting,firestore:rules`.

**Automático (GitHub Actions)** — em *Settings → Secrets and variables → Actions*:
- Secret `FIREBASE_SERVICE_ACCOUNT`: JSON de uma conta de serviço com permissão de deploy (Console → Configurações → Contas de serviço → Gerar nova chave privada).
- Variable `FIREBASE_PROJECT_ID`: ID do projeto.

A cada push na `main` o site é publicado.

## Como usar

- **Nova aula:** nome, turma/etiqueta, data, início/fim, repetição semanal, lembrete (na hora, 5 min, 15 min, 30 min, 1 h ou 1 dia antes) e anotações.
- **Check-in:** ao fim da aula aparece um pop-up "Você deu a aula?" (Sim / Não / Depois). Também dá para marcar direto no card. Aulas dos últimos 7 dias sem resposta voltam a perguntar.
- **Check-ins (menu):** resumo dos últimos 30 dias (dadas, não dadas, sem resposta).
- **Lembretes no celular:** abra o site no celular, instale ("Adicionar à tela inicial"), vá em **Ajustes** e ative *Notificações* e *Push com o app fechado*. No iPhone, as notificações só funcionam com o app instalado na tela inicial (iOS 16.4+).

## Estrutura

```
index.html · css/style.css
js/app.js              interface, calendário, check-in, lembretes
js/store.js            Firebase (Auth/Firestore/FCM) ou modo local
js/notify.js           notificações do sistema
js/firebase-config.js  ← suas chaves
firebase-messaging-sw.js   service worker (push + clique)
functions/index.js     lembretes push agendados (a cada minuto)
firestore.rules · firebase.json · .github/workflows/deploy.yml
```
