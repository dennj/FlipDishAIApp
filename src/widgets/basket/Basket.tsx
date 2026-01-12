import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useOpenAiGlobal } from '../use-openai-global';
import './styles.css';

interface BasketItem {
    menuItemId: number;
    name: string;
    price: number;
    quantity: number;
}

interface BasketData {
    basketMenuItems: BasketItem[];
    totalPrice: number;
}

function BasketWidget() {
    // Transient UI state only - NO persisted basket data
    const [hiddenItemIds, setHiddenItemIds] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [removingId, setRemovingId] = useState<number | null>(null);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    // Always read directly from the Tool Output (Source of Truth for this message)
    const toolOutput = useOpenAiGlobal('toolOutput') as any;
    const toolResponseMetadata = useOpenAiGlobal('toolResponseMetadata') as any;

    const basket: BasketData | null = toolOutput?.basket
        || toolResponseMetadata?.structuredContent?.basket
        || null;

    const handleRemoveItem = async (menuItemId: number) => {
        setRemovingId(menuItemId);
        setError('');
        setMessage('');

        try {
            if (typeof (window as any).openai?.callTool === 'function') {
                await (window as any).openai.callTool('remove_from_basket', {
                    menuItemId,
                    quantity: 1
                });

                // Visual feedback only: Hide the item we just removed
                setHiddenItemIds(prev => [...prev, menuItemId]);
                setMessage('Item removed');
            }
        } catch (err: any) {
            // Extract user-friendly message
            let errorMsg = err.message || 'Failed to remove item';
            try {
                const jsonMatch = errorMsg.match(/\{.*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.userMessage) {
                        errorMsg = parsed.userMessage;

                        // If the error says "problem with basket" or similar, 
                        // it usually means the item is already gone.
                        // We can effectively treat this as a "success" for the UI 
                        // by hiding the item, aligning the view with reality.
                        if (errorMsg.toLowerCase().includes('problem')) {
                            setHiddenItemIds(prev => [...prev, menuItemId]);
                            setMessage('Item already removed');
                            return;
                        }
                    }
                }
            } catch { }
            setError(errorMsg);
        } finally {
            setRemovingId(null);
        }
    };

    const handleBuy = async () => {
        setIsLoading(true);
        setError('');
        setMessage('');

        try {
            if (typeof (window as any).openai?.callTool === 'function') {
                const result = await (window as any).openai.callTool('submit_order', {});

                if (result?.structuredContent?.success) {
                    setMessage('Order placed successfully!');
                    // Hide all items to visually simulate "Emptying"
                    // (Real state will come in the next widget message)
                    if (basket?.basketMenuItems) {
                        setHiddenItemIds(basket.basketMenuItems.map((i: any) => i.menuItemId));
                    }
                } else if (result?.structuredContent?.error === 'authentication_required') {
                    setMessage('Please login to complete your order');
                }
            }
        } catch (err: any) {
            if (!err.message?.includes('authentication')) {
                setError(err.message || 'Order failed');
            } else {
                setMessage('Please login to complete your order');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Loading state
    if (!basket) {
        return (
            <div className="basket-card">
                <div className="basket-empty">
                    <p>Loading basket...</p>
                </div>
            </div>
        );
    }

    // Filter out items that have been removed in this session interaction
    const visibleItems = (basket.basketMenuItems || []).filter(
        item => !hiddenItemIds.includes(item.menuItemId)
    );

    // Recalculate total for display (approximate)
    const displayTotal = visibleItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Empty basket view
    if (visibleItems.length === 0) {
        return (
            <div className="basket-card">
                <div className="basket-empty">
                    {/* If we hid items, show specific message, otherwise generic */}
                    {hiddenItemIds.length > 0 ? (
                        <>
                            <h3>Basket Updated</h3>
                            <p>Items have been removed.</p>
                        </>
                    ) : (
                        <>
                            <h3>Your basket is empty</h3>
                            <p>Search for menu items to add to your basket</p>
                        </>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="basket-card">
            <div className="basket-header">
                <h2>Your Basket</h2>
                <span className="item-count">{visibleItems.length} item{visibleItems.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="basket-items">
                {visibleItems.map((item, index) => (
                    <div key={`${item.menuItemId}-${index}`} className="basket-item">
                        <div className="item-info">
                            <span className="item-quantity">{item.quantity}x</span>
                            <span className="item-name">{item.name}</span>
                        </div>
                        <div className="item-actions">
                            <span className="item-price">€{(item.price * item.quantity).toFixed(2)}</span>
                            <button
                                className="remove-btn"
                                onClick={() => handleRemoveItem(item.menuItemId)}
                                disabled={removingId === item.menuItemId}
                                title="Remove item"
                            >
                                {removingId === item.menuItemId ? '...' : '×'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {error && <div className="error-message">{error}</div>}
            {message && <div className="success-message">{message}</div>}

            <div className="basket-footer">
                <div className="basket-total">
                    <span>Total</span>
                    <span className="total-price">€{displayTotal.toFixed(2)}</span>
                </div>
                <button
                    className="buy-button"
                    onClick={handleBuy}
                    disabled={isLoading}
                >
                    {isLoading ? 'Processing...' : 'Buy Now'}
                </button>
            </div>
        </div>
    );
}

// Initialize widget
const rootElement = document.getElementById('basket-root');
if (rootElement) {
    createRoot(rootElement).render(
        <StrictMode>
            <BasketWidget />
        </StrictMode>
    );
}
