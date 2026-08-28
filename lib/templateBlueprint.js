// Extracted once from the master template spreadsheet (see banner-import-architecture memory
// for how). Used to recreate the template's tabs natively via the Sheets API, so the
// professor's own drive.file-scoped token is sufficient - no drive.readonly, no copy of the
// actual template file needed, no fidelity loss from an XLSX round-trip.

const SOLID_BORDER = { style: "SOLID", width: 1, color: {}, colorStyle: { rgbColor: {} } };
const ALL_BORDERS = { top: SOLID_BORDER, bottom: SOLID_BORDER, left: SOLID_BORDER, right: SOLID_BORDER };

function textCell(value, extra = {}) {
    return {
        userEnteredValue: { stringValue: value },
        userEnteredFormat: { borders: ALL_BORDERS, textFormat: { fontSize: 17 }, ...extra }
    };
}

function formulaCell(formula, extra = {}) {
    return {
        userEnteredValue: { formulaValue: formula },
        userEnteredFormat: { borders: ALL_BORDERS, textFormat: { fontSize: 17 }, ...extra }
    };
}

const BOLD17 = { textFormat: { fontSize: 17, bold: true } };
const BOLD13 = { textFormat: { fontSize: 13, bold: true } };
const CENTER = { horizontalAlignment: "CENTER" };

// ===== template tab (rows are 1-indexed in comments, 0-indexed in ranges below) =====

const TEMPLATE_HEADER_ROW = [
    textCell("Name"),
    textCell("ID Number"),
    textCell("Present", CENTER),
    textCell("Notes", { horizontalAlignment: "LEFT" }),
    textCell("Photo URL"),
    {},
    textCell("Done?", { ...CENTER, ...BOLD17 }),
    {},
    textCell("Summary", { ...CENTER, ...BOLD17 })
];

// Column-by-column format for the student data rows (A-F), applied via repeatCell over rows 2-200.
const TEMPLATE_DATA_ROW_FORMAT = [
    { userEnteredFormat: { borders: ALL_BORDERS, textFormat: { fontSize: 17 } } }, // A Name
    { userEnteredFormat: { borders: ALL_BORDERS, textFormat: { fontSize: 17 } } }, // B ID Number
    { // C Present (dropdown)
        userEnteredFormat: { borders: ALL_BORDERS, textFormat: { fontSize: 17 } },
        dataValidation: {
            condition: {
                type: "ONE_OF_LIST",
                values: [{ userEnteredValue: "Present" }, { userEnteredValue: "Testing Center" }, { userEnteredValue: "Absent" }]
            },
            strict: true,
            showCustomUi: true
        }
    },
    { userEnteredFormat: { borders: ALL_BORDERS, horizontalAlignment: "LEFT", textFormat: { fontSize: 17 } } }, // D Notes
    { userEnteredFormat: { borders: ALL_BORDERS, textFormat: { fontSize: 17 } } }, // E Photo URL
    { userEnteredFormat: {} } // F (spacer, no border)
];

const TEMPLATE_DATA_ROW_START = 2; // 1-indexed
const TEMPLATE_DATA_ROW_END = 200;

const TEMPLATE_CHECKBOX_G2 = {
    userEnteredValue: { boolValue: false },
    userEnteredFormat: { borders: ALL_BORDERS, textFormat: { fontSize: 17 } },
    dataValidation: { condition: { type: "BOOLEAN" } }
};

// I2:J6 stats block
const TEMPLATE_STATS_ROWS = [
    [textCell("Present", BOLD17), formulaCell('=COUNTIF(C2:C,"Present")', BOLD17)],
    [textCell("Testing Center", BOLD17), formulaCell('=COUNTIF(C2:C,"Testing Center")', BOLD17)],
    [textCell("Total Enrollment", BOLD17), formulaCell("=COUNTA(A2:A)", BOLD17)],
    [textCell("Total Accounted", BOLD17), formulaCell("=J2+J3", BOLD17)],
    [textCell("Students Missing", BOLD17), formulaCell("=J4-J5", BOLD17)]
];

const TEMPLATE_MISSING_HEADER_I8 = textCell("Missing/Absent", { ...CENTER, ...BOLD13 });
const TEMPLATE_MISSING_FORMULA_I9 = formulaCell(
    "=IF(G2 = TRUE, QUERY(A2:C,\"SELECT A WHERE C = 'Absent' OR C = ''\"), \"\")",
    BOLD13
);

// Pre-formatted so the QUERY's spilled results (which can land on any of these rows)
// already look consistent instead of falling back to default formatting.
const TEMPLATE_MISSING_RESULTS_FORMAT = { userEnteredFormat: { borders: ALL_BORDERS, textFormat: { fontSize: 13, bold: true } } };
const TEMPLATE_MISSING_RESULTS_ROW_START = 9; // 1-indexed
const TEMPLATE_MISSING_RESULTS_ROW_END = 40;

const TEMPLATE_COLUMN_WIDTHS = [331, 155, 273, 273, 115, 100, 100, 100, 268, 100, 100, 100, 100, 100, 100];
const TEMPLATE_HIDDEN_COLUMNS = [4]; // Photo URL

// Approximates the "chip" dropdown look with conditional formatting on column C,
// since the actual chip display style / per-option colors aren't exposed by the
// public Sheets API (confirmed: DataValidationRule has only condition/inputMessage/
// showCustomUi/strict - no display-style or color field, for reading or writing).
const TEMPLATE_STATUS_COLORS = {
    blank: { red: 0.93, green: 0.93, blue: 0.93 },
    present: { red: 0.808, green: 0.918, blue: 0.839 },
    testingCenter: { red: 0.824, green: 0.890, blue: 0.988 },
    absent: { red: 0.980, green: 0.824, blue: 0.812 }
};

const TEMPLATE_MERGES = [
    { startRowIndex: 0, endRowIndex: 1, startColumnIndex: 8, endColumnIndex: 10 },
    { startRowIndex: 7, endRowIndex: 8, startColumnIndex: 8, endColumnIndex: 10 }
];

// ===== Summary tab =====

const SUMMARY_TITLE_A1 = textCell("Course Summary", { ...CENTER, ...BOLD17 });

const SUMMARY_STAT_LABELS = [
    [textCell("Present", BOLD17), formulaCell("=SUM(E3:E)", BOLD17)],
    [textCell("Testing Center", BOLD17), formulaCell("=SUM(F3:F)", BOLD17)],
    [textCell("Total Enrollment", BOLD17), formulaCell("=SUM(G3:G)", BOLD17)],
    [textCell("Accounted For", BOLD17), formulaCell("=SUM(H3:H)", BOLD17)],
    [textCell("Missing", BOLD17), formulaCell("=SUM(I3:I)", BOLD17)]
];

const SUMMARY_SECTIONS_HEADER_D2 = textCell("Sections", BOLD17);

// Format only (no value) for the D column section-name cells, rows 3-15.
const SUMMARY_D_CELL_FORMAT = {
    userEnteredFormat: { numberFormat: { type: "TEXT" }, borders: ALL_BORDERS, textFormat: { fontSize: 17, bold: true } }
};

const SUMMARY_SECTION_ROW_START = 3; // 1-indexed
const SUMMARY_SECTION_ROW_END = 15;

function summaryRowFormulas(row) {
    return ["J2", "J3", "J4", "J5", "J6"].map((cell) =>
        formulaCell(`=IFERROR(INDIRECT(IF(ISBLANK($D${row}),"",$D${row} & "!${cell}")),"")`)
    );
}

const SUMMARY_MERGES = [{ startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 }];

const SUMMARY_COLUMN_WIDTHS = [331, 120, 100, 157, 100, 100, 100, 100, 100];
const SUMMARY_HIDDEN_COLUMNS = [4, 5, 6, 7, 8]; // E-I: raw per-section lookups feeding the B-column sums

// ===== Testing Center tab =====

const TESTING_TITLE_A1 = textCell("Testing Center", { ...CENTER, ...BOLD13 });
const TESTING_HEADERS = [textCell("Student", BOLD13), textCell("ID", BOLD13)];
const TESTING_TOTAL_LABEL = textCell("Total at Center", { ...CENTER, textFormat: { fontSize: 12, bold: true } });
const TESTING_TOTAL_FORMULA = formulaCell(
    '=COUNTIF(ARRAYFORMULA(LEN(A3:A)), ">0")',
    { ...CENTER, textFormat: { fontSize: 12, bold: true } }
);
const TESTING_DATA_ROW_FORMAT = { userEnteredFormat: { borders: ALL_BORDERS, textFormat: { fontSize: 13, bold: true } } };
const TESTING_DATA_ROW_START = 3;
const TESTING_DATA_ROW_END = 200;
const TESTING_MERGES = [{ startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 }];
const TESTING_COLUMN_WIDTHS = [290, 175, 100, 100, 226, 226, 112, 104];

export {
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
};
