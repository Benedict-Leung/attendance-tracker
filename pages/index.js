import Head from "next/head";
import AttendanceTracker from "./AttentanceTracker";

export default function Home() {
  return (
    <>
      <Head>
        <title>OTU Attendance Tracker</title>
        <meta name="description" content="Attendance Tracker" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <AttendanceTracker />
    </>
  );
}
