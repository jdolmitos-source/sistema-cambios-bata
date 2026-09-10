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
let entregas = [];
let categoriaEntregaActiva = "todas";

// Memoria Tarjetas PD
let croquisTarjetaBase64 = null;
let plantillaCorteTarjetaBase64 = null;

const safeClick = (id, fn) => {
  const el = document.getElementById(id);
  if (el) el.onclick = fn;
};

// Ojito contraseña
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

function esDesarrollo() {
  if (esSuperAdmin()) return true;
  return userData && (userData.rol || "").includes("Desarrollo");
}

// Modal WhatsApp
async function abrirModalWhatsApp({ titulo, subtitulo, mensajeTexto, rolFiltro = null }) {
  const modalWA = document.getElementById("modal-whatsapp");
  const listContainer = document.getElementById("whatsapp-contacts-list");
  if (!modalWA || !listContainer) return;
  document.getElementById("wa-modal-title").textContent = titulo;
  document.getElementById("wa-modal-desc").textContent = subtitulo;
  listContainer.innerHTML = "";

  const encodedMsg = encodeURIComponent(mensajeTexto);

  try {
    const usuariosSnap = await getDocs(collection(db, "usuarios"));
    let count = 0;

    usuariosSnap.forEach(d => {
      const u = d.data();
      const coincideRol = !rolFiltro || u.rol === rolFiltro || 
        (rolFiltro === "Desarrollo de producto - Técnico" && (u.rol || "").includes("Técnico")) ||
        (rolFiltro === "Compras" && ((u.rol || "").includes("Compras")));

      if (u.celular && coincideRol) {
        count++;
        const item = document.createElement("a");
        item.href = `https://wa.me/591${u.celular}?text=${encodedMsg}`;
        item.target = "_blank";
        item.className = "flex items-center justify-between p-2.5 bg-gray-50 hover:bg-green-50 rounded-xl border border-gray-200 transition text-gray-800";
        item.innerHTML = `
          <div>
            <span class="font-bold">${u.nombre}</span>
            <span class="text-[10px] text-gray-400 block">${u.rol} - +591 ${u.celular}</span>
          </div>
          <span class="bg-[#25D366] text-white px-2.5 py-1 rounded-lg font-bold text-[10px] flex items-center space-x-1">
            <i class="fa-brands fa-whatsapp"></i>
            <span>Enviar</span>
          </span>
        `;
        listContainer.appendChild(item);
      }
    });

    if (count === 0) {
      listContainer.innerHTML = `<p class="p-3 text-center text-gray-400 text-xs">No hay contactos registrados con ese rol.</p>`;
    }
    modalWA.classList.remove("hidden");
  } catch (error) {
    console.error("Error al abrir WhatsApp:", error);
  }
}

// Apertura global de modales
window.abrirModalEntrega = () => {
  const selectTipo = document.getElementById("ent-tipo");
  if (selectTipo) {
    selectTipo.innerHTML = "";
    if (categoriaEntregaActiva !== "todas") {
      selectTipo.innerHTML += `<option value="${categoriaEntregaActiva}">${categoriaEntregaActiva}</option>`;
    } else {
      selectTipo.innerHTML += `<option value="GUÍA DE PRODUCCIÓN">GUÍA DE PRODUCCIÓN</option>`;
      selectTipo.innerHTML += `<option value="CORTE">CORTE</option>`;
      selectTipo.innerHTML += `<option value="MUESTRA DEFINITIVA">MUESTRA DEFINITIVA</option>`;
      selectTipo.innerHTML += `<option value="MATERIALES">MATERIALES</option>`;
      selectTipo.innerHTML += `<option value="HOJA DE DESBASTE">HOJA DE DESBASTE</option>`;
      selectTipo.innerHTML += `<option value="TIZADORES">TIZADORES</option>`;
    }
  }
  actualizarCamposSegunTipoEntrega();
  document.getElementById("modal-nueva-entrega")?.classList.remove("hidden");
};

// ==================== ESCUCHA Y RENDER DE ENTREGAS (BOTONES VERDES) ====================
function escucharEntregas() {
  const q = collection(db, "entregas_departamentos");
  onSnapshot(q, (snapshot) => {
    entregas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    entregas.sort((a, b) => (b.fechaEntrega || "").localeCompare(a.fechaEntrega || ""));
    renderTablaEntregas();
  }, (err) => console.error("Error al escuchar entregas:", err));
}

function renderTablaEntregas() {
  const tbody = document.getElementById("table-entregas-body");
  const empty = document.getElementById("entregas-empty-state");
  if (!tbody) return;
  tbody.innerHTML = "";

  let entregasFiltradas = entregas.filter(item => {
    const coincideCategoria = (categoriaEntregaActiva === "todas") || 
      ((item.tipo || "").toUpperCase().trim() === categoriaEntregaActiva.toUpperCase().trim());
    return coincideCategoria;
  });

  if (entregasFiltradas.length === 0) {
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");

  const esAdmin = esSuperAdmin();

  entregasFiltradas.forEach(ent => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50/80 transition border-b border-gray-100";

    const puedeConfirmar = (userData && userData.rol === ent.destino) || esAdmin;

    let recepcionHTML = "";
    if (ent.recibido) {
      recepcionHTML = `
        <span class="text-green-700 font-bold flex items-center justify-center space-x-1">
          <i class="fa-solid fa-circle-check text-green-600"></i>
          <span>Recibido</span>
        </span>
      `;
    } else {
      if (puedeConfirmar) {
        recepcionHTML = `
          <button onclick="window.confirmarRecepcionEntrega('${ent.id}', '${ent.tipo}', '${ent.proyecto}')" class="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-2.5 py-1 rounded-lg border border-blue-200 transition cursor-pointer">
            Confirmar Recepción
          </button>
        `;
      } else {
        recepcionHTML = `<span class="text-amber-600 font-semibold italic text-[11px]">En tránsito a ${ent.destino}</span>`;
      }
    }

    const fotoHTML = ent.foto 
      ? `<img src="${ent.foto}" onclick="window.verFotoGrande('${ent.foto}', '${ent.proyecto}')" class="w-10 h-7 object-cover rounded border cursor-pointer mx-auto">` 
      : '—';

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

function formatearFecha(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ==================== MÓDULO TARJETAS (PD) - PREVISUALIZADOR REPARADO ====================
function initModuloTarjetas() {
  const inputFecha = document.getElementById("card-fecha");
  if (inputFecha && !inputFecha.value) {
    inputFecha.value = "9/9/2026";
  }

  const fileInput = document.getElementById("card-croquis-file");
  if (fileInput) {
    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        croquisTarjetaBase64 = await comprimirImagen(file, 400, 0.8);
        renderTarjetasPreview();
      }
    };
  }

  const fileInputPlantilla = document.getElementById("card-plantilla-img-file");
  if (fileInputPlantilla) {
    fileInputPlantilla.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        plantillaCorteTarjetaBase64 = await comprimirImagen(file, 400, 0.8);
        renderTarjetasPreview();
      }
    };
  }

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

  const totalTarjetas = cCortes + cProd + cVerdes + cAmarillas + cRosadas;
  const lblTotal = document.getElementById("label-total-tarjetas-count");
  if (lblTotal) lblTotal.textContent = totalTarjetas;

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
  const plantInt = (document.getElementById("card-plant-int")?.value || "PIQUE NEGRO / CRETONE").toUpperCase();
  const modelista = (document.getElementById("card-tecnico")?.value || "CARLOS ARCE").toUpperCase();
  const construccion = (document.getElementById("card-construccion")?.value || "TRUE MOC").toUpperCase();
  const suela = (document.getElementById("card-horma-suela")?.value || "QUIQUE").toUpperCase();
  const observaciones = document.getElementById("card-observaciones")?.value || "Sin observaciones adicionales";

  const siluetaCalzadoHTML = croquisTarjetaBase64 
    ? `<img src="${croquisTarjetaBase64}" style="width:100%; height:32px; object-fit:contain; margin:auto;">`
    : `<div style="height:32px; display:flex; align-items:center; justify-content:center; font-size:8px; color:#999; border:1px dashed #ccc;">Croquis</div>`;

  const listaAImprimir = [];
  for (let i = 1; i <= cCortes; i++) listaAImprimir.push({ color: "#FFFFFF", etiqueta: "APROBACIONES (CORTE (PRODUCCIÓN))", esCorte: true });
  for (let i = 1; i <= cProd; i++) listaAImprimir.push({ color: "#FFFFFF", etiqueta: "APROBACIONES (PRODUCCIÓN)", esCorte: false });
  for (let i = 1; i <= cVerdes; i++) listaAImprimir.push({ color: "#80C342", etiqueta: "APROBACIONES (RETAIL)", esCorte: false });
  for (let i = 1; i <= cAmarillas; i++) listaAImprimir.push({ color: "#FFF200", etiqueta: "APROBACIONES (PLANEAMIENTO)", esCorte: false });
  for (let i = 1; i <= cRosadas; i++) listaAImprimir.push({ color: "#E06D8A", etiqueta: "APROBACIONES (EXPORTACIÓN)", esCorte: false });

  let tarjetasHTML = "";
  listaAImprimir.forEach((tarj) => {
    const moduloInfo = `
      <div class="shoe-panel" style="display:flex; border-right:1px solid #000; overflow:hidden;">
        <div class="lateral-tab" style="width:16px; border-right:1px solid #000; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:9px; writing-mode:vertical-rl; transform:rotate(180deg); background-color:${tarj.color} !important;">
          ${linea}
        </div>
        <div style="flex:1; display:flex; flex-direction:column; justify-content:space-between; padding:1px;">
          <div style="font-size:7.5px; font-weight:900; color:#dc2626; text-align:center; border-bottom:1px solid #000; padding-bottom:1px;">
            MANUFACTURA BOLIVIANA S.A.
          </div>
          <div style="display:flex; flex:1; align-items:center;">
            <div style="width:45px; display:flex; flex-direction:column; justify-content:center; border-right:1px solid #000; padding-right:1px; height:100%;">
              ${siluetaCalzadoHTML}
            </div>
            <div style="flex:1; height:100%;">
              <table style="width:100%; height:100%; border-collapse:collapse; font-size:6px; font-weight:900;">
                <tr style="border-bottom:1px solid #000;"><td style="border-right:1px solid #000; width:35%; text-align:center;">ART:</td><td style="text-align:center; font-family:monospace; font-size:7px;">${articulo}</td></tr>
                <tr style="border-bottom:1px solid #000;"><td style="border-right:1px solid #000; width:35%; text-align:center;">MARCA:</td><td style="text-align:center;">${marca}</td></tr>
                <tr style="border-bottom:1px solid #000;"><td style="border-right:1px solid #000; width:35%; text-align:center;">SERIE:</td><td style="text-align:center;">${serie}</td></tr>
                <tr style="border-bottom:1px solid #000;"><td style="border-right:1px solid #000; width:35%; text-align:center;">CORTE:</td><td style="text-align:center; font-size:5px;">${materialCorte}</td></tr>
                <tr style="border-bottom:1px solid #000;"><td style="border-right:1px solid #000; width:35%; text-align:center;">FORRO:</td><td style="text-align:center; font-size:5px;">${forro}</td></tr>
                <tr><td style="border-right:1px solid #000; width:35%; text-align:center;">PLANT:</td><td style="text-align:center; font-size:5px;">${plantInt}</td></tr>
              </table>
            </div>
          </div>
          <div style="display:flex; border-top:1px solid #000; font-size:5.5px; font-weight:bold; padding:1px 2px; justify-content:space-between; background:#fff;">
            <span>${fecha}</span>
          </div>
          <div style="display:flex; border-top:1px solid #000; font-size:5px; font-weight:800; padding:1px 0;">
            <div style="width:50%; border-right:1px solid #000; padding-left:1px;">TEC: ${modelista}<br>CONTR: ${construccion}<br>SUELA: ${suela}</div>
            <div style="width:50%; padding-left:2px;">PRECIO: ${precio}<br>MRG BUD: ${budRet}<br>MRG: ${margen}</div>
          </div>
        </div>
      </div>
    `;

    const moduloFirmas = `
      <div class="shoe-panel" style="display:flex; flex-direction:column; justify-content:space-between; padding:2px 4px; font-size:6px; ${tarj.esCorte ? '' : 'border-right:1px solid #000;'}">
        <div style="font-size:6.5px; font-weight:900; text-align:center; color:#000; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:1px;">
          ${tarj.etiqueta}
        </div>
        <div style="display:flex; flex-direction:column; justify-content:space-around; flex:1; padding-top:2px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-end;">
            <div style="border-bottom:1px solid #000; width:65%; height:10px;"></div>
            <span style="font-size:5.5px; font-weight:bold;">P.D. CHIEF</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:flex-end;">
            <div style="border-bottom:1px solid #000; width:65%; height:10px;"></div>
            <span style="font-size:5.5px; font-weight:bold;">PURCHASING MANAGER</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:flex-end;">
            <div style="border-bottom:1px solid #000; width:65%; height:10px;"></div>
            <span style="font-size:5.5px; font-weight:bold;">MERCHANDISING MAN.</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:flex-end;">
            <div style="border-bottom:1px solid #000; width:65%; height:10px;"></div>
            <span style="font-size:5.5px; font-weight:bold;">PRODUCTION MANAGER</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:flex-end;">
            <div style="border-bottom:1px solid #000; width:65%; height:10px;"></div>
            <span style="font-size:5.5px; font-weight:bold;">COUNTRY MANAGER</span>
          </div>
        </div>
      </div>
    `;

    const moduloObservaciones = `
      <div class="shoe-panel" style="padding:4px; display:flex; flex-direction:column; justify-content:space-between; font-size:7px; border-right:1px solid #000;">
        <div>
          <span style="font-weight:900; color:#000; text-transform:uppercase; display:block; margin-bottom:1px;">OBSERVACIONES:</span>
          <p style="font-size:6.5px; color:#000; font-style:italic; line-height:1.2;">${observaciones}</p>
        </div>
        <div style="text-align:right; font-size:6px; color:#000; font-weight:bold;">BATA BOLIVIA PD</div>
      </div>
    `;

    const panelCentro = tarj.esCorte ? moduloObservaciones : moduloFirmas;
    const panelDerecha = tarj.esCorte ? moduloFirmas : moduloObservaciones;

    tarjetasHTML += `
      <div class="shoe-card-container" style="background:#fff; display:flex; font-size:7px; line-height:1.1; color:#000;">
        ${moduloInfo}
        ${panelCentro}
        ${panelDerecha}
      </div>
    `;
  });

  container.innerHTML = tarjetasHTML;
}

// Inicialización general al cargar el DOM
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
      welcomeContainer?.classList.add("hidden");
      appContainer?.classList.remove("hidden");
      inicializarSemanas01a52();
      activarVistaCambios();
      escucharCambios();
      escucharEntregas();
      escucharProduccion();
    } else {
      currentUser = null;
      userData = null;
      welcomeContainer?.classList.remove("hidden");
      appContainer?.classList.add("hidden");
    }
  });

  // Navegación principal
  safeClick("menu-btn-cambios", activarVistaCambios);
  safeClick("menu-btn-informe", () => {
    resetMenuStyles();
    viewInforme?.classList.remove("hidden");
  });
  safeClick("menu-btn-entregas-todas", () => window.cambiarSubmenuEntrega("todas"));
  safeClick("menu-btn-produccion", () => {
    resetMenuStyles();
    viewProduccion?.classList.remove("hidden");
    renderProduccionView();
  });
  safeClick("menu-btn-procurement", () => {
    resetMenuStyles();
    viewProcurement?.classList.remove("hidden");
  });
  safeClick("menu-btn-tarjetas", () => {
    resetMenuStyles();
    viewTarjetas?.classList.remove("hidden");
    initModuloTarjetas();
  });
});

function activarVistaCambios() {
  resetMenuStyles();
  viewCambios?.classList.remove("hidden");
}

function resetMenuStyles() {
  ["view-cambios", "view-informe", "view-entregas", "view-produccion", "view-procurement", "view-tarjetas", "view-usuarios"].forEach(id => {
    document.getElementById(id)?.classList.add("hidden");
  });
}
