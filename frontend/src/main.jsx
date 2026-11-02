import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./workspace.css";
import App from "./App.jsx";
import { toast } from "react-toastify";
import { clearLegacyLocalData } from "./services/legacyStorage";

try {
  await clearLegacyLocalData();
} catch (error) {
  toast.warn(error.message, { autoClose: false });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
