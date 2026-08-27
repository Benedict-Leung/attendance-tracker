"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { sanitizeTabName, dedupeTabNames } from "../lib/sheetUtils";

// ==========================================
// BANNER CAPTURE BOOKMARKLET
// Self-contained — runs inside the professor's authenticated Banner tab.
// Must not reference anything outside this function (no React state/props).
// ==========================================
async function bannerCaptureBookmarklet() {
    try {
        const hashMatch = location.hash.match(/#!\/(\d+)\/(\d+)\/courseDetails\/classList/);
        if (!hashMatch) {
            alert("Open a specific section's Class List page in Banner first (Course List > pick a section), then click this bookmarklet again.");
            return;
        }
        const term = hashMatch[1];
        const crn = hashMatch[2];

        const statusBox = document.createElement("div");
        statusBox.style.cssText = "position:fixed;top:16px;right:16px;z-index:999999;background:#111827;color:#fff;padding:10px 16px;border-radius:8px;font:14px/1.4 sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:280px;";
        statusBox.textContent = "Scanning roster...";
        document.body.appendChild(statusBox);
        const setStatus = (text) => { statusBox.textContent = text; };
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));

        const findButtonByLabel = (matches) => {
            const candidates = Array.from(document.querySelectorAll("button, a"));
            return candidates.find((el) => {
                const label = (el.getAttribute("aria-label") || el.textContent || "").trim().toLowerCase();
                if (!matches(label)) return false;
                const disabled = el.disabled || el.getAttribute("aria-disabled") === "true" || el.classList.contains("disabled");
                return !disabled;
            }) || null;
        };

        const findNextPageButton = () => findButtonByLabel((label) =>
            label === "next" || label === "next page" || label.includes("next page"));

        const findPrevPageButton = () => findButtonByLabel((label) =>
            label === "previous" || label === "prev" || label === "previous page" || label.includes("previous page"));

        const findFirstPageButton = () => findButtonByLabel((label) =>
            label === "first" || label === "first page" || label.includes("first page"));

        const goToFirstPage = async () => {
            const firstBtn = findFirstPageButton();
            if (firstBtn) {
                firstBtn.click();
                await wait(800);
                return;
            }
            for (let iter = 0; iter < 100; iter++) {
                const prevBtn = findPrevPageButton();
                if (!prevBtn) break;
                prevBtn.click();
                await wait(800);
            }
        };

        const extractName = (anchor) => {
            const clone = anchor.cloneNode(true);
            clone.querySelectorAll(".sr-only").forEach((el) => el.remove());
            return clone.textContent.replace(/\s+/g, " ").trim();
        };

        const getRows = () => Array.from(document.querySelectorAll('td[data-name="bannerId"] .ng-binding'))
            .map((el) => el.closest("tr"))
            .filter(Boolean);

        const collectAllRows = async () => {
            const byId = new Map();
            let noGrowthRounds = 0;
            for (let iter = 0; iter < 100; iter++) {
                let added = 0;
                getRows().forEach((row) => {
                    const idEl = row.querySelector('td[data-name="bannerId"] .ng-binding');
                    const idText = idEl ? idEl.textContent.trim() : "";
                    if (idText && /^\d{6,10}$/.test(idText) && !byId.has(idText)) {
                        byId.set(idText, row);
                        added++;
                    }
                });
                setStatus(`Found ${byId.size} students so far...`);

                const nextBtn = findNextPageButton();
                if (nextBtn) {
                    nextBtn.click();
                    await wait(800);
                    noGrowthRounds = 0;
                    continue;
                }
                if (added === 0) {
                    window.scrollBy(0, 2000);
                    await wait(500);
                    noGrowthRounds++;
                    if (noGrowthRounds >= 2) break;
                } else {
                    noGrowthRounds = 0;
                }
            }
            return Array.from(byId.values());
        };

        const courseTitleEl = document.querySelector('[ng-bind="appData.courseInfo.courseTitleComposite"]');
        const composite = (courseTitleEl && courseTitleEl.textContent.trim()) || "";
        const compositeMatch = composite.match(/([A-Z]{2,5}\s?\d{3,4}[A-Z]?)\s+(\d{3})\s*$/);
        const courseCode = compositeMatch ? compositeMatch[1].replace(/\s+/g, " ").trim() : "";
        const sectionNumber = compositeMatch ? compositeMatch[2] : crn.slice(-3);

        setStatus("Returning to first page...");
        await goToFirstPage();

        const rows = await collectAllRows();
        if (rows.length === 0) {
            statusBox.remove();
            alert("No students found on this page. Make sure the class list has fully loaded, then try again.");
            return;
        }

        const students = [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            setStatus(`Capturing ${i + 1} of ${rows.length}...`);

            const idEl = row.querySelector('td[data-name="bannerId"] .ng-binding');
            const nameAnchor = row.querySelector('[data-name="studentName"] a.hyper-link');
            const img = row.querySelector('[data-name="studentPicture"] img');

            const idNumber = idEl ? idEl.textContent.trim() : "";
            const name = nameAnchor ? extractName(nameAnchor) : "";
            let photoDataUri = "";

            if (img && img.src) {
                try {
                    const res = await fetch(img.src, { credentials: "include" });
                    const blob = await res.blob();
                    const bitmap = await createImageBitmap(blob);
                    const canvas = document.createElement("canvas");
                    canvas.width = 120;
                    canvas.height = 150;
                    const ctx = canvas.getContext("2d");
                    const scale = Math.max(120 / bitmap.width, 150 / bitmap.height);
                    const w = bitmap.width * scale;
                    const h = bitmap.height * scale;
                    ctx.drawImage(bitmap, (120 - w) / 2, (150 - h) / 2, w, h);
                    photoDataUri = canvas.toDataURL("image/jpeg", 0.65);
                } catch (e) {
                    photoDataUri = "";
                }
            }

            if (idNumber && name) {
                students.push({ name, idNumber, photoDataUri });
            }
        }

        setStatus(`Done! Downloading ${students.length} students...`);
        const payload = { term, crn, courseCode, sectionNumber, capturedAt: new Date().toISOString(), students };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `banner-${crn}-${term}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        setTimeout(() => statusBox.remove(), 2500);
    } catch (err) {
        alert("Banner capture failed: " + (err && err.message ? err.message : err));
    }
}

const BOOKMARKLET_HREF = `javascript:(${bannerCaptureBookmarklet.toString()})();`;

function escapeHtmlAttr(str) {
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// Rendered via dangerouslySetInnerHTML, not JSX props — React 19 blocks javascript: hrefs
// (on both click and drag) when it owns the anchor's href prop directly. Raw innerHTML
// bypasses that sanitization since the browser's HTML parser sets the attribute, not React.
const BOOKMARKLET_ANCHOR_HTML = `<a href="${escapeHtmlAttr(BOOKMARKLET_HREF)}" class="bookmarklet-link" draggable="true">📋 Capture Banner Roster</a>`;

const BANNER_COURSE_LIST_URL = "https://ssp.mycampus.ca/StudentSelfService/ssb/classListApp/classListPage?mepCode=UOIT#!/allTerms/courseList";

const RESERVED_TAB_NAMES = ["template", "Summary"];

export default function CreateAttendanceSheet() {
    const { data: session, status } = useSession();
    const hasSheetsScope = session?.scope?.includes("https://www.googleapis.com/auth/drive.file")
        && session?.scope?.includes("https://www.googleapis.com/auth/drive.readonly");

    const [step, setStep] = useState(1);
    const [loadingMsg, setLoadingMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState(null);

    const [sections, setSections] = useState([]);
    const [sheetTitle, setSheetTitle] = useState("");
    const [destFolderId, setDestFolderId] = useState("");
    const [destFolderName, setDestFolderName] = useState("");
    const [resultUrl, setResultUrl] = useState("");
    const [copied, setCopied] = useState(false);
    const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);

    useEffect(() => {
        if (titleManuallyEdited || sections.length === 0) return;
        const uniqueCodes = [...new Set(sections.map((s) => s.courseCode).filter(Boolean))];
        setSheetTitle(uniqueCodes.length > 0 ? `Attendance Tracker - ${uniqueCodes.join(", ")}` : "Attendance Tracker");
    }, [sections, titleManuallyEdited]);

    const fileInputRef = useRef(null);

    const copyBookmarklet = async () => {
        try {
            await navigator.clipboard.writeText(BOOKMARKLET_HREF);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (e) {
            setErrorMsg("Couldn't copy automatically — select the code below and copy it manually.");
        }
    };

    const elevatePermissions = () => {
        signIn("google", undefined, {
            scope: "openid email profile https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly"
        });
    };

    const openFolderPicker = () => {
        if (!window.google || !window.google.picker || !session?.accessToken) {
            return setErrorMsg("Picker API is still loading. Please try again in a moment.");
        }

        const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
            .setParent("root")
            .setIncludeFolders(true)
            .setSelectFolderEnabled(true)
            .setMode(window.google.picker.DocsViewMode.LIST);

        const picker = new window.google.picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(session.accessToken)
            .setDeveloperKey(session.googleApiKey)
            .setAppId(session.googleAppId)
            .setCallback((data) => {
                if (data.action === window.google.picker.Action.PICKED) {
                    const folder = data.docs[0];
                    setDestFolderId(folder.id);
                    setDestFolderName(folder.name);
                }
            })
            .build();

        picker.setVisible(true);
    };

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        setErrorMsg(null);

        const newSections = [];
        for (const file of files) {
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (!data.students || !Array.isArray(data.students)) throw new Error("missing students array");

                const sectionNumber = data.sectionNumber || String(data.crn).slice(-3);
                newSections.push({
                    id: `${data.term}-${data.crn}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    term: data.term,
                    crn: data.crn,
                    courseCode: data.courseCode || "",
                    tabName: sanitizeTabName(sectionNumber),
                    students: data.students
                });
            } catch (err) {
                setErrorMsg(`Could not read ${file.name}: not a valid captured section file.`);
            }
        }

        if (newSections.length > 0) {
            setSections((prev) => dedupeTabNames([...prev, ...newSections], RESERVED_TAB_NAMES));
        }

        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const removeSection = (id) => {
        setSections((prev) => prev.filter((s) => s.id !== id));
    };

    const renameSection = (id, tabName) => {
        setSections((prev) => prev.map((s) => (s.id === id ? { ...s, tabName } : s)));
    };

    const totalStudents = sections.reduce((sum, s) => sum + s.students.length, 0);

    const createSpreadsheet = async () => {
        const cleanSections = dedupeTabNames(
            sections.map((s) => ({ ...s, tabName: sanitizeTabName(s.tabName) })),
            RESERVED_TAB_NAMES
        );
        setLoadingMsg("Creating spreadsheet from template...");
        setErrorMsg(null);

        try {
            const res = await fetch("/api/create-attendance-sheet", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sheetTitle: sheetTitle.trim() || "Attendance Tracker",
                    sections: cleanSections.map((s) => ({ tabName: s.tabName, students: s.students }))
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create spreadsheet");

            const { spreadsheetId, url } = data;

            if (destFolderId) {
                setLoadingMsg("Moving to selected folder...");
                try {
                    const metaRes = await fetch(
                        `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=parents`,
                        { headers: { Authorization: `Bearer ${session.accessToken}` } }
                    );
                    const metaData = await metaRes.json();
                    const prevParents = (metaData.parents || []).join(",");
                    await fetch(
                        `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${destFolderId}&removeParents=${prevParents}`,
                        { method: "PATCH", headers: { Authorization: `Bearer ${session.accessToken}` } }
                    );
                } catch (moveErr) {
                    // Ownership transfer may still be pending acceptance — the sheet was created
                    // successfully either way, it just may need to be moved manually for now.
                }
            }

            setResultUrl(url);
            setLoadingMsg(null);
            setStep(4);
        } catch (err) {
            setErrorMsg("Error creating spreadsheet: " + err.message);
            setLoadingMsg(null);
        }
    };

    useEffect(() => {
        if (status === "authenticated" && session?.accessToken) {
            setStep((prev) => (prev === 1 ? 2 : prev));
        } else if (status === "unauthenticated") {
            setStep(1);
        }

        if (typeof window !== "undefined" && !window.gapi) {
            const script = document.createElement("script");
            script.src = "https://apis.google.com/js/api.js";
            script.onload = () => {
                window.gapi.load("picker");
            };
            document.body.appendChild(script);
        }
    }, [status, session]);

    return (
        <div className="layout-wrapper">
            <header className="app-header">
                <div className="header-content">
                    <div className="logo-group">
                        <svg className="icon-logo" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                        <h1>OTU Attendance</h1>
                    </div>
                    {session && (
                        <div className="user-badge">
                            <span className="user-email">{session.user.email}</span>
                            <button onClick={() => signOut()} className="btn-icon" title="Sign Out">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                            </button>
                        </div>
                    )}
                </div>
            </header>

            <main className="main-content">
                <div className="glass-card fade-in">
                    {errorMsg && (
                        <div className="alert-error" style={{ margin: "1.5rem 1.5rem 0" }}>
                            <svg className="icon-alert" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {errorMsg}
                        </div>
                    )}

                    {step === 1 && (
                        <div className="step-content">
                            <div className="step-header">
                                <span className="step-badge">1</span>
                                <h2>Authentication</h2>
                            </div>
                            <p className="subtitle">Sign in with your Google account.</p>
                            <button onClick={() => signIn("google")} className="btn-primary btn-large">
                                <svg className="icon-google" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                                Continue with Google
                            </button>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="step-content">
                            <div className="step-header">
                                <span className="step-badge">2</span>
                                <h2>Capture Rosters from Banner</h2>
                            </div>
                            <p className="subtitle">
                                Install the bookmarklet once, then use it on each Banner section you want to include.
                            </p>

                            <div className="bookmarklet-box">
                                <div dangerouslySetInnerHTML={{ __html: BOOKMARKLET_ANCHOR_HTML }} />
                                <p className="bookmarklet-hint">Drag this button up to your browser&apos;s bookmarks bar — don&apos;t click it.</p>
                            </div>

                            <ol className="instructions-list">
                                <li>Drag the button above up to your browser&apos;s bookmarks bar.</li>
                                <li>
                                    In Banner, open the <a href={BANNER_COURSE_LIST_URL} target="_blank" rel="noopener noreferrer">Class List</a> for a section.
                                </li>
                                <li>Click that bookmark — it downloads a file with that section&apos;s roster.</li>
                                <li>Repeat for each section, then upload the downloaded files below.</li>
                            </ol>

                            <details className="bookmarklet-fallback">
                                <summary>Can&apos;t see your bookmarks bar, or dragging isn&apos;t working?</summary>
                                <p className="bookmarklet-hint" style={{ marginTop: "0.75rem" }}>
                                    Copy the code below, then create a new bookmark manually (right-click your bookmarks bar → Add Page / New Bookmark) and paste it as the bookmark&apos;s URL — not the page URL.
                                </p>
                                <button type="button" onClick={copyBookmarklet} className="btn-secondary btn-small mt-4">
                                    {copied ? "Copied!" : "Copy Bookmarklet Code"}
                                </button>
                                <textarea
                                    readOnly
                                    value={BOOKMARKLET_HREF}
                                    className="bookmarklet-code"
                                    onClick={(e) => e.target.select()}
                                />
                            </details>

                            <div className="form-group">
                                <label>Captured Section Files</label>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".json,application/json"
                                    multiple
                                    style={{ display: "none" }}
                                    onChange={handleFileUpload}
                                />
                                <button onClick={() => fileInputRef.current?.click()} className="btn-secondary btn-large" style={{ width: "100%", justifyContent: "center" }}>
                                    Upload Captured Section File(s)
                                </button>
                            </div>

                            {sections.length > 0 && (
                                <div className="section-list slide-down">
                                    {sections.map((s) => (
                                        <div key={s.id} className="section-card">
                                            <div className="section-card-main">
                                                <input
                                                    className="section-tab-input"
                                                    value={s.tabName}
                                                    onChange={(e) => renameSection(s.id, e.target.value)}
                                                />
                                                <span className="section-card-count">{s.students.length} students</span>
                                            </div>
                                            <button onClick={() => removeSection(s.id)} className="btn-icon" title="Remove section">
                                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <button
                                onClick={() => setStep(3)}
                                disabled={sections.length === 0}
                                className="btn-launch btn-large mt-4"
                            >
                                <span>Continue ({totalStudents} students, {sections.length} section{sections.length === 1 ? "" : "s"})</span>
                                <svg className="icon-launch" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="step-content">
                            <div className="step-header">
                                <span className="step-badge">3</span>
                                <h2>Destination</h2>
                            </div>

                            {loadingMsg ? (
                                <div className="state-container">
                                    <div className="spinner"></div>
                                    <p className="state-text">{loadingMsg}</p>
                                </div>
                            ) : !hasSheetsScope ? (
                                <div className="auth-elevation-card slide-up" style={{ textAlign: "center", padding: "2rem 1rem" }}>
                                    <svg className="icon-alert" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: "48px", height: "48px", margin: "0 auto 1rem", color: "#3b82f6" }}>
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <p className="subtitle" style={{ marginBottom: "1.5rem" }}>
                                        To continue, the app requires permission to create a spreadsheet in your Drive.
                                    </p>
                                    <button onClick={elevatePermissions} className="btn-primary btn-large" style={{ width: "100%", justifyContent: "center" }}>
                                        Authorize Google Drive Access
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <p className="subtitle">
                                        Creating a spreadsheet with {sections.length} section{sections.length === 1 ? "" : "s"} ({totalStudents} students).
                                    </p>

                                    <div className="form-group">
                                        <label>Spreadsheet Title</label>
                                        <input
                                            className="input-text"
                                            style={{ width: "100%" }}
                                            value={sheetTitle}
                                            onChange={(e) => { setSheetTitle(e.target.value); setTitleManuallyEdited(true); }}
                                            placeholder="Attendance Tracker"
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Save Location</label>
                                        {!destFolderId ? (
                                            <button onClick={openFolderPicker} className="btn-secondary btn-large" style={{ width: "100%", justifyContent: "center" }}>
                                                <svg className="icon-launch" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: "8px" }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                Choose Drive Folder (optional)
                                            </button>
                                        ) : (
                                            <div className="selected-file-card">
                                                <span>{destFolderName}</span>
                                                <button onClick={openFolderPicker} className="btn-secondary btn-small" title="Change Folder">
                                                    Change
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={createSpreadsheet}
                                        disabled={!sheetTitle.trim()}
                                        className="btn-launch btn-large mt-4"
                                    >
                                        <span>Create Spreadsheet</span>
                                        <svg className="icon-launch" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {step === 4 && (
                        <div className="step-content">
                            <div className="result-card success slide-up">
                                <div className="result-icon">
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <div className="result-details">
                                    <h3>Spreadsheet Created</h3>
                                    <p className="student-id">{sections.length} section{sections.length === 1 ? "" : "s"}, {totalStudents} students</p>
                                </div>
                                <a href={resultUrl} target="_blank" rel="noopener noreferrer" className="btn-primary btn-full mt-4">
                                    Open Spreadsheet
                                </a>
                                <Link href="/" className="btn-secondary btn-full mt-4" style={{ justifyContent: "center" }}>
                                    Back to Home
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <footer className="app-footer">
                <div className="footer-content">
                    <p>&copy; {new Date().getFullYear()} OTU Attendance</p>
                    <div className="footer-links">
                        <Link href="/privacy">Privacy Policy</Link>
                        <Link href="/terms">Terms of Service</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
