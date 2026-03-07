"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Script from "next/script";
import { BarcodeDetector } from "barcode-detector/ponyfill";

const SCOPES = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";

export default function AttendanceTracker() {
    // --- UI State ---
    const [step, setStep] = useState(1);
    const [loadingMsg, setLoadingMsg] = useState("Waiting for Google API...");
    const [errorMsg, setErrorMsg] = useState(null);

    // --- Auth & User State ---
    const [tokenClient, setTokenClient] = useState(null);
    const [accessToken, setAccessToken] = useState(null);
    const [userInfo, setUserInfo] = useState(null);

    // --- Sheets State ---
    const [availableSheets, setAvailableSheets] = useState([]);
    const [selectedSheetId, setSelectedSheetId] = useState("");
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
    const detectorRef = useRef(null);

    useEffect(() => {
        try {
            detectorRef.current = new BarcodeDetector({ formats: ["code_39"] });
        } catch (err) {
            console.error("BarcodeDetector initialization failed:", err);
        }
    }, []);

    // ==========================================
    // GOOGLE API INITIALIZATION
    // ==========================================
    const initGoogleApi = () => {
        setLoadingMsg("Initializing Google API...");
        try {
            window.gapi.load("client", async () => {
                await window.gapi.client.init({
                    apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
                    discoveryDocs: [
                        "https://sheets.googleapis.com/$discovery/rest?version=v4",
                        "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
                    ],
                });

                const client = window.google.accounts.oauth2.initTokenClient({
                    client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
                    scope: SCOPES,
                    callback: (tokenResponse) => {
                        if (tokenResponse && tokenResponse.access_token) {
                            setAccessToken(tokenResponse.access_token);
                            fetchUserInfo(tokenResponse.access_token);
                            setErrorMsg(null);
                        }
                    },
                    error_callback: (error) => {
                        console.error("Auth error:", error);
                        setErrorMsg("Authentication failed.");
                    }
                });

                setTokenClient(client);
                setLoadingMsg(null);
            });
        } catch (err) {
            setErrorMsg("Error loading Google API: " + err.message);
            setLoadingMsg(null);
        }
    };

    const fetchUserInfo = async (token) => {
        try {
            const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setUserInfo(data);
            setStep(2);
            fetchUserSheets();
        } catch (err) {
            setErrorMsg("Failed to fetch user info.");
        }
    };

    const handleAuthClick = () => {
        if (tokenClient) tokenClient.requestAccessToken();
    };

    const handleSignOut = () => {
        if (accessToken) {
            window.google.accounts.oauth2.revoke(accessToken, () => {
                setAccessToken(null);
                setUserInfo(null);
                setStep(1);
            });
        }
    };

    // ==========================================
    // SHEETS LOGIC
    // ==========================================
    const fetchUserSheets = () => {
        setLoadingMsg("Loading your spreadsheets...");
        window.gapi.client.drive.files.list({
            pageSize: 15,
            fields: "nextPageToken, files(id, name, modifiedTime)",
            q: "mimeType='application/vnd.google-apps.spreadsheet'"
        }).then((response) => {
            const files = response.result.files || [];
            files.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
            setAvailableSheets(files);
            setLoadingMsg(null);
        });
    };

    const handleSheetSelection = (e) => {
        const sheetId = e.target.value;
        setSelectedSheetId(sheetId);
        if (sheetId) fetchSheetTabs(sheetId);
    };

    const fetchSheetTabs = (sheetId) => {
        setLoadingMsg("Loading section tabs...");
        window.gapi.client.sheets.spreadsheets.get({ spreadsheetId: sheetId }).then(response => {
            const sheets = response.result.sheets;
            const ignore = ["Instructions", "Summary", "Testing Center"];
            const tabs = sheets
                .map(s => s.properties.title)
                .filter(title => !ignore.includes(title));

            setAvailableTabs(tabs);
            setLoadingMsg(null);
        }).catch(err => {
            setErrorMsg("Error loading tabs: " + err.message);
            setLoadingMsg(null);
        });
    };

    const startAttendance = () => {
        if (!selectedTab) {
            alert("Please select a section");
            return;
        }
        setStep(3);
    };

    const handleManualSubmit = (e) => {
        e.preventDefault();
        const cleanId = manualId.trim();
        if (!cleanId) return;
        
        stopCamera(); // Stop the camera if they use the manual fallback
        processBarcodeData(cleanId);
        setManualId(""); // Clear the input field
    };

    // ==========================================
    // SHEETS DATA PROCESSING
    // ==========================================
    const processBarcodeData = useCallback(async (studentId) => {
        setCameraMsg(`Checking student ID: ${studentId}`);

        try {
            const response = await window.gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: selectedSheetId,
                // Update 1: Expand search range to Column D
                range: `${selectedTab}!A:D` 
            });

            const rows = response.result.values;
            if (rows && rows.length > 0) {
                let studentFound = false;
                let studentName = "";
                let rowIndex = -1;

                for (let i = 0; i < rows.length; i++) {
                    if (rows[i].length > 1 && rows[i][1] === studentId) {
                        studentFound = true;
                        studentName = rows[i][0] || "Unknown Student";
                        rowIndex = i + 1;
                        break;
                    }
                }

                if (studentFound) {
                    // Update 2: Generate a localized timestamp
                    const timestamp = new Date().toLocaleString();

                    await window.gapi.client.sheets.spreadsheets.values.update({
                        spreadsheetId: selectedSheetId,
                        // Update 3: Target columns C through D for the specific row
                        range: `${selectedTab}!C${rowIndex}:D${rowIndex}`,
                        valueInputOption: "USER_ENTERED",
                        // Update 4: Send both "Present" and the timestamp side-by-side
                        resource: { values: [["Present", timestamp]] } 
                    });
                    setScanResult({ found: true, name: studentName, id: studentId });
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
    }, [selectedSheetId, selectedTab]);

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
        if (!isScanningRef.current || !videoRef.current || !overlayCanvasRef.current || !detectorRef.current) return;

        const video = videoRef.current;
        const overlayCanvas = overlayCanvasRef.current;
        const overlayCtx = overlayCanvas.getContext("2d");

        if (video.videoWidth > 0 && overlayCanvas.width !== video.videoWidth) {
            overlayCanvas.width = video.videoWidth;
            overlayCanvas.height = video.videoHeight;
        }

        try {
            const barcodes = await detectorRef.current.detect(video);
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

            if (barcodes && barcodes.length > 0) {
                const barcode = barcodes[0]; 

                // --- DETECTION LOGIC ---
                const code = barcode.rawValue;
                const now = Date.now();

                if (!detectionCountRef.current[code]) {
                    detectionCountRef.current[code] = { count: 0, firstDetected: now };
                }
                detectionCountRef.current[code].count++;

                if (detectionCountRef.current[code].count >= 2) {
                    if (navigator.vibrate) try { navigator.vibrate([100, 50, 100]); } catch (_) { }

                    stopCamera();
                    processBarcodeData(code);
                    detectionCountRef.current = {};
                }
            }

            const cutoff = Date.now() - 2000;
            Object.keys(detectionCountRef.current).forEach(c => {
                if (detectionCountRef.current[c].firstDetected < cutoff) {
                    delete detectionCountRef.current[c];
                }
            });

        } catch (error) {
            console.error("Barcode detection failed:", error);
        }

        if (isScanningRef.current) setTimeout(loopScan, 120);
    }, [processBarcodeData, stopCamera]);

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
                    
                    // --- NEW AUTOFOCUS LOGIC ---
                    // Try to force continuous autofocus if the hardware supports it
                    try {
                        const capabilities = track.getCapabilities();
                        if (capabilities.focusMode && capabilities.focusMode.includes("continuous")) {
                            await track.applyConstraints({
                                advanced: [{ focusMode: "continuous" }]
                            });
                            console.log("Continuous autofocus enabled.");
                        } else {
                            console.warn("Continuous autofocus not supported on this device.");
                        }
                    } catch (e) {
                        console.warn("Autofocus constraint not supported on this device.", e);
                    }
                    // ---------------------------

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

    useEffect(() => {
        if (step === 3) startCamera();
        return () => stopCamera(); 
    }, [step, startCamera, stopCamera]);

    // ==========================================
    // RENDER UI
    // ==========================================
    return (
        <div className="layout-wrapper">
            <Script src="https://accounts.google.com/gsi/client" strategy="lazyOnload" />
            <Script src="https://apis.google.com/js/api.js" strategy="lazyOnload" onLoad={initGoogleApi} />

            {/* Header */}
            <header className="app-header">
                <div className="header-content">
                    <div className="logo-group">
                        <svg className="icon-logo" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                        <h1>OTU Attendance</h1>
                    </div>
                    {userInfo && (
                        <div className="user-badge">
                            <span className="user-email">{userInfo.email}</span>
                            <button onClick={handleSignOut} className="btn-icon" title="Sign Out">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                            </button>
                        </div>
                    )}
                </div>
            </header>

            <main className="main-content">
                <div className="glass-card fade-in">
                    
                    {/* Loading & Errors */}
                    {loadingMsg && step != 2 && (
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

                    {/* STEP 1: AUTHENTICATION */}
                    {step === 1 && !loadingMsg && (
                        <div className="step-content">
                            <div className="step-header">
                                <span className="step-badge">1</span>
                                <h2>Authentication</h2>
                            </div>
                            <p className="subtitle">Sign in with your Google account.</p>
                            <button onClick={handleAuthClick} className="btn-primary btn-large">
                                <svg className="icon-google" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                                Continue with Google
                            </button>
                        </div>
                    )}

                    {/* STEP 2: SHEET SELECTION */}
                    {step === 2 && (
                        <div className="step-content">
                            <div className="step-header">
                                <span className="step-badge">2</span>
                                <h2>Session Details</h2>
                            </div>

                            {availableSheets.length > 0 && (
                                <>
                                    <p className="subtitle">Select the spreadsheet and specific section you are tracking today.</p>
                                    
                                    <div className="form-group">
                                        <label>Select Spreadsheet</label>
                                        <div className="select-wrapper">
                                            <select value={selectedSheetId} onChange={handleSheetSelection}>
                                                <option value="" disabled>Select a document...</option>
                                                {availableSheets.map(sheet => (
                                                    <option key={sheet.id} value={sheet.id}>{sheet.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </>
                            )}

                            {availableTabs.length > 0 && !loadingMsg && (
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
                                disabled={!selectedTab} 
                                className="btn-launch btn-large mt-4"
                            >
                                <span>Scan</span>
                                
                                {/* Custom Barcode/Viewfinder Icon */}
                                <svg className="icon-launch" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8V6a2 2 0 012-2h3m10 0h3a2 2 0 012 2v2M3 16v2a2 2 0 002 2h3m10 0h3a2 2 0 002-2v-2m-8-4h.01M12 12h.01M8 12h.01M16 12h.01" />
                                </svg>
                            </button>
                        </div>
                    )}

                    {/* STEP 3: SCANNER */}
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
                                                // Trigger manual focus when the user taps the video
                                                if (videoRef.current && videoRef.current.srcObject) {
                                                    const track = videoRef.current.srcObject.getVideoTracks()[0];
                                                    try {
                                                        // Applying an empty advanced constraint often forces the OS to re-meter focus and exposure
                                                        await track.applyConstraints({ advanced: [{}] });
                                                        setCameraMsg("Focusing...");
                                                        setTimeout(() => setCameraMsg("Position barcode inside the frame."), 1000);
                                                    } catch(e) {}
                                                }
                                            }}
                                        ></video>
                                        <canvas ref={overlayCanvasRef} id="overlay-canvas"></canvas>
                                        
                                        {zoomLevel > 1 && <div id="zoom-indicator">{zoomLevel.toFixed(1)}x Zoom</div>}
                                        
                                        {/* Modern Camera Viewfinder Overlay */}
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

                            {/* RESULTS DISPLAY */}
                            {scanResult && (
                                <div className={`result-card ${scanResult.found ? "success" : "error"} slide-up`}>
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
        </div>
    );
}