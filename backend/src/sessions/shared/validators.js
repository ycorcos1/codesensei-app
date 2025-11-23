const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9]{3,20}$/;
const SPECIAL_CHAR_REGEX = /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;/]/;

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateEmail(email) {
  const normalized = normalizeString(email).toLowerCase();
  return EMAIL_REGEX.test(normalized);
}

function validatePassword(password) {
  const value = normalizeString(password);
  if (value.length < 8) {
    return false;
  }

  const hasUppercase = /[A-Z]/.test(value);
  const hasNumber = /[0-9]/.test(value);
  const hasSpecial = SPECIAL_CHAR_REGEX.test(value);

  return hasUppercase && hasNumber && hasSpecial;
}

function validateUsername(username) {
  return USERNAME_REGEX.test(normalizeString(username));
}

module.exports = {
  normalizeString,
  validateEmail,
  validatePassword,
  validateUsername,
};

