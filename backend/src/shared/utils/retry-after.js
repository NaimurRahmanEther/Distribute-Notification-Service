function retryAfterMs(value) {
  if (!value) {
    return 0;
  }

  const seconds = Number(value);
  let milliseconds;
  if (Number.isFinite(seconds)) {
    milliseconds = seconds * 1000;
  } else {
    milliseconds = Date.parse(value) - Date.now();
  }

  if (!Number.isFinite(milliseconds)) {
    return 0;
  }
  return Math.max(0, milliseconds);
}

module.exports = retryAfterMs;
