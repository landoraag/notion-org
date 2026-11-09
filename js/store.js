// Camada de dados: Firebase (Auth + Firestore + FCM) ou modo local (localStorage).
import { firebaseConfig, vapidKey, isConfigured } from "./firebase-config.js";

const FB = "https://www.gstatic.com/firebasejs/10.14.1/";
const LS_KEY = "aulas:v1";

const uid4 = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

export const mode = isConfigured ? "firebase" : "local";

// ---------- Modo local ----------
function localStore() {
  let lessons = [];
  let cb = () => {};
  const load = () => { try { lessons = JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { lessons = []; } };
  const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(lessons)); } catch {} cb(lessons); };
  return {
    user: { name: "Modo local", email: "" },
    async init({ onUser, onLessons }) { cb = onLessons; load(); onUser(this.user); cb(lessons); window.addEventListener("storage", () => { load(); cb(lessons); }); },
    async signIn() {}, async signOut() {},
    async upsert(l) { l.id ||= uid4(); const i = lessons.findIndex(x => x.id === l.id); i >= 0 ? (lessons[i] = { ...lessons[i], ...l }) : lessons.push(l); persist(); },
    async remove(id) { lessons = lessons.filter(l => l.id !== id); persist(); },
    async setCheckin(l, dateKey, status) {
      const x = lessons.find(a => a.id === l.id); if (!x) return;
      x.checkins ||= {}; status ? (x.checkins[dateKey] = status) : delete x.checkins[dateKey]; persist();
    },
    pushSupported: false,
  };
}

// ---------- Firebase ----------
function firebaseStore() {
  let app, auth, db, fs, user, unsub;
  const S = {
    user: null,
    pushSupported: !!vapidKey,
    async init({ onUser, onLessons }) {
      const [{ initializeApp }, authMod, fsMod] = await Promise.all([
        import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js"),
      ]);
      fs = fsMod;
      app = initializeApp(firebaseConfig);
      S.app = app;
      auth = authMod.getAuth(app);
      db = fs.initializeFirestore(app, {
        localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
      });
      S.authMod = authMod;
      authMod.onAuthStateChanged(auth, (u) => {
        unsub?.(); user = u; S.user = u && { uid: u.uid, name: u.displayName || "", email: u.email || "", photo: u.photoURL || "" };
        onUser(S.user);
        if (u) unsub = fs.onSnapshot(fs.collection(db, "users", u.uid, "lessons"),
          (snap) => onLessons(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
          (e) => console.error("Firestore:", e));
        else onLessons([]);
      });
    },
    async signIn() {
      const p = new S.authMod.GoogleAuthProvider();
      try { await S.authMod.signInWithPopup(auth, p); }
      catch (e) { if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") await S.authMod.signInWithRedirect(auth, p); else throw e; }
    },
    signOut() { return S.authMod.signOut(auth); },
    async upsert(l) {
      const id = l.id || uid4();
      const { id: _omit, ...data } = l;
      data.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
      await fs.setDoc(fs.doc(db, "users", user.uid, "lessons", id), data, { merge: true });
    },
    remove(id) { return fs.deleteDoc(fs.doc(db, "users", user.uid, "lessons", id)); },
    setCheckin(l, dateKey, status) {
      return fs.updateDoc(fs.doc(db, "users", user.uid, "lessons", l.id), {
        [`checkins.${dateKey}`]: status ? status : fs.deleteField(),
      });
    },
    // Registra o token FCM para receber lembretes com o app fechado.
    async enablePush(swReg) {
      const m = await import(FB + "firebase-messaging.js");
      if (!(await m.isSupported())) throw new Error("Push não suportado neste navegador.");
      const messaging = m.getMessaging(app);
      const token = await m.getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
      if (!token) throw new Error("Não foi possível obter o token de notificação.");
      await fs.setDoc(fs.doc(db, "users", user.uid, "tokens", token.slice(-40)),
        { token, ua: navigator.userAgent.slice(0, 120), updatedAt: fs.serverTimestamp() }, { merge: true });
      localStorage.setItem("aulas:push", "1");
      return token;
    },
  };
  return S;
}

export const store = mode === "firebase" ? firebaseStore() : localStore();
