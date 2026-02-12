const express = require('express');
const { google } = require('googleapis');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { app } = require('electron');

class AuthServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.port = 9001;
    this.host = '127.0.0.1'; // Use loopback IP instead of localhost
    this.oauth2Client = null;
    this.authPromise = null;
    this.authResolve = null;
    
    // Load credentials from config file or environment variables
    this.credentials = this.loadCredentials();
    
    this.setupRoutes();
  }

  loadCredentials() {
    // Try environment variables first (production)
    let clientId = process.env.GOOGLE_CLIENT_ID;
    let clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    // Fall back to config.json
    if (!clientId || !clientSecret) {
      try {
        // Try multiple paths for config.json
        const appPath = app.getAppPath();
        const possiblePaths = [
          path.join(appPath, 'config.json'),  // Inside asar or app directory
          path.join(__dirname, '..', 'config.json'),  // Development
          path.join(process.cwd(), 'config.json')  // Fallback
        ];
        
        console.log('App path:', appPath);
        console.log('Trying to load config from paths:', possiblePaths);
        
        let config = null;
        for (const configPath of possiblePaths) {
          try {
            console.log(`Attempting to read: ${configPath}`);
            const configData = fsSync.readFileSync(configPath, 'utf8');
            config = JSON.parse(configData);
            console.log(`✓ Successfully loaded config from: ${configPath}`);
            break;
          } catch (err) {
            console.log(`✗ Failed to load from ${configPath}:`, err.message);
          }
        }
        
        if (config && config.google && config.google.clientId && config.google.clientSecret) {
          clientId = config.google.clientId;
          clientSecret = config.google.clientSecret;
          console.log('✓ Credentials loaded successfully');
        } else {
          console.log('✗ Config loaded but missing google credentials');
        }
      } catch (error) {
        console.error('Error loading config:', error);
      }
    }

    if (!clientId || !clientSecret) {
      throw new Error(
        'Google OAuth credentials not found!\n\n' +
        'Please create a config.json file with your credentials:\n' +
        '{\n' +
        '  "google": {\n' +
        '    "clientId": "YOUR_CLIENT_ID",\n' +
        '    "clientSecret": "YOUR_CLIENT_SECRET"\n' +
        '  }\n' +
        '}\n\n' +
        'Or set environment variables:\n' +
        'GOOGLE_CLIENT_ID=your_client_id\n' +
        'GOOGLE_CLIENT_SECRET=your_client_secret\n\n' +
        'See SETUP_GUIDE.md for detailed instructions.'
      );
    }

    return {
      clientId,
      clientSecret,
      redirectUri: `http://${this.host}:${this.port}/oauth2callback`
    };
  }

  setupRoutes() {
    this.app.get('/oauth2callback', async (req, res) => {
      const code = req.query.code;
      
      if (!code) {
        res.send('<h1>Authentication failed</h1><p>No authorization code received.</p>');
        if (this.authResolve) {
          this.authResolve({ error: 'No authorization code' });
        }
        return;
      }

      try {
        const { tokens } = await this.oauth2Client.getToken(code);
        
        // Save tokens for future use
        await this.saveTokens(tokens);
        
        res.send(`
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                h1 { color: #34a853; }
                p { color: #666; }
              </style>
            </head>
            <body>
              <h1>✓ Authentication Successful!</h1>
              <p>You can close this window and return to the app.</p>
            </body>
          </html>
        `);
        
        if (this.authResolve) {
          this.authResolve({ tokens });
        }
        
        // Close server after successful auth
        setTimeout(() => this.stopServer(), 2000);
      } catch (error) {
        res.send(`<h1>Authentication failed</h1><p>${error.message}</p>`);
        if (this.authResolve) {
          this.authResolve({ error: error.message });
        }
      }
    });
  }

  async getAuthUrl() {
    // Try to load existing tokens
    const existingTokens = await this.loadTokens();
    if (existingTokens) {
      // Return existing tokens immediately
      return { hasTokens: true, tokens: existingTokens };
    }

    this.oauth2Client = new google.auth.OAuth2(
      this.credentials.clientId,
      this.credentials.clientSecret,
      this.credentials.redirectUri
    );

    console.log('\n===========================================');
    console.log('IMPORTANT: Add this redirect URI to Google Cloud Console:');
    console.log(this.credentials.redirectUri);
    console.log('===========================================\n');

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.metadata.readonly'
      ],
      prompt: 'consent'
    });

    // Start local server
    await this.startServer();

    return { hasTokens: false, authUrl };
  }

  startServer() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, this.host, () => {
        console.log(`Auth server listening on ${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  stopServer() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  waitForAuth() {
    this.authPromise = new Promise((resolve) => {
      this.authResolve = resolve;
    });
    return this.authPromise;
  }

  async saveTokens(tokens) {
    const tokenPath = path.join(process.cwd(), 'token.json');
    await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2));
  }

  async loadTokens() {
    try {
      const tokenPath = path.join(process.cwd(), 'token.json');
      const data = await fs.readFile(tokenPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  async removeTokens() {
    try {
      const tokenPath = path.join(process.cwd(), 'token.json');
      await fs.unlink(tokenPath);
      console.log('Removed invalid token file');
    } catch (error) {
      // Token file doesn't exist, ignore
    }
  }
}

module.exports = AuthServer;
