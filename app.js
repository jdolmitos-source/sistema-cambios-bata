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
let chartInstance = null;

// Modales Portada
const welcomeContainer = document.getElementById("welcome-container");
const appContainer = document.getElementById("app-container");
const modalLogin = document.getElementById("modal-login");
const modalRegister = document.getElementById("modal-register");

document.getElementById("btn-show-login").onclick = () => modalLogin.classList.remove("hidden");
document.getElementById("btn-show-register").onclick = () => modalRegister.classList.remove("hidden");
document.getElementById("close-login").onclick = () => modalLogin.classList.add("hidden");
document.getElementById("close-register").onclick = () => modalRegister.classList.add("hidden");

// Registro
document.getElementById("form-register").onsubmit = async (e) => {
  e.preventDefault();
  const name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const role = document.getElementById("reg-role").value;
  const pass = document.getElementById("reg-pass").value;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, "usuarios", cred.user.uid), {
      nombre: name,
      email: email,
      rol: role,
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

// Cerrar Sesión
document.getElementById("btn-logout").onclick = () => signOut(auth);

// Observador de Sesión
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const docSnap = await getDoc(doc(db, "usuarios", user.uid));
    if (docSnap.exists()) {
      userData = docSnap.data();
      document.getElementById("user-display-name").textContent = userData.nombre;
      document.getElementById("user-display-role").textContent = userData.rol;
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

// Menú Navegación
const viewCambios = document.getElementById("view-cambios");
const viewInforme = document.getElementById("view-informe");
const menuBtnCambios = document.getElementById("menu-btn-cambios");
const menuBtnInforme = document.getElementById("menu-btn-informe");

menuBtnCambios.onclick = () => {
  viewCambios.classList.remove("hidden");
  viewInforme.classList.add("hidden");
  menuBtnCambios.className = "w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl font-semibold text-sm transition bg-red-50 text-[#D61B28] cursor-pointer";
  menuBtnInforme.className = "w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl font-semibold text-sm text-gray-600 hover:bg-gray-100 transition cursor-pointer";
};

menuBtnInforme.onclick = () => {
  viewInforme.classList.remove("hidden");
  viewCambios.classList.add("hidden");
  menuBtnInforme.className = "w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl font-semibold text-sm transition bg-red-50 text-[#D61B28] cursor-pointer";
  menuBtnCambios.className = "w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl font-semibold text-sm text-gray-600 hover:bg-gray-100 transition cursor-pointer";
  renderInformeView();
};

// Modal Nueva Solicitud
const modalNewChange = document.getElementById("modal-new-change");
document.getElementById("btn-open-new-change").onclick = () => modalNewChange.classList.remove("hidden");
document.getElementById("modal-btn-close").onclick = () => modalNewChange.classList.add("hidden");
document.getElementById("modal-btn-cancel").onclick = () => modalNewChange.classList.add("hidden");

// Registrar Cambio
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
      validadoCostos: false,
      fechaCreacion: new Date().toISOString(),
      ultimaEdicion: null,
      timestamp: serverTimestamp()
    });

    document.getElementById("form-new-change").reset();
    modalNewChange.classList.add("hidden");
  } catch (err) {
    alert("Error al registrar cambio: " + err.message);
  }
};

// Escuchar cambios Firestore
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

  if (solicitudes.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  solicitudes.forEach((item) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50/80 transition border-b border-gray-100";

    let textoBox = item.boxCambio;
    if (item.ultimaEdicion) {
      textoBox += `<br><span class="text-[10px] text-gray-400 italic"> (editado: ${formatearFecha(item.ultimaEdicion)})</span>`;
    }

    const esDesarrollo = userData.rol === "Desarrollo de producto";
    const esCostos = userData.rol === "Costos";

    let estadoHTML = "";
    if (esDesarrollo) {
      estadoHTML = `
        <select onchange="window.actualizarEstado('${item.id}', this.value)" class="border border-orange-200 text-orange-600 bg-orange-50 font-semibold rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-[#D61B28]">
          <option value="En proceso" ${item.estado === "En proceso" ? "selected" : ""}>En proceso</option>
          <option value="Realizado" ${item.estado === "Realizado" ? "selected" : ""}>Realizado</option>
          <option value="Retrasado" ${item.estado === "Retrasado" ? "selected" : ""}>Retrasado</option>
        </select>
      `;
    } else {
      const estilo = item.estado === "Realizado" ? "border-green-200 text-green-700 bg-green-50" : (item.estado === "Retrasado" ? "border-red-200 text-red-700 bg-red-50" : "border-orange-200 text-orange-600 bg-orange-50");
      estadoHTML = `<span class="border ${estilo} px-3 py-1 rounded-lg font-bold text-xs">${item.estado}</span>`;
    }

    let costosHTML = "";
    if (item.estado === "Realizado") {
      costosHTML = `
        <input type="checkbox" ${item.validadoCostos ? "checked" : ""} ${!esCostos ? "disabled" : ""} 
               onchange="window.validarCostos('${item.id}', this.checked)"
               class="h-4 w-4 accent-[#D61B28] rounded border-gray-300 cursor-${esCostos ? 'pointer' : 'not-allowed'}">
      `;
    } else {
      costosHTML = `<input type="checkbox" disabled class="h-4 w-4 text-gray-300 rounded border-gray-200 opacity-40">`;
    }

    tr.innerHTML = `
      <td class="p-3.5 font-bold text-gray-800 border-r border-gray-100">${item.proyecto}</td>
      <td class="p-3.5 font-mono text-gray-600 border-r border-gray-100">${item.articulo}</td>
      <td class="p-3.5 text-gray-700 border-r border-gray-100">
        <div>${textoBox}</div>
        <button onclick="window.editarTextoBox('${item.id}', '${item.boxCambio.replace(/'/g, "\\'")}')" class="text-[10px] text-blue-600 hover:underline mt-1 font-medium inline-flex items-center space-x-1">
          <i class="fa-solid fa-pencil"></i> <span>editar</span>
        </button>
      </td>
      <td class="p-3.5 text-center border-r border-gray-100 whitespace-nowrap">${estadoHTML}</td>
      <td class="p-3.5 text-center whitespace-nowrap">${costosHTML}</td>
    `;
    tbody.appendChild(tr);
  });
}

window.actualizarEstado = async (id, nuevoEstado) => {
  await updateDoc(doc(db, "solicitudes_cambios", id), { estado: nuevoEstado });
};

window.validarCostos = async (id, checkValue) => {
  await updateDoc(doc(db, "solicitudes_cambios", id), { validadoCostos: checkValue });
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

// Informe y Grafico
function renderInformeView() {
  const container = document.getElementById("report-project-selection-list");
  container.innerHTML = "";
  const proyectosUnicos = [...new Set(solicitudes.map(s => s.proyecto))];

  proyectosUnicos.forEach((proy) => {
    const div = document.createElement("div");
    div.className = "flex items-center space-x-2 bg-gray-50 p-2 rounded-lg border border-gray-100";
    div.innerHTML = `
      <input type="checkbox" value="${proy}" checked class="report-chk h-4 w-4 accent-[#D61B28]">
      <span class="text-xs font-semibold text-gray-700">${proy}</span>
    `;
    container.appendChild(div);
  });

  document.querySelectorAll(".report-chk").forEach(chk => {
    chk.onchange = actualizarGraficoTorres;
  });
  actualizarGraficoTorres();
}

document.getElementById("report-filter-status").onchange = actualizarGraficoTorres;

function actualizarGraficoTorres() {
  const filtroEstado = document.getElementById("report-filter-status").value;
  const seleccionados = Array.from(document.querySelectorAll(".report-chk:checked")).map(c => c.value);

  const itemsFiltrados = solicitudes.filter(s => {
    const coincideProyecto = seleccionados.includes(s.proyecto);
    const coincideEstado = filtroEstado === "todos" || s.estado === filtroEstado;
    return coincideProyecto && coincideEstado;
  });

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
        label: "% Avance Realizado",
        data: porcentajes,
        backgroundColor: "rgba(214, 27, 40, 0.85)",
        borderColor: "#D61B28",
        borderWidth: 1,
        borderRadius: 8,
        barPercentage: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { callback: v => v + "%" } }
      }
    }
  });
}
