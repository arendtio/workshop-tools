/**
 * Workshop dynamic UI — HTML-first, sandbox-style (innerHTML). Loaded before app.js.
 * Exposes `globalThis.workshopDynamicUi`.
 *
 * Conventions (documented for prompts; not enforced):
 * - `data-ws-handler` on interactive controls → `input`/`change` (form controls) or `click` (others);
 *   payload includes full field `state` (see platform contract in orchestration).
 * - `data-wdui-path` / `name` on inputs → snapshots + widget sync.
 * - Output: `data-ws-bind` / `data-ws-bind-src` / `data-ws-bind-href`.
 */
(function (g) {
  "use strict";

  /**
   * @param {unknown} handlers
   * @returns {string[]}
   */
  function normalizeHandlers(handlers) {
    if (!Array.isArray(handlers)) return [];
    return handlers.map((h) => String(h).trim()).filter(Boolean);
  }

  /**
   * @param {string} committed
   * @returns {{ mode: "empty" } | { mode: "html", html: string, handlers: string[] }}
   */
  function parseCommitted(committed) {
    const t = String(committed ?? "").trim();
    if (!t) return { mode: "empty" };
    if (t.startsWith("{")) {
      try {
        const o = JSON.parse(t);
        if (o && typeof o === "object" && o.kind === "workshop-dynamic-ui" && typeof o.html === "string") {
          return { mode: "html", html: o.html, handlers: normalizeHandlers(o.handlers) };
        }
      } catch (_) {
        /* ignore */
      }
      return { mode: "empty" };
    }
    if (/<[a-z][\s\S]*>/i.test(t) || /<\//i.test(t)) {
      return { mode: "html", html: t, handlers: [] };
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
   * @param {{ html?: string, handlers?: string[] }} spec
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
    const handlers = normalizeHandlers(spec.handlers);
    const schedulePatch = typeof options.schedulePatch === "function" ? options.schedulePatch : null;
    const onHandler = typeof options.onHandler === "function" ? options.onHandler : null;

    host.innerHTML = "";
    host.className = "dynamic-ui-stage wdui-root";

    if (handlers.length) {
      const hint = document.createElement("div");
      hint.className = "dynamic-ui-cap wdui-handler-hint";
      hint.textContent = `Hinweis (handlers): ${handlers.slice(0, 8).join(", ")}${handlers.length > 8 ? " …" : ""}`;
      host.appendChild(hint);
    }

    const wrap = document.createElement("div");
    wrap.className = "dynamic-ui-body wdui-html-host";
    wrap.innerHTML = html;

    if (role === "output") {
      applyDataBinds(wrap, data);
    }

    host.appendChild(wrap);

    if (role === "input" && interactive && onHandler && blockId) {
      /** @type {WeakMap<Element, number>} */
      const rangeTimers = new WeakMap();

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
            if (node instanceof HTMLInputElement && node.type === "range" && trigger === "input") {
              const prev = rangeTimers.get(node);
              if (prev) window.clearTimeout(prev);
              rangeTimers.set(
                node,
                window.setTimeout(() => {
                  rangeTimers.delete(node);
                  fire(handler, node, "input");
                }, 140),
              );
              return;
            }
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
