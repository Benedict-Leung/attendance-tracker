// pages/api/risc.js
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const config = {
  api: {
    bodyParser: false, // Google sends a raw JWT string, not JSON
  },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const rawBody = await new Promise((resolve) => {
            let body = '';
            req.on('data', (chunk) => { body += chunk.toString(); });
            req.on('end', () => { resolve(body); });
        });

        if (!rawBody) return res.status(400).json({ error: 'No token provided' });

        // 1. Verify the signature against Google's public keys
        const ticket = await client.verifyIdToken({
            idToken: rawBody,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const events = payload.events || {};
        
        // The sub claim is the unique Google Account ID
        const subjectInfo = events[Object.keys(events)[0]]?.subject;
        const googleId = subjectInfo?.sub; 

        // 2. Identify the specific event
        if (events['https://schemas.openid.net/secevent/risc/event-type/account-disabled']) {
            console.warn(`[RISC] Google Account Disabled for User ID: ${googleId}`);
            // The user's active tokens are dead. Our 401 frontend catch will log them out naturally.
        } 
        else if (events['https://schemas.openid.net/secevent/risc/event-type/account-credential-change-required']) {
            console.warn(`[RISC] Password Reset/Hijack detected for User ID: ${googleId}`);
            // The user's active tokens are dead. Our 401 frontend catch will log them out naturally.
        }
        else if (events['https://schemas.openid.net/secevent/risc/event-type/verification']) {
            console.log(`[RISC] Verification token received successfully.`);
        }

        // 3. You MUST return 202 Accepted, or Google will keep retrying and eventually disable your stream
        return res.status(202).end();

    } catch (error) {
        console.error('[RISC ERROR] Token validation failed:', error.message);
        return res.status(400).json({ error: 'Invalid token' });
    }
}