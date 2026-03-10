import Head from "next/head";
import AttendanceTracker from "./AttentanceTracker";

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
            <AttendanceTracker />
        </>
    );
}
