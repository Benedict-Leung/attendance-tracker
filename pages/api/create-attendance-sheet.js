import { getToken } from "next-auth/jwt";
import { RESERVED_TAB_NAMES, sanitizeTabName, dedupeTabNames } from "../../lib/sheetUtils";

export const config = {
    api: { bodyParser: { sizeLimit: "25mb" } }
};

// Not a secret — this file is shared "Anyone with the link", and its ID is meaningless
// without that. Hardcoded because production's env vars aren't editable by this app's maintainer.
const TEMPLATE_SPREADSHEET_ID = "1JIOv4pN5Gg6X31KEu0F9VwpvubAwP7YUr938wJeTsbs";

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const userToken = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!userToken?.accessToken) return res.status(401).json({ error: "Not signed in" });

    const { sheetTitle, sections } = req.body || {};
    if (!Array.isArray(sections) || sections.length === 0) {
        return res.status(400).json({ error: "No sections provided" });
    }

    const cleanSections = dedupeTabNames(
        sections.map((s) => ({ ...s, tabName: sanitizeTabName(s.tabName) })),
        RESERVED_TAB_NAMES
    );

    const authHeaders = { Authorization: `Bearer ${userToken.accessToken}`, "Content-Type": "application/json" };

    try {
        const copyRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${TEMPLATE_SPREADSHEET_ID}/copy`,
            {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify({ name: (sheetTitle || "").trim() || "Attendance Tracker" })
            }
        );
        const copyData = await copyRes.json();
        if (copyData.error) throw new Error(copyData.error.message);
        const spreadsheetId = copyData.id;

        const metaRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
            { headers: { Authorization: `Bearer ${userToken.accessToken}` } }
        );
        const metaData = await metaRes.json();
        if (metaData.error) throw new Error(metaData.error.message);

        const templateSheet = metaData.sheets.find((sh) => sh.properties.title === "template");
        if (!templateSheet) throw new Error('No tab named "template" was found in the template spreadsheet.');
        const templateSheetId = templateSheet.properties.sheetId;

        const duplicateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
                requests: [
                    ...cleanSections.map((section) => ({
                        duplicateSheet: { sourceSheetId: templateSheetId, newSheetName: section.tabName }
                    })),
                    { deleteSheet: { sheetId: templateSheetId } }
                ]
            })
        });
        const duplicateData = await duplicateRes.json();
        if (duplicateData.error) throw new Error(duplicateData.error.message);

        for (const section of cleanSections) {
            const encodedTab = encodeURIComponent(section.tabName);
            const students = Array.isArray(section.students) ? section.students : [];
            const nameIdRows = students.map((st) => [st.name, st.idNumber]);
            const photoRows = students.map((st) => [st.photoDataUri || ""]);

            const chunkSize = 50;
            for (let i = 0; i < students.length; i += chunkSize) {
                const startRow = i + 2;
                const endRow = startRow + Math.min(chunkSize, students.length - i) - 1;

                const abRes = await fetch(
                    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedTab}!A${startRow}:B${endRow}?valueInputOption=RAW`,
                    { method: "PUT", headers: authHeaders, body: JSON.stringify({ values: nameIdRows.slice(i, i + chunkSize) }) }
                );
                if (!abRes.ok) throw new Error(`Failed to write students for ${section.tabName}`);

                const eRes = await fetch(
                    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedTab}!E${startRow}:E${endRow}?valueInputOption=RAW`,
                    { method: "PUT", headers: authHeaders, body: JSON.stringify({ values: photoRows.slice(i, i + chunkSize) }) }
                );
                if (!eRes.ok) throw new Error(`Failed to write photos for ${section.tabName}`);
            }
        }

        const summaryGetRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Summary!D3:D1000`,
            { headers: { Authorization: `Bearer ${userToken.accessToken}` } }
        );
        const summaryGetData = await summaryGetRes.json();
        const existingRows = summaryGetData.values || [];
        let nextRow = 3;
        for (let i = 0; i < existingRows.length; i++) {
            const cell = existingRows[i] && existingRows[i][0];
            const isPlaceholder = cell && cell.trim().toLowerCase() === "template";
            if (cell && !isPlaceholder) {
                nextRow = 3 + i + 1;
            } else {
                break;
            }
        }
        const summaryEndRow = nextRow + cleanSections.length - 1;
        await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Summary!D${nextRow}:D${summaryEndRow}?valueInputOption=RAW`,
            {
                method: "PUT",
                headers: authHeaders,
                body: JSON.stringify({ values: cleanSections.map((s) => [s.tabName]) })
            }
        );

        return res.status(200).json({
            spreadsheetId,
            url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
