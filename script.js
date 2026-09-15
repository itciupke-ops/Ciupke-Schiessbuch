/* =========================================================
   CIUPKE – MEIN SCHIESSBUCH
   script.js
   ========================================================= */

"use strict";

const STORAGE_KEY = "trainings";
const BACKUP_VERSION = 4;

let trainings = ladeTrainings();

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
  const lokal = new Date(jetzt.getTime() - offset * 60000);

  return lokal.toISOString().split("T")[0];
}

function neueId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* =========================================================
   DISZIPLIN NORMALISIEREN
   ========================================================= */

function normaleDisziplin(training) {
  const d = String(training?.disziplin ?? "").toLowerCase();

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
      ? normaleDisziplin({ disziplin: trainingOderName })
      : normaleDisziplin(trainingOderName);

  if (d === "Speedschiessen") return "BDS 25 m Speed";
  if (d === "Fallscheibe") return "BDS 25 m Fallscheibe";

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

  training.disziplin = normaleDisziplin(training);

  return training;
}

function ladeTrainings() {
  try {
    const roh = localStorage.getItem(STORAGE_KEY);

    if (!roh) return [];

    const daten = JSON.parse(roh);

    if (!Array.isArray(daten)) return [];

    return daten.map(normalisiereTraining);
  } catch (fehler) {
    console.error("Trainings konnten nicht geladen werden:", fehler);
    return [];
  }
}

function speichereTrainings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trainings));
}

/* =========================================================
   KOMPATIBILITÄTSWERTE
   ========================================================= */

function praezisionRinge(t) {
  return zahl(t.ringe ?? t.ringeGesamt ?? t.ergebnis);
}

function praezisionSchuesse(t) {
  return zahl(t.schuesse ?? t.schüsse ?? t.anzahlSchuesse);
}

function praezisionProzent(t) {
  if (Number.isFinite(Number(t.prozent))) {
    return zahl(t.prozent);
  }

  const ringe = praezisionRinge(t);
  const schuesse = praezisionSchuesse(t);

  if (!schuesse) return 0;

  return (ringe / (schuesse * 10)) * 100;
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

  if (direkt !== undefined && direkt !== null) {
    return zahl(direkt);
  }

  return fallReineZeitWert(t) + fallStrafzeitWert(t);
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
  "backupSeite"
];

function zeigeSeite(id) {
  seiten.forEach(seite => {
    const element = $(seite);

    if (!element) return;

    element.classList.toggle("versteckt", seite !== id);
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
}

/* =========================================================
   NAVIGATION VERKNÜPFEN
   ========================================================= */

$("neuesTraining")?.addEventListener("click", () => {
  zeigeSeite("disziplinAuswahl");
});

$("leistungenOeffnen")?.addEventListener("click", () => {
  zeigeSeite("leistungsseite");
});

$("entwicklungOeffnen")?.addEventListener("click", () => {
  zeigeSeite("entwicklungsseite");
});

$("trainingsbuchOeffnen")?.addEventListener("click", () => {
  zeigeSeite("trainingsseite");
});

$("backupOeffnen")?.addEventListener("click", () => {
  zeigeSeite("backupSeite");
});

$("disziplinAuswahlZurueck")?.addEventListener("click", () => {
  zeigeSeite("startseite");
});

$("leistungenZurueck")?.addEventListener("click", () => {
  zeigeSeite("startseite");
});

$("entwicklungZurueck")?.addEventListener("click", () => {
  zeigeSeite("startseite");
});

$("trainingZurueck")?.addEventListener("click", () => {
  zeigeSeite("startseite");
});

$("backupZurueck")?.addEventListener("click", () => {
  zeigeSeite("startseite");
});

$("zurueck")?.addEventListener("click", () => {
  zeigeSeite("disziplinAuswahl");
});

/* =========================================================
   NEUES TRAINING – DISZIPLIN AUSWÄHLEN
   ========================================================= */

document.querySelectorAll(".disziplin-auswahl-card").forEach(karte => {
  karte.addEventListener("click", () => {
    const disziplin = karte.dataset.disziplin;

    trainingVorbereiten(disziplin);
  });
});

function trainingVorbereiten(disziplin) {
  if ($("disziplin")) {
    $("disziplin").value = disziplin;
  }

  if ($("datum")) {
    $("datum").value = heuteISO();
  }

  if ($("waffenart")) {
    $("waffenart").value = "Kurzwaffe";
  }

  if ($("kaliber")) {
    $("kaliber").value = "9mm";
  }

  if ($("waffe")) {
    $("waffe").value = "";
  }

  if ($("notizen")) {
    $("notizen").value = "";
  }

  if (disziplin === "Praezision") {
    $("formularTitel").textContent = "Präzision";

    $("praezisionFelder")?.classList.remove("versteckt");
    $("speedFelder")?.classList.add("versteckt");
    $("fallscheibeFelder")?.classList.add("versteckt");

    if ($("entfernung")) $("entfernung").value = "25";
    if ($("schuesse")) $("schuesse").value = "";
    if ($("ringe")) $("ringe").value = "";

    aktualisierePraezision();
  }

  if (disziplin === "Speedschiessen") {
    $("formularTitel").textContent = "BDS 25 m Speed";

    $("praezisionFelder")?.classList.add("versteckt");
    $("speedFelder")?.classList.remove("versteckt");
    $("fallscheibeFelder")?.classList.add("versteckt");

    if ($("speedSerien")) {
      $("speedSerien").value = "4";
    }

    baueSpeedSerien();
  }

  if (disziplin === "Fallscheibe") {
    $("formularTitel").textContent = "BDS 25 m Fallscheibe";

    $("praezisionFelder")?.classList.add("versteckt");
    $("speedFelder")?.classList.add("versteckt");
    $("fallscheibeFelder")?.classList.remove("versteckt");

    if ($("fallscheibeSerien")) {
      $("fallscheibeSerien").value = "4";
    }

    baueFallscheibenSerien();
  }

  zeigeSeite("trainingFormular");
}

/* =========================================================
   WAFFENART / KALIBER
   ========================================================= */

$("waffenart")?.addEventListener("change", () => {
  const art = $("waffenart").value;
  const disziplin = $("disziplin")?.value;

  if (art === "Langwaffe") {
    if ($("kaliber")) {
      $("kaliber").value = ".22lr";
    }

    if (disziplin !== "Praezision") {
      alert(
        "Für deine .22-l.r.-Langwaffe verwenden wir im Schießbuch nur Präzision."
      );

      $("waffenart").value = "Kurzwaffe";
    }
  }

  if (disziplin === "Fallscheibe") {
    baueFallscheibenSerien();
  }
});

$("kaliber")?.addEventListener("change", () => {
  if ($("waffenart")?.value === "Langwaffe") {
    $("kaliber").value = ".22lr";
  }

  if ($("disziplin")?.value === "Fallscheibe") {
    baueFallscheibenSerien();
  }
});

/* =========================================================
   PRÄZISION
   ========================================================= */

$("schuesse")?.addEventListener("input", aktualisierePraezision);
$("ringe")?.addEventListener("input", aktualisierePraezision);

function aktualisierePraezision() {
  const schuesse = zahl($("schuesse")?.value);
  const ringe = zahl($("ringe")?.value);

  const max = schuesse * 10;
  const prozent = max > 0 ? (ringe / max) * 100 : 0;

  if ($("liveAuswertung")) {
    if (!schuesse) {
      $("liveAuswertung").innerHTML =
        "<strong>Auswertung:</strong> –";
      return;
    }

    $("liveAuswertung").innerHTML =
      `<strong>${formatGanz(ringe)} / ${formatGanz(max)} Ringe</strong>` +
      `<br>${formatZahl(prozent, 1)} %`;
  }
}

/* =========================================================
   SPEED
   ========================================================= */

$("speedSerien")?.addEventListener("change", baueSpeedSerien);

function baueSpeedSerien() {
  const container = $("speedSerienContainer");

  if (!container) return;

  const anzahl = zahl($("speedSerien")?.value, 4);

  container.innerHTML = "";

  for (let serie = 1; serie <= anzahl; serie++) {
    const karte = document.createElement("div");
    karte.className = "serie-karte";

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

    container.appendChild(karte);
  }

  container
    .querySelectorAll("select, input")
    .forEach(element => {
      element.addEventListener("input", berechneSpeed);
      element.addEventListener("change", berechneSpeed);
    });

  berechneSpeed();
}

function holeSpeedDaten() {
  const container = $("speedSerienContainer");

  if (!container) return [];

  const karten = [...container.querySelectorAll(".serie-karte")];

  return karten.map((karte, index) => {
    const werte = [...karte.querySelectorAll(".speed-wert")]
      .map(select => zahl(select.value));

    const zeit = zahl(
      karte.querySelector(".speed-zeit")?.value
    );

    const ringe = werte.reduce((summe, wert) => summe + wert, 0);

    const treffer = werte.filter(wert => wert > 0).length;

    return {
      serie: index + 1,
      werte,
      ringe,
      treffer,
      zeit
    };
  });
}

function berechneSpeed() {
  const serien = holeSpeedDaten();

  let trefferGesamt = 0;
  let ringeGesamt = 0;
  let zeitGesamt = 0;

  serien.forEach((serie, index) => {
    trefferGesamt += serie.treffer;
    ringeGesamt += serie.ringe;
    zeitGesamt += serie.zeit;

    const karten =
      $("speedSerienContainer")
        ?.querySelectorAll(".serie-karte");

    const anzeige =
      karten?.[index]
        ?.querySelector(".speed-serie-ringe");

    if (anzeige) {
      anzeige.textContent = serie.ringe;
    }
  });

  /*
    BDS:
    Gesamtzeit wird auf volle Sekunden nach unten
    abgerundet und von der Ringzahl abgezogen.
  */

  const zeitabzug = Math.floor(zeitGesamt + 0.0000001);
  const ergebnis = ringeGesamt - zeitabzug;

  if ($("speedTrefferGesamt")) {
    $("speedTrefferGesamt").textContent = trefferGesamt;
  }

  if ($("speedRingeGesamt")) {
    $("speedRingeGesamt").textContent = ringeGesamt;
  }

  if ($("speedZeitGesamt")) {
    $("speedZeitGesamt").textContent =
      `${formatZahl(zeitGesamt)} s`;
  }

  if ($("speedZeitabzug")) {
    $("speedZeitabzug").textContent = zeitabzug;
  }

  if ($("speedErgebnis")) {
    $("speedErgebnis").textContent = ergebnis;
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

$("fallscheibeSerien")?.addEventListener(
  "change",
  baueFallscheibenSerien
);

function maxFallscheibenSchuesse() {
  const kaliber = $("kaliber")?.value;

  /*
    Für unsere aktuelle Erfassung:
    9 mm Pistole = maximal 16 Schuss
    .22 l.r. Pistole = maximal 10 Schuss
  */

  return kaliber === ".22lr" ? 10 : 16;
}

function baueFallscheibenSerien() {
  const container = $("fallscheibeSerienContainer");

  if (!container) return;

  const anzahl = zahl($("fallscheibeSerien")?.value, 4);
  const maxSchuesse = maxFallscheibenSchuesse();

  container.innerHTML = "";

  for (let serie = 1; serie <= anzahl; serie++) {
    const karte = document.createElement("div");
    karte.className = "serie-karte";

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

    container.appendChild(karte);
  }

  container
    .querySelectorAll("select, input")
    .forEach(element => {
      element.addEventListener("input", berechneFallscheibe);
      element.addEventListener("change", berechneFallscheibe);
    });

  berechneFallscheibe();
}

function holeFallscheibenDaten() {
  const container = $("fallscheibeSerienContainer");

  if (!container) return [];

  const karten = [...container.querySelectorAll(".serie-karte")];

  return karten.map((karte, index) => {
    const zeit = Math.min(
      60,
      Math.max(
        0,
        zahl(karte.querySelector(".fall-zeit")?.value)
      )
    );

    const gefallen = Math.min(
      5,
      Math.max(
        0,
        zahl(karte.querySelector(".fall-gefallen")?.value)
      )
    );

    const maxSchuesse = maxFallscheibenSchuesse();

    const schuesse = Math.min(
      maxSchuesse,
      Math.max(
        0,
        zahl(karte.querySelector(".fall-schuesse")?.value)
      )
    );

    const strafzeit = (5 - gefallen) * 10;

    return {
      serie: index + 1,
      zeit,
      gefallen,
      schuesse,
      strafzeit
    };
  });
}

function berechneFallscheibe() {
  const serien = holeFallscheibenDaten();

  let gefallenGesamt = 0;
  let schuesseGesamt = 0;
  let zeitGesamt = 0;
  let strafzeit = 0;

  serien.forEach((serie, index) => {
    gefallenGesamt += serie.gefallen;
    schuesseGesamt += serie.schuesse;
    zeitGesamt += serie.zeit;
    strafzeit += serie.strafzeit;

    const karten =
      $("fallscheibeSerienContainer")
        ?.querySelectorAll(".serie-karte");

    const anzeige =
      karten?.[index]
        ?.querySelector(".fall-serie-strafe");

    if (anzeige) {
      anzeige.textContent = `${serie.strafzeit} s`;
    }
  });

  const gesamtzeit = zeitGesamt + strafzeit;

  if ($("fallscheibeGefallenGesamt")) {
    $("fallscheibeGefallenGesamt").textContent =
      gefallenGesamt;
  }

  if ($("fallscheibeSchuesseGesamt")) {
    $("fallscheibeSchuesseGesamt").textContent =
      schuesseGesamt;
  }

  if ($("fallscheibeZeitGesamt")) {
    $("fallscheibeZeitGesamt").textContent =
      `${formatZahl(zeitGesamt)} s`;
  }

  if ($("fallscheibeStrafzeit")) {
    $("fallscheibeStrafzeit").textContent =
      `${formatZahl(strafzeit, 0)} s`;
  }

  if ($("fallscheibeGesamtzeit")) {
    $("fallscheibeGesamtzeit").textContent =
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

$("trainingSpeichern")?.addEventListener(
  "click",
  trainingSpeichern
);

function trainingSpeichern() {
  const disziplin = $("disziplin")?.value || "Praezision";
  const datum = $("datum")?.value;

  if (!datum) {
    alert("Bitte ein Datum auswählen.");
    return;
  }

  const basis = {
    id: neueId(),
    datum,
    erstelltAm: new Date().toISOString(),
    disziplin,
    waffenart: $("waffenart")?.value || "Kurzwaffe",
    kaliber: $("kaliber")?.value || "9mm",
    waffe: $("waffe")?.value.trim() || "",
    notizen: $("notizen")?.value.trim() || ""
  };

  let training;

  /* ---------------- PRÄZISION ---------------- */

  if (disziplin === "Praezision") {
    const schuesse = zahl($("schuesse")?.value);
    const ringe = zahl($("ringe")?.value);
    const entfernung = zahl($("entfernung")?.value, 25);

    if (schuesse <= 0) {
      alert("Bitte die Anzahl der Schüsse eingeben.");
      return;
    }

    const maxRinge = schuesse * 10;

    if (ringe < 0 || ringe > maxRinge) {
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
      prozent: (ringe / maxRinge) * 100
    };
  }

  /* ---------------- SPEED ---------------- */

  if (disziplin === "Speedschiessen") {
    const auswertung = berechneSpeed();

    const zeitFehlt = auswertung.serien.some(
      serie => serie.zeit <= 0
    );

    if (zeitFehlt) {
      alert("Bitte für jede Speed-Serie eine Zeit eingeben.");
      return;
    }

    const zeitZuLang = auswertung.serien.some(
      serie => serie.zeit > 60
    );

    if (zeitZuLang) {
      alert("Eine Speed-Serie darf maximal 60 Sekunden dauern.");
      return;
    }

    training = {
      ...basis,
      entfernung: 25,
      anzahlSerien: auswertung.serien.length,
      serien: auswertung.serien,
      trefferGesamt: auswertung.trefferGesamt,
      ringeGesamt: auswertung.ringeGesamt,
      zeitGesamt: auswertung.zeitGesamt,
      zeitabzug: auswertung.zeitabzug,
      ergebnis: auswertung.ergebnis
    };
  }

  /* ---------------- FALLSCHEIBE ---------------- */

  if (disziplin === "Fallscheibe") {
    const auswertung = berechneFallscheibe();

    const zeitFehlt = auswertung.serien.some(
      serie => serie.zeit <= 0
    );

    if (zeitFehlt) {
      alert(
        "Bitte für jede Fallscheiben-Serie eine Zeit eingeben."
      );
      return;
    }

    const maxSchuesse = maxFallscheibenSchuesse();

    const zuVieleSchuesse = auswertung.serien.some(
      serie => serie.schuesse > maxSchuesse
    );

    if (zuVieleSchuesse) {
      alert(
        `Für dieses Kaliber sind maximal ${maxSchuesse} Schüsse pro Serie vorgesehen.`
      );
      return;
    }

    training = {
      ...basis,
      entfernung: 25,
      anzahlSerien: auswertung.serien.length,
      serien: auswertung.serien,
      gefallenGesamt: auswertung.gefallenGesamt,

      /*
        Zusätzlich gespeichert, damit ältere
        Versionen des Schießbuchs kompatibel bleiben.
      */
      trefferGesamt: auswertung.gefallenGesamt,

      schuesseGesamt: auswertung.schuesseGesamt,
      zeitGesamt: auswertung.zeitGesamt,
      strafzeit: auswertung.strafzeit,
      gesamtzeit: auswertung.gesamtzeit
    };
  }

  if (!training) return;

  trainings.push(training);

  speichereTrainings();

  aktualisiereAlles();

  alert("Training wurde gespeichert. 🎯");

  zeigeSeite("startseite");
}

/* =========================================================
   STARTSEITE
   ========================================================= */

function aktualisiereStartseite() {
  if ($("anzahlTrainings")) {
    $("anzahlTrainings").textContent = trainings.length;
  }

  const disziplinen = new Set(
    trainings.map(normaleDisziplin)
  );

  if ($("anzahlDisziplinen")) {
    $("anzahlDisziplinen").textContent = disziplinen.size;
  }
}

/* =========================================================
   LEISTUNGEN
   ========================================================= */

function aktualisiereLeistungen() {
  const praezision = trainings.filter(
    t => normaleDisziplin(t) === "Praezision"
  );

  const speed = trainings.filter(
    t => normaleDisziplin(t) === "Speedschiessen"
  );

  const fall = trainings.filter(
    t => normaleDisziplin(t) === "Fallscheibe"
  );

  /* ---------------- Präzision ---------------- */

  if (praezision.length) {
    const werte = praezision.map(praezisionProzent);

    const best = Math.max(...werte);
    const durchschnitt =
      werte.reduce((a, b) => a + b, 0) / werte.length;

    $("homePraezisionBest").textContent =
      `${formatZahl(best, 1)} %`;

    $("homePraezisionDurchschnitt").textContent =
      `${formatZahl(durchschnitt, 1)} %`;
  } else {
    $("homePraezisionBest").textContent = "–";
    $("homePraezisionDurchschnitt").textContent = "–";
  }

  $("homePraezisionTrainings").textContent =
    praezision.length;

  /* ---------------- Speed ---------------- */

  if (speed.length) {
    const werte = speed.map(speedErgebnisWert);

    const best = Math.max(...werte);
    const durchschnitt =
      werte.reduce((a, b) => a + b, 0) / werte.length;

    $("homeSpeedBest").textContent =
      formatZahl(best, 0);

    $("homeSpeedDurchschnitt").textContent =
      formatZahl(durchschnitt, 1);
  } else {
    $("homeSpeedBest").textContent = "–";
    $("homeSpeedDurchschnitt").textContent = "–";
  }

  $("homeSpeedTrainings").textContent = speed.length;

  /* ---------------- Fallscheibe ---------------- */

  if (fall.length) {
    const werte = fall.map(fallGesamtzeitWert);

    const best = Math.min(...werte);
    const durchschnitt =
      werte.reduce((a, b) => a + b, 0) / werte.length;

    $("homeFallscheibeBest").textContent =
      `${formatZahl(best)} s`;

    $("homeFallscheibeDurchschnitt").textContent =
      `${formatZahl(durchschnitt)} s`;
  } else {
    $("homeFallscheibeBest").textContent = "–";
    $("homeFallscheibeDurchschnitt").textContent = "–";
  }

  $("homeFallscheibeTrainings").textContent =
    fall.length;

  aktualisiereLetztesTraining();
}

/* =========================================================
   LETZTES TRAINING
   ========================================================= */

function sortierteTrainings() {
  return [...trainings].sort((a, b) => {
    const datumA = new Date(
      `${a.datum || "1970-01-01"}T12:00:00`
    ).getTime();

    const datumB = new Date(
      `${b.datum || "1970-01-01"}T12:00:00`
    ).getTime();

    if (datumB !== datumA) {
      return datumB - datumA;
    }

    return String(b.erstelltAm || "")
      .localeCompare(String(a.erstelltAm || ""));
  });
}

function aktualisiereLetztesTraining() {
  const container = $("letztesTraining");

  if (!container) return;

  const daten = sortierteTrainings();

  if (!daten.length) {
    container.innerHTML =
      `<div class="leer-hinweis">Noch kein Training gespeichert.</div>`;
    return;
  }

  container.innerHTML = trainingKurzHTML(daten[0]);
}

/* =========================================================
   TRAINING DARSTELLEN
   ========================================================= */

function trainingErgebnisText(t) {
  const d = normaleDisziplin(t);

  if (d === "Praezision") {
    return (
      `${formatGanz(praezisionRinge(t))} Ringe · ` +
      `${formatZahl(praezisionProzent(t), 1)} %`
    );
  }

  if (d === "Speedschiessen") {
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

$("filterDisziplin")?.addEventListener(
  "change",
  renderTrainingsbuch
);

function renderTrainingsbuch() {
  const container = $("trainingsListe");

  if (!container) return;

  let daten = sortierteTrainings();

  const bereich = $("filter")?.value || "alle";
  const disziplinFilter =
    $("filterDisziplin")?.value || "alle";

  if (bereich !== "alle") {
    daten = daten.filter(t => {
      const art = String(t.waffenart || "").toLowerCase();
      const kaliber = String(t.kaliber || "").toLowerCase();

      if (bereich === "kurzwaffe9") {
        return art.includes("kurz") && kaliber.includes("9");
      }

      if (bereich === "kurzwaffe22") {
        return art.includes("kurz") && kaliber.includes("22");
      }

      if (bereich === "langwaffe22") {
        return art.includes("lang") && kaliber.includes("22");
      }

      return true;
    });
  }

  if (disziplinFilter !== "alle") {
    daten = daten.filter(
      t => normaleDisziplin(t) === disziplinFilter
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

  container.innerHTML = daten
    .map(trainingVollHTML)
    .join("");

  container
    .querySelectorAll("[data-loeschen]")
    .forEach(button => {
      button.addEventListener("click", () => {
        loescheTraining(button.dataset.loeschen);
      });
    });
}

function trainingVollHTML(t) {
  const d = normaleDisziplin(t);

  let details = "";

  if (d === "Praezision") {
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

  if (d === "Speedschiessen") {
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

  if (d === "Fallscheibe") {
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

      <button
        type="button"
        class="loeschen-button"
        data-loeschen="${htmlSicher(t.id)}"
      >
        Training löschen
      </button>

    </article>
  `;
}

function serienHTML(t) {
  if (!Array.isArray(t.serien) || !t.serien.length) {
    return "";
  }

  const d = normaleDisziplin(t);

  return `
    <div class="serien-details">

      ${t.serien.map((serie, index) => {
        if (d === "Speedschiessen") {
          const werte =
            serie.werte ??
            serie.treffer ??
            [];

          return `
            <div class="serien-zeile">
              <strong>Serie ${index + 1}</strong>
              <span>
                ${Array.isArray(werte)
                  ? werte.join(" · ")
                  : ""}
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
                serie.gefallen ?? serie.treffer
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
   TRAINING LÖSCHEN
   ========================================================= */

function loescheTraining(id) {
  const training = trainings.find(
    t => String(t.id) === String(id)
  );

  if (!training) return;

  const bestaetigt = confirm(
    `${datumDeutsch(training.datum)} – ${disziplinName(training)} wirklich löschen?`
  );

  if (!bestaetigt) return;

  trainings = trainings.filter(
    t => String(t.id) !== String(id)
  );

  speichereTrainings();

  aktualisiereAlles();

  renderTrainingsbuch();
}

/* =========================================================
   DIAGRAMM – FILTER
   ========================================================= */

$("diagrammBereich")?.addEventListener(
  "change",
  () => {
    aktualisiereDiagrammFilter();
    zeichneDiagramm();
  }
);

$("diagrammDisziplin")?.addEventListener(
  "change",
  () => {
    aktualisiereDiagrammFilter();
    zeichneDiagramm();
  }
);

$("diagrammEntfernung")?.addEventListener(
  "change",
  zeichneDiagramm
);

$("diagrammSchuesse")?.addEventListener(
  "change",
  zeichneDiagramm
);

function aktualisiereDiagrammFilter() {
  const disziplin =
    $("diagrammDisziplin")?.value || "Praezision";

  if ($("diagrammPraezisionFilter")) {
    $("diagrammPraezisionFilter").classList.toggle(
      "versteckt",
      disziplin !== "Praezision"
    );
  }
}

/* =========================================================
   DIAGRAMM DATEN FILTERN
   ========================================================= */

function diagrammDatenFiltern() {
  let daten = [...trainings];

  const bereich =
    $("diagrammBereich")?.value || "alle";

  const disziplin =
    $("diagrammDisziplin")?.value || "Praezision";

  daten = daten.filter(
    t => normaleDisziplin(t) === disziplin
  );

  if (bereich !== "alle") {
    daten = daten.filter(t => {
      const art = String(t.waffenart || "").toLowerCase();
      const kaliber = String(t.kaliber || "").toLowerCase();

      if (bereich === "kurzwaffe9") {
        return art.includes("kurz") && kaliber.includes("9");
      }

      if (bereich === "kurzwaffe22") {
        return art.includes("kurz") && kaliber.includes("22");
      }

      if (bereich === "langwaffe22") {
        return art.includes("lang") && kaliber.includes("22");
      }

      return true;
    });
  }

  if (disziplin === "Praezision") {
    const entfernung =
      $("diagrammEntfernung")?.value || "alle";

    const schuesse =
      $("diagrammSchuesse")?.value || "alle";

    if (entfernung !== "alle") {
      daten = daten.filter(
        t => String(t.entfernung ?? 25) === String(entfernung)
      );
    }

    if (schuesse !== "alle") {
      daten = daten.filter(
        t => String(praezisionSchuesse(t)) === String(schuesse)
      );
    }
  }

  return daten.sort((a, b) => {
    return new Date(`${a.datum}T12:00:00`) -
           new Date(`${b.datum}T12:00:00`);
  });
}

/* =========================================================
   DIAGRAMM ZEICHNEN
   ========================================================= */

function zeichneDiagramm() {
  const daten = diagrammDatenFiltern();

  const leer = $("diagrammLeer");
  const container = $("diagrammContainer");
  const svg = $("diagrammSvg");
  const punkte = $("diagrammPunkte");
  const datenText = $("diagrammDaten");

  if (!svg || !punkte) return;

  if (!daten.length) {
    leer?.classList.remove("versteckt");
    container?.classList.add("versteckt");

    if (datenText) datenText.innerHTML = "";

    aktualisiereDiagrammKennzahlen([]);

    return;
  }

  leer?.classList.add("versteckt");
  container?.classList.remove("versteckt");

  const disziplin =
    $("diagrammDisziplin")?.value || "Praezision";

  const werte = daten.map(t => {
    if (disziplin === "Praezision") {
      return praezisionProzent(t);
    }

    if (disziplin === "Speedschiessen") {
      return speedErgebnisWert(t);
    }

    return fallGesamtzeitWert(t);
  });

  aktualisiereDiagrammKennzahlen(werte);

  /*
    SVG Koordinatensystem:
    Breite 1000
    Höhe   400
  */

  const breite = 1000;
  const hoehe = 400;
  const randX = 40;
  const randY = 30;

  let min = Math.min(...werte);
  let max = Math.max(...werte);

  if (disziplin === "Praezision") {
    min = 0;
    max = 100;
  } else if (min === max) {
    min -= 1;
    max += 1;
  } else {
    const puffer = (max - min) * 0.15;

    min -= puffer;
    max += puffer;
  }

  const xFuerIndex = index => {
    if (werte.length === 1) {
      return breite / 2;
    }

    return (
      randX +
      (index / (werte.length - 1)) *
      (breite - randX * 2)
    );
  };

  const yFuerWert = wert => {
    const anteil =
      max === min
        ? 0.5
        : (wert - min) / (max - min);

    return (
      hoehe -
      randY -
      anteil * (hoehe - randY * 2)
    );
  };

  const koordinaten = werte.map((wert, index) => ({
    x: xFuerIndex(index),
    y: yFuerWert(wert),
    wert,
    training: daten[index]
  }));

  svg.setAttribute("viewBox", `0 0 ${breite} ${hoehe}`);

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

  punkte.innerHTML = koordinaten.map(p => `
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

  aktualisiereDiagrammSkala(min, max, disziplin);

  if (datenText) {
    datenText.innerHTML = daten
      .map((t, index) => `
        <div class="diagramm-daten-zeile">
          <span>${htmlSicher(datumDeutsch(t.datum))}</span>
          <strong>
            ${htmlSicher(
              diagrammWertText(werte[index], disziplin)
            )}
          </strong>
        </div>
      `)
      .join("");
  }
}

/* =========================================================
   DIAGRAMM SKALA
   ========================================================= */

function aktualisiereDiagrammSkala(min, max, disziplin) {
  const skala = $("diagrammSkala");

  if (!skala) return;

  const spans = skala.querySelectorAll("span");

  if (!spans.length) return;

  const werte = [
    max,
    min + (max - min) * 0.75,
    min + (max - min) * 0.5,
    min + (max - min) * 0.25,
    min
  ];

  spans.forEach((span, index) => {
    if (werte[index] === undefined) return;

    if (disziplin === "Praezision") {
      span.textContent =
        `${formatZahl(werte[index], 0)} %`;
    } else if (disziplin === "Fallscheibe") {
      span.textContent =
        `${formatZahl(werte[index], 1)} s`;
    } else {
      span.textContent =
        formatZahl(werte[index], 0);
    }
  });
}

function diagrammWertText(wert, disziplin) {
  if (disziplin === "Praezision") {
    return `${formatZahl(wert, 1)} %`;
  }

  if (disziplin === "Fallscheibe") {
    return `${formatZahl(wert)} s`;
  }

  return `${formatZahl(wert, 0)} Punkte`;
}

/* =========================================================
   DIAGRAMM KENNZAHLEN
   ========================================================= */

function aktualisiereDiagrammKennzahlen(werte) {
  const disziplin =
    $("diagrammDisziplin")?.value || "Praezision";

  if (!werte.length) {
    if ($("diagrammLetzte")) $("diagrammLetzte").textContent = "–";
    if ($("diagrammBeste")) $("diagrammBeste").textContent = "–";
    if ($("diagrammDurchschnitt")) $("diagrammDurchschnitt").textContent = "–";
    if ($("diagrammAnzahl")) $("diagrammAnzahl").textContent = "0";

    return;
  }

  const letzte = werte[werte.length - 1];

  const beste =
    disziplin === "Fallscheibe"
      ? Math.min(...werte)
      : Math.max(...werte);

  const durchschnitt =
    werte.reduce((a, b) => a + b, 0) / werte.length;

  if ($("diagrammLetzte")) {
    $("diagrammLetzte").textContent =
      diagrammWertText(letzte, disziplin);
  }

  if ($("diagrammBeste")) {
    $("diagrammBeste").textContent =
      diagrammWertText(beste, disziplin);
  }

  if ($("diagrammDurchschnitt")) {
    $("diagrammDurchschnitt").textContent =
      diagrammWertText(durchschnitt, disziplin);
  }

  if ($("diagrammAnzahl")) {
    $("diagrammAnzahl").textContent = werte.length;
  }

  if ($("diagrammLetzteTitel")) {
    $("diagrammLetzteTitel").textContent =
      "Letztes";
  }

  if ($("diagrammBesteTitel")) {
    $("diagrammBesteTitel").textContent =
      disziplin === "Fallscheibe"
        ? "Beste Zeit"
        : "Bestwert";
  }

  if ($("diagrammDurchschnittTitel")) {
    $("diagrammDurchschnittTitel").textContent =
      "Durchschnitt";
  }
}

/* =========================================================
   BACKUP EXPORT
   ========================================================= */

$("backupExportieren")?.addEventListener(
  "click",
  backupExportieren
);

function backupExportieren() {
  const backup = {
    app: "CIUPKE – Mein Schießbuch",
    version: BACKUP_VERSION,
    exportiertAm: new Date().toISOString(),
    trainings
  };

  const json = JSON.stringify(backup, null, 2);

  const blob = new Blob(
    [json],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download =
    `ciupke-schiessbuch-backup-${heuteISO()}.json`;

  document.body.appendChild(link);

  link.click();

  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);

  if ($("backupStatus")) {
    $("backupStatus").textContent =
      `${trainings.length} Trainings wurden exportiert.`;
  }
}

/* =========================================================
   BACKUP IMPORT
   ========================================================= */

$("backupImportieren")?.addEventListener(
  "click",
  () => {
    $("backupDatei")?.click();
  }
);

$("backupDatei")?.addEventListener(
  "change",
  backupImportieren
);

async function backupImportieren(event) {
  const datei = event.target.files?.[0];

  if (!datei) return;

  try {
    const text = await datei.text();
    const daten = JSON.parse(text);

    let importierteTrainings;

    /*
      Unterstützt:
      - unsere Backup-Versionen
      - ältere Backups
      - direkt exportierte Arrays
    */

    if (Array.isArray(daten)) {
      importierteTrainings = daten;
    } else if (Array.isArray(daten.trainings)) {
      importierteTrainings = daten.trainings;
    } else {
      throw new Error("Keine Trainings gefunden.");
    }

    importierteTrainings =
      importierteTrainings.map(normalisiereTraining);

    const frage = trainings.length
      ? `${importierteTrainings.length} Trainings gefunden.\n\nDie aktuell gespeicherten ${trainings.length} Trainings werden durch das Backup ersetzt.\n\nFortfahren?`
      : `${importierteTrainings.length} Trainings gefunden.\n\nBackup wiederherstellen?`;

    if (!confirm(frage)) {
      event.target.value = "";
      return;
    }

    trainings = importierteTrainings;

    speichereTrainings();

    aktualisiereAlles();

    if ($("backupStatus")) {
      $("backupStatus").textContent =
        `${trainings.length} Trainings erfolgreich wiederhergestellt.`;
    }

    alert(
      `${trainings.length} Trainings wurden wiederhergestellt. ✅`
    );
  } catch (fehler) {
    console.error(fehler);

    if ($("backupStatus")) {
      $("backupStatus").textContent =
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
}

/* =========================================================
   START
   ========================================================= */

function initialisieren() {
  if ($("datum")) {
    $("datum").value = heuteISO();
  }

  aktualisiereAlles();

  aktualisiereDiagrammFilter();

  zeigeSeite("startseite");

  console.log(
    `CIUPKE Schießbuch gestartet – ${trainings.length} Trainings geladen.`
  );
}

initialisieren();