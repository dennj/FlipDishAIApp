/**
 * State Management for FlipDish ChatGPT App
 * Manages session state across MCP tool calls
 */

import fs from 'node:fs';
import path from 'node:path';

interface SessionState {
    chatId: string | null;
    authToken: string | null;
    phoneNumber: string | null;
    searchResults: any[]; // Store recent search results for validation
}

const CACHE_FILE = path.resolve(process.cwd(), '.session_cache.json');

// Initialize state from cache or default
let state: SessionState = {
    chatId: null,
    authToken: null,
    phoneNumber: null,
    searchResults: [],
};

// Load cache on startup
try {
    if (fs.existsSync(CACHE_FILE)) {
        const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        state = { ...state, ...cached };
        console.log('📦 Loaded session from cache');
    }
} catch (error) {
    console.error('Failed to load session cache:', error);
}

// Helper to save state
function saveState() {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
        console.error('Failed to save session cache:', error);
    }
}

export function getChatId(): string | null {
    return state.chatId;
}

export function setChatId(chatId: string): void {
    state.chatId = chatId;
    saveState();
}

export function getAuthToken(): string | null {
    return state.authToken;
}

export function setAuthToken(token: string, phone: string): void {
    state.authToken = token;
    state.phoneNumber = phone;
    saveState();
}

export function clearAuth(): void {
    state.authToken = null;
    state.phoneNumber = null;
    saveState();
}

export function getPhoneNumber(): string | null {
    return state.phoneNumber;
}

export function getSearchResults(): any[] {
    return state.searchResults;
}

export function setSearchResults(results: any[]): void {
    state.searchResults = results;
    // We don't necessarily need to persist large search results, but it doesn't hurt for validation consistency
    saveState();
}

export function isAuthenticated(): boolean {
    return !!state.authToken;
}
