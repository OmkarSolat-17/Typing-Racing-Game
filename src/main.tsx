import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

const container = document.getElementById("root");

/**
 * A missing root is a hard build/deploy error (an HTML shell that was replaced by a
 * placeholder). Say so instead of throwing an opaque "createRoot(null)" from React.
 */
if (!container) {
  const notice = document.createElement("pre");
  notice.textContent = 'KEYRUSH: #root not found — index.html must keep the <div id="root"></div> mount point.';
  notice.setAttribute("role", "alert");
  notice.style.cssText =
    "padding:24px;font:14px/1.6 ui-monospace,monospace;color:#ff5a7a;background:#080b18;min-height:100vh;margin:0;white-space:pre-wrap";
  document.body.append(notice);
  throw new Error("KEYRUSH: #root mount node not found");
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary label="KEYRUSH">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
