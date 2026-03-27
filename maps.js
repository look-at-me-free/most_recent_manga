export async function renderMappedWork(ctx) {
  const {
    work,
    entry,
    mapUrl,
    reader,
    state,
    helpers
  } = ctx;

  if (!reader) {
    throw new Error("renderMappedWork(ctx): missing reader element.");
  }

  if (!helpers || typeof helpers.fetchJson !== "function") {
    throw new Error("renderMappedWork(ctx): missing helpers.fetchJson.");
  }

  const mapData = await helpers.fetchJson(mapUrl);
  const normalizedWork = normalizeMappedWork(mapData, work);

  const selectedEntry = resolveSelectedEntry(normalizedWork, entry);
  state.currentWork = normalizedWork;
  state.currentEntry = selectedEntry;
  state.currentItem = null;

  const workTitleEl = document.getElementById("workTitle");
  if (workTitleEl) {
    workTitleEl.textContent = selectedEntry
      ? `${normalizedWork.display} · ${selectedEntry.subtitle || prettyEntryLabel(selectedEntry.slug)}`
      : normalizedWork.display;
  }

  reader.innerHTML = "";

  const topAnchor = helpers.createEl("span", "reader-anchor");
  topAnchor.id = "readerTopAnchor";
  reader.appendChild(topAnchor);

  reader.appendChild(buildHero(normalizedWork, selectedEntry, helpers));
  reader.appendChild(buildSummaryBar(normalizedWork, helpers));

  const contentStartAnchor = helpers.createEl("span", "reader-anchor");
  contentStartAnchor.id = "readerContentStartAnchor";
  reader.appendChild(contentStartAnchor);

  const grouped = groupEntriesByVolume(normalizedWork.entries);

  if (!grouped.length) {
    const empty = helpers.createEl("div", "note", "This mapped work has no entries.");
    reader.appendChild(empty);
  } else {
    reader.appendChild(buildQuickJump(grouped, normalizedWork, selectedEntry, helpers));

    for (const group of grouped) {
      reader.appendChild(buildVolumeSection(group, normalizedWork, selectedEntry, helpers));
    }
  }

  const bottomAnchor = helpers.createEl("span", "reader-anchor");
  bottomAnchor.id = "readerBottomAnchor";
  reader.appendChild(bottomAnchor);
}

function normalizeMappedWork(mapData, fallbackWork) {
  const entries = Array.isArray(mapData?.entries) ? mapData.entries : [];

  return {
    id: mapData?.id ?? fallbackWork?.id ?? null,
    slug: String(mapData?.slug || fallbackWork?.slug || "").trim(),
    display: String(
      mapData?.display ||
      fallbackWork?.display ||
      fallbackWork?.slug ||
      "Untitled Work"
    ).trim(),
    top_pill: mapData?.top_pill ?? fallbackWork?.top_pill ?? true,
    source: mapData?.source ?? fallbackWork?.source ?? "",
    use_map: true,
    map_file: fallbackWork?.map_file || "",
    entries: entries
      .filter(Boolean)
      .map((entry, index) => ({
        slug: String(entry.slug || `entry_${index + 1}`).trim(),
        path: String(entry.path || "").trim(),
        type: String(entry.type || "chapter").trim(),
        subtitle: String(entry.subtitle || "").trim(),
        source: entry.source ?? mapData?.source ?? fallbackWork?.source ?? ""
      }))
  };
}

function resolveSelectedEntry(work, incomingEntry) {
  const entries = Array.isArray(work?.entries) ? work.entries : [];
  if (!entries.length) return null;

  const wanted = normalizeKey(incomingEntry?.slug || "");
  if (!wanted) return entries[0];

  return entries.find(e => normalizeKey(e.slug) === wanted) || entries[0];
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function prettyEntryLabel(slug) {
  return String(slug ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getVolumeNumberFromPath(path) {
  const match = String(path || "").match(/volume[_-]?(\d+)/i);
  return match ? Number(match[1]) : null;
}

function getChapterSortParts(entry) {
  const path = String(entry?.path || "");
  const match = path.match(/chapter[_-]?(\d+(?:\.\d+)?)/i);

  if (!match) {
    return { major: Number.MAX_SAFE_INTEGER, minor: 0, raw: Number.MAX_SAFE_INTEGER };
  }

  const raw = Number(match[1]);
  const parts = match[1].split(".");
  const major = Number(parts[0] || 0);
  const minor = Number(parts[1] || 0);

  return { major, minor, raw: Number.isFinite(raw) ? raw : Number.MAX_SAFE_INTEGER };
}

function groupEntriesByVolume(entries) {
  const map = new Map();

  for (const entry of entries || []) {
    const vol = getVolumeNumberFromPath(entry.path);
    const key = vol ?? "misc";

    if (!map.has(key)) {
      map.set(key, {
        volumeNumber: vol,
        label: vol ? `Volume ${vol}` : "Miscellaneous",
        entries: []
      });
    }

    map.get(key).entries.push(entry);
  }

  const groups = Array.from(map.values());

  groups.sort((a, b) => {
    const av = a.volumeNumber == null ? Number.MAX_SAFE_INTEGER : a.volumeNumber;
    const bv = b.volumeNumber == null ? Number.MAX_SAFE_INTEGER : b.volumeNumber;
    return av - bv;
  });

  for (const group of groups) {
    group.entries.sort((a, b) => {
      const ap = getChapterSortParts(a);
      const bp = getChapterSortParts(b);

      if (ap.major !== bp.major) return ap.major - bp.major;
      if (ap.minor !== bp.minor) return ap.minor - bp.minor;
      return String(a.subtitle || a.slug).localeCompare(String(b.subtitle || b.slug));
    });
  }

  return groups;
}

function buildHero(work, selectedEntry, helpers) {
  const shell = helpers.createEl("section", "mapped-work-hero");
  shell.innerHTML = `
    <div class="chapter-meta">
      <div class="meta-row">
        <div class="chapter-tag">${escapeHtml(work.display)}</div>
        <div class="chapter-tag">${work.entries.length} ${work.entries.length === 1 ? "entry" : "entries"}</div>
      </div>
      <div class="chapter-note">
        ${selectedEntry
          ? `Currently selected: ${escapeHtml(selectedEntry.subtitle || prettyEntryLabel(selectedEntry.slug))}`
          : "Choose a chapter block below."}
      </div>
    </div>
  `;
  return shell;
}

function buildSummaryBar(work, helpers) {
  const grouped = groupEntriesByVolume(work.entries);
  const shell = helpers.createEl("section", "traversal-shell top");
  const kicker = helpers.createEl("p", "traversal-kicker", "Mapped Work Layout");
  const bar = helpers.createEl("div", "traversal-bar compact");

  shell.appendChild(kicker);

  const totalVolumes = grouped.filter(g => g.volumeNumber != null).length;
  const totalEntries = work.entries.length;

  bar.appendChild(makeInfoPill(`Volumes: ${totalVolumes || 0}`));
  bar.appendChild(makeInfoPill(`Entries: ${totalEntries}`));

  if (grouped.length) {
    const first = grouped[0];
    const last = grouped[grouped.length - 1];
    bar.appendChild(makeInfoPill(`Start: ${first.label}`));
    bar.appendChild(makeInfoPill(`End: ${last.label}`));
  }

  shell.appendChild(bar);
  return shell;
}

function makeInfoPill(text) {
  const span = document.createElement("span");
  span.className = "traversal-pill current";
  span.textContent = text;
  return span;
}

function buildQuickJump(groups, work, selectedEntry, helpers) {
  const shell = helpers.createEl("section", "traversal-shell top");
  const kicker = helpers.createEl("p", "traversal-kicker", "Quick Volume Jump");
  const bar = helpers.createEl("div", "traversal-bar compact");

  shell.appendChild(kicker);

  for (const group of groups) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "traversal-pill";
    btn.textContent = group.label;
    btn.addEventListener("click", () => {
      const target = document.getElementById(`mapped-volume-${slugify(group.label)}`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    bar.appendChild(btn);
  }

  if (selectedEntry) {
    const currentBtn = document.createElement("button");
    currentBtn.type = "button";
    currentBtn.className = "traversal-pill current";
    currentBtn.textContent = `Open Current: ${selectedEntry.subtitle || prettyEntryLabel(selectedEntry.slug)}`;
    currentBtn.addEventListener("click", async () => {
      await helpers.switchEntry(work.slug, selectedEntry.slug, false, { actionSource: "mapped-current" });
    });
    bar.appendChild(currentBtn);
  }

  shell.appendChild(bar);
  return shell;
}

function buildVolumeSection(group, work, selectedEntry, helpers) {
  const section = helpers.createEl("section", "traversal-shell bottom");
  section.id = `mapped-volume-${slugify(group.label)}`;

  const kicker = helpers.createEl("p", "traversal-kicker", group.label);
  const prompt = helpers.createEl(
    "div",
    "continue-prompt",
    `${group.entries.length} ${group.entries.length === 1 ? "entry" : "entries"}`
  );
  const grid = helpers.createEl("div", "traversal-bar");

  section.appendChild(kicker);
  section.appendChild(prompt);

  for (const item of group.entries) {
    const isCurrent = normalizeKey(item.slug) === normalizeKey(selectedEntry?.slug);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `traversal-pill${isCurrent ? " current" : ""}`;
    btn.textContent = item.subtitle || prettyEntryLabel(item.slug);

    btn.addEventListener("click", async () => {
      await helpers.switchEntry(work.slug, item.slug, false, { actionSource: "mapped-entry" });
    });

    grid.appendChild(btn);
  }

  section.appendChild(grid);
  return section;
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
