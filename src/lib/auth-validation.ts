export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PASSWORD_LENGTH = 1024;

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(value: unknown) {
  const email = normalizeEmail(value);
  return EMAIL_PATTERN.test(email);
}

export type LoginFieldErrors = {
  email?: string;
  password?: string;
};

export type LoginValidationResult =
  | {
      success: true;
      data: {
        email: string;
        password: string;
      };
      errors: LoginFieldErrors;
    }
  | {
      success: false;
      data: null;
      errors: LoginFieldErrors;
    };

export function validateLoginCredentials(
  emailValue: unknown,
  passwordValue: unknown
): LoginValidationResult {
  const errors: LoginFieldErrors = {};
  const email = normalizeEmail(emailValue);
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!email) {
    errors.email = "L'adresse email est requise.";
  } else if (!isValidEmail(email)) {
    errors.email = "Veuillez saisir une adresse email valide.";
  }

  if (!password) {
    errors.password = "Le mot de passe est requis.";
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    errors.password = "Le mot de passe est trop long.";
  }

  if (errors.email || errors.password) {
    return { success: false, data: null, errors };
  }

  return { success: true, data: { email, password }, errors };
}
