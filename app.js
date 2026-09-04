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

let categoriaEntregaActiva = "todas";

// Filtros
let colFiltroSemanaInforme = "";
let colFiltroProyectoInforme = "";
let colFiltroSemanaEntregas = "";
let colFiltroProyectoEntregas = "";
let colFiltroItemLlegada = "";
let colFiltroNombreLlegada = "";
let colFiltroSemanaLlegada = "";

// Memoria para imágenes de Tarjeta
let croquisTarjetaBase64 = null;
let plantillaCorteTarjetaBase64 = null;

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

// Modal WhatsApp
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

document.getElementById("btn-close-whatsapp-modal").onclick = () => {
  document.getElementById("modal-whatsapp").classList.add("hidden");
};

// Modales
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
if (document.getElementById("close-modal-tarjetas")) {
  document.getElementById("close-modal-tarjetas").onclick = () => modalImpresionTarjetas.classList.add("hidden");
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
  document.getElementById("user-display-name").textContent = (userData && userData.nombre) || (currentUser && currentUser.email) || "Usuario";
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

  const secTarjetas = document.getElementById("section-menu-tarjetas");
  if (secTarjetas) {
    if (esDesarrollo() || esAdmin) {
      secTarjetas.classList.remove("hidden");
    } else {
      secTarjetas.classList.add("hidden");
    }
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
          celular: ""
        };
      }
    } catch (e) {
      console.error("Error al cargar perfil usuario:", e);
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

// Navegación
const viewCambios = document.getElementById("view-cambios");
const viewInforme = document.getElementById("view-informe");
const viewEntregas = document.getElementById("view-entregas");
const viewProcurement = document.getElementById("view-procurement");
const viewTarjetas = document.getElementById("view-tarjetas");
const viewUsuarios = document.getElementById("view-usuarios");

const menuBtnCambios = document.getElementById("menu-btn-cambios");
const menuBtnInforme = document.getElementById("menu-btn-informe");
const menuBtnEntregasTodas = document.getElementById("menu-btn-entregas-todas");
const menuBtnProcurement = document.getElementById("menu-btn-procurement");
const menuBtnTarjetas = document.getElementById("menu-btn-tarjetas");
const menuBtnUsuarios = document.getElementById("menu-btn-usuarios");

const CLASE_INACTIVO_PRINCIPAL = "sidebar-btn w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-bold text-xs text-white hover:bg-white/15 transition cursor-pointer";
const CLASE_INACTIVO_SUB = "sidebar-btn sub-ent-btn w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white/90 hover:bg-white/15 hover:text-white transition cursor-pointer pl-5";

const CLASE_ACTIVO_PASTILLA = "sidebar-btn w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-black text-xs bg-white text-[#D61B28] shadow-md transition cursor-pointer scale-[1.02]";
const CLASE_ACTIVO_SUB_PASTILLA = "sidebar-btn sub-ent-btn w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-black bg-white text-[#D61B28] shadow-md transition cursor-pointer pl-5 scale-[1.02]";

function resetMenuStyles() {
  [menuBtnCambios, menuBtnInforme, menuBtnEntregasTodas, menuBtnProcurement, menuBtnTarjetas, menuBtnUsuarios].forEach(b => {
    if (b) b.className = CLASE_INACTIVO_PRINCIPAL;
  });

  document.querySelectorAll(".sub-ent-btn").forEach(b => {
    b.className = CLASE_INACTIVO_SUB;
  });

  viewCambios.classList.add("hidden");
  viewInforme.classList.add("hidden");
  viewEntregas.classList.add("hidden");
  viewProcurement.classList.add("hidden");
  viewTarjetas.classList.add("hidden");
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
  
  colFiltroSemanaInforme = "";
  colFiltroProyectoInforme = "";
  const inSem = document.getElementById("col-filter-semana-informe");
  const inProy = document.getElementById("col-filter-proyecto-informe");
  if (inSem) inSem.value = "";
  if (inProy) inProy.value = "";
  
  renderInformeView();
};

menuBtnEntregasTodas.onclick = () => {
  window.cambiarSubmenuEntrega("todas");
};

menuBtnProcurement.onclick = () => {
  resetMenuStyles();
  viewProcurement.classList.remove("hidden");
  menuBtnProcurement.className = CLASE_ACTIVO_PASTILLA;
  renderProcurementView();
};

menuBtnTarjetas.onclick = () => {
  resetMenuStyles();
  viewTarjetas.classList.remove("hidden");
  menuBtnTarjetas.className = CLASE_ACTIVO_PASTILLA;
  initModuloTarjetas();
};

menuBtnUsuarios.onclick = () => {
  if (!esSuperAdmin()) {
    alert("Acceso denegado.");
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
    subtitulo.textContent = "Muestras definitivas con foto. Destinos: Producción, Planeamiento, Retail.";
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

// ==================== INFORMES ====================
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
    alert("Selecciona al menos un artículo.");
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
    alert("Texto copiado al portapapeles.");
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
  const qBloqueos = query(collection(db, "procurement_bloqueos"));
  onSnapshot(qBloqueos, (snapshot) => {
    bloqueosMateriales = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTablaBloqueos();
  }, (err) => console.log("Aviso Firestore Bloqueos:", err.message));

  const qLlegadas = query(collection(db, "procurement_llegadas"));
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

// Formulario Bloqueo
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
    tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-gray-400 italic">No hay restricciones de materiales registradas.</td></tr>`;
    return;
  }

  const esAlmacen = (userData && userData.rol === "Almacén") || esSuperAdmin();
  const puedeBorrar = esComprasAdmin();

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

    let eliminarHTML = puedeBorrar
      ? `<button onclick="window.eliminarBloqueoMaterial('${b.id}', '${b.nombre}')" class="text-red-500 hover:text-red-700 font-bold text-xs cursor-pointer"><i class="fa-solid fa-trash-can"></i></button>`
      : `<span class="text-gray-300">—</span>`;

    tr.innerHTML = `
      <td class="p-2.5 font-mono font-bold text-gray-700">${b.item}</td>
      <td class="p-2.5 font-bold text-gray-800">${b.nombre} ${b.notas ? '<p class="text-[10px] text-gray-400 font-normal">' + b.notas + '</p>' : ''}</td>
      <td class="p-2.5 font-mono font-bold text-amber-700">${b.semana}</td>
      <td class="p-2.5 font-black text-gray-800">${b.cantidad} ${b.unidad || 'Mts'}</td>
      <td class="p-2.5 text-center"><span class="px-2 py-0.5 rounded font-bold text-[10px] ${estiloBadge}">${b.estado}</span></td>
      <td class="p-2.5 text-gray-600">${b.registradoPorNombre}</td>
      <td class="p-2.5 text-center">${accionAlmacen}</td>
      <td class="p-2.5 text-center">${eliminarHTML}</td>
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

window.eliminarBloqueoMaterial = async (id, nombre) => {
  if (!esComprasAdmin()) {
    alert("Solo Compras Admin o Super Admin pueden borrar bloqueos.");
    return;
  }
  if (confirm(`¿Eliminar la restricción del material "${nombre}"?`)) {
    await deleteDoc(doc(db, "procurement_bloqueos", id));
  }
};

// Formulario Nueva Llegada
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
    tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-gray-400 italic">No hay registros de llegadas.</td></tr>`;
    return;
  }

  const esCompras = esComprasAdmin();

  filtradas.forEach(l => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50/70 border-b border-gray-100";

    let validacionHTML = l.validadoCompras 
      ? `<span class="text-green-700 font-bold text-xs"><i class="fa-solid fa-circle-check"></i> Validado</span>`
      : (esCompras 
          ? `<button onclick="window.validarLlegadaCompras('${l.id}')" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-2.5 py-1 rounded border border-emerald-200">Validar</button>`
          : `<span class="text-gray-300 text-[11px]">Pendiente</span>`);

    let eliminarHTML = esCompras
      ? `<button onclick="window.eliminarLlegadaMaterial('${l.id}', '${l.nombre}')" class="text-red-500 hover:text-red-700 font-bold text-xs cursor-pointer"><i class="fa-solid fa-trash-can"></i></button>`
      : `<span class="text-gray-300">—</span>`;

    tr.innerHTML = `
      <td class="p-2.5 font-mono font-bold text-gray-700">${l.item}</td>
      <td class="p-2.5 font-bold text-gray-800">${l.nombre}</td>
      <td class="p-2.5 font-mono font-bold text-gray-600">${l.semana}</td>
      <td class="p-2.5 font-black text-gray-700">${l.cantidad}</td>
      <td class="p-2.5 text-gray-600">${l.fechaEstimada || '—'}</td>
      <td class="p-2.5 font-bold ${l.fechaReal ? 'text-green-700' : 'text-amber-600'}">${l.fechaReal || 'En tránsito'}</td>
      <td class="p-2.5 text-center">${validacionHTML}</td>
      <td class="p-2.5 text-center">${eliminarHTML}</td>
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

window.eliminarLlegadaMaterial = async (id, nombre) => {
  if (!esComprasAdmin()) {
    alert("Solo Compras Admin o Super Admin pueden borrar llegadas.");
    return;
  }
  if (confirm(`¿Eliminar el registro de llegada de "${nombre}"?`)) {
    await deleteDoc(doc(db, "procurement_llegadas", id));
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

// ==================== MÓDULO TARJETAS (PD) ====================
function initModuloTarjetas() {
  const inputFecha = document.getElementById("card-fecha");
  if (inputFecha && !inputFecha.value) {
    const hoy = new Date();
    inputFecha.value = hoy.toLocaleDateString("es-BO");
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

  // Pegado Inteligente
  document.getElementById("btn-quick-distribute").onclick = () => {
    const raw = document.getElementById("input-quick-paste-row").value.trim();
    if (!raw) {
      alert("Copia una fila de tu tabla de Excel y pégala en el campo.");
      return;
    }

    let cols = raw.split("\t").map(c => c.trim()).filter(c => c !== "");
    if (cols.length < 4) {
      cols = raw.split(/\s{2,}/).map(c => c.trim()).filter(c => c !== "");
    }

    if (cols.length >= 4) {
      document.getElementById("card-costo-articulo").value = cols[0] || "";
      document.getElementById("card-costo-linea").value = cols[1] || "";
      document.getElementById("card-costo-marca").value = cols[2] || "BATA";
      document.getElementById("card-costo-material").value = cols[3] || "";
      document.getElementById("card-material-corte").value = cols[3] || "";

      if (cols.length === 7) {
        document.getElementById("card-costo-precio").value = cols[4] || "0.00";
        document.getElementById("card-costo-margen").value = cols[5] || "0%";
      } else if (cols.length >= 10) {
        document.getElementById("card-costo-precio").value = cols[8] || "0.00";
        document.getElementById("card-costo-margen").value = cols[9] || "0%";
      } else {
        document.getElementById("card-costo-precio").value = cols[cols.length - 3] || "0.00";
        document.getElementById("card-costo-margen").value = cols[cols.length - 2] || "0%";
      }

      renderTarjetasPreview();
    } else {
      alert("No se detectaron suficientes columnas. Pega directamente la fila copiada de Excel.");
    }
  };

  document.getElementById("select-copias-tarjeta").onchange = renderTarjetasPreview;

  [
    "card-costo-articulo", "card-costo-linea", "card-costo-marca", "card-costo-material", 
    "card-costo-precio", "card-costo-margen", "card-serie", "card-fecha", "card-material-corte", 
    "card-forro", "card-plant-int", "card-tecnico", "card-horma-suela", "card-construccion", "card-observaciones"
  ].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) elem.oninput = renderTarjetasPreview;
  });

  // Botón abrir modal de tarjetas
  document.getElementById("btn-imprimir-tarjetas-action").onclick = () => {
    const previewHTML = document.getElementById("contenedor-tarjetas-preview").innerHTML;
    document.getElementById("hoja-impresion-tarjetas").innerHTML = previewHTML;
    modalImpresionTarjetas.classList.remove("hidden");
  };

  // Botón ejecutar impresión calibrada mediante Iframe aislado
  document.getElementById("btn-ejecutar-print-tarjetas").onclick = () => {
    imprimirTarjetasEnIframe();
  };

  renderTarjetasPreview();
}

function imprimirTarjetasEnIframe() {
  const contenido = document.getElementById("contenedor-tarjetas-preview").innerHTML;
  
  // Crear iframe invisible temporal
  let iframe = document.getElementById("iframe-impresion-tarjetas");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "iframe-impresion-tarjetas";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
  }

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Tarjetas de Muestra - Bata Bolivia</title>
      <style>
        @page {
          size: letter portrait;
          margin: 6mm 8mm;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          margin: 0;
          padding: 0;
          background: #fff;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .shoe-card-container {
          width: 200mm;
          height: 34mm;
          max-height: 34mm;
          border-top: 1px solid #000;
          border-bottom: 1px solid #000;
          border-left: 1px solid #000;
          border-right: 1px solid #000;
          margin: 0 0 0 0 !important;
          padding: 0 !important;
          display: flex;
          font-size: 7.5px;
          line-height: 1.1;
          color: #000;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .shoe-panel {
          width: 66.66mm;
          height: 100%;
          box-sizing: border-box;
        }
      </style>
    </head>
    <body>
      ${contenido}
    </body>
    </html>
  `);
  doc.close();

  // Esperar a que rendericen las imágenes e invocar la impresión del iframe
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  }, 300);
}

function renderTarjetasPreview() {
  const container = document.getElementById("contenedor-tarjetas-preview");
  if (!container) return;

  const copias = parseInt(document.getElementById("select-copias-tarjeta").value) || 5;

  const articulo = document.getElementById("card-costo-articulo").value || "34461836";
  const linea = (document.getElementById("card-costo-linea").value || "QUIQUE").toUpperCase();
  const marca = document.getElementById("card-costo-marca").value || "TEENER";
  const precio = document.getElementById("card-costo-precio").value || "259.00";
  const margen = document.getElementById("card-costo-margen").value || "55.00%";

  const serie = document.getElementById("card-serie").value || "37-44";
  const fecha = document.getElementById("card-fecha").value || "4/9/2026";
  const materialCorte = document.getElementById("card-material-corte").value || "IMITACION";
  const forro = document.getElementById("card-forro").value || "DNE FORRO CARAMELO";
  const plantInt = document.getElementById("card-plant-int").value || "DNE PLANT CAMEL PIG SKIN";
  const tecnico = (document.getElementById("card-tecnico").value || "JAVIER GOMEZ").toUpperCase();
  const hormaSuela = (document.getElementById("card-horma-suela").value || "MARVIN").toUpperCase();
  const construccion = (document.getElementById("card-construccion").value || "TRUE MOC").toUpperCase();
  const observaciones = document.getElementById("card-observaciones").value || "";

  const siluetaCalzadoHTML = croquisTarjetaBase64 
    ? `<img src="${croquisTarjetaBase64}" style="width:100%; height:38px; object-fit:contain; margin:auto;">`
    : `<div style="height:38px; display:flex; align-items:center; justify-content:center; font-size:9px; color:#999; border:1px dashed #ccc; border-radius:4px;">Croquis</div>`;

  const siluetaPlantillaHTML = plantillaCorteTarjetaBase64 
    ? `<img src="${plantillaCorteTarjetaBase64}" style="width:100%; height:38px; object-fit:contain; margin:auto;">`
    : siluetaCalzadoHTML;

  let tarjetasHTML = "";

  for (let i = 1; i <= copias; i++) {
    let bgColorLateral = "#FFFFFF";
    let etiquetaAprobacion = "PRODUCCIÓN";
    let esTarjetaCorte = false;

    if (copias === 5) {
      if (i === 1) {
        bgColorLateral = "#FFFFFF";
        etiquetaAprobacion = "CORTE (PRODUCCIÓN)";
        esTarjetaCorte = true;
      } else if (i === 2) {
        bgColorLateral = "#FFFFFF";
        etiquetaAprobacion = "PRODUCCIÓN";
      } else if (i === 3) {
        bgColorLateral = "#80C342"; // Verde Claro Retail (C:50% M:0% Y:100% K:0%)
        etiquetaAprobacion = "RETAIL";
      } else if (i === 4) {
        bgColorLateral = "#FFF200"; // Amarillo Planeamiento
        etiquetaAprobacion = "PLANEAMIENTO";
      } else if (i === 5) {
        bgColorLateral = "#E06D8A"; // Rosado Exportaciones (C:10% M:65% Y:30% K:0%)
        etiquetaAprobacion = "EXPORTACIÓN";
      }
    } else if (copias === 4) {
      if (i === 1) {
        bgColorLateral = "#FFFFFF";
        etiquetaAprobacion = "CORTE (PRODUCCIÓN)";
        esTarjetaCorte = true;
      } else if (i === 2) {
        bgColorLateral = "#80C342";
        etiquetaAprobacion = "RETAIL";
      } else if (i === 3) {
        bgColorLateral = "#FFF200";
        etiquetaAprobacion = "PLANEAMIENTO";
      } else if (i === 4) {
        bgColorLateral = "#E06D8A";
        etiquetaAprobacion = "EXPORTACIÓN";
      }
    } else {
      if (i === 1) esTarjetaCorte = true;
    }

    const imagenIzquierdaHTML = esTarjetaCorte ? siluetaPlantillaHTML : siluetaCalzadoHTML;

    tarjetasHTML += `
      <div class="shoe-card-container" style="background:#fff; display:flex; font-size:7.5px; line-height:1.1; color:#000;">
        <!-- SECCIÓN 1 (66.6 mm) -->
        <div class="shoe-panel" style="display:flex; border-right:1px dashed #555; overflow:hidden;">
          <div class="lateral-tab" style="width:16px; border-right:1px solid #000; display:flex; align-items:center; justify-content:center; font-weight:900; letter-spacing:0.1em; font-size:9px; writing-mode:vertical-rl; transform:rotate(180deg); background-color:${bgColorLateral} !important;">
            ${linea}
          </div>
          
          <div style="flex:1; display:flex; flex-direction:column; justify-content:space-between; padding:2px;">
            <div style="font-size:8px; font-weight:900; color:#dc2626; text-align:center; border-bottom:1px solid #000; padding-bottom:1px;">
              MANUFACTURA BOLIVIANA S.A.
            </div>

            <div style="display:flex; flex:1;">
              <div style="width:65px; display:flex; flex-direction:column; justify-content:space-between; border-right:1px solid #000; padding-right:2px;">
                ${imagenIzquierdaHTML}
                <span style="font-size:6.5px; font-weight:bold;">FECHA: ${fecha}</span>
              </div>

              <div style="flex:1; padding-left:4px; display:flex; flex-direction:column; justify-content:space-between;">
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #e5e7eb;">
                  <span style="font-weight:bold;">ART:</span>
                  <span style="font-weight:900; font-size:9px; font-family:monospace;">${articulo}</span>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #e5e7eb;">
                  <span style="font-weight:bold;">MARCA:</span>
                  <span>${marca}</span>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #e5e7eb;">
                  <span style="font-weight:bold;">SERIE:</span>
                  <span>${serie}</span>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #e5e7eb; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  <span style="font-weight:bold;">CORTE:</span>
                  <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${materialCorte}</span>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #e5e7eb; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  <span style="font-weight:bold;">FORRO:</span>
                  <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${forro}</span>
                </div>
                <div style="display:flex; justify-content:space-between; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  <span style="font-weight:bold;">PLANT:</span>
                  <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${plantInt}</span>
                </div>
              </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:2px; border-top:1px solid #000; font-size:6.5px; font-weight:600; padding-top:1px;">
              <div>TEC: ${tecnico}</div>
              <div>SUELA: ${hormaSuela}</div>
              <div>PRECIO: <b>${precio}</b></div>
              <div>MRG: <b>${margen}</b></div>
            </div>
          </div>
        </div>

        <!-- SECCIÓN 2 (66.6 mm) -->
        <div class="shoe-panel" style="display:flex; flex-direction:column; justify-content:space-between; padding:5px; border-right:1px dashed #555; font-size:7px;">
          <div style="font-size:7.5px; font-weight:900; text-align:center; color:#374151; text-transform:uppercase; border-bottom:1px solid #d1d5db; padding-bottom:2px;">
            APROBACIONES (${etiquetaAprobacion})
          </div>

          <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:4px; text-align:center;">
            <div style="border-bottom:1px solid #000; padding-bottom:2px;">
              <span style="font-weight:bold; display:block;">P.D. CHIEF</span>
              <span style="font-size:6px; color:#9ca3af;">Fecha: ___/___/___</span>
            </div>
            <div style="border-bottom:1px solid #000; padding-bottom:2px;">
              <span style="font-weight:bold; display:block;">MERCHANDISING MAN.</span>
              <span style="font-size:6px; color:#9ca3af;">Fecha: ___/___/___</span>
            </div>
          </div>

          <div style="text-align:center; border-bottom:1px solid #000; padding-bottom:2px; margin:auto; width:75%;">
            <span style="font-weight:bold; display:block;">PURCHASING MANAGER</span>
            <span style="font-size:6px; color:#9ca3af;">Fecha: ___/___/___</span>
          </div>

          <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:4px; text-align:center;">
            <div style="border-bottom:1px solid #000; padding-bottom:2px;">
              <span style="font-weight:bold; display:block;">PRODUCTION MANAGER</span>
              <span style="font-size:6px; color:#9ca3af;">Fecha: ___/___/___</span>
            </div>
            <div style="border-bottom:1px solid #000; padding-bottom:2px;">
              <span style="font-weight:bold; display:block;">COUNTRY MANAGER</span>
              <span style="font-size:6px; color:#9ca3af;">Fecha: ___/___/___</span>
            </div>
          </div>
        </div>

        <!-- SECCIÓN 3 (66.6 mm) -->
        <div class="shoe-panel" style="padding:5px; display:flex; flex-direction:column; justify-content:space-between; font-size:7.5px;">
          <div>
            <span style="font-weight:900; color:#1f2937; text-transform:uppercase; display:block; margin-bottom:2px;">OBSERVACIONES:</span>
            <p style="font-size:7px; color:#374151; font-style:italic; line-height:1.2;">${observaciones || 'Sin observaciones adicionales'}</p>
          </div>
          <div style="display:flex; flex-direction:column; gap:4px;">
            <div style="border-bottom:1px dotted #9ca3af; height:6px;"></div>
            <div style="border-bottom:1px dotted #9ca3af; height:6px;"></div>
            <div style="border-bottom:1px dotted #9ca3af; height:6px;"></div>
            <div style="text-align:right; font-size:6px; color:#9ca3af; font-weight:bold; letter-spacing:0.1em;">BATA BOLIVIA PD</div>
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = tarjetasHTML;
}
