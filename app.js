import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
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
  onSnapshot, 
  serverTimestamp 
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
let bloqueosMateriales = [];
let llegadasMateriales = [];
let lotesProduccion = [];
let solicitudesHelpDesk = [];
let bitacoraBorrados = [];

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

      const base64Comprimido = canvas.toDataURL("image/jpeg", calidad);
      resolve(base64Comprimido);
    };
    img.onerror = () => resolve(null);
  };
  reader.onerror = () => resolve(null);
});

function esSuperAdmin() {
  if (!currentUser || !currentUser.email) return false;
  return currentUser.email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}

function esComprasAdmin() {
  if (esSuperAdmin()) return true;
  return userData && (userData.rol === "Compras Admin" || userData.rol === "Compras");
}

function esDesarrollo() {
  if (esSuperAdmin()) return true;
  return userData && (userData.rol || "").includes("Desarrollo");
}

// Validación segura de multi-roles para HelpDesk y áreas
function usuarioTieneAccesoArea(areaDestino) {
  if (esSuperAdmin()) return true;
  if (!userData) return false;

  const rolPrincipal = userData.rol || "";
  if (rolPrincipal === areaDestino || rolPrincipal.includes(areaDestino)) return true;

  if (userData.rolesMultiples && Array.isArray(userData.rolesMultiples)) {
    return userData.rolesMultiples.some(r => r === areaDestino || r.includes(areaDestino));
  }

  return false;
}

// Modal WhatsApp
async function abrirModalWhatsApp({ titulo, subtitulo, mensajeTexto }) {
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
      if (u.celular) {
        count++;
        const item = document.createElement("a");
        item.href = `https://wa.me/591${u.celular}?text=${encodedMsg}`;
        item.target = "_blank";
        item.className = "flex items-center justify-between p-2.5 bg-gray-50 hover:bg-green-50 rounded-xl border border-gray-200 transition text-gray-800";
        item.innerHTML = `
          <div>
            <span class="font-bold">${u.nombre}</span>
            <span class="text-[10px] text-gray-400 block">${u.rol || 'Usuario'} - +591 ${u.celular}</span>
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
      listContainer.innerHTML = `<p class="p-3 text-center text-gray-400 text-xs">No hay usuarios registrados con número de celular.</p>`;
    }

    modalWA.classList.remove("hidden");
  } catch (error) {
    console.error("Error al abrir WhatsApp:", error);
  }
}

// ==================== FUNCIONES GLOBALES DE APERTURA ====================
window.abrirModalCambio = () => {
  document.getElementById("modal-new-change")?.classList.remove("hidden");
};

window.abrirModalMinuta = () => {
  document.getElementById("modal-minuta")?.classList.remove("hidden");
};

window.abrirModalNuevaSolicitudHelpDesk = () => {
  document.getElementById("modal-nueva-solicitud-helpdesk")?.classList.remove("hidden");
};

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

window.abrirModalBloqueo = () => {
  document.getElementById("modal-nuevo-bloqueo")?.classList.remove("hidden");
};

window.abrirModalLlegada = () => {
  document.getElementById("modal-nueva-llegada")?.classList.remove("hidden");
};

window.abrirModalLoteProduccion = () => {
  document.getElementById("modal-nuevo-lote-prod")?.classList.remove("hidden");
};

window.abrirModalEliminarPlan = () => {
  document.getElementById("modal-eliminar-plan")?.classList.remove("hidden");
};

// Inicializador de semanas 01 a 52
function inicializarSemanas01a52() {
  const selects = [
    document.getElementById("prod-filter-semana"),
    document.getElementById("lote-semana")
  ];

  selects.forEach(sel => {
    if (!sel) return;
    const valorActual = sel.value;
    const esFiltro = sel.id === "prod-filter-semana";
    sel.innerHTML = esFiltro ? '<option value="">Todas las Semanas (01-52)</option>' : '';

    for (let i = 1; i <= 52; i++) {
      const numStr = i < 10 ? `0${i}` : `${i}`;
      const val = `Semana ${numStr}`;
      sel.innerHTML += `<option value="${val}">Semana ${numStr}</option>`;
    }
    if (valorActual) sel.value = valorActual;
  });
}

// Actualizador dinámico del filtro de semanas de aplicabilidad en la vista de Cambios
function actualizarSelectSemanasAplica() {
  const sel = document.getElementById("filtro-semana-aplica-cambios");
  if (!sel) return;
  const valorActual = sel.value;
  
  const semanasUnicas = new Set();
  solicitudes.forEach(s => {
    if (s.semanaAplica) semanasUnicas.add(s.semanaAplica.trim());
    else if (s.semana) semanasUnicas.add(s.semana.trim());
  });

  let optionsHTML = '<option value="">Todas las Semanas</option>';
  Array.from(semanasUnicas).sort().forEach(sem => {
    optionsHTML += `<option value="${sem}">${sem}</option>`;
  });
  
  sel.innerHTML = optionsHTML;
  if (valorActual) sel.value = valorActual;
}

// ==================== MÓDULO HELPDESK ====================
function escucharHelpDesk() {
  const q = collection(db, "solicitudes_helpdesk");
  onSnapshot(q, (snapshot) => {
    solicitudesHelpDesk = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    solicitudesHelpDesk.sort((a, b) => (b.fechaCreacion || "").localeCompare(a.fechaCreacion || ""));
    renderHelpDeskView();
  }, (err) => console.log("Aviso HelpDesk:", err.message));
}

const formNuevaSolicitudHelpDesk = document.getElementById("form-nueva-solicitud-helpdesk");
if (formNuevaSolicitudHelpDesk) {
  formNuevaSolicitudHelpDesk.onsubmit = async (e) => {
    e.preventDefault();
    const destino = document.getElementById("helpdesk-destino").value;
    const pregunta = document.getElementById("helpdesk-pregunta").value.trim();

    try {
      await addDoc(collection(db, "solicitudes_helpdesk"), {
        remitenteNombre: (userData && userData.nombre) || "Usuario",
        remitenteRol: (userData && userData.rol) || "Planta",
        destino,
        pregunta,
        respuesta: "",
        respondidoPor: "",
        fechaCreacion: new Date().toISOString(),
        fechaRespuesta: null,
        estado: "Pendiente"
      });

      formNuevaSolicitudHelpDesk.reset();
      document.getElementById("modal-nueva-solicitud-helpdesk")?.classList.add("hidden");

      abrirModalWhatsApp({
        titulo: `Notificar Solicitud (${destino})`,
        subtitulo: `Requerimiento enviado a ${destino}`,
        mensajeTexto: `💬 *NUEVA SOLICITUD INTERDEPARTAMENTAL*\n• De: ${(userData && userData.nombre) || 'Usuario'}\n• Para: ${destino}\n• Pregunta: ${pregunta}`
      });
    } catch (err) {
      alert("Error al enviar solicitud: " + err.message);
    }
  };
}

function renderHelpDeskView() {
  const tbody = document.getElementById("table-solicitudes-helpdesk-body");
  const empty = document.getElementById("solicitudes-empty-state");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (solicitudesHelpDesk.length === 0) {
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");

  const ahora = new Date();
  const esAdmin = esSuperAdmin();

  solicitudesHelpDesk.forEach(sol => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50/80 transition border-b border-gray-100";

    const fechaCreacion = new Date(sol.fechaCreacion);
    const diffDias = (ahora - fechaCreacion) / (1000 * 60 * 60 * 24);

    let estadoBadge = "";
    if (sol.estado === "Resuelto") {
      estadoBadge = `<span class="bg-green-100 text-green-800 font-bold px-2.5 py-1 rounded-full border border-green-200 flex items-center justify-center space-x-1"><span class="w-2 h-2 rounded-full bg-green-500"></span><span>Resuelto</span></span>`;
    } else if (diffDias > 3) {
      estadoBadge = `<span class="bg-red-100 text-red-800 font-bold px-2.5 py-1 rounded-full border border-red-200 flex items-center justify-center space-x-1 animate-pulse"><span class="w-2 h-2 rounded-full bg-red-600"></span><span>Rojo (>3 días)</span></span>`;
    } else {
      estadoBadge = `<span class="bg-amber-100 text-amber-800 font-bold px-2.5 py-1 rounded-full border border-amber-200 flex items-center justify-center space-x-1"><span class="w-2 h-2 rounded-full bg-amber-500"></span><span>Pendiente</span></span>`;
    }

    const esDelDepartamento = usuarioTieneAccesoArea(sol.destino) || esAdmin;

    let respuestaHTML = "";
    if (sol.estado === "Resuelto") {
      respuestaHTML = `
        <div class="text-gray-700 font-medium">
          <p class="italic">${sol.respuesta}</p>
          <span class="text-[10px] text-gray-400 block mt-1">Por: ${sol.respondidoPor} (${formatearFecha(sol.fechaRespuesta)})</span>
        </div>
      `;
    } else {
      if (esDelDepartamento) {
        respuestaHTML = `
          <div class="space-y-1.5">
            <input type="text" id="resp-input-${sol.id}" placeholder="Escribe tu respuesta / fecha / ítem..." class="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white">
            <button onclick="window.guardarRespuestaHelpDesk('${sol.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1 rounded text-[11px] cursor-pointer">
              Responder y Resolver
            </button>
          </div>
        `;
      } else {
        respuestaHTML = `<span class="text-gray-400 italic text-[11px]">Pendiente de respuesta por el Dpto. de ${sol.destino}</span>`;
      }
    }

    tr.innerHTML = `
      <td class="p-3 border-r whitespace-nowrap text-gray-600">${formatearFecha(sol.fechaCreacion)}</td>
      <td class="p-3 border-r font-bold text-gray-800">${sol.remitenteNombre} <span class="text-[10px] text-gray-400 block">(${sol.remitenteRol})</span></td>
      <td class="p-3 border-r font-bold text-[#D61B28]">${sol.destino}</td>
      <td class="p-3 border-r text-gray-800 font-medium">${sol.pregunta}</td>
      <td class="p-3 border-r text-center whitespace-nowrap">${estadoBadge}</td>
      <td class="p-3 border-r">${respuestaHTML}</td>
      <td class="p-3 text-center">
        ${sol.estado === "Resuelto" ? '<i class="fa-solid fa-circle-check text-green-600 text-base"></i>' : '<span class="text-gray-300">—</span>'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.guardarRespuestaHelpDesk = async (id) => {
  const input = document.getElementById(`resp-input-${id}`);
  if (!input) return;
  const textoRespuesta = input.value.trim();
  if (!textoRespuesta) {
    alert("Por favor escribe una respuesta antes de guardar.");
    return;
  }

  try {
    await updateDoc(doc(db, "solicitudes_helpdesk", id), {
      respuesta: textoRespuesta,
      respondidoPor: (userData && userData.nombre) || "Usuario",
      fechaRespuesta: new Date().toISOString(),
      estado: "Resuelto"
    });
    alert("Respuesta registrada y marcada como resuelta.");
  } catch (err) {
    alert("Error al responder: " + err.message);
  }
};

// ==================== REPORTES DE ENTREGAS ====================
window.abrirReporteImpresoEntregas = () => {
  const items = entregas.filter(item => (categoriaEntregaActiva === "todas") || 
    ((item.tipo || "").toUpperCase().trim() === categoriaEntregaActiva.toUpperCase().trim()));
  
  if (items.length === 0) {
    alert("No hay registros de entregas para generar el reporte impreso.");
    return;
  }

  const contenedor = document.getElementById("contenido-impresion-entregas");
  if (!contenedor) return;

  let html = `
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse border border-gray-200 text-xs">
        <thead class="bg-gray-100 font-bold">
          <tr>
            <th class="p-2 border text-center w-12">Foto</th>
            <th class="p-2 border">Sem.</th>
            <th class="p-2 border">Fecha/Hora</th>
            <th class="p-2 border">Proyecto / Detalle</th>
            <th class="p-2 border">Artículo</th>
            <th class="p-2 border">Elemento Entregado</th>
            <th class="p-2 border">Entregado Por</th>
            <th class="p-2 border">Destino</th>
            <th class="p-2 border text-center">Estado Recepción</th>
          </tr>
        </thead>
        <tbody>
  `;

  items.forEach(it => {
    const fotoPrint = it.foto 
      ? `<img src="${it.foto}" style="width: 44px; height: 30px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd; margin: auto;">`
      : `<span style="color: #bbb;">—</span>`;

    let elementoTexto = it.tipo;
    if (it.copias) elementoTexto += ` (${it.copias} copias)`;
    if (it.notas) elementoTexto += ` - ${it.notas}`;

    html += `
      <tr class="border-b">
        <td class="p-1 border text-center">${fotoPrint}</td>
        <td class="p-2 border font-bold font-mono">${it.semana || '—'}</td>
        <td class="p-2 border whitespace-nowrap">${formatearFecha(it.fechaEntrega)}</td>
        <td class="p-2 border font-bold text-gray-800">${it.proyecto || '—'}</td>
        <td class="p-2 border font-mono">${it.articulo || '—'}</td>
        <td class="p-2 border">${elementoTexto}</td>
        <td class="p-2 border">${it.entregadoPorNombre} <span class="text-[10px] text-gray-400">(${it.entregadoPorRol})</span></td>
        <td class="p-2 border font-bold">${it.destino}</td>
        <td class="p-2 border text-center font-bold ${it.recibido ? 'text-green-600' : 'text-amber-600'}">
          ${it.recibido ? 'Recibido' : 'En Tránsito'}
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  contenedor.innerHTML = html;
  document.getElementById("modal-reporte-entregas-print")?.classList.remove("hidden");
};

window.abrirResumenTextoEntregas = () => {
  const items = entregas.filter(item => (categoriaEntregaActiva === "todas") || 
    ((item.tipo || "").toUpperCase().trim() === categoriaEntregaActiva.toUpperCase().trim()));
  
  if (items.length === 0) {
    alert("No hay entregas registradas en esta categoría para generar el resumen.");
    return;
  }

  let texto = `CONTROL DE ENTREGAS A DEPARTAMENTOS - BATA BOLIVIA\n`;
  texto += `Categoría: ${categoriaEntregaActiva.toUpperCase()}\n`;
  texto += `Fecha: ${new Date().toLocaleDateString("es-BO")}\n\n`;

  items.forEach((it, idx) => {
    let extra = it.copias ? ` (${it.copias} copias)` : '';
    texto += `${idx + 1}. [Sem: ${it.semana}] ${it.proyecto.toUpperCase()} ${it.articulo ? '| Art: ' + it.articulo : ''}\n`;
    texto += `   • Elemento: ${it.tipo}${extra}\n`;
    texto += `   • Entregado por: ${it.entregadoPorNombre} (${it.entregadoPorRol}) -> Destino: ${it.destino}\n`;
    texto += `   • Estado: ${it.recibido ? 'RECIBIDO' : 'EN TRÁNSITO'}\n\n`;
  });

  const textarea = document.getElementById("texto-entregas-output");
  if (textarea) textarea.value = texto;

  safeClick("btn-copiar-texto-entregas", () => {
    if (textarea) {
      textarea.select();
      navigator.clipboard.writeText(texto);
      alert("Texto de entregas copiado al portapapeles.");
    }
  });

  safeClick("btn-enviar-correo-entregas", () => {
    const asunto = encodeURIComponent(`Bata Bolivia - Control de Entregas (${categoriaEntregaActiva})`);
    const cuerpo = encodeURIComponent(texto);
    window.location.href = `mailto:?subject=${asunto}&body=${cuerpo}`;
  });

  safeClick("btn-enviar-wsp-entregas", () => {
    const encoded = encodeURIComponent(texto);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  });

  document.getElementById("modal-entregas-texto")?.classList.remove("hidden");
};

// Controles y Modales Base
const welcomeContainer = document.getElementById("welcome-container");
const appContainer = document.getElementById("app-container");
const modalLogin = document.getElementById("modal-login");
const modalRegister = document.getElementById("modal-register");
const modalProfile = document.getElementById("modal-profile");
const modalMinuta = document.getElementById("modal-minuta");
const modalResumen = document.getElementById("modal-resumen-reporte");
const modalTextoWsp = document.getElementById("modal-texto-wsp");
const modalNuevaEntrega = document.getElementById("modal-nueva-entrega");
const modalReporteEntregasPrint = document.getElementById("modal-reporte-entregas-print");
const modalEntregasTexto = document.getElementById("modal-entregas-texto");
const modalVisorFoto = document.getElementById("modal-visor-foto");
const modalNuevoBloqueo = document.getElementById("modal-nuevo-bloqueo");
const modalNuevaLlegada = document.getElementById("modal-nueva-llegada");
const modalReporteLlegadasPrint = document.getElementById("modal-reporte-llegadas-print");
const modalImpresionTarjetas = document.getElementById("modal-impresion-tarjetas");
const modalNewChange = document.getElementById("modal-new-change");
const modalNuevoLoteProd = document.getElementById("modal-nuevo-lote-prod");
const modalEliminarPlan = document.getElementById("modal-eliminar-plan");
const modalNuevaSolicitudHelpDesk = document.getElementById("modal-nueva-solicitud-helpdesk");

safeClick("btn-close-whatsapp-modal", () => document.getElementById("modal-whatsapp")?.classList.add("hidden"));
safeClick("btn-show-login", () => modalLogin?.classList.remove("hidden"));
safeClick("btn-show-register", () => modalRegister?.classList.remove("hidden"));
safeClick("close-login", () => modalLogin?.classList.add("hidden"));
safeClick("close-register", () => modalRegister?.classList.add("hidden"));
safeClick("close-profile", () => modalProfile?.classList.add("hidden"));
safeClick("close-minuta", () => modalMinuta?.classList.add("hidden"));
safeClick("close-modal-resumen", () => modalResumen?.classList.add("hidden"));
safeClick("close-texto-wsp", () => modalTextoWsp?.classList.add("hidden"));
safeClick("close-nueva-entrega", () => modalNuevaEntrega?.classList.add("hidden"));
safeClick("cancel-nueva-entrega", () => modalNuevaEntrega?.classList.add("hidden"));
safeClick("close-modal-entregas-print", () => modalReporteEntregasPrint?.classList.add("hidden"));
safeClick("close-modal-entregas-texto", () => modalEntregasTexto?.classList.add("hidden"));
safeClick("close-visor-foto", () => modalVisorFoto?.classList.add("hidden"));
safeClick("close-nuevo-bloqueo", () => modalNuevoBloqueo?.classList.add("hidden"));
safeClick("cancel-nuevo-bloqueo", () => modalNuevoBloqueo?.classList.add("hidden"));
safeClick("close-nueva-llegada", () => modalNuevaLlegada?.classList.add("hidden"));
safeClick("cancel-nueva-llegada", () => modalNuevaLlegada?.classList.add("hidden"));
safeClick("close-modal-llegadas-print", () => modalReporteLlegadasPrint?.classList.add("hidden"));
safeClick("close-modal-tarjetas", () => modalImpresionTarjetas?.classList.add("hidden"));
safeClick("modal-btn-close", () => modalNewChange?.classList.add("hidden"));
safeClick("modal-btn-cancel", () => modalNewChange?.classList.add("hidden"));
safeClick("close-nuevo-lote-prod", () => modalNuevoLoteProd?.classList.add("hidden"));
safeClick("cancel-nuevo-lote-prod", () => modalNuevoLoteProd?.classList.add("hidden"));
safeClick("close-eliminar-plan", () => modalEliminarPlan?.classList.add("hidden"));
safeClick("cancel-eliminar-plan", () => modalEliminarPlan?.classList.add("hidden"));
safeClick("close-nueva-solicitud-helpdesk", () => modalNuevaSolicitudHelpDesk?.classList.add("hidden"));
safeClick("cancel-nueva-solicitud-helpdesk", () => modalNuevaSolicitudHelpDesk?.classList.add("hidden"));

safeClick("btn-reporte-entregas-pdf", window.abrirReporteImpresoEntregas);
safeClick("btn-reporte-entregas-texto", window.abrirResumenTextoEntregas);

window.verFotoGrande = (src, titulo) => {
  if (!src) return;
  const img = document.getElementById("visor-foto-img");
  const tit = document.getElementById("visor-foto-titulo");
  if (img) img.src = src;
  if (tit) tit.textContent = titulo || "Visualización de Prototipo / Guía";
  modalVisorFoto?.classList.remove("hidden");
};

safeClick("btn-forgot-pass", () => {
  const email = document.getElementById("login-email")?.value.trim();
  if (!email) {
    alert("Por favor ingresa tu correo en la casilla antes de solicitar el reseteo.");
    return;
  }
  const msg = encodeURIComponent(
    `🔐 *SOLICITUD DE RESTABLECIMIENTO DE CONTRASEÑA*\n` +
    `*Sistema de Cambios - Bata Bolivia*\n\n` +
    `👤 *Correo del Solicitante:* ${email}\n\n` +
    `_Hola Daniel, solicito generar el correo de restablecimiento de contraseña en Firebase Console para este usuario._`
  );
  window.open(`https://wa.me/${SUPER_ADMIN_WHATSAPP}?text=${msg}`, "_blank");
});

// Perfil
safeClick("btn-edit-profile", () => {
  if (!userData) return;
  const pName = document.getElementById("prof-name");
  const pPhone = document.getElementById("prof-phone");
  if (pName) pName.value = userData.nombre || "";
  if (pPhone) pPhone.value = userData.celular || "";
  modalProfile?.classList.remove("hidden");
});

const formProfile = document.getElementById("form-update-profile");
if (formProfile) {
  formProfile.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById("prof-name").value.trim();
    const phone = document.getElementById("prof-phone").value.trim();
    const photoFile = document.getElementById("prof-photo").files[0];

    const updateData = { nombre: name, celular: phone };
    if (photoFile) {
      updateData.foto = await comprimirImagen(photoFile, 200, 0.7);
    }

    try {
      await updateDoc(doc(db, "usuarios", currentUser.uid), updateData);
      userData = { ...userData, ...updateData };
      actualizarHeaderUsuario();
      modalProfile?.classList.add("hidden");
      alert("Perfil actualizado correctamente.");
    } catch (err) {
      alert("Error: " + err.message);
    }
  };
}

// Registro
const formRegister = document.getElementById("form-register");
if (formRegister) {
  formRegister.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById("reg-name").value.trim();
    const phone = document.getElementById("reg-phone").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const role = document.getElementById("reg-role").value;
    const pass = document.getElementById("reg-pass").value;
    const photoFile = document.getElementById("reg-photo").files[0];
    const photoBase64 = photoFile ? await comprimirImagen(photoFile, 200, 0.7) : null;

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await setDoc(doc(db, "usuarios", cred.user.uid), {
        nombre: name,
        celular: phone,
        email: email,
        rol: role,
        rolesMultiples: [role],
        foto: photoBase64,
        fechaCreacion: serverTimestamp()
      });
      modalRegister?.classList.add("hidden");
    } catch (err) {
      alert("Error de registro: " + err.message);
    }
  };
}

// Login
const formLogin = document.getElementById("form-login");
if (formLogin) {
  formLogin.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const pass = document.getElementById("login-pass").value;
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      modalLogin?.classList.add("hidden");
    } catch (err) {
      alert("Credenciales incorrectas o usuario no registrado.");
    }
  };
}

safeClick("btn-logout", () => {
  signOut(auth).then(() => {
    window.location.reload();
  });
});

function actualizarHeaderUsuario() {
  const esAdmin = esSuperAdmin();
  const uName = document.getElementById("user-display-name");
  const uRole = document.getElementById("user-display-role");
  if (uName) uName.textContent = (userData && userData.nombre) || (currentUser && currentUser.email) || "Usuario";
  
  let rolTexto = esAdmin ? "SUPER ADMIN" : ((userData && userData.rol) || "Usuario");
  if (userData && userData.rolesMultiples && userData.rolesMultiples.length > 1) {
    rolTexto = userData.rolesMultiples.join(" + ");
  }
  if (uRole) uRole.textContent = rolTexto;
  
  const avatarImg = document.getElementById("user-display-avatar");
  const avatarIcon = document.getElementById("user-display-avatar-icon");
  if (userData && userData.foto) {
    if (avatarImg) { avatarImg.src = userData.foto; avatarImg.classList.remove("hidden"); }
    if (avatarIcon) avatarIcon.classList.add("hidden");
  } else {
    if (avatarImg) avatarImg.classList.add("hidden");
    if (avatarIcon) avatarIcon.classList.remove("hidden");
  }

  const menuAdmin = document.getElementById("menu-btn-usuarios");
  if (menuAdmin) {
    if (esAdmin) {
      menuAdmin.classList.remove("hidden");
    } else {
      menuAdmin.classList.add("hidden");
      if (!viewUsuarios?.classList.contains("hidden")) {
        activarVistaCambios();
      }
    }
  }

  const rolActual = (userData && userData.rol) || "";
  const esJefe = rolActual === "Desarrollo de producto - Jefe" || rolActual.includes("Jefe") || (userData && userData.rolesMultiples && userData.rolesMultiples.some(r => r.includes("Jefe")));
  const btnMinutaHeader = document.getElementById("btn-open-minuta-header");
  if (btnMinutaHeader) {
    if (esJefe || esAdmin) {
      btnMinutaHeader.classList.remove("hidden");
    } else {
      btnMinutaHeader.classList.add("hidden");
    }
  }

  aplicarPermisosRol();
}

// Control de visibilidad por rol en el menú lateral
function aplicarPermisosRol() {
  if (esSuperAdmin()) {
    document.querySelectorAll("aside .sidebar-section-item").forEach(el => el.classList.remove("hidden"));
    document.getElementById("menu-btn-usuarios")?.classList.remove("hidden");
    return;
  }

  const bloqueEntregas = document.getElementById("bloque-menu-entregas");
  const bloqueProd = document.getElementById("bloque-menu-produccion");
  const bloqueCompras = document.getElementById("bloque-menu-compras");
  const bloqueTarjetas = document.getElementById("bloque-menu-tarjetas");
  const bloqueSolicitudes = document.getElementById("bloque-menu-solicitudes");

  if (bloqueEntregas) bloqueEntregas.classList.add("hidden");
  if (bloqueProd) bloqueProd.classList.add("hidden");
  if (bloqueCompras) bloqueCompras.classList.add("hidden");
  if (bloqueTarjetas) bloqueTarjetas.classList.add("hidden");
  if (bloqueSolicitudes) bloqueSolicitudes.classList.remove("hidden");

  const tieneAcceso = (area) => usuarioTieneAccesoArea(area);

  if (tieneAcceso("Desarrollo")) {
    if (bloqueEntregas) bloqueEntregas.classList.remove("hidden");
    if (bloqueTarjetas) bloqueTarjetas.classList.remove("hidden");
  } else if (tieneAcceso("Compras")) {
    if (bloqueCompras) bloqueCompras.classList.remove("hidden");
    if (bloqueEntregas) bloqueEntregas.classList.remove("hidden");
  } else if (tieneAcceso("Planeamiento")) {
    if (bloqueProd) bloqueProd.classList.remove("hidden");
    if (bloqueEntregas) bloqueEntregas.classList.remove("hidden");
  } else if (tieneAcceso("Producción")) {
    if (bloqueProd) bloqueProd.classList.remove("hidden");
    if (bloqueEntregas) bloqueEntregas.classList.remove("hidden");
    if (bloqueCompras) bloqueCompras.classList.remove("hidden");
  } else if (tieneAcceso("Costos")) {
    if (bloqueEntregas) bloqueEntregas.classList.remove("hidden");
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    try {
      const docSnap = await getDoc(doc(db, "usuarios", user.uid));
      if (docSnap.exists()) {
        userData = docSnap.data();
      } else {
        userData = {
          nombre: esSuperAdmin() ? "Super Admin" : (user.email.split("@")[0]),
          email: user.email,
          rol: esSuperAdmin() ? "Super Admin" : "Desarrollo de producto",
          rolesMultiples: ["Desarrollo de producto"],
          celular: ""
        };
      }
    } catch (e) {
      console.error("Error al cargar perfil:", e);
      userData = {
        nombre: esSuperAdmin() ? "Super Admin" : (user.email.split("@")[0]),
        email: user.email,
        rol: esSuperAdmin() ? "Super Admin" : "Desarrollo de producto",
        rolesMultiples: ["Desarrollo de producto"],
        celular: ""
      };
    }
    actualizarHeaderUsuario();
    welcomeContainer?.classList.add("hidden");
    appContainer?.classList.remove("hidden");
    inicializarSemanas01a52();
    activarVistaCambios();
    escucharCambios();
    escucharEntregas();
    escucharProduccion();
    escucharHelpDesk();
    escucharBitacoraBorrados();
    escucharProcurement();
  } else {
    currentUser = null;
    userData = null;
    welcomeContainer?.classList.remove("hidden");
    appContainer?.classList.add("hidden");
  }
});

// Navegación
const viewCambios = document.getElementById("view-cambios");
const viewEntregas = document.getElementById("view-entregas");
const viewProduccion = document.getElementById("view-produccion");
const viewProcurement = document.getElementById("view-procurement");
const viewTarjetas = document.getElementById("view-tarjetas");
const viewUsuarios = document.getElementById("view-usuarios");
const viewSolicitudes = document.getElementById("view-solicitudes");

const menuBtnCambios = document.getElementById("menu-btn-cambios");
const menuBtnEntregasTodas = document.getElementById("menu-btn-entregas-todas");
const menuBtnProduccion = document.getElementById("menu-btn-produccion");
const menuBtnProcurement = document.getElementById("menu-btn-procurement");
const menuBtnTarjetas = document.getElementById("menu-btn-tarjetas");
const menuBtnUsuarios = document.getElementById("menu-btn-usuarios");
const menuBtnSolicitudes = document.getElementById("menu-btn-solicitudes");

const CLASE_INACTIVO_PRINCIPAL = "sidebar-btn w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-bold text-xs text-white hover:bg-white/15 transition cursor-pointer";
const CLASE_INACTIVO_SUB = "sidebar-btn sub-ent-btn w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white/90 hover:bg-white/15 hover:text-white transition cursor-pointer pl-5";
const CLASE_ACTIVO_PASTILLA = "sidebar-btn w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-black text-xs bg-white text-[#D61B28] shadow-md transition cursor-pointer scale-[1.02]";
const CLASE_ACTIVO_SUB_PASTILLA = "sidebar-btn sub-ent-btn w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-black bg-white text-[#D61B28] shadow-md transition cursor-pointer pl-5 scale-[1.02]";

function resetMenuStyles() {
  [menuBtnCambios, menuBtnEntregasTodas, menuBtnProduccion, menuBtnProcurement, menuBtnTarjetas, menuBtnUsuarios, menuBtnSolicitudes].forEach(b => {
    if (b) b.className = CLASE_INACTIVO_PRINCIPAL;
  });

  document.querySelectorAll(".sub-ent-btn").forEach(b => {
    b.className = CLASE_INACTIVO_SUB;
  });

  viewCambios?.classList.add("hidden");
  viewEntregas?.classList.add("hidden");
  viewProduccion?.classList.add("hidden");
  viewProcurement?.classList.add("hidden");
  viewTarjetas?.classList.add("hidden");
  viewUsuarios?.classList.add("hidden");
  viewSolicitudes?.classList.add("hidden");
}

function activarVistaCambios() {
  resetMenuStyles();
  viewCambios?.classList.remove("hidden");
  if (menuBtnCambios) menuBtnCambios.className = CLASE_ACTIVO_PASTILLA;
  renderTabla();
}

safeClick("menu-btn-cambios", activarVistaCambios);
safeClick("menu-btn-entregas-todas", () => window.cambiarSubmenuEntrega("todas"));
safeClick("menu-btn-produccion", () => {
  resetMenuStyles();
  viewProduccion?.classList.remove("hidden");
  if (menuBtnProduccion) menuBtnProduccion.className = CLASE_ACTIVO_PASTILLA;
  renderProduccionView();
});
safeClick("menu-btn-procurement", () => {
  resetMenuStyles();
  viewProcurement?.classList.remove("hidden");
  if (menuBtnProcurement) menuBtnProcurement.className = CLASE_ACTIVO_PASTILLA;
  renderProcurementView();
});
safeClick("menu-btn-tarjetas", () => {
  resetMenuStyles();
  viewTarjetas?.classList.remove("hidden");
  if (menuBtnTarjetas) menuBtnTarjetas.className = CLASE_ACTIVO_PASTILLA;
  initModuloTarjetas();
});
safeClick("menu-btn-solicitudes", () => {
  resetMenuStyles();
  viewSolicitudes?.classList.remove("hidden");
  if (menuBtnSolicitudes) menuBtnSolicitudes.className = CLASE_ACTIVO_PASTILLA;
  renderHelpDeskView();
});
safeClick("menu-btn-usuarios", () => {
  if (!esSuperAdmin()) {
    alert("Acceso denegado.");
    return;
  }
  resetMenuStyles();
  viewUsuarios?.classList.remove("hidden");
  if (menuBtnUsuarios) menuBtnUsuarios.className = CLASE_ACTIVO_PASTILLA;
  cargarPanelSuperAdmin();
});

// Submenús entregas
safeClick("sub-btn-MATERIALES", () => window.cambiarSubmenuEntrega("MATERIALES"));
safeClick("sub-btn-GUIA", () => window.cambiarSubmenuEntrega("GUÍA DE PRODUCCIÓN"));
safeClick("sub-btn-CORTE", () => window.cambiarSubmenuEntrega("CORTE"));
safeClick("sub-btn-MUESTRA", () => window.cambiarSubmenuEntrega("MUESTRA DEFINITIVA"));
safeClick("sub-btn-DESBASTE", () => window.cambiarSubmenuEntrega("HOJA DE DESBASTE"));
safeClick("sub-btn-TIZADORES", () => window.cambiarSubmenuEntrega("TIZADORES"));

window.cambiarSubmenuEntrega = (categoria) => {
  resetMenuStyles();
  viewEntregas?.classList.remove("hidden");
  categoriaEntregaActiva = categoria;

  const titulo = document.getElementById("entregas-vista-titulo");
  const subtitulo = document.getElementById("entregas-vista-subtitulo");
  const thFoto = document.getElementById("th-ent-foto");
  const thArt = document.getElementById("th-ent-art");
  const labelThProy = document.getElementById("label-th-proy");
  const btnTextEntrega = document.getElementById("btn-text-nueva-entrega");

  if (categoria === "todas") {
    if (menuBtnEntregasTodas) menuBtnEntregasTodas.className = CLASE_ACTIVO_PASTILLA;
    if (titulo) titulo.innerHTML = `<i class="fa-solid fa-truck-ramp-box"></i><span>Control de Entregas (Todas)</span>`;
    if (subtitulo) subtitulo.textContent = "Visualizador consolidado de todas las entregas físicas a departamentos.";
    if (thFoto) thFoto.classList.remove("hidden");
    if (thArt) thArt.classList.remove("hidden");
    if (labelThProy) labelThProy.textContent = "Proyecto";
    if (btnTextEntrega) btnTextEntrega.textContent = "Registrar Entrega";
  } else if (categoria === "MATERIALES") {
    const btn = document.getElementById("sub-btn-MATERIALES");
    if (btn) btn.className = CLASE_ACTIVO_SUB_PASTILLA;
    if (titulo) titulo.innerHTML = `<i class="fa-solid fa-boxes-packing text-blue-600"></i><span>Entrega de Materiales</span>`;
    if (subtitulo) subtitulo.textContent = "Insumos y materiales (Semana y Nombre). Destinos: Desarrollo de producto, Producción.";
    if (thFoto) thFoto.classList.add("hidden");
    if (thArt) thArt.classList.add("hidden");
    if (labelThProy) labelThProy.textContent = "Nombre del Material";
    if (btnTextEntrega) btnTextEntrega.textContent = "Registrar Material";
  } else if (categoria === "GUÍA DE PRODUCCIÓN") {
    const btn = document.getElementById("sub-btn-GUIA");
    if (btn) btn.className = CLASE_ACTIVO_SUB_PASTILLA;
    if (titulo) titulo.innerHTML = `<i class="fa-solid fa-file-contract text-emerald-600"></i><span>Entrega de Guías de Producción</span>`;
    if (subtitulo) subtitulo.textContent = "Entrega física de guías de producción. Destino exclusivo: Costos.";
    if (thFoto) thFoto.classList.remove("hidden");
    if (thArt) thArt.classList.remove("hidden");
    if (labelThProy) labelThProy.textContent = "Proyecto";
    if (btnTextEntrega) btnTextEntrega.textContent = "Registrar Guía";
  } else if (categoria === "CORTE") {
    const btn = document.getElementById("sub-btn-CORTE");
    if (btn) btn.className = CLASE_ACTIVO_SUB_PASTILLA;
    if (titulo) titulo.innerHTML = `<i class="fa-solid fa-scissors text-amber-600"></i><span>Entrega de Cortes</span>`;
    if (subtitulo) subtitulo.textContent = "Entrega de cortes. Destinos: Costos, Producción.";
    if (thFoto) thFoto.classList.remove("hidden");
    if (thArt) thArt.classList.remove("hidden");
    if (labelThProy) labelThProy.textContent = "Proyecto";
    if (btnTextEntrega) btnTextEntrega.textContent = "Registrar Corte";
  } else if (categoria === "MUESTRA DEFINITIVA") {
    const btn = document.getElementById("sub-btn-MUESTRA");
    if (btn) btn.className = CLASE_ACTIVO_SUB_PASTILLA;
    if (titulo) titulo.innerHTML = `<i class="fa-solid fa-shoe-prints text-purple-600"></i><span>Entrega de Muestras Definitivas</span>`;
    if (subtitulo) subtitulo.textContent = "Muestras definitivas con foto. Destinos: Producción, Planeamiento, Retail.";
    if (thFoto) thFoto.classList.remove("hidden");
    if (thArt) thArt.classList.remove("hidden");
    if (labelThProy) labelThProy.textContent = "Proyecto";
    if (btnTextEntrega) btnTextEntrega.textContent = "Registrar Muestra";
  } else if (categoria === "HOJA DE DESBASTE") {
    const btn = document.getElementById("sub-btn-DESBASTE");
    if (btn) btn.className = CLASE_ACTIVO_SUB_PASTILLA;
    if (titulo) titulo.innerHTML = `<i class="fa-solid fa-layer-group text-cyan-600"></i><span>Entrega de Hoja de Desbaste</span>`;
    if (subtitulo) subtitulo.textContent = "Entrega de especificaciones de desbaste. Destinos: Costos, Producción.";
    if (thFoto) thFoto.classList.remove("hidden");
    if (thArt) thArt.classList.remove("hidden");
    if (labelThProy) labelThProy.textContent = "Proyecto";
    if (btnTextEntrega) btnTextEntrega.textContent = "Registrar Desbaste";
  } else if (categoria === "TIZADORES") {
    const btn = document.getElementById("sub-btn-TIZADORES");
    if (btn) btn.className = CLASE_ACTIVO_SUB_PASTILLA;
    if (titulo) titulo.innerHTML = `<i class="fa-solid fa-copy text-rose-600"></i><span>Entrega de Tizadores (Copias)</span>`;
    if (subtitulo) subtitulo.textContent = "Entrega de tizadores a Producción con especificación de número de copias.";
    if (thFoto) thFoto.classList.add("hidden");
    if (thArt) thArt.classList.remove("hidden");
    if (labelThProy) labelThProy.textContent = "Proyecto";
    if (btnTextEntrega) btnTextEntrega.textContent = "Registrar Tizadores";
  }

  renderTablaEntregas();
};
