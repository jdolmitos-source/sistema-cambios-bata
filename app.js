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

// Filtros
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

// ==================== EXPOSICIÓN GLOBAL ABSOLUTA (WINDOW) ====================
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

// ==================== COMPROBACIÓN DE USUARIO Y DOM LOAD ====================
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
safeClick("close-nuevo-lote-prod", () => modalNuevoLoteProd?.classList.add("hidden"));
safeClick("cancel-nuevo-lote-prod", () => modalNuevoLoteProd?.classList.add("hidden"));
safeClick("modal-btn-close", () => modalNewChange?.classList.add("hidden"));
safeClick("modal-btn-cancel", () => modalNewChange?.classList.add("hidden"));

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

// Navegación
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

safeClick("menu-btn-cambios", activarVistaCambios);

safeClick("menu-btn-informe", () => {
  resetMenuStyles();
  viewInforme?.classList.remove("hidden");
  if (menuBtnInforme) menuBtnInforme.className = CLASE_ACTIVO_PASTILLA;
  
  colFiltroSemanaInforme = "";
  colFiltroProyectoInforme = "";
  const inSem = document.getElementById("col-filter-semana-informe");
  const inProy = document.getElementById("col-filter-proyecto-informe");
  if (inSem) inSem.value = "";
  if (inProy) inProy.value = "";
  
  renderInformeView();
});

safeClick("menu-btn-entregas-todas", () => {
  window.cambiarSubmenuEntrega("todas");
});

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
