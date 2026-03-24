"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";

export default function AttendanceTracker() {
    const { data: session, status } = useSession();
    const hasSheetsScope = session?.scope?.includes("https://www.googleapis.com/auth/drive.file");

    // --- UI State ---
    const [step, setStep] = useState(1);
    const [loadingMsg, setLoadingMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState(null);

    // --- Sheets State ---
    const [selectedSheetId, setSelectedSheetId] = useState("");
    const [selectedSheetName, setSelectedSheetName] = useState("");
    const [availableTabs, setAvailableTabs] = useState([]);
    const [selectedTab, setSelectedTab] = useState("");
    const [manualId, setManualId] = useState("");

    // --- Scanner State & Refs ---
    const [scanResult, setScanResult] = useState(null);
    const [cameraMsg, setCameraMsg] = useState("Ready to scan");
    const [zoomLevel, setZoomLevel] = useState(1.0);

    const videoRef = useRef(null);
    const overlayCanvasRef = useRef(null);
    const isScanningRef = useRef(false);
    const detectionCountRef = useRef({});

    const workersRef = useRef([]);

    // ==========================================
    // SCANNER & CAMERA LOGIC
    // ==========================================
    const stopCamera = useCallback(() => {
        isScanningRef.current = false;
        if (videoRef.current && videoRef.current.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
    }, []);

    const scanFrame = useCallback(async function loopScan() {
        if (!isScanningRef.current || !videoRef.current || workersRef.current.length === 0) return;

        const video = videoRef.current;
        const availableWorker = workersRef.current.find(w => !w.isBusy);

        if (availableWorker) {
            try {
                const targetWidth = 960;
                const scale = targetWidth / video.videoWidth;
                const targetHeight = Math.floor(video.videoHeight * scale);

                const offscreen = new OffscreenCanvas(targetWidth, targetHeight);
                const ctx = offscreen.getContext("2d");

                ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
                const bitmap = await createImageBitmap(offscreen);

                availableWorker.isBusy = true;
                availableWorker.instance.postMessage({ frame: bitmap }, [bitmap]);
            } catch (err) {
                availableWorker.isBusy = false; 
            }
        }

        if (isScanningRef.current) {
            requestAnimationFrame(loopScan);
        }
    }, []);

    const setupPinchToZoom = useCallback((track) => {
        const container = document.getElementById("scanner-container");
        if (!container) return;

        let currentZoom = 1, minZoom = 1, maxZoom = 1;
        let initialPinchDistance = null, initialZoomAtPinchStart = 1, isZoomSupported = false;

        if (track && typeof track.getCapabilities === "function") {
            const caps = track.getCapabilities();
            if (caps.zoom) {
                isZoomSupported = true;
                minZoom = caps.zoom.min || 1;
                maxZoom = caps.zoom.max || 5;
                currentZoom = minZoom;
                setZoomLevel(currentZoom);
            }
        }

        const getDistance = (e) => Math.sqrt(Math.pow(e.touches[0].clientX - e.touches[1].clientX, 2) + Math.pow(e.touches[0].clientY - e.touches[1].clientY, 2));

        container.ontouchstart = (e) => {
            if (!isZoomSupported || e.touches.length !== 2) return;
            e.preventDefault();
            initialPinchDistance = getDistance(e);
            initialZoomAtPinchStart = currentZoom;
        };

        container.ontouchmove = (e) => {
            if (!isZoomSupported || e.touches.length !== 2 || !initialPinchDistance) return;
            e.preventDefault();
            let newZoom = initialZoomAtPinchStart * (getDistance(e) / initialPinchDistance);
            newZoom = Math.max(minZoom, Math.min(newZoom, maxZoom));

            if (Math.abs(newZoom - currentZoom) > 0.05) {
                currentZoom = newZoom;
                setZoomLevel(currentZoom);
                track.applyConstraints({ advanced: [{ zoom: currentZoom }] });
            }
        };

        container.ontouchend = (e) => { if (e.touches.length < 2) initialPinchDistance = null; };
    }, []);

    const startCamera = useCallback(async () => {
        setCameraMsg("Initializing camera...");
        setScanResult(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "environment",
                    width: { ideal: 4096 },
                    height: { ideal: 2160 }
                }
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = async () => {
                    videoRef.current.play();
                    const track = stream.getVideoTracks()[0];

                    try {
                        const capabilities = track.getCapabilities();
                        if (capabilities.focusMode && capabilities.focusMode.includes("continuous")) {
                            await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
                        }
                    } catch (e) {
                        console.warn("Autofocus constraint not supported.", e);
                    }

                    setupPinchToZoom(track);
                    setCameraMsg("Position barcode inside the frame or manually enter the ID below.");

                    isScanningRef.current = true;
                    detectionCountRef.current = {};
                    scanFrame();
                };
            }
        } catch (err) {
            setCameraMsg("Camera access denied or unavailable.");
        }
    }, [scanFrame, setupPinchToZoom]);

    // ==========================================
    // SHEETS LOGIC (Using Native Fetch + NextAuth)
    // ==========================================
    const elevatePermissions = () => {
        signIn("google", undefined, {
            scope: "openid email profile https://www.googleapis.com/auth/drive.file"
        });
    };

    const openGooglePicker = () => {
        if (!window.google || !window.google.picker || !session?.accessToken) {
            return setErrorMsg("Picker API is still loading. Please try again in a moment.");
        }

        const view = new window.google.picker.DocsView(window.google.picker.ViewId.SPREADSHEETS)
            .setMimeTypes('application/vnd.google-apps.spreadsheet')
            .setMode(window.google.picker.DocsViewMode.LIST);

        const picker = new window.google.picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(session.accessToken)
            .setDeveloperKey(session.googleApiKey)
            .enableFeature(google.picker.Feature.NAV_HIDDEN)
            .setAppId(session.googleAppId)
            .setCallback((data) => {
                if (data.action === window.google.picker.Action.PICKED) {
                    const doc = data.docs[0];
                    setSelectedSheetId(doc.id);
                    setSelectedSheetName(doc.name);
                    fetchSheetTabs(doc.id);
                }
            })
            .build();

        picker.setVisible(true);
    };

    const fetchSheetTabs = async (sheetId) => {
        setLoadingMsg("Loading section tabs...");
        try {
            const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`, {
                headers: { Authorization: `Bearer ${session.accessToken}` }
            });

            if (response.status === 401 || response.status === 403) {
                upgradeToSheetsAccess();
                return;
            }
            const data = await response.json();

            if (data.error) throw new Error(data.error.message);

            const ignore = ["Instructions", "Summary", "Testing Center"];
            const tabs = data.sheets
                .map(s => s.properties.title)
                .filter(title => !ignore.includes(title));

            setAvailableTabs(tabs);
            setLoadingMsg(null);
        } catch (err) {
            setErrorMsg("Error loading tabs: " + err.message);
            setLoadingMsg(null);
        }
    };

    const startAttendance = () => {
        if (!selectedTab) return alert("Please select a section");
        setStep(3);
    };

    const handleManualSubmit = (e) => {
        e.preventDefault();
        const cleanId = manualId.trim();
        if (!cleanId) return;

        stopCamera();
        processBarcodeData(cleanId);
        setManualId("");
    };

    const processBarcodeData = useCallback(async (studentId) => {
        setCameraMsg(`Checking student ID: ${studentId}`);

        try {
            // 1. Get the current sheet data
            const getRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${selectedSheetId}/values/${selectedTab}!A:E`, {
                headers: { Authorization: `Bearer ${session.accessToken}` }
            });

            if (getRes.status === 401) {
                stopCamera();
                signOut();
                return;
            }
            const getData = await getRes.json();
            const rows = getData.values || [];
			
            if (rows.length > 0) {
                let studentFound = false;
                let studentName = "";
				let studentPhoto = "";
                let rowIndex = -1;

                for (let i = 0; i < rows.length; i++) {
                    if (rows[i].length > 1 && rows[i][1] === studentId) {
						studentFound = true;
						studentName = rows[i][0] || "Unknown Student";
                        studentPhoto = rows[i][4] || "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png";
						rowIndex = i + 1; // Google Sheets is 1-indexed
                        break;
                    }
                }

                if (studentFound) {
                    const timestamp = new Date().toLocaleString();

                    // 2. Write the "Present" status and timestamp back to the sheet
                    const putRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${selectedSheetId}/values/${selectedTab}!C${rowIndex}:D${rowIndex}?valueInputOption=USER_ENTERED`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${session.accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ values: [["Present", timestamp]] })
                    });

                    if (!putRes.ok) throw new Error("Failed to write to sheet");

                    setScanResult({ found: true, name: studentName, id: studentId, photo: studentPhoto });
                } else {
                    setScanResult({ found: false, name: "", id: studentId });
                }
            } else {
                setCameraMsg("No data found in the sheet.");
            }
        } catch (err) {
            console.error(err);
            setCameraMsg("Error accessing Google Sheet.");
        }
    }, [selectedSheetId, selectedTab, session, stopCamera]);

    // --- Web Worker Initialization ---
    useEffect(() => {
        if (typeof window === "undefined") return;

        const workerCount = 2;
        workersRef.current = Array.from({ length: workerCount }, () => {
            const worker = new Worker(new URL("../worker/worker.js", import.meta.url), { type: "module" });
            
            const workerObj = { instance: worker, isBusy: false };

            worker.onmessage = (e) => {
                workerObj.isBusy = false;

                if (!isScanningRef.current) return;

                const data = e.data;
                if (data.error) return;

                if (data.found) {
                    const code = data.rawValue;
                    const now = Date.now();

                    if (!detectionCountRef.current[code]) {
                        detectionCountRef.current[code] = { count: 0, firstDetected: now };
                    }
                    detectionCountRef.current[code].count++;

                    if (detectionCountRef.current[code].count >= 2) {
                        if (navigator.vibrate) { try { navigator.vibrate([100, 50, 100]); } catch { } }
                        stopCamera();
                        processBarcodeData(code);
                        detectionCountRef.current = {};
                    }
                }
            };
            return workerObj;
        });

        return () => {
            workersRef.current.forEach(w => w.instance.terminate());
        };
    }, [processBarcodeData, stopCamera]);

    // ==========================================
    // AUTHENTICATION ROUTING
    // ==========================================
    useEffect(() => {
        if (status === "authenticated" && session?.accessToken) {
            setStep(2);
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

    useEffect(() => {
        if (step === 3) startCamera();
        return () => stopCamera();
    }, [step, startCamera, stopCamera]);

    // ==========================================
    // RENDER UI
    // ==========================================
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

                    {loadingMsg && step !== 2 && (
                        <div className="state-container">
                            <div className="spinner"></div>
                            <p className="state-text">{loadingMsg}</p>
                        </div>
                    )}

                    {errorMsg && (
                        <div className="alert-error">
                            <svg className="icon-alert" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {errorMsg}
                        </div>
                    )}

                    {step === 1 && !loadingMsg && (
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
                                <h2>Session Details</h2>
                            </div>

                            <p className="subtitle">Select the spreadsheet and specific section you are tracking today.</p>

                            {!hasSheetsScope ? (
                                <div className="auth-elevation-card slide-up" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                                    <svg className="icon-alert" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '48px', height: '48px', margin: '0 auto 1rem', color: '#3b82f6' }}>
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <p className="subtitle" style={{ marginBottom: '1.5rem' }}>
                                        To continue, the app requires permission to read the attendance roster you select.
                                    </p>
                                    <button onClick={elevatePermissions} className="btn-primary btn-large" style={{ width: '100%', justifyContent: 'center' }}>
                                        Authorize Google Drive Access
                                    </button>
                                </div>
                            ): (
                            <div className="form-group">
                                    <label>Spreadsheet Roster</label>
                                    {!selectedSheetId ? (
                                        <button onClick={openGooglePicker} className="btn-secondary btn-large" style={{ width: '100%', justifyContent: 'center' }}>
                                            <svg className="icon-launch" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: '8px' }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                            Select from Google Drive
                                        </button>
                                    ) : (
                                        <div className="selected-file-card">
                                            <span>
                                                {selectedSheetName}
                                            </span>
                                            <button
                                                onClick={openGooglePicker}
                                                className="btn-secondary btn-small"
                                                title="Change File"
                                            >
                                                Change
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {availableTabs.length > 0 && !loadingMsg && selectedSheetId && (
                                <div className="form-group slide-down">
                                    <label>Course Section</label>
                                    <div className="select-wrapper">
                                        <select value={selectedTab} onChange={(e) => setSelectedTab(e.target.value)}>
                                            <option value="" disabled>Select a section tab...</option>
                                            {availableTabs.map(tab => (
                                                <option key={tab} value={tab}>{tab}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {loadingMsg && (
                                <div className="state-container">
                                    <div className="spinner"></div>
                                    <p className="state-text">{loadingMsg}</p>
                                </div>
                            )}

                            <button
                                onClick={startAttendance}
                                disabled={!selectedTab || !selectedSheetId}
                                className="btn-launch btn-large mt-4"
                            >
                                <span>Scan</span>
                                <svg className="icon-launch" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8V6a2 2 0 012-2h3m10 0h3a2 2 0 012 2v2M3 16v2a2 2 0 002 2h3m10 0h3a2 2 0 002-2v-2m-8-4h.01M12 12h.01M8 12h.01M16 12h.01" />
                                </svg>
                            </button>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="step-content scanner-layout">
                            <div className="scanner-header">
                                <div>
                                    <h2>Active Session</h2>
                                    <p className="badge-soft">{selectedTab}</p>
                                </div>
                                <button onClick={() => { stopCamera(); setStep(2); }} className="btn-secondary btn-small">
                                    Change Section
                                </button>
                            </div>

                            {!scanResult && (
                                <div className="scanner-wrapper">
                                    <div id="scanner-container">
                                        <video
                                            ref={videoRef}
                                            id="camera-stream"
                                            autoPlay
                                            playsInline
                                            onClick={async () => {
                                                if (videoRef.current && videoRef.current.srcObject) {
                                                    const track = videoRef.current.srcObject.getVideoTracks()[0];
                                                    try {
                                                        await track.applyConstraints({ advanced: [{}] });
                                                        setCameraMsg("Focusing...");
                                                        setTimeout(() => setCameraMsg("Position barcode inside the frame."), 1000);
                                                    } catch (e) { }
                                                }
                                            }}
                                        ></video>
                                        <canvas ref={overlayCanvasRef} id="overlay-canvas"></canvas>

                                        {zoomLevel > 1 && <div id="zoom-indicator">{zoomLevel.toFixed(1)}x Zoom</div>}

                                        <div className="camera-overlay">
                                            <div className="viewfinder">
                                                <div className="corner top-left"></div>
                                                <div className="corner top-right"></div>
                                                <div className="corner bottom-left"></div>
                                                <div className="corner bottom-right"></div>
                                                <div id="scanner-line"></div>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="status-text">{cameraMsg}</p>
                                    <div className="manual-entry-section">
                                        <p className="divider-text"><span>OR</span></p>
                                        <form onSubmit={handleManualSubmit} className="manual-entry-form">
                                            <input
                                                type="number"
                                                id="manual-id"
                                                placeholder="Enter Student ID manually"
                                                value={manualId}
                                                onChange={(e) => setManualId(e.target.value)}
                                                className="input-text"
                                            />
                                            <button
                                                type="submit"
                                                className="btn-secondary"
                                                disabled={!manualId.trim()}
                                                style={{ width: "auto", margin: 0, padding: ".875rem 1rem", flex: 1 }}
                                            >
                                                Submit
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            )}

                            {scanResult && (
                                <div className={`result-card ${scanResult.found ? "success" : "error"} slide-up`}>
                                    <div>
										<img src={scanResult.photo} alt="user photo" width="30%" />
									</div>
									<div className="result-icon">
                                        {scanResult.found
                                            ? <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                            : <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /> </svg>
                                        }
                                    </div>
                                   <div className="result-details">
                                        <h3>{scanResult.found ? "Attendance Recorded" : "Student Not Found"}</h3>
                                        {scanResult.found && <p className="student-name">{scanResult.name}</p>}
                                        <p className="student-id">ID: {scanResult.id}</p>
                                        {!scanResult.found && <p className="error-note">This ID is not registered in this section.</p>}
                                    </div>
                                    <button onClick={startCamera} className="btn-primary btn-full mt-4">Scan Next Student</button>
                                </div>
                            )}
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
