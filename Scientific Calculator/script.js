(function () {
  const exprEl = document.getElementById("expr");
  const resultEl = document.getElementById("result");
  const modeToggle = document.getElementById("modeToggle");
  const switchEl = document.getElementById("switch");
  const modeLabel = document.getElementById("modeLabel");
  const ind2nd = document.getElementById("ind-2nd");
  const indM = document.getElementById("ind-m");

  let expr = "";
  let isRad = false;
  let second = false;
  let memory = 0;
  let justEvaluated = false;

  const fnLabels = {
    "sin(": "sin",
    "cos(": "cos",
    "tan(": "tan",
    "asin(": "sin⁻¹",
    "acos(": "cos⁻¹",
    "atan(": "tan⁻¹",
  };

  function render() {
    exprEl.textContent = expr.length ? expr : "\u00A0";
    resultEl.textContent = liveResult();
  }

  function liveResult() {
    if (expr.trim() === "") return "0";
    try {
      const val = evaluate(expr);
      if (val === undefined || Number.isNaN(val)) return "ERR";
      return formatNum(val);
    } catch (e) {
      return expr; // still typing, don't show error mid-entry
    }
  }

  function formatNum(n) {
    if (!isFinite(n)) return "ERR";
    let s = Math.abs(n) < 1e-10 ? 0 : n;
    s = parseFloat(s.toPrecision(12));
    return s.toString();
  }

  function toRad(x) {
    return isRad ? x : (x * Math.PI) / 180;
  }
  function fromRad(x) {
    return isRad ? x : (x * 180) / Math.PI;
  }

  function factorial(n) {
    n = Math.round(n);
    if (n < 0) return NaN;
    if (n > 170) return Infinity;
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }

  function evaluate(str) {
    let s = str;

    // replace visual operators with JS ones
    s = s.replaceAll("×", "*").replaceAll("÷", "/").replaceAll("−", "-");
    s = s
      .replaceAll("π", "Math.PI")
      .replaceAll(/(?<![a-zA-Z])e(?![a-zA-Z(])/g, "Math.E");
    s = s.replaceAll("^", "**");
    s = s.replaceAll("√(", "Math.sqrt(");

    // trig with deg/rad awareness
    s = s.replace(/asin\(/g, "__asin(");
    s = s.replace(/acos\(/g, "__acos(");
    s = s.replace(/atan\(/g, "__atan(");
    s = s.replace(/(?<!__a)sin\(/g, "__sin(");
    s = s.replace(/(?<!__a)cos\(/g, "__cos(");
    s = s.replace(/(?<!__a)tan\(/g, "__tan(");
    s = s.replace(/log\(/g, "Math.log10(");
    s = s.replace(/ln\(/g, "Math.log(");

    // percentage: turn "n%" into "(n/100)"
    s = s.replace(/(\d+(\.\d+)?)%/g, "($1/100)");

    // factorial: turn "n!" into fact(n) for a trailing number/group
    s = s.replace(/(\d+(\.\d+)?)!/g, "__fact($1)");

    const __sin = (x) => Math.sin(toRad(x));
    const __cos = (x) => Math.cos(toRad(x));
    const __tan = (x) => Math.tan(toRad(x));
    const __asin = (x) => fromRad(Math.asin(x));
    const __acos = (x) => fromRad(Math.acos(x));
    const __atan = (x) => fromRad(Math.atan(x));
    const __fact = factorial;

    // eslint-disable-next-line no-new-func
    const fn = new Function(
      "__sin",
      "__cos",
      "__tan",
      "__asin",
      "__acos",
      "__atan",
      "__fact",
      "Math",
      `"use strict"; return (${s || "0"});`,
    );
    return fn(__sin, __cos, __tan, __asin, __acos, __atan, __fact, Math);
  }

  function insert(val) {
    if (justEvaluated && /[0-9.]/.test(val)) {
      expr = "";
    }
    justEvaluated = false;
    expr += val;
    render();
  }

  function insertFn(val) {
    justEvaluated = false;
    if (second) {
      const map = { "sin(": "asin(", "cos(": "acos(", "tan(": "atan(" };
      val = map[val] || val;
    }
    expr += val;
    render();
  }

  function del() {
    expr = expr.slice(0, -1);
    justEvaluated = false;
    render();
  }

  function clearAll() {
    expr = "";
    justEvaluated = false;
    render();
  }

  function doEquals() {
    if (expr.trim() === "") return;
    try {
      const val = evaluate(expr);
      if (val === undefined || Number.isNaN(val)) {
        resultEl.textContent = "ERR";
        return;
      }
      exprEl.textContent = expr + " =";
      expr = formatNum(val);
      resultEl.textContent = expr;
      justEvaluated = true;
    } catch (e) {
      resultEl.textContent = "ERR";
    }
  }

  function doFactorialButton() {
    // apply factorial to whatever is currently typed as a trailing number, or append !
    expr += "!";
    render();
  }

  document.querySelectorAll("[data-insert]").forEach((btn) => {
    btn.addEventListener("click", () =>
      insert(btn.getAttribute("data-insert")),
    );
  });
  document.querySelectorAll("[data-fn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      insertFn(btn.getAttribute("data-fn"));
      if (second) {
        second = false;
        ind2nd.classList.remove("on");
      }
    });
  });

  document.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.getAttribute("data-act");
      if (act === "clear") clearAll();
      else if (act === "del") del();
      else if (act === "equals") doEquals();
      else if (act === "fact") doFactorialButton();
      else if (act === "2nd") {
        second = !second;
        ind2nd.classList.toggle("on", second);
      } else if (act === "mc") {
        memory = 0;
        indM.classList.remove("on");
      } else if (act === "mr") {
        insert(formatNum(memory));
      } else if (act === "mplus") {
        try {
          memory += evaluate(expr || "0");
          indM.classList.add("on");
        } catch (e) {}
      } else if (act === "mminus") {
        try {
          memory -= evaluate(expr || "0");
          indM.classList.add("on");
        } catch (e) {}
      }
    });
  });

  modeToggle.addEventListener("click", () => {
    isRad = !isRad;
    switchEl.classList.toggle("rad", isRad);
    modeLabel.textContent = isRad ? "RAD" : "DEG";
    render();
  });

  window.addEventListener("keydown", (e) => {
    const k = e.key;
    if (/[0-9.]/.test(k)) insert(k);
    else if (k === "+") insert("+");
    else if (k === "-") insert("−");
    else if (k === "*") insert("×");
    else if (k === "/") {
      e.preventDefault();
      insert("÷");
    } else if (k === "(" || k === ")") insert(k);
    else if (k === "%") insert("%");
    else if (k === "^") insert("^");
    else if (k === "Enter" || k === "=") {
      e.preventDefault();
      doEquals();
    } else if (k === "Backspace") del();
    else if (k === "Escape") clearAll();
  });

  render();
})();
