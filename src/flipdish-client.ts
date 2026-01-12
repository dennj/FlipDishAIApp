/**
 * FlipDish Server API Client
 * Communicates with the FlipDish Server (Vercel) API
 */

const FLIPDISH_SERVER_URL = process.env.FLIPDISH_SERVER_URL || 'https://flip-dish-wrapper.vercel.app';

export interface FlipDishConfig {
    appId: string;
    storeId: number;
    bearerToken?: string;
    serverUrl?: string;
}

let config: FlipDishConfig | null = null;

export function setConfig(newConfig: FlipDishConfig) {
    config = newConfig;
}

/**
 * Call the FlipDish Server API
 */
async function callApi(action: string, args: any[] = [], auth?: string): Promise<any> {
    const url = `${config?.serverUrl || FLIPDISH_SERVER_URL}/api`;

    const payload: any = {
        action,
        args,
    };

    console.log('📤 API Request:', action);
    console.log('   Config:', config);
    console.log('   Payload:', JSON.stringify(payload, null, 2));

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    // Use provided auth token or fall back to bearer token from config
    const authToken = auth || config?.bearerToken;
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`API Error (${response.status}): ${error}`);
    }

    return response.json();
}

/**
 * Create or restore a session
 */
export async function createSession(token?: string): Promise<{
    chatId: string;
    basket?: any;
}> {
    // Args: [appId, storeId, token?, bearerToken]
    return callApi('createSession', [
        config?.appId,
        config?.storeId,
        token || null,
        config?.bearerToken
    ]);
}

/**
 * Search menu items
 */
export async function searchMenu(chatId: string, query: string, token?: string): Promise<any[]> {
    // Args: [chatId, query]
    const result = await callApi('searchMenu', [chatId, query], token);
    console.log('📦 Search result:', JSON.stringify(result, null, 2));

    // API returns array directly, not wrapped in {items: [...]}
    return Array.isArray(result) ? result : (result.items || []);
}

/**
 * Get basket
 */
export async function getBasket(chatId: string, token?: string): Promise<any> {
    // Args: [chatId]
    return callApi('getBasket', [chatId], token);
}

/**
 * Update basket (add/remove items) - GUEST sessions only
 */
export async function updateBasket(chatId: string, updates: any, token?: string): Promise<any> {
    // Args: [chatId, payload]
    return callApi('updateBasket', [chatId, updates], token);
}

/**
 * Update basket items - AUTHENTICATED sessions
 * Calls /tools/basket/update-items endpoint directly
 */
export async function updateBasketItems(chatId: string, updates: any, token: string): Promise<any> {
    const url = `${config?.serverUrl || FLIPDISH_SERVER_URL}/tools/basket/update-items`;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    };

    const payload = {
        chatId,
        ...updates,
    };

    console.log('📤 API Request: updateBasketItems (authenticated)');
    console.log('   URL:', url);
    console.log('   Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`API Error (${response.status}): ${error}`);
    }

    return response.json();
}

/**
 * Clear basket
 */
export async function clearBasket(chatId: string, token?: string): Promise<any> {
    // Args: [chatId, token?]
    return callApi('clearBasket', [chatId, token || null]);
}

/**
 * Submit order
 */
export async function submitOrder(chatId: string, token: string, paymentAccountId?: number): Promise<{
    success: boolean;
    orderId?: string;
    leadTimePrompt?: string;
    error?: string;
}> {
    // Args: [chatId, token, paymentAccountId, appId, bearerToken]
    return callApi('submitOrder', [
        chatId,
        token,
        paymentAccountId || null,
        config?.appId,
        config?.bearerToken
    ]);
}

/**
 * Send OTP code
 */
export async function sendOTP(phoneNumber: string): Promise<{
    success: boolean;
    error?: string;
}> {
    // Args: [phoneNumber]
    return callApi('sendOTP', [phoneNumber]);
}

/**
 * Verify OTP code
 */
export async function verifyOTP(phoneNumber: string, code: string, chatId?: string): Promise<{
    success: boolean;
    token?: string;
    error?: string;
}> {
    // Args: [phoneNumber, code, chatId, appId]
    return callApi('verifyOTP', [phoneNumber, code, chatId || null, config?.appId]);
}

/**
 * Get restaurant status
 */
export async function getRestaurantStatus(): Promise<any> {
    // Args: [storeId]
    return callApi('getRestaurantStatus', [config?.storeId]);
}

/**
 * Get payment accounts
 */
export async function getPaymentAccounts(token: string): Promise<{
    accounts: any[];
}> {
    // Args: [token, appId]
    return callApi('getPaymentAccounts', [token, config?.appId]);
}
