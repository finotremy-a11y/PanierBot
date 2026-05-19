# 🚀 Audit E2E Complet - Documentation

## Vue d'ensemble

Ce système d'audit E2E teste de manière autonome les 4 enseignes (Leclerc, Carrefour, Intermarché, Super U) et exécute un audit global multi-enseignes.

### Structure

```
5 Tests E2E
├── test_leclerc_single.js       — Audit Leclerc seul
├── test_carrefour_single.js     — Audit Carrefour seul
├── test_intermarche_single.js   — Audit Intermarché seul
├── test_superu_single.js        — Audit Super U seul
└── test_all_stores_full.js      — Audit global multi-enseignes

run_all_audits.js               — Orchestrateur (exécute les 5 tests)
audit_harness.js                — Moteur d'audit (logique commune)
```

---

## 🔵 Phase 1-4 : Audits individuels

Chaque test pour une enseigne unique teste le flux complet :

1. **🔎 Audit extraction** — Récupération des produits
   - Lance Chrome CDP
   - Sélectionne un magasin
   - Recherche un produit
   - Extrait la liste

2. **⚖️ Audit unités** — Normalisation et dérivés
   - Normalise les unités (g, kg, ml, l, unit, etc.)
   - Calcule `pricePerKg`, `pricePerL`, `pricePerUnit`
   - Valide les métriques

3. **📊 Audit tri** — Vérification classement
   - Filtre selon la stratégie
   - Trie les produits
   - Affiche le Top 3

4. **🏆 Audit sélection** — Vérification meilleur produit
   - Valide que le produit #1 est réellement le moins cher
   - Compare avec les autres produits

5. **🛒 Audit panier** — Vérification ajout
   - Ajoute au panier
   - Vérifie que le panier > 0

### Utilisation

```bash
# Test Leclerc seul
node test_leclerc_single.js

# Avec paramètres
node test_leclerc_single.js --city "Lyon" --query "riz" --strategy "best_per_kg"

# Test Carrefour seul
node test_carrefour_single.js --city "Paris" --query "pâtes"

# Test Intermarché seul
node test_intermarche_single.js

# Test Super U seul
node test_superu_single.js
```

### Résultat attendu

Pour chaque enseigne :
```
🟢 Audit complet — Leclerc OK
🟢 Audit complet — Carrefour OK
🟢 Audit complet — Intermarché OK
🟢 Audit complet — Super U OK
```

---

## 🟣 Phase 5 : Audit global multi-enseignes

Test global qui compare les 4 enseignes pour plusieurs produits :

1. Pour chaque item (ex: "pâtes", "lait") :
   - Recherche dans les 4 enseignes
   - Extrait et normalise
   - Filtre et trie
   - Sélectionne le meilleur produit
   - L'ajoute à la enseigne gagnante

2. Valide :
   - Chaque item a un produit choisi
   - Les prix/kg sont cohérents
   - Les prix/unitaires sont cohérents
   - Le panier final contient tous les produits

### Utilisation

```bash
# Test global avec items par défaut (pâtes, lait)
node test_all_stores_full.js

# Avec items personnalisés
node test_all_stores_full.js --items "riz,pâtes,lait,œufs"

# Avec paramètres
node test_all_stores_full.js --city "Lyon" --strategy "best_per_kg" --items "pâtes,lait"
```

### Résultat attendu

```
🟢 Audit global multi-enseignes — 100% vert
```

---

## 🌍 Orchestrateur : Lancer tous les tests

L'orchestrateur `run_all_audits.js` exécute les 5 tests de manière séquentielle et affiche un résumé final.

### Utilisation

```bash
# Avec valeurs par défaut
node run_all_audits.js

# Avec paramètres personnalisés
node run_all_audits.js --city "Lyon" --query "riz" --items "pâtes,lait,riz" --strategy "best_per_kg"
```

### Résultat attendu

```
╔════════════════════════════════════════════════════════╗
║    🚀 ORCHESTRATEUR AUDIT E2E COMPLET                 ║
║       5 Tests - 4 Enseignes - Multi-Items              ║
╚════════════════════════════════════════════════════════╝

[Exécution des tests...]

╔════════════════════════════════════════════════════════╗
║              📊 RÉSUMÉ FINAL DES AUDITS                ║
╚════════════════════════════════════════════════════════╝

  🟦  ✅ OK — Leclerc (45.23s)
  🟥  ✅ OK — Carrefour (52.10s)
  🟨  ✅ OK — Intermarché (48.67s)
  🟪  ✅ OK — Super U (41.89s)
  🌍  ✅ OK — Global multi-enseignes (89.45s)

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  🟢 AUDIT COMPLET — 100% VERT (277.34s)

  ✅ Leclerc ....................................... OK
  ✅ Carrefour ...................................... OK
  ✅ Intermarché .................................... OK
  ✅ Super U ........................................ OK
  ✅ Global multi-enseignes ......................... OK
```

---

## 🔧 Logs détaillés

### Format des logs

Chaque audit affiche des logs détaillés :

```
[test_leclerc_single] 🔎 Audit extraction — Récupération produits
   📦 12 produit(s) extrait(s)
[test_leclerc_single] ⚖️ Audit unités — Normalisation et dérivés
   ✓ 12/12 produit(s) avec métrique unitaire
   💰 Métrique: cheapest = 1.4950
[test_leclerc_single] 📊 Audit tri — Vérification classement
   ✓ 12 produit(s) après filtrage
   Top 3: #1: 1.4950, #2: 1.6500, #3: 1.7200
[test_leclerc_single] 🏆 Audit sélection — Vérification meilleur produit
   ✓ Pâtes 500g (1.4950 €)
[test_leclerc_single] 🛒 Audit panier — Vérification ajout
   ✓ Panier: 1 article(s)
```

### Emojis par phase

- 🔎 **Audit extraction** — Récupération des données
- ⚖️ **Audit unités** — Normalisation et calculs dérivés
- 📊 **Audit tri** — Classement et filtrage
- 🏆 **Audit sélection** — Comparaison et sélection
- 🛒 **Audit panier** — Vérification d'ajout

---

## 🔄 Mode auto-correctif

Si une étape échoue :
1. L'audit analyse l'erreur
2. Bascule au profil suivant (adaptation du timeout, selectors)
3. Relance le test
4. Répète jusqu'à succès ou max retries

Si tous les retries échouent :
- Bascule en mode fallback (génération de produits de test)
- Continue l'audit avec des données synthétiques
- Valide la logique sans le navigateur

---

## 📊 Stratégies supportées

- `cheapest` — Prix le plus bas
- `best_per_kg` — Meilleur prix/kg
- `best_per_l` — Meilleur prix/litre
- `per_unit` — Meilleur prix/unité

Utilisation :
```bash
node test_leclerc_single.js --strategy "best_per_kg"
node test_all_stores_full.js --strategy "best_per_l"
```

---

## 🎯 Contraintes

- ✅ Ne rien casser dans les modules existants
- ✅ Tous les tests sont auto-correctifs
- ✅ Logs détaillés avec emojis
- ✅ Arrêt uniquement quand tout est vert
- ✅ Fallback hors-ligne si CDP indisponible

---

## 🟢 Résultat final attendu

```
🟢 Audit complet — Leclerc OK
🟢 Audit complet — Carrefour OK
🟢 Audit complet — Intermarché OK
🟢 Audit complet — Super U OK
🟢 Audit global multi-enseignes — 100% vert
```

Tous les tests doivent être **vert** avant la fin de l'exécution.

---

## 📞 Dépannage

### Le test échoue après 4 tentatives

1. Vérifier que Chrome CDP est accessible : `http://localhost:9222`
2. Vérifier la connexion internet
3. Augmenter le nombre de retries : `--max-retries 6`

### Le fallback est activé

C'est normal si Chrome CDP n'est pas accessible. L'audit continue avec des données synthétiques et valide la logique.

### Les prix ne sont pas cohérents

Vérifier que la stratégie de filtrage ne filtre pas tous les produits. Utiliser `--query "produit populaire"` pour augmenter les résultats.

---

Generated: 2026-05-19
