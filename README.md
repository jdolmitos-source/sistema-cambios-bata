# Sistema de Gestión de Cambios - Bata Bolivia

Aplicación web diseñada para la gestión, trazabilidad y aprobación de solicitudes de cambios en proyectos de producción de calzado.

---

## 🛠️ Tecnologías Utilizadas

* **HTML5 & CSS3** (Diseño responsivo con Tailwind CSS y paleta institucional Bata).
* **JavaScript Modular (ES6)**.
* **Firebase Authentication** (Gestión de usuarios y accesos).
* **Cloud Firestore** (Base de datos en tiempo real para trazabilidad de cambios).
* **Chart.js** (Visualización gráfica de avance y reportes en torres).

---

## 👥 Roles de Usuario y Permisos

1. **Calidad:** Registro de solicitudes de cambio.
2. **Costos:** Registro de solicitudes y validación exclusiva mediante checkbox cuando el cambio está marcado como *Realizado*.
3. **Compras:** Registro de solicitudes de cambio.
4. **Producción:** Registro de solicitudes de cambio.
5. **Desarrollo de producto:** Registro de solicitudes y control exclusivo de estados (*En curso*, *Realizado*, *Retrasado*).

---

## 📋 Reglas de Negocio

* **Creación de solicitudes:** Todos los roles pueden registrar un cambio indicando *Proyecto*, *Artículo* y *Box de cambios*.
* **Trazabilidad temporal:** La fecha de creación se genera automáticamente y no puede alterarse.
* **Edición:** Si se modifica el texto del *Box de cambios*, el sistema registra la etiqueta `(editado: DD/MM/AAAA)` con la nueva fecha de actualización.
* **Informes:** Permite filtrar, seleccionar proyectos y graficar el porcentaje de avance por proyecto mediante diagramas de torres/barras.

---

## 🚀 Despliegue en GitHub Pages

1. Ir a **Settings** > **Pages** en el repositorio.
2. En la sección **Build and deployment > Branch**, seleccionar `main` y la carpeta `/ (root)`.
3. Guardar cambios para generar la URL pública de la aplicación.
