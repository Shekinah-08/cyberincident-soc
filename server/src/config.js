const DEFAULT_DEV_JWT_SECRET = 'cyberincident-local-dev-secret-2026-32chars';

export function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  const isPlaceholder = typeof secret === 'string' && (secret.startsWith('replace-with-') || secret === DEFAULT_DEV_JWT_SECRET);

  if (!secret || secret.length < 32 || isPlaceholder) {
    if (isProduction) {
      throw new Error('JWT_SECRET manquant ou trop court. Définissez une valeur aléatoire d’au moins 32 caractères.');
    }

    process.env.JWT_SECRET = DEFAULT_DEV_JWT_SECRET;
    console.warn('[WARN] JWT_SECRET absent or too short; using a local development fallback.');
    return process.env.JWT_SECRET;
  }

  return secret;
}
