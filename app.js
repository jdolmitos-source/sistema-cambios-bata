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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let userData = null;
let solicitudes = [];
let entregas = [];
let lotesProduccion = [];
let categoriaEntregaActiva = "todas";

const safeClick = (id, fn) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", fn);
};

// ==================== INICIALIZACIÓN Y EVENT LISTENERS ====================
document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      await cargarDatosUsuario(user.uid);
      mostrarDashboard();
    } else {
      currentUser = null;
      userData = null;
      mostrarBienvenida();
    }
  });

  // Botones de Portada y Modales de Acceso
  safeClick("btn-show-login", () => document.getElementById("modal-login")?.classList.remove("hidden"));
  safeClick("close-login", () => document.getElementById("modal-login")?.classList.add("hidden"));
  safeClick("btn-show-register", () => document.getElementById("modal-register")?.classList.remove("hidden"));
  safeClick("close-register", () => document.getElementById("modal-register")?.classList.add("hidden"));

  // Formulario Login
  const formLogin = document.getElementById("form-login");
  if (formLogin) {
    formLogin.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("login-email").value.trim();
      const pass = document.getElementById("login-pass").value;
      try {
        await signInWithEmailAndPassword(auth, email, pass);
        document.getElementById("modal-login")?.classList.add("hidden");
      } catch (error) {
        alert("Error al iniciar sesión: " + error.message);
      }
    });
  }

  // Formulario Registro
  const formRegister = document.getElementById("form-register");
  if (formRegister) {
    formRegister.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("reg-name").value.trim();
      const phone = document.getElementById("reg-phone").value.trim();
      const email = document.getElementById("reg-email").value.trim();
      const role = document.getElementById("reg-role").value;
      const pass = document.getElementById("reg-pass").value;
      const photoFile = document.getElementById("reg-photo").files[0];

      try {
        const fotoBase64 = photoFile ? await comprimirImagen(photoFile) : null;
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, "usuarios", cred.user.uid), {
          nombre: name,
          celular: phone,
          email: email,
          rol: role,
          foto: fotoBase64 || "",
          fechaRegistro: new Date().toISOString()
        });
        document.getElementById("modal-register")?.classList.add("hidden");
        alert("¡Cuenta creada con éxito!");
      } catch (error) {
        alert("Error al registrarse: " + error.message);
      }
    });
  }

  // Logout
  safeClick("btn-logout", () => signOut(auth));

  // ==================== NAVEGACIÓN DEL MENÚ LATERAL ====================
  safeClick("menu-btn-cambios", activarVistaCambios);

  safeClick("menu-btn-informe", () => {
    resetMenuStyles();
    document.getElementById("view-informe")?.classList.remove("hidden");
    renderInformeView();
  });

  safeClick("menu-btn-entregas-todas", () => cambiarSubmenuEntrega("todas"));

  safeClick("menu-btn-produccion-dash", () => {
    resetMenuStyles();
    document.getElementById("view-produccion-dash")?.classList.remove("hidden");
    renderProduccionView();
  });

  safeClick("menu-btn-procurement", () => {
    resetMenuStyles();
    document.getElementById("view-procurement")?.classList.remove("hidden");
  });

  safeClick("menu-btn-tarjetas", () => {
    resetMenuStyles();
    document.getElementById("view-tarjetas")?.classList.remove("hidden");
  });

  safeClick("menu-btn-usuarios", () => {
    if (!esSuperAdmin()) {
      alert("Acceso denegado.");
      return;
    }
    resetMenuStyles();
    document.getElementById("view-usuarios")?.classList.remove("hidden");
    cargarPanelSuperAdmin();
  });

  // ==================== SUBMENÚS DE ENTREGAS ====================
  safeClick("sub-btn-MATERIALES", () => cambiarSubmenuEntrega("MATERIALES"));
  safeClick("sub-btn-GUIA", () => cambiarSubmenuEntrega("GUÍA DE PRODUCCIÓN"));
  safeClick("sub-btn-CORTE", () => cambiarSubmenuEntrega("CORTE"));
  safeClick("sub-btn-MUESTRA", () => cambiarSubmenuEntrega("MUESTRA DEFINITIVA"));
  safeClick("sub-btn-DESBASTE", () => cambiarSubmenuEntrega("HOJA DE DESBASTE"));
  safeClick("sub-btn-TIZADORES", () => cambiarSubmenuEntrega("TIZADORES"));

  inicializarSemanas01a52();
  escucharColecciones();
});

// ==================== FUNCIONES DE NAVEGACIÓN Y ESTILOS ====================
function resetMenuStyles() {
  const vistas = [
    "view-cambios", 
    "view-informe", 
    "view-entregas", 
    "view-produccion-dash", 
    "view-procurement", 
    "view-tarjetas", 
    "view-usuarios"
  ];
  vistas.forEach(id => {
    document.getElementById(id)?.classList.add("hidden");
  });
}

function activarVistaCambios() {
  resetMenuStyles();
  document.getElementById("view-cambios")?.classList.remove("hidden");
}

window.cambiarSubmenuEntrega = (categoria) => {
  resetMenuStyles();
  document.getElementById("view-entregas")?.classList.remove("hidden");
  categoriaEntregaActiva = categoria;
  renderTablaEntregas();
};

// ==================== CARGA DE DATOS Y FIRESTORE ====================
async function cargarDatosUsuario(uid) {
  try {
    const docRef = doc(db, "usuarios", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      userData = docSnap.data();
    } else {
      userData = { nombre: currentUser.email, rol: "Usuario", celular: "" };
    }
    actualizarHeaderUsuario();
  } catch (e) {
    console.error("Error cargando usuario:", e);
  }
}

function escucharColecciones() {
  onSnapshot(collection(db, "solicitudes_cambios"), (snapshot) => {
    solicitudes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    solicitudes.sort((a, b) => (b.fechaCreacion || "").localeCompare(a.fechaCreacion || ""));
    renderTablaCambios();
    renderInformeView();
    if (esSuperAdmin()) cargarPanelSuperAdmin();
  });

  onSnapshot(collection(db, "entregas_departamentos"), (snapshot) => {
    entregas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    entregas.sort((a, b) => (b.fechaEntrega || "").localeCompare(a.fechaEntrega || ""));
    renderTablaEntregas();
    if (esSuperAdmin()) cargarPanelSuperAdmin();
  });

  onSnapshot(collection(db, "produccion_lotes"), (snapshot) => {
    lotesProduccion = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProduccionView();
  });
}

function mostrarDashboard() {
  document.getElementById("welcome-container")?.classList.add("hidden");
  document.getElementById("app-container")?.classList.remove("hidden");
  activarVistaCambios();
}

function mostrarBienvenida() {
  document.getElementById("app-container")?.classList.add("hidden");
  document.getElementById("welcome-container")?.classList.remove("hidden");
}

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
    if (esAdmin) menuAdmin.classList.remove("hidden");
    else menuAdmin.classList.add("hidden");
  }
}

function esSuperAdmin() {
  if (!currentUser || !currentUser.email) return false;
  return currentUser.email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}

function inicializarSemanas01a52() {
  const selects = [
    document.getElementById("prod-filter-semana"),
    document.getElementById("lote-semana")
  ];
  selects.forEach(sel => {
    if (!sel) return;
    const esFiltro = sel.id === "prod-filter-semana";
    sel.innerHTML = esFiltro ? '<option value="">Todas las Semanas (01-52)</option>' : '';
    for (let i = 1; i <= 52; i++) {
      const numStr = i < 10 ? `0${i}` : `${i}`;
      sel.innerHTML += `<option value="SEM-${numStr}">Semana ${numStr}</option>`;
    }
  });
}

function renderTablaCambios() {
  const tbody = document.getElementById("table-cambios-body");
  const empty = document.getElementById("table-empty-state");
  if (!tbody) return;

  if (solicitudes.length === 0) {
    empty?.classList.remove("hidden");
    tbody.innerHTML = "";
    return;
  }
  empty?.classList.add("hidden");

  let html = "";
  solicitudes.forEach(s => {
    const foto = s.foto ? `<img src="${s.foto}" class="w-10 h-10 object-cover rounded mx-auto border">` : '—';
    html += `
      <tr class="hover:bg-gray-50 border-b">
        <td class="p-2 text-center">${foto}</td>
        <td class="p-3 font-mono font-bold">${s.semana || '—'}</td>
        <td class="p-3">${new Date(s.fechaCreacion || Date.now()).toLocaleDateString("es-BO")}</td>
        <td class="p-3">${s.solicitanteNombre || 'Usuario'}</td>
        <td class="p-3 font-bold">${s.proyecto || '—'}</td>
        <td class="p-3 font-mono">${s.articulo || '—'}</td>
        <td class="p-3">${s.boxCambio || '—'}</td>
        <td class="p-3 text-center font-bold text-orange-600">${s.estado || 'Pendiente'}</td>
        <td class="p-3 text-center">${s.fechaRealizado ? new Date(s.fechaRealizado).toLocaleDateString("es-BO") : '—'}</td>
        <td class="p-3 text-center">
          <input type="checkbox" ${s.validadoCostos ? 'checked disabled' : ''} class="accent-red-600 h-4 w-4">
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderInformeView() {
  const tbody = document.getElementById("table-informe-articulos-body");
  if (!tbody) return;
  let html = "";
  solicitudes.forEach(s => {
    html += `
      <tr class="hover:bg-gray-50 border-b">
        <td class="p-2 text-center"><input type="checkbox" checked class="chk-articulo-informe accent-red-600" value="${s.id}"></td>
        <td class="p-2 text-center">${s.foto ? `<img src="${s.foto}" class="w-8 h-8 object-cover rounded mx-auto">` : '—'}</td>
        <td class="p-2 font-mono font-bold">${s.semana || '—'}</td>
        <td class="p-2 font-bold">${s.proyecto || '—'}</td>
        <td class="p-2 font-mono">${s.articulo || '—'}</td>
        <td class="p-2">${s.boxCambio || '—'}</td>
        <td class="p-2 text-center font-bold">${s.estado || 'Pendiente'}</td>
        <td class="p-2 text-center">${s.validadoCostos ? 'Validado' : 'Pendiente'}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderTablaEntregas() {
  const tbody = document.getElementById("table-entregas-body");
  if (!tbody) return;
  let html = "";
  entregas.forEach(e => {
    html += `
      <tr class="hover:bg-gray-50 border-b">
        <td class="p-2 text-center">${e.foto ? `<img src="${e.foto}" class="w-8 h-8 object-cover rounded mx-auto">` : '—'}</td>
        <td class="p-2 font-mono font-bold">${e.semana || '—'}</td>
        <td class="p-2">${new Date(e.fechaEntrega || Date.now()).toLocaleDateString("es-BO")}</td>
        <td class="p-2 font-bold">${e.proyecto || '—'}</td>
        <td class="p-2 font-mono">${e.articulo || '—'}</td>
        <td class="p-2">${e.tipo || '—'}</td>
        <td class="p-2">${e.entregadoPorNombre || 'Usuario'}</td>
        <td class="p-2 font-bold">${e.destino || '—'}</td>
        <td class="p-2 text-center font-bold text-green-600">${e.recibido ? 'Recibido' : 'En Tránsito'}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function renderProduccionView() {
  const table = document.getElementById("tabla-matriz-produccion");
  if (!table) return;
  table.innerHTML = `<tr><td class="p-4 text-center text-gray-500">Matriz de producción cargada correctamente.</td></tr>`;
}

function cargarPanelSuperAdmin() {
  const tbodyUsers = document.getElementById("table-users-body");
  if (!tbodyUsers) return;
  getDocs(collection(db, "usuarios")).then(snap => {
    let html = "";
    snap.forEach(d => {
      const u = d.data();
      html += `
        <tr class="border-b">
          <td class="p-2"><img src="${u.foto || 'https://via.placeholder.com/40'}" class="w-8 h-8 rounded-full object-cover"></td>
          <td class="p-2 font-bold">${u.nombre}</td>
          <td class="p-2">${u.email}</td>
          <td class="p-2 font-mono">${u.celular || '—'}</td>
          <td class="p-2 font-semibold text-[#D61B28]">${u.rol}</td>
          <td class="p-2 text-center">Admin Mode</td>
        </tr>
      `;
    });
    tbodyUsers.innerHTML = html;
  });
}

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
      resolve(canvas.toDataURL("image/jpeg", calidad));
    };
    img.onerror = () => resolve(null);
  };
  reader.onerror = () => resolve(null);
});

// Exposición global para modales inline
window.abrirModalCambio = () => document.getElementById("modal-new-change")?.classList.remove("hidden");
window.abrirModalMinuta = () => document.getElementById("modal-minuta")?.classList.remove("hidden");
window.abrirModalEntrega = () => document.getElementById("modal-nueva-entrega")?.classList.remove("hidden");
