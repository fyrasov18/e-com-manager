export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PASSWORD_LENGTH = 1024;
const MIN_REGISTER_PASSWORD_LENGTH = 6;

export const REGISTER_ROLES = ["USER", "ADMIN"] as const;

export type RegisterRole = (typeof REGISTER_ROLES)[number];

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

export type RegisterFieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  phone?: string;
  role?: string;
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

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeRegisterRole(value: unknown): RegisterRole {
  if (typeof value !== "string") {
    return "USER";
  }

  const role = value.trim().toUpperCase();
  return role === "ADMIN" ? "ADMIN" : "USER";
}

export function toStoredUserRole(role: RegisterRole) {
  return role.toLowerCase();
}

export type RegisterValidationResult =
  | {
      success: true;
      data: {
        name: string;
        email: string;
        password: string;
        confirmPassword: string;
        phone: string | null;
        role: RegisterRole;
      };
      errors: RegisterFieldErrors;
    }
  | {
      success: false;
      data: null;
      errors: RegisterFieldErrors;
    };

export function validateRegisterRequest(payload: {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
  phone?: unknown;
  role?: unknown;
}): RegisterValidationResult {
  const errors: RegisterFieldErrors = {};
  const name = normalizeText(payload.name);
  const email = normalizeEmail(payload.email);
  const password = typeof payload.password === "string" ? payload.password : "";
  const confirmPassword =
    typeof payload.confirmPassword === "string" ? payload.confirmPassword : "";
  const phone = normalizeText(payload.phone);
  const role = normalizeRegisterRole(payload.role);

  if (!name) {
    errors.name = "Le nom complet est requis.";
  } else if (name.length > 120) {
    errors.name = "Le nom complet est trop long.";
  }

  if (!email) {
    errors.email = "L'adresse email est requise.";
  } else if (!isValidEmail(email)) {
    errors.email = "Veuillez saisir une adresse email valide.";
  }

  if (!password) {
    errors.password = "Le mot de passe est requis.";
  } else if (password.length < MIN_REGISTER_PASSWORD_LENGTH) {
    errors.password = "Le mot de passe doit contenir au moins 6 caracteres.";
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    errors.password = "Le mot de passe est trop long.";
  }

  if (!confirmPassword) {
    errors.confirmPassword = "La confirmation du mot de passe est requise.";
  } else if (password && confirmPassword !== password) {
    errors.confirmPassword = "Les mots de passe ne correspondent pas.";
  }

  if (phone.length > 40) {
    errors.phone = "Le telephone est trop long.";
  }

  if (
    typeof payload.role === "string" &&
    payload.role.trim() &&
    !REGISTER_ROLES.includes(payload.role.trim().toUpperCase() as RegisterRole)
  ) {
    errors.role = "Role invalide.";
  }

  if (
    errors.name ||
    errors.email ||
    errors.password ||
    errors.confirmPassword ||
    errors.phone ||
    errors.role
  ) {
    return { success: false, data: null, errors };
  }

  return {
    success: true,
    data: {
      name,
      email,
      password,
      confirmPassword,
      phone: phone || null,
      role,
    },
    errors,
  };
}
