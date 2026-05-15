# Sélection de Stratégie de Comparaison

## 🎯 Vue d'ensemble

Les utilisateurs peuvent désormais choisir entre **deux stratégies de sélection de produits**:

### Stratégies disponibles

1. **Moins cher** (cheapest) - *par défaut*
   - Sélectionne le produit au **prix total le plus bas**
   - Utile pour les budgets serrés
   - Exemple: Pâtes 500g à 1.29€ vs Pâtes 1kg à 2.80€ → sélectionne 1.29€

2. **Meilleur prix/kg** (best_per_kg)
   - Sélectionne le produit au **prix normalisé par kg/litre le plus bas**
   - Utile pour comparer équitablement malgré les conditionnements différents
   - Exemple: Pâtes 500g à 1.29€ (2.58€/kg) vs Pâtes 1kg à 2.80€ (2.80€/kg) → sélectionne 2.58€/kg

## 📝 Modifications apportées

### 1. Vue: `app/views/carts/new.html.erb`

**Ajout:** Select field pour stratégie

```erb
<div>
  <%= f.label :strategy, "Stratégie de comparaison", class: "mb-2 block text-sm font-medium text-slate-700" %>
  <%= f.select :strategy,
      [["Moins cher (prix total)", "cheapest"], ["Meilleur prix/kg", "best_per_kg"]],
      { selected: "cheapest" },
      class: "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none" %>
</div>
```

**Emplacement:** Après le select Enseigne, avant le textarea Liste de courses

**Styles:** Tailwind CSS cohérent avec le reste du formulaire

---

### 2. Contrôleur: `app/controllers/carts_controller.rb`

**Changements:**

a) **Autoriser le paramètre strategy dans cart_params:**
```ruby
def cart_params
  if params.respond_to?(:expect)
    params.expect(cart: [ :store, :items_text, :strategy ])
  else
    params.require(:cart).permit(:store, :items_text, :strategy)
  end
end
```

b) **Récupérer et normaliser la stratégie dans create:**
```ruby
def create
  store = cart_params[:store].to_s.downcase
  items = parse_items(cart_params[:items_text])
  strategy = cart_params[:strategy].to_s.downcase.presence || "cheapest"

  result = CartBuilder.new(store:, items:, strategy:).call
  # ...
end
```

**Normalisation:** Force en minuscules + fallback "cheapest" si absent

---

### 3. Service: `app/services/cart_builder.rb`

**Changements:**

a) **Ajouter stratégie au initialize:**
```ruby
def initialize(store:, items:, strategy: "cheapest")
  @store = store.to_s.downcase
  @items = Array(items).map(&:to_s).map(&:strip).reject(&:empty?)
  @strategy = strategy.to_s.downcase
end
```

b) **Transmettre stratégie au script Node:**
```ruby
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

---

### 4. Script Playwright: `playwright/build_cart.js`

**État:** ✅ Déjà implémenté (parsing + validation)

Le script parse déjà `--strategy` avec:
- Valeur par défaut: `"cheapest"`
- Transmission à `decideNextAction({ ..., strategy })`
- Transmission à agent NavigatorAgent pour sélection

```javascript
const args = {
  store: null,
  items: null,
  strategy: "cheapest"  // Default
};

// ... parsing de --strategy ...

// Utilisation dans la boucle agent:
const action = decideNextAction({
  html,
  url,
  remainingItems,
  strategy: safeStrategy  // ✅ Passée à l'agent
});
```

---

## ✅ Validations

### Tests effectués:

```bash
# Test 1: Stratégie par défaut
bin/rails runner '
result = CartBuilder.new(store: "leclerc", items: ["pates"]).call
# Strategy = "cheapest" (par défaut)
'

# Test 2: Stratégie explicite
bin/rails runner '
result = CartBuilder.new(store: "carrefour", items: ["lait"], strategy: "best_per_kg").call
# Strategy = "best_per_kg"
'

# Test 3: Normalisation de casse
bin/rails runner '
result = CartBuilder.new(store: "intermarche", items: ["bananes"], strategy: "BEST_PER_KG").call
# Strategy = "best_per_kg" (normalisé)
'
```

### Résultats:
- ✅ Paramètre strategy passe correctement du formulaire au service Rails
- ✅ CartBuilder construit la commande Node avec `--strategy` correct
- ✅ Normalisation de casse fonctionne (BEST_PER_KG → best_per_kg)
- ✅ Fallback par défaut fonctionne (absence de stratégie → cheapest)

---

## 📊 Impact agent NavigatorAgent

L'agent NavigatorAgent utilise maintenant la stratégie pour:

### 1. Extraction de prix/quantité
```javascript
const pricePerKg = computePricePerKg(price, quantityInGrams);
// Example: 1.29€ pour 500g → 2.58€/kg
```

### 2. Sélection de produit
```javascript
const chooseBestProduct = (products, strategy) => {
  if (strategy === "best_per_kg") {
    // Trier par pricePerKg ascendant
    return products.sort((a, b) => a.pricePerKg - b.pricePerKg)[0];
  } else {
    // Défaut: trier par price ascendant (cheapest)
    return products.sort((a, b) => a.price - b.price)[0];
  }
};
```

### 3. Raison de la sélection
```javascript
reason: `Produit selectionne selon la strategie (${strategy}): ${product.name}`
```

---

## 🔄 Flux complet

```
Utilisateur choisit stratégie dans formulaire
        ↓
form_with envoi POST /carts
        ↓
CartsController#create reçoit :strategy
        ↓
Normalise et valide stratégie
        ↓
CartBuilder.new(..., strategy: "best_per_kg").call
        ↓
Command Node: --strategy best_per_kg
        ↓
build_cart.js parse args
        ↓
decideNextAction reçoit strategy
        ↓
NavigatorAgent utilise strategy pour chooseBestProduct
        ↓
Retourne action avec raison stratégique
        ↓
JSON résultat avec strategy=best_per_kg
```

---

## 📱 Interface utilisateur

Le formulaire affiche désormais:

```
[Enseigne select] ← Leclerc / Carrefour / Intermarché
[Stratégie select] ← Moins cher / Meilleur prix/kg
[Liste textarea]
[Bouton soumettre]
```

La stratégie est **pré-sélectionnée** sur "Moins cher" par défaut.

---

## 🧪 Cas d'usage

### Scénario 1: Client budgétaire
- Choisit: **Moins cher**
- Va chercher: pâtes, lait, bananes
- Résultat: Produits au prix total minimum

### Scénario 2: Client nutritionnel/comparateur
- Choisit: **Meilleur prix/kg**
- Va chercher: pâtes, riz, lait
- Résultat: Meilleur rapport qualité/quantité par kilo

---

## 🔮 Évolutions futures

- [ ] Sauvegarde de la stratégie préférée par utilisateur
- [ ] Support de stratégies mixtes (produit A cheapest, produit B best_per_kg)
- [ ] Dashboard de comparaison best_per_kg vs cheapest
- [ ] Filtres additionnels (bio, marque, promo)
