"use client";

/**
 * SeekerGuard
 * 
 * A protective wrapper component that restricts access to child content
 * based on ownership of the Solana Seeker Genesis Token.
 * 
 * - Checks user's wallet for the specific mint address
 * - Displays a high-fidelity "Access Denied" UI if token is missing
 * - Includes a dev-only bypass for testing on non-Seeker devices
 */

import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';

// Seeker Chapter 2 Preorder Token Mint Address
const SEEKER_MINT_ADDRESS = '2DMMamkkxQ6zDMBtkFp8KH7FoWzBMBA1CGTYwom4QH6Z';

export default function SeekerGuard({ children }) {
    const { connection } = useConnection();
    const { publicKey, connected, disconnect } = useWallet();
    const { setVisible } = useWalletModal();
    const [hasSeeker, setHasSeeker] = useState(false);
    const [checking, setChecking] = useState(false);

    useEffect(() => {
        const checkOwnership = async () => {
            if (!publicKey || !connected) {
                setHasSeeker(false);
                return;
            }

            setChecking(true);
            try {
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
                    programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
                });

                const seekerToken = tokenAccounts.value.find((account) => {
                    const info = account.account.data.parsed.info;
                    return info.mint === SEEKER_MINT_ADDRESS && info.tokenAmount.uiAmount > 0;
                });

                setHasSeeker(!!seekerToken);
            } catch (error) {
                console.error("Error checking Seeker ownership:", error);
                setHasSeeker(false);
            } finally {
                setChecking(false);
            }
        };

        checkOwnership();
    }, [publicKey, connected, connection]);

    const handleConnect = () => {
        setVisible(true);
    };

    if (!connected) {
        return (
            <div style={{ position: 'relative', overflow: 'hidden', height: '85vh', minHeight: '500px' }}>
                <div style={{
                    WebkitMaskImage: 'linear-gradient(to bottom, black 24%, transparent 50%)',
                    maskImage: 'linear-gradient(to bottom, black 24%, transparent 50%)',
                    filter: 'blur(5px)',
                    opacity: 0.45,
                    pointerEvents: 'none',
                    userSelect: 'none',
                    height: '100%'
                }}>
                    {children}
                </div>
                <div style={{
                    position: 'absolute',
                    top: '42%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 50,
                    width: '85%',
                    maxWidth: '300px'
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.25) 0%, rgba(168, 85, 247, 0.15) 100%)',
                        border: '1px solid rgba(168, 85, 247, 0.4)',
                        borderRadius: '20px',
                        padding: '24px 20px',
                        backdropFilter: 'blur(24px) saturate(180%)',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
                        textAlign: 'center'
                    }}>
                        <div style={{
                            width: '56px',
                            height: '56px',
                            margin: '0 auto 20px',
                            background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.3) 0%, rgba(147, 51, 234, 0.2) 100%)',
                            borderRadius: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(168, 85, 247, 0.2)'
                        }}>
                            <svg style={{ width: '28px', height: '28px', color: '#c084fc' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'white', marginBottom: '8px', letterSpacing: '-0.02em' }}>
                            Genesis Token Required
                        </h3>
                        <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '20px', lineHeight: '1.4' }}>
                            Connect your wallet to unlock premium intelligence
                        </p>
                        <button
                            onClick={handleConnect}
                            style={{
                                width: '100%',
                                background: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
                                color: 'white',
                                padding: '14px',
                                borderRadius: '12px',
                                fontSize: '15px',
                                fontWeight: 600,
                                border: 'none',
                                cursor: 'pointer',
                                boxShadow: '0 4px 12px rgba(168, 85, 247, 0.3)',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                            Connect Wallet
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (checking) {
        return (
            <div style={{ position: 'relative' }}>
                {children}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 50,
                    background: 'rgba(24, 24, 27, 0.95)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    borderRadius: '12px',
                    padding: '16px 24px',
                    backdropFilter: 'blur(12px)'
                }}>
                    <div style={{ color: '#10b981', fontSize: '14px' }}>Verifying...</div>
                </div>
            </div>
        );
    }

    if (!hasSeeker) {
        return (
            <div style={{ position: 'relative', overflow: 'hidden', height: '85vh', minHeight: '500px' }}>
                <div style={{
                    WebkitMaskImage: 'linear-gradient(to bottom, black 24%, transparent 50%)',
                    maskImage: 'linear-gradient(to bottom, black 24%, transparent 50%)',
                    filter: 'blur(5px)',
                    opacity: 0.45,
                    pointerEvents: 'none',
                    userSelect: 'none',
                    height: '100%'
                }}>
                    {children}
                </div>
                <div style={{
                    position: 'absolute',
                    top: '42%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 50,
                    width: '85%',
                    maxWidth: '300px'
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.25) 0%, rgba(168, 85, 247, 0.15) 100%)',
                        border: '1px solid rgba(168, 85, 247, 0.4)',
                        borderRadius: '20px',
                        padding: '24px 20px',
                        backdropFilter: 'blur(24px) saturate(180%)',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
                        textAlign: 'center'
                    }}>
                        <div style={{
                            width: '56px',
                            height: '56px',
                            margin: '0 auto 20px',
                            background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.3) 0%, rgba(147, 51, 234, 0.2) 100%)',
                            borderRadius: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(168, 85, 247, 0.2)'
                        }}>
                            <svg style={{ width: '28px', height: '28px', color: '#c084fc' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'white', marginBottom: '8px', letterSpacing: '-0.02em' }}>
                            No Token Found
                        </h3>
                        <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '20px', fontFamily: 'monospace' }}>
                            {publicKey?.toBase58().substring(0, 4)}...{publicKey?.toBase58().slice(-4)}
                        </p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {/* Dev bypass allows testing the UI without holding the actual token on mainnet */
                                process.env.NODE_ENV === 'development' && (
                                    <button
                                        onClick={() => setHasSeeker(true)}
                                        style={{
                                            flex: 1,
                                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                            color: 'white',
                                            padding: '12px',
                                            borderRadius: '10px',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            border: 'none',
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                                        }}
                                    >
                                        Bypass
                                    </button>
                                )}
                            <button
                                onClick={disconnect}
                                style={{
                                    flex: 1,
                                    background: 'rgba(63, 63, 70, 0.6)',
                                    color: 'white',
                                    padding: '12px',
                                    borderRadius: '10px',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    cursor: 'pointer',
                                    backdropFilter: 'blur(10px)'
                                }}
                            >
                                Disconnect
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return children;
}
