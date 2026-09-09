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

let categoriaEntregaActiva = "todas";

// Filtros globales
let colFiltroSemanaInforme = "";
let colFiltroProyectoInforme = "";
let colFiltroSemanaEntregas = "";
let colFiltroProyectoEntregas = "";
let colFiltroItemLlegada = "";
let colFiltroNombreLlegada = "";
let colFiltroSemanaLlegada = "";

// Memoria Tarjetas
let croquisTarjetaBase64 = null;
let plantillaCorteTarjetaBase64 = null;

const safeClick = (id, fn) => {
  const el = document.getElementById(id);
  if (el) el.onclick = fn;
};

// ==================== FUNCIONES DE APOYO Y HEADER ====================
function actualizarHeaderUsuario() {
  const esAdmin = esSuperAdmin();
  const uName = document.getElementById("user-display-name");
  const uRole = document.getElementById("user-display-role");
  if (uName) uName.textContent = (userData && userData.nombre) || (currentUser && currentUser.email) || "Usuario";
  if (uRole) uRole.textContent = esAdmin ? "SUPER ADMIN" : ((userData && userData.rol) || "Usuario");
  
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

  const esJefe = userData && (userData.rol === "Desarrollo de producto - Jefe" || userData.rol === "Jefe de Producción");
  const btnMinutaHeader = document.getElementById("btn-open-minuta-header");
  if (btnMinutaHeader) {
    if (esJefe || esAdmin) {
      btnMinutaHeader.classList.remove("hidden");
    } else {
      btnMinutaHeader.classList.add("hidden");
    }
  }

  const secTarjetas = document.getElementById("section-menu-tarjetas");
  if (secTarjetas) {
    if (esDesarrollo() || esAdmin) {
      secTarjetas.classList.remove("hidden");
    } else {
      secTarjetas.classList.add("hidden");
    }
  }
}

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

function esJefeProduccion() {
  if (esSuperAdmin()) return true;
  return userData && (userData.rol === "Jefe de Producción" || userData.rol === "Producción");
}

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
      const val = `SEM-${numStr}`;
      sel.innerHTML += `<option value="${val}">Semana ${numStr}</option>`;
    }
    if (valorActual) sel.value = valorActual;
  });
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
      listContainer.innerHTML = `<p class="p-3 text-center text-gray-400 text-xs">No hay contactos registrados con el rol de ${rolFiltro || 'ese departamento'}.</p>`;
    }

    modalWA.classList.remove("hidden");
  } catch (error) {
    console.error("Error al abrir WhatsApp:", error);
  }
}

// ==================== EXPOSICIÓN GLOBAL ABSOLUTA (WINDOW) ====================
window.abrirModalCambio = () => {
  document.getElementById("modal-new-change")?.classList.remove("hidden");
};

window.abrirModalMinuta = () => {
  document.getElementById("modal-minuta")?.classList.remove("hidden");
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

window.generarTextoNotificacionBata = () => {
  const seleccionadosIds = Array.from(document.querySelectorAll(".chk-articulo-informe:checked")).map(c => c.value);
  if (seleccionadosIds.length === 0) {
    alert("Selecciona al menos un artículo para generar la notificación.");
    return;
  }

  const items = solicitudes.filter(s => seleccionadosIds.includes(s.id));
  const semanaTitulo = colFiltroSemanaInforme ? colFiltroSemanaInforme : (items[0]?.semana || "GENERAL");

  let texto = `CAMBIOS REALIZADOS PARA SEM: ${semanaTitulo}\n\n`;
  texto += `Saludos Estimados, Todos los cambios en guías para el congelamiento de la semana mencionada filas arriba han sido realizados y se puede continuar con el proceso.\n\n`;
  texto += `Detalle de Artículos Afectados:\n`;

  items.forEach(it => {
    texto += `Proyecto: ${it.proyecto.toUpperCase()}, Artículo: ${it.articulo}\n`;
  });

  const textarea = document.getElementById("texto-wsp-output");
  if (textarea) textarea.value = texto;

  safeClick("btn-copiar-texto-wsp", () => {
    if (textarea) {
      textarea.select();
      navigator.clipboard.writeText(texto);
      alert("Texto copiado al portapapeles.");
    }
  });

  safeClick("btn-enviar-correo-informe", () => {
    const asunto = encodeURIComponent(`Bata Bolivia - Cambios Realizados para Semana ${semanaTitulo}`);
    const cuerpo = encodeURIComponent(texto);
    window.location.href = `mailto:?subject=${asunto}&body=${cuerpo}`;
  });

  safeClick("btn-enviar-wsp-directo", () => {
    const encoded = encodeURIComponent(texto);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  });

  modalTextoWsp?.classList.remove("hidden");
};

window.generarModalInformeResumen = () => {
  const seleccionadosIds = Array.from(document.querySelectorAll(".chk-articulo-informe:checked")).map(c => c.value);
  if (seleccionadosIds.length === 0) {
    alert("Selecciona al menos un artículo para generar el informe PDF.");
    return;
  }

  const items = solicitudes.filter(s => seleccionadosIds.includes(s.id));
  const contenedor = document.getElementById("reporte-resumen-contenido");
  if (!contenedor) return;

  let html = `
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse border border-gray-200 text-xs">
        <thead class="bg-gray-100 font-bold">
          <tr>
            <th class="p-2 border text-center w-12">Foto</th>
            <th class="p-2 border">Semana</th>
            <th class="p-2 border">Fecha Solicitud</th>
            <th class="p-2 border">Solicitante</th>
            <th class="p-2 border">Proyecto</th>
            <th class="p-2 border">Artículo</th>
            <th class="p-2 border">Descripción de Cambios</th>
            <th class="p-2 border text-center">Estado</th>
            <th class="p-2 border text-center">Fecha Realizado</th>
            <th class="p-2 border text-center">Validación Costos</th>
          </tr>
        </thead>
        <tbody>
  `;

  items.forEach(it => {
    const fotoPrint = it.foto 
      ? `<img src="${it.foto}" style="width: 44px; height: 30px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd; margin: auto;">`
      : `<span style="color: #bbb;">—</span>`;

    html += `
      <tr class="border-b">
        <td class="p-1 border text-center">${fotoPrint}</td>
        <td class="p-2 border font-bold font-mono">${it.semana || '—'}</td>
        <td class="p-2 border whitespace-nowrap">${formatearFecha(it.fechaCreacion)}</td>
        <td class="p-2 border whitespace-nowrap font-medium">${it.solicitanteNombre} <span class="text-[10px] text-gray-400">(${it.solicitanteRol})</span></td>
        <td class="p-2 border font-bold text-gray-800">${it.proyecto}</td>
        <td class="p-2 border font-mono">${it.articulo}</td>
        <td class="p-2 border text-gray-700">${it.boxCambio}</td>
        <td class="p-2 border text-center font-bold ${it.estado === 'Realizado' ? 'text-green-600' : (it.estado === 'Retrasado' ? 'text-red-600' : 'text-orange-600')}">${it.estado}</td>
        <td class="p-2 border text-center whitespace-nowrap">${formatearFecha(it.fechaRealizado)}</td>
        <td class="p-2 border text-center font-bold ${it.validadoCostos ? 'text-green-600' : 'text-gray-400'}">${it.validadoCostos ? 'Validado' : 'Pendiente'}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  contenedor.innerHTML = html;
  modalResumen?.classList.remove("hidden");
};

window.abrirReporteImpresoLlegadas = () => {
  if (llegadasMateriales.length === 0) {
    alert("No hay registros de llegadas para generar el informe.");
    return;
  }

  const contenedor = document.getElementById("contenido-impresion-llegadas");
  if (!contenedor) return;

  let html = `
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse border border-gray-200 text-xs">
        <thead class="bg-gray-100 font-bold">
          <tr>
            <th class="p-2 border">Item</th>
            <th class="p-2 border">Nombre del Material</th>
            <th class="p-2 border">Sem. Solicitud</th>
            <th class="p-2 border">Cantidad</th>
            <th class="p-2 border">Llegada Estimada</th>
            <th class="p-2 border">Llegada Real</th>
            <th class="p-2 border text-center">Estado / Validación</th>
          </tr>
        </thead>
        <tbody>
  `;

  llegadasMateriales.forEach(it => {
    html += `
      <tr class="border-b">
        <td class="p-2 border font-mono font-bold">${it.item}</td>
        <td class="p-2 border font-bold">${it.nombre}</td>
        <td class="p-2 border font-mono">${it.semana}</td>
        <td class="p-2 border font-black">${it.cantidad}</td>
        <td class="p-2 border">${it.fechaEstimada || '—'}</td>
        <td class="p-2 border font-bold ${it.fechaReal ? 'text-green-700' : 'text-amber-600'}">${it.fechaReal || 'En Tránsito'}</td>
        <td class="p-2 border text-center font-bold ${it.validadoCompras ? 'text-green-600' : 'text-gray-400'}">
          ${it.validadoCompras ? 'Validado Compras' : 'Pendiente'}
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
  document.getElementById("modal-reporte-llegadas-print")?.classList.remove("hidden");
};

window.actualizarEstadoLote = async (id, nuevoEstado) => {
  await updateDoc(doc(db, "produccion_lotes", id), {
    estado: nuevoEstado,
    fechaActualizacion: new Date().toISOString()
  });
};

window.guardarParesLote = async (id) => {
  const input = document.getElementById(`in-pares-${id}`);
  if (!input) return;
  const nuevosPares = parseInt(input.value) || 0;
  await updateDoc(doc(db, "produccion_lotes", id), {
    pares: nuevosPares
  });
  alert("Cantidad de pares actualizada.");
};

window.eliminarLoteProduccion = async (id) => {
  if (confirm("¿Eliminar este lote de producción?")) {
    await deleteDoc(doc(db, "produccion_lotes", id));
  }
};

window.confirmarRecepcionEntrega = async (id, tipo, proyecto) => {
  if (confirm(`¿Confirmar que has recibido físicamente "${tipo}" (${proyecto})?`)) {
    await updateDoc(doc(db, "entregas_departamentos", id), {
      recibido: true,
      fechaRecepcion: new Date().toISOString(),
      recibidoPorNombre: (userData && userData.nombre) || "Usuario"
    });
  }
};

window.guardarCambioEstado = async (id, proyecto, articulo, semana) => {
  const select = document.getElementById(`sel-estado-${id}`);
  if (!select) return;
  const nuevoEstado = select.value;

  const updatePayload = { estado: nuevoEstado };
  if (nuevoEstado === "Realizado") {
    updatePayload.fechaRealizado = new Date().toISOString();
  } else {
    updatePayload.fechaRealizado = null;
  }

  await updateDoc(doc(db, "solicitudes_cambios", id), updatePayload);

  if (nuevoEstado === "Realizado") {
    abrirModalWhatsApp({
      titulo: "Proyecto Realizado",
      subtitulo: "Enviar alerta a los usuarios de Costos para su validación:",
      mensajeTexto: `👟 *PROYECTO REALIZADO - REQUERIMIENTO DE COSTOS*\n\n📅 *Semana:* ${semana}\n📌 *Proyecto:* ${proyecto}\n🔢 *Artículo:* ${articulo}\n✅ *Estado:* Realizado por Desarrollo de Producto (${(userData && userData.nombre) || 'Usuario'})\n\n_Por favor ingresar al sistema para validar los costos asociados._`,
      rolFiltro: "Costos"
    });
  } else {
    alert("Estado guardado correctamente.");
  }
};

window.confirmarValidacionCostos = async (id, proyecto, articulo, checkboxElem) => {
  const confirma = confirm(`¿Estás seguro de validar los costos del proyecto "${proyecto}"? Una vez confirmado quedará bloqueado.`);
  if (!confirma) {
    checkboxElem.checked = false;
    return;
  }

  await updateDoc(doc(db, "solicitudes_cambios", id), {
    validadoCostos: true,
    fechaValidacionCostos: new Date().toISOString(),
    validadorCostosNombre: (userData && userData.nombre) || "Costos"
  });

  abrirModalWhatsApp({
    titulo: "Costos Validados",
    subtitulo: "Enviar notificación al equipo de Calidad:",
    mensajeTexto: `📋 *VALIDACIÓN DE COSTOS COMPLETADA - ALERTA CALIDAD*\n\n📌 *Proyecto:* ${proyecto}\n🔢 *Artículo:* ${articulo}\n💰 *Costos:* Validados por ${(userData && userData.nombre) || 'Costos'} (Costos)\n\n_El proyecto cuenta con validación técnica y económica lista para producción._`,
    rolFiltro: "Calidad"
  });
};

window.desbloquearValidacionCostos = async (id) => {
  if (confirm("¿Desbloquear validación de costos? (Acción de Super Admin)")) {
    await updateDoc(doc(db, "solicitudes_cambios", id), { validadoCostos: false });
  }
};

window.confirmarEnteradoAlmacen = async (id) => {
  await updateDoc(doc(db, "procurement_bloqueos", id), {
    notificadoAlmacen: true,
    fechaEnterado: new Date().toISOString(),
    usuarioAlmacen: (userData && userData.nombre) || "Almacén"
  });
};

window.eliminarBloqueoMaterial = async (id, nombre) => {
  if (!esComprasAdmin()) {
    alert("Solo Compras Admin o Super Admin pueden borrar bloqueos.");
    return;
  }
  if (confirm(`¿Eliminar la restricción del material "${nombre}"?`)) {
    await deleteDoc(doc(db, "procurement_bloqueos", id));
  }
};

window.validarLlegadaCompras = async (id) => {
  if (confirm("¿Confirmar y validar la llegada física de este material a fábrica?")) {
    await updateDoc(doc(db, "procurement_llegadas", id), {
      validadoCompras: true,
      fechaValidacion: new Date().toISOString(),
      validadorCompras: (userData && userData.nombre) || "Compras"
    });
  }
};

window.eliminarLlegadaMaterial = async (id, nombre) => {
  if (!esComprasAdmin()) {
    alert("Solo Compras Admin o Super Admin pueden borrar llegadas.");
    return;
  }
  if (confirm(`¿Eliminar el registro de llegada de "${nombre}"?`)) {
    await deleteDoc(doc(db, "procurement_llegadas", id));
  }
};

window.cambiarRolUsuario = async (userId, nuevoRol) => {
  await updateDoc(doc(db, "usuarios", userId), { rol: nuevoRol });
  alert("Rol asignado correctamente.");
};

window.eliminarUsuarioDoc = async (id, nombre) => {
  if (confirm(`¿Eliminar al usuario ${nombre}?`)) {
    await deleteDoc(doc(db, "usuarios", id));
    cargarPanelSuperAdmin();
  }
};

window.eliminarSolicitudProyecto = async (id, proyecto) => {
  if (confirm(`¿Eliminar el registro "${proyecto}" permanentemente de la base de datos?`)) {
    await deleteDoc(doc(db, "solicitudes_cambios", id));
    cargarPanelSuperAdmin();
  }
};

window.eliminarEntregaDoc = async (id, tipo, proyecto) => {
  if (confirm(`¿Eliminar la entrega "${tipo}" del proyecto/material "${proyecto}" permanentemente?`)) {
    await deleteDoc(doc(db, "entregas_departamentos", id));
    cargarPanelSuperAdmin();
  }
};

// ==================== INICIALIZACIÓN DE DATOS Y EVENTOS DOM ====================
function inicializarEventosDOM() {
  const welcomeContainer = document.getElementById("welcome-container");
  const appContainer = document.getElementById("app-container");
  const modalLogin = document.getElementById("modal-login");
  const modalRegister = document.getElementById("modal-register");
  const modalProfile = document.getElementById("modal-profile");

  safeClick("btn-close-whatsapp-modal", () => document.getElementById("modal-whatsapp")?.classList.add("hidden"));
  safeClick("btn-show-login", () => modalLogin?.classList.remove("hidden"));
  safeClick("btn-show-register", () => modalRegister?.classList.remove("hidden"));
  safeClick("close-login", () => modalLogin?.classList.add("hidden"));
  safeClick("close-register", () => modalRegister?.classList.add("hidden"));
  safeClick("close-profile", () => modalProfile?.classList.add("hidden"));

  safeClick("btn-reporte-entregas-pdf", window.abrirReporteImpresoEntregas);
  safeClick("btn-reporte-entregas-texto", window.abrirResumenTextoEntregas);

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
          foto: photoBase64,
          fechaCreacion: serverTimestamp()
        });
        modalRegister?.classList.add("hidden");
      } catch (err) {
        alert("Error de registro: " + err.message);
      }
    };
  }

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

  // Filtros de producción
  const prodFilterSemana = document.getElementById("prod-filter-semana");
  const prodFilterProyecto = document.getElementById("prod-filter-proyecto");
  const prodFilterLinea = document.getElementById("prod-filter-linea");
  const prodFilterEstado = document.getElementById("prod-filter-estado");
  const btnLimpiarFiltrosProd = document.getElementById("btn-limpiar-filtros-prod");

  if (prodFilterSemana) prodFilterSemana.onchange = renderProduccionView;
  if (prodFilterProyecto) prodFilterProyecto.oninput = renderProduccionView;
  if (prodFilterLinea) prodFilterLinea.onchange = renderProduccionView;
  if (prodFilterEstado) prodFilterEstado.onchange = renderProduccionView;

  if (btnLimpiarFiltrosProd) {
    btnLimpiarFiltrosProd.onclick = () => {
      if (prodFilterSemana) prodFilterSemana.value = "";
      if (prodFilterProyecto) prodFilterProyecto.value = "";
      if (prodFilterLinea) prodFilterLinea.value = "";
      if (prodFilterEstado) prodFilterEstado.value = "";
      renderProduccionView();
    };
  }

  const formLoteProd = document.getElementById("form-nuevo-lote-prod");
  if (formLoteProd) {
    formLoteProd.onsubmit = async (e) => {
      e.preventDefault();
      const semana = document.getElementById("lote-semana").value;
      const dia = document.getElementById("lote-dia").value;
      const linea = document.getElementById("lote-linea").value;
      const plan = document.getElementById("lote-plan").value.trim();
      const proyecto = document.getElementById("lote-proyecto").value.trim().toUpperCase();
      const articulo = document.getElementById("lote-articulo").value.trim();
      const pares = parseInt(document.getElementById("lote-pares").value) || 0;
      const estado = document.getElementById("lote-estado").value;
      const alerta = document.getElementById("lote-alerta").value.trim();

      try {
        await addDoc(collection(db, "produccion_lotes"), {
          semana,
          dia,
          linea,
          plan,
          proyecto,
          articulo,
          pares,
          estado,
          alerta,
          fechaRegistro: new Date().toISOString(),
          registradoPor: (userData && userData.nombre) || (currentUser && currentUser.email) || "Usuario",
          timestamp: serverTimestamp()
        });

        formLoteProd.reset();
        document.getElementById("modal-nuevo-lote-prod")?.classList.add("hidden");
      } catch (err) {
        alert("Error al registrar lote: " + err.message);
      }
    };
  }

  // Navegación lateral
  safeClick("menu-btn-cambios", activarVistaCambios);
  safeClick("menu-btn-informe", () => {
    resetMenuStyles();
    viewInforme?.classList.remove("hidden");
    if (menuBtnInforme) menuBtnInforme.className = CLASE_ACTIVO_PASTILLA;
    colFiltroSemanaInforme = "";
    colFiltroProyectoInforme = "";
    renderInformeView();
  });
  safeClick("menu-btn-entregas-todas", () => window.cambiarSubmenuEntrega("todas"));
  safeClick("menu-btn-produccion-dash", () => {
    resetMenuStyles();
    viewProduccionDash?.classList.remove("hidden");
    if (menuBtnProduccionDash) menuBtnProduccionDash.className = CLASE_ACTIVO_PASTILLA;
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
  safeClick("menu-btn-usuarios", () => {
    if (!esSuperAdmin()) { alert("Acceso denegado."); return; }
    resetMenuStyles();
    viewUsuarios?.classList.remove("hidden");
    if (menuBtnUsuarios) menuBtnUsuarios.className = CLASE_ACTIVO_PASTILLA;
    cargarPanelSuperAdmin();
  });

  safeClick("sub-btn-MATERIALES", () => window.cambiarSubmenuEntrega("MATERIALES"));
  safeClick("sub-btn-GUIA", () => window.cambiarSubmenuEntrega("GUÍA DE PRODUCCIÓN"));
  safeClick("sub-btn-CORTE", () => window.cambiarSubmenuEntrega("CORTE"));
  safeClick("sub-btn-MUESTRA", () => window.cambiarSubmenuEntrega("MUESTRA DEFINITIVA"));
  safeClick("sub-btn-DESBASTE", () => window.cambiarSubmenuEntrega("HOJA DE DESBASTE"));
  safeClick("sub-btn-TIZADORES", () => window.cambiarSubmenuEntrega("TIZADORES"));
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
          celular: ""
        };
      }
    } catch (e) {
      console.error("Error al cargar perfil:", e);
      userData = {
        nombre: esSuperAdmin() ? "Super Admin" : (user.email.split("@")[0]),
        email: user.email,
        rol: esSuperAdmin() ? "Super Admin" : "Desarrollo de producto",
        celular: ""
      };
    }
    actualizarHeaderUsuario();
    inicializarSemanas01a52();
    inicializarEventosDOM();
    welcomeContainer?.classList.add("hidden");
    appContainer?.classList.remove("hidden");
    activarVistaCambios();
    escucharCambios();
    escucharEntregas();
    escucharProcurement();
    escucharProduccion();
  } else {
    currentUser = null;
    userData = null;
    welcomeContainer?.classList.remove("hidden");
    appContainer?.classList.add("hidden");
  }
});

// Navegación references
const viewCambios = document.getElementById("view-cambios");
const viewInforme = document.getElementById("view-informe");
const viewEntregas = document.getElementById("view-entregas");
const viewProduccionDash = document.getElementById("view-produccion-dash");
const viewProcurement = document.getElementById("view-procurement");
const viewTarjetas = document.getElementById("view-tarjetas");
const viewUsuarios = document.getElementById("view-usuarios");

const menuBtnCambios = document.getElementById("menu-btn-cambios");
const menuBtnInforme = document.getElementById("menu-btn-informe");
const menuBtnEntregasTodas = document.getElementById("menu-btn-entregas-todas");
const menuBtnProduccionDash = document.getElementById("menu-btn-produccion-dash");
const menuBtnProcurement = document.getElementById("menu-btn-procurement");
const menuBtnTarjetas = document.getElementById("menu-btn-tarjetas");
const menuBtnUsuarios = document.getElementById("menu-btn-usuarios");

const CLASE_INACTIVO_PRINCIPAL = "sidebar-btn w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-bold text-xs text-white hover:bg-white/15 transition cursor-pointer";
const CLASE_INACTIVO_SUB = "sidebar-btn sub-ent-btn w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white/90 hover:bg-white/15 hover:text-white transition cursor-pointer pl-5";
const CLASE_ACTIVO_PASTILLA = "sidebar-btn w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-black text-xs bg-white text-[#D61B28] shadow-md transition cursor-pointer scale-[1.02]";
const CLASE_ACTIVO_SUB_PASTILLA = "sidebar-btn sub-ent-btn w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-black bg-white text-[#D61B28] shadow-md transition cursor-pointer pl-5 scale-[1.02]";

function resetMenuStyles() {
  [menuBtnCambios, menuBtnInforme, menuBtnEntregasTodas, menuBtnProduccionDash, menuBtnProcurement, menuBtnTarjetas, menuBtnUsuarios].forEach(b => {
    if (b) b.className = CLASE_INACTIVO_PRINCIPAL;
  });

  document.querySelectorAll(".sub-ent-btn").forEach(b => {
    b.className = CLASE_INACTIVO_SUB;
  });

  viewCambios?.classList.add("hidden");
  viewInforme?.classList.add("hidden");
  viewEntregas?.classList.add("hidden");
  viewProduccionDash?.classList.add("hidden");
  viewProcurement?.classList.add("hidden");
  viewTarjetas?.classList.add("hidden");
  viewUsuarios?.classList.add("hidden");
}

function activarVistaCambios() {
  resetMenuStyles();
  viewCambios?.classList.remove("hidden");
  if (menuBtnCambios) menuBtnCambios.className = CLASE_ACTIVO_PASTILLA;
}

// ==================== LÓGICA PRODUCCIÓN RENDERIZADO MATRIZ ====================
function escucharProduccion() {
  const q = collection(db, "produccion_lotes");
  onSnapshot(q, (snapshot) => {
    lotesProduccion = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    lotesProduccion.sort((a, b) => (b.fechaRegistro || "").localeCompare(a.fechaRegistro || ""));
    renderProduccionView();
  }, (err) => console.log("Aviso Firestore Producción:", err.message));
}

function renderProduccionView() {
  const table = document.getElementById("tabla-matriz-produccion");
  const empty = document.getElementById("produccion-empty-state");
  if (!table) return;

  const fSem = prodFilterSemana ? prodFilterSemana.value : "";
  const fProy = prodFilterProyecto ? prodFilterProyecto.value.trim().toLowerCase() : "";
  const fLin = prodFilterLinea ? prodFilterLinea.value : "";
  const fEst = prodFilterEstado ? prodFilterEstado.value : "";

  let lotesFiltrados = lotesProduccion.filter(l => {
    const semMatch = !fSem || (l.semana || "") === fSem;
    const proyMatch = !fProy || (l.proyecto || "").toLowerCase().includes(fProy) || (l.articulo || "").toLowerCase().includes(fProy) || (l.plan || "").toLowerCase().includes(fProy);
    const linMatch = !fLin || (l.linea || "") === fLin;
    const estMatch = !fEst || (l.estado || "") === fEst;
    return semMatch && proyMatch && linMatch && estMatch;
  });

  let paresCortado = 0;
  let paresAparado = 0;
  let paresArmado = 0;
  let paresInyeccion = 0;

  lotesFiltrados.forEach(lote => {
    const pares = parseInt(lote.pares) || 0;
    if (lote.estado === "CORTADO") paresCortado += pares;
    else if (lote.estado === "APARADO") paresAparado += pares;
    else if (lote.estado === "ARMADO") paresArmado += pares;
    else if (lote.estado === "INYECCIÓN") paresInyeccion += pares;
  });

  const totalPares = paresCortado + paresAparado + paresArmado + paresInyeccion;
  const pctCortado = totalPares > 0 ? Math.round((paresCortado / totalPares) * 100) : 0;
  const pctAparado = totalPares > 0 ? Math.round((paresAparado / totalPares) * 100) : 0;
  const pctArmado = totalPares > 0 ? Math.round((paresArmado / totalPares) * 100) : 0;
  const pctInyeccion = totalPares > 0 ? Math.round((paresInyeccion / totalPares) * 100) : 0;

  const elTot = document.getElementById("prod-total-pares-kpi");
  if (elTot) elTot.textContent = `${totalPares.toLocaleString()} Pares Totales`;

  const setKpiBar = (idKpi, idPct, idBar, valPares, valPct) => {
    const k = document.getElementById(idKpi);
    const p = document.getElementById(idPct);
    const b = document.getElementById(idBar);
    if (k) k.textContent = `${valPares.toLocaleString()} pares`;
    if (p) p.textContent = `${valPct}%`;
    if (b) b.style.width = `${valPct}%`;
  };

  setKpiBar("kpi-pares-cortado", "pct-pares-cortado", "bar-pares-cortado", paresCortado, pctCortado);
  setKpiBar("kpi-pares-aparado", "pct-pares-aparado", "bar-pares-aparado", paresAparado, pctAparado);
  setKpiBar("kpi-pares-armado", "pct-pares-armado", "bar-pares-armado", paresArmado, pctArmado);
  setKpiBar("kpi-pares-inyeccion", "pct-pares-inyeccion", "bar-pares-inyeccion", paresInyeccion, pctInyeccion);

  if (lotesFiltrados.length === 0) {
    empty?.classList.remove("hidden");
    table.innerHTML = "";
    return;
  }
  empty?.classList.add("hidden");

  let html = `
    <thead>
      <tr class="bg-gray-100 border-b border-gray-300 text-center font-bold text-gray-700 text-[11px]">
        <th class="p-2.5 border-r border-gray-300 w-20">DEPTOS</th>
  `;

  DIAS_SEMANA.forEach(dia => {
    html += `
      <th colspan="4" class="p-2 border-r border-gray-300 bg-gray-50">${dia}
        <div class="grid grid-cols-4 font-normal text-[9px] text-gray-500 pt-1 border-t border-gray-200 mt-1">
          <span class="border-r">PLAN</span>
          <span class="border-r">ART</span>
          <span class="border-r">PROY</span>
          <span>PRS</span>
        </div>
      </th>
    `;
  });

  html += `
        <th class="p-2.5 bg-gray-200 w-24">TOTAL PPTO</th>
      </tr>
    </thead>
    <tbody>
  `;

  let granTotalPares = 0;
  const lineasAProcesar = fLin ? [fLin] : DEPARTAMENTOS_LINEAS;

  lineasAProcesar.forEach(linea => {
    let totalLinea = 0;
    let filasHTML = "";

    for (let r = 0; r < 6; r++) {
      filasHTML += `<tr class="border-b border-gray-200 text-center hover:bg-slate-50">`;
      if (r === 0) {
        filasHTML += `<td rowspan="6" class="p-2 border-r border-gray-300 font-black text-sm bg-gray-50 text-gray-900 align-middle">${linea}</td>`;
      }

      DIAS_SEMANA.forEach(dia => {
        const lotesCelda = lotesFiltrados.filter(l => String(l.linea) === String(linea) && String(l.dia).toUpperCase() === dia);
        const lote = lotesCelda[r];

        if (lote) {
          totalLinea += (parseInt(lote.pares) || 0);
          const esAlerta = lote.alerta ? `title="Alerta: ${lote.alerta}" class="bg-amber-100 text-amber-900 font-bold relative group cursor-pointer"` : '';
          const badgeAlerta = lote.alerta ? `<span class="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white text-[9px] px-2 py-0.5 rounded shadow-lg hidden group-hover:block z-20 whitespace-nowrap">${lote.alerta}</span>` : '';
          
          filasHTML += `
            <td class="p-1.5 border-r border-gray-200 font-mono text-[11px]">${lote.plan || '—'}</td>
            <td class="p-1.5 border-r border-gray-200 font-mono text-[10px]">${lote.articulo || '—'}</td>
            <td class="p-1.5 border-r border-gray-200 font-bold text-[11px] truncate max-w-[70px]" ${esAlerta}>${lote.proyecto || '—'}${badgeAlerta}</td>
            <td class="p-1.5 border-r border-gray-300 font-black text-cyan-900 text-[11px] bg-cyan-50/40">${lote.pares ? parseInt(lote.pares).toLocaleString() : '—'}</td>
          `;
        } else {
          filasHTML += `
            <td class="p-1.5 border-r border-gray-200 text-gray-300">—</td>
            <td class="p-1.5 border-r border-gray-200 text-gray-300">—</td>
            <td class="p-1.5 border-r border-gray-200 text-gray-300">—</td>
            <td class="p-1.5 border-r border-gray-300 text-gray-300 bg-gray-50/20">—</td>
          `;
        }
      });

      if (r === 0) {
        filasHTML += `<td rowspan="6" class="p-2 font-black text-sm bg-gray-100 text-[#D61B28] align-middle" id="total-linea-${linea}">0</td>`;
      }
      filasHTML += `</tr>`;
    }

    html += filasHTML;
    granTotalPares += totalLinea;
  });

  html += `
    </tbody>
    <tfoot>
      <tr class="bg-gray-200 font-black text-xs text-gray-900 border-t-2 border-gray-400">
        <td colspan="21" class="p-3 text-right">GRAN TOTAL PLANTA 330:</td>
        <td class="p-3 text-center text-[#D61B28] text-sm">${granTotalPares.toLocaleString()}</td>
      </tr>
    </tfoot>
  `;

  table.innerHTML = html;

  lineasAProcesar.forEach(linea => {
    const totCell = document.getElementById(`total-linea-${linea}`);
    if (totCell) {
      const sum = lotesFiltrados.filter(l => String(l.linea) === String(linea)).reduce((acc, curr) => acc + (parseInt(curr.pares) || 0), 0);
      totCell.textContent = sum.toLocaleString();
    }
  });
}
