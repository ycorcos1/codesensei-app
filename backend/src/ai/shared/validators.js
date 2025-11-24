function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

module.exports = {
  normalizeString,
};

