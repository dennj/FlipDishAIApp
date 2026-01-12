import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type LoginStep = 'phone' | 'otp' | 'success';

function LoginWidget() {
    const [step, setStep] = useState<LoginStep>('phone');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSendOtp = async () => {
        if (!phoneNumber) return;
        setIsLoading(true);
        setError('');

        try {
            if (typeof (window as any).openai?.callTool === 'function') {
                await (window as any).openai.callTool('send_otp', {
                    phoneNumber: phoneNumber,
                });
                setStep('otp');
            } else {
                // Mock for dev
                console.log('Mock sending OTP to', phoneNumber);
                setTimeout(() => setStep('otp'), 1000);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to send code');
        } finally {
            setIsLoading(false);
        }
    };



    if (step === 'success') {
        return (
            <div className="login-card">
                <div className="success-view">
                    <div className="success-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <div className="login-header">
                        <h2 className="success-title">Welcome Back!</h2>
                        <p className="success-message">You have successfully logged in.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="login-card">
            <div className="login-header">
                <h2 className="login-title">Log in</h2>
                <p className="login-subtitle">
                    {step === 'phone'
                        ? 'Enter your mobile number to get started'
                        : `Enter the code sent to ${phoneNumber}`}
                </p>
            </div>

            <div className="login-form">
                {step === 'phone' ? (
                    <div className="input-group">
                        <label className="label">Mobile Number</label>
                        <input
                            className="input"
                            type="tel"
                            placeholder="+1 234 567 8900"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            disabled={isLoading}
                        />
                    </div>
                ) : (
                    <div className="input-group">
                        <label className="label">Verification Code</label>
                        <input
                            className="input otp-input"
                            type="text"
                            inputMode="numeric"
                            maxLength={4}
                            placeholder="1234"
                            value={otpCode}
                            onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                                setOtpCode(value);
                                // Auto-submit when 4 digits entered
                                if (value.length === 4) {
                                    setOtpCode(value);
                                    // Trigger verification after state update
                                    setTimeout(() => {
                                        if (typeof (window as any).openai?.callTool === 'function') {
                                            setIsLoading(true);
                                            (window as any).openai.callTool('verify_otp', {
                                                phoneNumber: phoneNumber,
                                                code: value
                                            }).then(async () => {
                                                // Auto-submit the order after successful logic
                                                try {
                                                    const orderResult = await (window as any).openai.callTool('submit_order', {});
                                                    if (orderResult?.structuredContent?.success) {
                                                        setStep('success'); // Keep success but maybe update text?
                                                        // Better: Show order confirmation directly here
                                                    } else {
                                                        // If it failed again (e.g. payment issue), error will show
                                                        setError('Login successful, but order failed. Please try again.');
                                                        setStep('success');
                                                    }
                                                } catch (e) {
                                                    setStep('success');
                                                }
                                            }).catch((err: any) => {
                                                setError(err.message || 'Invalid code');
                                            }).finally(() => {
                                                setIsLoading(false);
                                            });
                                        } else {
                                            console.log('Mock verifying OTP', value);
                                            setTimeout(() => setStep('success'), 1000);
                                        }
                                    }, 100);
                                }
                            }}
                            disabled={isLoading}
                            autoFocus
                        />
                    </div>
                )}

                {error && <div className="error-message">{error}</div>}

                {step === 'phone' && (
                    <button
                        className="primary-button"
                        onClick={handleSendOtp}
                        disabled={isLoading || !phoneNumber}
                    >
                        {isLoading ? <div className="spinner" /> : 'Send Code'}
                    </button>
                )}

                {step === 'otp' && isLoading && (
                    <div className="verifying-message">
                        <div className="spinner" /> Verifying...
                    </div>
                )}

                {step === 'otp' && (
                    <button
                        className="secondary-button"
                        onClick={() => { setStep('phone'); setError(''); }}
                        disabled={isLoading}
                    >
                        Change number
                    </button>
                )}
            </div>
        </div>
    );
}

// Initialize widget
const rootElement = document.getElementById('login-root');
if (rootElement) {
    createRoot(rootElement).render(
        <StrictMode>
            <LoginWidget />
        </StrictMode>
    );
}
