// ================== CONFIG ==================
const API_URL =
  "https://script.google.com/macros/s/AKfycbxOUyVMSOPHvGRJXobkftG-tMDZUzDjTw795ao2t1xxTBVOEcqphY7GC3bjc1HrVdxJ/exec";

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

// Cargar movimientos desde la API
async function cargarMovimientosDesdeAPI() {
  try {
    const resp = await fetch(API_URL); // modo list
    const movimientos = await resp.json();

    const saldos = { tarjeta: 0, efectivo: 0 };

    // Agrupar por mes
    const grupos = {}; // key: "YYYY-MM"

    movimientos.forEach((mov) => {
      aplicarASaldos(mov, saldos);

      const fecha = mov.timestamp ? new Date(mov.timestamp) : null;
      if (!fecha) return;

      const year = fecha.getFullYear();
      const monthIndex = fecha.getMonth();
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

      // Totales del mes (sin caja)
      const tipo = (mov.tipo || "").toLowerCase();
      const monto = Number(mov.monto) || 0;
      if (tipo === TIPO_INGRESO) grupos[key].totalIngresos += monto;
      else if (tipo === TIPO_GASTO) grupos[key].totalGastos += monto;
    });

    const gruposOrdenados = Object.values(grupos).sort((a, b) => {
      const aKey = a.year * 100 + a.monthIndex;
      const bKey = b.year * 100 + b.monthIndex;
      return bKey - aKey;
    });

    actualizarResumen(saldos.tarjeta, saldos.efectivo);
    renderMeses(gruposOrdenados);
  } catch (err) {
    console.error("Error al cargar movimientos", err);
  }
}

// Agregar ingreso/gasto
async function agregarMovimientoAPI(concepto, monto, tipo, medio) {
  const conceptoLimpio = (concepto || "").trim();
  const tipoLimpio = (tipo || "").trim().toLowerCase();
  const medioLimpio = (medio || "").trim().toLowerCase();
  const montoNum = Number(monto);

  if (!conceptoLimpio || !tipoLimpio || isNaN(montoNum) || montoNum <= 0) return;

  // Validar medios permitidos
  if (tipoLimpio === TIPO_INGRESO) {
    if (![MEDIO_EFECTIVO, MEDIO_TRANSFERENCIA].includes(medioLimpio)) return;
  } else if (tipoLimpio === TIPO_GASTO) {
    if (![MEDIO_EFECTIVO, MEDIO_TARJETA].includes(medioLimpio)) return;
  } else {
    return;
  }

  const params = new URLSearchParams();
  params.set("modo", "add");
  params.set("concepto", conceptoLimpio);
  params.set("monto", String(montoNum));
  params.set("tipo", tipoLimpio);
  params.set("medio", medioLimpio);

  const url = API_URL + "?" + params.toString();

  try {
    await fetch(url);
    await cargarMovimientosDesdeAPI();
  } catch (err) {
    console.error("Error al agregar movimiento", err);
  }
}

// Mover plata (caja)
async function moverPlataAPI(monto, modoCaja) {
  const montoNum = Number(monto);
  const medio = (modoCaja || "").toLowerCase();

  if (isNaN(montoNum) || montoNum <= 0) return;
  if (![MEDIO_RETIRO, MEDIO_DEPOSITO].includes(medio)) return;

  const concepto = medio === MEDIO_RETIRO ? "Retiro" : "Depósito";

  const params = new URLSearchParams();
  params.set("modo", "add");
  params.set("concepto", concepto);
  params.set("monto", String(montoNum));
  params.set("tipo", TIPO_MOV);
  params.set("medio", medio);

  const url = API_URL + "?" + params.toString();

  try {
    await fetch(url);
    await cargarMovimientosDesdeAPI();
  } catch (err) {
    console.error("Error al mover plata", err);
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

// Cargar al iniciar
window.addEventListener("load", () => {
  setOpcionesMedio();
  cargarMovimientosDesdeAPI();
});
