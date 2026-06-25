import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import MobileApp from "./MobileApp";

// Página dedicada do operador (mobile) em /operador — o app desktop continua na raiz.
const isOperador = window.location.pathname.startsWith("/operador");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isOperador ? <MobileApp /> : <App />}
  </React.StrictMode>
);
