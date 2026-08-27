import Head from "next/head";
import Link from "next/link";

export default function Home() {
    return (
        <>
            <Head>
                <title>OTU Attendance Tracker</title>
                <meta name="description" content="Attendance Tracker" />
                <link rel="icon" href="favicon.ico" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <meta name="google-site-verification" content="336KSEFp-My3dR7K_qxBhvMYoz9iSNT1g9HnMpnmMWU" />
            </Head>
            <div className="layout-wrapper">
                <header className="app-header">
                    <div className="header-content">
                        <div className="logo-group">
                            <svg className="icon-logo" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                            <h1>OTU Attendance</h1>
                        </div>
                    </div>
                </header>

                <main className="main-content">
                    <div className="glass-card fade-in landing-card">
                        <div className="step-content">
                            <div className="step-header">
                                <h2>What would you like to do?</h2>
                            </div>
                            <p className="subtitle">Choose an option to get started.</p>

                            <div className="landing-options">
                                <Link href="/create" className="landing-option">
                                    <div className="landing-option-icon">
                                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    </div>
                                    <div className="landing-option-text">
                                        <h3>Create Attendance Sheet</h3>
                                        <p>Pull a roster from Banner and generate a new spreadsheet, one tab per section.</p>
                                    </div>
                                    <svg className="landing-option-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </Link>

                                <Link href="/scan" className="landing-option">
                                    <div className="landing-option-icon accent">
                                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8V6a2 2 0 012-2h3m10 0h3a2 2 0 012 2v2M3 16v2a2 2 0 002 2h3m10 0h3a2 2 0 002-2v-2m-8-4h.01M12 12h.01M8 12h.01M16 12h.01" /></svg>
                                    </div>
                                    <div className="landing-option-text">
                                        <h3>Scan Attendance</h3>
                                        <p>Scan student barcodes against an existing roster to mark attendance.</p>
                                    </div>
                                    <svg className="landing-option-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </Link>
                            </div>
                        </div>
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
        </>
    );
}
