// Import « au mieux » d'un export de participants Sport Easy (CSV/Excel enregistré en CSV).
// Le format exact n'est pas garanti : on détecte le séparateur et les colonnes nom/prénom/statut
// par leurs en-têtes, et on prévient quand on n'est pas sûr.

import { normalizeName } from './util';

export interface ImportedParticipant {
  name: string;
  /** true si la colonne de statut indique une présence confirmée ; null si pas de colonne de statut. */
  present: boolean | null;
}

export interface ParticipantsImport {
  participants: ImportedParticipant[];
  warnings: string[];
}

export function detectDelimiter(headerLine: string): string {
  const counts = [';', '\t', ','].map((d) => ({ d, n: headerLine.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0]!.n > 0 ? counts[0]!.d : ';';
}

/** Découpe une ligne CSV en gérant les guillemets. */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const YES = /^(oui|yes|present|presente|confirme|confirmee|inscrit|inscrite|participe|ok|1|vrai|true)$/;
const NO = /^(non|no|absent|absente|refuse|refusee|decline|0|faux|false|indisponible)$/;

export function parseParticipants(text: string): ParticipantsImport {
  const warnings: string[] = [];
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');
  if (lines.length < 2) {
    return { participants: [], warnings: ['Le fichier est vide ou ne contient pas de ligne de données.'] };
  }
  const delimiter = detectDelimiter(lines[0]!);
  const header = splitCsvLine(lines[0]!, delimiter).map(normalizeName);
  const find = (re: RegExp): number => header.findIndex((h) => re.test(h));

  const firstIdx = find(/^(prenom|first ?name|firstname)$/);
  const lastIdx = find(/^(nom|nom de famille|last ?name|lastname|surname)$/);
  const fullIdx = find(/^(nom complet|joueur|name|participant|membre|full ?name|nom et prenom|prenom et nom)$/);
  const statusIdx = find(/(statut|status|presence|reponse|disponibilite|participation|inscription)/);

  if (fullIdx < 0 && firstIdx < 0 && lastIdx < 0) {
    return {
      participants: [],
      warnings: [
        'Colonnes de nom introuvables. Il faut au moins une colonne « Prénom », « Nom » ou « Nom complet ».',
      ],
    };
  }
  if (statusIdx < 0) warnings.push('Pas de colonne de statut détectée : tous les noms sont importés sans info de présence.');

  const seen = new Set<string>();
  const participants: ImportedParticipant[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, delimiter);
    let name: string;
    if (fullIdx >= 0 && cells[fullIdx]) name = cells[fullIdx]!;
    else name = [cells[firstIdx] ?? '', cells[lastIdx] ?? ''].filter(Boolean).join(' ');
    name = name.replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const key = normalizeName(name);
    if (seen.has(key)) continue;
    seen.add(key);

    let present: boolean | null = null;
    if (statusIdx >= 0) {
      const s = normalizeName(cells[statusIdx] ?? '');
      if (YES.test(s)) present = true;
      else if (NO.test(s)) present = false;
    }
    participants.push({ name, present });
  }
  if (participants.length === 0) warnings.push('Aucun participant trouvé dans le fichier.');
  return { participants, warnings };
}
