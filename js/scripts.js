// ================== CONFIG ==================
const API_URL = "https://script.google.com/macros/s/AKfycbxOUyVMSOPHvGRJXobkftG-tMDZUzDjTw795ao2t1xxTBVOEcqphY7GC3bjc1HrVdxJ/exec"; // <--- tu URL

const TIPO_INGRESO = "ingreso";
const TIPO_GASTO   = "gasto";

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

// Estado (para recalcular total)
let AHORROS_ACTUALES = 0;

// ================== HEADER ==================
const header = document.querySelector("header");

const seccionTitulo = document.createElement("section");
seccionTitulo.classList = "titulo";
header.appendChild(seccionTitulo);

const h1 = document.createElement("h1");
h1.innerText = "Gastos Mauri";
seccionTitulo.appendChild(h1);

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

// Card: Plata actual
const cardSaldo = document.createElement("div");
cardSaldo.classList = "resumen-card resumen-saldo";
filaResumen.appendChild(cardSaldo);

const pSaldoLabel = document.createElement("p");
pSaldoLabel.innerText = "Plata actual";
cardSaldo.appendChild(pSaldoLabel);

const pSaldoValor = document.createElement("p");
pSaldoValor.id = "saldo-actual";
pSaldoValor.classList = "resumen-valor";
pSaldoValor.innerText = "$0";
cardSaldo.appendChild(pSaldoValor);

// Card: Ahorros
const cardAhorros = document.createElement("div");
cardAhorros.classList = "resumen-card resumen-ahorros";
filaResumen.appendChild(cardAhorros);

const pAhoLabel = document.createElement("p");
pAhoLabel.innerText = "Ahorros";
cardAhorros.appendChild(pAhoLabel);

const pAhoValor = document.createElement("p");
pAhoValor.id = "ahorros";
pAhoValor.classList = "resumen-valor";
pAhoValor.innerText = "$0";
cardAhorros.appendChild(pAhoValor);

// Card: Total
const cardTotal = document.createElement("div");
cardTotal.classList = "resumen-card resumen-total";
filaResumen.appendChild(cardTotal);

const pTotalLabel = document.createElement("p");
pTotalLabel.innerText = "Total (plata + ahorros)";
cardTotal.appendChild(pTotalLabel);

const pTotalValor = document.createElement("p");
pTotalValor.id = "total";
pTotalValor.classList = "resumen-valor";
pTotalValor.innerText = "$0";
cardTotal.appendChild(pTotalValor);

// ------- Sección AHORROS (nuevo) -------
const seccionAhorros = document.createElement("section");
seccionAhorros.classList = "ahorros";
main.appendChild(seccionAhorros);

const labelAhorros = document.createElement("label");
labelAhorros.innerText = "Ingresar ahorros:";
labelAhorros.htmlFor = "input-ahorros";
seccionAhorros.appendChild(labelAhorros);

const inputAhorros = document.createElement("input");
inputAhorros.type = "number";
inputAhorros.id = "input-ahorros";
inputAhorros.placeholder = "Ej: 250000";
inputAhorros.step = "0.01";
seccionAhorros.appendChild(inputAhorros);

const btnGuardarAhorros = document.createElement("button");
btnGuardarAhorros.innerText = "Guardar ahorros";
seccionAhorros.appendChild(btnGuardarAhorros);

// ------- Sección para agregar movimiento -------
const seccionAgregar = document.createElement("section");
seccionAgregar.classList = "agregarMovimiento";
main.appendChild(seccionAgregar);

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

// Botón
const buttonAgregar = document.createElement("button");
buttonAgregar.innerText = "Agregar movimiento";
seccionAgregar.appendChild(buttonAgregar);

// ------- Sección listas por mes -------
const seccionListas = document.createElement("section");
seccionListas.classList = "listas-meses";
main.appendChild(seccionListas);

// ================== FUNCIONES ==================
function actualizarResumen(totalIng, totalGas, ahorros) {
  const saldo = totalIng - totalGas;
  const total = saldo + (Number(ahorros) || 0);

  pSaldoValor.innerText = formatMoneda.format(saldo);
  pAhoValor.innerText   = formatMoneda.format(Number(ahorros) || 0);
  pTotalValor.innerText = formatMoneda.format(total);
}

// Render de los grupos por mes
function renderMeses(gruposOrdenados) {
  seccionListas.innerHTML = "";

  gruposOrdenados.forEach((grupo, indice) => {
    const { year, monthIndex, movimientos, totalIngresos, totalGastos } = grupo;

    const contMes = document.createElement("section");
    contMes.classList = "grupo-mes";
    contMes.dataset.index = indice;
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
      `Saldo del mes: ${formatMoneda.format(saldoMes)}`;
    contMes.appendChild(subResumen);

    const listaMov = document.createElement("div");
    listaMov.classList = "lista-movimientos";
    contMes.appendChild(listaMov);

    movimientos.forEach((mov) => {
      const card = document.createElement("article");
      card.classList.add("mov-card");

      const fila1 = document.createElement("div");
      fila1.classList = "mov-fila-1";
      card.appendChild(fila1);

      const concepto = document.createElement("h3");
      concepto.innerText = mov.concepto || "(sin concepto)";
      fila1.appendChild(concepto);

      const monto = document.createElement("p");
      monto.classList = "mov-monto";
      const esIngreso = (mov.tipo || "").toLowerCase() === TIPO_INGRESO;
      const signo = esIngreso ? "+" : "-";
      monto.innerText = `${signo} ${formatMoneda.format(mov.monto || 0)}`;
      monto.dataset.tipo = esIngreso ? "ingreso" : "gasto";
      fila1.appendChild(monto);

      const fila2 = document.createElement("div");
      fila2.classList = "mov-fila-2";
      card.appendChild(fila2);

      if (mov.timestamp) {
        const fecha = new Date(mov.timestamp);
        const pFecha = document.createElement("span");
        pFecha.classList = "mov-fecha";
        pFecha.innerText = fecha.toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        });
        fila2.appendChild(pFecha);
      }

      const pillTipo = document.createElement("span");
      pillTipo.classList = "mov-tipo";
      pillTipo.innerText = esIngreso ? "Ingreso" : "Gasto";
      pillTipo.dataset.tipo = esIngreso ? "ingreso" : "gasto";
      fila2.appendChild(pillTipo);

      listaMov.appendChild(card);
    });
  });
}

// ======== AHORROS API ========
async function getAhorrosDesdeAPI() {
  try {
    const resp = await fetch(API_URL + "?modo=getAhorros");
    const data = await resp.json();
    const ah = Number(data.ahorros) || 0;
    AHORROS_ACTUALES = ah;
    inputAhorros.value = ah; // lo muestra en el input
    return ah;
  } catch (err) {
    console.error("Error al obtener ahorros", err);
    AHORROS_ACTUALES = 0;
    return 0;
  }
}

async function setAhorrosEnAPI(nuevoValor) {
  const v = Number(nuevoValor);
  if (isNaN(v)) return;

  const url = API_URL + "?modo=setAhorros&ahorros=" + encodeURIComponent(String(v));
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    AHORROS_ACTUALES = Number(data.ahorros) || v;
    inputAhorros.value = AHORROS_ACTUALES;
  } catch (err) {
    console.error("Error al guardar ahorros", err);
  }
}

// Cargar movimientos desde la API
async function cargarMovimientosDesdeAPI() {
  try {
    // 1) traer ahorros primero
    const ahorros = await getAhorrosDesdeAPI();

    // 2) traer movimientos
    const resp = await fetch(API_URL); // modo list
    const movimientos = await resp.json();

    let totalIngresos = 0;
    let totalGastos = 0;

    // Agrupar por mes
    const grupos = {}; // key: "YYYY-MM"

    movimientos.forEach((mov) => {
      const tipo = (mov.tipo || "").toLowerCase();
      const monto = Number(mov.monto) || 0;

      if (tipo === TIPO_INGRESO) totalIngresos += monto;
      else if (tipo === TIPO_GASTO) totalGastos += monto;

      const fecha = mov.timestamp ? new Date(mov.timestamp) : null;
      if (!fecha) return;

      const year = fecha.getFullYear();
      const monthIndex = fecha.getMonth(); // 0-11
      const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

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
      if (tipo === TIPO_INGRESO) grupos[key].totalIngresos += monto;
      else if (tipo === TIPO_GASTO) grupos[key].totalGastos += monto;
    });

    // Ordenar meses por fecha (más nuevo primero)
    const gruposOrdenados = Object.values(grupos).sort((a, b) => {
      const aKey = a.year * 100 + a.monthIndex;
      const bKey = b.year * 100 + b.monthIndex;
      return bKey - aKey;
    });

    // Actualizar resumen general (solo plata actual + ahorros + total)
    actualizarResumen(totalIngresos, totalGastos, ahorros);

    // Render de las listas por mes
    renderMeses(gruposOrdenados);

  } catch (err) {
    console.error("Error al cargar movimientos", err);
  }
}

// Agregar nuevo movimiento
async function agregarMovimientoAPI(concepto, monto, tipo) {
  const conceptoLimpio = (concepto || "").trim();
  const montoLimpio = (monto || "").toString().trim();
  const tipoLimpio = (tipo || "").trim();

  if (!conceptoLimpio || !montoLimpio || !tipoLimpio) return;

  const url =
    API_URL +
    "?modo=add" +
    "&concepto=" + encodeURIComponent(conceptoLimpio) +
    "&monto=" + encodeURIComponent(montoLimpio) +
    "&tipo=" + encodeURIComponent(tipoLimpio);

  try {
    await fetch(url);
    await cargarMovimientosDesdeAPI();
  } catch (err) {
    console.error("Error al agregar movimiento", err);
  }
}

// ================== EVENTOS ==================
buttonAgregar.addEventListener("click", () => {
  agregarMovimientoAPI(inputConcepto.value, inputMonto.value, selectTipo.value);
  inputConcepto.value = "";
  inputMonto.value = "";
  selectTipo.value = TIPO_GASTO;
  inputConcepto.focus();
});

btnGuardarAhorros.addEventListener("click", async () => {
  await setAhorrosEnAPI(inputAhorros.value);
  // recalcula el resumen sin depender del orden (vuelve a cargar todo)
  await cargarMovimientosDesdeAPI();
});

inputAhorros.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    btnGuardarAhorros.click();
  }
});

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

// Cargar al iniciar
window.addEventListener("load", cargarMovimientosDesdeAPI);
