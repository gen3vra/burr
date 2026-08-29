const $ = (id) => document.getElementById(id);
const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULT_BG = "#eccf6f";

async function refreshCount() {
  const all = await browser.storage.local.get(null);
  const n = Object.keys(all).length;
  $("count").textContent = n === 1 ? "1 note stored" : `${n} notes stored`;
}

$("export-all").addEventListener("click", async () => {
  const all = await browser.storage.local.get(null);
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "burr-notes.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});

$("import").addEventListener("click", () => $("import-file").click());

$("import-file").addEventListener("change", async () => {
  const file = $("import-file").files[0];
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
  } catch {
    $("status").textContent = "Import failed: not a Burr export.";
    return;
  }
  const clean = {};
  let skipped = 0;
  for (const [k, v] of Object.entries(data)) {
    const domainKey = k.toLowerCase();
    if (domainKey.startsWith(".") && v && typeof v.text === "string") {
      clean[domainKey] = {
        text: v.text,
        color: HEX.test(v.color) ? v.color : DEFAULT_BG,
        createdAt: Number(v.createdAt) || Date.now(),
        updatedAt: Number(v.updatedAt) || Date.now(),
        remindAt: Number(v.remindAt) || null,
      };
    } else {
      skipped++;
    }
  }
  const n = Object.keys(clean).length;
  if (!n) {
    $("status").textContent = "Import failed: no Burr notes in that file.";
    return;
  }
  await browser.storage.local.set(clean);
  $("status").textContent = `Imported ${n} ${n === 1 ? "note" : "notes"}${skipped ? ` (${skipped} entries skipped)` : ""}.`;
  $("import-file").value = "";
  refreshCount();
});

refreshCount();
