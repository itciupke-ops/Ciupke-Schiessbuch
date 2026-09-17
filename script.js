/* =========================================================
   MY SHOOTING LOG
   script.js
   ========================================================= */

"use strict";

const STORAGE_KEY = "trainings";
const BEDUERFNIS_MODUS_KEY = "beduerfnisModus";
const BACKUP_VERSION = 4;

let trainings = ladeTrainings();
let trainingInBearbeitungId = null;

/* =========================================================
   HILFSFUNKTIONEN
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function zahl(wert, fallback = 0) {
  const n = Number(String(wert ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function formatZahl(wert, stellen = 2) {
  return zahl(wert).toLocaleString("de-DE", {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen
  });
}

function formatGanz(wert) {
  return Math.round(zahl(wert)).toLocaleString("de-DE");
}

function htmlSicher(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function datumDeutsch(datum) {
  if (!datum) return "–";

  const teile = String(datum).split("-");

  if (teile.length === 3) {
    return `${teile[2]}.${teile[1]}.${teile[0]}`;
  }

  return datum;
}

function heuteISO() {
  const jetzt = new Date();
  const offset = jetzt.getTimezoneOffset();

  const lokal = new Date(
    jetzt.getTime() - offset * 60000
  );

  return lokal.toISOString().split("T")[0];
}

function neueId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isoZuDatum(iso) {
  if (!iso) return null;

  const teile = String(iso).split("-");

  if (teile.length !== 3) return null;

  const jahr = Number(teile[0]);
  const monat = Number(teile[1]);
  const tag = Number(teile[2]);

  if (
    !Number.isInteger(jahr) ||
    !Number.isInteger(monat) ||
    !Number.isInteger(tag)
  ) {
    return null;
  }

  const datum = new Date(
    jahr,
    monat - 1,
    tag,
    12,
    0,
    0,
    0
  );

  if (
    datum.getFullYear() !== jahr ||
    datum.getMonth() !== monat - 1 ||
    datum.getDate() !== tag
  ) {
    return null;
  }

  return datum;
}

function datumZuISO(datum) {
  const jahr = datum.getFullYear();

  const monat = String(
    datum.getMonth() + 1
  ).padStart(2, "0");

  const tag = String(
    datum.getDate()
  ).padStart(2, "0");

  return `${jahr}-${monat}-${tag}`;
}

function addiereMonate(datum, anzahl) {
  const tag = datum.getDate();

  const ziel = new Date(
    datum.getFullYear(),
    datum.getMonth() + anzahl,
    1,
    12,
    0,
    0,
    0
  );

  const letzterTag = new Date(
    ziel.getFullYear(),
    ziel.getMonth() + 1,
    0,
    12,
    0,
    0,
    0
  ).getDate();

  ziel.setDate(
    Math.min(tag, letzterTag)
  );

  return ziel;
}

function addiereTage(datum, anzahl) {
  const kopie = new Date(datum);

  kopie.setDate(
    kopie.getDate() + anzahl
  );

  return kopie;
}

function monatsName(datum) {
  return datum.toLocaleDateString(
    "de-DE",
    {
      month: "long",
      year: "numeric"
    }
  );
}

/* =========================================================
   BEREICH / KALIBER NORMALISIEREN
   ========================================================= */

function normalisiereKaliber(kaliber) {
  return String(kaliber ?? "")
    .toLowerCase()
    .replace(/\s/g, "")
    .replaceAll(".", "");
}

function istKaliber9mm(kaliber) {
  const k = normalisiereKaliber(kaliber);

  return k === "9mm" || k.includes("9mm");
}

function istKaliber22(kaliber) {
  const k = normalisiereKaliber(kaliber);

  return (
    k.includes("22lr") ||
    k.includes("22") ||
    k.includes("22l,r")
  );
}

function trainingPasstZuBereich(training, bereich) {
  if (!bereich || bereich === "alle") {
    return true;
  }

  const art = String(
    training?.waffenart ?? ""
  )
    .trim()
    .toLowerCase();

  const istKurzwaffe = art.includes("kurz");
  const istLangwaffe = art.includes("lang");

  if (bereich === "kw9") {
    return (
      istKurzwaffe &&
      istKaliber9mm(training?.kaliber)
    );
  }

  if (bereich === "kw22") {
    return (
      istKurzwaffe &&
      istKaliber22(training?.kaliber)
    );
  }

  if (bereich === "lw22") {
    return (
      istLangwaffe &&
      istKaliber22(training?.kaliber)
    );
  }

  return false;
}

/* =========================================================
   DISZIPLIN NORMALISIEREN
   ========================================================= */

function normaleDisziplin(training) {
  const d = String(
    training?.disziplin ?? ""
  ).toLowerCase();

  if (
    d.includes("speed") ||
    d.includes("speedschiessen") ||
    d.includes("speedschießen")
  ) {
    return "Speedschiessen";
  }

  if (
    d.includes("fall") ||
    d.includes("fallscheibe")
  ) {
    return "Fallscheibe";
  }

  return "Praezision";
}

function disziplinName(trainingOderName) {
  const d =
    typeof trainingOderName === "string"
      ? normaleDisziplin({
          disziplin: trainingOderName
        })
      : normaleDisziplin(trainingOderName);

  if (d === "Speedschiessen") {
    return "BDS 25 m Speed";
  }

  if (d === "Fallscheibe") {
    return "BDS 25 m Fallscheibe";
  }

  return "Präzision";
}

/* =========================================================
   ALTE DATEN KOMPATIBEL HALTEN
   ========================================================= */

function normalisiereTraining(t) {
  const training = { ...t };

  if (!training.id) {
    training.id = neueId();
  }

  training.disziplin =
    normaleDisziplin(training);

  return training;
}

function ladeTrainings() {
  try {
    const roh =
      localStorage.getItem(STORAGE_KEY);

    if (!roh) return [];

    const daten = JSON.parse(roh);

    if (!Array.isArray(daten)) {
      return [];
    }

    return daten.map(
      normalisiereTraining
    );
  } catch (fehler) {
    console.error(
      "Trainings konnten nicht geladen werden:",
      fehler
    );

    return [];
  }
}

function speichereTrainings() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(trainings)
  );
}

/* =========================================================
   KOMPATIBILITÄTSWERTE
   ========================================================= */

function praezisionRinge(t) {
  return zahl(
    t.ringe ??
    t.ringeGesamt ??
    t.ergebnis
  );
}

function praezisionSchuesse(t) {
  return zahl(
    t.schuesse ??
    t.schüsse ??
    t.anzahlSchuesse
  );
}

function praezisionProzent(t) {
  if (
    Number.isFinite(
      Number(t.prozent)
    )
  ) {
    return zahl(t.prozent);
  }

  const ringe =
    praezisionRinge(t);

  const schuesse =
    praezisionSchuesse(t);

  if (!schuesse) return 0;

  return (
    ringe /
    (schuesse * 10)
  ) * 100;
}

function speedErgebnisWert(t) {
  return zahl(
    t.ergebnis ??
    t.speedErgebnis ??
    t.bdsErgebnis ??
    t.gesamtergebnis
  );
}

function speedRingeWert(t) {
  return zahl(
    t.ringeGesamt ??
    t.speedRingeGesamt ??
    t.gesamtringe
  );
}

function speedZeitWert(t) {
  return zahl(
    t.zeitGesamt ??
    t.speedZeitGesamt ??
    t.gesamtzeit
  );
}

function fallGefallenWert(t) {
  return zahl(
    t.gefallenGesamt ??
    t.trefferGesamt ??
    t.fallscheibeGefallenGesamt
  );
}

function fallSchuesseWert(t) {
  return zahl(
    t.schuesseGesamt ??
    t.fallscheibeSchuesseGesamt
  );
}

function fallReineZeitWert(t) {
  return zahl(
    t.zeitGesamt ??
    t.reineZeit ??
    t.fallscheibeZeitGesamt
  );
}

function fallStrafzeitWert(t) {
  return zahl(
    t.strafzeit ??
    t.strafZeit ??
    t.fallscheibeStrafzeit
  );
}

function fallGesamtzeitWert(t) {
  const direkt =
    t.gesamtzeit ??
    t.gesamtZeit ??
    t.fallscheibeGesamtzeit;

  if (
    direkt !== undefined &&
    direkt !== null
  ) {
    return zahl(direkt);
  }

  return (
    fallReineZeitWert(t) +
    fallStrafzeitWert(t)
  );
}

/* =========================================================
   SEITENNAVIGATION
   ========================================================= */

const seiten = [
  "startseite",
  "disziplinAuswahl",
  "trainingFormular",
  "leistungsseite",
  "entwicklungsseite",
  "trainingsseite",
  "beduerfnisSeite",
  "backupSeite"
];

function zeigeSeite(id) {
  seiten.forEach(seite => {
    const element = $(seite);

    if (!element) return;

    element.classList.toggle(
      "versteckt",
      seite !== id
    );
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (id === "startseite") {
    aktualisiereStartseite();
  }

  if (id === "leistungsseite") {
    aktualisiereLeistungen();
  }

  if (id === "entwicklungsseite") {
    aktualisiereDiagrammFilter();
    zeichneDiagramm();
  }

  if (id === "trainingsseite") {
    renderTrainingsbuch();
  }

  if (id === "beduerfnisSeite") {
    aktualisiereBeduerfnis();
  }
}

/* =========================================================
   NAVIGATION VERKNÜPFEN
   ========================================================= */

$("neuesTraining")?.addEventListener(
  "click",
  () => {
    zeigeSeite(
      "disziplinAuswahl"
    );
  }
);

$("leistungenOeffnen")?.addEventListener(
  "click",
  () => {
    zeigeSeite(
      "leistungsseite"
    );
  }
);

$("entwicklungOeffnen")?.addEventListener(
  "click",
  () => {
    zeigeSeite(
      "entwicklungsseite"
    );
  }
);

$("trainingsbuchOeffnen")?.addEventListener(
  "click",
  () => {
    zeigeSeite(
      "trainingsseite"
    );
  }
);

$("beduerfnisOeffnen")?.addEventListener(
  "click",
  () => {
    zeigeSeite(
      "beduerfnisSeite"
    );
  }
);

$("backupOeffnen")?.addEventListener(
  "click",
  () => {
    zeigeSeite(
      "backupSeite"
    );
  }
);

$("disziplinAuswahlZurueck")
  ?.addEventListener(
    "click",
    () => {
      zeigeSeite(
        "startseite"
      );
    }
  );

$("leistungenZurueck")
  ?.addEventListener(
    "click",
    () => {
      zeigeSeite(
        "startseite"
      );
    }
  );

$("entwicklungZurueck")
  ?.addEventListener(
    "click",
    () => {
      zeigeSeite(
        "startseite"
      );
    }
  );

$("trainingZurueck")
  ?.addEventListener(
    "click",
    () => {
      zeigeSeite(
        "startseite"
      );
    }
  );

$("beduerfnisZurueck")
  ?.addEventListener(
    "click",
    () => {
      zeigeSeite(
        "startseite"
      );
    }
  );

$("backupZurueck")
  ?.addEventListener(
    "click",
    () => {
      zeigeSeite(
        "startseite"
      );
    }
  );

$("zurueck")?.addEventListener(
  "click",
  () => {
    zeigeSeite(
      "disziplinAuswahl"
    );
  }
);

/* =========================================================
   BEDÜRFNISNACHWEIS – MODUS
   ========================================================= */

function ladeBeduerfnisModus() {
  const modus =
    localStorage.getItem(
      BEDUERFNIS_MODUS_KEY
    );

  if (modus === "besitz") {
    return "besitz";
  }

  return "erwerb";
}

function setzeBeduerfnisModus(
  modus
) {
  const istBesitz =
    modus === "besitz";

  $("beduerfnisModusErwerb")
    ?.classList.toggle(
      "aktiv",
      !istBesitz
    );

  $("beduerfnisModusBesitz")
    ?.classList.toggle(
      "aktiv",
      istBesitz
    );

  $("beduerfnisErwerb")
    ?.classList.toggle(
      "versteckt",
      istBesitz
    );

  $("beduerfnisBesitz")
    ?.classList.toggle(
      "versteckt",
      !istBesitz
    );

  localStorage.setItem(
    BEDUERFNIS_MODUS_KEY,
    istBesitz
      ? "besitz"
      : "erwerb"
  );

  aktualisiereBeduerfnis();
}

$("beduerfnisModusErwerb")
  ?.addEventListener(
    "click",
    () => {
      setzeBeduerfnisModus(
        "erwerb"
      );
    }
  );

$("beduerfnisModusBesitz")
  ?.addEventListener(
    "click",
    () => {
      setzeBeduerfnisModus(
        "besitz"
      );
    }
  );

/* =========================================================
   BEDÜRFNISNACHWEIS – TRAININGSTAGE
   ========================================================= */

function gueltigeTrainingstage(
  start,
  ende
) {
  const startZeit =
    start.getTime();

  const endeZeit =
    ende.getTime();

  const tage = new Set();

  trainings.forEach(training => {
    const datum =
      isoZuDatum(
        training.datum
      );

    if (!datum) return;

    const zeit =
      datum.getTime();

    if (
      zeit < startZeit ||
      zeit > endeZeit
    ) {
      return;
    }

    /*
      Ein Kalendertag zählt nur einmal,
      auch wenn an diesem Tag mehrere
      Disziplinen oder Kaliber geschossen
      wurden.
    */

    tage.add(
      datumZuISO(datum)
    );
  });

  return [...tage].sort();
}

function trainingstageInMonat(
  tage,
  jahr,
  monat
) {
  return tage.filter(iso => {
    const datum =
      isoZuDatum(iso);

    return (
      datum &&
      datum.getFullYear() === jahr &&
      datum.getMonth() === monat
    );
  });
}

/* =========================================================
   BEDÜRFNISNACHWEIS – ERWERB
   ========================================================= */

function erwerbZeitraum() {
  const ende =
    isoZuDatum(
      heuteISO()
    );

  const vorZwölfMonaten =
    addiereMonate(
      ende,
      -12
    );

  const start =
    addiereTage(
      vorZwölfMonaten,
      1
    );

  return {
    start,
    ende
  };
}

function ganzeMonateImZeitraum(
  start,
  ende
) {
  const monate = [];

  let cursor;

  if (start.getDate() === 1) {
    cursor = new Date(
      start.getFullYear(),
      start.getMonth(),
      1,
      12,
      0,
      0,
      0
    );
  } else {
    cursor = new Date(
      start.getFullYear(),
      start.getMonth() + 1,
      1,
      12,
      0,
      0,
      0
    );
  }

  while (cursor <= ende) {
    const letzterTag =
      new Date(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        0,
        12,
        0,
        0,
        0
      );

    if (letzterTag <= ende) {
      monate.push({
        jahr:
          cursor.getFullYear(),

        monat:
          cursor.getMonth(),

        start:
          new Date(cursor),

        ende:
          letzterTag
      });
    }

    cursor =
      new Date(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        1,
        12,
        0,
        0,
        0
      );
  }

  return monate;
}

function alleBeruehrtenMonate(
  start,
  ende
) {
  const monate = [];

  let cursor =
    new Date(
      start.getFullYear(),
      start.getMonth(),
      1,
      12,
      0,
      0,
      0
    );

  const letzterMonat =
    new Date(
      ende.getFullYear(),
      ende.getMonth(),
      1,
      12,
      0,
      0,
      0
    );

  while (
    cursor <= letzterMonat
  ) {
    const monatsStart =
      new Date(cursor);

    const monatsEnde =
      new Date(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        0,
        12,
        0,
        0,
        0
      );

    monate.push({
      jahr:
        cursor.getFullYear(),

      monat:
        cursor.getMonth(),

      start:
        monatsStart,

      ende:
        monatsEnde,

      istGanz:
        monatsStart >= start &&
        monatsEnde <= ende
    });

    cursor =
      new Date(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        1,
        12,
        0,
        0,
        0
      );
  }

  return monate;
}

/*
  =========================================================
  NEUE 12-MONATS-LOGIK
  =========================================================

  Der 12er-Zähler zeigt die aktuelle
  zusammenhängende Monatsserie.

  Ein bereits abgeschlossener Monat ohne
  Training unterbricht die Serie.

  Der laufende Monat unterbricht die Serie
  NICHT, solange er noch nicht beendet ist.
*/

function berechneErwerb() {
  const { start, ende } = erwerbZeitraum();

  const tage =
    gueltigeTrainingstage(
      start,
      ende
    );

  const beruehrteMonate =
    alleBeruehrtenMonate(
      start,
      ende
    );

  const heute =
    isoZuDatum(
      heuteISO()
    );

  const monatHatTraining = (
    jahr,
    monat
  ) => {
    return (
      trainingstageInMonat(
        tage,
        jahr,
        monat
      ).length > 0
    );
  };

  const aktuellerMonatHatTraining =
    monatHatTraining(
      heute.getFullYear(),
      heute.getMonth()
    );

  /*
    Wenn diesen Monat bereits trainiert wurde,
    starten wir die Rückwärtsprüfung beim
    aktuellen Monat.

    Wurde diesen Monat noch NICHT trainiert,
    starten wir beim vorherigen Monat.

    Dadurch setzt ein noch laufender Monat
    die Serie nicht auf 0.
  */

  let cursor =
    new Date(
      heute.getFullYear(),
      heute.getMonth() -
        (
          aktuellerMonatHatTraining
            ? 0
            : 1
        ),
      1,
      12,
      0,
      0,
      0
    );

  let monatsSerie = 0;

  while (monatsSerie < 12) {
    if (
      !monatHatTraining(
        cursor.getFullYear(),
        cursor.getMonth()
      )
    ) {
      break;
    }

    monatsSerie++;

    cursor =
      new Date(
        cursor.getFullYear(),
        cursor.getMonth() - 1,
        1,
        12,
        0,
        0,
        0
      );
  }

  const monatsWegErfuellt =
    monatsSerie >= 12;

  const achtzehnWegErfuellt =
    tage.length >= 18;

  return {
    start,
    ende,
    tage,
    beruehrteMonate,
    monatsSerie,
    monatsWegErfuellt,
    achtzehnWegErfuellt,

    erfuellt:
      monatsWegErfuellt ||
      achtzehnWegErfuellt
  };
}

function renderErwerb() {
  const daten =
    berechneErwerb();

  /*
    12er-Weg
  */

  if ($("beduerfnisErwerbMonate")) {
    $("beduerfnisErwerbMonate")
      .textContent =
        `${Math.min(
          daten.monatsSerie,
          12
        )} / 12`;
  }

  /*
    18er-Weg
  */

  if ($("beduerfnisErwerbTage")) {
    $("beduerfnisErwerbTage")
      .textContent =
        `${Math.min(
          daten.tage.length,
          18
        )} / 18`;
  }

  /*
    Betrachtungszeitraum
  */

  if ($("beduerfnisErwerbZeitraum")) {
    $("beduerfnisErwerbZeitraum")
      .textContent =
        `${datumDeutsch(
          datumZuISO(
            daten.start
          )
        )} – ${datumDeutsch(
          datumZuISO(
            daten.ende
          )
        )}`;
  }

  /*
    Der alte lange Erklärungstext ist weg.

    Ab dem 24. eines Monats erscheint
    stattdessen nur dann eine Erinnerung,
    wenn im laufenden Monat noch kein
    Training eingetragen wurde.
  */

  const status =
    $("beduerfnisErwerbStatus");

  if (status) {
    const heute =
      isoZuDatum(
        heuteISO()
      );

    const aktuellerMonatHatTraining =
      trainingstageInMonat(
        daten.tage,
        heute.getFullYear(),
        heute.getMonth()
      ).length > 0;

    const erinnerungAnzeigen =
      heute.getDate() >= 24 &&
      !aktuellerMonatHatTraining;

    if (erinnerungAnzeigen) {
      const letzterTag =
        new Date(
          heute.getFullYear(),
          heute.getMonth() + 1,
          0
        ).getDate();

      if (
        heute.getDate() >=
        letzterTag - 1
      ) {
        status.textContent =
          "⏳ Monat fast vorbei – diesen Monat ist noch kein Training eingetragen.";
      } else {
        status.textContent =
          "🎯 Denk ans Training! Diesen Monat ist noch kein Training eingetragen.";
      }

      status.style.display = "";
    } else {
      status.textContent = "";
      status.style.display = "none";
    }
  }

  renderErwerbMonate(
    daten
  );
}

function renderErwerbMonate(
  daten
) {
  const container =
    $("beduerfnisMonatsListe");

  if (!container) return;

  if (
    !daten.beruehrteMonate.length
  ) {
    container.innerHTML = `
      <div class="keine-daten">
        Noch keine Monatsdaten vorhanden.
      </div>
    `;

    return;
  }

  container.innerHTML =
    daten.beruehrteMonate
      .map(monat => {
        const tage =
          trainingstageInMonat(
            daten.tage,
            monat.jahr,
            monat.monat
          );

        const aktiv =
          tage.length > 0;

        let untertitel;

        if (aktiv) {
          untertitel =
            `${tage.length} ${
              tage.length === 1
                ? "Trainingstag"
                : "Trainingstage"
            }`;
        } else {
          untertitel =
            "Kein Training";
        }

        const teilmonat =
          !monat.istGanz
            ? `<small class="beduerfnis-monat-teil">Teilmonat</small>`
            : "";

        return `
          <div
            class="beduerfnis-monat ${
              aktiv ? "aktiv" : ""
            }"
          >
            <div class="beduerfnis-monat-info">
              <strong>
                ${htmlSicher(
                  monatsName(
                    monat.start
                  )
                )}
              </strong>

              <span>
                ${htmlSicher(
                  untertitel
                )}
              </span>

              ${teilmonat}
            </div>

            <span
              class="beduerfnis-monat-status"
              aria-hidden="true"
            ></span>
          </div>
        `;
      })
      .join("");
}

/* =========================================================
   BEDÜRFNISNACHWEIS – BESITZ
   ========================================================= */

function besitzZeitraum() {
  const ende =
    isoZuDatum(
      heuteISO()
    );

  const vor24Monaten =
    addiereMonate(
      ende,
      -24
    );

  const start =
    addiereTage(
      vor24Monaten,
      1
    );

  return {
    start,
    ende
  };
}

function berechneBesitz() {
  const {
    start,
    ende
  } = besitzZeitraum();

  const tage =
    gueltigeTrainingstage(
      start,
      ende
    );

  const monate =
    alleBeruehrtenMonate(
      start,
      ende
    );

  const aktiveMonate =
    monate.filter(monat => {
      return (
        trainingstageInMonat(
          tage,
          monat.jahr,
          monat.monat
        ).length > 0
      );
    });

  return {
    start,
    ende,
    tage,
    aktiveMonate
  };
}

function renderBesitz() {
  const daten =
    berechneBesitz();

  if ($("beduerfnisBesitzMonate")) {
    $("beduerfnisBesitzMonate")
      .textContent =
        daten.aktiveMonate.length;
  }

  if ($("beduerfnisBesitzTage")) {
    $("beduerfnisBesitzTage")
      .textContent =
        daten.tage.length;
  }

  if ($("beduerfnisBesitzZeitraum")) {
    $("beduerfnisBesitzZeitraum")
      .textContent =
        `${datumDeutsch(
          datumZuISO(daten.start)
        )} – ${datumDeutsch(
          datumZuISO(daten.ende)
        )}`;
  }

  if ($("beduerfnisBesitzStatus")) {
    $("beduerfnisBesitzStatus")
      .textContent =
        "Besitz-Modus: Aktivitätsübersicht der letzten 24 Monate. Für den gesetzlichen Besitznachweis muss mit einer eigenen erlaubnispflichtigen Waffe geschossen worden sein. Das wird im Schießbuch derzeit noch nicht getrennt erfasst.";
  }
}

function aktualisiereBeduerfnis() {
  renderErwerb();
  renderBesitz();
}

/* =========================================================
   NEUES TRAINING – DISZIPLIN AUSWÄHLEN
   ========================================================= */

document
  .querySelectorAll(
    ".disziplin-auswahl-card"
  )
  .forEach(karte => {
    karte.addEventListener(
      "click",
      () => {
        const disziplin =
          karte.dataset.disziplin;

        trainingVorbereiten(
          disziplin
        );
      }
    );
  });

function trainingVorbereiten(
  disziplin
) {
  if ($("disziplin")) {
    $("disziplin").value =
      disziplin;
  }

  if ($("datum")) {
    $("datum").value =
      heuteISO();
  }

  if ($("waffenart")) {
    $("waffenart").value =
      "Kurzwaffe";
  }

  if ($("kaliber")) {
    $("kaliber").value =
      "9 mm";
  }

  trainingInBearbeitungId = null;

  if ($("waffe")) {
    $("waffe").value = "Vereinswaffe";
  }

  if ($("trainingSpeichern")) {
    $("trainingSpeichern").textContent = "TRAINING SPEICHERN";
  }

  if ($("notizen")) {
    $("notizen").value = "";
  }

  if (
    disziplin ===
    "Praezision"
  ) {
    $("formularTitel")
      .textContent =
        "Präzision";

    $("praezisionFelder")
      ?.classList.remove(
        "versteckt"
      );

    $("speedFelder")
      ?.classList.add(
        "versteckt"
      );

    $("fallscheibeFelder")
      ?.classList.add(
        "versteckt"
      );

    if ($("entfernung")) {
      $("entfernung").value =
        "25 m";
    }

    if ($("schuesse")) {
      $("schuesse").value = "50";
    }

    if ($("ringe")) {
      $("ringe").value = "";
    }

    aktualisierePraezision();
  }

  if (
    disziplin ===
    "Speedschiessen"
  ) {
    $("formularTitel")
      .textContent =
        "BDS 25 m Speed";

    $("praezisionFelder")
      ?.classList.add(
        "versteckt"
      );

    $("speedFelder")
      ?.classList.remove(
        "versteckt"
      );

    $("fallscheibeFelder")
      ?.classList.add(
        "versteckt"
      );

    if ($("speedSerien")) {
      $("speedSerien").value =
        "4";
    }

    baueSpeedSerien();
  }

  if (
    disziplin ===
    "Fallscheibe"
  ) {
    $("formularTitel")
      .textContent =
        "BDS 25 m Fallscheibe";

    $("praezisionFelder")
      ?.classList.add(
        "versteckt"
      );

    $("speedFelder")
      ?.classList.add(
        "versteckt"
      );

    $("fallscheibeFelder")
      ?.classList.remove(
        "versteckt"
      );

    if (
      $("fallscheibeSerien")
    ) {
      $("fallscheibeSerien")
        .value = "4";
    }

    baueFallscheibenSerien();
  }

  zeigeSeite(
    "trainingFormular"
  );
}

/* =========================================================
   WAFFENART / KALIBER
   ========================================================= */

$("waffenart")?.addEventListener(
  "change",
  () => {
    const art =
      $("waffenart").value;

    const disziplin =
      $("disziplin")?.value;

    if (art === "Langwaffe") {
      if ($("kaliber")) {
        $("kaliber").value =
          ".22 l.r.";
      }

      if (
        disziplin !==
        "Praezision"
      ) {
        alert(
          "Für deine .22-l.r.-Langwaffe verwenden wir im Schießbuch nur Präzision."
        );

        $("waffenart").value =
          "Kurzwaffe";
      }
    }

    if (
      disziplin ===
      "Fallscheibe"
    ) {
      baueFallscheibenSerien();
    }
  }
);

$("kaliber")?.addEventListener(
  "change",
  () => {
    if (
      $("waffenart")?.value ===
      "Langwaffe"
    ) {
      $("kaliber").value =
        ".22 l.r.";
    }

    if (
      $("disziplin")?.value ===
      "Fallscheibe"
    ) {
      baueFallscheibenSerien();
    }
  }
);

/* =========================================================
   PRÄZISION
   ========================================================= */

$("schuesse")?.addEventListener(
  "input",
  aktualisierePraezision
);

$("ringe")?.addEventListener(
  "input",
  aktualisierePraezision
);

function aktualisierePraezision() {
  const schuesse =
    zahl(
      $("schuesse")?.value
    );

  const ringe =
    zahl(
      $("ringe")?.value
    );

  const max =
    schuesse * 10;

  const prozent =
    max > 0
      ? (ringe / max) * 100
      : 0;

  if ($("liveAuswertung")) {
    if (!schuesse) {
      $("liveAuswertung")
        .innerHTML =
          "<strong>Auswertung:</strong> –";

      return;
    }

    $("liveAuswertung")
      .innerHTML =
        `<strong>${formatGanz(ringe)} / ${formatGanz(max)} Ringe</strong>` +
        `<br>${formatZahl(prozent, 1)} %`;
  }
}

/* =========================================================
   SPEED
   ========================================================= */

$("speedSerien")?.addEventListener(
  "change",
  baueSpeedSerien
);

function baueSpeedSerien() {
  const container =
    $("speedSerienContainer");

  if (!container) return;

  const anzahl =
    zahl(
      $("speedSerien")?.value,
      4
    );

  container.innerHTML = "";

  for (
    let serie = 1;
    serie <= anzahl;
    serie++
  ) {
    const karte =
      document.createElement(
        "div"
      );

    karte.className =
      "serie-karte";

    karte.innerHTML = `
      <div class="serie-titel">
        Serie ${serie}
      </div>

      <div class="speed-treffer-grid">

        ${[1, 2, 3, 4, 5].map(ziel => `
          <label class="speed-treffer-feld">
            <span>Ziel ${ziel}</span>

            <select
              class="speed-wert"
              data-serie="${serie}"
              data-ziel="${ziel}"
            >
              <option value="10">10</option>
              <option value="7">7</option>
              <option value="0">0</option>
            </select>
          </label>
        `).join("")}

      </div>

      <div class="speed-zeit-zeile">

        <label>
          Zeit
          <input
            type="number"
            class="speed-zeit"
            data-serie="${serie}"
            min="0"
            max="60"
            step="0.01"
            inputmode="decimal"
            placeholder="0,00"
          >
        </label>

        <div class="speed-ringe-anzeige">
          <span>Ringe</span>
          <strong class="speed-serie-ringe">50</strong>
        </div>

      </div>
    `;

    container.appendChild(
      karte
    );
  }

  container
    .querySelectorAll(
      "select, input"
    )
    .forEach(element => {
      element.addEventListener(
        "input",
        berechneSpeed
      );

      element.addEventListener(
        "change",
        berechneSpeed
      );
    });

  berechneSpeed();
}

function holeSpeedDaten() {
  const container =
    $("speedSerienContainer");

  if (!container) return [];

  const karten = [
    ...container.querySelectorAll(
      ".serie-karte"
    )
  ];

  return karten.map(
    (karte, index) => {
      const werte = [
        ...karte.querySelectorAll(
          ".speed-wert"
        )
      ].map(
        select =>
          zahl(select.value)
      );

      const zeit =
        zahl(
          karte.querySelector(
            ".speed-zeit"
          )?.value
        );

      const ringe =
        werte.reduce(
          (summe, wert) =>
            summe + wert,
          0
        );

      const treffer =
        werte.filter(
          wert => wert > 0
        ).length;

      return {
        serie: index + 1,
        werte,
        ringe,
        treffer,
        zeit
      };
    }
  );
}

function berechneSpeed() {
  const serien =
    holeSpeedDaten();

  let trefferGesamt = 0;
  let ringeGesamt = 0;
  let zeitGesamt = 0;

  serien.forEach(
    (serie, index) => {
      trefferGesamt +=
        serie.treffer;

      ringeGesamt +=
        serie.ringe;

      zeitGesamt +=
        serie.zeit;

      const karten =
        $("speedSerienContainer")
          ?.querySelectorAll(
            ".serie-karte"
          );

      const anzeige =
        karten?.[index]
          ?.querySelector(
            ".speed-serie-ringe"
          );

      if (anzeige) {
        anzeige.textContent =
          serie.ringe;
      }
    }
  );

  const zeitabzug =
    Math.floor(
      zeitGesamt +
      0.0000001
    );

  const ergebnis =
    ringeGesamt -
    zeitabzug;

  if (
    $("speedTrefferGesamt")
  ) {
    const maxTreffer =
      serien.length * 5;

    $("speedTrefferGesamt")
      .textContent =
        `${trefferGesamt} / ${maxTreffer}`;
  }

  if (
    $("speedRingeGesamt")
  ) {
    $("speedRingeGesamt")
      .textContent =
        ringeGesamt;
  }

  if (
    $("speedZeitGesamt")
  ) {
    $("speedZeitGesamt")
      .textContent =
        `${formatZahl(zeitGesamt)} s`;
  }

  if (
    $("speedZeitabzug")
  ) {
    $("speedZeitabzug")
      .textContent =
        zeitabzug;
  }

  if ($("speedErgebnis")) {
    $("speedErgebnis")
      .textContent =
        ergebnis;
  }

  return {
    serien,
    trefferGesamt,
    ringeGesamt,
    zeitGesamt,
    zeitabzug,
    ergebnis
  };
}

/* =========================================================
   FALLSCHEIBE
   ========================================================= */

$("fallscheibeSerien")
  ?.addEventListener(
    "change",
    baueFallscheibenSerien
  );

function maxFallscheibenSchuesse() {
  const kaliber =
    $("kaliber")?.value;

  return istKaliber22(
    kaliber
  )
    ? 10
    : 16;
}

function baueFallscheibenSerien() {
  const container =
    $("fallscheibeSerienContainer");

  if (!container) return;

  const anzahl =
    zahl(
      $("fallscheibeSerien")
        ?.value,
      4
    );

  const maxSchuesse =
    maxFallscheibenSchuesse();

  container.innerHTML = "";

  for (
    let serie = 1;
    serie <= anzahl;
    serie++
  ) {
    const karte =
      document.createElement(
        "div"
      );

    karte.className =
      "serie-karte";

    karte.innerHTML = `
      <div class="serie-titel">
        Serie ${serie}
      </div>

      <div class="serie-felder">

        <label class="serie-feld">
          <span>Zeit</span>

          <input
            type="number"
            class="fall-zeit"
            min="0"
            max="60"
            step="0.01"
            inputmode="decimal"
            placeholder="0,00"
          >
        </label>

        <label class="serie-feld">
          <span>Gefallen</span>

          <select class="fall-gefallen">
            <option value="5">5</option>
            <option value="4">4</option>
            <option value="3">3</option>
            <option value="2">2</option>
            <option value="1">1</option>
            <option value="0">0</option>
          </select>
        </label>

        <label class="serie-feld">
          <span>Schüsse</span>

          <input
            type="number"
            class="fall-schuesse"
            min="0"
            max="${maxSchuesse}"
            step="1"
            inputmode="numeric"
            placeholder="0"
          >
        </label>

      </div>

      <div class="strafzeit-anzeige">
        Strafzeit:
        <strong class="fall-serie-strafe">0 s</strong>
      </div>
    `;

    container.appendChild(
      karte
    );
  }

  container
    .querySelectorAll(
      "select, input"
    )
    .forEach(element => {
      element.addEventListener(
        "input",
        berechneFallscheibe
      );

      element.addEventListener(
        "change",
        berechneFallscheibe
      );
    });

  berechneFallscheibe();
}

function holeFallscheibenDaten() {
  const container =
    $("fallscheibeSerienContainer");

  if (!container) return [];

  const karten = [
    ...container.querySelectorAll(
      ".serie-karte"
    )
  ];

  return karten.map(
    (karte, index) => {
      const zeit =
        Math.min(
          60,
          Math.max(
            0,
            zahl(
              karte.querySelector(
                ".fall-zeit"
              )?.value
            )
          )
        );

      const gefallen =
        Math.min(
          5,
          Math.max(
            0,
            zahl(
              karte.querySelector(
                ".fall-gefallen"
              )?.value
            )
          )
        );

      const maxSchuesse =
        maxFallscheibenSchuesse();

      const schuesse =
        Math.min(
          maxSchuesse,
          Math.max(
            0,
            zahl(
              karte.querySelector(
                ".fall-schuesse"
              )?.value
            )
          )
        );

      const strafzeit =
        (5 - gefallen) * 10;

      return {
        serie: index + 1,
        zeit,
        gefallen,
        schuesse,
        strafzeit
      };
    }
  );
}

function berechneFallscheibe() {
  const serien =
    holeFallscheibenDaten();

  let gefallenGesamt = 0;
  let schuesseGesamt = 0;
  let zeitGesamt = 0;
  let strafzeit = 0;

  serien.forEach(
    (serie, index) => {
      gefallenGesamt +=
        serie.gefallen;

      schuesseGesamt +=
        serie.schuesse;

      zeitGesamt +=
        serie.zeit;

      strafzeit +=
        serie.strafzeit;

      const karten =
        $("fallscheibeSerienContainer")
          ?.querySelectorAll(
            ".serie-karte"
          );

      const anzeige =
        karten?.[index]
          ?.querySelector(
            ".fall-serie-strafe"
          );

      if (anzeige) {
        anzeige.textContent =
          `${serie.strafzeit} s`;
      }
    }
  );

  const gesamtzeit =
    zeitGesamt +
    strafzeit;

  if (
    $("fallscheibeGefallenGesamt")
  ) {
    const maxGefallen =
      serien.length * 5;

    $("fallscheibeGefallenGesamt")
      .textContent =
        `${gefallenGesamt} / ${maxGefallen}`;
  }

  if (
    $("fallscheibeSchuesseGesamt")
  ) {
    $("fallscheibeSchuesseGesamt")
      .textContent =
        schuesseGesamt;
  }

  if (
    $("fallscheibeZeitGesamt")
  ) {
    $("fallscheibeZeitGesamt")
      .textContent =
        `${formatZahl(zeitGesamt)} s`;
  }

  if (
    $("fallscheibeStrafzeit")
  ) {
    $("fallscheibeStrafzeit")
      .textContent =
        `${formatZahl(strafzeit, 0)} s`;
  }

  if (
    $("fallscheibeGesamtzeit")
  ) {
    $("fallscheibeGesamtzeit")
      .textContent =
        `${formatZahl(gesamtzeit)} s`;
  }

  return {
    serien,
    gefallenGesamt,
    schuesseGesamt,
    zeitGesamt,
    strafzeit,
    gesamtzeit
  };
}

/* =========================================================
   TRAINING SPEICHERN
   ========================================================= */

$("trainingSpeichern")
  ?.addEventListener(
    "click",
    trainingSpeichern
  );

function trainingSpeichern() {
  const disziplin =
    $("disziplin")?.value ||
    "Praezision";

  const datum =
    $("datum")?.value;

  if (!datum) {
    alert(
      "Bitte ein Datum auswählen."
    );

    return;
  }

  const vorhandenesTraining = trainingInBearbeitungId
    ? trainings.find(t => String(t.id) === String(trainingInBearbeitungId))
    : null;

  const basis = {
    id: vorhandenesTraining?.id || neueId(),
    datum,
    erstelltAm: vorhandenesTraining?.erstelltAm || new Date().toISOString(),
    geaendertAm: vorhandenesTraining ? new Date().toISOString() : undefined,
    disziplin,
    waffenart:
      $("waffenart")?.value ||
      "Kurzwaffe",
    kaliber:
      $("kaliber")?.value ||
      "9 mm",
    waffe:
      $("waffe")?.value ||
      "Vereinswaffe",
    notizen:
      $("notizen")?.value.trim() ||
      ""
  };

  let training;

  if (
    disziplin ===
    "Praezision"
  ) {
    const schuesse =
      zahl(
        $("schuesse")?.value
      );

    const ringe =
      zahl(
        $("ringe")?.value
      );

    const entfernung =
      parseInt($("entfernung")?.value, 10) || 25;

    if (schuesse <= 0) {
      alert(
        "Bitte die Anzahl der Schüsse eingeben."
      );

      return;
    }

    const maxRinge =
      schuesse * 10;

    if (
      ringe < 0 ||
      ringe > maxRinge
    ) {
      alert(
        `Bei ${schuesse} Schüssen sind maximal ${maxRinge} Ringe möglich.`
      );

      return;
    }

    training = {
      ...basis,
      entfernung,
      schuesse,
      ringe,
      maxRinge,
      prozent:
        (ringe / maxRinge) *
        100
    };
  }

  if (
    disziplin ===
    "Speedschiessen"
  ) {
    const auswertung =
      berechneSpeed();

    const zeitFehlt =
      auswertung.serien.some(
        serie =>
          serie.zeit <= 0
      );

    if (zeitFehlt) {
      alert(
        "Bitte für jede Speed-Serie eine Zeit eingeben."
      );

      return;
    }

    training = {
      ...basis,
      entfernung: 25,
      anzahlSerien:
        auswertung.serien.length,
      serien:
        auswertung.serien,
      trefferGesamt:
        auswertung.trefferGesamt,
      ringeGesamt:
        auswertung.ringeGesamt,
      zeitGesamt:
        auswertung.zeitGesamt,
      zeitabzug:
        auswertung.zeitabzug,
      ergebnis:
        auswertung.ergebnis
    };
  }

  if (
    disziplin ===
    "Fallscheibe"
  ) {
    const auswertung =
      berechneFallscheibe();

    const zeitFehlt =
      auswertung.serien.some(
        serie =>
          serie.zeit <= 0
      );

    if (zeitFehlt) {
      alert(
        "Bitte für jede Fallscheiben-Serie eine Zeit eingeben."
      );

      return;
    }

    training = {
      ...basis,
      entfernung: 25,
      anzahlSerien:
        auswertung.serien.length,
      serien:
        auswertung.serien,
      gefallenGesamt:
        auswertung.gefallenGesamt,
      trefferGesamt:
        auswertung.gefallenGesamt,
      schuesseGesamt:
        auswertung.schuesseGesamt,
      zeitGesamt:
        auswertung.zeitGesamt,
      strafzeit:
        auswertung.strafzeit,
      gesamtzeit:
        auswertung.gesamtzeit
    };
  }

  if (!training) return;

  if (vorhandenesTraining) {
    const index = trainings.findIndex(
      t => String(t.id) === String(vorhandenesTraining.id)
    );

    if (index >= 0) {
      trainings[index] = training;
    }
  } else {
    trainings.push(training);
  }

  speichereTrainings();
  aktualisiereAlles();

  const wurdeBearbeitet =
    Boolean(vorhandenesTraining);

  trainingInBearbeitungId = null;

  alert(
    wurdeBearbeitet
      ? "Training wurde aktualisiert. ✅"
      : "Training wurde gespeichert. 🎯"
  );

  zeigeSeite(
    wurdeBearbeitet
      ? "trainingsseite"
      : "startseite"
  );
}

/* =========================================================
   STARTSEITE
   ========================================================= */

function aktualisiereStartseite() {
  if ($("anzahlTrainings")) {
    $("anzahlTrainings")
      .textContent =
        trainings.length;
  }

  const disziplinen =
    new Set(
      trainings.map(
        normaleDisziplin
      )
    );

  if (
    $("anzahlDisziplinen")
  ) {
    $("anzahlDisziplinen")
      .textContent =
        disziplinen.size;
  }
}

/* =========================================================
   LEISTUNGEN
   ========================================================= */

function aktualisiereLeistungen() {
  const praezision =
    trainings.filter(
      t =>
        normaleDisziplin(t) ===
        "Praezision"
    );

  const speed =
    trainings.filter(
      t =>
        normaleDisziplin(t) ===
        "Speedschiessen"
    );

  const fall =
    trainings.filter(
      t =>
        normaleDisziplin(t) ===
        "Fallscheibe"
    );

  if (praezision.length) {
    const werte =
      praezision.map(
        praezisionProzent
      );

    const best =
      Math.max(...werte);

    const durchschnitt =
      werte.reduce(
        (a, b) => a + b,
        0
      ) / werte.length;

    $("homePraezisionBest")
      .textContent =
        `${formatZahl(best, 1)} %`;

    $("homePraezisionDurchschnitt")
      .textContent =
        `${formatZahl(durchschnitt, 1)} %`;
  } else {
    $("homePraezisionBest")
      .textContent = "–";

    $("homePraezisionDurchschnitt")
      .textContent = "–";
  }

  $("homePraezisionTrainings")
    .textContent =
      praezision.length;

  if (speed.length) {
    const werte =
      speed.map(
        speedErgebnisWert
      );

    const best =
      Math.max(...werte);

    const durchschnitt =
      werte.reduce(
        (a, b) => a + b,
        0
      ) / werte.length;

    $("homeSpeedBest")
      .textContent =
        formatZahl(
          best,
          0
        );

    $("homeSpeedDurchschnitt")
      .textContent =
        formatZahl(
          durchschnitt,
          1
        );
  } else {
    $("homeSpeedBest")
      .textContent = "–";

    $("homeSpeedDurchschnitt")
      .textContent = "–";
  }

  $("homeSpeedTrainings")
    .textContent =
      speed.length;

  if (fall.length) {
    const werte =
      fall.map(
        fallGesamtzeitWert
      );

    const best =
      Math.min(...werte);

    const durchschnitt =
      werte.reduce(
        (a, b) => a + b,
        0
      ) / werte.length;

    $("homeFallscheibeBest")
      .textContent =
        `${formatZahl(best)} s`;

    $("homeFallscheibeDurchschnitt")
      .textContent =
        `${formatZahl(durchschnitt)} s`;
  } else {
    $("homeFallscheibeBest")
      .textContent = "–";

    $("homeFallscheibeDurchschnitt")
      .textContent = "–";
  }

  $("homeFallscheibeTrainings")
    .textContent =
      fall.length;

  aktualisiereLetztesTraining();
}

/* =========================================================
   LETZTES TRAINING
   ========================================================= */

function sortierteTrainings() {
  return [...trainings]
    .sort(
      (a, b) => {
        const datumA =
          new Date(
            `${a.datum || "1970-01-01"}T12:00:00`
          ).getTime();

        const datumB =
          new Date(
            `${b.datum || "1970-01-01"}T12:00:00`
          ).getTime();

        if (
          datumB !== datumA
        ) {
          return (
            datumB -
            datumA
          );
        }

        return String(
          b.erstelltAm || ""
        ).localeCompare(
          String(
            a.erstelltAm || ""
          )
        );
      }
    );
}

function aktualisiereLetztesTraining() {
  const container =
    $("letztesTraining");

  if (!container) return;

  const daten =
    sortierteTrainings();

  if (!daten.length) {
    container.innerHTML =
      `<div class="leer-hinweis">Noch kein Training gespeichert.</div>`;

    return;
  }

  container.innerHTML =
    trainingKurzHTML(
      daten[0]
    );
}

/* =========================================================
   TRAINING DARSTELLEN
   ========================================================= */

function trainingErgebnisText(t) {
  const d =
    normaleDisziplin(t);

  if (
    d === "Praezision"
  ) {
    return (
      `${formatGanz(praezisionRinge(t))} Ringe · ` +
      `${formatZahl(praezisionProzent(t), 1)} %`
    );
  }

  if (
    d === "Speedschiessen"
  ) {
    return (
      `${formatGanz(speedErgebnisWert(t))} Punkte · ` +
      `${formatGanz(speedRingeWert(t))} Ringe · ` +
      `${formatZahl(speedZeitWert(t))} s`
    );
  }

  return (
    `${formatGanz(fallGefallenWert(t))} Scheiben · ` +
    `${formatZahl(fallGesamtzeitWert(t))} s`
  );
}

function trainingKurzHTML(t) {
  return `
    <div class="training-eintrag">

      <div class="training-kopf">
        <strong>${htmlSicher(disziplinName(t))}</strong>
        <span>${htmlSicher(datumDeutsch(t.datum))}</span>
      </div>

      <div class="training-ergebnis">
        ${htmlSicher(trainingErgebnisText(t))}
      </div>

      <div class="training-meta">
        ${htmlSicher(t.waffenart || "–")} ·
        ${htmlSicher(t.kaliber || "–")}
        ${t.waffe ? ` · ${htmlSicher(t.waffe)}` : ""}
      </div>

    </div>
  `;
}

/* =========================================================
   TRAININGSBUCH
   ========================================================= */

$("filter")?.addEventListener(
  "change",
  renderTrainingsbuch
);

$("filterDisziplin")
  ?.addEventListener(
    "change",
    renderTrainingsbuch
  );

function renderTrainingsbuch() {
  const container =
    $("trainingsListe");

  if (!container) return;

  let daten =
    sortierteTrainings();

  const bereich =
    $("filter")?.value ||
    "alle";

  const disziplinFilter =
    $("filterDisziplin")?.value ||
    "alle";

  if (
    bereich !== "alle"
  ) {
    daten =
      daten.filter(
        t =>
          trainingPasstZuBereich(
            t,
            bereich
          )
      );
  }

  if (
    disziplinFilter !==
    "alle"
  ) {
    daten =
      daten.filter(
        t =>
          normaleDisziplin(t) ===
          disziplinFilter
      );
  }

  if (!daten.length) {
    container.innerHTML = `
      <div class="leer-hinweis">
        Keine Trainings für diesen Filter vorhanden.
      </div>
    `;

    return;
  }

  container.innerHTML =
    daten
      .map(
        trainingVollHTML
      )
      .join("");

  container
    .querySelectorAll(
      "[data-loeschen]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          loescheTraining(
            button.dataset
              .loeschen
          );
        }
      );
    });

  container
    .querySelectorAll(
      "[data-bearbeiten]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          bearbeiteTraining(
            button.dataset
              .bearbeiten
          );
        }
      );
    });
}

function trainingVollHTML(t) {
  const d =
    normaleDisziplin(t);

  let details = "";

  if (
    d === "Praezision"
  ) {
    details = `
      <div class="training-details">
        <div>
          <span>Entfernung</span>
          <strong>${htmlSicher(t.entfernung ?? 25)} m</strong>
        </div>

        <div>
          <span>Schüsse</span>
          <strong>${formatGanz(praezisionSchuesse(t))}</strong>
        </div>

        <div>
          <span>Ringe</span>
          <strong>${formatGanz(praezisionRinge(t))}</strong>
        </div>

        <div>
          <span>Leistung</span>
          <strong>${formatZahl(praezisionProzent(t), 1)} %</strong>
        </div>
      </div>
    `;
  }

  if (
    d === "Speedschiessen"
  ) {
    details = `
      <div class="training-details">
        <div>
          <span>Ringe</span>
          <strong>${formatGanz(speedRingeWert(t))}</strong>
        </div>

        <div>
          <span>Zeit</span>
          <strong>${formatZahl(speedZeitWert(t))} s</strong>
        </div>

        <div>
          <span>Zeitabzug</span>
          <strong>${formatGanz(t.zeitabzug)}</strong>
        </div>

        <div>
          <span>Ergebnis</span>
          <strong>${formatGanz(speedErgebnisWert(t))}</strong>
        </div>
      </div>

      ${serienHTML(t)}
    `;
  }

  if (
    d === "Fallscheibe"
  ) {
    details = `
      <div class="training-details">
        <div>
          <span>Gefallen</span>
          <strong>${formatGanz(fallGefallenWert(t))}</strong>
        </div>

        <div>
          <span>Schüsse</span>
          <strong>${formatGanz(fallSchuesseWert(t))}</strong>
        </div>

        <div>
          <span>Strafzeit</span>
          <strong>${formatZahl(fallStrafzeitWert(t))} s</strong>
        </div>

        <div>
          <span>Gesamt</span>
          <strong>${formatZahl(fallGesamtzeitWert(t))} s</strong>
        </div>
      </div>

      ${serienHTML(t)}
    `;
  }

  return `
    <article class="training-eintrag">

      <div class="training-kopf">
        <strong>${htmlSicher(disziplinName(t))}</strong>
        <span>${htmlSicher(datumDeutsch(t.datum))}</span>
      </div>

      <div class="training-ergebnis">
        ${htmlSicher(trainingErgebnisText(t))}
      </div>

      <div class="training-meta">

              ${htmlSicher(t.waffenart || "–")} ·
        ${htmlSicher(t.kaliber || "–")}
        ${t.waffe ? ` · ${htmlSicher(t.waffe)}` : ""}
      </div>

      ${details}

      ${
        t.notizen
          ? `
            <div class="training-notizen">
              ${htmlSicher(t.notizen)}
            </div>
          `
          : ""
      }

      <div class="training-aktionen">
        <button
          type="button"
          class="bearbeiten"
          data-bearbeiten="${htmlSicher(t.id)}"
        >
          Training bearbeiten
        </button>

        <button
          type="button"
          class="loeschen"
          data-loeschen="${htmlSicher(t.id)}"
        >
          Training löschen
        </button>
      </div>

    </article>
  `;
}

function serienHTML(t) {
  if (
    !Array.isArray(t.serien) ||
    !t.serien.length
  ) {
    return "";
  }

  const d =
    normaleDisziplin(t);

  return `
    <div class="serien-details">

      ${t.serien.map((serie, index) => {
        if (
          d ===
          "Speedschiessen"
        ) {
          const werte =
            serie.werte ??
            serie.treffer ??
            [];

          return `
            <div class="serien-zeile">
              <strong>Serie ${index + 1}</strong>
              <span>
                ${
                  Array.isArray(
                    werte
                  )
                    ? werte.join(
                        " · "
                      )
                    : ""
                }
                · ${formatGanz(serie.ringe)} Ringe
                · ${formatZahl(serie.zeit)} s
              </span>
            </div>
          `;
        }

        return `
          <div class="serien-zeile">
            <strong>Serie ${index + 1}</strong>
            <span>
              ${formatGanz(
                serie.gefallen ??
                serie.treffer
              )}/5 gefallen
              · ${formatGanz(serie.schuesse)} Schüsse
              · ${formatZahl(serie.zeit)} s
              · +${formatZahl(serie.strafzeit, 0)} s
            </span>
          </div>
        `;
      }).join("")}

    </div>
  `;
}

/* =========================================================
   TRAINING BEARBEITEN
   ========================================================= */

function bearbeiteTraining(id) {
  const t = trainings.find(x => String(x.id) === String(id));
  if (!t) return;

  const d = normaleDisziplin(t);
  trainingVorbereiten(d);
  trainingInBearbeitungId = t.id;

  if ($("datum")) $("datum").value = t.datum || heuteISO();
  if ($("waffenart")) $("waffenart").value = t.waffenart || "Kurzwaffe";
  if ($("kaliber")) $("kaliber").value = t.kaliber || "9 mm";

  if ($("waffe")) {
    const alt = String(t.waffe || "").toLowerCase();

    $("waffe").value =
      alt.includes("verein")
        ? "Vereinswaffe"
        : "Private Waffe";
  }

  if ($("notizen")) {
    $("notizen").value =
      t.notizen || "";
  }

  if (d === "Praezision") {
    if ($("entfernung")) {
      $("entfernung").value =
        `${zahl(t.entfernung, 25)} m`;
    }

    if ($("schuesse")) {
      $("schuesse").value =
        praezisionSchuesse(t) || 50;
    }

    if ($("ringe")) {
      $("ringe").value =
        praezisionRinge(t);
    }

    aktualisierePraezision();
  }

  if (d === "Speedschiessen") {
    const anzahl =
      zahl(
        t.anzahlSerien,
        Array.isArray(t.serien)
          ? t.serien.length
          : 4
      ) || 4;

    if ($("speedSerien")) {
      $("speedSerien").value =
        String(anzahl);
    }

    baueSpeedSerien();

    const karten =
      $("speedSerienContainer")
        ?.querySelectorAll(
          ".serie-karte"
        ) || [];

    (t.serien || []).forEach(
      (serie, i) => {
        const karte =
          karten[i];

        if (!karte) return;

        const selects =
          karte.querySelectorAll(
            ".speed-wert"
          );

        const werte =
          serie.werte ??
          serie.treffer ??
          [];

        selects.forEach(
          (select, j) => {
            if (
              werte[j] !==
              undefined
            ) {
              select.value =
                String(
                  werte[j]
                );
            }
          }
        );

        const zeit =
          karte.querySelector(
            ".speed-zeit"
          );

        if (zeit) {
          zeit.value =
            serie.zeit ?? "";
        }
      }
    );

    berechneSpeed();
  }

  if (d === "Fallscheibe") {
    const anzahl =
      zahl(
        t.anzahlSerien,
        Array.isArray(t.serien)
          ? t.serien.length
          : 4
      ) || 4;

    if ($("fallscheibeSerien")) {
      $("fallscheibeSerien")
        .value =
          String(anzahl);
    }

    baueFallscheibenSerien();

    const karten =
      $("fallscheibeSerienContainer")
        ?.querySelectorAll(
          ".serie-karte"
        ) || [];

    (t.serien || []).forEach(
      (serie, i) => {
        const karte =
          karten[i];

        if (!karte) return;

        const gefallen =
          karte.querySelector(
            ".fall-gefallen"
          );

        const schuesse =
          karte.querySelector(
            ".fall-schuesse"
          );

        const zeit =
          karte.querySelector(
            ".fall-zeit"
          );

        if (gefallen) {
          gefallen.value =
            serie.gefallen ??
            serie.treffer ??
            0;
        }

        if (schuesse) {
          schuesse.value =
            serie.schuesse ?? 0;
        }

        if (zeit) {
          zeit.value =
            serie.zeit ?? "";
        }
      }
    );

    berechneFallscheibe();
  }

  if ($("formularTitel")) {
    $("formularTitel")
      .textContent =
        `${disziplinName(t)} bearbeiten`;
  }

  if ($("trainingSpeichern")) {
    $("trainingSpeichern")
      .textContent =
        "ÄNDERUNGEN SPEICHERN";
  }

  zeigeSeite(
    "trainingFormular"
  );
}

/* =========================================================
   TRAINING LÖSCHEN
   ========================================================= */

function loescheTraining(id) {
  const training =
    trainings.find(
      t =>
        String(t.id) ===
        String(id)
    );

  if (!training) return;

  const bestaetigt =
    confirm(
      `${datumDeutsch(training.datum)} – ${disziplinName(training)} wirklich löschen?`
    );

  if (!bestaetigt) {
    return;
  }

  trainings =
    trainings.filter(
      t =>
        String(t.id) !==
        String(id)
    );

  speichereTrainings();

  aktualisiereAlles();

  renderTrainingsbuch();
}

/* =========================================================
   DIAGRAMM – FILTER
   ========================================================= */

$("diagrammBereich")
  ?.addEventListener(
    "change",
    () => {
      aktualisiereDiagrammFilter();
      zeichneDiagramm();
    }
  );

$("diagrammDisziplin")
  ?.addEventListener(
    "change",
    () => {
      aktualisiereDiagrammFilter();
      zeichneDiagramm();
    }
  );

$("diagrammEntfernung")
  ?.addEventListener(
    "change",
    zeichneDiagramm
  );

$("diagrammSchuesse")
  ?.addEventListener(
    "change",
    zeichneDiagramm
  );

function aktualisiereDiagrammFilter() {
  const disziplin =
    $("diagrammDisziplin")
      ?.value ||
    "Praezision";

  if (
    $("diagrammPraezisionFilter")
  ) {
    $("diagrammPraezisionFilter")
      .classList.toggle(
        "versteckt",
        disziplin !==
          "Praezision"
      );
  }
}

/* =========================================================
   DIAGRAMM DATEN FILTERN
   ========================================================= */

function diagrammDatenFiltern() {
  let daten =
    [...trainings];

  const bereich =
    $("diagrammBereich")
      ?.value ||
    "alle";

  const disziplin =
    $("diagrammDisziplin")
      ?.value ||
    "Praezision";

  daten =
    daten.filter(
      t =>
        normaleDisziplin(t) ===
        disziplin
    );

  if (
    bereich !== "alle"
  ) {
    daten =
      daten.filter(
        t =>
          trainingPasstZuBereich(
            t,
            bereich
          )
      );
  }

  if (
    disziplin ===
    "Praezision"
  ) {
    const entfernung =
      $("diagrammEntfernung")
        ?.value ||
      "alle";

    const schuesse =
      $("diagrammSchuesse")
        ?.value ||
      "alle";

    if (
      entfernung !== "alle"
    ) {
      daten =
        daten.filter(
          t =>
            String(
              t.entfernung ?? 25
            ) ===
            String(
              entfernung
            )
        );
    }

    if (
      schuesse !== "alle"
    ) {
      daten =
        daten.filter(
          t =>
            String(
              praezisionSchuesse(t)
            ) ===
            String(
              schuesse
            )
        );
    }
  }

  return daten.sort(
    (a, b) => {
      return (
        new Date(
          `${a.datum}T12:00:00`
        ) -
        new Date(
          `${b.datum}T12:00:00`
        )
      );
    }
  );
}

/* =========================================================
   DIAGRAMM ZEICHNEN
   ========================================================= */

function zeichneDiagramm() {
  const daten =
    diagrammDatenFiltern();

  const leer =
    $("diagrammLeer");

  const container =
    $("diagrammContainer");

  const svg =
    $("diagrammSvg");

  const punkte =
    $("diagrammPunkte");

  const datenText =
    $("diagrammDaten");

  if (
    !svg ||
    !punkte
  ) {
    return;
  }

  if (!daten.length) {
    leer?.classList.remove(
      "versteckt"
    );

    container?.classList.add(
      "versteckt"
    );

    if (datenText) {
      datenText.innerHTML = "";
    }

    aktualisiereDiagrammKennzahlen(
      []
    );

    return;
  }

  leer?.classList.add(
    "versteckt"
  );

  container?.classList.remove(
    "versteckt"
  );

  const disziplin =
    $("diagrammDisziplin")
      ?.value ||
    "Praezision";

  const werte =
    daten.map(t => {
      if (
        disziplin ===
        "Praezision"
      ) {
        return praezisionProzent(
          t
        );
      }

      if (
        disziplin ===
        "Speedschiessen"
      ) {
        return speedErgebnisWert(
          t
        );
      }

      return fallGesamtzeitWert(
        t
      );
    });

  aktualisiereDiagrammKennzahlen(
    werte
  );

  const breite = 1000;
  const hoehe = 400;
  const randX = 40;
  const randY = 30;

  let min =
    Math.min(...werte);

  let max =
    Math.max(...werte);

  if (
    disziplin ===
    "Praezision"
  ) {
    min = 0;
    max = 100;
  } else if (
    min === max
  ) {
    min -= 1;
    max += 1;
  } else {
    const puffer =
      (max - min) *
      0.15;

    min -= puffer;
    max += puffer;
  }

  const xFuerIndex =
    index => {
      if (
        werte.length === 1
      ) {
        return breite / 2;
      }

      return (
        randX +
        (
          index /
          (werte.length - 1)
        ) *
        (
          breite -
          randX * 2
        )
      );
    };

  const yFuerWert =
    wert => {
      const anteil =
        max === min
          ? 0.5
          : (
              wert -
              min
            ) /
            (
              max -
              min
            );

      return (
        hoehe -
        randY -
        anteil *
        (
          hoehe -
          randY * 2
        )
      );
    };

  const koordinaten =
    werte.map(
      (wert, index) => ({
        x:
          xFuerIndex(index),

        y:
          yFuerWert(wert),

        wert,

        training:
          daten[index]
      })
    );

  svg.setAttribute(
    "viewBox",
    `0 0 ${breite} ${hoehe}`
  );

  svg.innerHTML = `
    <polyline
      points="${koordinaten.map(p => `${p.x},${p.y}`).join(" ")}"
      fill="none"
      stroke="currentColor"
      stroke-width="6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  `;

  punkte.innerHTML =
    koordinaten.map(p => `
      <div
        class="diagramm-punkt"
        style="
          left:${(p.x / breite) * 100}%;
          top:${(p.y / hoehe) * 100}%;
        "
        title="${htmlSicher(
          `${datumDeutsch(p.training.datum)}: ${formatZahl(p.wert, 1)}`
        )}"
      ></div>
    `).join("");

  aktualisiereDiagrammSkala(
    min,
    max,
    disziplin
  );

  if (datenText) {
    datenText.innerHTML =
      daten
        .map(
          (t, index) => `
            <div class="diagramm-daten-zeile">
              <span>${htmlSicher(datumDeutsch(t.datum))}</span>
              <strong>
                ${htmlSicher(
                  diagrammWertText(
                    werte[index],
                    disziplin
                  )
                )}
              </strong>
            </div>
          `
        )
        .join("");
  }
}

/* =========================================================
   DIAGRAMM SKALA
   ========================================================= */

function aktualisiereDiagrammSkala(
  min,
  max,
  disziplin
) {
  const skala =
    $("diagrammSkala");

  if (!skala) return;

  const spans =
    skala.querySelectorAll(
      "span"
    );

  if (!spans.length) {
    return;
  }

  const werte = [
    max,
    min +
      (max - min) * 0.75,
    min +
      (max - min) * 0.5,
    min +
      (max - min) * 0.25,
    min
  ];

  spans.forEach(
    (span, index) => {
      if (
        werte[index] ===
        undefined
      ) {
        return;
      }

      if (
        disziplin ===
        "Praezision"
      ) {
        span.textContent =
          `${formatZahl(werte[index], 0)} %`;
      } else if (
        disziplin ===
        "Fallscheibe"
      ) {
        span.textContent =
          `${formatZahl(werte[index], 1)} s`;
      } else {
        span.textContent =
          formatZahl(
            werte[index],
            0
          );
      }
    }
  );
}

function diagrammWertText(
  wert,
  disziplin
) {
  if (
    disziplin ===
    "Praezision"
  ) {
    return `${formatZahl(wert, 1)} %`;
  }

  if (
    disziplin ===
    "Fallscheibe"
  ) {
    return `${formatZahl(wert)} s`;
  }

  return `${formatZahl(wert, 0)} Punkte`;
}

/* =========================================================
   DIAGRAMM KENNZAHLEN
   ========================================================= */

function aktualisiereDiagrammKennzahlen(
  werte
) {
  const disziplin =
    $("diagrammDisziplin")
      ?.value ||
    "Praezision";

  if (!werte.length) {
    if (
      $("diagrammLetzte")
    ) {
      $("diagrammLetzte")
        .textContent = "–";
    }

    if (
      $("diagrammBeste")
    ) {
      $("diagrammBeste")
        .textContent = "–";
    }

    if (
      $("diagrammDurchschnitt")
    ) {
      $("diagrammDurchschnitt")
        .textContent = "–";
    }

    if (
      $("diagrammAnzahl")
    ) {
      $("diagrammAnzahl")
        .textContent =
          "0 Trainings";
    }

    return;
  }

  const letzte =
    werte[
      werte.length - 1
    ];

  const beste =
    disziplin ===
    "Fallscheibe"
      ? Math.min(...werte)
      : Math.max(...werte);

  const durchschnitt =
    werte.reduce(
      (a, b) => a + b,
      0
    ) / werte.length;

  if (
    $("diagrammLetzte")
  ) {
    $("diagrammLetzte")
      .textContent =
        diagrammWertText(
          letzte,
          disziplin
        );
  }

  if (
    $("diagrammBeste")
  ) {
    $("diagrammBeste")
      .textContent =
        diagrammWertText(
          beste,
          disziplin
        );
  }

  if (
    $("diagrammDurchschnitt")
  ) {
    $("diagrammDurchschnitt")
      .textContent =
        diagrammWertText(
          durchschnitt,
          disziplin
        );
  }

  if (
    $("diagrammAnzahl")
  ) {
    $("diagrammAnzahl")
      .textContent =
        `${werte.length} ${
          werte.length === 1
            ? "Training"
            : "Trainings"
        }`;
  }

  if (
    $("diagrammLetzteTitel")
  ) {
    $("diagrammLetzteTitel")
      .textContent =
        "Letztes";
  }

  if (
    $("diagrammBesteTitel")
  ) {
    $("diagrammBesteTitel")
      .textContent =
        disziplin ===
        "Fallscheibe"
          ? "Beste Zeit"
          : "Bestwert";
  }

  if (
    $("diagrammDurchschnittTitel")
  ) {
    $("diagrammDurchschnittTitel")
      .textContent =
        "Durchschnitt";
  }
}

/* =========================================================
   BACKUP EXPORT
   ========================================================= */

$("backupExportieren")
  ?.addEventListener(
    "click",
    backupExportieren
  );

function backupExportieren() {
  const backup = {
    app:
      "MY SHOOTING LOG",
    version:
      BACKUP_VERSION,
    exportiertAm:
      new Date().toISOString(),
    trainings
  };

  const json =
    JSON.stringify(
      backup,
      null,
      2
    );

  const blob =
    new Blob(
      [json],
      {
        type:
          "application/json"
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      "a"
    );

  link.href = url;

  link.download =
    `my-shooting-log-backup-${heuteISO()}.json`;

  document.body.appendChild(
    link
  );

  link.click();

  link.remove();

  setTimeout(
    () => {
      URL.revokeObjectURL(
        url
      );
    },
    1000
  );

  if ($("backupStatus")) {
    $("backupStatus")
      .textContent =
        `${trainings.length} Trainings wurden exportiert.`;
  }
}

/* =========================================================
   BACKUP IMPORT
   ========================================================= */

$("backupImportieren")
  ?.addEventListener(
    "click",
    () => {
      $("backupDatei")
        ?.click();
    }
  );

$("backupDatei")
  ?.addEventListener(
    "change",
    backupImportieren
  );

async function backupImportieren(
  event
) {
  const datei =
    event.target.files?.[0];

  if (!datei) return;

  try {
    const text =
      await datei.text();

    const daten =
      JSON.parse(text);

    let importierteTrainings;

    if (
      Array.isArray(daten)
    ) {
      importierteTrainings =
        daten;
    } else if (
      Array.isArray(
        daten.trainings
      )
    ) {
      importierteTrainings =
        daten.trainings;
    } else {
      throw new Error(
        "Keine Trainings gefunden."
      );
    }

    importierteTrainings =
      importierteTrainings.map(
        normalisiereTraining
      );

    const frage =
      trainings.length
        ? `${importierteTrainings.length} Trainings gefunden.\n\nDie aktuell gespeicherten ${trainings.length} Trainings werden durch das Backup ersetzt.\n\nFortfahren?`
        : `${importierteTrainings.length} Trainings gefunden.\n\nBackup wiederherstellen?`;

    if (!confirm(frage)) {
      event.target.value = "";
      return;
    }

    trainings =
      importierteTrainings;

    speichereTrainings();

    aktualisiereAlles();

    if (
      $("backupStatus")
    ) {
      $("backupStatus")
        .textContent =
          `${trainings.length} Trainings erfolgreich wiederhergestellt.`;
    }

    alert(
      `${trainings.length} Trainings wurden wiederhergestellt. ✅`
    );
  } catch (fehler) {
    console.error(
      fehler
    );

    if (
      $("backupStatus")
    ) {
      $("backupStatus")
        .textContent =
          "Backup konnte nicht importiert werden.";
    }

    alert(
      "Die ausgewählte Datei ist kein gültiges Schießbuch-Backup."
    );
  }

  event.target.value = "";
}

/* =========================================================
   ALLES AKTUALISIEREN
   ========================================================= */

function aktualisiereAlles() {
  aktualisiereStartseite();
  aktualisiereLeistungen();
  renderTrainingsbuch();
  aktualisiereBeduerfnis();
}

/* =========================================================
   START
   ========================================================= */

/* =========================================================
   FOTOAUSWERTUNG – BETA
   ========================================================= */

function verbindeFotoEingabe(
  inputId,
  bildId,
  statusId
) {
  const input =
    $(inputId);

  const bild =
    $(bildId);

  const status =
    $(statusId);

  if (
    !input ||
    !bild ||
    !status
  ) {
    return;
  }

  input.addEventListener(
    "change",
    () => {
      const datei =
        input.files?.[0];

      if (!datei) return;

      const url =
        URL.createObjectURL(
          datei
        );

      bild.src = url;

      bild.classList.remove(
        "versteckt"
      );

      status.textContent =
        "Foto geladen. Die Kamera-Anbindung funktioniert. Die automatische Treffererkennung ist als Beta vorbereitet und wird mit echten Scheibenfotos kalibriert; bis dahin bitte die Werte darunter kontrollieren bzw. manuell eintragen.";
    }
  );
}

verbindeFotoEingabe(
  "praezisionFotoKamera",
  "praezisionFotoVorschau",
  "praezisionFotoStatus"
);

verbindeFotoEingabe(
  "praezisionFotoGalerie",
  "praezisionFotoVorschau",
  "praezisionFotoStatus"
);

verbindeFotoEingabe(
  "speedFotoKamera",
  "speedFotoVorschau",
  "speedFotoStatus"
);

verbindeFotoEingabe(
  "speedFotoGalerie",
  "speedFotoVorschau",
  "speedFotoStatus"
);

function initialisieren() {
  if ($("datum")) {
    $("datum").value =
      heuteISO();
  }

  aktualisiereAlles();

  aktualisiereDiagrammFilter();

  const gespeicherterModus =
    ladeBeduerfnisModus();

  setzeBeduerfnisModus(
    gespeicherterModus
  );

  zeigeSeite(
    "startseite"
  );

  console.log(
    `My Shooting Log gestartet – ${trainings.length} Trainings geladen.`
  );
}

initialisieren();
