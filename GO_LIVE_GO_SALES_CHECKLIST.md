# Go Live and Go Sales Checklist

Date d execution: 2026-05-26
Projet: PanierBot
Statut global actuel: AMBER (techniquement proche, blocants P0 restants)

## P0 (bloquant production)

| ID | Point de controle | Statut | Preuve executee | Action pour passer au vert |
|---|---|---|---|---|
| P0-01 | Suite RSpec complete verte | PASS | script production_setup_check execute, 37 examples, 0 failures | Maintenir en gate obligatoire |
| P0-02 | RuboCop vert | PASS | script production_setup_check execute, 71 files no offenses | Gate CI + pre-merge |
| P0-03 | Brakeman sans warning | PASS | script production_setup_check execute, 0 security warnings | Maintenir blocant |
| P0-04 | Bundler audit sans CVE | PASS | script production_setup_check execute, no vulnerabilities found | Maintenir blocant |
| P0-05 | Lint JS vert | PASS | script production_setup_check execute, eslint ok | Maintenir blocant |
| P0-06 | Tests API securite et quota | PASS | specs requests api v1 compare, billing, quotas deja executes verts | Maintenir en smoke suite |
| P0-07 | Flux abonnements (billing + webhook) | PASS | specs billing et billing webhook verts | Ajouter test e2e Stripe sandbox |
| P0-08 | Script readiness unique disponible | PASS | script/production_setup_check.sh present et execute | Documenter usages stricts |
| P0-09 | Monitoring auto des selecteurs | PASS | selector_monitor.js present, strategie autocorrective active | Ajouter execution planifiee quotidienne |
| P0-10 | Couverture statique des nouveaux selecteurs | PASS | test-selector-coverage vert | Maintenir dans readiness |
| P0-11 | Retry intelligent et backoff extraction | PASS | retry visible dans logs audits et code playwright | Ajouter telemetrie retry par enseigne |
| P0-12 | Resilience CDP/fallback offline | PASS | audit_harness.js inclut connect retry + fallback | Garder fallback desactive en prod stricte si necessaire |
| P0-13 | E2E navigateur smoke stable | FAIL | test-navigator echoue avec page context closed | Stabiliser isolation contexte browser et fermeture pages |
| P0-14 | E2E multi-enseignes stable | FAIL | test-all-stores-full instable, erreurs CDP context closed | Rendre test deterministic (context par store + retries bornes) |
| P0-15 | Test de charge integre a readiness | PASS | load-test lance dans script readiness | Ajouter seuils de rejet |
| P0-16 | Mesure erreurs HTTP de charge fiable | PASS | run_load_tests.js corrige comptage 4xx/5xx et valide | Conserver version corrigee |
| P0-17 | Charge sans timeout sur scenarii cibles | FAIL | erreurs ERR_SOCKET_TIMEOUT observees en execution readiness | Ajuster scenarios, timeout, charge profile et infra locale |
| P0-18 | Hygiene secrets en repository | FAIL | auth.json et playwright/auth.json sont versionnes | Deversionner, ignorer, et utiliser gabarit auth.example.json |
| P0-19 | Secrets paiement presents en runtime | FAIL | STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET absents | Configurer secrets par environnement |
| P0-20 | Middleware securite API actif | PASS | api_security_audit_middleware charge dans config/application.rb | Ajouter tests dedies suspicious origin et patterns |

## P1 (critique vente et exploitation)

| ID | Point de controle | Statut | Preuve executee | Action pour passer au vert |
|---|---|---|---|---|
| P1-01 | Workflow CI securite et qualite present | PASS | .github/workflows/ci.yml contient scans et tests | Ajouter job readiness complet |
| P1-02 | Endpoint sante disponible | PASS | routes health et up presentes, health API repond | Ajouter checks externes periodiques |
| P1-03 | Politique CSP enforcee en production | FAIL | initializer CSP entierement commente | Activer CSP minimale puis durcir progressivement |
| P1-04 | Protection host authorization explicite | FAIL | production.rb laisse hosts commente | Definir domaines autorises |
| P1-05 | Alerting production (Sentry/Datadog/etc) | FAIL | aucune integration explicite detectee | Brancher alerting erreur + latence + timeouts |
| P1-06 | Runbook incident d exploitation | FAIL | aucun document runbook incident detecte | Creer runbook P1 avec procedures et owners |
| P1-07 | Procedure backup et restore testee | FAIL | aucune procedure explicite detectee | Definir sauvegarde, restauration, tests trimestriels |
| P1-08 | Dossier legal vente (CGU/CGV/Privacy/RGPD) | FAIL | aucun document legal detecte dans repo | Produire docs legales et parcours consentement |
| P1-09 | Politique support client et SLA | FAIL | pas de document SLA/support detecte | Definir canaux, delais, escalation |
| P1-10 | Plan rollback release et postmortem | FAIL | aucun guide rollback formel detecte | Ajouter playbook rollback + template postmortem |

## Resultat execute aujourd hui

Points PASS: 17
Points FAIL: 13

Conclusion operationnelle:
- Pas de feu vert final immediat.
- Feu vert possible apres fermeture prioritaire de P0-13, P0-14, P0-17, P0-18, P0-19.

## Plan de fermeture rapide

1) Stabiliser les E2E navigateur (P0-13, P0-14) en mode deterministic puis relancer test-navigator et test-all-stores-full.
2) Durcir les tests de charge (P0-17) avec profils progressifs et seuils de rejet dans run_load_tests.js.
3) Nettoyer les secrets versionnes (P0-18) et imposer fichiers locaux ignores.
4) Configurer Stripe secrets par environnement (P0-19) et tester le flux checkout/webhook en sandbox.
5) Finaliser P1 vente/exploitation (CSP, alerting, legal, support, runbooks).
