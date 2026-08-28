import { getToken } from "next-auth/jwt";
import { RESERVED_TAB_NAMES, sanitizeTabName, dedupeTabNames } from "../../lib/sheetUtils";
import {
    TEMPLATE_HEADER_ROW,
    TEMPLATE_DATA_ROW_FORMAT,
    TEMPLATE_DATA_ROW_START,
    TEMPLATE_DATA_ROW_END,
    TEMPLATE_CHECKBOX_G2,
    TEMPLATE_STATS_ROWS,
    TEMPLATE_MISSING_HEADER_I8,
    TEMPLATE_MISSING_FORMULA_I9,
    TEMPLATE_MISSING_RESULTS_FORMAT,
    TEMPLATE_MISSING_RESULTS_ROW_START,
    TEMPLATE_MISSING_RESULTS_ROW_END,
    TEMPLATE_MERGES,
    TEMPLATE_COLUMN_WIDTHS,
    TEMPLATE_HIDDEN_COLUMNS,
    TEMPLATE_STATUS_COLORS,
    SUMMARY_TITLE_A1,
    SUMMARY_STAT_LABELS,
    SUMMARY_SECTIONS_HEADER_D2,
    SUMMARY_D_CELL_FORMAT,
    SUMMARY_SECTION_ROW_START,
    SUMMARY_SECTION_ROW_END,
    summaryRowFormulas,
    SUMMARY_MERGES,
    SUMMARY_COLUMN_WIDTHS,
    SUMMARY_HIDDEN_COLUMNS,
    TESTING_TITLE_A1,
    TESTING_HEADERS,
    TESTING_TOTAL_LABEL,
    TESTING_TOTAL_FORMULA,
    TESTING_DATA_ROW_FORMAT,
    TESTING_DATA_ROW_START,
    TESTING_DATA_ROW_END,
    TESTING_MERGES,
    TESTING_COLUMN_WIDTHS
} from "../../lib/templateBlueprint";

export const config = {
    api: { bodyParser: { sizeLimit: "25mb" } }
};

function range(sheetId, startRow, endRow, startCol, endCol) {
    return { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol };
}

function updateCellsRequest(sheetId, startRow, startCol, rows, fields) {
    return {
        updateCells: {
            range: range(sheetId, startRow, startRow + rows.length, startCol, startCol + (rows[0] ? rows[0].length : 0)),
            rows: rows.map((r) => ({ values: r })),
            fields
        }
    };
}

function repeatCellRequest(sheetId, startRow, endRow, col, cell, fields) {
    return {
        repeatCell: { range: range(sheetId, startRow, endRow, col, col + 1), cell, fields }
    };
}

function mergeRequests(sheetId, merges) {
    return merges.map((m) => ({ mergeCells: { range: { sheetId, ...m }, mergeType: "MERGE_ALL" } }));
}

function statusConditionalFormatRequests(sheetId) {
    const col2 = { sheetId, startRowIndex: TEMPLATE_DATA_ROW_START - 1, endRowIndex: TEMPLATE_DATA_ROW_END, startColumnIndex: 2, endColumnIndex: 3 };
    const rule = (condition, color) => ({
        addConditionalFormatRule: {
            rule: { ranges: [col2], booleanRule: { condition, format: { backgroundColor: color } } },
            index: 0
        }
    });
    return [
        rule({ type: "BLANK" }, TEMPLATE_STATUS_COLORS.blank),
        rule({ type: "TEXT_EQ", values: [{ userEnteredValue: "Present" }] }, TEMPLATE_STATUS_COLORS.present),
        rule({ type: "TEXT_EQ", values: [{ userEnteredValue: "Testing Center" }] }, TEMPLATE_STATUS_COLORS.testingCenter),
        rule({ type: "TEXT_EQ", values: [{ userEnteredValue: "Absent" }] }, TEMPLATE_STATUS_COLORS.absent)
    ];
}

function columnDimensionRequests(sheetId, widths, hiddenIndexes = []) {
    const hidden = new Set(hiddenIndexes);
    return widths.map((pixelSize, i) => ({
        updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
            properties: { pixelSize, hiddenByUser: hidden.has(i) },
            fields: "pixelSize,hiddenByUser"
        }
    }));
}

function buildTemplateTabRequests(sheetId) {
    const requests = [];

    requests.push(updateCellsRequest(sheetId, 0, 0, [TEMPLATE_HEADER_ROW], "userEnteredValue,userEnteredFormat"));

    const dataStart = TEMPLATE_DATA_ROW_START - 1;
    const dataEnd = TEMPLATE_DATA_ROW_END;
    TEMPLATE_DATA_ROW_FORMAT.forEach((cell, col) => {
        const fields = cell.dataValidation ? "userEnteredFormat,dataValidation" : "userEnteredFormat";
        requests.push(repeatCellRequest(sheetId, dataStart, dataEnd, col, cell, fields));
    });

    requests.push(updateCellsRequest(sheetId, 1, 6, [[TEMPLATE_CHECKBOX_G2]], "userEnteredValue,userEnteredFormat,dataValidation"));
    requests.push(updateCellsRequest(sheetId, 1, 8, TEMPLATE_STATS_ROWS, "userEnteredValue,userEnteredFormat"));
    requests.push(updateCellsRequest(sheetId, 7, 8, [[TEMPLATE_MISSING_HEADER_I8]], "userEnteredValue,userEnteredFormat"));
    requests.push(updateCellsRequest(sheetId, 8, 8, [[TEMPLATE_MISSING_FORMULA_I9]], "userEnteredValue,userEnteredFormat"));
    requests.push(repeatCellRequest(
        sheetId,
        TEMPLATE_MISSING_RESULTS_ROW_START - 1,
        TEMPLATE_MISSING_RESULTS_ROW_END,
        8,
        TEMPLATE_MISSING_RESULTS_FORMAT,
        "userEnteredFormat"
    ));
    requests.push(repeatCellRequest(
        sheetId,
        TEMPLATE_MISSING_RESULTS_ROW_START - 1,
        TEMPLATE_MISSING_RESULTS_ROW_END,
        9,
        TEMPLATE_MISSING_RESULTS_FORMAT,
        "userEnteredFormat"
    ));
    requests.push(...mergeRequests(sheetId, TEMPLATE_MERGES));
    requests.push(...columnDimensionRequests(sheetId, TEMPLATE_COLUMN_WIDTHS, TEMPLATE_HIDDEN_COLUMNS));
    requests.push(...statusConditionalFormatRequests(sheetId));

    return requests;
}

function buildSummaryTabRequests(sheetId) {
    const requests = [];

    requests.push(updateCellsRequest(sheetId, 0, 0, [[SUMMARY_TITLE_A1]], "userEnteredValue,userEnteredFormat"));
    requests.push(updateCellsRequest(sheetId, 1, 0, SUMMARY_STAT_LABELS, "userEnteredValue,userEnteredFormat"));
    requests.push(updateCellsRequest(sheetId, 1, 3, [[SUMMARY_SECTIONS_HEADER_D2]], "userEnteredValue,userEnteredFormat"));

    const startRow = SUMMARY_SECTION_ROW_START - 1;
    const endRow = SUMMARY_SECTION_ROW_END;
    requests.push(repeatCellRequest(sheetId, startRow, endRow, 3, SUMMARY_D_CELL_FORMAT, "userEnteredFormat"));

    const formulaRows = [];
    for (let row = SUMMARY_SECTION_ROW_START; row <= SUMMARY_SECTION_ROW_END; row++) {
        formulaRows.push(summaryRowFormulas(row));
    }
    requests.push(updateCellsRequest(sheetId, startRow, 4, formulaRows, "userEnteredValue,userEnteredFormat"));
    requests.push(...mergeRequests(sheetId, SUMMARY_MERGES));
    requests.push(...columnDimensionRequests(sheetId, SUMMARY_COLUMN_WIDTHS, SUMMARY_HIDDEN_COLUMNS));

    return requests;
}

function buildTestingCenterTabRequests(sheetId) {
    const requests = [];

    requests.push(updateCellsRequest(sheetId, 0, 0, [[TESTING_TITLE_A1]], "userEnteredValue,userEnteredFormat"));
    requests.push(updateCellsRequest(sheetId, 1, 0, [TESTING_HEADERS], "userEnteredValue,userEnteredFormat"));
    requests.push(updateCellsRequest(sheetId, 1, 4, [[TESTING_TOTAL_LABEL]], "userEnteredValue,userEnteredFormat"));
    requests.push(updateCellsRequest(sheetId, 2, 4, [[TESTING_TOTAL_FORMULA]], "userEnteredValue,userEnteredFormat"));

    const startRow = TESTING_DATA_ROW_START - 1;
    const endRow = TESTING_DATA_ROW_END;
    requests.push(repeatCellRequest(sheetId, startRow, endRow, 0, TESTING_DATA_ROW_FORMAT, "userEnteredFormat"));
    requests.push(repeatCellRequest(sheetId, startRow, endRow, 1, TESTING_DATA_ROW_FORMAT, "userEnteredFormat"));
    requests.push(...mergeRequests(sheetId, TESTING_MERGES));
    requests.push(...columnDimensionRequests(sheetId, TESTING_COLUMN_WIDTHS));

    return requests;
}

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
        const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
                properties: { title: (sheetTitle || "").trim() || "Attendance Tracker" },
                sheets: [
                    { properties: { title: "Summary" } },
                    { properties: { title: "Testing Center" } },
                    ...cleanSections.map((s) => ({ properties: { title: s.tabName } }))
                ]
            })
        });
        const createData = await createRes.json();
        if (createData.error) throw new Error(createData.error.message);
        const spreadsheetId = createData.spreadsheetId;

        const sheetIdByTitle = {};
        createData.sheets.forEach((sh) => { sheetIdByTitle[sh.properties.title] = sh.properties.sheetId; });

        const requests = [
            ...buildSummaryTabRequests(sheetIdByTitle["Summary"]),
            ...buildTestingCenterTabRequests(sheetIdByTitle["Testing Center"]),
            ...cleanSections.flatMap((s) => buildTemplateTabRequests(sheetIdByTitle[s.tabName]))
        ];

        const structureRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ requests })
        });
        const structureData = await structureRes.json();
        if (structureData.error) throw new Error(structureData.error.message);

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
            if (cell) {
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
