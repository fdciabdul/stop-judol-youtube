import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const CREDENTIALS_PATH = path.resolve(__dirname, 'credentials.json');
const TOKEN_PATH = path.resolve(__dirname, 'token.json');

const SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl'];

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
const { client_id, client_secret, redirect_uris } = credentials.installed;

const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);


function getAuthUrl(): string {
    return oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
}


async function getAccessToken(code: string): Promise<void> {
    try {
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
        console.log('✅ Token stored successfully.');
    } catch (error) {
        console.error('❌ Error getting access token:', error);
        throw error;
    }
}


function loadToken(): void {
    if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
        oAuth2Client.setCredentials(token);
        console.log('🔑 Token loaded successfully.');
    } else {
        console.warn('⚠ No existing token found. Authentication required.');
    }
}

export { oAuth2Client, getAuthUrl, getAccessToken, loadToken };
