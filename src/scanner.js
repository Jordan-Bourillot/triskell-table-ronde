// Detection auto des produits Triskell deja installes sur la machine
// (par ex. via le tunnel productivite.triskell-studio.fr avant que le
// Lanceur n'existe). On scanne quelques emplacements standards et on
// reconnecte les .exe trouves a la liste d'installs du Lanceur.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mapping des executables/dossiers attendus par produit.
// On cherche d'abord un dossier connu (zip-bundle), puis un .exe principal
// dans Program Files / AppData/Local/Programs (exe-installer).
const PRODUCT_HINTS = {
  'suite-des-heros': {
    folderInDocuments: ['Triskell/SuiteDesHeros', 'Triskell/Suite des Heros'],
    exeNames: ['LeMaitreTrieur.exe'], // le 1er outil = ancre du dossier
    programFilesNames: [],            // pas d'installer .exe pour ce produit
  },
  'delinote': {
    folderInDocuments: [],
    exeNames: ['DeliNote.exe', 'DéliNote.exe'],
    programFilesNames: ['DeliNote', 'DéliNote'],
  },
  'studio-pdf': {
    folderInDocuments: [],
    exeNames: ['StudioPDF.exe', 'Le Studio PDF.exe'],
    programFilesNames: ['Studio PDF', 'Le Studio PDF', 'StudioPDF'],
  },
  'bobeez': {
    folderInDocuments: [],
    exeNames: ['Bobeez.exe'],
    programFilesNames: ['Bobeez'],
  },
  'pirate-life-mail': {
    folderInDocuments: [],
    exeNames: ['Pirate Life Mail.exe', 'PirateLifeMail.exe'],
    programFilesNames: ['Pirate Life Mail', 'PirateLifeMail'],
  },
  // Display name : AlphaBeast (ID interne 'ultimate-prompt-builder' garde
  // pour ne pas casser les licences DB existantes).
  'ultimate-prompt-builder': {
    folderInDocuments: [],
    exeNames: ['AlphaBeast.exe', 'UltimatePromptBuilder.exe', 'Ultimate Prompt Builder.exe'],
    programFilesNames: ['AlphaBeast', 'UltimatePromptBuilder', 'Ultimate Prompt Builder'],
  },
  // Display name : AlphaPitch (ID interne change pour 'alphapitch' — l'app
  // est gratuite et pas encore deployee, donc safe de renommer l'ID).
  'alphapitch': {
    folderInDocuments: [],
    exeNames: ['AlphaPitch.exe', 'Alphapitch.exe', 'Triskell Sales Tunnel.exe', 'TriskellSalesTunnel.exe'],
    programFilesNames: ['AlphaPitch', 'Alphapitch', 'Triskell Sales Tunnel', 'TriskellSalesTunnel'],
  },
};

function exists(p) {
  try { return fs.existsSync(p); } catch (_) { return false; }
}

function tryFindExe(folder, exeNames) {
  for (const exe of exeNames) {
    const full = path.join(folder, exe);
    if (exists(full)) return full;
  }
  // Cas simple : on prend le premier .exe trouve dans le dossier
  try {
    const files = fs.readdirSync(folder);
    const exe = files.find(f => f.toLowerCase().endsWith('.exe'));
    if (exe) return path.join(folder, exe);
  } catch (_) { /* dossier inaccessible */ }
  return null;
}

function readVersionTxt(folder) {
  try {
    const v = fs.readFileSync(path.join(folder, 'VERSION.txt'), 'utf8');
    return v.trim();
  } catch (_) { return null; }
}

function scanProduct(productId) {
  const hints = PRODUCT_HINTS[productId];
  if (!hints) return null;

  const docs = path.join(os.homedir(), 'Documents');
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const programFiles86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const localPrograms = path.join(os.homedir(), 'AppData', 'Local', 'Programs');

  // 1. Chercher dans Documents (zip-bundle)
  for (const sub of hints.folderInDocuments) {
    const folder = path.join(docs, sub);
    if (exists(folder)) {
      const exe = tryFindExe(folder, hints.exeNames);
      if (exe) {
        return {
          productId,
          installPath: folder,
          mainExe: exe,
          version: readVersionTxt(folder) || 'unknown',
          source: 'documents',
        };
      }
    }
  }

  // 2. Chercher dans Program Files / AppData\Local\Programs (exe-installer)
  for (const sub of hints.programFilesNames) {
    for (const root of [programFiles, programFiles86, localPrograms]) {
      const folder = path.join(root, sub);
      if (exists(folder)) {
        const exe = tryFindExe(folder, hints.exeNames);
        if (exe) {
          return {
            productId,
            installPath: folder,
            mainExe: exe,
            version: readVersionTxt(folder) || 'unknown',
            source: 'program-files',
          };
        }
      }
    }
  }
  return null;
}

/**
 * Scanne tous les produits du catalogue et renvoie ceux qui sont reellement
 * installes sur la machine (mais pas encore reconnus dans installs.json).
 * @param {string[]} productIds - liste des productIds du catalogue
 * @param {object} alreadyKnown - objet { productId: install } deja reconnu
 * @returns {Array} - liste des installs detectes (pour merge dans store)
 */
function scanAll(productIds, alreadyKnown = {}) {
  const found = [];
  for (const id of productIds) {
    if (alreadyKnown[id]) continue;   // deja reconnu, on ne touche pas
    const result = scanProduct(id);
    if (result) found.push(result);
  }
  return found;
}

module.exports = { scanAll, scanProduct };
