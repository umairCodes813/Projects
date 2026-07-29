(function () {
  const state = {
    expr: "",
    history: "",
    ans: 0,
    memory: 0,
    shift: false,
    angleMode: "DEG", // 'DEG' or 'RAD'
    justEvaluated: false,
  };

  const mainLine = document.getElementById("mainLine");
  const historyLine = document.getElementById("historyLine");
  const indShift = document.getElementById("ind-shift");
  const indDeg = document.getElementById("ind-deg");
  const indRad = document.getElementById("ind-rad");
  const indM = document.getElementById("ind-m");
  const btnShift = document.getElementById("btnShift");

  const AFTER_VALUE_ALL = /[0-9a-zA-Z)%!π]/; // used for openers (functions, constants, '(', Ans, MR)
  const AFTER_VALUE_NO_DIGIT = /[a-zA-Z)%!π]/; // used for digits (don't insert × between two digits)

  function render() {
    mainLine.textContent = state.expr.length ? prettify(state.expr) : "0";
    historyLine.textContent = state.history || "\u00A0";
    indShift.classList.toggle("active", state.shift);
    btnShift.classList.toggle("shift-on", state.shift);
    indDeg.classList.toggle("active", state.angleMode === "DEG");
    indRad.classList.toggle("active", state.angleMode === "RAD");
    indM.classList.toggle("active", state.memory !== 0);
  }

  function prettify(s) {
    // Cosmetic only - what's shown, not what's evaluated (evaluated string is generated separately)
    return s;
  }

  function smartAppend(tok, re) {
    if (state.expr.length && re.test(state.expr[state.expr.length - 1])) {
      state.expr += "×";
    }
    state.expr += tok;
    render();
  }

  function rawAppend(tok) {
    state.expr += tok;
    render();
  }

  function beforeInput(isContinuation) {
    if (state.justEvaluated) {
      if (isContinuation) {
        state.expr = "Ans";
      } else {
        state.expr = "";
        state.history = "";
      }
      state.justEvaluated = false;
    }
  }

  // ---- Math engine ----
  function toRad(x) {
    return state.angleMode === "DEG" ? (x * Math.PI) / 180 : x;
  }
  function fromRad(x) {
    return state.angleMode === "DEG" ? (x * 180) / Math.PI : x;
  }

  const CALC = {
    sin: (x) => Math.sin(toRad(x)),
    cos: (x) => Math.cos(toRad(x)),
    tan: (x) => Math.tan(toRad(x)),
    asin: (x) => fromRad(Math.asin(x)),
    acos: (x) => fromRad(Math.acos(x)),
    atan: (x) => fromRad(Math.atan(x)),
    log10: (x) => Math.log10(x),
    ln: (x) => Math.log(x),
    fact: (n) => {
      n = Math.round(n);
      if (n < 0) return NaN;
      let r = 1;
      for (let i = 2; i <= n; i++) r *= i;
      return r;
    },
  };

  function autoCloseParens(s) {
    let open = 0;
    for (const ch of s) {
      if (ch === "(") open++;
      else if (ch === ")") open--;
    }
    if (open > 0) s += ")".repeat(open);
    return s;
  }

  function toEvalString(displayExpr) {
    let s = autoCloseParens(displayExpr);

    // Ans
    s = s.replace(/Ans/g, "(" + state.ans + ")");

    // operators
    s = s.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");

    // constants
    s = s.replace(/π/g, "(Math.PI)");
    s = s.replace(/(?<![A-Za-z])e(?![A-Za-z(])/g, "(Math.E)");

    // percent -> /100
    s = s.replace(/%/g, "/100");

    // factorial (numbers only)
    s = s.replace(/(\d+(?:\.\d+)?)!/g, "CALC.fact($1)");

    // functions - longer names first to avoid partial matches
    s = s
      .replace(/asin\(/g, "CALC.asin(")
      .replace(/acos\(/g, "CALC.acos(")
      .replace(/atan\(/g, "CALC.atan(")
      .replace(/sin\(/g, "CALC.sin(")
      .replace(/cos\(/g, "CALC.cos(")
      .replace(/tan\(/g, "CALC.tan(")
      .replace(/log\(/g, "CALC.log10(")
      .replace(/ln\(/g, "CALC.ln(")
      .replace(/√\(/g, "Math.sqrt(")
      .replace(/∛\(/g, "Math.cbrt(");

    // power
    s = s.replace(/\^/g, "**");

    return s;
  }

  function formatNumber(n) {
    if (typeof n !== "number" || !isFinite(n)) return "Error";
    if (Math.abs(n) > 1e15 || (Math.abs(n) < 1e-10 && n !== 0)) {
      return n.toExponential(6).replace("e", "×10^");
    }
    let rounded = Math.round(n * 1e10) / 1e10;
    return String(rounded);
  }

  function evaluate() {
    if (!state.expr.length) return;
    try {
      const jsExpr = toEvalString(state.expr);
      const raw = new Function("CALC", "return (" + jsExpr + ")")(CALC);
      if (typeof raw !== "number" || isNaN(raw)) throw new Error("bad");
      state.history = state.expr + " =";
      state.ans = Math.round(raw * 1e10) / 1e10;
      state.expr = formatNumber(raw);
      state.justEvaluated = true;
      render();
    } catch (e) {
      state.history = state.expr + " =";
      state.expr = "Error";
      state.justEvaluated = true;
      render();
    }
  }

  // ---- Button handling ----
  function handleAction(action) {
    switch (action) {
      case "shift":
        state.shift = !state.shift;
        render();
        return; // don't consume shift itself

      case "mode":
        state.angleMode = state.angleMode === "DEG" ? "RAD" : "DEG";
        render();
        return;

      case "digit":
        break; // handled by caller with data-value
      case "dot":
        beforeInput(false);
        if (state.expr.length === 0) state.expr = "0";
        rawAppend(".");
        break;

      case "paren-open":
        beforeInput(false);
        smartAppend("(", AFTER_VALUE_ALL);
        break;
      case "paren-close":
        beforeInput(true);
        rawAppend(")");
        break;

      case "ans":
        beforeInput(false);
        smartAppend("Ans", AFTER_VALUE_ALL);
        break;

      case "xinv":
        beforeInput(true);
        rawAppend(state.shift ? "^3" : "^(-1)");
        state.shift = false;
        break;
      case "xsq":
        beforeInput(true);
        if (state.shift) {
          smartAppend("√(", AFTER_VALUE_ALL);
        } else {
          rawAppend("^2");
        }
        state.shift = false;
        break;
      case "sqrt":
        beforeInput(false);
        smartAppend(state.shift ? "∛(" : "√(", AFTER_VALUE_ALL);
        state.shift = false;
        break;
      case "pow":
        beforeInput(true);
        rawAppend("^");
        state.shift = false;
        break;
      case "exp":
        beforeInput(true);
        if (state.shift) {
          smartAppend("π", AFTER_VALUE_ALL);
        } else {
          if (state.expr.length === 0) {
            rawAppend("10^(");
          } else {
            rawAppend("×10^(");
          }
        }
        state.shift = false;
        break;

      case "sin":
        beforeInput(false);
        smartAppend(state.shift ? "asin(" : "sin(", AFTER_VALUE_ALL);
        state.shift = false;
        break;
      case "cos":
        beforeInput(false);
        smartAppend(state.shift ? "acos(" : "cos(", AFTER_VALUE_ALL);
        state.shift = false;
        break;
      case "tan":
        beforeInput(false);
        smartAppend(state.shift ? "atan(" : "tan(", AFTER_VALUE_ALL);
        state.shift = false;
        break;
      case "log":
        beforeInput(false);
        smartAppend(state.shift ? "10^(" : "log(", AFTER_VALUE_ALL);
        state.shift = false;
        break;
      case "ln":
        beforeInput(false);
        smartAppend(state.shift ? "e^(" : "ln(", AFTER_VALUE_ALL);
        state.shift = false;
        break;

      case "mc":
        state.memory = 0;
        render();
        return;
      case "mr":
        beforeInput(false);
        smartAppend(formatNumber(state.memory), AFTER_VALUE_ALL);
        break;
      case "mplus": {
        try {
          const jsExpr = toEvalString(
            state.expr.length ? state.expr : String(state.ans),
          );
          const val = new Function("CALC", "return (" + jsExpr + ")")(CALC);
          if (typeof val === "number" && isFinite(val)) state.memory += val;
        } catch (e) {
          /* ignore */
        }
        render();
        return;
      }
      case "pm":
        if (state.expr.length) {
          if (state.expr.startsWith("-(") && state.expr.endsWith(")")) {
            state.expr = state.expr.slice(2, -1);
          } else {
            state.expr = "-(" + state.expr + ")";
          }
          render();
        }
        return;
      case "ac":
        state.expr = "";
        state.history = "";
        state.justEvaluated = false;
        state.shift = false;
        render();
        return;
      case "del":
        if (state.justEvaluated) {
          state.expr = "";
          state.history = "";
          state.justEvaluated = false;
        } else {
          state.expr = state.expr.slice(0, -1);
        }
        render();
        return;

      case "div":
        beforeInput(true);
        rawAppend("÷");
        state.shift = false;
        break;
      case "mul":
        beforeInput(true);
        rawAppend("×");
        state.shift = false;
        break;
      case "sub":
        beforeInput(true);
        rawAppend("−");
        state.shift = false;
        break;
      case "add":
        beforeInput(true);
        rawAppend("+");
        state.shift = false;
        break;

      case "percent":
        beforeInput(true);
        rawAppend("%");
        state.shift = false;
        break;
      case "fact":
        beforeInput(true);
        rawAppend("!");
        state.shift = false;
        break;
      case "pi":
        beforeInput(false);
        smartAppend("π", AFTER_VALUE_ALL);
        state.shift = false;
        break;

      case "equals":
        evaluate();
        return;

      default:
        return;
    }
    render();
  }

  document.querySelectorAll(".key").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "digit") {
        beforeInput(false);
        const d = btn.dataset.value;
        smartAppend(d, AFTER_VALUE_NO_DIGIT);
        state.shift = false;
        return;
      }
      handleAction(action);
    });
  });

  // ---- Keyboard support ----
  window.addEventListener("keydown", (e) => {
    const k = e.key;
    if (/^[0-9]$/.test(k)) {
      beforeInput(false);
      smartAppend(k, AFTER_VALUE_NO_DIGIT);
      return;
    }
    if (k === ".") {
      handleAction("dot");
      return;
    }
    if (k === "+") {
      handleAction("add");
      return;
    }
    if (k === "-") {
      handleAction("sub");
      return;
    }
    if (k === "*") {
      handleAction("mul");
      return;
    }
    if (k === "/") {
      e.preventDefault();
      handleAction("div");
      return;
    }
    if (k === "(") {
      handleAction("paren-open");
      return;
    }
    if (k === ")") {
      handleAction("paren-close");
      return;
    }
    if (k === "^") {
      handleAction("pow");
      return;
    }
    if (k === "%") {
      handleAction("percent");
      return;
    }
    if (k === "Enter" || k === "=") {
      e.preventDefault();
      handleAction("equals");
      return;
    }
    if (k === "Backspace") {
      handleAction("del");
      return;
    }
    if (k === "Escape") {
      handleAction("ac");
      return;
    }
  });

  render();
})();
