import { store, mode } from "./store.js";
import * as notify from "./notify.js";
import { vapidKey } from "./firebase-config.js";

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const toMin = (t) => { const [h, m] = (t || "0:0").split(":").map(Number); return h * 60 + m; };
const fmtMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const todayKey = () => keyOf(new Date());
const fmtLong = (k) => cap(parseKey(k).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }));
const fmtShort = (k) => cap(parseKey(k).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).replace(".", ""));
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const ICONS = {
  bell: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5-6.7V3a2 2 0 1 0-4 0v1.3A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1zm1 2v12h11V5zM6 19h11v-0H6z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
};
const hydrateIcons = (root = document) => $$("[data-i]", root).forEach((el) => { if (!el.firstChild) el.innerHTML = ICONS[el.dataset.i] || ""; });

/* ---------- estado ---------- */
const S = {
  lessons: [],
  user: null,
  view: "agenda",
  selected: todayKey(),
  month: (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })(),
  settings: { remind: 15, ...lsGet("aulas:settings", {}) },
  snooze: {},
  editing: null,
  ciCurrent: null,
};

/* ---------- ocorrências ---------- */
function occursOn(l, dk) {
  if (!l.date) return false;
  if (l.repeat === "weekly") {
    return dk >= l.date && (!l.until || dk <= l.until) && parseKey(dk).getDay() === parseKey(l.date).getDay();
  }
  return l.date === dk;
}
const statusOf = (l, dk) => (l.checkins && l.checkins[dk]) || "";
function occurrencesOn(dk) {
  return S.lessons.filter((l) => occursOn(l, dk))
    .map((l) => ({ l, dk, status: statusOf(l, dk), start: toMin(l.start), end: toMin(l.end) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}
function occurrencesBetween(fromKey, toKey) {
  const out = []; for (let k = fromKey; k <= toKey; k = addDays(k, 1)) out.push(...occurrencesOn(k)); return out;
}
const isPast = (o) => o.dk < todayKey() || (o.dk === todayKey() && nowMin() >= o.end);

/* ---------- render: agenda ---------- */
function renderAgenda() {
  const occ = occurrencesOn(S.selected);
  const isToday = S.selected === todayKey();
  $("#viewTitle").textContent = isToday ? "Agenda de hoje" : "Agenda do dia";
  $("#viewSub").textContent = fmtLong(S.selected);
  if (!occ.length) {
    return `<div class="empty"><b>Nenhuma aula neste dia</b>Toque em “Nova aula” para agendar.</div>`;
  }
  const first = Math.min(...occ.map((o) => o.start)), last = Math.max(...occ.map((o) => o.end));
  const h0 = Math.max(0, Math.min(7, Math.floor(first / 60) - 1));
  const h1 = Math.min(24, Math.max(19, Math.ceil(last / 60) + 1));
  const H = getComputedStyle(document.documentElement).getPropertyValue("--hour").trim() || "76px";
  const hour = parseInt(H, 10);
  // colunas para eventos sobrepostos
  const cols = []; occ.forEach((o) => {
    let c = 0; while (cols[c] && cols[c] > o.start) c++; o.col = c; cols[c] = o.end;
  });
  occ.forEach((o) => { o.cols = Math.max(...occ.filter((p) => p.start < o.end && p.end > o.start).map((p) => p.col)) + 1; });

  let rows = "";
  for (let h = h0; h <= h1; h++) rows += `<div class="tl-row"><span class="tl-label">${pad(h)}:00</span></div>`;
  const cards = occ.map((o) => {
    const top = ((o.start - h0 * 60) / 60) * hour, height = Math.max(((o.end - o.start) / 60) * hour - 6, 92);
    const w = 100 / o.cols;
    const pill = o.status === "done" ? `<span class="pill done">✓ Dada</span>`
      : o.status === "missed" ? `<span class="pill missed">Não dada</span>`
      : isPast(o) ? `<span class="pill pending">Confirmar</span>` : `<span class="pill">${esc(o.l.group || "Aula")}</span>`;
    const btns = o.status
      ? `<button class="mini no" data-act="ci" data-id="${o.l.id}" data-dk="${o.dk}" data-v="">Desfazer</button>`
      : `<button class="mini ok" data-act="ci" data-id="${o.l.id}" data-dk="${o.dk}" data-v="done">Dei a aula</button>
         <button class="mini no" data-act="ci" data-id="${o.l.id}" data-dk="${o.dk}" data-v="missed">Não dei</button>`;
    return `<article class="lcard ${o.status}" style="top:${top}px;height:${height}px;left:calc(${o.col * w}% + 2px);width:calc(${w}% - 6px)">
      <h4>${esc(o.l.title)}</h4>
      <div class="meta">${o.l.start} – ${o.l.end}${o.l.group ? " · " + esc(o.l.group) : ""}${o.l.notes ? " · " + esc(o.l.notes).slice(0, 40) : ""}</div>
      <div class="actions">${pill}${btns}</div>
      <button class="more" data-act="edit" data-id="${o.l.id}" aria-label="Editar">${ICONS.dots}</button>
    </article>`;
  }).join("");
  let now = "";
  if (isToday && nowMin() >= h0 * 60 && nowMin() <= h1 * 60) now = `<div class="now-line" style="top:${((nowMin() - h0 * 60) / 60) * hour}px"></div>`;
  return `<div class="tl" style="height:${(h1 - h0) * hour + 20}px">${rows}<div class="tl-cards">${cards}</div>${now}</div>`;
}

/* ---------- render: aulas ---------- */
function renderAulas() {
  $("#viewTitle").textContent = "Todas as aulas";
  $("#viewSub").textContent = `${S.lessons.length} cadastrada${S.lessons.length === 1 ? "" : "s"}`;
  if (!S.lessons.length) return `<div class="empty"><b>Sem aulas ainda</b>Crie a primeira em “Nova aula”.</div>`;
  const sorted = [...S.lessons].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return `<div class="list">${sorted.map((l) => `
    <div class="item"><div class="grow"><b>${esc(l.title)}</b>
      <small>${l.repeat === "weekly" ? "Toda " + parseKey(l.date).toLocaleDateString("pt-BR", { weekday: "long" }) : fmtShort(l.date)} · ${l.start}–${l.end}${l.group ? " · " + esc(l.group) : ""}</small></div>
      <button class="chip" data-act="edit" data-id="${l.id}">Editar</button></div>`).join("")}</div>`;
}

/* ---------- render: histórico ---------- */
function renderHistorico() {
  $("#viewTitle").textContent = "Check-ins";
  $("#viewSub").textContent = "Últimos 30 dias";
  const t = todayKey();
  const occ = occurrencesBetween(addDays(t, -29), t).filter(isPast).sort((a, b) => (b.dk + b.start).toString().localeCompare(a.dk + a.start));
  const done = occ.filter((o) => o.status === "done").length, missed = occ.filter((o) => o.status === "missed").length;
  const pend = occ.length - done - missed;
  const list = occ.length ? occ.map((o) => `
    <div class="item"><div class="grow"><b>${esc(o.l.title)}</b><small>${fmtShort(o.dk)} · ${o.l.start}–${o.l.end}</small></div>
    ${o.status ? `<span class="pill ${o.status}">${o.status === "done" ? "✓ Dada" : "Não dada"}</span>`
      : `<button class="mini ok" data-act="ci" data-id="${o.l.id}" data-dk="${o.dk}" data-v="done">Dei</button><button class="mini no" data-act="ci" data-id="${o.l.id}" data-dk="${o.dk}" data-v="missed">Não dei</button>`}</div>`).join("")
    : `<div class="empty"><b>Nada por aqui ainda</b>Suas aulas passadas aparecerão aqui.</div>`;
  return `<div class="stats"><div class="stat"><b style="color:var(--ok)">${done}</b><small>dadas</small></div>
    <div class="stat"><b style="color:var(--no)">${missed}</b><small>não dadas</small></div>
    <div class="stat"><b style="color:var(--purple)">${pend}</b><small>sem resposta</small></div></div><div class="list">${list}</div>`;
}

/* ---------- render: ajustes ---------- */
function renderAjustes() {
  $("#viewTitle").textContent = "Ajustes";
  $("#viewSub").textContent = mode === "firebase" ? (S.user?.email || "") : "Modo local (sem Firebase configurado)";
  const perm = notify.permission();
  const permTxt = { granted: "Ativadas neste aparelho", denied: "Bloqueadas no navegador", default: "Ainda não ativadas", unsupported: "Não suportado aqui" }[perm];
  const pushOn = lsGet("aulas:push", false);
  return `
  <div class="group-title">Lembretes</div>
  <div class="setting"><div><b>Notificações</b><p>${permTxt}</p></div>
    <button class="btn dark" data-act="enable-notif" ${perm === "granted" || perm === "unsupported" ? "disabled" : ""}>${perm === "granted" ? "Ativo" : "Ativar"}</button></div>
  <div class="setting"><div><b>Lembrete padrão</b><p>Usado ao criar novas aulas</p></div>
    <select id="defRemind">${[0, 5, 15, 30, 60, 1440].map((m) => `<option value="${m}" ${+S.settings.remind === m ? "selected" : ""}>${m === 0 ? "Na hora" : m === 1440 ? "1 dia antes" : m >= 60 ? "1 hora antes" : m + " min antes"}</option>`).join("")}</select></div>
  <div class="setting"><div><b>Push com o app fechado</b><p>${mode !== "firebase" ? "Requer Firebase configurado" : !vapidKey ? "Faltando a chave VAPID em js/firebase-config.js" : pushOn ? "Ativo neste aparelho" : "Envia o lembrete mesmo sem o app aberto"}</p></div>
    <button class="btn dark" data-act="enable-push" ${mode !== "firebase" || !vapidKey || pushOn ? "disabled" : ""}>${pushOn ? "Ativo" : "Ativar"}</button></div>
  <div class="setting"><div><b>Testar</b><p>Envia um lembrete agora</p></div><button class="btn ghost" data-act="test-notif">Testar</button></div>
  <div class="group-title">Conta</div>
  <div class="setting"><div><b>${esc(S.user?.name || "Modo local")}</b><p>${mode === "firebase" ? esc(S.user?.email || "") : "Os dados ficam só neste navegador."}</p></div>
    ${mode === "firebase" ? `<button class="btn ghost" data-act="logout">Sair</button>` : ""}</div>`;
}

/* ---------- render: lateral ---------- */
function renderCalendar() {
  const y = S.month.getFullYear(), m = S.month.getMonth();
  $("#monthTitle").textContent = `${cap(S.month.toLocaleDateString("pt-BR", { month: "long" }))} ${y}`;
  const off = (new Date(y, m, 1).getDay() + 6) % 7;
  let html = ["S", "T", "Q", "Q", "S", "S", "D"].map((d) => `<div class="dow">${d}</div>`).join("");
  const t = todayKey();
  for (let i = 0; i < 42; i++) {
    const d = new Date(y, m, 1 - off + i), k = keyOf(d);
    const occ = occurrencesOn(k);
    const dot = occ.length ? `<i class="${occ.every((o) => o.status === "done") ? "all" : ""}"></i>` : "";
    html += `<button class="d ${d.getMonth() !== m ? "o" : ""} ${k === t ? "today" : ""} ${k === S.selected ? "sel" : ""}" data-act="pick" data-dk="${k}"><span>${d.getDate()}</span>${dot}</button>`;
  }
  $("#cal").innerHTML = html;
}
function renderUpcoming() {
  const t = todayKey(), n = nowMin();
  const list = occurrencesBetween(t, addDays(t, 30)).filter((o) => !(o.dk === t && o.end <= n) && !o.status).slice(0, 6);
  $("#upcoming").innerHTML = list.length ? list.map((o) => `
    <div class="sc" data-act="pick" data-dk="${o.dk}"><span class="tag">${esc(o.l.group || "Aula")}</span>
    <b>${esc(o.l.title)}</b><small>${fmtShort(o.dk)} · ${o.l.start}</small></div>`).join("")
    : `<div class="empty" style="padding:20px 0">Nada agendado</div>`;
}
function renderWeek() {
  const d = new Date(); const dow = (d.getDay() + 6) % 7;
  const mon = keyOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow));
  const occ = occurrencesBetween(mon, addDays(mon, 6));
  const done = occ.filter((o) => o.status === "done").length, tot = occ.length;
  const p = tot ? Math.round((done / tot) * 100) : 0;
  $("#ring").style.setProperty("--p", p); $("#ringTxt").textContent = p + "%";
  $("#weekTxt").textContent = tot ? `${done} de ${tot} aulas dadas` : "Sem aulas";
}

function render() {
  $$("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === S.view));
  $(".head-actions").classList.toggle("hidden", S.view !== "agenda");
  const v = $("#view");
  v.innerHTML = { agenda: renderAgenda, aulas: renderAulas, historico: renderHistorico, ajustes: renderAjustes }[S.view]();
  renderCalendar(); renderUpcoming(); renderWeek(); hydrateIcons();
  if (S.view === "agenda" && S.selected === todayKey()) {
    const now = $(".now-line"); if (now && !S._scrolled) { now.scrollIntoView({ block: "center" }); S._scrolled = true; }
  }
}

/* ---------- modal de aula ---------- */
const lessonModal = $("#lessonModal"), lessonForm = $("#lessonForm");
function openLesson(id) {
  const l = S.lessons.find((x) => x.id === id);
  S.editing = l || null;
  $("#lessonModalTitle").textContent = l ? "Editar aula" : "Nova aula";
  $("#btnDelete").classList.toggle("hidden", !l);
  const f = lessonForm.elements;
  f.title.value = l?.title || ""; f.group.value = l?.group || "";
  f.date.value = l?.date || S.selected; f.repeat.value = l?.repeat || "none";
  f.start.value = l?.start || "14:00"; f.end.value = l?.end || "14:50";
  f.remind.value = String(l?.remind ?? S.settings.remind); f.until.value = l?.until || ""; f.notes.value = l?.notes || "";
  toggleUntil(); lessonModal.showModal();
}
const toggleUntil = () => $(".until-wrap").classList.toggle("hidden", lessonForm.elements.repeat.value !== "weekly");
lessonForm.elements.repeat.addEventListener("change", toggleUntil);
$("#btnCancel").onclick = () => lessonModal.close();
$("#btnDelete").onclick = async () => {
  if (S.editing && confirm(`Excluir “${S.editing.title}”${S.editing.repeat === "weekly" ? " e todas as repetições" : ""}?`)) {
    await store.remove(S.editing.id); lessonModal.close(); toast("Aula excluída", S.editing.title);
  }
};
lessonForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = lessonForm.elements;
  if (toMin(f.end.value) <= toMin(f.start.value)) return toast("Horário inválido", "O fim deve ser depois do início.");
  const data = {
    ...(S.editing || {}), title: f.title.value.trim(), group: f.group.value.trim(), date: f.date.value,
    start: f.start.value, end: f.end.value, repeat: f.repeat.value, until: f.repeat.value === "weekly" ? f.until.value : "",
    remind: +f.remind.value, notes: f.notes.value.trim(), checkins: S.editing?.checkins || {},
  };
  delete data.sent;
  try { await store.upsert(data); S.selected = data.date; S.month = new Date(parseKey(data.date).getFullYear(), parseKey(data.date).getMonth(), 1); lessonModal.close(); toast("Aula salva", data.title); }
  catch (err) { toast("Erro ao salvar", err.message); }
});

/* ---------- check-in ---------- */
const ciModal = $("#checkinModal");
async function answer(l, dk, v) {
  try { await store.setCheckin(l, dk, v); } catch (e) { toast("Erro", e.message); }
}
function pendingCheckins() {
  const t = todayKey(), now = Date.now();
  return occurrencesBetween(addDays(t, -7), t).filter((o) => !o.status && isPast(o) && !(S.snooze[o.l.id + o.dk] > now));
}
function checkPending() {
  if (ciModal.open || lessonModal.open || !S.user) return;
  const o = pendingCheckins()[0]; if (!o) return;
  S.ciCurrent = o;
  $("#ciTitle").textContent = "Você deu a aula?";
  $("#ciSub").innerHTML = `<b>${esc(o.l.title)}</b><br>${fmtShort(o.dk)} · ${o.l.start}–${o.l.end}`;
  ciModal.showModal();
}
$("#ciYes").onclick = async () => { const o = S.ciCurrent; ciModal.close(); await answer(o.l, o.dk, "done"); toast("Aula registrada ✓", o.l.title); setTimeout(checkPending, 300); };
$("#ciNo").onclick = async () => { const o = S.ciCurrent; ciModal.close(); await answer(o.l, o.dk, "missed"); setTimeout(checkPending, 300); };
$("#ciLater").onclick = () => { const o = S.ciCurrent; S.snooze[o.l.id + o.dk] = Date.now() + 30 * 60e3; ciModal.close(); };
ciModal.addEventListener("cancel", () => { const o = S.ciCurrent; if (o) S.snooze[o.l.id + o.dk] = Date.now() + 30 * 60e3; });

/* ---------- lembretes (app aberto) ---------- */
const notified = new Set(lsGet("aulas:notified", []));
function mark(k) { notified.add(k); lsSet("aulas:notified", [...notified].slice(-300)); }
function tick() {
  if (!S.user) return;
  const t = todayKey(), n = nowMin();
  for (const o of occurrencesOn(t)) {
    if (o.status) continue;
    const rem = +o.l.remind || 0;
    const kS = `s:${o.l.id}:${t}`;
    if (rem < 1440 && n >= o.start - rem && n < o.end && !notified.has(kS)) {
      mark(kS);
      const when = o.start - n > 0 ? `começa às ${o.l.start} (em ${o.start - n} min)` : `começou às ${o.l.start}`;
      toast(`⏰ ${o.l.title}`, when);
      notify.show(`Aula: ${o.l.title}`, `${cap(when)}${o.l.group ? " · " + o.l.group : ""}`, `${o.l.id}-${t}-start`);
    }
    const kE = `e:${o.l.id}:${t}`;
    if (n >= o.end && !notified.has(kE)) {
      mark(kE);
      notify.show(`Você deu a aula?`, `${o.l.title} (${o.l.start}–${o.l.end}) — toque para confirmar.`, `${o.l.id}-${t}-end`);
    }
  }
  // lembrete "1 dia antes"
  const tomorrow = addDays(t, 1);
  for (const o of occurrencesOn(tomorrow)) {
    if ((+o.l.remind || 0) !== 1440 || o.status) continue;
    const k = `d:${o.l.id}:${tomorrow}`;
    if (n >= o.start && !notified.has(k)) { mark(k); toast(`Amanhã: ${o.l.title}`, `às ${o.l.start}`); notify.show(`Amanhã: ${o.l.title}`, `Começa às ${o.l.start}`, `${o.l.id}-${tomorrow}-day`); }
  }
  checkPending();
}

/* ---------- toasts ---------- */
function toast(title, text = "", ms = 6000) {
  const el = document.createElement("div"); el.className = "toast";
  el.innerHTML = `<div><b>${esc(title)}</b><span>${esc(text)}</span></div><button aria-label="Fechar">×</button>`;
  el.querySelector("button").onclick = () => el.remove();
  $("#toasts").append(el); setTimeout(() => el.remove(), ms);
}

/* ---------- eventos globais ---------- */
document.addEventListener("click", async (e) => {
  const a = e.target.closest("[data-act]"); const nav = e.target.closest("#nav button"); const vl = e.target.closest("[data-view-link]");
  if (nav) { S.view = nav.dataset.view; return render(); }
  if (vl) { S.view = vl.dataset.viewLink; return render(); }
  if (!a) return;
  const { act, id, dk, v } = a.dataset;
  if (act === "edit") openLesson(id);
  else if (act === "pick") { S.selected = dk; S.view = "agenda"; S.month = new Date(parseKey(dk).getFullYear(), parseKey(dk).getMonth(), 1); S._scrolled = false; render(); }
  else if (act === "ci") { const l = S.lessons.find((x) => x.id === id); await answer(l, dk, v); }
  else if (act === "enable-notif") { const r = await notify.requestPermission(); await notify.registerSW(); toast(r === "granted" ? "Notificações ativadas" : "Permissão não concedida", r === "granted" ? "Você receberá lembretes neste aparelho." : "Libere nas configurações do navegador."); render(); }
  else if (act === "test-notif") { if (notify.permission() !== "granted") await notify.requestPermission(); toast("Teste de lembrete", "Assim aparecem os avisos."); notify.show("Minhas Aulas", "Lembrete de teste ✓", "teste"); }
  else if (act === "enable-push") { try { const r = await notify.requestPermission(); if (r !== "granted") throw new Error("Permissão negada."); await store.enablePush(await notify.registerSW()); toast("Push ativado", "Lembretes chegarão mesmo com o app fechado."); } catch (err) { toast("Não foi possível ativar", err.message); } render(); }
  else if (act === "logout") store.signOut();
});
$("#btnNew").onclick = () => openLesson();
$("#prevDay").onclick = () => { S.selected = addDays(S.selected, -1); S.month = new Date(parseKey(S.selected).getFullYear(), parseKey(S.selected).getMonth(), 1); render(); };
$("#nextDay").onclick = () => { S.selected = addDays(S.selected, 1); S.month = new Date(parseKey(S.selected).getFullYear(), parseKey(S.selected).getMonth(), 1); render(); };
$("#todayBtn").onclick = () => { S.selected = todayKey(); S.month = new Date(); S.month.setDate(1); S._scrolled = false; render(); };
$("#prevMonth").onclick = () => { S.month = new Date(S.month.getFullYear(), S.month.getMonth() - 1, 1); renderCalendar(); };
$("#nextMonth").onclick = () => { S.month = new Date(S.month.getFullYear(), S.month.getMonth() + 1, 1); renderCalendar(); };
document.addEventListener("change", (e) => { if (e.target.id === "defRemind") { S.settings.remind = +e.target.value; lsSet("aulas:settings", S.settings); } });
$("#btnLogin").onclick = async () => { try { $("#loginErr").textContent = ""; await store.signIn(); } catch (e) { $("#loginErr").textContent = e.message; } };
navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.type === "notification-click") { S.selected = todayKey(); render(); checkPending(); } });
document.addEventListener("visibilitychange", () => { if (!document.hidden) { tick(); render(); } });
[lessonModal, ciModal].forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) m.close(); }));

/* ---------- inicialização ---------- */
hydrateIcons();
notify.registerSW();
store.init({
  onUser(u) {
    S.user = u;
    $("#login").classList.toggle("hidden", !!u);
    $("#app").classList.toggle("hidden", !u);
    if (mode === "local") { const b = $("#banner"); b.textContent = "Modo local: dados só neste navegador. Configure o Firebase para sincronizar."; b.classList.remove("hidden"); setTimeout(() => b.classList.add("hidden"), 9000); }
    render();
  },
  onLessons(list) { S.lessons = list; render(); setTimeout(() => { tick(); }, 400); },
});
setInterval(tick, 20000);
setInterval(() => { if (S.view === "agenda" && !document.hidden) render(); }, 60000);
