# BoltzAgent Design Token Library — Project Context

> Dieses Dokument am Anfang eines neuen Chats hochladen, zusammen mit den drei
> Library-Dateien (und ggf. `bz-agent-mock.zip`, falls weiter am Prototyp gearbeitet wird).
> Ben kommuniziert auf Deutsch und Englisch — in derselben Sprache antworten.

---

## 1. Was das ist

Eine umfangreiche, formatübergreifende **Design Token Library** für die Bitwork/BoltzAgent-Produktfamilie. Ursprünglich für die Bitwork Suite gebaut, dann auf den Namen **BoltzAgent** umgebrandet, und seither auch mit einem separaten React-Prototyp (**bz-agent-mock** / BoltzHub-Farbwelt) abgeglichen.

**Drei Kern-Deliverables** (immer zusammen deployen):
| Datei | Zweck |
|---|---|
| `boltzagent-tokens.css` | CSS Custom Properties, `@layer boltzagent-tokens`, Prefix `--ba-` |
| `boltzagent-tokens.json` | W3C DTCG-Format (`$value`/`$type`), 11+ Top-Level-Gruppen |
| `boltzagent-tokens-preview.html` | Interaktive Vorschau, alle Kategorien, Copy-on-Click |

**Viertes Deliverable (nur bei Task A / BoltzHub-Alignment relevant):**
| Datei | Zweck |
|---|---|
| `boltzhub-tokens-A+.css` | Gepatchte Version von `bz-agent-mock/src/tokens.css` — gleiche Variablennamen, A+-Werte. Muss manuell zurück nach `src/tokens.css` im Prototyp kopiert werden. |

---

## 2. Zwei parallele Threads — nicht verwechseln

- **Task A — „BoltzHub an BoltzAgent A+ angleichen"**: Der `bz-agent-mock`-Prototyp hat eine eigene `tokens.css` (Kommentar: „copied from boltzhub-tokens.css"). Diese wird so gepatcht, dass Variablennamen gleich bleiben, aber Werte auf das warme A+-System zeigen.
- **Task B — „Library ↔ Prototyp-Lücken schließen"**: Der 4-Phasen-Plan (siehe unten), damit die Library-Datei den Prototyp 1:1 treiben könnte, falls er irgendwann direkt gegen `boltzagent-tokens.css` läuft statt gegen seine eigene `tokens.css`.

---

## 3. Status — 4-Phasen-Plan (Task B) + Task A

Ben-Entscheidungen (bestätigt): Farbwelt folgt künftig **immer BoltzAgent A+**. Mode-Farben (pink/cyan für widget/coder) werden **übernommen**, nicht neu gemappt. Reihenfolge: Phase 1 zuerst, dann Rest.

| # | Was | Status |
|---|---|---|
| Phase 1 | Alias-Vollabdeckung — alle vom Prototyp genutzten unpräfixierten Namen als Legacy-Aliase in `boltzagent-tokens.css` (`--bg-primary` → `var(--ba-bg-primary)` etc., 65 Aliase, validiert mit Resolver-Skript, 0 Fehler) | ✅ Erledigt |
| Phase 2 | Agent-Mode-Farbsystem — `--ba-mode-{general,widget,worker,coder}` + subtle/border-Varianten in CSS, JSON (`mode`-Sektion) + eigene „Agent Modes"-Preview-Seite | ✅ Erledigt |
| Phase 3 (Teil 1) | Fehlende Primitives + Border-Mapping (`--border-primary/secondary`, `--accent-pink`, `--text-on-accent/dark`, `--shadow-dropdown`, `--overlay-modal`) | ✅ Bereits mit Phase 1 miterledigt (war in der Alias-Arbeit enthalten) |
| Phase 3 (Teil 2) | **Task A** — BoltzHub-Prototyp-Farben auf A+ umstellen | ✅ Erledigt 2026-07-01 — `boltzhub-tokens-A+.css` deployed |
| Phase 4 | Syntax-/Editor-Palette als hardcoded Token-Block (wie AI-Panel) — echte Werte aus `AgentCoder.tsx`/`AgentShared.tsx` (`CodeBlock`) übernommen: bg `#1e1e2e`, text `#cdd6f4`, Catppuccin-Mocha-Syntaxfarben | ✅ Erledigt 2026-07-01 — CSS-Block `--ba-syntax-*`, JSON `syntax`-Sektion, neue Preview-Seite „Syntax / Editor" |
| Optional | Komponenten-Dimensionen des Prototyps (TopBar, Sidebar, AgentHeader, Editor-Tab-Bar, FileTree, ChatPanel, Input-Box) | ✅ Erledigt 2026-07-01 — CSS `--ba-agent-*`, JSON `agentChrome`-Sektion, Tabelle auf „Agent Modes"-Seite |

**Damit ist der gesamte ursprüngliche 4-Phasen-Plan + Task A abgeschlossen.**

---

## 4. Wichtige Werte-Referenzen (aus dem Prototyp gelesen, 2026-07-01)

### Component-Dimensionen (bz-agent-mock)
```
TopBar:            52px Höhe
Sidebar:            220px Breite (expanded)
AgentHeader:        40px Höhe
Editor-Tab-Bar:     36px Höhe (Coder-Modus)
FileTree:           200px Breite (fest, Coder + Worker)
ChatPanel:          360px (General/Worker/Coder) – 420px (Widget)
Input-Box:          max-width 720px, radius 16px
```

### Syntax-Palette (Catppuccin Mocha, aus AgentCoder.tsx / CodeBlock)
```
--ba-syntax-bg:         #1e1e2e
--ba-syntax-header-bg:  #2a2a3e   (nur in-chat CodeBlock-Header)
--ba-syntax-text:       #cdd6f4
--ba-syntax-comment:    #6c7086
--ba-syntax-keyword:    #cba6f7
--ba-syntax-string:     #a6e3a1
--ba-syntax-type:       #89b4fa
--ba-syntax-function:   #89dceb
--ba-syntax-lang-label: #888888
```

### Task A — BoltzHub → A+ Mapping-Prinzip
Variablennamen im Prototyp (`--bg-primary`, `--border-primary/secondary`, `--accent-*` etc.) bleiben **unverändert** — nur die Werte wurden auf die A+-Skala umgelegt. Wichtige bewusste Entscheidung dabei: Die Akzentfarben (blue/green/orange/red) sind in A+ **pro Farbe fix**, nicht mehr pro Light/Dark unterschiedlich (Original-BoltzHub hatte z.B. im Dark Mode ein helleres Blau `#2E88FF` statt `#1473DF`) — das wurde bewusst vereinheitlicht, da A+ nur eine Akzent-Palette für beide Modi definiert. Falls das nicht gewünscht ist, kurz Bescheid geben.

`--shadow-dropdown` ist im A+-System auch im Light Mode nicht auf warme Töne umgestellt (bleibt `rgba(0,0,0,0.40)`) — das ist kein Bug, sondern Verhalten der bestehenden Library, 1:1 übernommen.

---

## 5. Wichtige Prinzipien (nicht vergessen)

- **AI Panel und Syntax/Editor-Palette:** beide IMMER hardcoded Hex-Werte in der Implementierung — nie an CSS-Variablen binden, unabhängig vom Theme.
- **Legacy-Aliase** in `boltzagent-tokens.css` sind reine CSS-Bridge — nicht Teil des DTCG-JSON-Modells (Aliase existieren nur in der CSS-Datei, nicht in der JSON).
- **Naming-Diskrepanzen bewusst gemappt, nicht "repariert":** Prototyp nutzt `border-primary/secondary`, Library nutzt `border-default/subtle/strong`. Prototyp-Radius-Skala (8/12/16) ist versetzt zur `--ba-radius-*`-Namensskala (radius-lg/xl/2xl) — bewusst so gelassen, um keine visuelle Verschiebung zu erzeugen.
- **`bz-agent-mock` hat KEIN eigenes Repo-Zip als Deliverable** — Ordner enthält 143MB `node_modules`, daher wird bei Task-A-Arbeit immer nur die einzelne gepatchte `tokens.css` ausgeliefert (aktuell: `boltzhub-tokens-A+.css`), nicht das ganze Projekt neu gezippt.

---

## 6. Dev-Workflow

1. Bei Session-Start: alle drei (ggf. vier) aktuellen Dateien hochladen lassen — Filesystem resettet zwischen Sessions.
2. Vor jeder Änderung: Datei einlesen, nicht aus dem Gedächtnis arbeiten.
3. Validierung vor jedem Deploy:
   - JSON: `python3 -c "import json; json.load(open('boltzagent-tokens.json'))"`
   - JS (Preview): Scripts extrahieren, `node -e "new vm.Script(...)"`
   - CSS: Klammern-Balance prüfen (`{` vs `}` Count)
4. Deploy: alle geänderten Dateien nach `/mnt/user-data/outputs/` kopieren, `present_files`.
5. Ben bestätigt Plan bevor größere Umsetzungen beginnen (bei kleinen, klar delegierten Entscheidungen wie hier reicht schriftliche Ankündigung + direkte Umsetzung).

---

## 7. Was als Nächstes offen ist

Mit Phase 1–4 + Task A ist der ursprünglich vereinbarte Scope **komplett**. Mögliche nächste Schritte (noch nicht vereinbart, nur Ideen):
- Prüfen, ob der Prototyp direkt gegen `boltzagent-tokens.css` laufen soll (statt gegen eigene `tokens.css`) — würde die Legacy-Aliase überflüssig machen.
- Token-Governance / Versionierung (v1.0 → v1.1) formal festlegen.
- Style-Dictionary- oder Figma-Tokens-Export testen (JSON ist bereits DTCG-kompatibel).

---

## 8. Session-Historie

| Datum | Was |
|---|---|
| 2026-03-11 | Library-Grundgerüst gebaut (JSON/CSS/Preview), Werte gegen `bitwork-suite.html` abgeglichen |
| 2026-03-11 | Bitwork-Logo eingebaut, später verkleinert |
| 2026-07-01 | Rebrand Bitwork → BoltzAgent (Name, Logo, Texte, Prefix `--bw-`→`--ba-`), Light Mode auf finale A+-Fassung reduziert |
| 2026-07-01 | Logo-Dark-Mode-Fix (Soft White), Sand-Skala auf Colors-Seite ergänzt + in CSS/JSON nachgezogen (war nur in Preview, nicht in den Dateien selbst) |
| 2026-07-01 | Collection-Card-Hover auf A+-Elevations-Sprache angehoben |
| 2026-07-01 | `bz-agent-mock.zip` hochgeladen, Lücken-Analyse (5 Kategorien), 4-Phasen-Plan vereinbart |
| 2026-07-01 | Phase 1 (Alias-Vollabdeckung) umgesetzt + deployt, Resolver-validiert |
| 2026-07-01 | Phase 2 (Agent-Mode-Farbsystem) umgesetzt |
| 2026-07-01 | **Session-Unterbrechung** — Chat brach beim Collection-Card-Preview-Hover-Task ab; späterer Kontext (Prototyp, 4-Phasen-Plan, Phase 1+2) ging in einer Zusammenfassung zunächst verloren und musste per `conversation_search` + Datei-Verifikation rekonstruiert werden |
| 2026-07-01 | Phase 3 Teil 2 (Task A: BoltzHub → A+) + Phase 4 (Syntax-Palette) + Komponenten-Dimensionen (optional) — alle drei in einem Rutsch umgesetzt, validiert, deployt |

---

*Zuletzt aktualisiert: 2026-07-01, nach Abschluss Phase 1–4 + Task A*
