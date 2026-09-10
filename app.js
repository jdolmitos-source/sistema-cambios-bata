import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  getDoc, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDCKYflkU3rbMGqdudZzS3RP6uqrHBHIhQ",
  authDomain: "sistema-de-cambios-bata.firebaseapp.com",
  projectId: "sistema-de-cambios-bata",
  storageBucket: "sistema-de-cambios-bata.firebasestorage.app",
  messagingSenderId: "87556921976",
  appId: "1:87556921976:web:fe6474c0154dfce19beb8d",
  measurementId: "G-0XXGS651PJ"
};

const SUPER_ADMIN_EMAIL = "jd.olmitos@gmail.com";
const SUPER_ADMIN_WHATSAPP = "59174812364";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let userData = null;
let solicitudes = [];
let entregas = [];
let lotesProduccion = [];

let categoriaEntregaActiva = "todas";
let croquisTarjetaBase64 = null;
let plantillaCorteTarjetaBase64 = null;

const safeClick = (id, fn) => {
  const el = document.getElementById(id);
  if (el) el.onclick = fn;
};

window.togglePasswordVisibility = (inputId, eyeIconId) => {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(eyeIconId);
  if (!input || !icon) return;
  if (input.type === "password") {
    input.type = "text";
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  } else {
    input.type = "password";
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  }
};

const comprimirImagen = (file, maxWidth = 600, calidad = 0.75) => new Promise((resolve) => {
  if (!file) return resolve(null);
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (event) => {
    const img = new Image();
    img.src = event.target.result;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", calidad));
    };
    img.onerror = () => resolve(null);
  };
  reader.onerror = () => resolve(null);
});

function esSuperAdmin() {
  if (!currentUser || !currentUser.email) return false;
  return currentUser.email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}

document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      try {
        const docSnap = await getDoc(doc(db, "usuarios", user.uid));
        userData = docSnap.exists() ? docSnap.data() : { nombre: user.email.split("@")[0], rol: "Desarrollo de producto" };
      } catch (e) {
        userData = { nombre: user.email.split("@")[0], rol: "Desarrollo de producto" };
      }
      actualizarHeaderUsuario();
      document.getElementById("welcome-container")?.classList.add("hidden");
      document.getElementById("app-container")?.classList.remove("hidden");
      inicializarSemanas01a52();
      activarVistaCambios();
      escucharCambios();
      escucharEntregas();
      escucharProduccion();
    } else {
      currentUser = null;
      userData = null;
      document.getElementById("welcome-container")?.classList.remove("hidden");
      document.getElementById("app-container")?.classList.add("hidden");
    }
  });

  safeClick("btn-show-login", () => document.getElementById("modal-login")?.classList.remove("hidden"));
  safeClick("close-login", () => document.getElementById("modal-login")?.classList.add("hidden"));
  safeClick("btn-show-register", () => document.getElementById("modal-register")?.classList.remove("hidden"));
  safeClick("close-register", () => document.getElementById("modal-register")?.classList.add("hidden"));
  safeClick("btn-logout", () => signOut(auth).then(() => window.location.reload()));
  safeClick("close-visor-foto", () => document.getElementById("modal-visor-foto")?.classList.add("hidden"));
  safeClick("btn-close-whatsapp-modal", () => document.getElementById("modal-whatsapp")?.classList.add("hidden"));

  const formLogin = document.getElementById("form-login");
  if (formLogin) {
    formLogin.onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById("login-email").value.trim();
      const pass = document.getElementById("login-pass").value;
      try {
        await signInWithEmailAndPassword(auth, email, pass);
        document.getElementById("modal-login")?.classList.add("hidden");
      } catch (err) {
        alert("Credenciales incorrectas: " + err.message);
      }
    };
  }

  safeClick("menu-btn-cambios", activarVistaCambios);
  safeClick("menu-btn-informe", () => { resetMenuStyles(); document.getElementById("view-informe")?.classList.remove("hidden"); });
  safeClick("menu-btn-entregas-todas", () => window.cambiarSubmenuEntrega("todas"));
  safeClick("menu-btn-produccion", () => { resetMenuStyles(); document.getElementById("view-produccion")?.classList.remove("hidden"); renderProduccionView(); });
  safeClick("menu-btn-procurement", () => { resetMenuStyles(); document.getElementById("view-procurement")?.classList.remove("hidden"); });
  safeClick("menu-btn-tarjetas", () => { resetMenuStyles(); document.getElementById("view-tarjetas")?.classList.remove("hidden"); initModuloTarjetas(); });
});

function resetMenuStyles() {
  ["view-cambios", "view-informe", "view-entregas", "view-produccion", "view-procurement", "view-tarjetas", "view-usuarios"].forEach(id => {
    document.getElementById(id)?.classList.add("hidden");
  });
}

function activarVistaCambios() {
  resetMenuStyles();
  document.getElementById("view-cambios")?.classList.remove("hidden");
}

function actualizarHeaderUsuario() {
  const esAdmin = esSuperAdmin();
  const uName = document.getElementById("user-display-name");
  const uRole = document.getElementById("user-display-role");
  if (uName) uName.textContent = (userData && userData.nombre) || (currentUser && currentUser.email) || "Usuario";
  if (uRole) uRole.textContent = esAdmin ? "SUPER ADMIN" : ((userData && userData.rol) || "Usuario");
}

function inicializarSemanas01a52() {
  const selects = [document.getElementById("prod-filter-semana"), document.getElementById("lote-semana")];
  selects.forEach(sel => {
    if (!sel) return;
    const valAct = sel.value;
    const esFiltro = sel.id === "prod-filter-semana";
    sel.innerHTML = esFiltro ? '<option value="">Todas las Semanas (01-52)</option>' : '';
    for (let i = 1; i <= 52; i++) {
      const numStr = i < 10 ? `0${i}` : `${i}`;
      sel.innerHTML += `<option value="Semana ${numStr}">Semana ${numStr}</option>`;
    }
    if (valAct) sel.value = valAct;
  });
}

// ==================== CAMBIOS ====================
function escucharCambios() {
  onSnapshot(collection(db, "solicitudes_cambios"), (snapshot) => {
    solicitudes = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    solicitudes.sort((a, b) => (b.fechaCreacion || "").localeCompare(a.fechaCreacion || ""));
    renderTablaCambios();
  }, (err) => console.log("Error cambios:", err));
}

function renderTablaCambios() {
  const tbody = document.getElementById("table-cambios-body");
  const empty = document.getElementById("table-empty-state");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (solicitudes.length === 0) {
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");

  solicitudes.forEach((item) => {
    const tr = document.createElement("tr");
    tr.className = item.esMinuta ? "bg-amber-50/70 border-b border-amber-200" : "hover:bg-gray-50/80 transition border-b border-gray-100";
    let badgeMinuta = item.esMinuta ? `<span class="bg-amber-500 text-white font-black text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider block mb-1 w-fit">PLAN PILOTO</span>` : '';
    const fotoHTML = item.foto ? `<img src="${item.foto}" onclick="window.verFotoGrande('${item.foto}', '${item.proyecto}')" class="w-10 h-7 object-cover rounded border cursor-pointer mx-auto">` : '—';

    tr.innerHTML = `
      <td class="p-2 border-r text-center">${fotoHTML}</td>
      <td class="p-3 font-bold border-r font-mono">${item.semana || '—'}</td>
      <td class="p-3 text-gray-600 border-r whitespace-nowrap">${formatearFecha(item.fechaCreacion)}</td>
      <td class="p-3 border-r"><span class="font-bold">${item.solicitanteNombre || '—'}</span></td>
      <td class="p-3.5 font-bold border-r">${badgeMinuta}${item.proyecto}</td>
      <td class="p-3.5 font-mono border-r">${item.articulo}</td>
      <td class="p-3.5 border-r">${item.boxCambio}</td>
      <td class="p-3.5 text-center border-r"><span class="border px-2.5 py-1 rounded-lg font-bold text-xs">${item.estado}</span></td>
      <td class="p-3.5 text-center border-r">${item.fechaRealizado ? formatearFecha(item.fechaRealizado) : '—'}</td>
      <td class="p-3.5 text-center">${item.validadoCostos ? '<span class="text-green-700 font-bold"><i class="fa-solid fa-circle-check"></i> Validado</span>' : 'Pendiente'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ==================== ENTREGAS ====================
function escucharEntregas() {
  onSnapshot(collection(db, "entregas_departamentos"), (snapshot) => {
    entregas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    entregas.sort((a, b) => (b.fechaEntrega || "").localeCompare(a.fechaEntrega || ""));
    renderTablaEntregas();
  }, (err) => console.log("Error entregas:", err));
}

window.cambiarSubmenuEntrega = (categoria) => {
  resetMenuStyles();
  document.getElementById("view-entregas")?.classList.remove("hidden");
  categoriaEntregaActiva = categoria;
  renderTablaEntregas();
};

function renderTablaEntregas() {
  const tbody = document.getElementById("table-entregas-body");
  const empty = document.getElementById("entregas-empty-state");
  if (!tbody) return;
  tbody.innerHTML = "";

  let filtradas = entregas.filter(item => {
    return (categoriaEntregaActiva === "todas") || ((item.tipo || "").toUpperCase().trim() === categoriaEntregaActiva.toUpperCase().trim());
  });

  if (filtradas.length === 0) {
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");

  const esAdmin = esSuperAdmin();

  filtradas.forEach(ent => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50 border-b";

    const puedeConfirmar = (userData && userData.rol === ent.destino) || esAdmin;
    let recepcionHTML = ent.recibido ? 
      `<span class="text-green-700 font-bold"><i class="fa-solid fa-circle-check"></i> Recibido</span>` : 
      (puedeConfirmar ? `<button onclick="window.confirmarRecepcionEntrega('${ent.id}', '${ent.tipo}', '${ent.proyecto}')" class="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-2.5 py-1 rounded-lg border border-blue-200 cursor-pointer">Confirmar Recepción</button>` : `<span class="text-amber-600 font-semibold text-[11px]">En tránsito a ${ent.destino}</span>`);

    const fotoHTML = ent.foto ? `<img src="${ent.foto}" onclick="window.verFotoGrande('${ent.foto}', '${ent.proyecto}')" class="w-10 h-7 object-cover rounded border cursor-pointer mx-auto">` : '—';

    tr.innerHTML = `
      <td class="p-2 border-r text-center">${fotoHTML}</td>
      <td class="p-3 font-bold border-r font-mono">${ent.semana || '—'}</td>
      <td class="p-3 text-gray-600 border-r whitespace-nowrap">${formatearFecha(ent.fechaEntrega)}</td>
      <td class="p-3 font-bold border-r">${ent.proyecto || '—'}</td>
      <td class="p-3 font-mono border-r">${ent.articulo || '—'}</td>
      <td class="p-3 border-r"><span class="bg-red-50 text-[#D61B28] px-2 py-0.5 rounded font-bold text-[10px]">${ent.tipo}</span></td>
      <td class="p-3 border-r">${ent.entregadoPorNombre || 'Usuario'}</td>
      <td class="p-3 border-r font-bold">${ent.destino}</td>
      <td class="p-3 text-center">${recepcionHTML}</td>
    `;
    tbody.appendChild(tr);
  });
}

window.confirmarRecepcionEntrega = async (id, tipo, proyecto) => {
  if (confirm(`¿Confirmar recepción de "${tipo}" (${proyecto})?`)) {
    await updateDoc(doc(db, "entregas_departamentos", id), {
      recibido: true,
      fechaRecepcion: new Date().toISOString(),
      recibidoPorNombre: (userData && userData.nombre) || "Usuario"
    });
  }
};

window.verFotoGrande = (src, titulo) => {
  if (!src) return;
  document.getElementById("visor-foto-img").src = src;
  document.getElementById("modal-visor-foto")?.classList.remove("hidden");
};

function formatearFecha(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ==================== PRODUCCIÓN WORK PLANNER ====================
function escucharProduccion() {
  onSnapshot(collection(db, "produccion_lotes"), (snapshot) => {
    lotesProduccion = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProduccionView();
  }, (err) => console.log("Error producción:", err));
}

function renderProduccionView() {
  const table = document.getElementById("tabla-matriz-produccion");
  const labelSemanaGrande = document.getElementById("label-semana-grande");
  if (!table) return;

  const fSem = document.getElementById("prod-filter-semana")?.value || "";
  const fProy = document.getElementById("prod-filter-proyecto")?.value.trim().toLowerCase() || "";
  const fLin = document.getElementById("prod-filter-linea")?.value || "";

  if (labelSemanaGrande) {
    labelSemanaGrande.textContent = fSem ? fSem.toUpperCase() : "TODAS LAS SEMANAS";
  }

  let filtrados = lotesProduccion.filter(l => {
    const semMatch = !fSem || (l.semana || "") === fSem;
    const proyMatch = !fProy || (l.proyecto || "").toLowerCase().includes(fProy) || (l.plan || "").toLowerCase().includes(fProy) || (l.articulo || "").toLowerCase().includes(fProy);
    const linMatch = !fLin || String(l.linea || "") === String(fLin);
    return semMatch && proyMatch && linMatch;
  });

  const seccionesDisponibles = fLin ? [fLin] : ["330", "331", "332", "251", "252", "254"];
  const diasSemana = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES"];

  let html = "";
  let rowIndexGlobal = 0;

  seccionesDisponibles.forEach(seccion => {
    const lotesSeccion = filtrados.filter(l => String(l.linea) === String(seccion));
    const planesUnicos = {};
    lotesSeccion.forEach(l => {
      const pKey = l.plan || l.proyecto;
      if (!planesUnicos[pKey]) {
        planesUnicos[pKey] = { plan: l.plan, articulo: l.articulo, proyecto: l.proyecto, dias: {} };
      }
      planesUnicos[pKey].dias[l.dia] = l;
    });

    const listaPlanes = Object.values(planesUnicos);
    let sumaParesSeccion = 0;

    for (let i = 0; i < 6; i++) {
      const datosPlan = listaPlanes[i] || null;
      let totalFila = 0;
      rowIndexGlobal++;
      const colorBg = rowIndexGlobal % 2 === 0 ? 'bg-white' : 'bg-slate-50';

      html += `<tr class="${colorBg} border-b border-gray-300 text-center">`;

      if (i === 0) {
        html += `<td rowspan="6" class="p-2 font-black font-mono border border-gray-300 bg-gray-100 text-gray-900 align-middle text-sm">${seccion}</td>`;
      }

      diasSemana.forEach(dia => {
        const loteDia = datosPlan && datosPlan.dias ? datosPlan.dias[dia] : null;
        if (loteDia) {
          const p = parseInt(loteDia.pares) || 0;
          totalFila += p;
          sumaParesSeccion += p;
          const colorEstado = loteDia.estado === 'ENTREGADO' ? 'text-green-700 bg-green-50' : 'text-amber-700 bg-amber-50';
          html += `
            <td class="p-1 border border-gray-300 font-mono text-[10px] font-bold text-red-600">${loteDia.plan || '—'}</td>
            <td class="p-1 border border-gray-300 font-mono text-[10px]">${loteDia.articulo || '—'}</td>
            <td class="p-1 border border-gray-300 font-bold text-[10px] truncate max-w-[65px]">${loteDia.proyecto || '—'}</td>
            <td class="p-1 border border-gray-300 font-black text-cyan-900 bg-cyan-50/30">${p.toLocaleString()}</td>
            <td class="p-1 border border-gray-300">
              <select onchange="window.actualizarEstadoDiaLote('${loteDia.id}', this.value)" class="text-[10px] font-bold rounded px-1 py-0.5 border ${colorEstado}">
                <option value="CORTADO" ${loteDia.estado === 'CORTADO' ? 'selected' : ''}>CORTADO</option>
                <option value="APARADO" ${loteDia.estado === 'APARADO' ? 'selected' : ''}>APARADO</option>
                <option value="ARMADO" ${loteDia.estado === 'ARMADO' ? 'selected' : ''}>ARMADO</option>
                <option value="INYECCIÓN" ${loteDia.estado === 'INYECCIÓN' ? 'selected' : ''}>INYECCIÓN</option>
                <option value="ENTREGADO" ${loteDia.estado === 'ENTREGADO' ? 'selected' : ''}>ENTREGADO</option>
              </select>
            </td>
          `;
        } else {
          html += `
            <td class="p-1 border border-gray-300 text-gray-300">—</td>
            <td class="p-1 border border-gray-300 text-gray-300">—</td>
            <td class="p-1 border border-gray-300 text-gray-300">—</td>
            <td class="p-1 border border-gray-300 text-gray-300">—</td>
            <td class="p-1 border border-gray-300 text-gray-300">—</td>
          `;
        }
      });

      html += `<td class="p-2 border border-gray-300 font-black text-xs bg-gray-100 text-[#D61B28] align-middle">${totalFila > 0 ? totalFila.toLocaleString() : '—'}</td>`;
      html += `</tr>`;
    }

    html += `
      <tr class="bg-gray-200 font-black text-[11px] text-gray-800 border-b-2 border-gray-400 text-center">
        <td colspan="26" class="p-1.5 text-right pr-4">SUBTOTAL SECCIÓN ${seccion}:</td>
        <td class="p-1.5 border border-gray-300 text-[#D61B28]">${sumaParesSeccion > 0 ? sumaParesSeccion.toLocaleString() : '0'}</td>
      </tr>
    `;
  });

  table.innerHTML = html;
}

const filtroSemanaProd = document.getElementById("prod-filter-semana");
const filtroProyectoProd = document.getElementById("prod-filter-proyecto");
const filtroLineaProd = document.getElementById("prod-filter-linea");

if (filtroSemanaProd) filtroSemanaProd.onchange = renderProduccionView;
if (filtroProyectoProd) filtroProyectoProd.oninput = renderProduccionView;
if (filtroLineaProd) filtroLineaProd.onchange = renderProduccionView;

safeClick("btn-limpiar-filtros-prod", () => {
  if (filtroSemanaProd) filtroSemanaProd.value = "";
  if (filtroProyectoProd) filtroProyectoProd.value = "";
  if (filtroLineaProd) filtroLineaProd.value = "";
  renderProduccionView();
});

// ==================== TARJETAS PD ====================
function initModuloTarjetas() {
  const inputFecha = document.getElementById("card-fecha");
  if (inputFecha && !inputFecha.value) inputFecha.value = "9/9/2026";

  safeClick("btn-quick-distribute", () => {
    const raw = document.getElementById("input-quick-paste-row")?.value.trim() || "";
    if (!raw) return;
    let cols = raw.split("\t").map(c => c.trim()).filter(c => c !== "");
    if (cols.length >= 4) {
      document.getElementById("card-costo-articulo").value = cols[0] || "";
      document.getElementById("card-costo-linea").value = cols[2] || "";
      document.getElementById("card-costo-marca").value = cols[3] || "TEENER";
      renderTarjetasPreview();
    }
  });

  ["count-card-corte", "count-card-prod", "count-card-verde", "count-card-amarilla", "count-card-rosada"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.oninput = renderTarjetasPreview;
  });

  [
    "card-costo-articulo", "card-costo-linea", "card-costo-marca", "card-costo-budret", 
    "card-costo-precio", "card-costo-margen", "card-serie", "card-fecha", "card-material-corte", 
    "card-forro", "card-plant-int", "card-tecnico", "card-horma-suela", "card-construccion", "card-observaciones"
  ].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) elem.oninput = renderTarjetasPreview;
  });

  safeClick("btn-imprimir-tarjetas-action", () => {
    const previewHTML = document.getElementById("contenedor-tarjetas-preview")?.innerHTML || "";
    const hTarj = document.getElementById("hoja-impresion-tarjetas");
    if (hTarj) hTarj.innerHTML = previewHTML;
    document.getElementById("modal-impresion-tarjetas")?.classList.remove("hidden");
  });

  renderTarjetasPreview();
}

function renderTarjetasPreview() {
  const container = document.getElementById("contenedor-tarjetas-preview");
  if (!container) return;

  const cCortes = parseInt(document.getElementById("count-card-corte")?.value) || 0;
  const cProd = parseInt(document.getElementById("count-card-prod")?.value) || 0;
  const cVerdes = parseInt(document.getElementById("count-card-verde")?.value) || 0;
  const cAmarillas = parseInt(document.getElementById("count-card-amarilla")?.value) || 0;
  const cRosadas = parseInt(document.getElementById("count-card-rosada")?.value) || 0;

  const articulo = document.getElementById("card-costo-articulo")?.value || "34461836";
  const linea = (document.getElementById("card-costo-linea")?.value || "QUIQUE").toUpperCase();
  const marca = (document.getElementById("card-costo-marca")?.value || "TEENER").toUpperCase();
  const precio = document.getElementById("card-costo-precio")?.value || "259.00";
  const margen = document.getElementById("card-costo-margen")?.value || "55.00%";
  const budRet = document.getElementById("card-costo-budret")?.value || "37.39%";
  const serie = document.getElementById("card-serie")?.value || "37-44";
  const fecha = document.getElementById("card-fecha")?.value || "9/9/2026";
  const materialCorte = (document.getElementById("card-material-corte")?.value || "IMITACION").toUpperCase();
  const forro = (document.getElementById("card-forro")?.value || "PIQUE NEGRO").toUpperCase();
  const plantInt = (document.getElementById("card-plant-int")?.value || "PIQUE NEGRO").toUpperCase();
  const modelista = (document.getElementById("card-tecnico")?.value || "CARLOS ARCE").toUpperCase();
  const construccion = (document.getElementById("card-construccion")?.value || "TRUE MOC").toUpperCase();
  const suela = (document.getElementById("card-horma-suela")?.value || "QUIQUE").toUpperCase();
  const observaciones = document.getElementById("card-observaciones")?.value || "Sin observaciones adicionales";

  const siluetaCalzadoHTML = `<div style="height:32px; display:flex; align-items:center; justify-content:center; font-size:8px; color:#999; border:1px dashed #ccc;">Croquis</div>`;

  const listaAImprimir = [];
  for (let i = 1; i <= cCortes; i++) listaAImprimir.push({ color: "#FFFFFF", etiqueta: "APROBACIONES", esCorte: true });
  for (let i = 1; i <= cProd; i++) listaAImprimir.push({ color: "#FFFFFF", etiqueta: "APROBACIONES", esCorte: false });
  for (let i = 1; i <= cVerdes; i++) listaAImprimir.push({ color: "#80C342", etiqueta: "APROBACIONES", esCorte: false });
  for (let i = 1; i <= cAmarillas; i++) listaAImprimir.push({ color: "#FFF200", etiqueta: "APROBACIONES", esCorte: false });
  for (let i = 1; i <= cRosadas; i++) listaAImprimir.push({ color: "#E06D8A", etiqueta: "APROBACIONES", esCorte: false });

  let tarjetasHTML = "";
  listaAImprimir.forEach((tarj) => {
    const moduloInfo = `
      <div class="shoe-panel" style="display:flex; border-right:1px solid #000; overflow:hidden;">
        <div class="lateral-tab" style="width:16px; border-right:1px solid #000; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:9px; writing-mode:vertical-rl; transform:rotate(180deg); background-color:${tarj.color} !important;">
          ${linea}
        </div>
        <div style="flex:1; display:flex; flex-direction:column; justify-content:space-between; padding:1px;">
          <div style="font-size:7.5px; font-weight:900; color:#dc2626; text-align:center; border-bottom:1px solid #000;">MANUFACTURA BOLIVIANA S.A.</div>
          <div style="display:flex; flex:1; align-items:center;">
            <div style="width:45px; display:flex; justify-content:center; border-right:1px solid #000; height:100%;">${siluetaCalzadoHTML}</div>
            <div style="flex:1; height:100%;">
              <table style="width:100%; height:100%; border-collapse:collapse; font-size:6px; font-weight:900;">
                <tr style="border-bottom:1px solid #000;"><td style="border-right:1px solid #000; text-align:center;">ART:</td><td style="text-align:center; font-family:monospace; font-size:7px;">${articulo}</td></tr>
                <tr style="border-bottom:1px solid #000;"><td style="border-right:1px solid #000; text-align:center;">MARCA:</td><td style="text-align:center;">${marca}</td></tr>
                <tr style="border-bottom:1px solid #000;"><td style="border-right:1px solid #000; text-align:center;">SERIE:</td><td style="text-align:center;">${serie}</td></tr>
                <tr style="border-bottom:1px solid #000;"><td style="border-right:1px solid #000; text-align:center;">CORTE:</td><td style="text-align:center; font-size:5px;">${materialCorte}</td></tr>
                <tr style="border-bottom:1px solid #000;"><td style="border-right:1px solid #000; text-align:center;">FORRO:</td><td style="text-align:center; font-size:5px;">${forro}</td></tr>
                <tr><td style="border-right:1px solid #000; text-align:center;">PLANT:</td><td style="text-align:center; font-size:5px;">${plantInt}</td></tr>
              </table>
            </div>
          </div>
          <div style="display:flex; border-top:1px solid #000; font-size:5.5px; font-weight:bold; padding:1px 2px; justify-content:space-between;"><span>${fecha}</span></div>
        </div>
      </div>
    `;

    const moduloFirmas = `
      <div class="shoe-panel" style="display:flex; flex-direction:column; justify-content:space-between; padding:2px 4px; font-size:6px; ${tarj.esCorte ? '' : 'border-right:1px solid #000;'}">
        <div style="font-size:7px; font-weight:900; text-align:center; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:1px;">${tarj.etiqueta}</div>
        <div style="display:flex; flex-direction:column; justify-content:space-around; flex:1; font-size:5.5px;">
          <div style="display:flex; justify-content:space-between;">
            <div><div style="border-bottom:1px solid #000; width:55mm; height:8px;"></div><span style="font-weight:bold;">PD. CHIEF</span><br>DATE: &nbsp; / &nbsp; / &nbsp;</div>
            <div><div style="border-bottom:1px solid #000; width:55mm; height:8px;"></div><span style="font-weight:bold;">PD. CHIEF</span><br>DATE: &nbsp; / &nbsp; / &nbsp;</div>
          </div>
          <div style="text-align:center; margin-top:2px;">
            <div style="border-bottom:1px solid #000; width:55mm; height:8px; margin:auto;"></div>
            <span style="font-weight:bold;">PURCHASING MANAGER</span><br>DATE: &nbsp; / &nbsp; / &nbsp;
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:2px;">
            <div><div style="border-bottom:1px solid #000; width:55mm; height:8px;"></div><span style="font-weight:bold;">PRODUCTION MANAGER</span><br>DATE: &nbsp; / &nbsp; / &nbsp;</div>
            <div><div style="border-bottom:1px solid #000; width:55mm; height:8px;"></div><span style="font-weight:bold;">COUNTRY MANAGER</span><br>DATE: &nbsp; / &nbsp; / &nbsp;</div>
          </div>
        </div>
      </div>
    `;

    const moduloObservaciones = `
      <div class="shoe-panel" style="padding:4px; display:flex; flex-direction:column; justify-content:space-between; font-size:7px; border-right:1px solid #000;">
        <div><span style="font-weight:900; text-transform:uppercase; display:block;">OBSERVACIONES:</span><p style="font-size:6.5px; font-style:italic;">${observaciones}</p></div>
        <div style="text-align:right; font-size:6px; font-weight:bold;">BATA BOLIVIA PD</div>
      </div>
    `;

    const panelCentro = tarj.esCorte ? moduloObservaciones : moduloFirmas;
    const panelDerecha = tarj.esCorte ? moduloFirmas : moduloObservaciones;

    tarjetasHTML += `<div class="shoe-card-container" style="background:#fff; display:flex; font-size:7px; color:#000;">${moduloInfo}${panelCentro}${panelDerecha}</div>`;
  });

  container.innerHTML = tarjetasHTML;
}
