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

// Memoria Tarjetas
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

const safeClick = (id, fn) => {
  const el = document.getElementById(id);
  if (el) el.onclick = fn;
};

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
    actualizarCamposSegunTipoEntrega();
  }
  document.getElementById("modal-nueva-entrega")?.classList.remove("hidden");
};

window.abrirModalBloqueo = () => {
  document.getElementById("modal-nuevo-bloqueo")?.classList.remove("hidden");
};

window.abrirModalLlegada = () => {
  document.getElementById("modal-nueva-llegada")?.classList.remove("hidden");
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

// Controles y Modales
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
    activarVistaCambios();
    escucharCambios();
    escucharEntregas();
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

  viewCambios?.classList.add("hidden");
  viewInforme?.classList.add("hidden");
  viewEntregas?.classList.add("hidden");
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

  const chkAll = document.getElementById("chk-toggle-all-semana");
  if (chkAll) {
    chkAll.onchange = (e) => {
      const chks = document.querySelectorAll(".chk-articulo-informe");
      chks.forEach(c => c.checked = e.target.checked);
      actualizarConteoSeleccionados();
    };
  }
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

  const kTotal = document.getElementById("kpi-sem-total");
  const kRet = document.getElementById("kpi-sem-retrasados");
  const kProc = document.getElementById("kpi-sem-proceso");
  const kReal = document.getElementById("kpi-sem-realizados");
  const kCost = document.getElementById("kpi-sem-costos");

  if (kTotal) kTotal.textContent = total;
  if (kRet) kRet.textContent = retrasados;
  if (kProc) kProc.textContent = enProceso;
  if (kReal) kReal.textContent = realizados;
  if (kCost) kCost.textContent = `${validadosCostos} de ${total}`;

  const badgeContainer = document.getElementById("badge-congelamiento-container");
  if (badgeContainer) {
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
  }

  const tbody = document.getElementById("table-informe-articulos-body");
  if (!tbody) return;
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

  safeClick("btn-open-nuevo-bloqueo", () => modalNuevoBloqueo?.classList.remove("hidden"));
  safeClick("btn-open-nueva-llegada", () => modalNuevaLlegada?.classList.remove("hidden"));

  const fItem = document.getElementById("col-filter-item-llegada");
  const fNom = document.getElementById("col-filter-nombre-llegada");
  const fSem = document.getElementById("col-filter-semana-llegada");

  if (fItem) fItem.oninput = (e) => { colFiltroItemLlegada = e.target.value.trim().toLowerCase(); renderTablaLlegadas(); };
  if (fNom) fNom.oninput = (e) => { colFiltroNombreLlegada = e.target.value.trim().toLowerCase(); renderTablaLlegadas(); };
  if (fSem) fSem.oninput = (e) => { colFiltroSemanaLlegada = e.target.value.trim().toLowerCase(); renderTablaLlegadas(); };

  safeClick("btn-reporte-llegadas-pdf", abrirReporteImpresoLlegadas);
}

const formBloqueo = document.getElementById("form-nuevo-bloqueo");
if (formBloqueo) {
  formBloqueo.onsubmit = async (e) => {
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

      formBloqueo.reset();
      modalNuevoBloqueo?.classList.add("hidden");

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
}

function renderTablaBloqueos() {
  const tbody = document.getElementById("table-bloqueos-body");
  if (!tbody) return;
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

const formLlegada = document.getElementById("form-nueva-llegada");
if (formLlegada) {
  formLlegada.onsubmit = async (e) => {
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

      formLlegada.reset();
      modalNuevaLlegada?.classList.add("hidden");
    } catch (err) {
      alert("Error al guardar llegada: " + err.message);
    }
  };
}

function renderTablaLlegadas() {
  const tbody = document.getElementById("table-llegadas-body");
  if (!tbody) return;
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
  modalReporteLlegadasPrint?.classList.remove("hidden");
}

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
        solicitanteId: currentUser ? currentUser.uid : null,
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
