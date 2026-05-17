/**
 * Workshop declarative dynamic UI (v2). Loaded before app.js; exposes `globalThis.workshopDynamicUi`.
 * No innerHTML with untrusted strings — text from spec uses textContent; model JSON is bound as text/numbers only.
 */
(function (g) {
  "use strict";

  /**
   * @param {string} committed
   * @returns {{ mode: 'nl', text: string } | { mode: 'spec', spec: Record<string, unknown> }}
   */
  function parseCommitted(committed) {
    const t = String(committed ?? "").trim();
    if (!t.startsWith("{")) return { mode: "nl", text: t };
    try {
      const o = JSON.parse(t);
      if (
        o &&
        typeof o === "object" &&
        o.kind === "workshop-dynamic-ui" &&
        Number(o.version) === 2 &&
        o.root &&
        typeof o.root === "object"
      ) {
        return { mode: "spec", spec: /** @type {Record<string, unknown>} */ (o) };
      }
    } catch (_) {
      /* ignore */
    }
    return { mode: "nl", text: t };
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
   * Minimal JSON Schema subset (objects, arrays, primitives, enum, required, additionalProperties).
   * @param {unknown} value
   * @param {unknown} schema
   * @param {string} path
   * @returns {{ ok: boolean, errors: string[] }}
   */
  function validateAgainstSchema(value, schema, path) {
    /** @type {string[]} */
    const errors = [];
    if (!schema || typeof schema !== "object") return { ok: true, errors };

    const s = /** @type {Record<string, unknown>} */ (schema);
    if (Array.isArray(s.enum)) {
      if (!s.enum.includes(value)) {
        errors.push(`${path || "$"}: value not in enum`);
      }
      return { ok: errors.length === 0, errors };
    }

    const t = s.type;
    if (t === "object") {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        errors.push(`${path || "$"}: expected object`);
        return { ok: false, errors };
      }
      const vo = /** @type {Record<string, unknown>} */ (value);
      const basePath = path || "$";
      const req = Array.isArray(s.required) ? s.required.map(String) : [];
      for (const k of req) {
        if (!(k in vo)) errors.push(`${basePath}: missing required property "${k}"`);
      }
      const props = s.properties && typeof s.properties === "object" ? /** @type {Record<string, unknown>} */ (s.properties) : {};
      const addl = s.additionalProperties;
      for (const k of Object.keys(vo)) {
        if (addl === false && !Object.prototype.hasOwnProperty.call(props, k)) {
          errors.push(`${basePath}: additional property "${k}" not allowed`);
        }
        if (Object.prototype.hasOwnProperty.call(props, k)) {
          const subPath = path ? `${path}.${k}` : k;
          const sub = validateAgainstSchema(vo[k], props[k], subPath);
          errors.push(...sub.errors);
        }
      }
      return { ok: errors.length === 0, errors };
    }

    if (t === "array") {
      if (!Array.isArray(value)) {
        errors.push(`${path || "$"}: expected array`);
        return { ok: false, errors };
      }
      if (s.items && typeof s.items === "object") {
        const aprefix = path && path !== "$" ? path : "$";
        value.forEach((v, i) => {
          const sub = validateAgainstSchema(v, s.items, `${aprefix}[${i}]`);
          errors.push(...sub.errors);
        });
      }
      return { ok: errors.length === 0, errors };
    }

    if (t === "string") {
      if (typeof value !== "string") errors.push(`${path || "$"}: expected string`);
      return { ok: errors.length === 0, errors };
    }
    if (t === "number") {
      if (typeof value !== "number" || Number.isNaN(value)) errors.push(`${path || "$"}: expected number`);
      return { ok: errors.length === 0, errors };
    }
    if (t === "integer") {
      if (typeof value !== "number" || !Number.isFinite(value) || Math.floor(value) !== value) {
        errors.push(`${path || "$"}: expected integer`);
      }
      return { ok: errors.length === 0, errors };
    }
    if (t === "boolean") {
      if (typeof value !== "boolean") errors.push(`${path || "$"}: expected boolean`);
      return { ok: errors.length === 0, errors };
    }

    return { ok: true, errors };
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
    card.querySelectorAll("[data-wdui-path]").forEach((el) => {
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
    return out;
  }

  /**
   * @param {unknown} node
   * @param {Record<string, unknown>} ctx
   */
  function renderNode(node, ctx) {
    if (!node || typeof node !== "object") return null;
    const n = /** @type {Record<string, unknown>} */ (node);
    const t = String(n.t || "");
    const role = String(ctx.role || "");

    if (t === "stack") {
      const wrap = document.createElement("div");
      wrap.className = "wdui-stack";
      const ch = Array.isArray(n.children) ? n.children : [];
      ch.forEach((child) => {
        const el = renderNode(child, ctx);
        if (el) wrap.appendChild(el);
      });
      return wrap;
    }

    if (t === "row") {
      const wrap = document.createElement("div");
      wrap.className = "wdui-row";
      const ch = Array.isArray(n.children) ? n.children : [];
      ch.forEach((child) => {
        const el = renderNode(child, ctx);
        if (el) wrap.appendChild(el);
      });
      return wrap;
    }

    if (t === "heading") {
      const h = document.createElement("div");
      h.className = "wdui-heading";
      h.textContent = String(n.text ?? "");
      return h;
    }

    if (t === "text") {
      const p = document.createElement("div");
      p.className = "wdui-text";
      if (role === "output" && n.bind) {
        const v = getByPath(ctx.data, String(n.bind));
        p.textContent = v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
      } else {
        p.textContent = String(n.value ?? "");
      }
      return p;
    }

    if (t === "field") {
      const path = String(n.path || "").trim();
      const label = String(n.label ?? path);
      const input = String(n.input || "text");
      const isFormula = !!n.formula;
      const wrap = document.createElement("label");
      wrap.className = "wdui-field";
      const cap = document.createElement("span");
      cap.className = "wdui-field-label";
      cap.textContent = label;
      wrap.appendChild(cap);

      const disabled = !ctx.interactive;
      const dynKey = path ? `field:${path}` : "";

      if (input === "textarea") {
        const ta = document.createElement("textarea");
        ta.className = "wdui-input wdui-textarea";
        ta.rows = Math.max(2, Math.min(12, Number(n.rows) || 3));
        ta.disabled = disabled || isFormula;
        ta.readOnly = isFormula;
        if (path) ta.setAttribute("data-wdui-path", path);
        if (dynKey) ta.setAttribute("data-dyn-key", dynKey);
        ta.placeholder = String(n.placeholder || "");
        wrap.appendChild(ta);
      } else if (input === "checkbox") {
        const row = document.createElement("span");
        row.className = "wdui-check-row";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.disabled = disabled;
        if (path) cb.setAttribute("data-wdui-path", path);
        if (dynKey) cb.setAttribute("data-dyn-key", dynKey);
        row.appendChild(cb);
        wrap.appendChild(row);
      } else if (input === "select") {
        const sel = document.createElement("select");
        sel.className = "wdui-input wdui-select";
        sel.disabled = disabled;
        if (path) sel.setAttribute("data-wdui-path", path);
        if (dynKey) sel.setAttribute("data-dyn-key", dynKey);
        const opts = Array.isArray(n.options) ? n.options : [];
        opts.forEach((o) => {
          const op = document.createElement("option");
          const s = String(o);
          op.value = s;
          op.textContent = s;
          sel.appendChild(op);
        });
        wrap.appendChild(sel);
      } else {
        const inp = document.createElement("input");
        inp.className = "wdui-input";
        if (input === "number") inp.type = "number";
        else inp.type = "text";
        inp.disabled = disabled || isFormula;
        inp.readOnly = isFormula;
        if (path) inp.setAttribute("data-wdui-path", path);
        if (dynKey) inp.setAttribute("data-dyn-key", dynKey);
        inp.placeholder = String(n.placeholder || "");
        wrap.appendChild(inp);
      }

      const el = wrap.querySelector("[data-wdui-path]");
      if (el && ctx.interactive && ctx.schedulePatch && dynKey) {
        const sync = () => {
          let v = "";
          if (el instanceof HTMLInputElement && el.type === "checkbox") v = el.checked ? "1" : "0";
          else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
            v = String(el.value);
          }
          ctx.schedulePatch(dynKey, v);
        };
        el.addEventListener("input", sync);
        el.addEventListener("change", sync);
      }

      return wrap;
    }

    if (t === "button") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wdui-btn";
      btn.textContent = String(n.label ?? "Action");
      const handler = String(n.handler || "").trim();
      const allowed = ctx.allowedHandlers instanceof Set ? ctx.allowedHandlers : new Set();
      const okHandler = handler && allowed.has(handler);
      btn.disabled = !ctx.interactive || !okHandler;
      if (!okHandler && handler) btn.title = `Handler "${handler}" is not listed in spec.handlers`;
      btn.addEventListener("click", () => {
        if (btn.disabled || !okHandler) return;
        if (typeof ctx.onHandler === "function") ctx.onHandler(handler, { path: n.path ? String(n.path) : undefined });
      });
      return btn;
    }

    if (t === "bars" && role === "output") {
      const bind = String(n.bind || "").trim();
      const raw = bind ? getByPath(ctx.data, bind) : undefined;
      /** @type {{ label?: string, value?: number }[]} */
      let rows = [];
      if (Array.isArray(raw)) {
        rows = raw.map((x) => {
          if (!x || typeof x !== "object") return { label: "?", value: 0 };
          const o = /** @type {Record<string, unknown>} */ (x);
          return { label: String(o.label ?? ""), value: Number(o.value) || 0 };
        });
      }
      const wrap = document.createElement("div");
      wrap.className = "wdui-bars";
      if (!rows.length) {
        const ph = document.createElement("div");
        ph.className = "wdui-bars-empty";
        ph.textContent = "(no series data)";
        wrap.appendChild(ph);
        return wrap;
      }
      const max = Math.max(...rows.map((r) => r.value), 1);
      rows.forEach((r) => {
        const col = document.createElement("div");
        col.className = "wdui-bar-col";
        const fill = document.createElement("div");
        fill.className = "wdui-bar-fill";
        fill.style.height = `${Math.round((r.value / max) * 100)}%`;
        const lab = document.createElement("span");
        lab.className = "wdui-bar-lab";
        lab.textContent = r.label;
        col.appendChild(fill);
        col.appendChild(lab);
        wrap.appendChild(col);
      });
      return wrap;
    }

    return null;
  }

  /**
   * @param {HTMLElement} host
   * @param {Record<string, unknown>} spec
   * @param {'input'|'output'} role
   * @param {object} options
   */
  function renderInto(host, spec, role, options) {
    const interactive = !!options.interactive;
    const data = options.data && typeof options.data === "object" ? /** @type {Record<string, unknown>} */ (options.data) : {};
    const handlers = Array.isArray(spec.handlers) ? spec.handlers.map(String) : [];
    const allowedHandlers = new Set(handlers);
    const schedulePatch = typeof options.schedulePatch === "function" ? options.schedulePatch : null;

    const ctx = {
      role,
      interactive,
      data,
      allowedHandlers,
      schedulePatch,
      onHandler: options.onHandler,
    };

    host.innerHTML = "";
    host.className = "dynamic-ui-stage wdui-root";
    const cap = document.createElement("div");
    cap.className = "dynamic-ui-cap";
    cap.textContent =
      role === "input"
        ? `Declarative UI (v2)${interactive ? " · interactive" : ""}`
        : "Declarative UI (v2) · output";
    host.appendChild(cap);
    const root = spec.root;
    const body = document.createElement("div");
    body.className = "dynamic-ui-body wdui-body";
    const el = renderNode(root, ctx);
    if (el) body.appendChild(el);
    host.appendChild(body);
  }

  g.workshopDynamicUi = {
    parseCommitted,
    validateAgainstSchema,
    collectFieldValuesFromDom,
    getByPath,
    renderInto,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
