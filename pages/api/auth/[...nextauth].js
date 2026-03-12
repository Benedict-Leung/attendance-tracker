// pages/api/auth/[...nextauth].js
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export default NextAuth({
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
                params: {
                    prompt: "consent",
                    access_type: "offline",
                    response_type: "code",
                    include_granted_scopes: "true",
                    scope: "openid email profile https://www.googleapis.com/auth/drive.file"
                }
            }
        }),
    ],
    session: {
        strategy: "jwt",
        maxAge: 4 * 60 * 60,
    },
    callbacks: {
        async jwt({ token, account }) {
            if (account) {
                token.accessToken = account.access_token;
                token.scope = account.scope; 
            }
            return token;
        },
        async session({ session, token }) {
            session.accessToken = token.accessToken;
            session.scope = token.scope; 
            
            session.googleApiKey = process.env.GOOGLE_API_KEY;
            if (process.env.GOOGLE_CLIENT_ID) {
                session.googleAppId = process.env.GOOGLE_CLIENT_ID.split('-')[0];
            }
            return session;
        }
    },
    secret: process.env.NEXTAUTH_SECRET,
});