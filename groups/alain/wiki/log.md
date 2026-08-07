# Log

Registre chronologique, **append-only**. Ne jamais réécrire ni supprimer une
entrée existante — uniquement ajouter à la fin.

Format d'en-tête strict, pour rester parsable :

```
## [YYYY-MM-DD] <ingest|query|lint|discovery> | <titre court>
```

Ce qui permet : `grep "^## \[" log.md | tail -5`

---

## [2026-08-07] discovery | Wiki initialisé

Structure créée (`wiki/`, `sources/gmail/`, index, log). Aucune donnée ingérée.
Taxonomie volontairement vide — à dériver de la boîte mail réelle lors de la
passe de découverte, puis à valider avec Clément avant tout écrit de page.
