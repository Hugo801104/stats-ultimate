import { describe, expect, it } from 'vitest';
import { passwordProblem } from './cloud/password';

describe('règle de mot de passe', () => {
  it('refuse les mots de passe trop courts, courants ou répétitifs', () => {
    expect(passwordProblem('abc12')).toMatch(/8 caractères/);
    expect(passwordProblem('motdepasse1')).toMatch(/courant/);
    expect(passwordProblem('Azerty123')).toMatch(/courant/);
    expect(passwordProblem('aaaa1111')).toMatch(/répétitif/);
  });
  it('exige lettres et chiffres, sauf phrase de passe longue', () => {
    expect(passwordProblem('frizzbeeoui')).toMatch(/lettres et chiffres/);
    expect(passwordProblem('disque-vole-7')).toBeNull();
    expect(passwordProblem('le disque vole tres loin')).toBeNull();
  });
  it('refuse un mot de passe contenant l’adresse e-mail', () => {
    expect(passwordProblem('camille2026!', 'camille@exemple.fr')).toMatch(/adresse e-mail/);
  });
});
