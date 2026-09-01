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
  getDoc,
  doc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ⚠️ REEMPLAZA ESTO CON LA CONFIGURACIÓN DE TU PROYECTO FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyDCKYflkU3rbMGqdudZzS3RP6uqrHBHIhQ",
  authDomain: "sistema-de-cambios-bata.firebaseapp.com",
  projectId: "sistema-de-cambios-bata",
  storageBucket: "sistema-de-cambios-bata.firebasestorage.app",
  messagingSenderId: "87556921976",
  appId: "1:87556921976:web:fe6474c0154dfce19beb8d"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Estado de la aplicación
let currentUser = null;
let userData = null;
let solicitudes = [];
let chartInstance = null;

// Referencias del DOM
const authContainer = document.getElementById("auth-container");
const appContainer = document.getElementById("app-container");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const formLogin = document.getElementById("form-login");
const formRegister = document.getElementById("form-register");
const authError = document.getElementById("auth-error");

const userDisplayName = document.getElementById("user-display-name");
const userDisplayRole = document.getElementById("user-display-role");
const btnLogout = document.getElementById("btn-logout");

const menuBtnCambios = document.getElementById("menu-btn-cambios");
const menuBtnInforme = document.getElementById("menu-btn-informe");
const viewCambios = document.getElementById("view-cambios");
const viewInforme = document.getElementById("view-informe");

const modalNewChange = document.getElementById("modal-new-change");
const btnOpenNewChange = document.getElementById("btn-open-new-change");
const modalBtnClose = document.getElementById("modal-btn-close");
const modalBtnCancel = document.getElementById("modal-btn-cancel");
const formNewChange = document.getElementById("form-new-change");
const tableBody = document.getElementById("table-cambios-body");
const tableEmptyState = document.getElementById("table-empty-state");

// --- INTERFAZ LOGIN / REGISTRO ---
tabLogin.addEventListener("click", () => {
  tabLogin.className = "w-1/2 pb-2 text-center font-bold text-[#D61B28] border-b-2 border-[#D61B28]";
  tabRegister.className = "w-1/2 pb-2 text-center font-bold text-gray-400";
  formLogin.classList.remove("hidden");
  formRegister.classList.add("hidden");
  authError.classList.add("hidden");
});

tabRegister.addEventListener("click", () => {
  tabRegister.className = "w-1/2 pb-2 text-center font-bold text-[#D61B28] border-b-2 border-[#D61B28]";
  tabLogin.className = "w-1/2 pb-2 text-center font-bold text-gray-400";
  formRegister.classList.remove("hidden");
  formLogin.classList.add("hidden");
  authError.classList.add("hidden");
});

// Registro de usuario con asignación de Rol en Firestore
formRegister.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("reg-name").value;
  const email = document.getElementById("reg-email").value;
  const role = document.getElementById("reg-role").value;
  const pass = document.getElementById("reg-pass").value;

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    const uid = userCredential.user.uid;
    // Guardar información del usuario y su rol
    await setDoc(doc(db, "usuarios", uid), {
      nombre: name,
      email: email,
      rol: role,
      fechaCreacion: serverTimestamp()
    });
  } catch (error) {
    authError.textContent = error.message;
    authError.classList.remove("hidden");
  }
});

// Inicio de Sesión
formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const pass = document.getElementById("login-pass").value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (error) {
    authError.textContent = "Credenciales incorrectas o usuario no registrado.";
    authError.classList.remove("hidden");
  }
});

// Cierre de Sesión
btnLogout.addEventListener("click", () => signOut(auth));

// Observador de estado de Autenticación
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const docSnap = await getDoc(doc(db, "usuarios", user.uid));
    if (docSnap.exists()) {
      userData = docSnap.data();
      userDisplayName.textContent = userData.nombre;
      userDisplayRole.textContent = userData.rol;
      authContainer.classList.add("hidden");
      appContainer.classList.remove("hidden");
      escucharCambiosFirestore();
    }
  } else {
    currentUser = null;
    userData = null;
    authContainer.classList.remove("hidden");
    appContainer.classList.add("hidden");
  }
});

// --- NAVEGACIÓN ENTRE MENÚS ---
menuBtnCambios.addEventListener("click", () => {
  viewCambios.classList.remove("hidden");
  viewInforme.classList.add("hidden");
  menuBtnCambios.className = "w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl font-semibold text-sm transition bg-red-50 text-[#D61B28]";
  menuBtnInforme.className = "w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl font-semibold text-sm text-gray-600 hover:bg-gray-100 transition";
});

menuBtnInforme.addEventListener("click", () => {
  viewInforme.classList.remove("hidden");
  viewCambios.classList.add("hidden");
  menuBtnInforme.className = "w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl font-semibold text-sm transition bg-red-50 text-[#D61B28]";
  menuBtnCambios.className = "w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl font-semibold text-sm text-gray-600 hover:bg-gray-100 transition";
  renderInformeView();
});

// --- MODAL SOLICITUD DE CAMBIO ---
btnOpenNewChange.addEventListener("click", () => modalNewChange.classList.remove("hidden"));
modalBtnClose.addEventListener("click", () => modalNewChange.classList.add("hidden"));
modalBtnCancel.addEventListener("click", () => modalNewChange.classList.add("hidden"));

// Guardar nueva solicitud en Firestore (Cualquiera de los 5 roles)
formNewChange.addEventListener("submit", async (e) => {
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
      estado: "En curso", // Estado inicial
      validadoCostos: false,
      fechaCreacion: new Date().toISOString(),
      ultimaEdicion: null,
      timestamp: serverTimestamp()
    });
    formNewChange.reset();
    modalNewChange.classList.add("hidden");
  } catch (err) {
    alert("Error al registrar cambio: " + err.message);
  }
});

// --- TIEMPO REAL: ESCUCHAR SOLICITUDES DE FIRESTORE ---
function escucharCambiosFirestore() {
  const q = query(collection(db, "solicitudes_cambios"), orderBy("timestamp", "desc"));
  onSnapshot(q, (snapshot) => {
    solicitudes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderTablaCambios();
  });
}

// Formatear Fecha
function formatearFecha(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// --- RENDERIZAR TABLA DE CAMBIOS CON REGLAS DE ROLES ---
function renderTablaCambios() {
  tableBody.innerHTML = "";
  if (solicitudes.length === 0) {
    tableEmptyState.classList.remove("hidden");
    return;
  }
  tableEmptyState.classList.add("hidden");

  solicitudes.forEach((item) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50/80 transition border-b border-gray-100";

    // Indicador de edición
    let textoBox = item.boxCambio;
    if (item.ultimaEdicion) {
      textoBox += `<br><span class="text-[10px] text-gray-400 italic"> (editado: ${formatearFecha(item.ultimaEdicion)})</span>`;
    }

    // Permisos por Rol:
    const esDesarrollo = userData.rol === "Desarrollo de producto";
    const esCostos = userData.rol === "Costos";

    // Selector de Estado (Solo editable por Desarrollo de producto)
    let estadoHTML = "";
    if (esDesarrollo) {
      estadoHTML = `
        <select onchange="window.actualizarEstado('${item.id}', this.value)" class="border border-gray-300 rounded px-2 py-1 bg-white font-medium focus:ring-1 focus:ring-[#D61B28]">
          <option value="En curso" ${item.estado === "En curso" ? "selected" : ""}>En curso</option>
          <option value="Realizado" ${item.estado === "Realizado" ? "selected" : ""}>Realizado</option>
          <option value="Retrasado" ${item.estado === "Retrasado" ? "selected" : ""}>Retrasado</option>
        </select>
      `;
    } else {
      const colorTag = item.estado === "Realizado" ? "bg-green-100 text-green-700" : (item.estado === "Retrasado" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700");
      estadoHTML = `<span class="px-2 py-1 rounded font-semibold text-[11px] ${colorTag}">${item.estado}</span>`;
    }

    // Checkbox Validación Costos (Visible al estar "Realizado", solo operable por Costos)
    let costosHTML = "";
    if (item.estado === "Realizado") {
      costosHTML = `
        <div class="flex items-center justify-center space-x-1">
          <input type="checkbox" ${item.validadoCostos ? "checked" : ""} ${!esCostos ? "disabled" : ""} 
                 onchange="window.validarCostos('${item.id}', this.checked)"
                 class="h-4 w-4 text-[#D61B28] rounded border-gray-300 focus:ring-[#D61B28] cursor-${esCostos ? 'pointer' : 'not-allowed'}">
          <span class="text-[11px] font-medium text-gray-500">${item.validadoCostos ? 'Validado' : 'Pendiente'}</span>
        </div>
      `;
    } else {
      costosHTML = `<span class="text-gray-300 text-[11px]">N/A</span>`;
    }

    tr.innerHTML = `
      <td class="p-3 text-gray-500 whitespace-nowrap">${formatearFecha(item.fechaCreacion)}</td>
      <td class="p-3 font-bold text-gray-800">${item.proyecto}</td>
      <td class="p-3 font-mono text-gray-600">${item.articulo}</td>
      <td class="p-3 text-gray-700 leading-relaxed">
        <div>${textoBox}</div>
        <button onclick="window.editarTextoBox('${item.id}', '${item.boxCambio.replace(/'/g, "\\'")}')" class="text-[11px] text-blue-600 hover:underline mt-1">
          <i class="fa-solid fa-pen-to-square"></i> Editar box
        </button>
      </td>
      <td class="p-3 whitespace-nowrap">
        <span class="font-medium text-gray-800">${item.solicitanteNombre}</span>
        <span class="block text-[10px] text-gray-400">(${item.solicitanteRol})</span>
      </td>
      <td class="p-3 text-center whitespace-nowrap">${estadoHTML}</td>
      <td class="p-3 text-center whitespace-nowrap">${costosHTML}</td>
    `;
    tableBody.appendChild(tr);
  });
}

// --- FUNCIONES GLOBALES DE MODIFICACIÓN ---
window.actualizarEstado = async (id, nuevoEstado) => {
  await updateDoc(doc(db, "solicitudes_cambios", id), { estado: nuevoEstado });
};

window.validarCostos = async (id, checkValue) => {
  await updateDoc(doc(db, "solicitudes_cambios", id), { validadoCostos: checkValue });
};

window.editarTextoBox = async (id, textoActual) => {
  const nuevoTexto = prompt("Modificar el box de cambios:", textoActual);
  if (nuevoTexto !== null && nuevoTexto.trim() !== "" && nuevoTexto !== textoActual) {
    await updateDoc(doc(db, "solicitudes_cambios", id), {
      boxCambio: nuevoTexto.trim(),
      ultimaEdicion: new Date().toISOString()
    });
  }
};

// --- MÓDULO DE INFORME Y DIAGRAMA DE TORRES ---
function renderInformeView() {
  const container = document.getElementById("report-project-selection-list");
  container.innerHTML = "";
  
  // Extraer proyectos únicos
  const proyectosUnicos = [...new Set(solicitudes.map(s => s.proyecto))];
  
  proyectosUnicos.forEach((proy) => {
    const div = document.createElement("div");
    div.className = "flex items-center space-x-2 bg-gray-50 p-2 rounded border border-gray-100";
    div.innerHTML = `
      <input type="checkbox" value="${proy}" checked class="report-chk h-4 w-4 text-[#D61B28] rounded border-gray-300">
      <span class="text-xs font-semibold text-gray-700">${proy}</span>
    `;
    container.appendChild(div);
  });

  document.querySelectorAll(".report-chk").forEach(chk => {
    chk.addEventListener("change", actualizarGraficoTorres);
  });

  actualizarGraficoTorres();
}

document.getElementById("btn-select-all-projects").addEventListener("click", () => {
  document.querySelectorAll(".report-chk").forEach(c => c.checked = true);
  actualizarGraficoTorres();
});

document.getElementById("btn-deselect-all-projects").addEventListener("click", () => {
  document.querySelectorAll(".report-chk").forEach(c => c.checked = false);
  actualizarGraficoTorres();
});

document.getElementById("report-filter-status").addEventListener("change", actualizarGraficoTorres);

function actualizarGraficoTorres() {
  const filtroEstado = document.getElementById("report-filter-status").value;
  const seleccionados = Array.from(document.querySelectorAll(".report-chk:checked")).map(c => c.value);

  // Filtrar solicitudes
  const itemsFiltrados = solicitudes.filter(s => {
    const coincideProyecto = seleccionados.includes(s.proyecto);
    const coincideEstado = filtroEstado === "todos" || s.estado === filtroEstado;
    return coincideProyecto && coincideEstado;
  });

  // Calcular % de avance por cada proyecto seleccionado
  const labels = seleccionados;
  const porcentajes = labels.map(p => {
    const delProy = itemsFiltrados.filter(s => s.proyecto === p);
    if (delProy.length === 0) return 0;
    const realizados = delProy.filter(s => s.estado === "Realizado").length;
    return Math.round((realizados / delProy.length) * 100);
  });

  const ctx = document.getElementById("chartAvance").getContext("2d");
  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "% Avance de Solicitudes Realizadas",
        data: porcentajes,
        backgroundColor: "rgba(214, 27, 40, 0.85)", // Rojo Bata
        borderColor: "#D61B28",
        borderWidth: 1.5,
        borderRadius: 6,
        barPercentage: 0.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { callback: v => v + "%" }
        }
      }
    }
  });
}