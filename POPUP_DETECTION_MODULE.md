# Module de Détection et Fermeture de Popups

## 🎯 Vue d'ensemble

Module ajouté à `playwright/agents/navigator_agent.js` pour détecter et fermer automatiquement les popups courantes:

- 🍪 **Bannières cookies** (Accepter, Tout accepter, OK, Continuer)
- 📍 **Popups géolocalisation** (Autoriser la localisation)
- 🏪 **Sélection de magasin** (Choisir votre magasin, Choisir mon magasin)
- ✖️ **Modales génériques** (Fermer, Plus tard, Close)

## 📋 Détails techniques

### 1. Nouveaux sélecteurs ajoutés

```javascript
SELECTORS = {
  // ...
  popupButtons: [
    "button:has-text('Accepter')",
    "button:has-text('Tout accepter')",
    "button:has-text('OK')",
    "button:has-text('Continuer')",
    "button:has-text('Autoriser')",
    "button:has-text('Autoriser la localisation')",
    // ... etc
  ],
  geoLocation: [
    "button:has-text('Autoriser la localisation')",
    "button[aria-label*='localisation' i]",
    // ... etc
  ],
  storeSelection: [
    "button:has-text('Choisir mon magasin')",
    "button:has-text('Choisir votre magasin')",
    // ... etc
  ]
}
```

### 2. Fonction `detectPopup(html)`

Détecte automatiquement 4 types de popups:

#### A. Popups cookies
```javascript
// Détecte si le HTML contient des mots clés:
const patterns = [
  "cookie", "cookies", "consent", "consentement",
  "onetrust", "privacy", "accepter", "tout accepter"
];

// Retourne une action click sur le bouton d'acceptation
// Priorité: Accepter > Tout accepter > OK > Continuer
```

#### B. Popups géolocalisation
```javascript
// Détecte:
const patterns = [
  "localisation", "location", "localizer",
  "geolocation", "géolocalisation"
];

// Cherche: Autoriser, Autoriser la localisation
```

#### C. Popups sélection magasin
```javascript
// Détecte les keywords:
const patterns = [
  "magasin", "store", "localisation",
  "choisir", "géolocalisation"
];

// Cherche: Choisir mon magasin, Choisir votre magasin
```

#### D. Modales génériques
```javascript
// Détecte les mots clés dialog/modal/popup dans le HTML
// Cherche: Fermer, Close, aria-label fermer

// Retourne une action de fermeture
```

### 3. Format de retour

Retourne soit un objet action, soit `null`:

```javascript
// Si popup détectée:
{
  action: "click",           // Toujours "click" pour fermer
  selector: "CSS selector",  // Sélecteur CSS/Playwright
  reason: "Popup ... detecte, fermeture"
}

// Si aucun popup:
null
```

### 4. Intégration dans `decideNextAction()`

La fonction est appelée en **PREMIER**, avant toute autre logique:

```javascript
function decideNextAction({ html, url, remainingItems, strategy }) {
  // ... validations initiales ...

  // ✅ DETECT POPUPS FIRST
  const popup = detectPopup(safeHtml);
  if (popup) {
    logger.push(`popup:detected reason=${popup.reason}`);
    return popup;  // Close popup before continuing
  }

  // ... puis continue la navigation habituelle ...
  const cookieBanner = detectCookieBanner(safeHtml);
  // ... etc
}
```

**Priorité d'exécution:**
1. Détection popup générique (detectPopup) ✅ **NOUVEAU**
2. Détection cookies (detectCookieBanner)
3. Détection modale (findFirstSelectorInHtml)
4. Détection page type et navigation

## 🧪 Tests validés

```
✅ Test 1: Cookie banner (Tout accepter)
   → Détecte et retourne action click

✅ Test 2: Geolocation (Autoriser)
   → Détecte et retourne action click

✅ Test 3: Store selection (Choisir mon magasin)
   → Détecte et retourne action click

✅ Test 4: Generic modal (Fermer)
   → Détecte et retourne action click

✅ Test 5: No popup
   → Retourne null correctement
```

## 📊 Sélecteurs supportés

### Buttons texte (Playwright has-text)
```javascript
"button:has-text('Accepter')"
"button:has-text('Tout accepter')"
"button:has-text('OK')"
"button:has-text('Continuer')"
"button:has-text('Autoriser')"
"button:has-text('Fermer')"
"button:has-text('Choisir mon magasin')"
```

### Aria labels
```javascript
"button[aria-label*='accepter' i]"
"button[aria-label*='fermer' i]"
"button[aria-label*='localisation' i]"
"[aria-label*='close' i]"
```

### Sélecteurs structurels
```javascript
"#onetrust-accept-btn-handler"  // OneTrust cookie banner
"[role='dialog'] button"         // Dialog buttons
"[data-testid*='modal' i]"       // Testid selectors
"[class*='modal' i] button"      // Modal classes
```

## 🔄 Flux d'exécution

```
1. Page HTML chargée
   ↓
2. decideNextAction() appelée
   ↓
3. Validations (HTML non vide, items restants)
   ↓
4. ✅ detectPopup() cherche popups
   ├─ Cookie banner? → return click action
   ├─ Geolocation? → return click action
   ├─ Store selection? → return click action
   └─ Generic modal? → return click action
   ↓
5. Si pas de popup: continue avec:
   - detectCookieBanner()
   - findFirstSelectorInHtml(SELECTORS.modalClose)
   - detectPageType()
   - Navigation habituelle
```

## 🐛 Débogage

Les logs affichent:
```
popup:detected reason=Popup cookies detecte, fermeture
popup:detected reason=Popup geolocalisation detecte, fermeture
popup:detected reason=Popup selection magasin detecte, fermeture
popup:detected reason=Popup generique detecte, fermeture
```

Exemple complet dans build_cart.js:
```bash
node build_cart.js --store leclerc --items '["pates"]' 2>&1 | jq '.details.logs[] | select(contains("popup"))'
```

## ✨ Améliorations par rapport à l'ancien code

| Avant | Après |
|-------|-------|
| Détection cookie uniquement | ✅ Cookie + Geo + Store + Generic |
| Pas de hiérarchie de popups | ✅ Priorité: Popup générique d'abord |
| Boutons limités | ✅ Sélecteurs génériques (has-text, aria-label) |
| Pas de logging popup | ✅ Logs détaillés pour chaque type |
| Fallback modalClose seulement | ✅ Détection spécialisée par type |

## 🚀 Utilisation

Aucune modification requise! La fonction est automatiquement appelée par `decideNextAction()`.

Pour les tests manuels:
```bash
node -e "
const { detectPopup } = require('./playwright/agents/navigator_agent.js');
const html = '<button>Tout accepter</button>';
console.log(detectPopup(html));
"
```

## 📝 Exports

Fonction ajoutée aux exports du module:
```javascript
module.exports = {
  // ... autres exports ...
  detectPopup,  // ✅ NEW
  // ... autres exports ...
};
```

Utilisable dans d'autres scripts Node:
```javascript
const { detectPopup } = require('./agents/navigator_agent.js');
const action = detectPopup(htmlContent);
```
