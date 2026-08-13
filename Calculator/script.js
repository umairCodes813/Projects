const form = document.getElementById("calc-form");
const originalInput = document.getElementById("original-number");
const divisorInput = document.getElementById("divisor");
const errorMessage = document.getElementById("error-message");
const divisionResultEl = document.getElementById("division-result");
const reverseResultEl = document.getElementById("reverse-result");
const statusResultEl = document.getElementById("status-result");

const DECIMAL_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const DISPLAY_PRECISION = 24;

form.addEventListener("submit", (event) => {
  event.preventDefault();

  clearError();

  const originalRaw = originalInput.value.trim();
  const divisorRaw = divisorInput.value.trim();

  if (!isValidNumericInput(originalRaw) || !isValidNumericInput(divisorRaw)) {
    showError("Please enter valid numeric values (examples: 100, -3.5, 0.125).");
    resetResultFields();
    return;
  }

  const original = parseDecimalToRational(originalRaw);
  const divisor = parseDecimalToRational(divisorRaw);

  if (divisor.numerator === 0n) {
    showError("Divisor cannot be zero.");
    resetResultFields();
    return;
  }

  const divisionRational = divideRationals(original, divisor);
  const reverseRational = multiplyRationals(divisionRational, divisor);

  const divisionText = rationalToDecimalString(divisionRational, DISPLAY_PRECISION);
  const reverseText = rationalToDecimalString(reverseRational, DISPLAY_PRECISION);
  const recovered = areRationalsEqual(reverseRational, original);

  divisionResultEl.textContent = divisionText;
  reverseResultEl.textContent = reverseText;
  setStatus(recovered);
});

function isValidNumericInput(value) {
  return DECIMAL_PATTERN.test(value);
}

function parseDecimalToRational(value) {
  const sign = value.startsWith("-") ? -1n : 1n;
  const normalized = value.replace(/^[+-]/, "");
  const [wholePart, fractionPart = ""] = normalized.split(".");

  const digits = `${wholePart}${fractionPart}`.replace(/^0+(?=\d)/, "") || "0";
  const numerator = sign * BigInt(digits);
  const denominator = 10n ** BigInt(fractionPart.length);

  return reduceRational({ numerator, denominator });
}

function reduceRational(rational) {
  if (rational.numerator === 0n) {
    return { numerator: 0n, denominator: 1n };
  }

  const gcdValue = gcd(absBigInt(rational.numerator), absBigInt(rational.denominator));
  const numerator = rational.numerator / gcdValue;
  const denominator = rational.denominator / gcdValue;

  return denominator < 0n
    ? { numerator: -numerator, denominator: -denominator }
    : { numerator, denominator };
}

function divideRationals(a, b) {
  // (a/b) for rationals: (a.n/a.d) / (b.n/b.d) = (a.n * b.d) / (a.d * b.n)
  return reduceRational({
    numerator: a.numerator * b.denominator,
    denominator: a.denominator * b.numerator
  });
}

function multiplyRationals(a, b) {
  return reduceRational({
    numerator: a.numerator * b.numerator,
    denominator: a.denominator * b.denominator
  });
}

function areRationalsEqual(a, b) {
  return a.numerator === b.numerator && a.denominator === b.denominator;
}

function rationalToDecimalString(rational, maxDecimalPlaces) {
  if (rational.numerator === 0n) {
    return "0";
  }

  const negative = rational.numerator < 0n;
  let numerator = absBigInt(rational.numerator);
  const denominator = absBigInt(rational.denominator);

  const whole = numerator / denominator;
  let remainder = numerator % denominator;

  if (remainder === 0n) {
    return `${negative ? "-" : ""}${whole.toString()}`;
  }

  const decimals = [];

  for (let i = 0; i < maxDecimalPlaces; i += 1) {
    remainder *= 10n;
    const digit = remainder / denominator;
    remainder %= denominator;
    decimals.push(digit.toString());

    if (remainder === 0n) {
      break;
    }
  }

  let decimalPart = decimals.join("");
  if (remainder !== 0n) {
    decimalPart += "...";
  }

  return `${negative ? "-" : ""}${whole.toString()}.${decimalPart}`;
}

function gcd(a, b) {
  let x = a;
  let y = b;

  while (y !== 0n) {
    const temp = x % y;
    x = y;
    y = temp;
  }

  return x;
}

function absBigInt(value) {
  return value < 0n ? -value : value;
}

function showError(message) {
  errorMessage.textContent = message;
}

function clearError() {
  errorMessage.textContent = "";
}

function setStatus(recovered) {
  if (recovered) {
    statusResultEl.textContent = "Yes, original value recovered exactly";
    statusResultEl.className = "status-badge success";
  } else {
    statusResultEl.textContent = "No, values are different";
    statusResultEl.className = "status-badge error";
  }
}

function resetResultFields() {
  divisionResultEl.textContent = "-";
  reverseResultEl.textContent = "-";
  statusResultEl.textContent = "Waiting for calculation";
  statusResultEl.className = "status-badge neutral";
}
