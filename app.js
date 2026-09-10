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

// ==================== FUNCIONES GLOBALES DE APERTURA ====================
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
safeClick("modal-btn-close", () => modalNewChange?.classList.add("hidden"));
safeClick("modal-btn-cancel", () => modalNewChange?.classList.add("hidden"));
safeClick("close-nuevo-lote-prod", () => modalNuevoLoteProd?.classList.add("hidden"));
safeClick("cancel-nuevo-lote-prod", () => modalNuevoLoteProd?.classList.add("hidden"));

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
    inicializarSemanas01a52();
    activarVistaCambios();
    escucharCambios();
    escucharEntregas();
    escucharProduccion();
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
const viewInforme = document.getElementById("view-informe");
const viewEntregas = document.getElementById("view-entregas");
const viewProduccion = document.getElementById("view-produccion");
const viewProcurement = document.getElementById("view-procurement");
const viewTarjetas = document.getElementById("view-tarjetas");
const viewUsuarios = document.getElementById("view-usuarios");

const menuBtnCambios = document.getElementById("menu-btn-cambios");
const menuBtnInforme = document.getElementById("menu-btn-informe");
const menuBtnEntregasTodas = document.getElementById("menu-btn-entregas-todas");
const menuBtnProduccion = document.getElementById("menu-btn-produccion");
const menuBtnProcurement = document.getElementById("menu-btn-procurement");
const menuBtnTarjetas = document.getElementById("menu-btn-tarjetas");
const menuBtnUsuarios = document.getElementById("menu-btn-usuarios");

const CLASE_INACTIVO_PRINCIPAL = "sidebar-btn w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-bold text-xs text-white hover:bg-white/15 transition cursor-pointer";
const CLASE_INACTIVO_SUB = "sidebar-btn sub-ent-btn w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white/90 hover:bg-white/15 hover:text-white transition cursor-pointer pl-5";
const CLASE_ACTIVO_PASTILLA = "sidebar-btn w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-black text-xs bg-white text-[#D61B28] shadow-md transition cursor-pointer scale-[1.02]";
const CLASE_ACTIVO_SUB_PASTILLA = "sidebar-btn sub-ent-btn w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-black bg-white text-[#D61B28] shadow-md transition cursor-pointer pl-5 scale-[1.02]";

function resetMenuStyles() {
  [menuBtnCambios, menuBtnInforme, menuBtnEntregasTodas, menuBtnProduccion, menuBtnProcurement, menuBtnTarjetas, menuBtnUsuarios].forEach(b => {
    if (b) b.className = CLASE_INACTIVO_PRINCIPAL;
  });

  document.querySelectorAll(".sub-ent-btn").forEach(b => {
    b.className = CLASE_INACTIVO_SUB;
  });

  viewCambios?.classList.add("hidden");
  viewInforme?.classList.add("hidden");
  viewEntregas?.classList.add("hidden");
  viewProduccion?.classList.add("hidden");
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

// ==================== MÓDULO PRODUCCIÓN WORK PLANNER ====================
function escucharProduccion() {
  const q = collection(db, "produccion_lotes");
  onSnapshot(q, (snapshot) => {
    lotesProduccion = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProduccionView();
  }, (err) => console.log("Aviso Firestore Producción:", err.message));
}

const formLoteProd = document.getElementById("form-nuevo-lote-prod");
if (formLoteProd) {
  formLoteProd.onsubmit = async (e) => {
    e.preventDefault();
    const semana = document.getElementById("lote-semana").value;
    const dia = document.getElementById("lote-dia").value;
    const linea = document.getElementById("lote-linea").value;
    const plan = document.getElementById("lote-plan").value.trim();
    const proyecto = document.getElementById("lote-proyecto").value.trim();
    const articulo = document.getElementById("lote-articulo").value.trim();
    const estado = document.getElementById("lote-estado").value;
    const pares = parseInt(document.getElementById("lote-pares").value) || 0;

    try {
      await addDoc(collection(db, "produccion_lotes"), {
        semana, dia, linea, plan, proyecto, articulo, estado, pares,
        fechaRegistro: new Date().toISOString()
      });
      formLoteProd.reset();
      modalNuevoLoteProd?.classList.add("hidden");
      renderProduccionView();
    } catch (err) {
      alert("Error al registrar lote: " + err.message);
    }
  };
}

window.actualizarEstadoDiaLote = async (id, nuevoEstado) => {
  if (!id) return;
  await updateDoc(doc(db, "produccion_lotes", id), {
    estado: nuevoEstado,
    fechaActualizacion: new Date().toISOString()
  });
};

window.eliminarTodosRegistrosProduccion = async () => {
  if (confirm("⚠️ ¿Estás seguro de eliminar TODOS los registros de producción para empezar de 0?")) {
    try {
      const snap = await getDocs(collection(db, "produccion_lotes"));
      const promises = snap.docs.map(d => deleteDoc(doc(db, "produccion_lotes", d.id)));
      await Promise.all(promises);
      alert("Todos los registros de producción han sido eliminados.");
      renderProduccionView();
    } catch (err) {
      alert("Error: " + err.message);
    }
  }
};

window.exportarExcelProduccion = () => {
  const tabla = document.getElementById("tabla-export-excel");
  if (!tabla) return;
  let html = tabla.outerHTML;
  let blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel' });
  let url = URL.createObjectURL(blob);
  let a = document.createElement('a');
  a.href = url;
  a.download = `Work_Planner_Produccion_${new Date().toISOString().slice(0,10)}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

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
    const semMatch = !fSem || (l.semana || "").trim().toLowerCase() === fSem.trim().toLowerCase();
    const proyMatch = !fProy || (l.proyecto || "").toLowerCase().includes(fProy) || (l.plan || "").toLowerCase().includes(fProy) || (l.articulo || "").toLowerCase().includes(fProy);
    const linMatch = !fLin || String(l.linea || "") === String(fLin);
    return semMatch && proyMatch && linMatch;
  });

  let totCortado = 0, totAparado = 0, totArmado = 0, totInyeccion = 0, totEntregado = 0;
  filtrados.forEach(l => {
    const p = parseInt(l.pares) || 0;
    if (l.estado === "CORTADO") totCortado += p;
    else if (l.estado === "APARADO") totAparado += p;
    else if (l.estado === "ARMADO") totArmado += p;
    else if (l.estado === "INYECCIÓN") totInyeccion += p;
    else if (l.estado === "ENTREGADO") totEntregado += p;
  });

  const grandTotal = totCortado + totAparado + totArmado + totInyeccion + totEntregado;
  const setKpi = (idVal, idBar, val) => {
    const vEl = document.getElementById(idVal);
    const bEl = document.getElementById(idBar);
    if (vEl) vEl.textContent = val.toLocaleString();
    if (bEl && grandTotal > 0) bEl.style.width = `${Math.round((val / grandTotal) * 100)}%`;
  };

  const elTotKpi = document.getElementById("prod-total-pares-kpi");
  if (elTotKpi) elTotKpi.textContent = `${grandTotal.toLocaleString()} Pares Totales`;

  setKpi("kpi-cortado", "bar-cortado", totCortado);
  setKpi("kpi-aparado", "bar-aparado", totAparado);
  setKpi("kpi-armado", "bar-armado", totArmado);
  setKpi("kpi-inyeccion", "bar-inyeccion", totInyeccion);
  setKpi("kpi-entregado", "bar-entregado", totEntregado);

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
          const estado = (loteDia.estado || "").toUpperCase();
          
          // Colores unificados idénticos a los KPIs de la Imagen 1 (Sin repeticiones)
          let colorEstado = 'text-amber-800 bg-amber-100 border-amber-300'; // Cortado (Ámbar)
          if (estado === 'APARADO') colorEstado = 'text-blue-800 bg-blue-100 border-blue-300'; // Aparado (Azul)
          else if (estado === 'ARMADO') colorEstado = 'text-purple-800 bg-purple-100 border-purple-300'; // Armado (Morado)
          else if (estado === 'INYECCIÓN') colorEstado = 'text-emerald-800 bg-emerald-100 border-emerald-300'; // Inyección (Turquesa/Esmeralda)
          else if (estado === 'ENTREGADO') colorEstado = 'text-green-900 bg-green-200 border-green-400'; // Entregado (Verde fuerte)

          html += `
            <td class="p-1 border border-gray-300 font-mono text-[10px] font-bold text-red-600">${loteDia.plan || '—'}</td>
            <td class="p-1 border border-gray-300 font-mono text-[10px]">${loteDia.articulo || '—'}</td>
            <td class="p-1 border border-gray-300 font-bold text-[10px] truncate max-w-[65px]">${loteDia.proyecto || '—'}</td>
            <td class="p-1 border border-gray-300 font-black text-cyan-900 bg-cyan-50/30">${p.toLocaleString()}</td>
            <td class="p-1 border border-gray-300">
              <select onchange="window.actualizarEstadoDiaLote('${loteDia.id}', this.value)" class="text-[10px] font-bold rounded px-1.5 py-0.5 border shadow-xs ${colorEstado}">
                <option value="CORTADO" ${estado === 'CORTADO' ? 'selected' : ''}>CORTADO</option>
                <option value="APARADO" ${estado === 'APARADO' ? 'selected' : ''}>APARADO</option>
                <option value="ARMADO" ${estado === 'ARMADO' ? 'selected' : ''}>ARMADO</option>
                <option value="INYECCIÓN" ${estado === 'INYECCIÓN' ? 'selected' : ''}>INYECCIÓN</option>
                <option value="ENTREGADO" ${estado === 'ENTREGADO' ? 'selected' : ''}>ENTREGADO</option>
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
    solicitudes = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    solicitudes.sort((a, b) => (b.fechaCreacion || "").localeCompare(a.fechaCreacion || ""));
    renderTabla();
  });
}

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
    tr.className = item.esMinuta ? "bg-amber-50/70 border-b border-amber-200" : "hover:bg-gray-50/80 transition border-b border-gray-100";

    let badgeMinuta = item.esMinuta ? `<span class="bg-amber-500 text-white font-black text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider block mb-1 w-fit">PLAN PILOTO</span>` : '';

    let estadoHTML = "";
    if (esDesarrolloUsuario) {
      estadoHTML = `
        <div class="flex items-center space-x-1.5">
          <select id="sel-estado-${item.id}" class="border border-orange-200 text-orange-600 bg-orange-50 font-semibold rounded-lg px-2 py-1 text-xs">
            <option value="En proceso" ${item.estado === "En proceso" ? "selected" : ""}>En proceso</option>
            <option value="Realizado" ${item.estado === "Realizado" ? "selected" : ""}>Realizado</option>
            <option value="Retrasado" ${item.estado === "Retrasado" ? "selected" : ""}>Retrasado</option>
          </select>
          <button onclick="window.guardarCambioEstado('${item.id}', '${item.proyecto}', '${item.articulo}', '${item.semana || ''}')" class="bg-gray-100 hover:bg-[#D61B28] hover:text-white text-gray-600 p-1.5 rounded-lg text-xs transition cursor-pointer">
            <i class="fa-solid fa-floppy-disk"></i>
          </button>
        </div>
      `;
    } else {
      estadoHTML = `<span class="border px-3 py-1 rounded-lg font-bold text-xs">${item.estado}</span>`;
    }

    const fechaRealizadoHTML = item.fechaRealizado ? `<span class="font-bold text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200">${formatearFecha(item.fechaRealizado)}</span>` : `<span class="text-gray-300 text-[11px]">—</span>`;

    let costosHTML = "";
    if (item.estado === "Realizado") {
      if (item.validadoCostos) {
        costosHTML = `<span class="text-green-700 font-bold text-xs"><i class="fa-solid fa-circle-check"></i> Validado</span>`;
      } else {
        costosHTML = `<input type="checkbox" ${!esCostos ? "disabled" : ""} onchange="window.confirmarValidacionCostos('${item.id}', '${item.proyecto}', '${item.articulo}', this)" class="h-4 w-4 accent-[#D61B28] rounded border-gray-300 cursor-pointer">`;
      }
    } else {
      costosHTML = `<input type="checkbox" disabled class="h-4 w-4 text-gray-300 rounded border-gray-200 opacity-40">`;
    }

    const fotoHTML = item.foto ? `<img src="${item.foto}" onclick="window.verFotoGrande('${item.foto}', '${item.proyecto}')" class="w-10 h-7 object-cover rounded border cursor-pointer mx-auto">` : '—';

    tr.innerHTML = `
      <td class="p-2 border-r text-center">${fotoHTML}</td>
      <td class="p-3 font-bold border-r font-mono">${item.semana || '—'}</td>
      <td class="p-3 text-gray-600 border-r whitespace-nowrap">${formatearFecha(item.fechaCreacion)}</td>
      <td class="p-3 border-r whitespace-nowrap"><span class="font-bold block">${item.solicitanteNombre || '—'}</span></td>
      <td class="p-3.5 font-bold border-r">${badgeMinuta}${item.proyecto}</td>
      <td class="p-3.5 font-mono border-r">${item.articulo}</td>
      <td class="p-3.5 border-r">${item.boxCambio}</td>
      <td class="p-3.5 text-center border-r whitespace-nowrap">${estadoHTML}</td>
      <td class="p-3.5 text-center border-r whitespace-nowrap">${fechaRealizadoHTML}</td>
      <td class="p-3.5 text-center whitespace-nowrap">${costosHTML}</td>
    `;
    tbody.appendChild(tr);
  });
}

window.guardarCambioEstado = async (id, proyecto, articulo, semana) => {
  const select = document.getElementById(`sel-estado-${id}`);
  if (!select) return;
  const nuevoEstado = select.value;
  await updateDoc(doc(db, "solicitudes_cambios", id), {
    estado: nuevoEstado,
    fechaRealizado: nuevoEstado === "Realizado" ? new Date().toISOString() : null
  });
  alert("Estado guardado correctamente.");
};

window.confirmarValidacionCostos = async (id, proyecto, articulo, checkboxElem) => {
  if (confirm(`¿Validar costos de "${proyecto}"?`)) {
    await updateDoc(doc(db, "solicitudes_cambios", id), { validadoCostos: true });
  } else {
    checkboxElem.checked = false;
  }
};

// Panel Super Admin
async function cargarPanelSuperAdmin() {
  if (!esSuperAdmin()) return;
  const tbodyUsers = document.getElementById("table-users-body");
  const tbodySols = document.getElementById("table-admin-solicitudes-body");
  const tbodyEnts = document.getElementById("table-admin-entregas-body");

  try {
    const snap = await getDocs(collection(db, "usuarios"));
    if (tbodyUsers) {
      tbodyUsers.innerHTML = "";
      snap.forEach(docU => {
        const u = docU.data();
        const tr = document.createElement("tr");
        tr.className = "border-b";
        tr.innerHTML = `
          <td class="p-3"><img src="${u.foto || 'https://via.placeholder.com/30'}" class="w-7 h-7 rounded-full object-cover"></td>
          <td class="p-3 font-bold">${u.nombre || '—'}</td>
          <td class="p-3">${u.email || '—'}</td>
          <td class="p-3 font-mono">${u.celular || '—'}</td>
          <td class="p-3 font-semibold text-[#D61B28]">${u.rol}</td>
          <td class="p-3 text-center"><span class="text-xs text-gray-400">Activo</span></td>
        `;
        tbodyUsers.appendChild(tr);
      });
    }
  } catch (e) { console.error(e); }
}

// Procurement & Storage placeholder
function escucharProcurement() {}

// ==================== MÓDULO TARJETAS (PD) - CALIBRADO EXACTO SEGÚN ÚLTIMA IMAGEN ====================
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

  safeClick("btn-quick-distribute", () => {
    const raw = document.getElementById("input-quick-paste-row")?.value.trim() || "";
    if (!raw) {
      alert("Copia una fila de Excel y pégala aquí.");
      return;
    }
    let cols = raw.split("\t").map(c => c.trim()).filter(c => c !== "");
    if (cols.length < 4) {
      cols = raw.split(/\s{2,}/).map(c => c.trim()).filter(c => c !== "");
    }

    if (cols.length >= 4) {
      document.getElementById("card-costo-articulo").value = cols[0] || "";
      document.getElementById("card-costo-linea").value = cols[2] || "";
      document.getElementById("card-costo-marca").value = cols[3] || "BATA";
      document.getElementById("card-costo-budret").value = cols[10] || "37.39%";
      document.getElementById("card-costo-precio").value = cols[8] || "259.00";
      document.getElementById("card-costo-margen").value = cols[9] || "55.00%";
      renderTarjetasPreview();
    } else {
      alert("Columnas insuficientes. Pega directamente la fila copiada de Excel.");
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
    modalImpresionTarjetas?.classList.remove("hidden");
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
  const plantInt = (document.getElementById("card-plant-int")?.value || "PIQUE NEGRO").toUpperCase();
  const modelista = (document.getElementById("card-tecnico")?.value || "CARLOS ARCE").toUpperCase();
  const construccion = (document.getElementById("card-construccion")?.value || "TRUE MOC").toUpperCase();
  const suela = (document.getElementById("card-horma-suela")?.value || "QUIQUE").toUpperCase();
  const observaciones = document.getElementById("card-observaciones")?.value || "Sin observaciones adicionales";

  const siluetaCalzadoHTML = `<div style="height:28px; display:flex; align-items:center; justify-content:center; font-size:7px; color:#999; border:1px dashed #ccc;">Croquis</div>`;

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
        <div class="lateral-tab" style="width:14px; border-right:1px solid #000; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:8px; writing-mode:vertical-rl; transform:rotate(180deg); background-color:${tarj.color} !important;">
          ${linea}
        </div>
        <div style="flex:1; display:flex; flex-direction:column; justify-content:space-between; padding:1px;">
          <div style="font-size:7px; font-weight:900; color:#dc2626; text-align:center; border-bottom:1px solid #000;">MANUFACTURA BOLIVIANA S.A.</div>
          <div style="display:flex; flex:1; align-items:center;">
            <div style="width:40px; display:flex; justify-content:center; border-right:1px solid #000; height:100%;">${siluetaCalzadoHTML}</div>
            <div style="flex:1; height:100%;">
              <table style="width:100%; height:100%; border-collapse:collapse; font-size:5.5px; font-weight:900;">
                <tr style="border-bottom:1px solid #000;"><td style="border-right:1px solid #000; text-align:center;">ART:</td><td style="text-align:center; font-family:monospace; font-size:6.5px;">${articulo}</td></tr>
                <tr style="border-bottom:1px solid #000;"><td style="border-right:1px solid #000; text-align:center;">MARCA:</td><td style="text-align:center;">${marca}</td></tr>
                <tr style="border-bottom:1px solid #000;"><td style="border-right:1px solid #000; text-align:center;">SERIE:</td><td style="text-align:center;">${serie}</td></tr>
                <tr style="border-bottom:1px solid #000;"><td style="border-right:1px solid #000; text-align:center;">CORTE:</td><td style="text-align:center; font-size:4.5px;">${materialCorte}</td></tr>
                <tr style="border-bottom:1px solid #000;"><td style="border-right:1px solid #000; text-align:center;">FORRO:</td><td style="text-align:center; font-size:4.5px;">${forro}</td></tr>
                <tr><td style="border-right:1px solid #000; text-align:center;">PLANT:</td><td style="text-align:center; font-size:4.5px;">${plantInt}</td></tr>
              </table>
            </div>
          </div>
          <div style="display:flex; border-top:1px solid #000; font-size:5px; font-weight:bold; padding:1px; justify-content:space-between;"><span>${fecha}</span></div>
        </div>
      </div>
    `;

    // Módulo de Firmas ajustado exactamente a la altura de la línea roja que marcaste arriba
    const moduloFirmas = `
      <div class="shoe-panel" style="display:flex; flex-direction:column; justify-content:space-between; padding:2px 3px 2px 3px; font-size:5.5px; ${tarj.esCorte ? '' : 'border-right:1px solid #000;'}">
        <div style="font-size:6.5px; font-weight:900; text-align:center; text-transform:uppercase; border-bottom:1px solid #000; padding-bottom:1px;">${tarj.etiqueta}</div>
        <div style="display:flex; flex-direction:column; justify-content:space-between; flex:1; padding-top:1px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div><div style="border-bottom:1px solid #000; width:28mm; height:5px;"></div><span style="font-weight:bold; font-size:4.5px;">PD. CHIEF</span><br><span style="font-size:4px;">DATE: / /</span></div>
            <div style="text-align:right;"><div style="border-bottom:1px solid #000; width:31mm; height:5px; margin-left:auto;"></div><span style="font-weight:bold; font-size:4.5px;">MERCHANDISING MAN.</span><br><span style="font-size:4px;">DATE: / /</span></div>
          </div>
          <div style="text-align:center; margin: 0;">
            <div style="border-bottom:1px solid #000; width:34mm; height:5px; margin:auto;"></div>
            <span style="font-weight:bold; font-size:4.5px;">PURCHASING MANAGER</span><br><span style="font-size:4px;">DATE: / /</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:flex-end;">
            <div><div style="border-bottom:1px solid #000; width:28mm; height:5px;"></div><span style="font-weight:bold; font-size:4.5px;">PRODUCTION MANAGER</span><br><span style="font-size:4px;">DATE: / /</span></div>
            <div style="text-align:right;"><div style="border-bottom:1px solid #000; width:28mm; height:5px; margin-left:auto;"></div><span style="font-weight:bold; font-size:4.5px;">COUNTRY MANAGER</span><br><span style="font-size:4px;">DATE: / /</span></div>
          </div>
        </div>
      </div>
    `;

    const moduloObservaciones = `
      <div class="shoe-panel" style="padding:4px; display:flex; flex-direction:column; justify-content:space-between; font-size:6.5px; border-right:1px solid #000;">
        <div><span style="font-weight:900; text-transform:uppercase; display:block;">OBSERVACIONES:</span><p style="font-size:6px; font-style:italic;">${observaciones}</p></div>
        <div style="text-align:right; font-size:5.5px; font-weight:bold;">BATA BOLIVIA PD</div>
      </div>
    `;

    const panelCentro = tarj.esCorte ? moduloObservaciones : moduloFirmas;
    const panelDerecha = tarj.esCorte ? moduloFirmas : moduloObservaciones;

    tarjetasHTML += `<div class="shoe-card-container" style="background:#fff; display:flex; font-size:7px; color:#000;">${moduloInfo}${panelCentro}${panelDerecha}</div>`;
  });

  container.innerHTML = tarjetasHTML;
}
