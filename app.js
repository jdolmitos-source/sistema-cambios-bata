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
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Credenciales oficiales de tu proyecto Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDCKYflkU3rbMGqdudZzS3RP6uqrHBHIhQ",
  authDomain: "sistema-de-cambios-bata.firebaseapp.com",
  projectId: "sistema-de-cambios-bata",
  storageBucket: "sistema-de-cambios-bata.firebasestorage.app",
  messagingSenderId: "87556921976",
  appId: "1:87556921976:web:fe6474c0154dfce19beb8d",
  measurementId: "G-0XXGS651PJ"
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

// Elementos de la Portada y Modales
const welcomeContainer = document.getElementById("welcome-container");
const appContainer = document.getElementById("app-container");
const modalLogin = document.getElementById("modal-login");
const modalRegister = document.getElementById("modal-register");

document.getElementById("btn-show-login").addEventListener("click", () => modalLogin.classList.remove("hidden"));
document.getElementById("btn-show-register").addEventListener("click", () => modalRegister.classList.remove("hidden"));
document.getElementById("close-login").addEventListener("click", () => modalLogin.classList.add("hidden"));
document.getElementById("close-register").addEventListener("click", () => modalRegister.classList.add("hidden"));

// Registro de Usuario con Rol
document.getElementById("form-register").addEventListener("submit", async (e) => {
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
});

// Inicio de Sesión
document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const pass = document.getElementById("login-pass").value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    modalLogin.classList.add("hidden");
  } catch (err) {
    alert("Credenciales incorrectas o usuario no registrado.");
  }
});

// Cerrar Sesión
document.getElementById("btn-logout").addEventListener("click", () => signOut(auth));

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

// Menús de Navegación
const viewCambios = document.getElementById("view-cambios");
const viewInforme = document.getElementById("view-informe");
const menuBtnCambios = document.getElementById("menu-btn-cambios");
const menuBtnInforme = document.getElementById("menu-btn-informe");

menuBtnCambios.addEventListener("click", () => {
  viewCambios.classList.remove("hidden");
  viewInforme.classList.add("hidden");
  menuBtnCambios.className = "w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl font-semibold text-sm transition bg-red-50 text-[#D61B28]";
  menuBtnInforme.className = "w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl font-semibold text-sm text-gray-600 hover:bg-gray-100 transition";
});

menuBtnInforme.addEventListener("click", () => {
