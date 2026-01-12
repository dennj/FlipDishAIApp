import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

interface OptionItem {
    menuItemOptionSetItemId: number;
    name: string;
    price: number;
}

interface OptionSet {
    menuItemOptionSetId: number;
    optionsRules: string;
    options: OptionItem[];
    afterChoosingThis?: OptionSet;
}

interface MenuItem {
    menuItemId: number;
    name: string;
    description?: string;
    price: number;
    imageUrl?: string;
    menuSectionName?: string;
    menuItemOptionSets?: any[]; // Legacy
    menuItemOptions?: OptionSet; // Current
}

interface MenuCarouselProps {
    items: MenuItem[];
}

function MenuItemCard({ item }: { item: MenuItem }) {
    const hasOptions = item.menuItemOptions != null;
    const [isCustomizing, setIsCustomizing] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [isAdded, setIsAdded] = useState(false);

    // Options State
    const [selectedOptions, setSelectedOptions] = useState<Record<number, number[]>>({});
    const [currentStep, setCurrentStep] = useState(0);

    // Build flattened option sets list for stepper navigation
    const optionSets: OptionSet[] = [];
    if (isCustomizing) {
        let current = item.menuItemOptions;
        while (current) {
            optionSets.push(current);
            current = current.afterChoosingThis;
        }
    }

    const currentSet = optionSets[currentStep];

    const resetCustomization = () => {
        setIsCustomizing(false);
        setIsAdded(false);
        setIsAdding(false);
        setSelectedOptions({});
        setCurrentStep(0);
    };

    const submitOrder = async (finalOptions: Record<number, number[]>) => {
        setIsAdding(true);
        const allSelectedIds: number[] = [];
        Object.values(finalOptions).forEach(ids => allSelectedIds.push(...ids));

        if (typeof (window as any).openai?.callTool === 'function') {
            try {
                await (window as any).openai.callTool('add_to_basket', {
                    menuItemId: item.menuItemId,
                    quantity: 1,
                    menuItemOptionSetItems: allSelectedIds,
                });

                // Show success state - FOREVER (until reload)
                setIsAdding(false);
                setIsAdded(true);

                // NO RESET - Card stays in success state
            } catch (error) {
                console.error('Failed to add item:', error);
                setIsAdding(false);
            }
        } else {
            // Fallback for dev/testing without openai
            console.log('Mock adding to basket:', allSelectedIds);
            setTimeout(() => {
                setIsAdding(false);
                setIsAdded(true);
            }, 1000);
        }
    };

    const handleOptionToggle = (optionId: number) => {
        if (!currentSet || isAdding || isAdded) return;

        const setId = currentSet.menuItemOptionSetId;
        const current = selectedOptions[setId] || [];

        const lowerRules = currentSet.optionsRules.toLowerCase();
        // Match "select exactly 1", "select up to 1", "choose 1", "choose exactly one", etc.
        const isSingleSelect = /select\s+(exactly|up\s+to)?\s*1\b|choose\s+(exactly|up\s+to)?\s*(one|1)\b/.test(lowerRules);

        if (isSingleSelect) {
            // Update selection and auto-advance
            const newSelection = { ...selectedOptions, [setId]: [optionId] };
            setSelectedOptions(newSelection);

            const isLastStep = currentStep === optionSets.length - 1;
            if (isLastStep) {
                submitOrder(newSelection);
            } else {
                setTimeout(() => setCurrentStep(currentStep + 1), 150);
            }
        } else {
            const isSelected = current.includes(optionId);
            setSelectedOptions({
                ...selectedOptions,
                [setId]: isSelected
                    ? current.filter(id => id !== optionId)
                    : [...current, optionId]
            });
        }
    };

    const handleNext = () => {
        const isLastStep = currentStep === optionSets.length - 1;
        if (isLastStep) {
            submitOrder(selectedOptions);
        } else {
            setCurrentStep(currentStep + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        } else {
            resetCustomization();
        }
    };

    // Success State View - Minimal (Icon Only)
    // PERMANENT STATE - No way to go back from here
    if (isAdded) {
        return (
            <div className="menu-card success-mode">
                <div className="success-content">
                    <div className="success-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <p className="success-text">Added to Basket</p>
                </div>
            </div>
        );
    }

    // Loading State Overlay - Minimal (Spinner Only)
    if (isAdding) {
        return (
            <div className="menu-card loading-mode">
                <div className="loading-content">
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    // If Customizing, render the options form
    if (isCustomizing && currentSet) {
        const selectedForCurrentSet = selectedOptions[currentSet.menuItemOptionSetId] || [];
        const lowerRules = currentSet.optionsRules.toLowerCase();
        // Match "select exactly 1", "select up to 1", "choose 1", "choose exactly one", etc.
        const isSingleSelect = /select\s+(exactly|up\s+to)?\s*1\b|choose\s+(exactly|up\s+to)?\s*(one|1)\b/.test(lowerRules);
        const isRequired = lowerRules.includes('required');
        const hasSelection = selectedForCurrentSet.length > 0;

        // Auto-advance logic:
        // - If required single-select: Hide "Next" because selection triggers advance
        // - If optional single-select: Hide "Next" only if something IS selected (triggers advance). 
        //   If nothing selected, show "Skip" button.
        const hideNextButton = isSingleSelect && (isRequired || hasSelection);

        // Button text logic
        let buttonText = 'Next';
        if (currentStep === optionSets.length - 1) buttonText = 'Add to Basket';
        if (!hasSelection && !isRequired) buttonText = 'Skip';

        return (
            <div className="menu-card options-mode">
                <div className="options-header">
                    <button className="back-button" onClick={handleBack} disabled={isAdding}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M19 12H5M12 19l-7-7 7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                    <div className="header-title-group">
                        <h4>{currentSet.optionsRules.split('(')[1]?.split(')')[0] || 'Options'}</h4>
                        <span className="step-dots">
                            {optionSets.map((_, idx) => (
                                <span key={idx} className={`dot ${idx === currentStep ? 'active' : ''}`} />
                            ))}
                        </span>
                    </div>
                </div>

                <div className="options-content">
                    <div className="options-list-scroll">
                        {currentSet.options.map(option => {
                            const isSelected = selectedForCurrentSet.includes(option.menuItemOptionSetItemId);
                            return (
                                <div
                                    key={option.menuItemOptionSetItemId}
                                    className={`option-row ${isSelected ? 'selected' : ''}`}
                                    onClick={() => handleOptionToggle(option.menuItemOptionSetItemId)}
                                >
                                    <div className="option-details">
                                        <span className="option-name">{option.name}</span>
                                        {option.price > 0 && (
                                            <span className="option-price">+€{option.price.toFixed(2)}</span>
                                        )}
                                    </div>
                                    {isSelected && (
                                        <div className="selection-check">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <path d="M20 6L9 17l-5-5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {!hideNextButton && (
                    <div className="menu-card-footer">
                        <button
                            className={`menu-card-button ${hasSelection ? 'primary' : 'secondary'}`}
                            onClick={handleNext}
                            disabled={(isRequired && !hasSelection) || isAdding}
                        >
                            {buttonText}
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // Default View
    return (
        <div className="menu-card">
            <div className="menu-card-image">
                {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} />
                ) : (
                    <div className="menu-card-image-placeholder">
                        <span>{item.name.charAt(0).toUpperCase()}</span>
                    </div>
                )}
            </div>

            <div className="menu-card-content">
                <h3 className="menu-card-title" title={item.name}>
                    {item.name}
                </h3>

                <div className="menu-card-meta">
                    <span className="menu-card-price">€{item.price.toFixed(2)}</span>
                    {item.menuSectionName && (
                        <span className="menu-card-section">{item.menuSectionName}</span>
                    )}
                </div>

                {item.description && (
                    <p className="menu-card-description">{item.description}</p>
                )}
            </div>

            <div className="menu-card-footer">
                <button
                    className="menu-card-button"
                    onClick={() => hasOptions ? setIsCustomizing(true) : submitOrder({})}
                >
                    <svg className="button-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    {hasOptions ? 'Customize' : 'Add'}
                </button>
            </div>
        </div>
    );
}

function MenuCarousel({ items }: MenuCarouselProps) {
    if (!items || items.length === 0) {
        return (
            <div className="empty-state">
                <p>No menu items found</p>
            </div>
        );
    }

    return (
        <div className="menu-carousel-container">
            <div className="menu-carousel">
                {items.map((item) => (
                    <div key={item.menuItemId} className="menu-carousel-item">
                        <MenuItemCard item={item} />
                    </div>
                ))}
            </div>
        </div>
    );
}

import { useOpenAiGlobal } from '../use-openai-global';

function App() {
    // Get data reactively from global state
    const toolOutput = useOpenAiGlobal('toolOutput');
    const toolResponseMetadata = useOpenAiGlobal('toolResponseMetadata');

    // Determine items from either source
    const items = (toolOutput as any)?.items
        || (toolResponseMetadata as any)?.structuredContent?.items
        || [];

    // Determine loading state
    // If we have no items and no tool output, we assume we are waiting for the tool
    const isLoading = !toolOutput && !toolResponseMetadata;

    if (isLoading) {
        return (
            <div className="menu-carousel-container">
                <div className="menu-card loading-mode" style={{ height: '380px', flex: '0 0 280px', margin: '0 auto', border: 'none', boxShadow: 'none' }}>
                    <div className="loading-content">
                        <div className="spinner"></div>
                        <p style={{ marginTop: '12px', color: '#6b7280', fontSize: '14px' }}>Searching menu...</p>
                    </div>
                </div>
            </div>
        );
    }

    return <MenuCarousel items={items} />;
}

// Initialize widget
const rootElement = document.getElementById('menu-carousel-root');
if (!rootElement) {
    throw new Error('Menu carousel root element not found');
}

createRoot(rootElement).render(
    <StrictMode>
        <App />
    </StrictMode>
);
