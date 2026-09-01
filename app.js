import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let userData = null;
let solicitudes = [];
let filtroSubmenuActivo = "todos";
let chartInstance = null;

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  if (!file) return resolve(null);
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = error => reject(error);
});

// Comprobar Super Admin (Daniel Olmos)
function esSuperAdmin() {
  if (!userData) return false;
  const email = (userData.email || "").toLowerCase();
  const nombre = (userData.nombre || "").toLowerCase();
  return email === "daniel.olmos@bata.com" || nombre.includes("daniel olmos");
}

// Modales y Controles
const welcomeContainer = document.getElementById("welcome-container");
const appContainer = document.getElementById("app-container");
const modalLogin = document.getElementById("modal-login");
const modalRegister = document.getElementById("modal-register");
const modalProfile = document.getElementById("modal-profile");
const modalMinuta = document.getElementById("modal-minuta");

document.getElementById("btn-show-login").onclick = () => modalLogin.classList.remove("hidden");
document.getElementById("btn-show-register").onclick = () => modalRegister.classList.remove("hidden");
document.getElementById("close-login").onclick = () => modalLogin.classList.add("hidden");
document.getElementById("close-register").onclick = () => modalRegister.classList.add("hidden");
document.getElementById("close-profile").onclick = () => modalProfile.classList.add("hidden");
document.getElementById("close-minuta").onclick = () => modalMinuta.classList.add("hidden");

// Reset de Contraseña Directo por WhatsApp
document.getElementById("btn-forgot-pass").onclick = async () => {
  const email = document.getElementById("login-email").value.trim();
  if (!email) {
    alert("Ingresa tu correo en la casilla para buscar tu número de celular y enviarte la notificación por WhatsApp.");
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

    // Enviar correo nativo de Firebase
    await sendPasswordResetEmail(auth, email);

    if (usuarioEncontrado && usuarioEncontrado.celular) {
      const msg = encodeURIComponent(`🔒 *SISTEMA BATA BOLIVIA*\nHola ${usuarioEncontrado.nombre}, se ha generado tu solicitud de restablecimiento de contraseña para el correo: ${email}.\nRevisa el enlace enviado a tu bandeja de correo para cambiarla.`);
      window.open(`https://wa.me/591${usuarioEncontrado.celular}?text=${msg}`, "_blank");
    } else {
      alert(`Enlace de restablecimiento enviado a ${email}.`);
    }
  } catch (err) {
    alert("Error al solicitar reseteo: " + err.message);
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

document.getElementById("btn-logout").onclick = () => signOut(auth);

function actualizarHeaderUsuario() {
  document.getElementById("user-display-name").textContent = userData.nombre;
  document.getElementById("user-display-role").textContent = userData.rol;
  
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

  // Permisos especiales
  const esAdmin = esSuperAdmin();
  const esJefe = userData.rol === "Jefe Desarrollo" || esAdmin;

  if (esAdmin) {
    document.getElementById("menu-btn-usuarios").classList.remove("hidden");
  } else {
    document.getElementById("menu-btn-usuarios").classList.add("hidden");
  }

  if (esJefe) {
    document.getElementById("menu-btn-minuta").classList.remove("hidden");
    document.getElementById("btn-open-minuta-header").classList.remove("hidden");
  } else {
    document.getElementById("menu-btn-minuta").classList.add("hidden");
    document.getElementById("btn-open-minuta-header").classList.add("hidden");
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const docSnap = await getDoc(doc(db, "usuarios", user.uid));
    if (docSnap.exists()) {
      userData = docSnap.data();
      actualizarHeaderUsuario();
      welcomeContainer.classList.add("hidden");
      appContainer.classList.remove("hidden");
      escucharCambios();
    }
  } else {
    currentUser = null;
    userData = null;
    welcomeContainer.classList.remove("hidden");
    appContainer.classList.add("hidden");
  }
});

// Menús
const viewCambios = document.getElementById("view-cambios");
const viewInforme = document.getElementById("view-informe");
const viewUsuarios = document.getElementById("view-usuarios");
const menuBtnCambios = document.getElementById("menu-btn-cambios");
const menuBtnInforme = document.getElementById("menu-btn-informe");
const menuBtnUsuarios = document.getElementById("menu-btn-usuarios");
const menuBtnMinuta = document.getElementById("menu-btn-minuta");

function resetMenuStyles() {
  [menuBtnCambios, menuBtnInforme, menuBtnUsuarios].forEach(b => {
    b.className = "w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-bold text-xs text-gray-600 hover:bg-gray-100 transition cursor-pointer";
  });
  viewCambios.classList.add("hidden");
  viewInforme.classList.add("hidden");
  viewUsuarios.classList.add("hidden");
}

menuBtnCambios.onclick = () => {
  resetMenuStyles();
  viewCambios.classList.remove("hidden");
  menuBtnCambios.className = "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-bold text-xs transition bg-red-50 text-[#D61B28] cursor-pointer";
};

menuBtnInforme.onclick = () => {
  resetMenuStyles();
  viewInforme.classList.remove("hidden");
  menuBtnInforme.className = "w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition bg-red-50 text-[#D61B28] cursor-pointer";
  renderInformeView();
};

menuBtnUsuarios.onclick = () => {
  resetMenuStyles();
  viewUsuarios.classList.remove("hidden");
  menuBtnUsuarios.className = "w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition bg-red-50 text-[#D61B28] cursor-pointer";
  cargarListaUsuariosAdmin();
};

// Abrir Modal Minuta
menuBtnMinuta.onclick = () => modalMinuta.classList.remove("hidden");
document.getElementById("btn-open-minuta-header").onclick = () => modalMinuta.classList.remove("hidden");

// Submenús de Filtro
window.filtrarPorSubmenu = (estado) => {
  filtroSubmenuActivo = estado;
  const subtitle = document.getElementById("view-subtitle-filter");
  if (estado === "todos") subtitle.textContent = "Mostrando todos los registros";
  else if (estado === "En proceso") subtitle.textContent = "Filtrando: Cambios en proceso";
  else if (estado === "Realizado") subtitle.textContent = "Filtrando: Cambios realizados";
  else if (estado === "Retrasado") subtitle.textContent = "Filtrando: Cambios retrasados";
  renderTabla();
};

// Panel Super Admin: Listar y Cambiar Roles
async function cargarListaUsuariosAdmin() {
  const tbody = document.getElementById("table-users-body");
  tbody.innerHTML = "";
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
          <option value="Técnico Desarrollo" ${u.rol === 'Técnico Desarrollo' ? 'selected' : ''}>Desarrollo - Técnico</option>
          <option value="Jefe Desarrollo" ${u.rol === 'Jefe Desarrollo' ? 'selected' : ''}>Desarrollo - Jefe</option>
        </select>
      </td>
      <td class="p-3 text-center">
        ${docU.id !== currentUser.uid ? `
          <button onclick="window.eliminarUsuarioDoc('${docU.id}', '${u.nombre}', '${u.email}')" class="text-red-600 hover:text-red-800 font-bold text-xs cursor-pointer">
            <i class="fa-solid fa-trash"></i> Eliminar
          </button>
        ` : '<span class="text-gray-400 text-[10px] font-bold">Admin Principal</span>'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.cambiarRolUsuario = async (userId, nuevoRol) => {
  await updateDoc(doc(db, "usuarios", userId), { rol: nuevoRol });
  alert("Rol actualizado correctamente.");
};

window.eliminarUsuarioDoc = async (id, nombre, email) => {
  if (confirm(`¿Eliminar usuario ${nombre} (${email})? Podrás volver a registrar este correo cuando lo necesites.`)) {
    await deleteDoc(doc(db, "usuarios", id));
    cargarListaUsuariosAdmin();
  }
};

// Modal WhatsApp Dinámico
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
      const coincideRol = !rolFiltro || u.rol === rolFiltro;

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
      listContainer.innerHTML = `<p class="p-3 text-center text-gray-400 text-xs">No hay usuarios registrados con celular para el grupo (${rolFiltro || 'General'}).</p>`;
    }

    modalWA.classList.remove("hidden");
  } catch (error) {
    console.error(error);
  }
}

document.getElementById("btn-close-whatsapp-modal").onclick = () => {
  document.getElementById("modal-whatsapp").classList.add("hidden");
};

// Enviar Minuta de Cambios (Jefe de Desarrollo)
document.getElementById("form-minuta").onsubmit = async (e) => {
  e.preventDefault();
  const titulo = document.getElementById("minuta-title").value.trim();
  const detalle = document.getElementById("minuta-box").value.trim();

  modalMinuta.classList.add("hidden");
  document.getElementById("form-minuta").reset();

  abrirModalWhatsApp({
    titulo: "Minuta de Cambios (Plan Piloto)",
    subtitulo: "Enviar minuta técnica a los Técnicos de Desarrollo:",
    mensajeTexto: `📋 *MINUTA DE CAMBIOS - PLAN PILOTO*\n*Bata Bolivia / Desarrollo de Producto*\n\n📌 *Asunto:* ${titulo}\n👤 *Emitido por:* ${userData.nombre} (Jefe Desarrollo)\n\n📝 *DETALLE DE CAMBIOS:*\n${detalle}\n\n_Por favor proceder con las modificaciones técnicas correspondientes._`,
    rolFiltro: "Técnico Desarrollo"
  });
};

// Crear Solicitud de Cambio
const modalNewChange = document.getElementById("modal-new-change");
document.getElementById("btn-open-new-change").onclick = () => modalNewChange.classList.remove("hidden");
document.getElementById("modal-btn-close").onclick = () => modalNewChange.classList.add("hidden");
document.getElementById("modal-btn-cancel").onclick = () => modalNewChange.classList.add("hidden");

document.getElementById("form-new-change").onsubmit = async (e) => {
  e.preventDefault();
  const proyecto = document.getElementById("change-project").value.trim();
  const articulo = document.getElementById("change-article").value.trim();
  const boxCambio = document.getElementById("change-box").value.trim();

  try {
    await addDoc(collection(db, "solicitudes_cambios"), {
      proyecto,
      articulo,
      boxCambio,
      solicitanteNombre: userData.nombre,
      solicitanteRol: userData.rol,
      solicitanteId: currentUser.uid,
      estado: "En proceso",
      progreso: 20,
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
      mensajeTexto: `👞 *NUEVA SOLICITUD DE CAMBIO - BATA BOLIVIA*\n\n📌 *Proyecto:* ${proyecto}\n🔢 *Artículo:* ${articulo}\n👤 *Solicitado por:* ${userData.nombre} (${userData.rol})\n📝 *Cambio:* ${boxCambio}\n\n_Revisar en el Sistema de Gestión de Cambios Bata_`
    });
  } catch (err) {
    alert("Error: " + err.message);
  }
};

function escucharCambios() {
  const q = query(collection(db, "solicitudes_cambios"), orderBy("timestamp", "desc"));
  onSnapshot(q, (snapshot) => {
    solicitudes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderTabla();
  });
}

function formatearFecha(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Render Tabla
function renderTabla() {
  const tbody = document.getElementById("table-cambios-body");
  tbody.innerHTML = "";
  const empty = document.getElementById("table-empty-state");

  const itemsFiltrados = solicitudes.filter(item => {
    if (filtroSubmenuActivo === "todos") return true;
    return item.estado === filtroSubmenuActivo;
  });

  if (itemsFiltrados.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  itemsFiltrados.forEach((item) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50/80 transition border-b border-gray-100";

    let textoBox = item.boxCambio;
    if (item.ultimaEdicion) {
      textoBox += `<br><span class="text-[10px] text-gray-400 italic"> (editado: ${formatearFecha(item.ultimaEdicion)})</span>`;
    }

    // Permisos: Técnico de Desarrollo, Jefe de Desarrollo y Super Admin
    const esDesarrollo = userData.rol === "Técnico Desarrollo" || userData.rol === "Jefe Desarrollo" || esSuperAdmin();
    const esCostos = userData.rol === "Costos" || esSuperAdmin();
    const progresoVal = item.progreso !== undefined ? item.progreso : (item.estado === "Realizado" ? 100 : 25);

    let estadoHTML = "";
    if (esDesarrollo) {
      estadoHTML = `
        <div class="flex items-center space-x-1.5">
          <select id="sel-estado-${item.id}" class="border border-orange-200 text-orange-600 bg-orange-50 font-semibold rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-[#D61B28]">
            <option value="En proceso" ${item.estado === "En proceso" ? "selected" : ""}>En proceso</option>
            <option value="Realizado" ${item.estado === "Realizado" ? "selected" : ""}>Realizado</option>
            <option value="Retrasado" ${item.estado === "Retrasado" ? "selected" : ""}>Retrasado</option>
          </select>
          <button onclick="window.guardarCambioEstado('${item.id}', '${item.proyecto}', '${item.articulo}')" title="Guardar y Notificar a Costos" class="bg-gray-100 hover:bg-[#D61B28] hover:text-white text-gray-600 p-1.5 rounded-lg text-xs transition cursor-pointer">
            <i class="fa-solid fa-floppy-disk"></i>
          </button>
        </div>
      `;
    } else {
      const estilo = item.estado === "Realizado" ? "border-green-200 text-green-700 bg-green-50" : (item.estado === "Retrasado" ? "border-red-200 text-red-700 bg-red-50" : "border-orange-200 text-orange-600 bg-orange-50");
      estadoHTML = `<span class="border ${estilo} px-3 py-1 rounded-lg font-bold text-xs">${item.estado}</span>`;
    }

    let progresoHTML = "";
    if (esDesarrollo) {
      progresoHTML = `
        <div class="flex items-center justify-center space-x-1">
          <input type="number" min="0" max="100" value="${progresoVal}" 
                 onchange="window.actualizarProgreso('${item.id}', this.value)"
                 class="w-14 px-1.5 py-0.5 border border-gray-300 rounded font-bold text-center text-xs focus:ring-1 focus:ring-[#D61B28]">
          <span class="font-bold text-gray-500">%</span>
        </div>
      `;
    } else {
      progresoHTML = `
        <div class="w-full bg-gray-200 rounded-full h-2 max-w-[65px] mx-auto overflow-hidden">
          <div class="bg-[#D61B28] h-2 rounded-full" style="width: ${progresoVal}%"></div>
        </div>
        <span class="text-[10px] font-bold text-gray-500 block text-center mt-0.5">${progresoVal}%</span>
      `;
    }

    let costosHTML = "";
    if (item.estado === "Realizado") {
      if (item.validadoCostos) {
        costosHTML = `
          <div class="flex items-center justify-center space-x-1 text-green-700 font-bold text-xs">
            <i class="fa-solid fa-circle-check text-green-600"></i>
            <span>Validado</span>
            ${esSuperAdmin() ? `<button onclick="window.desbloquearValidacionCostos('${item.id}')" class="text-red-500 hover:text-red-700 text-[10px] ml-1 cursor-pointer" title="Desbloquear como Super Admin"><i class="fa-solid fa-unlock"></i></button>` : ''}
          </div>
        `;
      } else {
        costosHTML = `
          <div class="flex items-center justify-center space-x-1">
            <input type="checkbox" ${!esCostos ? "disabled" : ""} 
                   onchange="window.confirmarValidacionCostos('${item.id}', '${item.proyecto}', '${item.articulo}', this)"
                   class="h-4 w-4 accent-[#D61B28] rounded border-gray-300 cursor-${esCostos ? 'pointer' : 'not-allowed'}">
            <span class="text-[11px] text-gray-400">Confirmar</span>
          </div>
        `;
      }
    } else {
      costosHTML = `<input type="checkbox" disabled class="h-4 w-4 text-gray-300 rounded border-gray-200 opacity-40">`;
    }

    tr.innerHTML = `
      <td class="p-3.5 font-bold text-gray-800 border-r border-gray-100">${item.proyecto}</td>
      <td class="p-3.5 font-mono text-gray-600 border-r border-gray-100">${item.articulo}</td>
      <td class="p-3.5 text-gray-700 border-r border-gray-100">
        <div>${textoBox}</div>
        <button onclick="window.editarTextoBox('${item.id}', '${item.boxCambio.replace(/'/g, "\\'")}')" class="text-[10px] text-blue-600 hover:underline mt-1 font-medium inline-flex items-center space-x-1 cursor-pointer">
          <i class="fa-solid fa-pencil"></i> <span>editar</span>
        </button>
      </td>
      <td class="p-3.5 text-center border-r border-gray-100 whitespace-nowrap">${estadoHTML}</td>
      <td class="p-3.5 text-center border-r border-gray-100 whitespace-nowrap">${progresoHTML}</td>
      <td class="p-3.5 text-center whitespace-nowrap">${costosHTML}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Guardar Estado (Desarrollo -> Costos)
window.guardarCambioEstado = async (id, proyecto, articulo) => {
  const select = document.getElementById(`sel-estado-${id}`);
  const nuevoEstado = select.value;

  const updatePayload = { estado: nuevoEstado };
  if (nuevoEstado === "Realizado") updatePayload.progreso = 100;

  await updateDoc(doc(db, "solicitudes_cambios", id), updatePayload);

  if (nuevoEstado === "Realizado") {
    abrirModalWhatsApp({
      titulo: "Proyecto Realizado",
      subtitulo: "Enviar alerta a los usuarios de Costos para su validación:",
      mensajeTexto: `👟 *PROYECTO REALIZADO - REQUERIMIENTO DE COSTOS*\n\n📌 *Proyecto:* ${proyecto}\n🔢 *Artículo:* ${articulo}\n✅ *Estado:* Realizado por Desarrollo de Producto (${userData.nombre})\n\n_Por favor ingresar al sistema para validar los costos asociados._`,
      rolFiltro: "Costos"
    });
  } else {
    alert("Estado guardado correctamente.");
  }
};

// Confirmación Costos (Costos -> Calidad)
window.confirmarValidacionCostos = async (id, proyecto, articulo, checkboxElem) => {
  const confirma = confirm(`¿Estás seguro de validar los costos del proyecto "${proyecto}"? Una vez confirmado quedará bloqueado de forma permanente.`);
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
  if (confirm("¿Desbloquear validación de costos? (Acción exclusiva de Super Admin)")) {
    await updateDoc(doc(db, "solicitudes_cambios", id), { validadoCostos: false });
  }
};

window.actualizarProgreso = async (id, nuevoProgreso) => {
  const val = Math.min(100, Math.max(0, parseInt(nuevoProgreso) || 0));
  await updateDoc(doc(db, "solicitudes_cambios", id), { progreso: val });
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

// Informes
function renderInformeView() {
  document.getElementById("metric-total").textContent = solicitudes.length;
  document.getElementById("metric-proceso").textContent = solicitudes.filter(s => s.estado === "En proceso").length;
  document.getElementById("metric-realizado").textContent = solicitudes.filter(s => s.estado === "Realizado").length;
  document.getElementById("metric-retrasado").textContent = solicitudes.filter(s => s.estado === "Retrasado").length;

  const container = document.getElementById("report-project-selection-list");
  container.innerHTML = "";
  const proyectosUnicos = [...new Set(solicitudes.map(s => s.proyecto))];

  proyectosUnicos.forEach((proy) => {
    const div = document.createElement("div");
    div.className = "flex items-center space-x-2 bg-gray-50 p-2 rounded-xl border border-gray-100";
    div.innerHTML = `
      <input type="checkbox" value="${proy}" checked class="report-chk h-4 w-4 accent-[#D61B28]">
      <span class="text-xs font-semibold text-gray-700">${proy}</span>
    `;
    container.appendChild(div);
  });

  document.querySelectorAll(".report-chk").forEach(chk => {
    chk.onchange = actualizarGraficoTorres;
  });

  document.getElementById("btn-select-all").onclick = () => {
    document.querySelectorAll(".report-chk").forEach(c => c.checked = true);
    actualizarGraficoTorres();
  };

  document.getElementById("btn-deselect-all").onclick = () => {
    document.querySelectorAll(".report-chk").forEach(c => c.checked = false);
    actualizarGraficoTorres();
  };

  actualizarGraficoTorres();
}

function actualizarGraficoTorres() {
  const seleccionados = Array.from(document.querySelectorAll(".report-chk:checked")).map(c => c.value);

  const labels = seleccionados;
  const dataProgreso = [];
  const backgroundColors = [];
  const borderColors = [];

  labels.forEach(proy => {
    const items = solicitudes.filter(s => s.proyecto === proy);
    if (items.length === 0) {
      dataProgreso.push(0);
      backgroundColors.push("rgba(214, 27, 40, 0.7)");
      borderColors.push("#D61B28");
      return;
    }

    const sumaAvance = items.reduce((acc, curr) => acc + (curr.progreso !== undefined ? curr.progreso : (curr.estado === "Realizado" ? 100 : 25)), 0);
    const promedio = Math.round(sumaAvance / items.length);
    dataProgreso.push(promedio);

    const tieneRetraso = items.some(s => s.estado === "Retrasado");
    const todosRealizados = items.every(s => s.estado === "Realizado");

    if (todosRealizados) {
      backgroundColors.push("rgba(34, 197, 94, 0.8)");
      borderColors.push("#16a34a");
    } else if (tieneRetraso) {
      backgroundColors.push("rgba(239, 68, 68, 0.85)");
      borderColors.push("#dc2626");
    } else {
      backgroundColors.push("rgba(249, 115, 22, 0.8)");
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
        label: "% Avance Ponderado",
        data: dataProgreso,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 8,
        barPercentage: 0.45
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Progreso: ${ctx.raw}%`
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
