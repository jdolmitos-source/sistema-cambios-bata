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
  query, 
  orderBy, 
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

// ⚠️ CONFIGURACIÓN SUPER ADMIN
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

let categoriaEntregaActiva = "todas";

// Filtros de Informe
let colFiltroSemanaInforme = "";
let colFiltroProyectoInforme = "";

// Filtros de Entregas
let colFiltroSemanaEntregas = "";
let colFiltroProyectoEntregas = "";

// Filtros de Llegadas
let colFiltroItemLlegada = "";
let colFiltroNombreLlegada = "";
let colFiltroSemanaLlegada = "";

// Compresor de imágenes a tamaño liviano (~30 KB)
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

// ==================== MODAL DE WHATSAPP ====================
async function abrirModalWhatsApp({ titulo, subtitulo, mensajeTexto, rolFiltro = null }) {
  const modalWA = document.getElementById("modal-whatsapp");
  const listContainer = document.getElementById("whatsapp-contacts-list");
  document.getElementById("wa-modal-title").textContent = titulo;
  document.getElementById("wa-modal-desc").textContent = subtitulo;
  listContainer.innerHTML = "";

  const encodedMsg = encodeURIComponent(mensajeTexto);

  try {
    const usuariosSnap = await getDocs(collection(db, "usuarios"));
    let count = 0;

    usuariosSnap.forEach(d => {
      const u = d.data();
      const coincideRol = !rolFiltro || u.rol === rolFiltro || (rolFiltro === "Desarrollo de producto - Técnico" && (u.rol || "").includes("Técnico"));

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
    console.error(error);
  }
}

document.getElementById("btn-close-whatsapp-modal").onclick = () => {
  document.getElementById("modal-whatsapp").classList.add("hidden");
};

// Modales y Controles
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

document.getElementById("btn-show-login").onclick = () => modalLogin.classList.remove("hidden");
document.getElementById("btn-show-register").onclick = () => modalRegister.classList.remove("hidden");
document.getElementById("close-login").onclick = () => modalLogin.classList.add("hidden");
document.getElementById("close-register").onclick = () => modalRegister.classList.add("hidden");
document.getElementById("close-profile").onclick = () => modalProfile.classList.add("hidden");
if (document.getElementById("close-minuta")) {
  document.getElementById("close-minuta").onclick = () => modalMinuta.classList.add("hidden");
}
if (document.getElementById("close-modal-resumen")) {
  document.getElementById("close-modal-resumen").onclick = () => modalResumen.classList.add("hidden");
}
if (document.getElementById("close-texto-wsp")) {
  document.getElementById("close-texto-wsp").onclick = () => modalTextoWsp.classList.add("hidden");
}
if (document.getElementById("close-nueva-entrega")) {
  document.getElementById("close-nueva-entrega").onclick = () => modalNuevaEntrega.classList.add("hidden");
}
if (document.getElementById("cancel-nueva-entrega")) {
  document.getElementById("cancel-nueva-entrega").onclick = () => modalNuevaEntrega.classList.add("hidden");
}
if (document.getElementById("close-modal-entregas-print")) {
  document.getElementById("close-modal-entregas-print").onclick = () => modalReporteEntregasPrint.classList.add("hidden");
}
if (document.getElementById("close-modal-entregas-texto")) {
  document.getElementById("close-modal-entregas-texto").onclick = () => modalEntregasTexto.classList.add("hidden");
}
if (document.getElementById("close-visor-foto")) {
  document.getElementById("close-visor-foto").onclick = () => modalVisorFoto.classList.add("hidden");
}

if (document.getElementById("close-nuevo-bloqueo")) {
  document.getElementById("close-nuevo-bloqueo").onclick = () => modalNuevoBloqueo.classList.add("hidden");
}
if (document.getElementById("cancel-nuevo-bloqueo")) {
  document.getElementById("cancel-nuevo-bloqueo").onclick = () => modalNuevoBloqueo.classList.add("hidden");
}
if (document.getElementById("close-nueva-llegada")) {
  document.getElementById("close-nueva-llegada").onclick = () => modalNuevaLlegada.classList.add("hidden");
}
if (document.getElementById("cancel-nueva-llegada")) {
  document.getElementById("cancel-nueva-llegada").onclick = () => modalNuevaLlegada.classList.add("hidden");
}
if (document.getElementById("close-modal-llegadas-print")) {
  document.getElementById("close-modal-llegadas-print").onclick = () => modalReporteLlegadasPrint.classList.add("hidden");
}

window.verFotoGrande = (src, titulo) => {
  if (!src) return;
  document.getElementById("visor-foto-img").src = src;
  document.getElementById("visor-foto-titulo").textContent = titulo || "Visualización de Prototipo / Guía";
  modalVisorFoto.classList.remove("hidden");
};

// Reset de Contraseña
document.getElementById("btn-forgot-pass").onclick = () => {
  const email = document.getElementById("login-email").value.trim();
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
};

// Perfil
document.getElementById("btn-edit-profile").onclick = () => {
  if (!userData) return;
  document.getElementById("prof-name").value = userData.nombre || "";
  document.getElementById("prof-phone").value = userData.celular || "";
  modalProfile.classList.remove("hidden");
};

document.getElementById("form-update-profile").onsubmit = async (e) => {
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
    modalProfile.classList.add("hidden");
    alert("Perfil actualizado correctamente.");
  } catch (err) {
    alert("Error: " + err.message);
  }
};

// Registro
document.getElementById("form-register").onsubmit = async (e) => {
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
    modalRegister.classList.add("hidden");
  } catch (err) {
    alert("Error de registro: " + err.message);
  }
};

// Login
document.getElementById("form-login").onsubmit = async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const pass = document.getElementById("login-pass").value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    modalLogin.classList.add("hidden");
  } catch (err) {
    alert("Credenciales incorrectas o usuario no registrado.");
  }
};

document.getElementById("btn-logout").onclick = () => {
  signOut(auth).then(() => {
    window.location.reload();
  });
};

function actualizarHeaderUsuario() {
  const esAdmin = esSuperAdmin();
  document.getElementById("user-display-name").textContent = (userData && userData.nombre) || currentUser.email;
  document.getElementById("user-display-role").textContent = esAdmin ? "SUPER ADMIN" : ((userData && userData.rol) || "Usuario");
  
  const avatarImg = document.getElementById("user-display-avatar");
  const avatarIcon = document.getElementById("user-display-avatar-icon");
  if (userData && userData.foto) {
    avatarImg.src = userData.foto;
    avatarImg.classList.remove("hidden");
    avatarIcon.classList.add("hidden");
  } else {
    avatarImg.classList.add("hidden");
    avatarIcon.classList.remove("hidden");
  }

  const menuAdmin = document.getElementById("menu-btn-usuarios");
  if (esAdmin) {
    menuAdmin.classList.remove("hidden");
  } else {
    menuAdmin.classList.add("hidden");
    if (!viewUsuarios.classList.contains("hidden")) {
      activarVistaCambios();
    }
  }

  const esJefe = userData && userData.rol === "Desarrollo de producto - Jefe";
  const btnMinutaHeader = document.getElementById("btn-open-minuta-header");
  if (btnMinutaHeader) {
    if (esJefe || esAdmin) {
      btnMinutaHeader.classList.remove("hidden");
    } else {
      btnMinutaHeader.classList.add("hidden");
    }
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
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
    actualizarHeaderUsuario();
    welcomeContainer.classList.add("hidden");
    appContainer.classList.remove("hidden");
    activarVistaCambios();
    escucharCambios();
    escucharEntregas();
    escucharProcurement();
  } else {
    currentUser = null;
    userData = null;
    welcomeContainer.classList.remove("hidden");
    appContainer.classList.add("hidden");
  }
});

// Navegación Principal y Resaltado Lateral
const viewCambios = document.getElementById("view-cambios");
const viewInforme = document.getElementById("view-informe");
const viewEntregas = document.getElementById("view-entregas");
const viewProcurement = document.getElementById("view-procurement");
const viewUsuarios = document.getElementById("view-usuarios");

const menuBtnCambios = document.getElementById("menu-btn-cambios");
const menuBtnInforme = document.getElementById("menu-btn-informe");
const menuBtnEntregasTodas = document.getElementById("menu-btn-entregas-todas");
const menuBtnProcurement = document.getElementById("menu-btn-procurement");
const menuBtnUsuarios = document.getElementById("menu-btn-usuarios");

const CLASE_INACTIVO_PRINCIPAL = "sidebar-btn w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-bold text-xs text-white hover:bg-white/15 transition cursor-pointer";
const CLASE_INACTIVO_SUB = "sidebar-btn sub-ent-btn w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white/90 hover:bg-white/15 hover:text-white transition cursor-pointer pl-5";

const CLASE_ACTIVO_PASTILLA = "sidebar-btn w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-black text-xs bg-white text-[#D61B28] shadow-md transition cursor-pointer scale-[1.02]";
const CLASE_ACTIVO_SUB_PASTILLA = "sidebar-btn sub-ent-btn w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-black bg-white text-[#D61B28] shadow-md transition cursor-pointer pl-5 scale-[1.02]";

function resetMenuStyles() {
  [menuBtnCambios, menuBtnInforme, menuBtnEntregasTodas, menuBtnProcurement, menuBtnUsuarios].forEach(b => {
    if (b) b.className = CLASE_INACTIVO_PRINCIPAL;
  });

  document.querySelectorAll(".sub-ent-btn").forEach(b => {
    b.className = CLASE_INACTIVO_SUB;
  });

  viewCambios.classList.add("hidden");
  viewInforme.classList.add("hidden");
  viewEntregas.classList.add("hidden");
  viewProcurement.classList.add("hidden");
  viewUsuarios.classList.add("hidden");
}

function activarVistaCambios() {
  resetMenuStyles();
  viewCambios.classList.remove("hidden");
  menuBtnCambios.className = CLASE_ACTIVO_PASTILLA;
}

menuBtnCambios.onclick = activarVistaCambios;

menuBtnInforme.onclick = () => {
  resetMenuStyles();
  viewInforme.classList.remove("hidden");
  menuBtnInforme.className = CLASE_ACTIVO_PASTILLA;
  renderInformeView();
};

menuBtnProcurement.onclick = () => {
  resetMenuStyles();
  viewProcurement.classList.remove("hidden");
  menuBtnProcurement.className = CLASE_ACTIVO_PASTILLA;
  renderProcurementView();
};

menuBtnUsuarios.onclick = () => {
  if (!esSuperAdmin()) {
    alert("Acceso denegado: solo el usuario jd.olmitos@gmail.com puede acceder al panel de administración.");
    return;
  }
  resetMenuStyles();
  viewUsuarios.classList.remove("hidden");
  menuBtnUsuarios.className = CLASE_ACTIVO_PASTILLA;
  cargarPanelSuperAdmin();
};

if (document.getElementById("btn-open-minuta-header")) {
  document.getElementById("btn-open-minuta-header").onclick = () => modalMinuta.classList.remove("hidden");
}

// Submenús de Entregas
window.cambiarSubmenuEntrega = (categoria) => {
  resetMenuStyles();
  viewEntregas.classList.remove("hidden");
  categoriaEntregaActiva = categoria;

  const titulo = document.getElementById("entregas-vista-titulo");
  const subtitulo = document.getElementById("entregas-vista-subtitulo");
  const thFoto = document.getElementById("th-ent-foto");
  const thArt = document.getElementById("th-ent-art");
  const labelThProy = document.getElementById("label-th-proy");
  const btnTextEntrega = document.getElementById("btn-text-nueva-entrega");

  if (categoria === "todas") {
    menuBtnEntregasTodas.className = CLASE_ACTIVO_PASTILLA;
    titulo.innerHTML = `<i class="fa-solid fa-truck-ramp-box"></i><span>Control de Entregas (Todas)</span>`;
    subtitulo.textContent = "Visualizador consolidado de todas las entregas físicas a departamentos.";
    if (thFoto) thFoto.classList.remove("hidden");
    if (thArt) thArt.classList.remove("hidden");
    if (labelThProy) labelThProy.textContent = "Proyecto";
    if (btnTextEntrega) btnTextEntrega.textContent = "Registrar Entrega";
  } else if (categoria === "MATERIALES") {
    const btn = document.getElementById("sub-btn-MATERIALES");
    if (btn) btn.className = CLASE_ACTIVO_SUB_PASTILLA;
    titulo.innerHTML = `<i class="fa-solid fa-boxes-packing text-blue-600"></i><span>Entrega de Materiales</span>`;
    subtitulo.textContent = "Insumos y materiales (Semana y Nombre). Destinos: Desarrollo de producto, Producción.";
    if (thFoto) thFoto.classList.add("hidden");
    if (thArt) thArt.classList.add("hidden");
    if (labelThProy) labelThProy.textContent = "Nombre del Material";
    if (btnTextEntrega) btnTextEntrega.textContent = "Registrar Material";
  } else if (categoria === "GUÍA DE PRODUCCIÓN") {
    const btn = document.getElementById("sub-btn-GUIA");
    if (btn) btn.className = CLASE_ACTIVO_SUB_PASTILLA;
    titulo.innerHTML = `<i class="fa-solid fa-file-contract text-emerald-600"></i><span>Entrega de Guías de Producción</span>`;
    subtitulo.textContent = "Entrega física de guías de producción. Destino exclusivo: Costos.";
    if (thFoto) thFoto.classList.remove("hidden");
    if (thArt) thArt.classList.remove("hidden");
    if (labelThProy) labelThProy.textContent = "Proyecto";
    if (btnTextEntrega) btnTextEntrega.textContent = "Registrar Guía";
  } else if (categoria === "CORTE") {
    const btn = document.getElementById("sub-btn-CORTE");
    if (btn) btn.className = CLASE_ACTIVO_SUB_PASTILLA;
    titulo.innerHTML = `<i class="fa-solid fa-scissors text-amber-600"></i><span>Entrega de Cortes</span>`;
    subtitulo.textContent = "Entrega de cortes. Destinos: Costos, Producción.";
    if (thFoto) thFoto.classList.remove("hidden");
    if (thArt) thArt.classList.remove("hidden");
    if (labelThProy) labelThProy.textContent = "Proyecto";
    if (btnTextEntrega) btnTextEntrega.textContent = "Registrar Corte";
  } else if (categoria === "MUESTRA DEFINITIVA") {
    const btn = document.getElementById("sub-btn-MUESTRA");
    if (btn) btn.className = CLASE_ACTIVO_SUB_PASTILLA;
    titulo.innerHTML = `<i class="fa-solid fa-shoe-prints text-purple-600"></i><span>Entrega de Muestras Definitivas</span>`;
    subtitulo.textContent = "Muestras definitivas con foto. Destinos: Producción, Planeamiento, Retail (con opción múltiple).";
    if (thFoto) thFoto.classList.remove("hidden");
    if (thArt) thArt.classList.remove("hidden");
    if (labelThProy) labelThProy.textContent = "Proyecto";
    if (btnTextEntrega) btnTextEntrega.textContent = "Registrar Muestra";
  } else if (categoria === "HOJA DE DESBASTE") {
    const btn = document.getElementById("sub-btn-DESBASTE");
    if (btn) btn.className = CLASE_ACTIVO_SUB_PASTILLA;
    titulo.innerHTML = `<i class="fa-solid fa-layer-group text-cyan-600"></i><span>Entrega de Hoja de Desbaste</span>`;
    subtitulo.textContent = "Entrega de especificaciones de desbaste. Destinos: Costos, Producción.";
    if (thFoto) thFoto.classList.remove("hidden");
    if (thArt) thArt.classList.remove("hidden");
    if (labelThProy) labelThProy.textContent = "Proyecto";
    if (btnTextEntrega) btnTextEntrega.textContent = "Registrar Desbaste";
  } else if (categoria === "TIZADORES") {
    const btn = document.getElementById("sub-btn-TIZADORES");
    if (btn) btn.className = CLASE_ACTIVO_SUB_PASTILLA;
    titulo.innerHTML = `<i class="fa-solid fa-copy text-rose-600"></i><span>Entrega de Tizadores (Copias)</span>`;
    subtitulo.textContent = "Entrega de tizadores a Producción con especificación de número de copias.";
    if (thFoto) thFoto.classList.add("hidden");
    if (thArt) thArt.classList.remove("hidden");
    if (labelThProy) labelThProy.textContent = "Proyecto";
    if (btnTextEntrega) btnTextEntrega.textContent = "Registrar Tizadores";
  }

  renderTablaEntregas();
};

// ==================== INFORMES CON 5 MINI-KPIS ====================
function renderInformeView() {
  actualizarInformePorSemana();

  const colSem = document.getElementById("col-filter-semana-informe");
  const colProy = document.getElementById("col-filter-proyecto-informe");

  if (colSem) {
    colSem.oninput = (e) => {
      colFiltroSemanaInforme = e.target.value.trim().toLowerCase();
      actualizarInformePorSemana();
    };
  }

  if (colProy) {
    colProy.oninput = (e) => {
      colFiltroProyectoInforme = e.target.value.trim().toLowerCase();
      actualizarInformePorSemana();
    };
  }

  document.getElementById("chk-toggle-all-semana").onchange = (e) => {
    const chks = document.querySelectorAll(".chk-articulo-informe");
    chks.forEach(c => c.checked = e.target.checked);
    actualizarConteoSeleccionados();
  };

  document.getElementById("btn-generar-texto-wsp").onclick = generarTextoNotificacionBata;
  document.getElementById("btn-generar-informe-resumen").onclick = generarModalInformeResumen;
}

function actualizarInformePorSemana() {
  let articulosFiltrados = solicitudes.filter(item => {
    const semStr = (item.semana || "").toString().toLowerCase().trim();
    const proyStr = (item.proyecto || "").toString().toLowerCase().trim();
    const coincideSem = !colFiltroSemanaInforme || semStr.includes(colFiltroSemanaInforme);
    const coincideProy = !colFiltroProyectoInforme || proyStr.includes(colFiltroProyectoInforme);
    return coincideSem && coincideProy;
  });

  articulosFiltrados.sort((a, b) => (a.semana || "").localeCompare(b.semana || "", undefined, { numeric: true }));

  const total = articulosFiltrados.length;
  const retrasados = articulosFiltrados.filter(s => s.estado === "Retrasado").length;
  const enProceso = articulosFiltrados.filter(s => s.estado === "En proceso").length;
  const realizados = articulosFiltrados.filter(s => s.estado === "Realizado").length;
  const validadosCostos = articulosFiltrados.filter(s => s.validadoCostos).length;

  document.getElementById("kpi-sem-total").textContent = total;
  document.getElementById("kpi-sem-retrasados").textContent = retrasados;
  document.getElementById("kpi-sem-proceso").textContent = enProceso;
  document.getElementById("kpi-sem-realizados").textContent = realizados;
  document.getElementById("kpi-sem-costos").textContent = `${validadosCostos} de ${total}`;

  const badgeContainer = document.getElementById("badge-congelamiento-container");
  if (total === 0) {
    badgeContainer.innerHTML = `<span class="bg-gray-100 text-gray-500 font-bold text-[11px] px-3 py-1 rounded-full border border-gray-200">Sin artículos coincidentes</span>`;
  } else if (realizados === total && validadosCostos === total) {
    badgeContainer.innerHTML = `
      <span class="bg-green-100 text-green-800 font-bold text-[11px] px-3.5 py-1.5 rounded-full border border-green-300 inline-flex items-center space-x-1.5 shadow-sm">
        <i class="fa-solid fa-circle-check text-green-600"></i>
        <span>Listo para Congelamiento (100% Realizado y Validado en Costos)</span>
      </span>
    `;
  } else {
    const pendientes = total - validadosCostos;
    badgeContainer.innerHTML = `
      <span class="bg-amber-50 text-amber-800 font-bold text-[11px] px-3.5 py-1.5 rounded-full border border-amber-200 inline-flex items-center space-x-1.5">
        <i class="fa-solid fa-clock text-amber-600"></i>
        <span>${pendientes} artículo(s) pendientes por validar en Costos</span>
      </span>
    `;
  }

  const tbody = document.getElementById("table-informe-articulos-body");
  tbody.innerHTML = "";

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-gray-400 italic">No hay artículos que coincidan con la búsqueda.</td></tr>`;
    actualizarConteoSeleccionados();
    return;
  }

  articulosFiltrados.forEach(item => {
    const tr = document.createElement("tr");
    tr.className = item.esMinuta 
      ? "bg-amber-50/70 hover:bg-amber-100/70 border-b border-amber-200" 
      : "hover:bg-gray-50/70 border-b border-gray-100";

    const badgeMinuta = item.esMinuta ? `<span class="bg-amber-500 text-white font-bold text-[9px] px-1.5 py-0.2 rounded mr-1">PILOTO</span>` : '';

    const fotoHTML = item.foto 
      ? `<img src="${item.foto}" onclick="window.verFotoGrande('${item.foto}', '${item.proyecto} - ${item.articulo}')" class="w-10 h-7 object-cover rounded border border-gray-200 shadow-xs cursor-pointer hover:opacity-80 transition mx-auto" title="Click para ampliar">`
      : `<div class="w-10 h-7 rounded border border-dashed border-gray-200 flex items-center justify-center text-gray-300 text-[10px] mx-auto"><i class="fa-regular fa-image"></i></div>`;

    tr.innerHTML = `
      <td class="p-2.5 text-center">
        <input type="checkbox" value="${item.id}" checked class="chk-articulo-informe h-4 w-4 accent-[#D61B28] cursor-pointer">
      </td>
      <td class="p-2 border-r border-gray-100 text-center">${fotoHTML}</td>
      <td class="p-2.5 font-bold text-gray-700 font-mono">${item.semana}</td>
      <td class="p-2.5 font-bold text-gray-800">${badgeMinuta}${item.proyecto}</td>
      <td class="p-2.5 font-mono text-gray-700">${item.articulo}</td>
      <td class="p-2.5 text-gray-600 max-w-xs truncate leading-relaxed" title="${item.boxCambio}">${item.boxCambio}</td>
      <td class="p-2.5 text-center">
        <span class="px-2 py-0.5 rounded font-bold text-[10px] ${item.estado === 'Realizado' ? 'bg-green-50 text-green-700 border border-green-200' : (item.estado === 'Retrasado' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-orange-50 text-orange-700 border border-orange-200')}">${item.estado}</span>
      </td>
      <td class="p-2.5 text-center font-bold text-[11px]">
        ${item.validadoCostos ? '<span class="text-green-600"><i class="fa-solid fa-check"></i> Validado</span>' : '<span class="text-gray-300">Pendiente</span>'}
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".chk-articulo-informe").forEach(chk => {
    chk.onchange = actualizarConteoSeleccionados;
  });

  actualizarConteoSeleccionados();
}

function actualizarConteoSeleccionados() {
  const total = document.querySelectorAll(".chk-articulo-informe").length;
  const marcados = document.querySelectorAll(".chk-articulo-informe:checked").length;
  const label = document.getElementById("label-conteo-seleccionados");
  if (label) label.textContent = `${marcados} de ${total} seleccionados`;
}

function generarTextoNotificacionBata() {
  const seleccionadosIds = Array.from(document.querySelectorAll(".chk-articulo-informe:checked")).map(c => c.value);
  if (seleccionadosIds.length === 0) {
    alert("Selecciona al menos un artículo para generar el texto de notificación.");
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
  textarea.value = texto;

  document.getElementById("btn-copiar-texto-wsp").onclick = () => {
    textarea.select();
    navigator.clipboard.writeText(texto);
    alert("Texto copiado al portapapeles con éxito.");
  };

  document.getElementById("btn-enviar-correo-informe").onclick = () => {
    const asunto = encodeURIComponent(`Bata Bolivia - Cambios Realizados para Semana ${semanaTitulo}`);
    const cuerpo = encodeURIComponent(texto);
    window.location.href = `mailto:?subject=${asunto}&body=${cuerpo}`;
  };

  document.getElementById("btn-enviar-wsp-directo").onclick = () => {
    const encoded = encodeURIComponent(texto);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  modalTextoWsp.classList.remove("hidden");
}

function generarModalInformeResumen() {
  const seleccionadosIds = Array.from(document.querySelectorAll(".chk-articulo-informe:checked")).map(c => c.value);
  if (seleccionadosIds.length === 0) {
    alert("Selecciona al menos un artículo para generar el informe PDF.");
    return;
  }

  const items = solicitudes.filter(s => seleccionadosIds.includes(s.id));
  const contenedor = document.getElementById("reporte-resumen-contenido");

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
  modalResumen.classList.remove("hidden");
}

// ==================== PROCUREMENT & STORAGE ====================
function escucharProcurement() {
  const qBloqueos = query(collection(db, "procurement_bloqueos"), orderBy("timestamp", "desc"));
  onSnapshot(qBloqueos, (snapshot) => {
    bloqueosMateriales = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTablaBloqueos();
  }, (err) => console.log("Aviso Firestore Bloqueos:", err.message));

  const qLlegadas = query(collection(db, "procurement_llegadas"), orderBy("timestamp", "desc"));
  onSnapshot(qLlegadas, (snapshot) => {
    llegadasMateriales = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTablaLlegadas();
  }, (err) => console.log("Aviso Firestore Llegadas:", err.message));
}

function renderProcurementView() {
  renderTablaBloqueos();
  renderTablaLlegadas();

  document.getElementById("btn-open-nuevo-bloqueo").onclick = () => {
    modalNuevoBloqueo.classList.remove("hidden");
  };

  document.getElementById("btn-open-nueva-llegada").onclick = () => {
    modalNuevaLlegada.classList.remove("hidden");
  };

  const fItem = document.getElementById("col-filter-item-llegada");
  const fNom = document.getElementById("col-filter-nombre-llegada");
  const fSem = document.getElementById("col-filter-semana-llegada");

  if (fItem) fItem.oninput = (e) => { colFiltroItemLlegada = e.target.value.trim().toLowerCase(); renderTablaLlegadas(); };
  if (fNom) fNom.oninput = (e) => { colFiltroNombreLlegada = e.target.value.trim().toLowerCase(); renderTablaLlegadas(); };
  if (fSem) fSem.oninput = (e) => { colFiltroSemanaLlegada = e.target.value.trim().toLowerCase(); renderTablaLlegadas(); };

  document.getElementById("btn-reporte-llegadas-pdf").onclick = abrirReporteImpresoLlegadas;
}

// Formulario Nuevo Bloqueo (Blindado)
document.getElementById("form-nuevo-bloqueo").onsubmit = async (e) => {
  e.preventDefault();
  const item = document.getElementById("bloq-item").value.trim();
  const semana = document.getElementById("bloq-semana").value.trim();
  const nombre = document.getElementById("bloq-nombre").value.trim();
  const cantidad = parseFloat(document.getElementById("bloq-cantidad").value) || 0;
  const unidad = document.getElementById("bloq-unidad").value;
  const estado = document.getElementById("bloq-estado").value;
  const notas = document.getElementById("bloq-notas").value.trim();

  try {
    const nombreUsuario = (userData && userData.nombre) || (currentUser && currentUser.email) || "Compras";
    const rolUsuario = (userData && userData.rol) || "Compras";

    await addDoc(collection(db, "procurement_bloqueos"), {
      item,
      semana,
      nombre,
      cantidad,
      unidad,
      estado,
      notas,
      notificadoAlmacen: false,
      registradoPorNombre: nombreUsuario,
      registradoPorRol: rolUsuario,
      registradoPorId: currentUser ? currentUser.uid : null,
      fechaCreacion: new Date().toISOString(),
      timestamp: serverTimestamp()
    });

    document.getElementById("form-nuevo-bloqueo").reset();
    modalNuevoBloqueo.classList.add("hidden");

    abrirModalWhatsApp({
      titulo: "Alerta de Disponibilidad Emitida",
      subtitulo: "Enviar alerta inmediata al personal de Almacén:",
      mensajeTexto: `📦 *ALERTA DE DISPONIBILIDAD DE MATERIAL - BATA BOLIVIA*\n*Compras a Almacén*\n\n📅 *Semana de Bloqueo:* ${semana}\n🔢 *Item:* ${item}\n🧵 *Material:* ${nombre}\n📏 *Cant. Permitida:* ${cantidad} ${unidad}\n⚠️ *Disposición:* ${estado}\n📝 *Notas:* ${notas || 'Sin notas'}\n👤 *Emitido por:* ${nombreUsuario} (${rolUsuario})\n\n_Favor ajustar las entregas físicas en almacén conforme a esta disposición._`,
      rolFiltro: "Almacén"
    });
  } catch (err) {
    alert("Error al guardar bloqueo: " + err.message);
  }
};

function renderTablaBloqueos() {
  const tbody = document.getElementById("table-bloqueos-body");
  tbody.innerHTML = "";

  if (bloqueosMateriales.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-gray-400 italic">No hay restricciones de materiales registradas.</td></tr>`;
    return;
  }

  const esAlmacen = (userData && userData.rol === "Almacén") || esSuperAdmin();

  bloqueosMateriales.forEach(b => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50/70 border-b border-gray-100";

    let estiloBadge = "bg-amber-100 text-amber-800";
    if (b.estado === "Bloqueado para Producción") estiloBadge = "bg-red-100 text-red-800";
    if (b.estado === "Disponible Libre") estiloBadge = "bg-green-100 text-green-800";

    let accionAlmacen = b.notificadoAlmacen 
      ? `<span class="text-green-600 font-bold text-[11px]"><i class="fa-solid fa-check"></i> Almacén Enterado</span>`
      : (esAlmacen 
          ? `<button onclick="window.confirmarEnteradoAlmacen('${b.id}')" class="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-2 py-1 rounded border border-blue-200">Confirmar Enterado</button>`
          : `<span class="text-gray-400 text-[11px] italic">Pendiente confirmación</span>`);

    tr.innerHTML = `
      <td class="p-2.5 font-mono font-bold text-gray-700">${b.item}</td>
      <td class="p-2.5 font-bold text-gray-800">${b.nombre} ${b.notas ? '<p class="text-[10px] text-gray-400 font-normal">' + b.notas + '</p>' : ''}</td>
      <td class="p-2.5 font-mono font-bold text-amber-700">${b.semana}</td>
      <td class="p-2.5 font-black text-gray-800">${b.cantidad} ${b.unidad || 'Mts'}</td>
      <td class="p-2.5 text-center"><span class="px-2 py-0.5 rounded font-bold text-[10px] ${estiloBadge}">${b.estado}</span></td>
      <td class="p-2.5 text-gray-600">${b.registradoPorNombre}</td>
      <td class="p-2.5 text-center">${accionAlmacen}</td>
    `;
    tbody.appendChild(tr);
  });
}

window.confirmarEnteradoAlmacen = async (id) => {
  await updateDoc(doc(db, "procurement_bloqueos", id), {
    notificadoAlmacen: true,
    fechaEnterado: new Date().toISOString(),
    usuarioAlmacen: (userData && userData.nombre) || "Almacén"
  });
};

// Formulario Nueva Llegada (Blindado)
document.getElementById("form-nueva-llegada").onsubmit = async (e) => {
  e.preventDefault();
  const item = document.getElementById("lleg-item").value.trim();
  const semana = document.getElementById("lleg-semana").value.trim();
  const nombre = document.getElementById("lleg-nombre").value.trim();
  const cantidad = document.getElementById("lleg-cantidad").value.trim();
  const fechaEst = document.getElementById("lleg-fecha-est").value;
  const fechaReal = document.getElementById("lleg-fecha-real").value;

  try {
    const nombreUsuario = (userData && userData.nombre) || (currentUser && currentUser.email) || "Usuario";

    await addDoc(collection(db, "procurement_llegadas"), {
      item,
      semana,
      nombre,
      cantidad,
      fechaEstimada: fechaEst,
      fechaReal: fechaReal || null,
      validadoCompras: false,
      registradoPor: nombreUsuario,
      registradoPorId: currentUser ? currentUser.uid : null,
      fechaCreacion: new Date().toISOString(),
      timestamp: serverTimestamp()
    });

    document.getElementById("form-nueva-llegada").reset();
    modalNuevaLlegada.classList.add("hidden");
  } catch (err) {
    alert("Error al guardar llegada: " + err.message);
  }
};

function renderTablaLlegadas() {
  const tbody = document.getElementById("table-llegadas-body");
  tbody.innerHTML = "";

  let filtradas = llegadasMateriales.filter(l => {
    const cItem = !colFiltroItemLlegada || (l.item || "").toLowerCase().includes(colFiltroItemLlegada);
    const cNom = !colFiltroNombreLlegada || (l.nombre || "").toLowerCase().includes(colFiltroNombreLlegada);
    const cSem = !colFiltroSemanaLlegada || (l.semana || "").toString().includes(colFiltroSemanaLlegada);
    return cItem && cNom && cSem;
  });

  if (filtradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-gray-400 italic">No hay registros de llegadas.</td></tr>`;
    return;
  }

  const esCompras = (userData && userData.rol === "Compras") || esSuperAdmin();

  filtradas.forEach(l => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50/70 border-b border-gray-100";

    let validacionHTML = l.validadoCompras 
      ? `<span class="text-green-700 font-bold text-xs"><i class="fa-solid fa-circle-check"></i> Validado</span>`
      : (esCompras 
          ? `<button onclick="window.validarLlegadaCompras('${l.id}')" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-2.5 py-1 rounded border border-emerald-200">Validar</button>`
          : `<span class="text-gray-300 text-[11px]">Pendiente</span>`);

    tr.innerHTML = `
      <td class="p-2.5 font-mono font-bold text-gray-700">${l.item}</td>
      <td class="p-2.5 font-bold text-gray-800">${l.nombre}</td>
      <td class="p-2.5 font-mono font-bold text-gray-600">${l.semana}</td>
      <td class="p-2.5 font-black text-gray-700">${l.cantidad}</td>
      <td class="p-2.5 text-gray-600">${l.fechaEstimada || '—'}</td>
      <td class="p-2.5 font-bold ${l.fechaReal ? 'text-green-700' : 'text-amber-600'}">${l.fechaReal || 'En tránsito'}</td>
      <td class="p-2.5 text-center">${validacionHTML}</td>
    `;
    tbody.appendChild(tr);
  });
}

window.validarLlegadaCompras = async (id) => {
  if (confirm("¿Confirmar y validar la llegada física de este material a fábrica?")) {
    await updateDoc(doc(db, "procurement_llegadas", id), {
      validadoCompras: true,
      fechaValidacion: new Date().toISOString(),
      validadorCompras: (userData && userData.nombre) || "Compras"
    });
  }
};

function abrirReporteImpresoLlegadas() {
  if (llegadasMateriales.length === 0) {
    alert("No hay registros de llegadas para generar el informe.");
    return;
  }

  const contenedor = document.getElementById("contenido-impresion-llegadas");
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
  modalReporteLlegadasPrint.classList.remove("hidden");
}

// ==================== SOLICITUDES Y MINUTAS ====================
if (document.getElementById("form-minuta")) {
  document.getElementById("form-minuta").onsubmit = async (e) => {
    e.preventDefault();
    const semana = document.getElementById("minuta-semana").value.trim();
    const proyecto = document.getElementById("minuta-proyecto").value.trim();
    const articulo = document.getElementById("minuta-articulo").value.trim();
    const detalle = document.getElementById("minuta-box").value.trim();
    const photoFile = document.getElementById("minuta-photo").files[0];

    const fotoBase64 = photoFile ? await comprimirImagen(photoFile) : null;

    try {
      await addDoc(collection(db, "solicitudes_cambios"), {
        semana,
        proyecto,
        articulo,
        foto: fotoBase64,
        boxCambio: detalle,
        esMinuta: true,
        solicitanteNombre: (userData && userData.nombre) || "Jefe Desarrollo",
        solicitanteRol: (userData && userData.rol) || "Desarrollo de producto - Jefe",
        solicitanteId: currentUser.uid,
        estado: "En proceso",
        fechaRealizado: null,
        validadoCostos: false,
        fechaCreacion: new Date().toISOString(),
        timestamp: serverTimestamp()
      });

      modalMinuta.classList.add("hidden");
      document.getElementById("form-minuta").reset();

      abrirModalWhatsApp({
        titulo: "Minuta de Cambios Registrada",
        subtitulo: "Enviar minuta a los Técnicos de Desarrollo:",
        mensajeTexto: `📋 *MINUTA DE CAMBIOS - PLAN PILOTO*\n*Bata Bolivia / Desarrollo de Producto*\n\n📅 *Semana:* ${semana}\n📌 *Proyecto:* ${proyecto}\n🔢 *Artículo:* ${articulo}\n👤 *Emitido por:* ${(userData && userData.nombre) || 'Jefe Desarrollo'}\n\n📝 *DETALLE DE CAMBIOS TÉCNICOS:*\n${detalle}\n\n_Registrado en el sistema para control de avance y realización._`,
        rolFiltro: "Desarrollo de producto - Técnico"
      });
    } catch (err) {
      alert("Error al guardar minuta: " + err.message);
    }
  };
}

const modalNewChange = document.getElementById("modal-new-change");
document.getElementById("btn-open-new-change").onclick = () => modalNewChange.classList.remove("hidden");
document.getElementById("modal-btn-close").onclick = () => modalNewChange.classList.add("hidden");
document.getElementById("modal-btn-cancel").onclick = () => modalNewChange.classList.add("hidden");

document.getElementById("form-new-change").onsubmit = async (e) => {
  e.preventDefault();
  const semana = document.getElementById("change-semana").value.trim();
  const proyecto = document.getElementById("change-project").value.trim();
  const articulo = document.getElementById("change-article").value.trim();
  const boxCambio = document.getElementById("change-box").value.trim();
  const photoFile = document.getElementById("change-photo").files[0];

  const fotoBase64 = photoFile ? await comprimirImagen(photoFile) : null;

  try {
    await addDoc(collection(db, "solicitudes_cambios"), {
      semana,
      proyecto,
      articulo,
      foto: fotoBase64,
      boxCambio,
      esMinuta: false,
      solicitanteNombre: (userData && userData.nombre) || currentUser.email,
      solicitanteRol: (userData && userData.rol) || "Usuario",
      solicitanteId: currentUser.uid,
      estado: "En proceso",
      fechaRealizado: null,
      validadoCostos: false,
      fechaCreacion: new Date().toISOString(),
      timestamp: serverTimestamp()
    });

    document.getElementById("form-new-change").reset();
    modalNewChange.classList.add("hidden");

    abrirModalWhatsApp({
      titulo: "Solicitud Registrada",
      subtitulo: "Notificar solicitud creada al equipo:",
      mensajeTexto: `👞 *NUEVA SOLICITUD DE CAMBIO - BATA BOLIVIA*\n\n📅 *Semana:* ${semana}\n📌 *Proyecto:* ${proyecto}\n🔢 *Artículo:* ${articulo}\n👤 *Solicitado por:* ${(userData && userData.nombre) || 'Usuario'} (${(userData && userData.rol) || ''})\n📝 *Cambio:* ${boxCambio}\n\n_Revisar en el Sistema de Gestión de Cambios Bata_`
    });
  } catch (err) {
    alert("Error: " + err.message);
  }
};

// ==================== MÓDULO ENTREGAS ====================
document.getElementById("btn-open-nueva-entrega").onclick = () => {
  const esAdmin = esSuperAdmin();
  const rol = (userData && userData.rol) || "";
  const esDesarrollo = rol.includes("Desarrollo") || esAdmin;
  const esCostos = rol === "Costos" || esAdmin;

  if (!esDesarrollo && !esCostos) {
    alert("Solo los usuarios de Desarrollo de Producto o Costos pueden registrar entregas.");
    return;
  }

  const selectTipo = document.getElementById("ent-tipo");
  selectTipo.innerHTML = "";

  if (categoriaEntregaActiva !== "todas") {
    selectTipo.innerHTML += `<option value="${categoriaEntregaActiva}">${categoriaEntregaActiva}</option>`;
  } else {
    if (esDesarrollo) {
      selectTipo.innerHTML += `<option value="GUÍA DE PRODUCCIÓN">GUÍA DE PRODUCCIÓN</option>`;
      selectTipo.innerHTML += `<option value="CORTE">CORTE</option>`;
      selectTipo.innerHTML += `<option value="MUESTRA DEFINITIVA">MUESTRA DEFINITIVA</option>`;
      selectTipo.innerHTML += `<option value="MATERIALES">MATERIALES</option>`;
      selectTipo.innerHTML += `<option value="HOJA DE DESBASTE">HOJA DE DESBASTE</option>`;
      selectTipo.innerHTML += `<option value="TIZADORES">TIZADORES</option>`;
    } else if (esCostos) {
      selectTipo.innerHTML += `<option value="CORTE">CORTE (De Costos a Producción)</option>`;
    }
  }

  actualizarCamposSegunTipoEntrega();
  modalNuevaEntrega.classList.remove("hidden");
};

document.getElementById("ent-tipo").onchange = actualizarCamposSegunTipoEntrega;

function actualizarCamposSegunTipoEntrega() {
  const tipo = document.getElementById("ent-tipo").value;
  const selectDestino = document.getElementById("ent-destino");
  const boxArticulo = document.getElementById("box-field-articulo");
  const labelProy = document.getElementById("label-field-proyecto");
  const inputProy = document.getElementById("ent-proyecto");
  const boxFoto = document.getElementById("box-field-foto");
  const boxCopias = document.getElementById("box-field-copias");
  const containerSingle = document.getElementById("container-destino-single");
  const containerMultiple = document.getElementById("container-destino-multiple");

  selectDestino.innerHTML = "";
  boxCopias.classList.add("hidden");
  containerMultiple.classList.add("hidden");
  containerSingle.classList.remove("hidden");
  boxFoto.classList.add("hidden");

  if (tipo === "MATERIALES") {
    labelProy.textContent = "Nombre del Material / Insumo";
    inputProy.placeholder = "Ej: Badana Beige 1.2mm";
    boxArticulo.classList.add("hidden");
    selectDestino.innerHTML += `<option value="Desarrollo de producto">Desarrollo de producto</option>`;
    selectDestino.innerHTML += `<option value="Producción">Producción</option>`;
    return;
  }

  boxArticulo.classList.remove("hidden");
  labelProy.textContent = "Nombre del Proyecto";
  inputProy.placeholder = "Ej: SKATER";

  if (tipo === "GUÍA DE PRODUCCIÓN") {
    boxFoto.classList.remove("hidden");
    selectDestino.innerHTML += `<option value="Costos">Costos</option>`;
  }
  else if (tipo === "CORTE") {
    boxFoto.classList.remove("hidden");
    selectDestino.innerHTML += `<option value="Costos">Costos</option>`;
    selectDestino.innerHTML += `<option value="Producción">Producción</option>`;
  }
  else if (tipo === "MUESTRA DEFINITIVA") {
    boxFoto.classList.remove("hidden");
    containerSingle.classList.add("hidden");
    containerMultiple.classList.remove("hidden");
  }
  else if (tipo === "HOJA DE DESBASTE") {
    boxFoto.classList.remove("hidden");
    selectDestino.innerHTML += `<option value="Costos">Costos</option>`;
    selectDestino.innerHTML += `<option value="Producción">Producción</option>`;
  }
  else if (tipo === "TIZADORES") {
    boxCopias.classList.remove("hidden");
    selectDestino.innerHTML += `<option value="Producción">Producción</option>`;
  }
}

document.getElementById("form-nueva-entrega").onsubmit = async (e) => {
  e.preventDefault();
  const semana = document.getElementById("ent-semana").value.trim();
  const proyecto = document.getElementById("ent-proyecto").value.trim();
  const articulo = document.getElementById("ent-articulo").value.trim();
  const tipo = document.getElementById("ent-tipo").value;
  const notas = document.getElementById("ent-notas").value.trim();
  const copias = document.getElementById("ent-copias").value.trim();
  const photoFile = document.getElementById("ent-photo").files[0];

  const fotoBase64 = photoFile ? await comprimirImagen(photoFile) : null;

  try {
    let destinosAEntregar = [];

    if (tipo === "MUESTRA DEFINITIVA") {
      destinosAEntregar = Array.from(document.querySelectorAll(".chk-muestras-dest:checked")).map(c => c.value);
      if (destinosAEntregar.length === 0) {
        alert("Selecciona al menos un departamento para la muestra definitiva.");
        return;
      }
    } else {
      destinosAEntregar = [document.getElementById("ent-destino").value];
    }

    const nombreUsuario = (userData && userData.nombre) || (currentUser && currentUser.email) || "Usuario";
    const rolUsuario = (userData && userData.rol) || "Desarrollo de producto";

    for (const destino of destinosAEntregar) {
      await addDoc(collection(db, "entregas_departamentos"), {
        semana,
        proyecto,
        articulo: tipo === "MATERIALES" ? "" : articulo,
        tipo,
        destino,
        copias: tipo === "TIZADORES" ? (copias || "1") : null,
        foto: fotoBase64,
        notas,
        entregadoPorNombre: nombreUsuario,
        entregadoPorRol: rolUsuario,
        entregadoPorId: currentUser ? currentUser.uid : null,
        recibido: false,
        fechaEntrega: new Date().toISOString(),
        timestamp: serverTimestamp()
      });
    }

    document.getElementById("form-nueva-entrega").reset();
    modalNuevaEntrega.classList.add("hidden");

    const destinosTexto = destinosAEntregar.join(", ");
    let detalleCopias = (tipo === "TIZADORES" && copias) ? `📑 *Copias:* ${copias}\n` : '';

    abrirModalWhatsApp({
      titulo: "Entrega Registrada",
      subtitulo: `Notificar recepción a los encargados de ${destinosTexto}:`,
      mensajeTexto: `📦 ENTREGA REALIZADA - PD BOLIVIA\n\n📅 *Semana:* ${semana}\n📌 *Elemento:* ${tipo}\n🏷️ *Detalle/Proyecto:* ${proyecto}\n${articulo ? '🔢 *Artículo:* ' + articulo + '\n' : ''}${detalleCopias}👤 *Entregado por:* ${nombreUsuario} (${rolUsuario})\n🏢 *Destino:* ${destinosTexto}\n📝 *Notas:* ${notas || 'Sin notas adicionales'}\n\n_Favor de confirmar la recepción física en el sistema._`,
      rolFiltro: destinosAEntregar.length === 1 ? destinosAEntregar[0] : null
    });
  } catch (err) {
    alert("Error al registrar entrega: " + err.message);
  }
};

function escucharEntregas() {
  const q = query(collection(db, "entregas_departamentos"), orderBy("timestamp", "desc"));
  onSnapshot(q, (snapshot) => {
    entregas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTablaEntregas();
  });
}

// Filtros en cabecera de tabla Entregas
const colFilterSemEntregas = document.getElementById("col-filter-semana-entregas");
const colFilterProyEntregas = document.getElementById("col-filter-proyecto-entregas");

if (colFilterSemEntregas) {
  colFilterSemEntregas.oninput = (e) => {
    colFiltroSemanaEntregas = e.target.value.trim().toLowerCase();
    renderTablaEntregas();
  };
}
if (colFilterProyEntregas) {
  colFilterProyEntregas.oninput = (e) => {
    colFiltroProyectoEntregas = e.target.value.trim().toLowerCase();
    renderTablaEntregas();
  };
}

if (document.getElementById("btn-reporte-entregas-pdf")) {
  document.getElementById("btn-reporte-entregas-pdf").onclick = abrirReporteImpresoEntregas;
}
if (document.getElementById("btn-reporte-entregas-texto")) {
  document.getElementById("btn-reporte-entregas-texto").onclick = abrirResumenTextoEntregas;
}

// Render Tabla de Entregas (Muestra TODO si está en 'todas' sin filtrar por tipo)
function renderTablaEntregas() {
  const tbody = document.getElementById("table-entregas-body");
  tbody.innerHTML = "";
  const empty = document.getElementById("entregas-empty-state");

  let entregasFiltradas = entregas.filter(item => {
    const coincideCategoria = (categoriaEntregaActiva === "todas") || 
      ((item.tipo || "").toUpperCase().trim() === categoriaEntregaActiva.toUpperCase().trim());
    const semStr = (item.semana || "").toString().toLowerCase().trim();
    const proyStr = (item.proyecto || "").toString().toLowerCase().trim();
    const coincideSem = !colFiltroSemanaEntregas || semStr.includes(colFiltroSemanaEntregas);
    const coincideProy = !colFiltroProyectoEntregas || proyStr.includes(colFiltroProyectoEntregas);
    return coincideCategoria && coincideSem && coincideProy;
  });

  entregasFiltradas.sort((a, b) => (a.semana || "").localeCompare(b.semana || "", undefined, { numeric: true }));

  if (entregasFiltradas.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

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
      ? `<img src="${ent.foto}" onclick="window.verFotoGrande('${ent.foto}', '${ent.proyecto} - ${ent.articulo || ent.tipo}')" class="w-10 h-7 object-cover rounded border border-gray-200 shadow-xs cursor-pointer hover:opacity-80 transition mx-auto" title="Click para ampliar">`
      : `<div class="w-10 h-7 rounded border border-dashed border-gray-200 flex items-center justify-center text-gray-300 text-[10px] mx-auto"><i class="fa-regular fa-image"></i></div>`;

    const tdFotoHTML = (categoriaEntregaActiva !== "MATERIALES" && categoriaEntregaActiva !== "TIZADORES") ? `<td class="p-2 border-r border-gray-100 text-center">${fotoHTML}</td>` : '';
    const tdArticuloHTML = categoriaEntregaActiva !== "MATERIALES" ? `<td class="p-3 font-mono text-gray-700 border-r border-gray-100">${ent.articulo || '—'}</td>` : '';

    let detalleExtra = "";
    if (ent.copias) detalleExtra += `<span class="bg-rose-100 text-rose-800 font-bold text-[9px] px-1.5 py-0.2 rounded ml-1">${ent.copias} copias</span>`;
    if (ent.notas) detalleExtra += `<p class="text-[10px] text-gray-400 mt-0.5">${ent.notas}</p>`;

    tr.innerHTML = `
      ${tdFotoHTML}
      <td class="p-3 font-bold text-gray-700 border-r border-gray-100 font-mono">${ent.semana}</td>
      <td class="p-3 text-gray-600 border-r border-gray-100 whitespace-nowrap">${formatearFecha(ent.fechaEntrega)}</td>
      <td class="p-3 font-bold text-gray-800 border-r border-gray-100">${ent.proyecto}</td>
      ${tdArticuloHTML}
      <td class="p-3 border-r border-gray-100">
        <span class="bg-red-50 text-[#D61B28] px-2 py-0.5 rounded font-bold text-[10px] border border-red-100">${ent.tipo}</span>
        ${detalleExtra}
      </td>
      <td class="p-3 border-r border-gray-100 whitespace-nowrap">
        <span class="font-bold text-gray-800 block">${ent.entregadoPorNombre}</span>
        <span class="text-[10px] text-gray-400">${ent.entregadoPorRol}</span>
      </td>
      <td class="p-3 border-r border-gray-100 font-bold text-gray-700">${ent.destino}</td>
      <td class="p-3 text-center whitespace-nowrap">${recepcionHTML}</td>
    `;
    tbody.appendChild(tr);
  });
}

window.confirmarRecepcionEntrega = async (id, tipo, proyecto) => {
  if (confirm(`¿Confirmar que has recibido físicamente "${tipo}" (${proyecto})?`)) {
    await updateDoc(doc(db, "entregas_departamentos", id), {
      recibido: true,
      fechaRecepcion: new Date().toISOString(),
      recibidoPorNombre: (userData && userData.nombre) || "Usuario"
    });
  }
};

function abrirReporteImpresoEntregas() {
  const items = entregas.filter(item => (categoriaEntregaActiva === "todas") || 
    ((item.tipo || "").toUpperCase().trim() === categoriaEntregaActiva.toUpperCase().trim()));
  if (items.length === 0) {
    alert("No hay registros de entregas para generar el reporte.");
    return;
  }

  const contenedor = document.getElementById("contenido-impresion-entregas");
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
        <td class="p-2 border font-bold font-mono">${it.semana}</td>
        <td class="p-2 border whitespace-nowrap">${formatearFecha(it.fechaEntrega)}</td>
        <td class="p-2 border font-bold text-gray-800">${it.proyecto}</td>
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
  modalReporteEntregasPrint.classList.remove("hidden");
}

function abrirResumenTextoEntregas() {
  const items = entregas.filter(item => (categoriaEntregaActiva === "todas") || 
    ((item.tipo || "").toUpperCase().trim() === categoriaEntregaActiva.toUpperCase().trim()));
  if (items.length === 0) {
    alert("No hay entregas registradas en esta categoría.");
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
  textarea.value = texto;

  document.getElementById("btn-copiar-texto-entregas").onclick = () => {
    textarea.select();
    navigator.clipboard.writeText(texto);
    alert("Texto de entregas copiado al portapapeles.");
  };

  document.getElementById("btn-enviar-correo-entregas").onclick = () => {
    const asunto = encodeURIComponent(`Bata Bolivia - Control de Entregas (${categoriaEntregaActiva})`);
    const cuerpo = encodeURIComponent(texto);
    window.location.href = `mailto:?subject=${asunto}&body=${cuerpo}`;
  };

  document.getElementById("btn-enviar-wsp-entregas").onclick = () => {
    const encoded = encodeURIComponent(texto);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  modalEntregasTexto.classList.remove("hidden");
}

// Escucha en tiempo real de Solicitudes y Retraso a los 7 Días
function escucharCambios() {
  const q = query(collection(db, "solicitudes_cambios"), orderBy("timestamp", "desc"));
  onSnapshot(q, (snapshot) => {
    const ahora = new Date();
    solicitudes = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      const id = docSnap.id;

      if (data.estado === "En proceso" && data.fechaCreacion) {
        const fechaCrea = new Date(data.fechaCreacion);
        const diferenciaDias = (ahora - fechaCrea) / (1000 * 60 * 60 * 24);
        if (diferenciaDias >= 7) {
          data.estado = "Retrasado";
          updateDoc(doc(db, "solicitudes_cambios", id), { estado: "Retrasado" });
        }
      }

      return { id, ...data };
    });
    renderTabla();
    if (!viewInforme.classList.contains("hidden")) {
      actualizarInformePorSemana();
    }
  });
}

function formatearFecha(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Render Tabla de Cambios Pública
function renderTabla() {
  const tbody = document.getElementById("table-cambios-body");
  tbody.innerHTML = "";
  const empty = document.getElementById("table-empty-state");

  if (solicitudes.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const esAdmin = esSuperAdmin();
  const esDesarrollo = (userData && (userData.rol || "").includes("Desarrollo")) || esAdmin;
  const esCostos = (userData && userData.rol === "Costos") || esAdmin;

  solicitudes.forEach((item) => {
    const tr = document.createElement("tr");
    tr.className = item.esMinuta 
      ? "bg-amber-50/70 hover:bg-amber-100/70 transition border-b border-amber-200" 
      : "hover:bg-gray-50/80 transition border-b border-gray-100";

    let badgeMinuta = item.esMinuta 
      ? `<span class="bg-amber-500 text-white font-black text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider block mb-1 w-fit shadow-xs">PLAN PILOTO</span>` 
      : '';

    let estadoHTML = "";
    if (esDesarrollo) {
      estadoHTML = `
        <div class="flex items-center space-x-1.5">
          <select id="sel-estado-${item.id}" class="border border-orange-200 text-orange-600 bg-orange-50 font-semibold rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-[#D61B28]">
            <option value="En proceso" ${item.estado === "En proceso" ? "selected" : ""}>En proceso</option>
            <option value="Realizado" ${item.estado === "Realizado" ? "selected" : ""}>Realizado</option>
            <option value="Retrasado" ${item.estado === "Retrasado" ? "selected" : ""}>Retrasado</option>
          </select>
          <button onclick="window.guardarCambioEstado('${item.id}', '${item.proyecto}', '${item.articulo}', '${item.semana || ''}')" title="Guardar y Notificar a Costos" class="bg-gray-100 hover:bg-[#D61B28] hover:text-white text-gray-600 p-1.5 rounded-lg text-xs transition cursor-pointer">
            <i class="fa-solid fa-floppy-disk"></i>
          </button>
        </div>
      `;
    } else {
      const estilo = item.estado === "Realizado" ? "border-green-200 text-green-700 bg-green-50" : (item.estado === "Retrasado" ? "border-red-200 text-red-700 bg-red-50" : "border-orange-200 text-orange-600 bg-orange-50");
      estadoHTML = `<span class="border ${estilo} px-3 py-1 rounded-lg font-bold text-xs">${item.estado}</span>`;
    }

    const fechaRealizadoHTML = item.fechaRealizado 
      ? `<span class="font-bold text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200">${formatearFecha(item.fechaRealizado)}</span>`
      : `<span class="text-gray-300 text-[11px]">—</span>`;

    let costosHTML = "";
    if (item.estado === "Realizado") {
      if (item.validadoCostos) {
        costosHTML = `
          <div class="flex items-center justify-center space-x-1 text-green-700 font-bold text-xs">
            <i class="fa-solid fa-circle-check text-green-600"></i>
            <span>Validado</span>
            ${esAdmin ? `<button onclick="window.desbloquearValidacionCostos('${item.id}')" class="text-red-500 hover:text-red-700 text-[10px] ml-1 cursor-pointer" title="Desbloquear como Super Admin"><i class="fa-solid fa-unlock"></i></button>` : ''}
          </div>
        `;
      } else {
        costosHTML = `
          <div class="flex items-center justify-center space-x-1">
            <input type="checkbox" ${!esCostos ? "disabled title='Solo el usuario de Costos puede validar'" : ""} 
                   onchange="window.confirmarValidacionCostos('${item.id}', '${item.proyecto}', '${item.articulo}', this)"
                   class="h-4 w-4 accent-[#D61B28] rounded border-gray-300 cursor-${esCostos ? 'pointer' : 'not-allowed'}">
            <span class="text-[11px] ${esCostos ? 'text-gray-600 font-semibold' : 'text-gray-300'}">Confirmar</span>
          </div>
        `;
      }
    } else {
      costosHTML = `<input type="checkbox" disabled class="h-4 w-4 text-gray-300 rounded border-gray-200 opacity-40">`;
    }

    const fotoHTML = item.foto 
      ? `<img src="${item.foto}" onclick="window.verFotoGrande('${item.foto}', '${item.proyecto} - ${item.articulo}')" class="w-10 h-7 object-cover rounded border border-gray-200 shadow-xs cursor-pointer hover:opacity-80 transition mx-auto" title="Click para ampliar">`
      : `<div class="w-10 h-7 rounded border border-dashed border-gray-200 flex items-center justify-center text-gray-300 text-[10px] mx-auto"><i class="fa-regular fa-image"></i></div>`;

    tr.innerHTML = `
      <td class="p-2 border-r border-gray-100 text-center">${fotoHTML}</td>
      <td class="p-3 font-bold text-gray-700 border-r border-gray-100 font-mono">${item.semana || '—'}</td>
      <td class="p-3 text-gray-600 border-r border-gray-100 whitespace-nowrap">${formatearFecha(item.fechaCreacion)}</td>
      <td class="p-3 border-r border-gray-100 whitespace-nowrap">
        <span class="font-bold text-gray-800 block">${item.solicitanteNombre || '—'}</span>
        <span class="text-[10px] text-gray-400">${item.solicitanteRol || ''}</span>
      </td>
      <td class="p-3.5 font-bold text-gray-800 border-r border-gray-100">${badgeMinuta}${item.proyecto}</td>
      <td class="p-3.5 font-mono text-gray-700 border-r border-gray-100">${item.articulo}</td>
      <td class="p-3.5 text-gray-700 border-r border-gray-100 leading-relaxed">${item.boxCambio}</td>
      <td class="p-3.5 text-center border-r border-gray-100 whitespace-nowrap">${estadoHTML}</td>
      <td class="p-3.5 text-center border-r border-gray-100 whitespace-nowrap">${fechaRealizadoHTML}</td>
      <td class="p-3.5 text-center whitespace-nowrap">${costosHTML}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Guardar Estado
window.guardarCambioEstado = async (id, proyecto, articulo, semana) => {
  const select = document.getElementById(`sel-estado-${id}`);
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

// Validación Costos
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
