/**
 * Workshop dynamic UI — **committed** markup is HTML (generated from NL via `/api/dynamic-ui/generate`).
 * Tooling may still send `{ html: "..." }` overlays; this file parses committed strings as HTML for preview.
 * Exposes `globalThis.workshopDynamicUi`.
 *
 * Contract (platform text):
 * - `data-ws-handler` on interactive elements → handler events with `detail.state`.
 * - `data-wdui-path` / `name` on inputs → snapshots + widget sync.
 * - Output: `data-ws-bind` / `data-ws-bind-src` / `data-ws-bind-href` + JSON Schema on the block for processing.
 */
(function (g) {
  "use strict";

  /**
   * @param {string} committed
   * @returns {{ mode: "empty" } | { mode: "html", html: string }}
   */
  function parseCommitted(committed) {
    const t = String(committed ?? "").trim();
    if (!t) return { mode: "empty" };
    if (/<[a-z][\s\S]*>/i.test(t) || /<\//i.test(t)) {
      return { mode: "html", html: t };
    }
    return { mode: "empty" };
  }

  /**
   * @param {unknown} obj
   * @param {string} path dot path
   */
  function getByPath(obj, path) {
    const p = String(path || "").trim();
    if (!p || obj == null || typeof obj !== "object") return undefined;
    const parts = p.split(".").filter(Boolean);
    let cur = obj;
    for (const part of parts) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = /** @type {Record<string, unknown>} */ (cur)[part];
    }
    return cur;
  }

  /**
   * @param {HTMLElement} root
   * @param {Record<string, unknown>} data
   */
  function applyDataBinds(root, data) {
    root.querySelectorAll("[data-ws-bind]").forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const path = node.getAttribute("data-ws-bind");
      if (!path) return;
      const v = getByPath(data, path);
      const s = v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
      node.textContent = s;
    });
    root.querySelectorAll("[data-ws-bind-src]").forEach((node) => {
      const path = node.getAttribute("data-ws-bind-src");
      if (!path || !(node instanceof HTMLElement)) return;
      const v = getByPath(data, path);
      const url = v === undefined || v === null ? "" : String(v);
      if (node instanceof HTMLImageElement || node instanceof HTMLSourceElement) {
        if (url) node.setAttribute("src", url);
      }
    });
    root.querySelectorAll("[data-ws-bind-href]").forEach((node) => {
      const path = node.getAttribute("data-ws-bind-href");
      if (!path || !(node instanceof HTMLAnchorElement)) return;
      const v = getByPath(data, path);
      const url = v === undefined || v === null ? "" : String(v);
      if (url) node.setAttribute("href", url);
    });
  }

  /**
   * @param {string} blockId
   * @returns {Record<string, string>}
   */
  function collectFieldValuesFromDom(blockId) {
    const card = document.querySelector(`[data-block-id="${blockId}"]`);
    if (!card) return {};
    /** @type {Record<string, string>} */
    const out = {};
    const scope = card.querySelector(".wdui-html-host") || card.querySelector(".dynamic-ui-stage");
    if (!scope) return out;

    scope.querySelectorAll("[data-wdui-path]").forEach((el) => {
      const key = el.getAttribute("data-wdui-path");
      if (!key || !(el instanceof HTMLElement)) return;
      if (el instanceof HTMLInputElement) {
        if (el.type === "checkbox") out[key] = el.checked ? "true" : "false";
        else out[key] = String(el.value);
      } else if (el instanceof HTMLTextAreaElement) {
        out[key] = String(el.value);
      } else if (el instanceof HTMLSelectElement) {
        out[key] = String(el.value);
      }
    });

    scope.querySelectorAll("input[name], textarea[name], select[name]").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      const name = el.getAttribute("name");
      if (!name || out[name]) return;
      if (el instanceof HTMLInputElement) {
        if (el.type === "checkbox") out[name] = el.checked ? "true" : "false";
        else out[name] = String(el.value);
      } else if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        out[name] = String(el.value);
      }
    });

    return out;
  }

  /**
   * @param {HTMLElement} el
   */
  function isFormControl(el) {
    return (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    );
  }

  /**
   * @param {{ html?: string }} spec
   * @param {'input'|'output'} role
   * @param {object} options
   * @param {boolean} options.interactive
   * @param {string} [options.blockId]
   * @param {Record<string, unknown>} [options.data]
   * @param {(key: string, val: string) => void} [options.schedulePatch]
   * @param {(name: string, detail: Record<string, unknown>) => void} [options.onHandler]
   */
  function renderInto(host, spec, role, options) {
    const html = String(spec.html || "");
    const interactive = !!options.interactive;
    const blockId = String(options.blockId || "");
    const data =
      options.data && typeof options.data === "object" ? /** @type {Record<string, unknown>} */ (options.data) : {};
    const schedulePatch = typeof options.schedulePatch === "function" ? options.schedulePatch : null;
    const onHandler = typeof options.onHandler === "function" ? options.onHandler : null;

    host.innerHTML = "";
    host.className = "dynamic-ui-stage wdui-root";

    const wrap = document.createElement("div");
    wrap.className = "dynamic-ui-body wdui-html-host";
    wrap.innerHTML = html;

    if (role === "output") {
      applyDataBinds(wrap, data);
    }

    host.appendChild(wrap);

    if (role === "input" && interactive && onHandler && blockId) {
      /**
       * @param {string} handler
       * @param {HTMLElement} el
       * @param {string} trigger
       */
      function fire(handler, el, trigger) {
        const state = collectFieldValuesFromDom(blockId);
        onHandler(handler, { tag: el.tagName, trigger, state });
      }

      wrap.querySelectorAll("[data-ws-handler]").forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const handler = String(node.getAttribute("data-ws-handler") || "").trim();
        if (!handler) return;

        if (isFormControl(node)) {
          const run = (trigger) => {
            fire(handler, node, trigger);
          };
          node.addEventListener("input", () => run("input"));
          node.addEventListener("change", () => run("change"));
        } else {
          node.addEventListener("click", (ev) => {
            ev.preventDefault();
            fire(handler, node, "click");
          });
        }
      });
    }

    if (role === "input" && interactive && schedulePatch) {
      const sync = (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLElement) || !wrap.contains(t)) return;
        const pathEl = t.closest("[data-wdui-path]");
        if (pathEl) {
          const path = pathEl.getAttribute("data-wdui-path");
          if (!path) return;
          let v = "";
          if (pathEl instanceof HTMLInputElement && pathEl.type === "checkbox") v = pathEl.checked ? "1" : "0";
          else if (
            pathEl instanceof HTMLInputElement ||
            pathEl instanceof HTMLTextAreaElement ||
            pathEl instanceof HTMLSelectElement
          ) {
            v = String(pathEl.value);
          }
          schedulePatch(`field:${path}`, v);
          return;
        }
        if (t.matches("input[name], textarea[name], select[name]")) {
          const name = t.getAttribute("name");
          if (!name) return;
          let v = "";
          if (t instanceof HTMLInputElement && t.type === "checkbox") v = t.checked ? "1" : "0";
          else if (
            t instanceof HTMLInputElement ||
            t instanceof HTMLTextAreaElement ||
            t instanceof HTMLSelectElement
          ) {
            v = String(t.value);
          }
          schedulePatch(`name:${name}`, v);
        }
      };
      wrap.addEventListener("input", sync, true);
      wrap.addEventListener("change", sync, true);
    }
  }

  g.workshopDynamicUi = {
    parseCommitted,
    collectFieldValuesFromDom,
    getByPath,
    renderInto,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
