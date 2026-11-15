// La interfaz funcional se desarrollará en una fase posterior.
// No se crean textos ni se accede a almacenamiento desde esta pantalla.
const app = document.getElementById('app');

if (!app) {
  throw new Error('No se encontró el elemento principal de la aplicación.');
}

app.dataset.foundationVersion = '1';
