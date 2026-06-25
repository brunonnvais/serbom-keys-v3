import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import MobileApp from "./MobileApp";

// Quando uma nova versão do app assume o controle (novo deploy), recarrega
// automaticamente para o usuário não ficar preso na versão antiga em cache.
if ("serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

// Página dedicada do operador (mobile) em /operador — o app desktop continua na raiz.
const isOperador = window.location.pathname.startsWith("/operador");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isOperador ? <MobileApp /> : <App />}
  </React.StrictMode>
);
