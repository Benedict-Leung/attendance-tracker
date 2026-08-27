export const RESERVED_TAB_NAMES = ["template", "Summary"];

export function sanitizeTabName(name) {
    let clean = (name || "Section").replace(/[:\\/?*[\]]/g, "-").trim();
    if (!clean) clean = "Section";
    return clean.slice(0, 95);
}

export function dedupeTabNames(list, reservedNames = []) {
    const seen = {};
    reservedNames.forEach((n) => { seen[n.toLowerCase()] = true; });
    return list.map((s) => {
        let name = s.tabName;
        let n = 1;
        while (seen[name.toLowerCase()]) {
            n++;
            name = `${s.tabName} (${n})`;
        }
        seen[name.toLowerCase()] = true;
        return { ...s, tabName: name };
    });
}
