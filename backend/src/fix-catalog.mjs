/** Public synthetic procedures. No outcome parameters or latent diagnosis live here. */
const procedures = {
  A: [
    ['Verify reference settings', 'Compare the reference settings with the operating checklist; restore the approved setting and verify stable output.'],
    ['Clean the observation path', 'Isolate the station, clean the observation path, and verify a stable reading before restart.'],
    ['Inspect the supply connection', 'Isolate the station, inspect and reseat the supply connection, then verify stable operation.'],
    ['Reinitialise the control sequence', 'Pause the station, reinitialise its control sequence, and verify a controlled cycle.'],
    ['Check alignment', 'Isolate the station, check and correct alignment against the reference marks, then run a controlled cycle.'],
    ['Verify input consistency', 'Inspect the input batch for consistency, replace an unsuitable input, and verify stable output.'],
  ],
  B: [
    ['Clear the transfer path', 'Isolate the station, remove an obstruction from the transfer path, then verify free movement.'],
    ['Align the guide', 'Check the guide against reference marks, adjust its position, and verify movement through a controlled cycle.'],
    ['Clean the detection point', 'Isolate the station, clean and verify the detection point, then test a controlled transfer.'],
    ['Inspect the drive coupling', 'Isolate the drive, inspect and reseat its coupling, then verify movement before restart.'],
    ['Reinitialise transfer control', 'Pause transfer control, reinitialise its sequence, and verify a controlled transfer.'],
    ['Verify input spacing', 'Check input spacing against the operating checklist, correct the spacing, and verify stable transfer.'],
  ],
  C: [
    ['Correct mechanical alignment', 'Isolate the mechanism, check alignment against reference marks, adjust it, and verify a controlled cycle.'],
    ['Clean the sensing path', 'Isolate the mechanism, clean and inspect its sensing path, then verify stable detection.'],
    ['Inspect the actuation connection', 'Isolate the mechanism, inspect and reseat the actuation connection, then verify a controlled cycle.'],
    ['Reinitialise the interlock sequence', 'Pause the mechanism, verify the interlock checklist, reinitialise the sequence, and test a controlled cycle.'],
    ['Inspect mounting security', 'Isolate the mechanism, inspect mounting security against the checklist, then verify stable movement.'],
    ['Verify operating reference', 'Compare the operating reference with the approved checklist, restore the setting, and verify stable operation.'],
  ],
};
export const FIX_CATALOG_VERSION = 'synthetic-fixes-v1';
export const FIX_CATALOG = Object.freeze(Object.fromEntries(Object.entries(procedures).map(([kind, rows]) => [kind,
  Object.freeze(rows.map(([title, steps], i) => Object.freeze({ id: `FIX-${kind}-${String(i + 1).padStart(2, '0')}`, title, steps }))),
])));
export function fixesFor(issueClass) { return FIX_CATALOG[issueClass] ?? []; }
export function fixById(issueClass, id) { return fixesFor(issueClass).find((row) => row.id === id) ?? null; }
export function validateFixCatalog(catalog = FIX_CATALOG) {
  for (const kind of ['A', 'B', 'C']) {
    const rows = catalog[kind];
    if (!Array.isArray(rows) || rows.length < 5 || rows.length > 6 || new Set(rows.map((r) => r.id)).size !== rows.length) throw new Error('Invalid fix catalog');
    for (const row of rows) if (!new RegExp(`^FIX-${kind}-\\d{2}$`).test(row.id) || !row.title || row.title.length > 80 || !row.steps || row.steps.length > 320 || Object.keys(row).sort().join() !== 'id,steps,title') throw new Error('Invalid fix procedure');
  }
  return true;
}
validateFixCatalog();
