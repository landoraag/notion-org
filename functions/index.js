// Envia lembretes push (FCM) mesmo com o app fechado.
// Roda a cada minuto, lê as aulas de todos os usuários e dispara:
//   - "start": no horário do lembrete configurado na aula
//   - "end":   ao terminar a aula, pedindo o check-in (se ainda não respondido)
// Requer o plano Blaze (pago por uso; o volume de um uso pessoal fica dentro da cota gratuita).
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const DEFAULT_TZ = "America/Sao_Paulo";

function nowIn(tz) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).map((x) => [x.type, x.value])
  );
  return { key: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
}
const toMin = (t) => { const [h, m] = (t || "0:0").split(":").map(Number); return h * 60 + m; };
const dow = (key) => new Date(key + "T12:00:00Z").getUTCDay();

function occursOn(l, key) {
  if (!l.date) return false;
  if (l.repeat === "weekly") return key >= l.date && (!l.until || key <= l.until) && dow(key) === dow(l.date);
  return l.date === key;
}

exports.lembretes = onSchedule({ schedule: "every 1 minutes", timeZone: DEFAULT_TZ, region: "southamerica-east1" }, async () => {
  const snap = await db.collectionGroup("lessons").get();
  const tokenCache = new Map();
  const getTokens = async (uid) => {
    if (!tokenCache.has(uid)) {
      const s = await db.collection("users").doc(uid).collection("tokens").get();
      tokenCache.set(uid, s.docs.map((d) => ({ ref: d.ref, token: d.get("token") })).filter((t) => t.token));
    }
    return tokenCache.get(uid);
  };

  for (const doc of snap.docs) {
    const l = doc.data();
    const uid = doc.ref.parent.parent.id;
    const { key, min } = nowIn(l.tz || DEFAULT_TZ);
    if (!occursOn(l, key) || (l.checkins && l.checkins[key])) continue;

    const start = toMin(l.start), end = toMin(l.end), rem = Math.min(+l.remind || 0, 600);
    const sent = l.sent || {};
    const jobs = [];
    if (min >= start - rem && min < end && !sent[`${key}_start`]) {
      const falta = start - min;
      jobs.push({ kind: "start", title: `Aula: ${l.title}`,
        body: falta > 0 ? `Começa às ${l.start} (em ${falta} min)${l.group ? " · " + l.group : ""}` : `Começou às ${l.start}` });
    }
    if (min >= end && min < end + 180 && !sent[`${key}_end`]) {
      jobs.push({ kind: "end", title: "Você deu a aula?", body: `${l.title} (${l.start}–${l.end}) — abra o app para confirmar.` });
    }
    for (const j of jobs) {
      const tokens = await getTokens(uid);
      await doc.ref.update({ [`sent.${key}_${j.kind}`]: true });
      if (!tokens.length) continue;
      const res = await admin.messaging().sendEachForMulticast({
        tokens: tokens.map((t) => t.token),
        data: { title: j.title, body: j.body, tag: `${doc.id}-${key}-${j.kind === "start" ? "start" : "end"}`, url: "./" },
        webpush: { headers: { Urgency: "high", TTL: "3600" } },
      });
      await Promise.all(res.responses.map((r, i) =>
        !r.success && /registration-token-not-registered|invalid-argument/.test(r.error?.code || "") ? tokens[i].ref.delete() : null));
    }
  }
});
