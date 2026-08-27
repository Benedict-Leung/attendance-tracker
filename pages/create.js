import Head from "next/head";
import CreateAttendanceSheet from "./CreateAttendanceSheet";

export default function Create() {
    return (
        <>
            <Head>
                <title>Create Attendance Sheet - OTU Attendance Tracker</title>
                <meta name="description" content="Generate an attendance roster spreadsheet from Banner" />
                <link rel="icon" href="favicon.ico" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>
            <CreateAttendanceSheet />
        </>
    );
}
