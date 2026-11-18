import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./challenge/App";

if (location.pathname === `${import.meta.env.BASE_URL}v1`) {
  location.replace(`${location.pathname}/${location.search}${location.hash}`);
} else createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
