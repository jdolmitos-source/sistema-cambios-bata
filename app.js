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
let semanaProduccionSeleccionada = "SEM-37";

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

function esJefeProduccion() {
  if (esSuperAdmin()) return true;
  return userData && (userData.rol === "Jefe de Producción");
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

// ==================== APERTURA DE MODALES GLOBALES ====================
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

// ==================== TABLA GENERAL DE ENTREGAS ====================
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
    const semStr = (item.semana || "").toString().toLowerCase().trim();
    const proyStr = (item.proyecto || "").toString().toLowerCase().trim();
    const coincideSem = !colFiltroSemanaEntregas || semStr.includes(colFiltroSemanaEntregas);
    const coincideProy = !colFiltroProyectoEntregas || proyStr.includes(colFiltroProyectoEntregas);
    return coincideCategoria && coincideSem && coincideProy;
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
      ? `<img src="${ent.foto}" onclick="window.verFotoGrande('${ent.foto}', '${ent.proyecto} - ${ent.articulo || ent.tipo}')" class="w-10 h-7 object-cover rounded border border-gray-200 shadow-xs cursor-pointer hover:opacity-80 transition mx-auto" title="Click para ampliar">`
      : `<div class="w-10 h-7 rounded border border-dashed border-gray-200 flex items-center justify-center text-gray-300 text-[10px] mx-auto"><i class="fa-regular fa-image"></i></div>`;

    const tdFotoHTML = (categoriaEntregaActiva !== "MATERIALES" && categoriaEntregaActiva !== "TIZADORES") ? `<td class="p-2 border-r border-gray-100 text-center">${fotoHTML}</td>` : '';
    const tdArticuloHTML = categoriaEntregaActiva !== "MATERIALES" ? `<td class="p-3 font-mono text-gray-700 border-r border-gray-100">${ent.articulo || '—'}</td>` : '';

    let detalleExtra = "";
    if (ent.copias) detalleExtra += `<span class="bg-rose-100 text-rose-800 font-bold text-[9px] px-1.5 py-0.2 rounded ml-1">${ent.copias} copias</span>`;
    if (ent.notas) detalleExtra += `<p class="text-[10px] text-gray-400 mt-0.5">${ent.notas}</p>`;

    tr.innerHTML = `
      ${tdFotoHTML}
      <td class="p-3 font-bold text-gray-700 border-r border-gray-100 font-mono">${ent.semana || '—'}</td>
      <td class="p-3 text-gray-600 border-r border-gray-100 whitespace-nowrap">${formatearFecha(ent.fechaEntrega)}</td>
      <td class="p-3 font-bold text-gray-800 border-r border-gray-100">${ent.proyecto || '—'}</td>
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

// Escucha en tiempo real de Solicitudes
function escucharCambios() {
  const q = collection(db, "solicitudes_cambios");
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
    solicitudes.sort((a, b) => (b.fechaCreacion || "").localeCompare(a.fechaCreacion || ""));
    renderTabla();
    actualizarInformePorSemana();
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
  const empty = document.getElementById("table-empty-state");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (solicitudes.length === 0) {
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");

  const esAdmin = esSuperAdmin();
  const esDesarrolloUsuario = esDesarrollo() || esAdmin;
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
    if (esDesarrolloUsuario) {
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

// Solicitudes y Minutas
const formMinuta = document.getElementById("form-minuta");
if (formMinuta) {
  formMinuta.onsubmit = async (e) => {
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

      formMinuta.reset();
      modalMinuta?.classList.add("hidden");

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

const formNewChange = document.getElementById("form-new-change");
if (formNewChange) {
  formNewChange.onsubmit = async (e) => {
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
        solicitanteNombre: (userData && userData.nombre) || (currentUser && currentUser.email) || "Usuario",
        solicitanteRol: (userData && userData.rol) || "Usuario",
        solicitanteId: currentUser.uid,
        estado: "En proceso",
        fechaRealizado: null,
        validadoCostos: false,
        fechaCreacion: new Date().toISOString(),
        timestamp: serverTimestamp()
      });

      formNewChange.reset();
      modalNewChange?.classList.add("hidden");

      abrirModalWhatsApp({
        titulo: "Solicitud Registrada",
        subtitulo: "Notificar solicitud creada al equipo:",
        mensajeTexto: `👞 *NUEVA SOLICITUD DE CAMBIO - BATA BOLIVIA*\n\n📅 *Semana:* ${semana}\n📌 *Proyecto:* ${proyecto}\n🔢 *Artículo:* ${articulo}\n👤 *Solicitado por:* ${(userData && userData.nombre) || 'Usuario'} (${(userData && userData.rol) || ''})\n📝 *Cambio:* ${boxCambio}\n\n_Revisar en el Sistema de Gestión de Cambios Bata_`
      });
    } catch (err) {
      alert("Error: " + err.message);
    }
  };
}

// Configuración de campos dinámicos en Entrega
const selEntTipo = document.getElementById("ent-tipo");
if (selEntTipo) selEntTipo.onchange = actualizarCamposSegunTipoEntrega;

function actualizarCamposSegunTipoEntrega() {
  const tipo = document.getElementById("ent-tipo")?.value || "";
  const selectDestino = document.getElementById("ent-destino");
  const boxArticulo = document.getElementById("box-field-articulo");
  const labelProy = document.getElementById("label-field-proyecto");
  const inputProy = document.getElementById("ent-proyecto");
  const boxFoto = document.getElementById("box-field-foto");
  const boxCopias = document.getElementById("box-field-copias");
  const containerSingle = document.getElementById("container-destino-single");
  const containerMultiple = document.getElementById("container-destino-multiple");

  if (!selectDestino) return;
  selectDestino.innerHTML = "";
  boxCopias?.classList.add("hidden");
  containerMultiple?.classList.add("hidden");
  containerSingle?.classList.remove("hidden");
  boxFoto?.classList.add("hidden");

  if (tipo === "MATERIALES") {
    if (labelProy) labelProy.textContent = "Nombre del Material / Insumo";
    if (inputProy) inputProy.placeholder = "Ej: Badana Beige 1.2mm";
    boxArticulo?.classList.add("hidden");
    selectDestino.innerHTML += `<option value="Desarrollo de producto">Desarrollo de producto</option>`;
    selectDestino.innerHTML += `<option value="Producción">Producción</option>`;
    return;
  }

  boxArticulo?.classList.remove("hidden");
  if (labelProy) labelProy.textContent = "Nombre del Proyecto";
  if (inputProy) inputProy.placeholder = "Ej: SKATER";

  if (tipo === "GUÍA DE PRODUCCIÓN") {
    boxFoto?.classList.remove("hidden");
    selectDestino.innerHTML += `<option value="Costos">Costos</option>`;
  }
  else if (tipo === "CORTE") {
    boxFoto?.classList.remove("hidden");
    selectDestino.innerHTML += `<option value="Costos">Costos</option>`;
    selectDestino.innerHTML += `<option value="Producción">Producción</option>`;
  }
  else if (tipo === "MUESTRA DEFINITIVA") {
    boxFoto?.classList.remove("hidden");
    containerSingle?.classList.add("hidden");
    containerMultiple?.classList.remove("hidden");
  }
  else if (tipo === "HOJA DE DESBASTE") {
    boxFoto?.classList.remove("hidden");
    selectDestino.innerHTML += `<option value="Costos">Costos</option>`;
    selectDestino.innerHTML += `<option value="Producción">Producción</option>`;
  }
  else if (tipo === "TIZADORES") {
    boxCopias?.classList.remove("hidden");
    selectDestino.innerHTML += `<option value="Producción">Producción</option>`;
  } else {
    boxFoto?.classList.remove("hidden");
    selectDestino.innerHTML += `<option value="Producción">Producción</option>`;
    selectDestino.innerHTML += `<option value="Costos">Costos</option>`;
  }
}

// Formulario Entrega
const formEntrega = document.getElementById("form-nueva-entrega");
if (formEntrega) {
  formEntrega.onsubmit = async (e) => {
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
      const rolUsuario = (userData && userData.rol) || (esSuperAdmin() ? "Super Admin" : "Desarrollo de producto");

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

      formEntrega.reset();
      modalNuevaEntrega?.classList.add("hidden");

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
}

// ==================== MÓDULO PRODUCCIÓN (DASHBOARD DIARIO POR LÍNEAS) ====================
function escucharProduccion() {
  const q = collection(db, "produccion_lotes");
  onSnapshot(q, (snapshot) => {
    lotesProduccion = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    lotesProduccion.sort((a, b) => (b.fechaRegistro || "").localeCompare(a.fechaRegistro || ""));
    renderProduccionView();
  }, (err) => console.log("Aviso Firestore Producción:", err.message));
}

const selSemanaProd = document.getElementById("prod-filter-semana");
if (selSemanaProd) {
  selSemanaProd.onchange = (e) => {
    semanaProduccionSeleccionada = e.target.value;
    renderProduccionView();
  };
}

function renderProduccionView() {
  const tbody = document.getElementById("table-produccion-body");
  const empty = document.getElementById("produccion-empty-state");
  if (!tbody) return;
  tbody.innerHTML = "";

  // Filtrar por semana seleccionada
  const lotesSemana = lotesProduccion.filter(l => (l.semana || "SEM-37") === semanaProduccionSeleccionada);

  let paresCortado = 0;
  let paresAparado = 0;
  let paresArmado = 0;
  let paresInyeccion = 0;

  lotesSemana.forEach(lote => {
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

  if (lotesSemana.length === 0) {
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");

  const esJefe = esJefeProduccion();
  const puedeEliminar = esSuperAdmin() || esJefe;

  // Agrupar o listar por línea
  lotesSemana.forEach(lote => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50/80 transition border-b border-gray-200 text-center";

    let badgeColor = "bg-amber-100 text-amber-800 border-amber-300";
    if (lote.estado === "APARADO") badgeColor = "bg-blue-100 text-blue-800 border-blue-300";
    if (lote.estado === "ARMADO") badgeColor = "bg-purple-100 text-purple-800 border-purple-300";
    if (lote.estado === "INYECCIÓN") badgeColor = "bg-emerald-100 text-emerald-800 border-emerald-300";

    // Pares Editables por Jefe de Producción
    let celdaParesHTML = "";
    if (esJefe) {
      celdaParesHTML = `
        <div class="flex items-center justify-center space-x-1">
          <input type="number" min="1" id="in-pares-${lote.id}" value="${lote.pares}" class="w-16 px-1.5 py-0.5 border border-cyan-300 rounded font-bold text-center text-cyan-900">
          <button onclick="window.guardarParesLote('${lote.id}')" title="Actualizar pares" class="bg-cyan-600 hover:bg-cyan-700 text-white p-1 rounded cursor-pointer">
            <i class="fa-solid fa-floppy-disk text-[10px]"></i>
          </button>
        </div>
      `;
    } else {
      celdaParesHTML = `<span class="font-black text-cyan-900">${(parseInt(lote.pares) || 0).toLocaleString()}</span>`;
    }

    // Estado Editable por Jefe de Producción
    let celdaEstadoHTML = "";
    if (esJefe) {
      celdaEstadoHTML = `
        <select onchange="window.actualizarEstadoLote('${lote.id}', this.value)" class="px-2 py-1 border border-gray-300 rounded text-xs font-bold bg-white text-gray-800">
          <option value="CORTADO" ${lote.estado === 'CORTADO' ? 'selected' : ''}>CORTADO</option>
          <option value="APARADO" ${lote.estado === 'APARADO' ? 'selected' : ''}>APARADO</option>
          <option value="ARMADO" ${lote.estado === 'ARMADO' ? 'selected' : ''}>ARMADO</option>
          <option value="INYECCIÓN" ${lote.estado === 'INYECCIÓN' ? 'selected' : ''}>INYECCIÓN</option>
        </select>
      `;
    } else {
      celdaEstadoHTML = `<span class="px-2 py-0.5 rounded border font-black text-[10px] ${badgeColor}">${lote.estado}</span>`;
    }

    let alertaHTML = lote.alerta ? `<span class="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded text-[10px] border border-amber-300 block">${lote.alerta}</span>` : '<span class="text-gray-300">—</span>';
    let accionesHTML = puedeEliminar ? `<button onclick="window.eliminarLoteProduccion('${lote.id}')" class="text-red-500 hover:text-red-700 text-xs p-1" title="Eliminar Lote"><i class="fa-solid fa-trash-can"></i></button>` : '—';

    tr.innerHTML = `
      <td class="p-3 font-black text-gray-900 border-r border-gray-200 bg-gray-50">${lote.linea || '330'}</td>
      <td class="p-3 font-bold text-cyan-800 border-r border-gray-200">${lote.dia || 'LUNES'}</td>
      <td class="p-3 font-mono font-bold text-gray-800 border-r border-gray-200">${lote.plan || '—'}</td>
      <td class="p-3 font-mono text-gray-700 border-r border-gray-200">${lote.articulo}</td>
      <td class="p-3 font-bold text-gray-800 border-r border-gray-200 text-left">${lote.proyecto}</td>
      <td class="p-3 border-r border-gray-200">${celdaParesHTML}</td>
      <td class="p-3 border-r border-gray-200">${celdaEstadoHTML}</td>
      <td class="p-3 border-r border-gray-200 text-left">${alertaHTML}</td>
      <td class="p-3">${accionesHTML}</td>
    `;
    tbody.appendChild(tr);
  });
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
      modalNuevoLoteProd?.classList.add("hidden");
    } catch (err) {
      alert("Error al registrar lote: " + err.message);
    }
  };
}

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
