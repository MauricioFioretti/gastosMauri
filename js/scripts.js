// ================== CONFIG (Google Sheets API DIRECTO) ==================
// ✅ Igual que Comidas: NO Apps Script, pegamos directo a Sheets API
const SPREADSHEET_ID = "1WVMfCR99M7LEGu-wqKlYPvq7-3DKn50QZgmJzUwVrEw";
const SHEET_NAME = "gastosMauri"; // pestaña que contiene los movimientos

// =====================
// CONFIG OAUTH (GIS)
// =====================
// IMPORTANTE: Client ID del proyecto OAuth (external, test users restringidos)
const OAUTH_CLIENT_ID = "839738936173-i2bit146ca9n3m8ad7gp2t062sl8q9q1.apps.googleusercontent.com";

// ✅ Sheets API directo: necesitamos permiso de planillas
const OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  // ✅ leer/escribir en la planilla
  "https://www.googleapis.com/auth/spreadsheets"
].join(" ");

// LocalStorage OAuth
const LS_OAUTH = "gastos_oauth_token_v1";        // {access_token, expires_at}
const LS_OAUTH_EMAIL = "gastos_oauth_email_v1";  // email para hint

// =====================
// OAuth state
// =====================
let tokenClient = null;
let oauthAccessToken = "";
let oauthExpiresAt = 0;

// Connection lock (evita carreras)
let connectInFlight = null;
function isConnectBusy() { return !!connectInFlight; }

// =====================
// Helpers
// =====================
function isOnline() { return navigator.onLine !== false; }

function isTokenValid() {
  return !!oauthAccessToken && Date.now() < (oauthExpiresAt - 10_000);
}

function loadStoredOAuth() {
  try {
    const raw = localStorage.getItem(LS_OAUTH);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed?.access_token || !parsed?.expires_at) return null;
    return { access_token: parsed.access_token, expires_at: Number(parsed.expires_at) };
  } catch { return null; }
}
function saveStoredOAuth(access_token, expires_at) {
  try { localStorage.setItem(LS_OAUTH, JSON.stringify({ access_token, expires_at })); } catch {}
}
function clearStoredOAuth() {
  try { localStorage.removeItem(LS_OAUTH); } catch {}
}

function loadStoredOAuthEmail() {
  try { return String(localStorage.getItem(LS_OAUTH_EMAIL) || "").trim().toLowerCase(); }
  catch { return ""; }
}
function saveStoredOAuthEmail(email) {
  try { localStorage.setItem(LS_OAUTH_EMAIL, (email || "").toString()); } catch {}
}
function clearStoredOAuthEmail() {
  try { localStorage.removeItem(LS_OAUTH_EMAIL); } catch {}
}

async function fetchUserEmailFromToken(accessToken) {
  const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!r.ok) throw new Error("No se pudo obtener userinfo");
  const data = await r.json();
  return (data?.email || "").toString();
}

function initOAuth() {
  if (!window.google?.accounts?.oauth2?.initTokenClient) {
    throw new Error("GIS no está cargado (falta gsi/client en HTML)");
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: OAUTH_CLIENT_ID,
    scope: OAUTH_SCOPES,
    include_granted_scopes: true,
    use_fedcm_for_prompt: true,
    callback: () => {}
  });
}

// prompt: "" (silent), "consent", "select_account"
function requestAccessToken({ prompt, hint } = {}) {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error("OAuth no inicializado"));

    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error("popup_timeout_or_closed"));
    }, 45_000);

    tokenClient.callback = (resp) => {
      if (done) return;
      done = true;
      clearTimeout(timer);

      if (!resp || resp.error) {
        const err = String(resp?.error || "oauth_error");
        const sub = String(resp?.error_subtype || "");
        const msg = (err + (sub ? `:${sub}` : "")).toLowerCase();

        const e = new Error(err);
        e.isCanceled =
          msg.includes("popup_closed") ||
          msg.includes("popup_closed_by_user") ||
          msg.includes("access_denied") ||
          msg.includes("user_cancel") ||
          msg.includes("interaction_required");

        return reject(e);
      }

      const accessToken = resp.access_token;
      const expiresIn = Number(resp.expires_in || 3600);
      const expiresAt = Date.now() + (expiresIn * 1000);

      oauthAccessToken = accessToken;
      oauthExpiresAt = expiresAt;
      saveStoredOAuth(accessToken, expiresAt);

      resolve({ access_token: accessToken, expires_at: expiresAt });
    };

    const req = {};
    if (prompt !== undefined) req.prompt = prompt;
    if (hint && String(hint).includes("@")) req.hint = hint;

    try { tokenClient.requestAccessToken(req); }
    catch (e) { clearTimeout(timer); reject(e); }
  });
}

// allowInteractive=false => NO popup
async function ensureOAuthToken(allowInteractive = false, interactivePrompt = "consent") {
  // 1) token runtime
  if (isTokenValid()) return oauthAccessToken;

  // 2) token guardado
  const stored = loadStoredOAuth();
  if (stored?.access_token && stored?.expires_at && Date.now() < (stored.expires_at - 10_000)) {
    oauthAccessToken = stored.access_token;
    oauthExpiresAt = Number(stored.expires_at);
    return oauthAccessToken;
  }

  const hintEmail = (loadStoredOAuthEmail() || "").trim().toLowerCase();

  // Corte anti-loop: si no es interactivo y no tengo hint, no llamar GIS
  if (!allowInteractive && !hintEmail) throw new Error("TOKEN_NEEDS_INTERACTIVE");

  // 3) silent real
  try {
    await requestAccessToken({ prompt: "", hint: hintEmail || undefined });
    if (isTokenValid()) return oauthAccessToken;
  } catch {
    if (!allowInteractive) throw new Error("TOKEN_NEEDS_INTERACTIVE");
  }

  // 4) interactivo
  await requestAccessToken({ prompt: interactivePrompt ?? "consent", hint: hintEmail || undefined });
  if (!isTokenValid()) throw new Error("TOKEN_NEEDS_INTERACTIVE");
  return oauthAccessToken;
}

async function forceSwitchAccount() {
  clearStoredOAuth();
  clearStoredOAuthEmail();
  oauthAccessToken = "";
  oauthExpiresAt = 0;
  await ensureOAuthToken(true, "select_account");
}

// =====================
// API client (DIRECTO con Google APIs: Sheets + OIDC)
// =====================
// Estructura soportada en "gastosMauri":
// - Nuevo (5 cols): A concepto | B monto | C tipo | D medio | E timestamp(ISO)
// - Viejo (4 cols): A concepto | B tipo  | C monto | D timestamp
// (Si ya tenés otra estructura, decime y lo adapto rápido.)
async function apiPost_(payload) {
  const mode = (payload?.mode || "").toString().toLowerCase();
  const token = (payload?.access_token || "").toString();
  if (!token) return { ok: false, error: "auth_required" };

  const sheetEsc = encodeURIComponent(SHEET_NAME);

  // Helpers locales
  const norm = (v) => (v ?? "").toString().trim();
  const normLower = (v) => norm(v).toLowerCase();
  const isTipo = (v) => ["ingreso", "gasto", "mov"].includes(normLower(v));

  // Número con coma/punto (por si Sheets devuelve "12.000" o "12000")
  const parseNum = (v) => {
    const s = norm(v);
    if (!s) return 0;
    // elimina separadores de miles comunes y normaliza coma decimal
    const cleaned = s
      .replace(/\s/g, "")
      .replace(/\./g, "")     // miles con punto
      .replace(/,/g, ".");    // decimal con coma
    const n = Number(cleaned);
    return isFinite(n) ? n : 0;
  };

  try {
    // ---------- WHOAMI ----------
    if (mode === "whoami") {
      const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) return { ok: false, error: "whoami_failed" };
      const data = await r.json();
      return { ok: true, email: (data?.email || "").toString().toLowerCase().trim() };
    }

    // ---------- GET (listar movimientos) ----------
    if (mode === "get") {
      // Leemos A2:E (hasta 5 columnas)
      const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}` +
        `/values/${sheetEsc}!A2:E?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`;

      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const txt = await r.text();
      if (!r.ok) return { ok: false, error: "get_failed", detail: txt.slice(0, 800) };

      const json = JSON.parse(txt);
      const values = Array.isArray(json?.values) ? json.values : [];

      const movimientos = values
        .filter(row => norm(row?.[0]) !== "") // requiere concepto
        .map(row => {
          const A = norm(row?.[0]); // concepto
          const B = norm(row?.[1]); // puede ser tipo o monto
          const C = norm(row?.[2]); // puede ser monto o tipo
          const D = norm(row?.[3]); // medio o timestamp (formato viejo)
          const E = norm(row?.[4]); // timestamp (formatos de 5 cols)

          const bIsTipo = isTipo(B);
          const cIsTipo = isTipo(C);

          const bNum = parseNum(B);
          const cNum = parseNum(C);

          const bIsNum = norm(B) !== "" && isFinite(bNum) && bNum !== 0; // si es 0 también puede ser válido, pero acá nos ayuda la detección
          const cIsNum = norm(C) !== "" && isFinite(cNum); // monto puede ser 0, pero ok

          // 🔎 Detectamos 3 formatos:
          // FMT1 (tu front anterior "nuevo"):
          //   A concepto | B monto | C tipo | D medio | E timestamp
          // FMT2 (tu sheet real por la captura):
          //   A concepto | B tipo  | C monto | D medio | E timestamp
          // FMT3 (viejo 4 columnas):
          //   A concepto | B tipo  | C monto | D timestamp

          // FMT2: B es tipo y C es número (monto)
          if (bIsTipo && cIsNum) {
            return {
              concepto: A,
              tipo: normLower(B),
              monto: cNum,
              medio: normLower(D),
              timestamp: E || ""
            };
          }

          // FMT1: B es número (monto) y C es tipo
          if ((bIsNum || (norm(B) !== "" && isFinite(parseNum(B)))) && cIsTipo) {
            return {
              concepto: A,
              tipo: normLower(C),
              monto: parseNum(B),
              medio: normLower(D),
              timestamp: E || ""
            };
          }

          // FMT3 (viejo): A concepto | B tipo | C monto | D timestamp
          if (bIsTipo) {
            const tipoViejo = normLower(B);
            const montoViejo = cNum;

            // medio no existía, inferimos defaults razonables
            const medioInferido =
              tipoViejo === "ingreso" ? "transferencia" :
              tipoViejo === "gasto" ? "tarjeta" :
              // mov (viejo): no sabemos si fue retiro o deposito, lo dejamos como "retiro"
              "retiro";

            return {
              concepto: A,
              tipo: tipoViejo,
              monto: montoViejo,
              medio: medioInferido,
              timestamp: D || ""
            };
          }

          // Si no matchea nada, devolvemos algo “seguro” para no romper
          return {
            concepto: A,
            tipo: normLower(C) || normLower(B) || "",
            monto: cIsNum ? cNum : parseNum(B),
            medio: normLower(D) || "",
            timestamp: E || ""
          };
        });

      // opcional: devolver email (como venías haciendo)
      let email = "";
      try {
        const who = await apiPost_({ mode: "whoami", access_token: token });
        if (who?.ok && who?.email) email = who.email;
      } catch {}

      return { ok: true, email, movimientos };
    }

    // ---------- ADD (agregar movimiento) ----------
    if (mode === "add") {
      const concepto = norm(payload?.concepto);
      const monto = Number(payload?.monto);
      const tipo = normLower(payload?.tipo);
      const medio = normLower(payload?.medio);

      if (!concepto || !tipo || !medio || !isFinite(monto) || monto <= 0) {
        return { ok: false, error: "invalid_data" };
      }

      // ✅ Escribimos en el formato REAL de tu sheet (captura):
      // A concepto | B tipo | C monto | D medio | E timestamp
      const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}` +
        `/values/${sheetEsc}!A:E:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

      const body = {
        values: [[concepto, tipo, String(monto), medio, new Date().toISOString()]]
      };

      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const txt = await r.text();
      if (!r.ok) return { ok: false, error: "add_failed", detail: txt.slice(0, 800) };

      return { ok: true };
    }

    // ---------- PING (opcional) ----------
    if (mode === "ping") return { ok: true, pong: true };

    return { ok: false, error: "bad_mode" };
  } catch (e) {
    return { ok: false, error: "network_error", detail: String(e?.message || e) };
  }
}

async function apiCall(mode, payload = {}, opts = {}) {
  const allowInteractive = !!opts.allowInteractive;

  let token = await ensureOAuthToken(allowInteractive, opts.interactivePrompt || "consent");

  const body = { mode, access_token: token, ...(payload || {}) };

  let data = await apiPost_(body);

  // retry si auth/scope
  if (!data?.ok && (data?.error === "missing_scope" || data?.error === "auth_required" || data?.error === "whoami_failed")) {
    token = await ensureOAuthToken(true, "consent");
    body.access_token = token;
    data = await apiPost_(body);
  }

  if (!data?.ok) {
    console.error("[apiCall] mode:", mode, "payload:", payload, "resp:", data);
  }

  return data || { ok: false, error: "empty_response" };
}

async function verifyBackendAccessOrThrow(allowInteractive) {
  const data = await apiCall("whoami", {}, { allowInteractive });
  if (!data?.ok) throw new Error((data?.error || "no_access") + (data?.detail ? ` | ${data.detail}` : ""));
  return data;
}


const TIPO_INGRESO = "ingreso";
const TIPO_GASTO = "gasto";
const TIPO_MOV = "mov"; // mover plata entre tarjeta/efectivo

// Medios (según tipo)
// ingreso: efectivo | transferencia
// gasto: efectivo | tarjeta
// mov: retiro | deposito
const MEDIO_EFECTIVO = "efectivo";
const MEDIO_TRANSFERENCIA = "transferencia";
const MEDIO_TARJETA = "tarjeta";
const MEDIO_RETIRO = "retiro";     // tarjeta -> efectivo
const MEDIO_DEPOSITO = "deposito"; // efectivo -> tarjeta

// Formato moneda
const formatMoneda = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

// Nombres de meses
const MESES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

// ================== FECHAS (Sheets -> Date robusto) ==================
// Soporta:
// - ISO: 2026-02-02T12:34:56.000Z
// - Sheets/Locale: 02/02/2026 09:10:00 (dd/mm/yyyy) o 2/2/2026
function parseTimestampToDate(ts) {
  if (ts === null || ts === undefined) return null;

  // 0) Si Sheets devuelve número (serial date) o string numérica
  if (typeof ts === "number" || (/^\d+(\.\d+)?$/.test(String(ts).trim()))) {
    const n = Number(ts);
    // Heurística: serial de Sheets suele ser > 20000
    if (isFinite(n) && n > 20000) {
      // Google Sheets serial date: días desde 1899-12-30
      const ms = Math.round((n - 25569) * 86400 * 1000); // 25569 = 1970-01-01
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  const s = String(ts).trim();
  if (!s) return null;

  // 1) Si tiene "/" asumimos primero dd/mm/yyyy (o dd/mm/yy)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const a = Number(m[1]); // dd (primero)
    const b = Number(m[2]); // mm (segundo)
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    const hh = Number(m[4] || 0);
    const mi = Number(m[5] || 0);
    const ss = Number(m[6] || 0);

    // Interpretación preferida: dd/mm
    let d = new Date(yy, b - 1, a, hh, mi, ss);

    // 1b) Heurística anti “se fue al futuro”: si quedó MUY en futuro, probá mm/dd
    const now = Date.now();
    const tooFuture = d.getTime() > now + 1000 * 60 * 60 * 24 * 35; // >35 días
    if (tooFuture) {
      const dAlt = new Date(yy, a - 1, b, hh, mi, ss); // mm/dd
      if (!isNaN(dAlt.getTime())) d = dAlt;
    }

    return isNaN(d.getTime()) ? null : d;
  }

  // 2) ISO y otros parseables (acá sí usamos Date nativo)
  const d1 = new Date(s);
  if (!isNaN(d1.getTime())) return d1;

  return null;
}

// ================== HEADER ==================
const header = document.querySelector("header");

const seccionTitulo = document.createElement("section");
seccionTitulo.classList = "titulo";
header.appendChild(seccionTitulo);

// fila 1: título
const headerRow1 = document.createElement("div");
headerRow1.className = "header-row header-row-1";
seccionTitulo.appendChild(headerRow1);

const h1 = document.createElement("h1");
h1.innerText = "Gastos Mauri";
headerRow1.appendChild(h1);

// fila 2: pill sync + acciones + cuenta
const headerRow2 = document.createElement("div");
headerRow2.className = "header-row header-row-2";
seccionTitulo.appendChild(headerRow2);

// --- wrappers tipo "Notas para siempre" (solo estructura) ---
const authBar = document.createElement("div");
authBar.className = "auth-bar";
headerRow2.appendChild(authBar);

const authLeft = document.createElement("div");
authLeft.className = "auth-left";
authBar.appendChild(authLeft);

// Sync pill (va a la izquierda)
const syncPill = document.createElement("div");
syncPill.className = "sync-pill";
syncPill.innerHTML = `<span class="sync-dot"></span><span class="sync-text">Cargando…</span>`;
authLeft.appendChild(syncPill);

// Acciones (van abajo en mobile, a la derecha/abajo según CSS)
const headerActions = document.createElement("div");
headerActions.className = "header-actions";
authBar.appendChild(headerActions);

const btnConnect = document.createElement("button");
btnConnect.className = "btn-connect";
btnConnect.type = "button";
btnConnect.textContent = "Conectar";
btnConnect.dataset.mode = "connect"; // connect | switch
headerActions.appendChild(btnConnect);

const btnRefresh = document.createElement("button");
btnRefresh.className = "btn-refresh";
btnRefresh.type = "button";
btnRefresh.textContent = "↻";
btnRefresh.title = "Reintentar conexión";
btnRefresh.style.display = "none";
headerActions.appendChild(btnRefresh);

const accountPill = document.createElement("div");
accountPill.className = "account-pill";
accountPill.style.display = "none";
authLeft.appendChild(accountPill);

function setSync(state, text) {
  syncPill.classList.remove("ok", "saving", "offline");
  if (state) syncPill.classList.add(state);
  syncPill.querySelector(".sync-text").textContent = text;
}

function setAccountUI(email) {
  const e = (email || "").toString().trim().toLowerCase();

  if (!e) {
    accountPill.style.display = "none";
    accountPill.textContent = "";
    btnConnect.textContent = "Conectar";
    btnConnect.dataset.mode = "connect";
    return;
  }

  accountPill.style.display = "inline-flex";
  accountPill.textContent = e;
  btnConnect.textContent = "Cambiar cuenta";
  btnConnect.dataset.mode = "switch";
}

// ================== MAIN ==================
const main = document.querySelector("main");

// ------- Sección RESUMEN --------
const seccionResumen = document.createElement("section");
seccionResumen.classList = "resumen";
main.appendChild(seccionResumen);

const tituloResumen = document.createElement("h2");
tituloResumen.innerText = "Resumen general";
seccionResumen.appendChild(tituloResumen);

const filaResumen = document.createElement("div");
filaResumen.classList = "resumen-fila";
seccionResumen.appendChild(filaResumen);

// Card: Tarjeta
const cardTarjeta = document.createElement("div");
cardTarjeta.classList = "resumen-card resumen-tarjeta";
filaResumen.appendChild(cardTarjeta);

const pTarLabel = document.createElement("p");
pTarLabel.innerText = "Plata en tarjeta";
cardTarjeta.appendChild(pTarLabel);

const pTarValor = document.createElement("p");
pTarValor.id = "tarjeta";
pTarValor.classList = "resumen-valor";
pTarValor.innerText = "$0";
cardTarjeta.appendChild(pTarValor);

// Card: Efectivo
const cardEfectivo = document.createElement("div");
cardEfectivo.classList = "resumen-card resumen-efectivo";
filaResumen.appendChild(cardEfectivo);

const pEfeLabel = document.createElement("p");
pEfeLabel.innerText = "Plata en efectivo";
cardEfectivo.appendChild(pEfeLabel);

const pEfeValor = document.createElement("p");
pEfeValor.id = "efectivo";
pEfeValor.classList = "resumen-valor";
pEfeValor.innerText = "$0";
cardEfectivo.appendChild(pEfeValor);

// Card: Total
const cardTotal = document.createElement("div");
cardTotal.classList = "resumen-card resumen-total";
filaResumen.appendChild(cardTotal);

const pTotalLabel = document.createElement("p");
pTotalLabel.innerText = "Total";
cardTotal.appendChild(pTotalLabel);

const pTotalValor = document.createElement("p");
pTotalValor.id = "total";
pTotalValor.classList = "resumen-valor";
pTotalValor.innerText = "$0";
cardTotal.appendChild(pTotalValor);

// ------- Sección AGREGAR MOVIMIENTO (ingreso/gasto) -------
const seccionAgregar = document.createElement("section");
seccionAgregar.classList = "agregarMovimiento";
main.appendChild(seccionAgregar);

const tituloAgregar = document.createElement("h2");
tituloAgregar.classList = "bloque-titulo";
tituloAgregar.innerText = "Agregar ingreso / gasto";
seccionAgregar.appendChild(tituloAgregar);

// Concepto
const labelConcepto = document.createElement("label");
labelConcepto.innerText = "Concepto:";
labelConcepto.htmlFor = "input-concepto";
seccionAgregar.appendChild(labelConcepto);

const inputConcepto = document.createElement("input");
inputConcepto.type = "text";
inputConcepto.id = "input-concepto";
inputConcepto.placeholder = "Ej: Alquiler, sueldo, luz, etc.";
seccionAgregar.appendChild(inputConcepto);

// Monto
const labelMonto = document.createElement("label");
labelMonto.innerText = "Monto:";
labelMonto.htmlFor = "input-monto";
seccionAgregar.appendChild(labelMonto);

const inputMonto = document.createElement("input");
inputMonto.type = "number";
inputMonto.id = "input-monto";
inputMonto.placeholder = "Ej: 15000";
inputMonto.step = "0.01";
seccionAgregar.appendChild(inputMonto);

// Tipo
const labelTipo = document.createElement("label");
labelTipo.innerText = "Tipo:";
labelTipo.htmlFor = "select-tipo";
seccionAgregar.appendChild(labelTipo);

const selectTipo = document.createElement("select");
selectTipo.id = "select-tipo";

const optIngreso = document.createElement("option");
optIngreso.value = TIPO_INGRESO;
optIngreso.innerText = "Ingreso";
selectTipo.appendChild(optIngreso);

const optGasto = document.createElement("option");
optGasto.value = TIPO_GASTO;
optGasto.innerText = "Gasto";
selectTipo.appendChild(optGasto);

seccionAgregar.appendChild(selectTipo);

// Medio (dinámico según tipo)
const labelMedio = document.createElement("label");
labelMedio.innerText = "Medio:";
labelMedio.htmlFor = "select-medio";
seccionAgregar.appendChild(labelMedio);

const selectMedio = document.createElement("select");
selectMedio.id = "select-medio";
seccionAgregar.appendChild(selectMedio);

// Botón Agregar
const buttonAgregar = document.createElement("button");
buttonAgregar.innerText = "Agregar movimiento";
seccionAgregar.appendChild(buttonAgregar);

// ------- Sección MOVER PLATA (aparte) -------
const seccionMover = document.createElement("section");
seccionMover.classList = "moverPlata";
main.appendChild(seccionMover);

const tituloMover = document.createElement("h2");
tituloMover.classList = "bloque-titulo";
tituloMover.innerText = "Mover plata";
seccionMover.appendChild(tituloMover);

const pMover = document.createElement("p");
pMover.classList = "mover-ayuda";
pMover.innerText = "Usá esto cuando pasás plata entre tarjeta y efectivo (no es ingreso ni gasto).";
seccionMover.appendChild(pMover);

const labelMoverMonto = document.createElement("label");
labelMoverMonto.innerText = "Monto:";
labelMoverMonto.htmlFor = "input-mover-monto";
seccionMover.appendChild(labelMoverMonto);

const inputMoverMonto = document.createElement("input");
inputMoverMonto.type = "number";
inputMoverMonto.id = "input-mover-monto";
inputMoverMonto.placeholder = "Ej: 50000";
inputMoverMonto.step = "0.01";
seccionMover.appendChild(inputMoverMonto);

const filaMoverBtns = document.createElement("div");
filaMoverBtns.classList = "mover-botones";
seccionMover.appendChild(filaMoverBtns);

const btnRetirar = document.createElement("button");
btnRetirar.classList = "btn-retiro";
btnRetirar.innerText = "Retirar (Tarjeta → Efectivo)";
filaMoverBtns.appendChild(btnRetirar);

const btnDepositar = document.createElement("button");
btnDepositar.classList = "btn-deposito";
btnDepositar.innerText = "Depositar (Efectivo → Tarjeta)";
filaMoverBtns.appendChild(btnDepositar);

// ------- Sección listas por mes -------
const seccionListas = document.createElement("section");
seccionListas.classList = "listas-meses";
main.appendChild(seccionListas);

// ================== FUNCIONES ==================
function setOpcionesMedio() {
  const tipo = (selectTipo.value || "").toLowerCase();
  selectMedio.innerHTML = "";

  if (tipo === TIPO_INGRESO) {
    const o1 = document.createElement("option");
    o1.value = MEDIO_EFECTIVO;
    o1.innerText = "Efectivo";
    selectMedio.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = MEDIO_TRANSFERENCIA;
    o2.innerText = "Transferencia";
    selectMedio.appendChild(o2);

    selectMedio.value = MEDIO_TRANSFERENCIA; // default cómodo
  } else {
    // gasto
    const o1 = document.createElement("option");
    o1.value = MEDIO_EFECTIVO;
    o1.innerText = "Efectivo";
    selectMedio.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = MEDIO_TARJETA;
    o2.innerText = "Tarjeta";
    selectMedio.appendChild(o2);

    selectMedio.value = MEDIO_TARJETA; // default cómodo
  }
}

function actualizarResumen(saldoTarjeta, saldoEfectivo) {
  const total = (Number(saldoTarjeta) || 0) + (Number(saldoEfectivo) || 0);
  pTarValor.innerText = formatMoneda.format(Number(saldoTarjeta) || 0);
  pEfeValor.innerText = formatMoneda.format(Number(saldoEfectivo) || 0);
  pTotalValor.innerText = formatMoneda.format(total);
}

function medioLabel(tipo, medio) {
  tipo = (tipo || "").toLowerCase();
  medio = (medio || "").toLowerCase();

  if (tipo === TIPO_INGRESO) {
    if (medio === MEDIO_EFECTIVO) return "Efectivo";
    return "Transferencia";
  }
  if (tipo === TIPO_GASTO) {
    if (medio === MEDIO_EFECTIVO) return "Efectivo";
    return "Tarjeta";
  }
  if (tipo === TIPO_MOV) {
    if (medio === MEDIO_RETIRO) return "Tarjeta → Efectivo";
    return "Efectivo → Tarjeta";
  }
  return medio || "";
}

function aplicarASaldos(mov, saldos) {
  const tipo = (mov.tipo || "").toLowerCase();
  const medio = (mov.medio || "").toLowerCase();
  const monto = Number(mov.monto) || 0;

  if (monto === 0) return;

  // ingreso
  if (tipo === TIPO_INGRESO) {
    if (medio === MEDIO_EFECTIVO) saldos.efectivo += monto;
    else saldos.tarjeta += monto; // transferencia -> tarjeta
    return;
  }

  // gasto
  if (tipo === TIPO_GASTO) {
    if (medio === MEDIO_EFECTIVO) saldos.efectivo -= monto;
    else saldos.tarjeta -= monto; // tarjeta
    return;
  }

  // mover
  if (tipo === TIPO_MOV) {
    if (medio === MEDIO_RETIRO) {
      saldos.tarjeta -= monto;
      saldos.efectivo += monto;
    } else if (medio === MEDIO_DEPOSITO) {
      saldos.efectivo -= monto;
      saldos.tarjeta += monto;
    }
  }
}

// Render de los grupos por mes
function renderMeses(gruposOrdenados) {
  seccionListas.innerHTML = "";

  gruposOrdenados.forEach((grupo) => {
    const { year, monthIndex, movimientos, totalIngresos, totalGastos } = grupo;

    const contMes = document.createElement("section");
    contMes.classList = "grupo-mes";
    seccionListas.appendChild(contMes);

    const tituloMes = document.createElement("h2");
    tituloMes.innerText = `${MESES_ES[monthIndex]} ${year}`;
    contMes.appendChild(tituloMes);

    const subResumen = document.createElement("p");
    const saldoMes = totalIngresos - totalGastos;
    subResumen.classList = "grupo-mes-resumen";
    subResumen.innerText =
      `Ingresos: ${formatMoneda.format(totalIngresos)} · ` +
      `Gastos: ${formatMoneda.format(totalGastos)} · ` +
      `Saldo del mes: ${formatMoneda.format(saldoMes)} ` +
      `(sin contar movimientos de caja)`;
    contMes.appendChild(subResumen);

    const listaMov = document.createElement("div");
    listaMov.classList = "lista-movimientos";
    contMes.appendChild(listaMov);

    movimientos.forEach((mov) => {
      const tipo = (mov.tipo || "").toLowerCase();
      const medio = (mov.medio || "").toLowerCase();
      const m = Number(mov.monto) || 0;

      const card = document.createElement("article");
      card.classList.add("mov-card");
      if (tipo === TIPO_MOV) card.classList.add("mov-caja");

      const fila1 = document.createElement("div");
      fila1.classList = "mov-fila-1";
      card.appendChild(fila1);

      const concepto = document.createElement("h3");
      concepto.innerText = mov.concepto || "(sin concepto)";
      fila1.appendChild(concepto);

      const montoEl = document.createElement("p");
      montoEl.classList = "mov-monto";

      if (tipo === TIPO_INGRESO) {
        montoEl.innerText = `+ ${formatMoneda.format(m)}`;
        montoEl.dataset.tipo = "ingreso";
      } else if (tipo === TIPO_GASTO) {
        montoEl.innerText = `- ${formatMoneda.format(m)}`;
        montoEl.dataset.tipo = "gasto";
      } else {
        montoEl.innerText = `⇄ ${formatMoneda.format(m)}`;
        montoEl.dataset.tipo = "caja";
      }
      fila1.appendChild(montoEl);

      const fila2 = document.createElement("div");
      fila2.classList = "mov-fila-2";
      card.appendChild(fila2);

      if (mov.timestamp) {
        const fecha = parseTimestampToDate(mov.timestamp);
        if (fecha) {
          const pFecha = document.createElement("span");
          pFecha.classList = "mov-fecha";
          pFecha.innerText = fecha.toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          });
          fila2.appendChild(pFecha);
        }
      }

      const extra = document.createElement("span");
      extra.classList = "mov-extra";
      extra.innerText = medioLabel(tipo, medio);
      fila2.appendChild(extra);

      const pill = document.createElement("span");
      pill.classList = "mov-tipo";

      if (tipo === TIPO_INGRESO) {
        pill.innerText = "Ingreso";
        pill.dataset.tipo = "ingreso";
      } else if (tipo === TIPO_GASTO) {
        pill.innerText = "Gasto";
        pill.dataset.tipo = "gasto";
      } else {
        pill.innerText = "Caja";
        pill.dataset.tipo = "caja";
      }

      fila2.appendChild(pill);
      listaMov.appendChild(card);
    });
  });
}

async function cargarMovimientosDesdeAPI({ allowInteractive = false } = {}) {
  if (!isOnline()) {
    setSync("offline", "Sin conexión");
    return;
  }

  try {
    setSync("saving", "Cargando…");

    // 🔑 OJO: mode = "get" (no "list")
    const resp = await apiCall("get", {}, { allowInteractive });

    if (!resp?.ok) {
      if (resp?.error === "auth_required") {
        setSync("offline", "Necesita Conectar");
        btnRefresh.style.display = "inline-block";
        return;
      }
      throw new Error(resp?.error || "get_failed");
    }

    // 🔐 guardar email como hint
    if (resp.email) {
      saveStoredOAuthEmail(resp.email);
      setAccountUI(resp.email);
    }

    const movimientos = Array.isArray(resp.movimientos) ? resp.movimientos : [];

    const saldos = { tarjeta: 0, efectivo: 0 };

    const grupos = {};
    movimientos.forEach((mov) => {
      aplicarASaldos(mov, saldos);

      if (!mov.timestamp) return;

      const fecha = parseTimestampToDate(mov.timestamp);
      if (!fecha) return;

      const year = fecha.getFullYear();
      const monthIndex = fecha.getMonth();
      const key = `${year}-${monthIndex}`;

      if (!grupos[key]) {
        grupos[key] = {
          year,
          monthIndex,
          movimientos: [],
          totalIngresos: 0,
          totalGastos: 0,
        };
      }

      grupos[key].movimientos.push(mov);

      if (mov.tipo === "ingreso") grupos[key].totalIngresos += Number(mov.monto) || 0;
      if (mov.tipo === "gasto") grupos[key].totalGastos += Number(mov.monto) || 0;
    });

    const gruposOrdenados = Object.values(grupos).sort((a, b) => {
      const ka = a.year * 12 + a.monthIndex;
      const kb = b.year * 12 + b.monthIndex;
      return kb - ka; // DESC: primero meses más nuevos
    });

    actualizarResumen(saldos.tarjeta, saldos.efectivo);
    renderMeses(gruposOrdenados);

    setSync("ok", "Listo ✅");
    btnRefresh.style.display = "none";
  } catch (err) {
    console.error(err);
    setSync("offline", "No se pudo cargar");
    btnRefresh.style.display = "inline-block";
  }
}

async function agregarMovimientoAPI(concepto, monto, tipo, medio) {
  const conceptoLimpio = (concepto || "").trim();
  const tipoLimpio = (tipo || "").trim().toLowerCase();
  const medioLimpio = (medio || "").trim().toLowerCase();
  const montoNum = Number(monto);

  if (!conceptoLimpio || !tipoLimpio || isNaN(montoNum) || montoNum <= 0) return;

  if (tipoLimpio === TIPO_INGRESO) {
    if (![MEDIO_EFECTIVO, MEDIO_TRANSFERENCIA].includes(medioLimpio)) return;
  } else if (tipoLimpio === TIPO_GASTO) {
    if (![MEDIO_EFECTIVO, MEDIO_TARJETA].includes(medioLimpio)) return;
  } else {
    return;
  }

  try {
    setSync("saving", "Guardando…");

    const resp = await apiCall("add", {
      concepto: conceptoLimpio,
      monto: montoNum,
      tipo: tipoLimpio,
      medio: medioLimpio
    }, { allowInteractive: false });

    if (!resp?.ok) {
      if (String(resp?.error || "") === "auth_required") {
        setSync("offline", "Necesita Conectar");
        btnRefresh.style.display = "inline-block";
        return;
      }
      throw new Error(resp?.error || "add_failed");
    }

    // refrescar
    await cargarMovimientosDesdeAPI({ allowInteractive: false });
  } catch (err) {
    console.error("Error al agregar movimiento", err);
    setSync("offline", "No se pudo guardar");
    btnRefresh.style.display = "inline-block";
  }
}

// Mover plata (caja)
async function moverPlataAPI(monto, modoCaja) {
  const montoNum = Number(monto);
  const medio = (modoCaja || "").toLowerCase();

  if (isNaN(montoNum) || montoNum <= 0) return;
  if (![MEDIO_RETIRO, MEDIO_DEPOSITO].includes(medio)) return;

  const concepto = medio === MEDIO_RETIRO ? "Retiro" : "Depósito";

  try {
    setSync("saving", "Guardando…");

    const resp = await apiCall("add", {
      concepto,
      monto: montoNum,
      tipo: TIPO_MOV,
      medio
    }, { allowInteractive: false });

    if (!resp?.ok) {
      if (String(resp?.error || "") === "auth_required") {
        setSync("offline", "Necesita Conectar");
        btnRefresh.style.display = "inline-block";
        return;
      }
      throw new Error(resp?.error || "add_failed");
    }

    await cargarMovimientosDesdeAPI({ allowInteractive: false });
  } catch (err) {
    console.error("Error al mover plata", err);
    setSync("offline", "No se pudo guardar");
    btnRefresh.style.display = "inline-block";
  }
}

// ================== EVENTOS ==================
selectTipo.addEventListener("change", () => {
  setOpcionesMedio();
});

buttonAgregar.addEventListener("click", () => {
  agregarMovimientoAPI(inputConcepto.value, inputMonto.value, selectTipo.value, selectMedio.value);

  inputConcepto.value = "";
  inputMonto.value = "";
  selectTipo.value = TIPO_GASTO;
  setOpcionesMedio();
  inputConcepto.focus();
});

btnRetirar.addEventListener("click", () => {
  moverPlataAPI(inputMoverMonto.value, MEDIO_RETIRO);
  inputMoverMonto.value = "";
});

btnDepositar.addEventListener("click", () => {
  moverPlataAPI(inputMoverMonto.value, MEDIO_DEPOSITO);
  inputMoverMonto.value = "";
});

// ENTERs cómodos
inputConcepto.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    inputMonto.focus();
  }
});

inputMonto.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    buttonAgregar.click();
  }
});

inputMoverMonto.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    // por default, Enter hace "Depositar" (podés cambiarlo)
    btnDepositar.click();
  }
});

// =====================
// UI: Conectar / Refresh
// =====================
async function runConnectFlow({ interactive, prompt } = { interactive: false, prompt: "consent" }) {
  if (connectInFlight) return connectInFlight;

  connectInFlight = (async () => {
    try {
      setSync("saving", interactive ? "Conectando…" : "Reconectando…");

      await ensureOAuthToken(!!interactive, prompt || "consent");

      // 🔑 VALIDACIÓN REAL CON BACKEND
      const who = await apiCall("whoami", {}, { allowInteractive: !!interactive });

      // 👇 ACÁ está la clave: si falla, MOSTRAR detail
      if (!who?.ok) {
        const msg =
          (who?.error || "whoami_failed") +
          (who?.detail ? ` | ${String(who.detail).slice(0, 400)}` : "");
        console.error("[whoami_failed] respuesta completa:", who);
        setSync("offline", msg);
        btnRefresh.style.display = "inline-block";
        return { ok: false, error: msg };
      }

      if (who.email) {
        saveStoredOAuthEmail(who.email);
        setAccountUI(who.email);
      }

      btnRefresh.style.display = "none";
      await cargarMovimientosDesdeAPI({ allowInteractive: false });

      return { ok: true };
    } catch (e) {
      console.error("[runConnectFlow catch]", e);
      setSync("offline", `Necesita Conectar | ${String(e?.message || e).slice(0, 300)}`);
      btnRefresh.style.display = "inline-block";
      return { ok: false };
    } finally {
      connectInFlight = null;
    }
  })();

  return connectInFlight;
}

async function reconnectAndRefresh() {
  return await runConnectFlow({ interactive: false, prompt: "" });
}

btnConnect.addEventListener("click", async () => {
  if (isConnectBusy()) return;

  if (btnConnect.dataset.mode === "switch") {
    // backup por si cancela
    const prevStored = loadStoredOAuth();
    const prevEmail = loadStoredOAuthEmail();
    const prevRuntimeToken = oauthAccessToken;
    const prevRuntimeExp = oauthExpiresAt;

    clearStoredOAuth();
    clearStoredOAuthEmail();
    oauthAccessToken = "";
    oauthExpiresAt = 0;

    const res = await runConnectFlow({ interactive: true, prompt: "select_account" });

    if (res?.canceled) {
      if (prevStored?.access_token && prevStored?.expires_at) saveStoredOAuth(prevStored.access_token, prevStored.expires_at);
      if (prevEmail) saveStoredOAuthEmail(prevEmail);
      oauthAccessToken = prevRuntimeToken || "";
      oauthExpiresAt = prevRuntimeExp || 0;

      setAccountUI(prevEmail || "");
      if (isTokenValid()) setSync("ok", "Listo ✅");
      else {
        setSync("offline", "Necesita Conectar");
        btnRefresh.style.display = "inline-block";
      }
      return;
    }

    return;
  }

  const res = await runConnectFlow({ interactive: true, prompt: "consent" });
  if (res?.canceled) return;
});

btnRefresh.addEventListener("click", async () => {
  await reconnectAndRefresh();
});

// auto-refresh token (evita popups)
setInterval(async () => {
  try {
    if (document.visibilityState !== "visible") return;
    if (isConnectBusy()) return;
    if (!oauthAccessToken) return;

    // si falta poco para expirar, intento silencioso
    if (Date.now() < (oauthExpiresAt - 120_000)) return;
    await ensureOAuthToken(false);

    if (isTokenValid() && syncPill.querySelector(".sync-text")?.textContent?.includes("Necesita Conectar")) {
      await reconnectAndRefresh();
    }
  } catch {}
}, 20_000);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (isConnectBusy()) return;

  if (syncPill.querySelector(".sync-text")?.textContent?.includes("Necesita Conectar")) {
    reconnectAndRefresh();
  }
});

// =====================
// INIT
// =====================
window.addEventListener("load", async () => {
  setOpcionesMedio();

  // OAuth init + cargar token guardado
  try {
    initOAuth();

    const stored = loadStoredOAuth();
    if (stored?.access_token && Date.now() < (stored.expires_at - 10_000)) {
      oauthAccessToken = stored.access_token;
      oauthExpiresAt = stored.expires_at;

      const emailHint = loadStoredOAuthEmail();
      setAccountUI(emailHint);
    } else {
      setAccountUI(loadStoredOAuthEmail());
    }
  } catch {
    // si GIS no cargó, se ve al tocar Conectar
  }

  if (!isOnline()) {
    setSync("offline", "Sin conexión");
    btnRefresh.style.display = "none";
    return;
  }

  // Auto-connect silencioso si hay email/token guardado
  const emailHint = loadStoredOAuthEmail();
  const stored = loadStoredOAuth();

  if (emailHint || (stored?.access_token && stored?.expires_at)) {
    await reconnectAndRefresh(); // sin popup
  } else {
    setSync("offline", "Necesita Conectar");
    btnRefresh.style.display = "inline-block";
  }
});

window.addEventListener("online", () => {
  if (syncPill.querySelector(".sync-text")?.textContent?.includes("Necesita Conectar")) return;
  reconnectAndRefresh();
});

window.addEventListener("offline", () => {
  setSync("offline", "Sin conexión");
});
