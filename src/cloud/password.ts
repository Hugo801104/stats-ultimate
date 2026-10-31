// Règle de mot de passe, appliquée à l'inscription et au changement de mot de passe.
// (Le serveur Supabase impose son propre minimum ; celui-ci est plus exigeant.)

const COMMON = [
  'password', 'motdepasse', 'azerty', 'qwerty', 'azertyuiop', '12345678', '123456789', '1234567890',
  '00000000', '11111111', 'iloveyou', 'soleil', 'bonjour', 'ultimate', 'frisbee', 'statsultimate',
];

/** Renvoie un message si le mot de passe est trop faible, sinon null. */
export function passwordProblem(password: string, email = ''): string | null {
  if (password.length < 8) return 'Le mot de passe doit faire au moins 8 caractères.';
  if (password.length > 72) return 'Le mot de passe ne doit pas dépasser 72 caractères.';
  const lower = password.toLowerCase();
  const normalized = lower.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  if (COMMON.some((w) => normalized === w || normalized.startsWith(w) && normalized.length - w.length <= 4)) {
    return 'Ce mot de passe est trop courant : choisis-en un autre.';
  }
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (local.length >= 4 && lower.includes(local)) return 'Le mot de passe ne doit pas contenir ton adresse e-mail.';
  if (new Set(password).size < 4) return 'Le mot de passe est trop répétitif.';
  // Phrase de passe longue : acceptée telle quelle. Sinon, lettres ET chiffres (ou symboles).
  if (password.length >= 14) return null;
  const hasLetter = /\p{L}/u.test(password);
  const hasOther = /[\d\p{P}\p{S}]/u.test(password);
  if (!hasLetter || !hasOther) return 'Mélange lettres et chiffres (ou utilise une phrase d’au moins 14 caractères).';
  return null;
}
