// Measurement inputs keep their numeric precision; cut lengths are formatted only for display.
export function parseMeasurement(raw) {
  const value = raw.trim().replace(/[″"]$/, '').trim();
  if (!value) throw new Error('Enter a measurement.');
  if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  const fraction = /^(?:(\d+)\s+)?(\d+)\/(\d+)$/.exec(value);
  if (fraction && +fraction[3] > 0 && +fraction[2] < +fraction[3]) {
    return +(fraction[1] || 0) + fraction[2] / fraction[3];
  }
  throw new Error('Use a decimal such as 51.875 or .625, or a fraction such as 36 1/2.');
}

export function measurementInput(inches, unit = 'in') {
  // Suppress conversion noise without applying the cut-sheet's display rounding to inputs.
  const value = unit === 'mm' ? inches * 25.4 : inches;
  return String(Number(value.toPrecision(15)));
}
