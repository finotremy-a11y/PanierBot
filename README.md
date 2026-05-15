# PanierBot (V1)

PanierBot est une application Rails qui prend une liste de courses, delegue la construction du panier a un script Node.js Playwright, puis affiche un resultat simple:

- succes avec lien de panier
- echec avec messages d'erreur

## Stack

- Rails 8
- Tailwind CSS
- Service Ruby `CartBuilder`
- Script Node.js Playwright (`playwright/build_cart.js`)

## Prerequis

- Ruby (version de `.ruby-version`)
- Bundler
- Node.js 18+
- npm

## Lancer l'application Rails

1. Installer les gems:

```bash
bundle install
```

2. Demarrer Rails (avec Tailwind watcher):

```bash
bin/dev
```

3. Ouvrir l'application:

```text
http://localhost:3000
```

## Installer et lancer Playwright

Depuis le dossier `playwright/`:

1. Installer les dependances Node:

```bash
cd playwright
npm install
```

2. Installer les navigateurs Playwright:

```bash
npm run install-browsers
```

3. Tester le script manuellement:

```bash
npm run build-cart -- --store leclerc --items '["pates","lait"]'
```

Le script renvoie toujours un JSON sur la sortie standard:

```json
{"success":true,"url":"https://...","errors":[]}
```

## Connexion Rails <-> Playwright

Le flux V1 est le suivant:

1. `CartsController#create` recupere `store` et `items_text` depuis le formulaire.
2. Le controller appelle `CartBuilder` (`app/services/cart_builder.rb`).
3. `CartBuilder` execute:

```bash
node playwright/build_cart.js --store <store> --items '<json_items>'
```

4. Le script Node renvoie un JSON.
5. Rails affiche le resultat dans `carts/show`.

## Test manuel complet de la chaine

Scenario simple recommande:

- enseigne: leclerc
- items: pates, lait
- strategie: best_per_kg (prix au kg le plus bas)

### 1. Test Node direct avec orchestration agent

```bash
cd playwright
npm run build-cart -- --store leclerc --items '["pates","lait"]' --strategy best_per_kg
```

Résultat attendu: JSON avec success/errors/details et logs de l'agent.

### 2. Test Rails service (Rails -> Node avec orchestration agent)

```bash
bin/rails runner 'result = CartBuilder.new(store: "leclerc", items: ["pates", "lait"]).call; puts JSON.pretty_generate(result)'
```

### 3. Test UI complet

```text
http://localhost:3000
```

Dans le formulaire:

- Enseigne: leclerc
- Liste:
  - pates
  - lait

Vérification attendue:

- La page résultat affiche success/failure.
- En cas de succès, un lien panier est présent.
- Les détails execution affichent le nombre d'articles ajoutés et les non trouvés.
- Les logs de l'agent sont disponibles dans `details.logs`.

## Architecture agent IA

L'application utilise maintenant un **agent IA autonome** pour l'orchestration Playwright:

### NavigatorAgent

Fichier: `playwright/agents/navigator_agent.js`

Responsabilités:

- **Détection de page**: home, results, product, cart
- **Gestion cookies/modales**: détection et fermeture
- **Extraction produits**: parsing prix, quantité, prix/kg
- **Sélection stratégique**:
  - cheapest: prix total le plus bas
  - best_per_kg: prix au kilo/litre le plus bas
- **Décision d'action**: retourne JSON structuré { action, selector, value, reason }

### Orchestrator

Fichier: `playwright/build_cart.js`

Responsabilités:

- Navigation initiale
- Boucle agent (jusqu'à 200 itérations)
- Exécution d'actions (search, click, add_to_cart, goto, scroll, wait)
- Tracking des produits ajoutés
- Génération du résultat JSON final

### Flux end-to-end

1. CartsController reçoit store + items_text
2. CartBuilder appelle Node avec --store, --items, --strategy
3. build_cart.js navigate vers le Drive
4. Boucle agent:
   - decideNextAction({ html, url, remainingItems, strategy })
   - executeAction(action)
   - Répète jusqu'à done ou error
5. Résultat JSON remontée à Rails
6. Vue affiche succès/erreurs et détails

## Robustesse et extension

- CartBuilder applique un timeout Node et journalise les erreurs dans Rails.logger.
- Le script Playwright renvoie toujours un JSON structuré (même en cas d'échec partiel).
- Le payload de sortie inclut un bloc details pour préparer:
  - agent IA de navigation (NavigatorAgent ✓)
  - stratégie multi-enseignes par sélecteurs dynamiques (en cours)
  - observabilité et retries intelligents (logs agents ✓)
  - support des quantités et préférences (futur)

## Documentation complète

Voir [ORCHESTRATOR_USAGE.md](ORCHESTRATOR_USAGE.md) pour:

- Usage des stratégies
- Détail des actions agent
- Débogage
- Configuration
- Intégration Rails

## Architecture agent navigateur (preparation)

Le dossier `playwright/agents/` contient un placeholder:

- `navigator_agent.js`

Ce fichier prepare l'emplacement de la logique IA de navigation future (strategie de recherche, fallback produit, tracing).
