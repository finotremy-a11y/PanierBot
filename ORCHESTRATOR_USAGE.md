# PanierBot Playwright Orchestrator

## Vue d'ensemble

Le script `playwright/build_cart.js` est maintenant piloté entièrement par l'agent IA NavigatorAgent.

Flux:
1. **Navigation initiale** → page d'accueil du Drive
2. **Boucle agent** → tant qu'il reste des produits:
   - Lire le HTML + URL actuelle
   - Appeler `decideNextAction({ html, url, remainingItems, strategy })`
   - Exécuter l'action retournée (search, click, add_to_cart, etc.)
   - Passer au produit suivant si ajout réussi
3. **Détection panier** → récupérer l'URL du panier final
4. **Résultat JSON** → succès/erreurs/détails d'exécution

## Usage

### Syntaxe

```bash
node playwright/build_cart.js --store STORE --items ITEMS_JSON [--strategy STRATEGY]
```

### Paramètres

- `--store` (required): `leclerc`, `carrefour`, ou `intermarche`
- `--items` (required): JSON array de produits à chercher
- `--strategy` (optional): `cheapest` (défaut) ou `best_per_kg`

### Exemples

#### Test basique (stratégie cheapest par défaut)

```bash
node playwright/build_cart.js --store leclerc --items '["pates","lait"]'
```

#### Test avec stratégie best_per_kg (prix au kg le plus bas)

```bash
node playwright/build_cart.js --store leclerc --items '["pates","lait"]' --strategy best_per_kg
```

#### Test multi-enseignes

```bash
node playwright/build_cart.js --store carrefour --items '["bananes","oeufs","fromage"]'
node playwright/build_cart.js --store intermarche --items '["pain","yaourt"]'
```

## Sortie JSON

Le script retourne toujours un JSON structuré:

```json
{
  "success": true,
  "url": "https://www.leclercdrive.fr/panier",
  "store": "leclerc",
  "items": ["pates", "lait"],
  "errors": [],
  "details": {
    "addedCount": 2,
    "requestedCount": 2,
    "remainingItems": [],
    "iterations": 15,
    "strategy": "best_per_kg",
    "logs": [...]
  }
}
```

### Champs

- `success`: booléen, true si tous les produits ont été ajoutés sans erreur
- `url`: URL du panier final (ou page actuelle en cas d'erreur)
- `store`: enseigne utilisée
- `items`: liste des produits demandés
- `errors`: tableau des messages d'erreur
- `details.addedCount`: nombre de produits réellement ajoutés
- `details.requestedCount`: nombre de produits demandés
- `details.remainingItems`: produits non traités (array vide = succès)
- `details.iterations`: nombre d'itérations agent
- `details.strategy`: stratégie utilisée (cheapest ou best_per_kg)
- `details.logs`: 60 dernières lignes de debug

## Stratégies de sélection produit

### cheapest (défaut)

Sélectionne le produit au **prix total le plus bas**.

Utile pour: budgets serrés, prix au global

Exemple:
- Pâtes Barilla 500g: 1.29 €
- Pâtes Carrefour 1kg: 2.80 € / 2.80 €/kg

→ Choix: Barilla (1.29 € < 2.80 €)

### best_per_kg

Sélectionne le produit au **prix au kg (ou litre) le plus bas**.

Utile pour: comparaison équitable, prix à la masse

Exemple:
- Pâtes Barilla 500g: 1.29 € → 2.58 €/kg
- Pâtes Carrefour 1kg: 2.80 € → 2.80 €/kg

→ Choix: Barilla (2.58 €/kg < 2.80 €/kg)

## Actions de l'agent

L'agent retourne des actions structurées:

```json
{
  "action": "search | click | add_to_cart | goto | scroll | wait | done | error",
  "selector": "CSS selector ou null",
  "value": "texte ou URL ou null",
  "reason": "explication"
}
```

### search

Remplir un champ recherche et soumettre.

```json
{
  "action": "search",
  "selector": "input[type='search']",
  "value": "pates",
  "reason": "Accueil detecte, lancement de la recherche"
}
```

### click

Cliquer sur un élément (accepter cookies, modal, produit, etc.)

```json
{
  "action": "click",
  "selector": "button[aria-label*='panier' i]",
  "value": null,
  "reason": "Banniere cookies detecte, fermeture avant continuation"
}
```

### add_to_cart

Cliquer sur le bouton "Ajouter au panier".

```json
{
  "action": "add_to_cart",
  "selector": "button[aria-label*='panier' i]",
  "value": null,
  "reason": "Produit selectionne selon la strategie (best_per_kg): Pates Barilla 500g"
}
```

### goto

Naviguer vers une URL (ex: retour à l'accueil après un produit).

```json
{
  "action": "goto",
  "selector": null,
  "value": "https://www.leclercdrive.fr/",
  "reason": "Navigation forcee"
}
```

### scroll

Scroller la page (pour charger plus de résultats).

```json
{
  "action": "scroll",
  "selector": null,
  "value": "down",
  "reason": "Aucun resultat visible, tentative de scroll pour charger plus"
}
```

### wait

Attendre (pause pour DOM stabili).

```json
{
  "action": "wait",
  "selector": null,
  "value": "500",
  "reason": "Attente stabilisation DOM"
}
```

### done

Fin de sequence (tous les produits ajoutés).

```json
{
  "action": "done",
  "selector": null,
  "value": null,
  "reason": "Tous les produits sont traites"
}
```

### error

État d'erreur détecté par l'agent.

```json
{
  "action": "error",
  "selector": null,
  "value": null,
  "reason": "Aucune barre de recherche detectee sur la page d'accueil"
}
```

## Configuration et limites

### Timeouts

- `DEFAULT_TIMEOUT`: 12 secondes pour navigation/domcontentloaded
- `ACTION_TIMEOUT`: 8 secondes par action (click, fill, etc.)
- `AGENT_LOOP_MAX_ITERATIONS`: 200 itérations max pour éviter boucles infinies
- `POST_ACTION_WAIT_MS`: 800ms de pause après chaque action

### Personnalisation

Modifier les constantes en haut de `playwright/build_cart.js`:

```javascript
const DEFAULT_TIMEOUT = 12000;  // ms
const AGENT_LOOP_MAX_ITERATIONS = 200;
const ACTION_TIMEOUT = 8000;  // ms
const POST_ACTION_WAIT_MS = 800;  // ms
```

## Débogage

Les logs détaillés sont disponibles dans `details.logs` de la sortie JSON.

Formats de logs:

```
init: store=leclerc items=2 strategy=best_per_kg
navigation: arrived at https://www.leclercdrive.fr/
agent:loop iteration=1 remaining=2 url=https://...
agent:decision action=search reason=Accueil detecte...
executeAction: type=search reason=Accueil detecte...
action:search completed for "pates"
tracking: added 1 / 2
```

Pour capturer et analyser les logs:

```bash
node build_cart.js --store leclerc --items '["pates"]' | jq '.details.logs'
```

## Intégration Rails

Depuis le Rails runner:

```ruby
result = CartBuilder.new(
  store: "leclerc",
  items: ["pates", "lait"],
  strategy: "best_per_kg"  # passe à CartBuilder, puis à build_cart.js
).call

puts JSON.pretty_generate(result)
```

Modification proposée à CartBuilder pour supporter la stratégie:

```ruby
def initialize(store:, items:, strategy: "cheapest")
  @store = store.to_s.downcase
  @items = Array(items).map(&:to_s).map(&:strip).reject(&:empty?)
  @strategy = strategy.to_s.downcase
end

def command
  [
    "node",
    Rails.root.join("playwright", "build_cart.js").to_s,
    "--store",
    @store,
    "--items",
    JSON.generate(@items),
    "--strategy",
    @strategy
  ]
end
```

## Améliorations futures

- [ ] Support des quantités (ex: "2 pâtes")
- [ ] Support des préférences (marque, bio, promotion)
- [ ] Fallback multi-magasins si produit indisponible
- [ ] Cache des sélecteurs réussis par store
- [ ] Instrumentation Phoenix pour observabilité
- [ ] Agent LLM pour décisions critiques
