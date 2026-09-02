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

// ⚠️ CORREO ÚNICO Y EXCLUSIVO DE SUPER ADMINISTRADOR
const SUPER_ADMIN_EMAIL = "jd.olmitos@gmail.com";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let userData = null;
let solicitudes = [];
let entregas = [];
let chartInstance = null;

// Filtros directos de tabla Informe
let colFiltroSemanaInforme = "";
let colFiltroProyectoInforme = "";

// Filtros directos de tabla Entregas
let colFiltroSemanaEntregas = "";
let colFiltroProyectoEntregas = "";

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  if (!file) return resolve(null);
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = error => reject(error);
});

// Comprobar estrictamente si es Super Admin (SOLO jd.olmitos@gmail.com)
function esSuperAdmin() {
  if (!currentUser || !currentUser.email) return false;
  return currentUser.email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}

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

// Reset de Contraseña por WhatsApp
document.getElementById("btn-forgot-pass").onclick = async () => {
  const email = document.getElementById("login-email").value.trim();
  if (!email) {
    alert("Ingresa tu correo electrónico en la casilla para buscar tu número de celular registrado.");
    return;
  }

  try {
    const snap = await getDocs(collection(db, "usuarios"));
    let usuarioEncontrado = null;
    snap.forEach(d => {
      const u = d.data();
      if ((u.email || "").toLowerCase() === email.toLowerCase()) {
        usuarioEncontrado = u;
      }
    });

    if (usuarioEncontrado && usuarioEncontrado.celular) {
      const msg = encodeURIComponent(
        `🔐 *SOLICITUD DE RESET DE CONTRASEÑA - BATA BOLIVIA*\n\n` +
        `👤 *Usuario:* ${usuarioEncontrado.nombre}\n` +
        `📧 *Correo:* ${email}\n` +
        `📱 *Celular:* +591 ${usuarioEncontrado.celular}\n\n` +
        `_Solicito restablecer mi contraseña de acceso._`
      );
      window.open(`https://wa.me/591${usuarioEncontrado.celular}?text=${msg}`, "_blank");
    } else {
      alert(`No se encontró ningún usuario con el correo: ${email}`);
    }
  } catch (err) {
    alert("Error al procesar: " + err.message);
  }
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
    updateData.foto = await fileToBase64(photoFile);
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
  const photoBase64 = photoFile ? await fileToBase64(photoFile) : null;

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
  document.getElementById("user-display-name").textContent = userData.nombre || currentUser.email;
  document.getElementById("user-display-role").textContent = esAdmin ? "SUPER ADMIN" : userData.rol;
  
  const avatarImg = document.getElementById("user-display-avatar");
  const avatarIcon = document.getElementById("user-display-avatar-icon");
  if (userData.foto) {
    avatarImg.src = userData.foto;
    avatarImg.classList.remove("hidden");
    avatarIcon.classList.add("hidden");
  } else {
    avatarImg.classList.add("hidden");
    avatarIcon.classList.remove("hidden");
  }

  // Permisos Super Admin (SOLO jd.olmitos@gmail.com)
  const menuAdmin = document.getElementById("menu-btn-usuarios");
  if (esAdmin) {
    menuAdmin.classList.remove("hidden");
  } else {
    menuAdmin.classList.add("hidden");
    if (!viewUsuarios.classList.contains("hidden")) {
      activarVistaCambios();
    }
  }

  // Minuta: Exclusiva para Jefe de Desarrollo (o Super Admin)
  const esJefe = userData.rol === "Desarrollo de producto - Jefe";
  const btnMinutaMenu = document.getElementById("menu-btn-minuta");
  const btnMinutaHeader = document.getElementById("btn-open-minuta-header");
  if (btnMinutaMenu && btnMinutaHeader) {
    if (esJefe || esAdmin) {
      btnMinutaMenu.classList.remove("hidden");
      btnMinutaHeader.classList.remove("hidden");
    } else {
      btnMinutaMenu.classList.add("hidden");
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
const viewUsuarios = document.getElementById("view-usuarios");
const menuBtnCambios = document.getElementById("menu-btn-cambios");
const menuBtnInforme = document.getElementById("menu-btn-informe");
const menuBtnEntregas = document.getElementById("menu-btn-entregas");
const menuBtnUsuarios = document.getElementById("menu-btn-usuarios");
const menuBtnMinuta = document.getElementById("menu-btn-minuta");

function resetMenuStyles() {
  [menuBtnCambios, menuBtnInforme, menuBtnEntregas, menuBtnUsuarios].forEach(b => {
    if (b) b.className = "w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-bold text-xs text-gray-600 hover:bg-gray-100 transition cursor-pointer";
  });
  viewCambios.classList.add("hidden");
  viewInforme.classList.add("hidden");
  viewEntregas.classList.add("hidden");
  viewUsuarios.classList.add("hidden");
}

function activarVistaCambios() {
  resetMenuStyles();
  viewCambios.classList.remove("hidden");
  menuBtnCambios.className = "w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition bg-red-50 text-[#D61B28] cursor-pointer";
}

menuBtnCambios.onclick = activarVistaCambios;

menuBtnInforme.onclick = () => {
  resetMenuStyles();
  viewInforme.classList.remove("hidden");
  menuBtnInforme.className = "w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition bg-red-50 text-[#D61B28] cursor-pointer";
  renderInformeView();
};

menuBtnEntregas.onclick = () => {
  resetMenuStyles();
  viewEntregas.classList.remove("hidden");
  menuBtnEntregas.className = "w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition bg-red-50 text-[#D61B28] cursor-pointer";
  renderTablaEntregas();
};

menuBtnUsuarios.onclick = () => {
  if (!esSuperAdmin()) {
    alert("Acceso denegado: solo el usuario jd.olmitos@gmail.com puede acceder al panel de administración.");
    return;
  }
  resetMenuStyles();
  viewUsuarios.classList.remove("hidden");
  menuBtnUsuarios.className = "w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition bg-red-50 text-[#D61B28] cursor-pointer";
  cargarPanelSuperAdmin();
};

if (menuBtnMinuta) {
  menuBtnMinuta.onclick = () => modalMinuta.classList.remove("hidden");
}
if (document.getElementById("btn-open-minuta-header")) {
  document.getElementById("btn-open-minuta-header").onclick = () => modalMinuta.classList.remove("hidden");
}

// Panel Super Admin
async function cargarPanelSuperAdmin() {
  if (!esSuperAdmin()) return;

  const tbodyUsers = document.getElementById("table-users-body");
  tbodyUsers.innerHTML = "";
  const snap = await getDocs(collection(db, "usuarios"));
  
  snap.forEach(docU => {
    const u = docU.data();
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50 border-b border-gray-100";
    
    const avatar = u.foto 
      ? `<img src="${u.foto}" class="w-7 h-7 rounded-full object-cover">` 
      : `<div class="w-7 h-7 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center"><i class="fa-solid fa-user text-[10px]"></i></div>`;

    tr.innerHTML = `
      <td class="p-3">${avatar}</td>
      <td class="p-3 font-bold text-gray-800">${u.nombre}</td>
      <td class="p-3 text-gray-600">${u.email}</td>
      <td class="p-3 font-mono text-gray-600">${u.celular ? '+591 ' + u.celular : '<span class="text-red-400">Sin celular</span>'}</td>
      <td class="p-3">
        <select onchange="window.cambiarRolUsuario('${docU.id}', this.value)" class="border border-gray-300 rounded px-2 py-1 text-xs bg-white font-semibold text-gray-700 focus:ring-1 focus:ring-[#D61B28]">
          <option value="Calidad" ${u.rol === 'Calidad' ? 'selected' : ''}>Calidad</option>
          <option value="Costos" ${u.rol === 'Costos' ? 'selected' : ''}>Costos</option>
          <option value="Compras" ${u.rol === 'Compras' ? 'selected' : ''}>Compras</option>
          <option value="Producción" ${u.rol === 'Producción' ? 'selected' : ''}>Producción</option>
          <option value="Planeamiento" ${u.rol === 'Planeamiento' ? 'selected' : ''}>Planeamiento</option>
          <option value="Retail" ${u.rol === 'Retail' ? 'selected' : ''}>Retail</option>
          <option value="Desarrollo de producto" ${u.rol === 'Desarrollo de producto' ? 'selected' : ''}>Desarrollo (General)</option>
          <option value="Desarrollo de producto - Técnico" ${u.rol === 'Desarrollo de producto - Técnico' ? 'selected' : ''}>Desarrollo - Técnico (Modelista)</option>
          <option value="Desarrollo de producto - Jefe" ${u.rol === 'Desarrollo de producto - Jefe' ? 'selected' : ''}>Desarrollo - Jefe</option>
        </select>
      </td>
      <td class="p-3 text-center">
        ${docU.id !== currentUser.uid ? `
          <button onclick="window.eliminarUsuarioDoc('${docU.id}', '${u.nombre}')" class="text-red-600 hover:text-red-800 font-bold text-xs cursor-pointer">
            <i class="fa-solid fa-trash"></i> Eliminar
          </button>
        ` : '<span class="text-gray-400 text-[10px] font-bold">Super Admin</span>'}
      </td>
    `;
    tbodyUsers.appendChild(tr);
  });

  const tbodySols = document.getElementById("table-admin-solicitudes-body");
  tbodySols.innerHTML = "";

  solicitudes.forEach(sol => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50 border-b border-gray-100";
    tr.innerHTML = `
      <td class="p-3 font-semibold text-gray-500 font-mono">${sol.semana || '—'}</td>
      <td class="p-3 text-gray-600 whitespace-nowrap">${formatearFecha(sol.fechaCreacion)}</td>
      <td class="p-3 font-bold text-gray-800">${sol.proyecto}</td>
      <td class="p-3 font-mono text-gray-700">${sol.articulo}</td>
      <td class="p-3 text-gray-600">${sol.solicitanteNombre || '—'}</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded font-bold text-[10px] ${sol.estado === 'Realizado' ? 'bg-green-50 text-green-700' : (sol.estado === 'Retrasado' ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700')}">${sol.estado}</span></td>
      <td class="p-3 text-center">
        <button onclick="window.eliminarSolicitudProyecto('${sol.id}', '${sol.proyecto}')" class="text-red-500 hover:text-red-700 p-1 rounded font-bold text-xs cursor-pointer">
          <i class="fa-solid fa-trash-can"></i> Eliminar
        </button>
      </td>
    `;
    tbodySols.appendChild(tr);
  });
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
  if (confirm(`¿Eliminar la solicitud del proyecto "${proyecto}" permanentemente de la base de datos?`)) {
    await deleteDoc(doc(db, "solicitudes_cambios", id));
    cargarPanelSuperAdmin();
  }
};

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
      listContainer.innerHTML = `<p class="p-3 text-center text-gray-400 text-xs">No hay usuarios con celular registrados para ${rolFiltro || 'el grupo'}.</p>`;
    }

    modalWA.classList.remove("hidden");
  } catch (error) {
    console.error(error);
  }
}

document.getElementById("btn-close-whatsapp-modal").onclick = () => {
  document.getElementById("modal-whatsapp").classList.add("hidden");
};

// Envío de Minuta
if (document.getElementById("form-minuta")) {
  document.getElementById("form-minuta").onsubmit = async (e) => {
    e.preventDefault();
    const semana = document.getElementById("minuta-semana").value.trim();
    const proyecto = document.getElementById("minuta-proyecto").value.trim();
    const articulo = document.getElementById("minuta-articulo").value.trim();
    const detalle = document.getElementById("minuta-box").value.trim();

    modalMinuta.classList.add("hidden");
    document.getElementById("form-minuta").reset();

    abrirModalWhatsApp({
      titulo: "Minuta de Cambios (Plan Piloto)",
      subtitulo: "Enviar minuta a los Técnicos de Desarrollo:",
      mensajeTexto: `📋 *MINUTA DE CAMBIOS - PLAN PILOTO*\n*Bata Bolivia / Desarrollo de Producto*\n\n📅 *Semana:* ${semana}\n📌 *Proyecto:* ${proyecto}\n🔢 *Artículo:* ${articulo}\n👤 *Emitido por:* ${userData.nombre} (Jefe Desarrollo)\n\n📝 *DETALLE DE CAMBIOS TÉCNICOS:*\n${detalle}\n\n_Proceder con los ajustes técnicos correspondientes en guías y prototipos._`,
      rolFiltro: "Desarrollo de producto - Técnico"
    });
  };
}

// Crear Solicitud de Cambio
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

  try {
    await addDoc(collection(db, "solicitudes_cambios"), {
      semana,
      proyecto,
      articulo,
      boxCambio,
      solicitanteNombre: userData.nombre,
      solicitanteRol: userData.rol,
      solicitanteId: currentUser.uid,
      estado: "En proceso",
      fechaRealizado: null,
      validadoCostos: false,
      fechaCreacion: new Date().toISOString(),
      ultimaEdicion: null,
      timestamp: serverTimestamp()
    });

    document.getElementById("form-new-change").reset();
    modalNewChange.classList.add("hidden");

    abrirModalWhatsApp({
      titulo: "Solicitud Registrada",
      subtitulo: "Notificar solicitud creada al equipo:",
      mensajeTexto: `👞 *NUEVA SOLICITUD DE CAMBIO - BATA BOLIVIA*\n\n📅 *Semana:* ${semana}\n📌 *Proyecto:* ${proyecto}\n🔢 *Artículo:* ${articulo}\n👤 *Solicitado por:* ${userData.nombre} (${userData.rol})\n📝 *Cambio:* ${boxCambio}\n\n_Revisar en el Sistema de Gestión de Cambios Bata_`
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

  if (esDesarrollo) {
    selectTipo.innerHTML += `<option value="GUÍA DE PRODUCCIÓN">Guía de Producción</option>`;
    selectTipo.innerHTML += `<option value="CORTE">Corte</option>`;
    selectTipo.innerHTML += `<option value="MUESTRA DEFINITIVA">Muestra Definitiva</option>`;
  } else if (esCostos) {
    selectTipo.innerHTML += `<option value="CORTE">Corte (De Costos a Producción)</option>`;
  }

  actualizarDestinosEntrega();
  modalNuevaEntrega.classList.remove("hidden");
};

document.getElementById("ent-tipo").onchange = actualizarDestinosEntrega;

function actualizarDestinosEntrega() {
  const tipo = document.getElementById("ent-tipo").value;
  const selectDestino = document.getElementById("ent-destino");
  selectDestino.innerHTML = "";

  const rol = (userData && userData.rol) || "";
  const esCostos = rol === "Costos";

  if (esCostos) {
    selectDestino.innerHTML += `<option value="Producción">Producción</option>`;
  } else {
    if (tipo === "GUÍA DE PRODUCCIÓN" || tipo === "CORTE") {
      selectDestino.innerHTML += `<option value="Costos">Costos</option>`;
    } else if (tipo === "MUESTRA DEFINITIVA") {
      selectDestino.innerHTML += `<option value="Producción">Producción</option>`;
      selectDestino.innerHTML += `<option value="Planeamiento">Planeamiento</option>`;
      selectDestino.innerHTML += `<option value="Retail">Retail</option>`;
    }
  }
}

document.getElementById("form-nueva-entrega").onsubmit = async (e) => {
  e.preventDefault();
  const semana = document.getElementById("ent-semana").value.trim();
  const proyecto = document.getElementById("ent-proyecto").value.trim();
  const articulo = document.getElementById("ent-articulo").value.trim();
  const tipo = document.getElementById("ent-tipo").value;
  const destino = document.getElementById("ent-destino").value;
  const notas = document.getElementById("ent-notas").value.trim();

  try {
    await addDoc(collection(db, "entregas_departamentos"), {
      semana,
      proyecto,
      articulo,
      tipo,
      destino,
      notas,
      entregadoPorNombre: userData.nombre,
      entregadoPorRol: userData.rol,
      entregadoPorId: currentUser.uid,
      recibido: false,
      fechaEntrega: new Date().toISOString(),
      timestamp: serverTimestamp()
    });

    document.getElementById("form-nueva-entrega").reset();
    modalNuevaEntrega.classList.add("hidden");

    abrirModalWhatsApp({
      titulo: "Entrega Registrada",
      subtitulo: `Notificar recepción a los encargados de ${destino}:`,
      mensajeTexto: `📦 ENTREGA REALIZADA - PD BOLIVIA\n\n📅 *Semana:* ${semana}\n📌 *Proyecto:* ${proyecto}\n🔢 *Artículo:* ${articulo}\n🏷️ *Elemento:* ${tipo}\n👤 *Entregado por:* ${userData.nombre} (${userData.rol})\n🏢 *Destino:* ${destino}\n📝 *Notas:* ${notas || 'Sin notas adicionales'}\n\n_Favor de confirmar la recepción física en el sistema._`,
      rolFiltro: destino
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

// Filtros directos de tabla Entregas (Tipo Excel)
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

function renderTablaEntregas() {
  const tbody = document.getElementById("table-entregas-body");
  tbody.innerHTML = "";
  const empty = document.getElementById("entregas-empty-state");

  let entregasFiltradas = entregas.filter(item => {
    const semStr = (item.semana || "").toString().toLowerCase();
    const proyStr = (item.proyecto || "").toString().toLowerCase();
    const coincideSem = !colFiltroSemanaEntregas || semStr.includes(colFiltroSemanaEntregas);
    const coincideProy = !colFiltroProyectoEntregas || proyStr.includes(colFiltroProyectoEntregas);
    return coincideSem && coincideProy;
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

    const puedeConfirmar = userData.rol === ent.destino || esAdmin;

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

    tr.innerHTML = `
      <td class="p-3 font-bold text-gray-700 border-r border-gray-100 font-mono">${ent.semana}</td>
      <td class="p-3 text-gray-600 border-r border-gray-100 whitespace-nowrap">${formatearFecha(ent.fechaEntrega)}</td>
      <td class="p-3 font-bold text-gray-800 border-r border-gray-100">${ent.proyecto}</td>
      <td class="p-3 font-mono text-gray-700 border-r border-gray-100">${ent.articulo}</td>
      <td class="p-3 border-r border-gray-100">
        <span class="bg-red-50 text-[#D61B28] px-2 py-0.5 rounded font-bold text-[10px] border border-red-100">${ent.tipo}</span>
        ${ent.notas ? `<p class="text-[10px] text-gray-400 mt-0.5">${ent.notas}</p>` : ''}
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
  if (confirm(`¿Confirmar que has recibido físicamente el elemento "${tipo}" del proyecto "${proyecto}"?`)) {
    await updateDoc(doc(db, "entregas_departamentos", id), {
      recibido: true,
      fechaRecepcion: new Date().toISOString(),
      recibidoPorNombre: userData.nombre
    });
  }
};

function abrirReporteImpresoEntregas() {
  if (entregas.length === 0) {
    alert("No hay registros de entregas para generar el reporte.");
    return;
  }

  const contenedor = document.getElementById("contenido-impresion-entregas");
  let html = `
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse border border-gray-200 text-xs">
        <thead class="bg-gray-100 font-bold">
          <tr>
            <th class="p-2 border">Sem.</th>
            <th class="p-2 border">Fecha/Hora</th>
            <th class="p-2 border">Proyecto</th>
            <th class="p-2 border">Artículo</th>
            <th class="p-2 border">Elemento Entregado</th>
            <th class="p-2 border">Entregado Por</th>
            <th class="p-2 border">Destino</th>
            <th class="p-2 border text-center">Estado Recepción</th>
          </tr>
        </thead>
        <tbody>
  `;

  entregas.forEach(it => {
    html += `
      <tr class="border-b">
        <td class="p-2 border font-bold font-mono">${it.semana}</td>
        <td class="p-2 border whitespace-nowrap">${formatearFecha(it.fechaEntrega)}</td>
        <td class="p-2 border font-bold text-gray-800">${it.proyecto}</td>
        <td class="p-2 border font-mono">${it.articulo}</td>
        <td class="p-2 border">${it.tipo} ${it.notas ? `(${it.notas})` : ''}</td>
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
  if (entregas.length === 0) {
    alert("No hay entregas registradas.");
    return;
  }

  let texto = `CONTROL DE ENTREGAS A DEPARTAMENTOS - BATA BOLIVIA\n`;
  texto += `Fecha de emisión: ${new Date().toLocaleDateString("es-BO")}\n\n`;
  texto += `Saludos cordiales,\nA continuación se detalla el registro de entregas físicas efectuadas entre secciones:\n\n`;

  entregas.forEach((it, idx) => {
    texto += `${idx + 1}. [Sem: ${it.semana}] ${it.proyecto.toUpperCase()} | Art: ${it.articulo}\n`;
    texto += `   • Entrega: ${it.tipo}\n`;
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
    const asunto = encodeURIComponent("Bata Bolivia - Control de Entregas a Departamentos");
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
    if (esSuperAdmin() && !viewUsuarios.classList.contains("hidden")) {
      cargarPanelSuperAdmin();
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
  const esDesarrollo = (userData.rol || "").includes("Desarrollo") || esAdmin;
  const esCostos = userData.rol === "Costos" || esAdmin;

  solicitudes.forEach((item) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50/80 transition border-b border-gray-100";

    let textoBox = item.boxCambio;
    if (item.ultimaEdicion) {
      textoBox += `<br><span class="text-[10px] text-gray-400 italic"> (editado: ${formatearFecha(item.ultimaEdicion)})</span>`;
    }

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

    tr.innerHTML = `
      <td class="p-3 font-bold text-gray-700 border-r border-gray-100 font-mono">${item.semana || '—'}</td>
      <td class="p-3 text-gray-600 border-r border-gray-100 whitespace-nowrap">${formatearFecha(item.fechaCreacion)}</td>
      <td class="p-3 border-r border-gray-100 whitespace-nowrap">
        <span class="font-bold text-gray-800 block">${item.solicitanteNombre || '—'}</span>
        <span class="text-[10px] text-gray-400">${item.solicitanteRol || ''}</span>
      </td>
      <td class="p-3.5 font-bold text-gray-800 border-r border-gray-100">${item.proyecto}</td>
      <td class="p-3.5 font-mono text-gray-700 border-r border-gray-100">${item.articulo}</td>
      <td class="p-3.5 text-gray-700 border-r border-gray-100">
        <div>${textoBox}</div>
        <button onclick="window.editarTextoBox('${item.id}', '${item.boxCambio.replace(/'/g, "\\'")}')" class="text-[10px] text-blue-600 hover:underline mt-1 font-medium inline-flex items-center space-x-1 cursor-pointer">
          <i class="fa-solid fa-pencil"></i> <span>editar</span>
        </button>
      </td>
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
      mensajeTexto: `👟 *PROYECTO REALIZADO - REQUERIMIENTO DE COSTOS*\n\n📅 *Semana:* ${semana}\n📌 *Proyecto:* ${proyecto}\n🔢 *Artículo:* ${articulo}\n✅ *Estado:* Realizado por Desarrollo de Producto (${userData.nombre})\n\n_Por favor ingresar al sistema para validar los costos asociados._`,
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
    validadorCostosNombre: userData.nombre
  });

  abrirModalWhatsApp({
    titulo: "Costos Validados",
    subtitulo: "Enviar notificación al equipo de Calidad:",
    mensajeTexto: `📋 *VALIDACIÓN DE COSTOS COMPLETADA - ALERTA CALIDAD*\n\n📌 *Proyecto:* ${proyecto}\n🔢 *Artículo:* ${articulo}\n💰 *Costos:* Validados por ${userData.nombre} (Costos)\n\n_El proyecto cuenta con validación técnica y económica lista para producción._`,
    rolFiltro: "Calidad"
  });
};

window.desbloquearValidacionCostos = async (id) => {
  if (confirm("¿Desbloquear validación de costos? (Acción de Super Admin)")) {
    await updateDoc(doc(db, "solicitudes_cambios", id), { validadoCostos: false });
  }
};

window.editarTextoBox = async (id, textoActual) => {
  const nuevoTexto = prompt("Modificar cambios a realizar:", textoActual);
  if (nuevoTexto !== null && nuevoTexto.trim() !== "" && nuevoTexto !== textoActual) {
    await updateDoc(doc(db, "solicitudes_cambios", id), {
      boxCambio: nuevoTexto.trim(),
      ultimaEdicion: new Date().toISOString()
    });
  }
};

// ==================== INFORMES CON FILTROS TIPO EXCEL ====================
function renderInformeView() {
  actualizarInformePorSemana();

  // Inputs en cabecera de la tabla Informe
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
    actualizarGraficoTorresSemana();
  };

  document.getElementById("btn-generar-texto-wsp").onclick = generarTextoNotificacionBata;
  document.getElementById("btn-generar-informe-resumen").onclick = generarModalInformeResumen;
}

function actualizarInformePorSemana() {
  let articulosFiltrados = solicitudes.filter(item => {
    const semStr = (item.semana || "").toString().toLowerCase();
    const proyStr = (item.proyecto || "").toString().toLowerCase();
    const coincideSem = !colFiltroSemanaInforme || semStr.includes(colFiltroSemanaInforme);
    const coincideProy = !colFiltroProyectoInforme || proyStr.includes(colFiltroProyectoInforme);
    return coincideSem && coincideProy;
  });

  articulosFiltrados.sort((a, b) => (a.semana || "").localeCompare(b.semana || "", undefined, { numeric: true }));

  const total = articulosFiltrados.length;
  const realizados = articulosFiltrados.filter(s => s.estado === "Realizado").length;
  const enProceso = articulosFiltrados.filter(s => s.estado === "En proceso").length;
  const validadosCostos = articulosFiltrados.filter(s => s.validadoCostos).length;

  document.getElementById("kpi-sem-total").textContent = total;
  document.getElementById("kpi-sem-proceso").textContent = enProceso;
  document.getElementById("kpi-sem-realizados").textContent = realizados;
  document.getElementById("kpi-sem-costos").textContent = `${validadosCostos} de ${total}`;

  const badgeContainer = document.getElementById("badge-congelamiento-container");
  if (total === 0) {
    badgeContainer.innerHTML = `<span class="bg-gray-100 text-gray-500 font-bold text-[11px] px-3 py-1 rounded-full border border-gray-200">Sin artículos con ese filtro</span>`;
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
    tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-gray-400 italic">No hay artículos que coincidan con la búsqueda.</td></tr>`;
    actualizarConteoSeleccionados();
    actualizarGraficoTorresSemana();
    return;
  }

  articulosFiltrados.forEach(item => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50/70 border-b border-gray-100";

    tr.innerHTML = `
      <td class="p-2.5 text-center">
        <input type="checkbox" value="${item.id}" checked class="chk-articulo-informe h-4 w-4 accent-[#D61B28] cursor-pointer">
      </td>
      <td class="p-2.5 font-bold text-gray-700 font-mono">${item.semana}</td>
      <td class="p-2.5 font-bold text-gray-800">${item.proyecto}</td>
      <td class="p-2.5 font-mono text-gray-700">${item.articulo}</td>
      <td class="p-2.5 text-gray-600 max-w-xs truncate" title="${item.boxCambio}">${item.boxCambio}</td>
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
    chk.onchange = () => {
      actualizarConteoSeleccionados();
      actualizarGraficoTorresSemana();
    };
  });

  actualizarConteoSeleccionados();
  actualizarGraficoTorresSemana();
}

function actualizarConteoSeleccionados() {
  const total = document.querySelectorAll(".chk-articulo-informe").length;
  const marcados = document.querySelectorAll(".chk-articulo-informe:checked").length;
  const label = document.getElementById("label-conteo-seleccionados");
  if (label) label.textContent = `${marcados} de ${total} artículos seleccionados`;
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
    html += `
      <tr class="border-b">
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

function actualizarGraficoTorresSemana() {
  const seleccionadosIds = Array.from(document.querySelectorAll(".chk-articulo-informe:checked")).map(c => c.value);
  const items = solicitudes.filter(s => seleccionadosIds.includes(s.id));

  const proyectosUnicos = [...new Set(items.map(s => s.proyecto))];
  const labels = proyectosUnicos;
  const dataProgreso = [];
  const backgroundColors = [];
  const borderColors = [];

  labels.forEach(proy => {
    const articulosProy = items.filter(s => s.proyecto === proy);
    if (articulosProy.length === 0) {
      dataProgreso.push(0);
      backgroundColors.push("rgba(214, 27, 40, 0.7)");
      borderColors.push("#D61B28");
      return;
    }

    const realizados = articulosProy.filter(s => s.estado === "Realizado").length;
    const porcentajeRealizados = Math.round((realizados / articulosProy.length) * 100);
    dataProgreso.push(porcentajeRealizados);

    const tieneRetraso = articulosProy.some(s => s.estado === "Retrasado");
    const todosRealizados = articulosProy.every(s => s.estado === "Realizado");

    if (todosRealizados) {
      backgroundColors.push("rgba(34, 197, 94, 0.85)");
      borderColors.push("#16a34a");
    } else if (tieneRetraso) {
      backgroundColors.push("rgba(239, 68, 68, 0.85)");
      borderColors.push("#dc2626");
    } else {
      backgroundColors.push("rgba(249, 115, 22, 0.85)");
      borderColors.push("#ea580c");
    }
  });

  const ctx = document.getElementById("chartAvance").getContext("2d");
  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "% Realizado",
        data: dataProgreso,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 8,
        barPercentage: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Avance Proyecto: ${ctx.raw}%`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            stepSize: 20,
            callback: v => v + "%"
          },
          grid: { color: "rgba(0, 0, 0, 0.05)" }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}
