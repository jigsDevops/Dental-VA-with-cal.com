#!/usr/bin/env node

import fs from 'fs';
import { execSync } from 'child_process';
import readline from 'readline';
import path from 'path';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Check if .env file exists
const envFilePath = './.env';
const envTemplateContent = `# API Keys and Configuration
ULTRAVOX_API_KEY=YOUR_ULTRAVOX_API_KEY_HERE
TWILIO_ACCOUNT_SID=YOUR_TWILIO_ACCOUNT_SID_HERE
TWILIO_AUTH_TOKEN=YOUR_TWILIO_AUTH_TOKEN_HERE
TWILIO_PHONE_NUMBER=YOUR_TWILIO_PHONE_NUMBER_HERE

# Cal.com Integration
CALCOM_API_KEY=YOUR_CALCOM_API_KEY_HERE
CALCOM_EVENT_TYPE_ID=YOUR_CALCOM_EVENT_TYPE_ID_HERE

# Gmail API Integration
GMAIL_CLIENT_ID=YOUR_GMAIL_CLIENT_ID_HERE
GMAIL_CLIENT_SECRET=YOUR_GMAIL_CLIENT_SECRET_HERE
GMAIL_REFRESH_TOKEN=YOUR_GMAIL_REFRESH_TOKEN_HERE

# N8N Integration
N8N_WEBHOOK_URL=YOUR_N8N_WEBHOOK_URL_HERE

# Reminder Configuration
REMINDER_HOURS_BEFORE=24
OUTBOUND_CALL_TIME=09:00`;

// Create log directory if it doesn't exist
const logDir = './logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
  console.log('✅ Created logs directory');
}

function checkDependencies() {
  console.log('\n📦 Checking dependencies...');
  try {
    execSync('npm --version', { stdio: 'ignore' });
    console.log('✅ npm is installed');
  } catch (error) {
    console.error('❌ npm is not installed. Please install Node.js and npm first.');
    process.exit(1);
  }
}

function installDependencies() {
  console.log('\n📦 Installing dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('✅ Dependencies installed successfully');
  } catch (error) {
    console.error('❌ Failed to install dependencies:', error.message);
    process.exit(1);
  }
}

function setupEnvFile() {
  if (fs.existsSync(envFilePath)) {
    console.log('\n📄 .env file already exists');
    rl.question('Do you want to overwrite it? (y/n): ', (answer) => {
      if (answer.toLowerCase() === 'y') {
        createEnvFile();
      } else {
        console.log('✅ Keeping existing .env file');
        promptForNgrok();
      }
    });
  } else {
    createEnvFile();
  }
}

function createEnvFile() {
  fs.writeFileSync(envFilePath, envTemplateContent);
  console.log('✅ Created .env file template');
  console.log('⚠️ Please edit the .env file with your actual API keys and configuration');
  promptForNgrok();
}

function promptForNgrok() {
  rl.question('\nDo you want to install ngrok for exposing your local server? (y/n): ', (answer) => {
    if (answer.toLowerCase() === 'y') {
      installNgrok();
    } else {
      console.log('\n⚠️ Remember to expose your local server to receive Twilio webhooks');
      finishSetup();
    }
  });
}

function installNgrok() {
  console.log('\n📦 Installing ngrok...');
  try {
    execSync('npm install -g ngrok', { stdio: 'inherit' });
    console.log('✅ ngrok installed successfully');
    console.log('\nTo start ngrok, run: ngrok http 3000');
    finishSetup();
  } catch (error) {
    console.error('❌ Failed to install ngrok:', error.message);
    console.log('\n⚠️ Please install ngrok manually: npm install -g ngrok');
    finishSetup();
  }
}

function finishSetup() {
  console.log('\n🎉 Setup completed!');
  console.log('\nNext steps:');
  console.log('1. Edit the .env file with your API keys and configuration');
  console.log('2. Start the server: npm start');
  console.log('3. Expose your local server with ngrok: ngrok http 3000');
  console.log('4. Configure your Twilio webhook URL to point to your ngrok URL + /incoming');
  console.log('\nThank you for setting up the Healthcare Appointment Management System!\n');
  rl.close();
}

// Main execution
console.log('🏥 Healthcare Appointment Management System Setup');
console.log('=================================================');

checkDependencies();
installDependencies();
setupEnvFile();
