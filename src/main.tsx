import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { StockProvider } from "./lib/store";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <StockProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </StockProvider>
    </BrowserRouter>
  </StrictMode>,
);
