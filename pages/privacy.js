"use client";

import Link from "next/link";
import Head from "next/head";

export default function PrivacyPolicy() {
    return (
        <>
            <Head>
                <title>OTU Attendance Tracker - Privacy Policy</title>
                <meta name="description" content="Privacy Policy for OTU Attendance Tracker" />
                <link rel="icon" href="favicon.ico" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>
            <div className="layout-wrapper">
                <header className="app-header">
                    <div className="header-content">
                        <div className="logo-group">
                            <Link href="/" style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <svg className="icon-logo" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                <h1>OTU Attendance</h1>
                            </Link>
                        </div>
                    </div>
                </header>

                <main className="main-content" style={{ alignItems: "flex-start" }}>
                    <div className="glass-card" style={{ maxWidth: "800px", padding: "2.5rem" }}>
                        <h2 style={{ fontSize: "1.75rem", marginBottom: "1rem", color: "var(--primary)" }}>Privacy Policy</h2>
                        <p className="subtitle">Last updated: March 12, 2026</p>

                        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", lineHeight: "1.6", color: "var(--text-main)" }}>
                            <section>
                                <h3 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>1. Introduction</h3>
                                <p>The OTU Exam Attendance Tracker (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) respects your privacy. This Privacy Policy explains how your information is collected, used, and protected when you use our web application.</p>
                            </section>

                            <section>
                                <h3 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>2. Data We Collect</h3>
                                <ul style={{ paddingLeft: "1.5rem" }}>
                                    <li><strong>Google Account Information:</strong> When you sign in using Google OAuth, we receive your email address and basic profile information solely to authenticate your identity.</li>
                                    <li><strong>Google Sheets & Drive Data:</strong> We request access to your Google Drive and Google Sheets to list your available files and update attendance records on the specific sheets you select.</li>
                                    <li><strong>Camera Feed:</strong> Our application requests local access to your device&apos;s camera to scan barcodes.</li>
                                </ul>
                            </section>

                            <section>
                                <h3 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>3. How We Use Your Data</h3>
                                <p><strong>We do not store your data on any external servers.</strong></p>
                                <ul style={{ paddingLeft: "1.5rem" }}>
                                    <li>Your Google account data is only used temporarily in your browser session to facilitate connection to your own Google Sheets.</li>
                                    <li>The camera feed is processed <strong>locally on your device</strong>. No video or images are recorded, saved, or transmitted to any server.</li>
                                    <li>Scanned barcode data (Student IDs) is transmitted directly from your browser to your selected Google Sheet via the official Google Sheets API.</li>
                                </ul>
                            </section>

                            <section>
                                <h3 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>4. Google API Services User Data Policy</h3>
                                <p>Our use and transfer of information received from Google APIs to any other app will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
                            </section>

                            <section>
                                <h3 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>5. Data Protection and Security</h3>
                                <p>We implement strict security measures to protect sensitive information, including Student IDs and authentication data:</p>
                                <ul style={{ paddingLeft: "1.5rem" }}>
                                    <li><strong>Encryption in Transit:</strong> All data transmitted between your device and Google APIs is encrypted using industry-standard TLS/HTTPS protocols.</li>
                                    <li><strong>No Persistent Storage:</strong> Sensitive data, such as scanned Student IDs, is only held in volatile memory during the active scanning session and is immediately discarded once securely transferred to your Google Sheet.</li>
                                    <li><strong>Secure Authentication:</strong> Access to your Google account relies on secure OAuth 2.0 tokens, which are handled directly by your browser and are never stored persistently on any external database managed by us.</li>
                                    <li><strong>Data at Rest:</strong> Because we do not use an independent backend database, the security of your saved attendance data relies on Google&apos;s robust infrastructure within your personal Google account.</li>
                                </ul>
                            </section>

                            <section>
                                <h3 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>6. Contact Us</h3>
                                <p>If you have any questions about this Privacy Policy, please contact the application administrator at Ontario Tech University.</p>
                            </section>
                        </div>
                    </div>
                </main>
            </div>
        </>
    );
}